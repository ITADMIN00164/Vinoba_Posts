/* ============================================================
   Vinoba Posts · Upload page logic
   Depends on globals:  supabase (CDN), XLSX (CDN), CONFIG (config.js)
   ============================================================ */

const C = window.CONFIG;
const sb = supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);

// ---------- small helpers ----------
function $(id) { return document.getElementById(id); }

function showMsg(kind, html) {
  const box = $("msg");
  box.className = "msg show " + kind;
  box.innerHTML = html;
  box.scrollIntoView({ behavior: "smooth", block: "nearest" });
}
function hideMsg() { $("msg").className = "msg"; }

function setBusy(busy, label) {
  const btn = $("uploadBtn");
  btn.disabled = busy;
  btn.innerHTML = busy
    ? '<span class="spinner"></span> ' + (label || "Working...")
    : "Upload to database";
}

// Excel serial / Date / string  ->  ISO timestamp (or null)
function toISO(v) {
  if (v === "" || v === null || v === undefined) return null;
  if (v instanceof Date) return isNaN(v) ? null : v.toISOString();
  if (typeof v === "number") {
    const ms = Math.round((v - 25569) * 86400 * 1000); // Excel epoch 1899-12-30
    const d = new Date(ms);
    return isNaN(d) ? null : d.toISOString();
  }
  const d = new Date(v);
  return isNaN(d) ? null : d.toISOString();
}

function cleanText(v) {
  if (v === "" || v === null || v === undefined) return null;
  return String(v).trim() || null;
}

function truncatedList(arr, max = 40) {
  const shown = arr.slice(0, max).join(", ");
  const extra = arr.length > max ? ` … and ${arr.length - max} more` : "";
  return shown + extra;
}

// ---------- template download ----------
function downloadTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([C.EXPECTED_HEADERS]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  XLSX.writeFile(wb, "MNE_TeacherPosts_TEMPLATE.xlsx");
}

// ---------- parse the uploaded file ----------
async function parseFile(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  // header:1 -> array of arrays, first row is the header row
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });
  return rows;
}

// ---------- header validation ----------
function validateHeaders(found) {
  const expected = C.EXPECTED_HEADERS;
  const foundTrim = found.map(h => String(h == null ? "" : h).trim());

  if (foundTrim.length === expected.length &&
      expected.every((h, i) => h === foundTrim[i])) {
    return { ok: true };
  }

  const missing = expected.filter(h => !foundTrim.includes(h));
  const extra   = foundTrim.filter(h => !expected.includes(h));

  let html = "<b>Column headers do not match the required format.</b>";
  if (missing.length) html += `<br>Missing columns: <code>${missing.join("</code> <code>")}</code>`;
  if (extra.length)   html += `<br>Unexpected columns: <code>${extra.join("</code> <code>")}</code>`;
  if (!missing.length && !extra.length)
    html += "<br>All columns are present but the <b>order</b> is different from the required format.";
  html += `<div class="idlist">Required order:\n${expected.join(", ")}\n\nYour file:\n${foundTrim.join(", ")}</div>`;
  html += `<div class="hint">Tip: click “Download file format” to get a correct template.</div>`;
  return { ok: false, html };
}

// ---------- build DB records ----------
// Returns { records, errors, fileDupes }
function buildRecords(rows, periodStart, periodEnd) {
  const idx = {};                       // header -> column index
  C.EXPECTED_HEADERS.forEach((h, i) => { idx[h] = i; });

  const records = [];
  const badRows = [];                   // rows with missing/invalid PostId
  const seen = new Map();               // post_id -> first row number seen
  const fileDupes = new Set();          // post_ids repeated inside the file

  for (let r = 1; r < rows.length; r++) {   // r=0 is header
    const arr = rows[r];
    // skip completely empty rows
    if (!arr || arr.every(c => c === "" || c === null || c === undefined)) continue;

    const excelRow = r + 1;             // 1-based row number as seen in Excel

    // --- PostId (dedup key) ---
    const rawId = arr[idx["PostId"]];
    const idNum = Number(rawId);
    if (rawId === "" || rawId === null || rawId === undefined || !Number.isFinite(idNum)) {
      badRows.push(excelRow);
      continue;
    }
    const postId = Math.trunc(idNum);

    if (seen.has(postId)) fileDupes.add(postId);
    else seen.set(postId, excelRow);

    // --- Score ---
    const rawScore = arr[idx["Score"]];
    const scoreNum = Number(rawScore);
    const score = (rawScore === "" || rawScore === null || rawScore === undefined || !Number.isFinite(scoreNum))
      ? null : scoreNum;

    // --- date ---
    const rawDate = arr[idx["post_created_date"]];
    const rawDateStr = (rawDate instanceof Date)
      ? rawDate.toISOString()
      : (rawDate === "" || rawDate == null ? null : String(rawDate));

    records.push({
      post_id:               postId,
      post_created_at:       toISO(rawDate),
      post_created_date_raw: rawDateStr,
      community_name:        cleanText(arr[idx["community_name"]]),
      district_name:         cleanText(arr[idx["district_name"]]),
      block_name:            cleanText(arr[idx["block_name"]]),
      circle_name:           cleanText(arr[idx["circle_name"]]),
      school_name:           cleanText(arr[idx["school_name"]]),
      full_name:             cleanText(arr[idx["full_name"]]),
      mobile_number:         cleanText(arr[idx["mobile_number"]]),
      email:                 cleanText(arr[idx["email"]]),
      link_url:              cleanText(arr[idx["LinkURL"]]),
      score:                 score,
      category_name:         cleanText(arr[idx["category_name"]]),
      subject_name:          cleanText(arr[idx["subject_name"]]),
      tags:                  cleanText(arr[idx["tags"]]),
      do_not_consider:       cleanText(arr[idx["DO NOT CONSIDER"]]),
      class_value:           cleanText(arr[idx["CLASS"]]),
      period_start:          periodStart,
      period_end:            periodEnd
    });
  }
  return { records, badRows, fileDupes: [...fileDupes] };
}

// ---------- check which PostIds already exist in DB ----------
async function findExistingPostIds(ids) {
  const existing = [];
  const chunk = 500;
  for (let i = 0; i < ids.length; i += chunk) {
    const slice = ids.slice(i, i + chunk);
    const { data, error } = await sb
      .from(C.TABLE_NAME).select("post_id").in("post_id", slice);
    if (error) throw error;
    data.forEach(row => existing.push(Number(row.post_id)));
  }
  return existing;
}

// ---------- insert in batches ----------
async function insertRecords(records) {
  const chunk = 500;
  let done = 0;
  for (let i = 0; i < records.length; i += chunk) {
    const slice = records.slice(i, i + chunk);
    const { error } = await sb.from(C.TABLE_NAME).insert(slice);
    if (error) throw error;
    done += slice.length;
    setBusy(true, `Inserting ${done} / ${records.length}…`);
  }
  return done;
}

// ---------- main handler ----------
async function handleUpload() {
  hideMsg();

  // config check
  if (!C.SUPABASE_ANON_KEY || C.SUPABASE_ANON_KEY.includes("PASTE_YOUR")) {
    return showMsg("err", "<b>Setup needed:</b> paste your Supabase anon key into <code>js/config.js</code> first.");
  }

  const startDate = $("startDate").value;
  const endDate   = $("endDate").value;
  const file      = $("fileInput").files[0];

  if (!startDate || !endDate)
    return showMsg("err", "Please select both a <b>Start Date</b> and an <b>End Date</b>.");
  if (endDate < startDate)
    return showMsg("err", "End Date cannot be before Start Date.");
  if (!file)
    return showMsg("err", "Please choose a file (.xlsx, .xlsm or .csv).");

  const name = file.name.toLowerCase();
  if (!/\.(xlsx|xlsm|csv)$/.test(name))
    return showMsg("err", "Unsupported file type. Please upload a <b>.xlsx</b>, <b>.xlsm</b> or <b>.csv</b> file.");

  try {
    setBusy(true, "Reading file…");
    const rows = await parseFile(file);

    if (!rows.length)
      { setBusy(false); return showMsg("err", "The file appears to be empty."); }

    // 1) headers
    const hv = validateHeaders(rows[0]);
    if (!hv.ok) { setBusy(false); return showMsg("err", hv.html); }

    // 2) build records + within-file checks
    const { records, badRows, fileDupes } = buildRecords(rows, startDate, endDate);

    if (!records.length && !badRows.length)
      { setBusy(false); return showMsg("err", "No data rows found below the header."); }

    if (badRows.length)
      { setBusy(false);
        return showMsg("err",
          `<b>${badRows.length} row(s) have a missing or invalid PostId</b> and cannot be identified.` +
          `<div class="idlist">Excel row number(s): ${truncatedList(badRows)}</div>` +
          `<div class="hint">Fix these rows, then upload again. Nothing was inserted.</div>`); }

    if (fileDupes.length)
      { setBusy(false);
        return showMsg("err",
          `<b>${fileDupes.length} PostId(s) appear more than once inside your file.</b> ` +
          `Each PostId must be unique. Nothing was inserted.` +
          `<div class="idlist">Duplicated in file: ${truncatedList(fileDupes)}</div>`); }

    // 3) check against database
    setBusy(true, "Checking for existing PostIds…");
    const ids = records.map(r => r.post_id);
    const existing = await findExistingPostIds(ids);

    if (existing.length) {
      setBusy(false);
      return showMsg("err",
        `<b>Upload rejected — this data is already in the database.</b><br>` +
        `${existing.length} of ${ids.length} PostId(s) already exist. ` +
        `Nothing was inserted.` +
        `<div class="idlist">Already exists: ${truncatedList(existing)}</div>` +
        `<div class="hint">These posts were uploaded in an earlier batch. ` +
        `Remove them from your file, or upload a file with only new posts.</div>`);
    }

    // 4) all clear -> insert
    const inserted = await insertRecords(records);
    setBusy(false);
    showMsg("ok",
      `<b>Success ✓</b> Inserted <b>${inserted}</b> new post(s) for the period ` +
      `<code>${startDate}</code> to <code>${endDate}</code>.`);
    $("fileInput").value = "";

  } catch (e) {
    setBusy(false);
    console.error(e);
    showMsg("err", `<b>Something went wrong.</b><br><code>${(e && e.message) || e}</code>` +
      `<div class="hint">Nothing partial is left in a broken state — re-upload the same file to retry. ` +
      `If this keeps happening, check that the SQL schema was run and the anon key is correct.</div>`);
  }
}

// ---------- wire up ----------
document.addEventListener("DOMContentLoaded", () => {
  $("uploadBtn").addEventListener("click", handleUpload);
  $("templateBtn").addEventListener("click", downloadTemplate);
});
