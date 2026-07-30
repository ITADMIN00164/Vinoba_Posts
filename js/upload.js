/* ============================================================
   Vinoba Posts · Upload logic
   Uses shared globals from common.js:  sb, $, C, hasKey
   ============================================================ */
(function () {
  const C = window.C, sb = window.sb, $ = window.$;

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

  function toISO(v) {
    if (v === "" || v === null || v === undefined) return null;
    if (v instanceof Date) return isNaN(v) ? null : v.toISOString();
    if (typeof v === "number") {
      const ms = Math.round((v - 25569) * 86400 * 1000);
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
    return shown + (arr.length > max ? ` … and ${arr.length - max} more` : "");
  }

  function downloadTemplate() {
    const ws = XLSX.utils.aoa_to_sheet([C.EXPECTED_HEADERS]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    XLSX.writeFile(wb, "MNE_TeacherPosts_TEMPLATE.xlsx");
  }

  async function parseFile(file) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array", cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });
  }

  function validateHeaders(found) {
    const expected = C.EXPECTED_HEADERS;
    const foundTrim = found.map(h => String(h == null ? "" : h).trim());
    if (foundTrim.length === expected.length &&
        expected.every((h, i) => h === foundTrim[i])) return { ok: true };

    const missing = expected.filter(h => !foundTrim.includes(h));
    const extra   = foundTrim.filter(h => !expected.includes(h));
    let html = "<b>Column headers do not match the required format.</b>";
    if (missing.length) html += `<br>Missing: <code>${missing.join("</code> <code>")}</code>`;
    if (extra.length)   html += `<br>Unexpected: <code>${extra.join("</code> <code>")}</code>`;
    if (!missing.length && !extra.length)
      html += "<br>All columns are present but the <b>order</b> differs.";
    html += `<div class="idlist">Required order:\n${expected.join(", ")}\n\nYour file:\n${foundTrim.join(", ")}</div>`;
    html += `<div class="hint">Tip: click "Download file format" for a correct template.</div>`;
    return { ok: false, html };
  }

  function buildRecords(rows, periodStart, periodEnd) {
    const idx = {};
    C.EXPECTED_HEADERS.forEach((h, i) => { idx[h] = i; });
    const records = [], badRows = [], seen = new Map(), fileDupes = new Set();

    for (let r = 1; r < rows.length; r++) {
      const arr = rows[r];
      if (!arr || arr.every(c => c === "" || c === null || c === undefined)) continue;
      const excelRow = r + 1;

      const rawId = arr[idx["PostId"]];
      const idNum = Number(rawId);
      if (rawId === "" || rawId == null || !Number.isFinite(idNum)) { badRows.push(excelRow); continue; }
      const postId = Math.trunc(idNum);
      if (seen.has(postId)) fileDupes.add(postId); else seen.set(postId, excelRow);

      const rawScore = arr[idx["Score"]];
      const scoreNum = Number(rawScore);
      const score = (rawScore === "" || rawScore == null || !Number.isFinite(scoreNum)) ? null : scoreNum;

      const rawDate = arr[idx["post_created_date"]];
      const rawDateStr = (rawDate instanceof Date) ? rawDate.toISOString()
        : (rawDate === "" || rawDate == null ? null : String(rawDate));

      records.push({
        post_id: postId,
        post_created_at: toISO(rawDate),
        post_created_date_raw: rawDateStr,
        community_name: cleanText(arr[idx["community_name"]]),
        district_name:  cleanText(arr[idx["district_name"]]),
        block_name:     cleanText(arr[idx["block_name"]]),
        circle_name:    cleanText(arr[idx["circle_name"]]),
        school_name:    cleanText(arr[idx["school_name"]]),
        full_name:      cleanText(arr[idx["full_name"]]),
        mobile_number:  cleanText(arr[idx["mobile_number"]]),
        email:          cleanText(arr[idx["email"]]),
        link_url:       cleanText(arr[idx["LinkURL"]]),
        score:          score,
        category_name:  cleanText(arr[idx["category_name"]]),
        subject_name:   cleanText(arr[idx["subject_name"]]),
        tags:           cleanText(arr[idx["tags"]]),
        do_not_consider: cleanText(arr[idx["DO NOT CONSIDER"]]),
        class_value:    cleanText(arr[idx["CLASS"]]),
        period_start:   periodStart,
        period_end:     periodEnd
      });
    }
    return { records, badRows, fileDupes: [...fileDupes] };
  }

  async function findExistingPostIds(ids) {
    const existing = [];
    for (let i = 0; i < ids.length; i += 500) {
      const slice = ids.slice(i, i + 500);
      const { data, error } = await sb.from(C.TABLE_NAME).select("post_id").in("post_id", slice);
      if (error) throw error;
      data.forEach(row => existing.push(Number(row.post_id)));
    }
    return existing;
  }

  async function insertRecords(records) {
    let done = 0;
    for (let i = 0; i < records.length; i += 500) {
      const slice = records.slice(i, i + 500);
      const { error } = await sb.from(C.TABLE_NAME).insert(slice);
      if (error) throw error;
      done += slice.length;
      setBusy(true, `Inserting ${done} / ${records.length}…`);
    }
    return done;
  }

  async function handleUpload() {
    hideMsg();
    if (!window.hasKey())
      return showMsg("err", "<b>Setup needed:</b> paste your Supabase anon key into <code>js/config.js</code> first.");

    const startDate = $("startDate").value, endDate = $("endDate").value, file = $("fileInput").files[0];
    if (!startDate || !endDate) return showMsg("err", "Please select both a <b>Start Date</b> and an <b>End Date</b>.");
    if (endDate < startDate)    return showMsg("err", "End Date cannot be before Start Date.");
    if (!file)                  return showMsg("err", "Please choose a file (.xlsx, .xlsm or .csv).");
    if (!/\.(xlsx|xlsm|csv)$/.test(file.name.toLowerCase()))
      return showMsg("err", "Unsupported file type. Upload a <b>.xlsx</b>, <b>.xlsm</b> or <b>.csv</b> file.");

    try {
      setBusy(true, "Reading file…");
      const rows = await parseFile(file);
      if (!rows.length) { setBusy(false); return showMsg("err", "The file appears to be empty."); }

      const hv = validateHeaders(rows[0]);
      if (!hv.ok) { setBusy(false); return showMsg("err", hv.html); }

      const { records, badRows, fileDupes } = buildRecords(rows, startDate, endDate);
      if (!records.length && !badRows.length) { setBusy(false); return showMsg("err", "No data rows found below the header."); }

      if (badRows.length) { setBusy(false);
        return showMsg("err", `<b>${badRows.length} row(s) have a missing or invalid PostId.</b>` +
          `<div class="idlist">Excel row(s): ${truncatedList(badRows)}</div>` +
          `<div class="hint">Fix these rows, then upload again. Nothing was inserted.</div>`); }

      if (fileDupes.length) { setBusy(false);
        return showMsg("err", `<b>${fileDupes.length} PostId(s) appear more than once inside your file.</b> Nothing was inserted.` +
          `<div class="idlist">Duplicated in file: ${truncatedList(fileDupes)}</div>`); }

      setBusy(true, "Checking for existing PostIds…");
      const ids = records.map(r => r.post_id);
      const existing = await findExistingPostIds(ids);
      if (existing.length) { setBusy(false);
        return showMsg("err", `<b>Upload rejected — this data is already in the database.</b><br>` +
          `${existing.length} of ${ids.length} PostId(s) already exist. Nothing was inserted.` +
          `<div class="idlist">Already exists: ${truncatedList(existing)}</div>` +
          `<div class="hint">Remove these from your file, or upload only new posts.</div>`); }

      const inserted = await insertRecords(records);
      setBusy(false);
      showMsg("ok", `<b>Success ✓</b> Inserted <b>${inserted}</b> new post(s) for ` +
        `<code>${startDate}</code> to <code>${endDate}</code>.`);
      $("fileInput").value = "";
    } catch (e) {
      setBusy(false); console.error(e);
      showMsg("err", `<b>Something went wrong.</b><br><code>${(e && e.message) || e}</code>` +
        `<div class="hint">Nothing partial is left behind — re-upload the same file to retry.</div>`);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    $("uploadBtn").addEventListener("click", handleUpload);
    $("templateBtn").addEventListener("click", downloadTemplate);
  });
})();
