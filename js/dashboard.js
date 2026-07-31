/* ============================================================
   Vinoba Posts · Dashboard
   Uses shared globals from common.js:  sb, $, C, hasKey
   ============================================================ */
(function () {
  const C = window.C, sb = window.sb, $ = window.$;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // ---------------- reusable multi-select dropdown ----------------
  function MultiSelect(container, { title, labelFn, onApply, wide }) {
    labelFn = labelFn || (v => v);
    let options = [], checked = new Set(), applied = new Set(), enabled = true;

    const root   = document.createElement("div"); root.className = "ms" + (wide ? " ms-wide" : "");
    const btn    = document.createElement("button"); btn.type = "button"; btn.className = "ms-btn";
    const panel  = document.createElement("div"); panel.className = "ms-panel";
    const search = document.createElement("input"); search.className = "ms-search"; search.placeholder = "Search…";
    const allLbl = document.createElement("label"); allLbl.className = "ms-all";
    const allBox = document.createElement("input"); allBox.type = "checkbox";
    allLbl.append(allBox, document.createTextNode(" Select All"));
    const list   = document.createElement("div"); list.className = "ms-list";
    const actions= document.createElement("div"); actions.className = "ms-actions";
    const clr    = document.createElement("button"); clr.type = "button"; clr.className = "ms-mini"; clr.textContent = "Clear";
    const app    = document.createElement("button"); app.type = "button"; app.className = "ms-apply"; app.textContent = "Apply";
    actions.append(clr, app);
    panel.append(search, allLbl, list, actions);
    root.append(btn, panel);
    container.appendChild(root);

    function updateBtn() {
      const n = applied.size; let txt;
      if (n === 0 || n === options.length) txt = "All " + title;
      else if (n <= 2) txt = [...applied].map(labelFn).join(", ");
      else txt = n + " selected";
      btn.innerHTML = `<span class="ms-txt">${esc(txt)}</span><span class="ms-caret">▾</span>`;
      btn.classList.toggle("has-sel", n > 0 && n !== options.length);
    }
    function renderList() {
      const q = search.value.trim().toLowerCase();
      list.innerHTML = "";
      options.filter(o => labelFn(o).toLowerCase().includes(q)).forEach(o => {
        const lbl = document.createElement("label"); lbl.className = "ms-item";
        const cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = checked.has(o);
        cb.addEventListener("change", () => {
          if (cb.checked) checked.add(o); else checked.delete(o);
          allBox.checked = checked.size === options.length && options.length > 0;
        });
        lbl.append(cb, document.createTextNode(" " + labelFn(o)));
        list.appendChild(lbl);
      });
    }
    function open()  { if (enabled) { closeAll(); panel.classList.add("show"); renderList(); search.focus(); } }
    function close() { panel.classList.remove("show"); }

    btn.addEventListener("click", e => { e.stopPropagation(); panel.classList.contains("show") ? close() : open(); });
    panel.addEventListener("click", e => e.stopPropagation());
    search.addEventListener("input", renderList);
    allBox.addEventListener("change", () => { checked = allBox.checked ? new Set(options) : new Set(); renderList(); });
    clr.addEventListener("click", () => { checked = new Set(); allBox.checked = false; renderList(); });
    app.addEventListener("click", () => { applied = new Set(checked); updateBtn(); close(); onApply([...applied]); });

    return {
      el: root,
      setOptions(opts) { options = opts.slice(); checked = new Set(); applied = new Set(); allBox.checked = false; updateBtn(); renderList(); },
      setSelected(vals) {
        const set = new Set(vals.filter(v => options.includes(v)));
        checked = new Set(set); applied = new Set(set);
        allBox.checked = options.length > 0 && checked.size === options.length;
        updateBtn(); renderList();
      },
      getApplied() { return [...applied]; },
      setEnabled(on, placeholder) {
        enabled = on; root.classList.toggle("disabled", !on);
        if (!on) { btn.innerHTML = `<span class="ms-ph">${esc(placeholder || "Unavailable")}</span><span class="ms-caret">▾</span>`; close(); }
        else updateBtn();
      }
    };
  }
  function closeAll() { document.querySelectorAll(".ms-panel.show").forEach(p => p.classList.remove("show")); }
  document.addEventListener("click", closeAll);

  // ---------------- state ----------------
  let community, district, category, subject, month, week;
  let initialised = false, lastRows = [], lastTable = null;
  const filters = { communities: [], districts: [], categories: [], subjects: [], months: [], weeks: ["1"], includeDnc: false };

  const monthLabel = key => { const [y, m] = key.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "short", year: "numeric" }); };
  const weekLabel  = v => v === "TOTAL" ? "All Weeks (Total)" : "Week " + v;
  const fmt = n => (n ?? 0).toLocaleString("en-IN");
  const ord = n => { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
  function weekDates(w, single) {
    if (!w) return "";
    const start = (w - 1) * 7 + 1; let end = w * 7;
    if (single) {
      const [y, m] = single.split("-").map(Number);
      const last = new Date(y, m, 0).getDate();
      end = w === 5 ? last : Math.min(end, last);
      if (start > last) return "";
      const mon = new Date(y, m - 1, 1).toLocaleString("en-US", { month: "short" });
      return `${ord(start)} ${mon} – ${ord(end)} ${mon}`;
    }
    return w === 5 ? `${ord(29)} – end` : `${ord(start)} – ${ord(end)}`;
  }

  async function initDashboard() {
    if (initialised) return;
    initialised = true;
    if (!window.hasKey()) {
      $("dashMsg").className = "msg show err";
      $("dashMsg").innerHTML = "<b>Setup needed:</b> paste your Supabase anon key into <code>js/config.js</code>.";
      return;
    }
    const fb = $("filterBar");
    community = MultiSelect(fb, { title: "Communities", onApply: onCommunityApply });
    district  = MultiSelect(fb, { title: "Districts",   onApply: async v => { filters.districts = v; await refreshSubjects(); loadTable(); } });
    category  = MultiSelect(fb, { title: "Categories",  onApply: async v => { filters.categories = v; await refreshSubjects(); loadTable(); } });
    subject   = MultiSelect(fb, { title: "Subjects", wide: true, onApply: v => { filters.subjects = v; loadTable(); } });
    month     = MultiSelect(fb, { title: "Months", labelFn: monthLabel, onApply: v => { filters.months = v; loadTable(); } });
    week      = MultiSelect(fb, { title: "Weeks", labelFn: weekLabel, onApply: v => { filters.weeks = v; render(); } });
    week.setOptions(["1", "2", "3", "4", "5", "TOTAL"]);
    week.setSelected(["1"]);

    try {
      const { data, error } = await sb.rpc("dashboard_options");
      if (error) throw error;
      community.setOptions(data.communities || []);
      category.setOptions(data.categories || []);
      subject.setOptions(data.subjects || []);
      month.setOptions(data.months || []);
    } catch (e) { return showDashError(e); }

    await loadDistricts();   // all districts across all states by default

    $("dncToggle").addEventListener("change", e => { filters.includeDnc = e.target.checked; loadTable(); });
    $("downloadBtn").addEventListener("click", downloadExcel);
    $("snapshotBtn").addEventListener("click", downloadSnapshot);
    loadTable();
  }
  window.__initDashboard = initDashboard;

  async function loadDistricts() {
    const { data, error } = await sb.rpc("dashboard_districts", { p_communities: filters.communities });
    if (error) throw error;
    district.setOptions((data || []).map(r => r.district));
  }

  async function onCommunityApply(sel) {
    filters.communities = sel; filters.districts = [];
    try { await loadDistricts(); await refreshSubjects(); }
    catch (e) { return showDashError(e); }
    loadTable();
  }

  // narrow the Subject list to what exists for the chosen community / district / category
  async function refreshSubjects() {
    try {
      const { data, error } = await sb.rpc("dashboard_subjects", {
        p_communities: filters.communities,
        p_districts:   filters.districts,
        p_categories:  filters.categories
      });
      if (error) throw error;
      subject.setOptions((data || []).map(r => r.subject));
      filters.subjects = [];   // options changed -> reset to "all"
    } catch (e) { showDashError(e); }
  }

  function showDashError(e) {
    console.error(e);
    $("dashMsg").className = "msg show err";
    $("dashMsg").innerHTML = `<b>Could not load data.</b><br><code>${esc((e && e.message) || e)}</code>`;
  }

  async function loadTable() {
    $("dashMsg").className = "msg";
    $("tableWrap").innerHTML = `<div class="loading"><span class="spinner dark"></span> Loading…</div>`;
    try {
      const { data, error } = await sb.rpc("dashboard_weekly", {
        p_communities: filters.communities, p_districts: filters.districts,
        p_categories: filters.categories, p_subjects: filters.subjects,
        p_months: filters.months, p_include_dnc: filters.includeDnc
      });
      if (error) throw error;
      lastRows = data || [];
      render();
    } catch (e) { $("tableWrap").innerHTML = ""; showDashError(e); }
  }

  function pivot(rows) {
    const months = [], seen = new Set(), map = {};
    rows.forEach(r => {
      if (!seen.has(r.month_key)) { seen.add(r.month_key); months.push(r.month_key); }
      (map[r.month_key] = map[r.month_key] || {})[r.week_no] = { s: r.unique_schools, t: r.unique_teachers, p: r.total_posts };
    });
    months.sort();
    return { months, map };
  }

  const SUBS = ["Unique Schools Posted", "Unique Teachers Posted", "Total Posts"];

  function selectedGroups() {
    const sel = filters.weeks.length ? filters.weeks : ["TOTAL"];
    const weekNums = sel.filter(v => v !== "TOTAL").map(Number).sort((a, b) => a - b);
    const groups = weekNums.map(w => ({ key: w, name: "Week " + w }));
    if (sel.includes("TOTAL")) groups.push({ key: 0, name: "Month Total" });
    if (!groups.length) groups.push({ key: 0, name: "Month Total" });
    return groups;
  }

  // ------- applied-filters summary (shown above the table + in exports) -------
  const j = a => a.join(", ");
  function summaryPairs() {
    return [
      ["Community", filters.communities.length ? j(filters.communities) : "All"],
      ["District",  filters.districts.length ? j(filters.districts) : "All"],
      ["Category",  filters.categories.length ? j(filters.categories) : "All"],
      ["Months",    filters.months.length ? filters.months.map(monthLabel).join(", ") : "All"],
      ["Weeks",     filters.weeks.length ? filters.weeks.map(weekLabel).join(", ") : "All Weeks"],
      ["DO NOT CONSIDER", filters.includeDnc ? "Included" : "Excluded"]
    ];
  }
  function subjectsText() { return filters.subjects.length ? j(filters.subjects) : "All subjects"; }
  function summaryLineForExcel() {
    return [["Subjects", subjectsText()]].concat(summaryPairs())
      .map(([k, v]) => `${k}: ${v}`).join("   |   ");
  }
  function renderSummary() {
    $("summary").innerHTML =
      `<div class="sum-subjects">Selected Subjects: <b>${esc(subjectsText())}</b></div>` +
      `<div class="sum-filters">${esc(summaryPairs().map(([k, v]) => `${k}: ${v}`).join("   ·   "))}</div>`;
  }

  function render() {
    renderSummary();
    if (!lastRows.length) { lastTable = null; $("tableWrap").innerHTML = `<div class="empty">No data for the selected filters.</div>`; return; }
    const { months, map } = pivot(lastRows);
    const groups = selectedGroups();
    const single = months.length === 1 ? months[0] : null;
    groups.forEach(g => g.dates = g.key === 0 ? "" : weekDates(g.key, single));
    lastTable = { months, map, groups };

    let h = '<table class="grid"><thead><tr><th class="corner" rowspan="2">Month</th>';
    groups.forEach(g => {
      const d = g.dates ? `<div class="grp-dates">${g.dates}</div>` : "";
      h += `<th class="grp${g.key === 0 ? " total" : ""}" colspan="3">${g.name}${d}</th>`;
    });
    h += '</tr><tr>';
    groups.forEach(g => SUBS.forEach(s => h += `<th class="sub${g.key === 0 ? " total" : ""}">${s}</th>`));
    h += '</tr></thead><tbody>';
    months.forEach(mk => {
      h += `<tr><td class="mcell">${monthLabel(mk)}</td>`;
      groups.forEach(g => {
        const c = (map[mk] && map[mk][g.key]) || { s: 0, t: 0, p: 0 };
        const cls = g.key === 0 ? ' class="total"' : "";
        h += `<td${cls}>${fmt(c.s)}</td><td${cls}>${fmt(c.t)}</td><td${cls}>${fmt(c.p)}</td>`;
      });
      h += "</tr>";
    });
    h += "</tbody></table>";
    $("tableWrap").innerHTML = h;
  }

  // ---------------- exports ----------------
  function downloadExcel() {
    if (!lastTable) return;
    const { months, map, groups } = lastTable;
    const totalCols = 1 + groups.length * 3;

    const header0 = ["Month"], header1 = [""];
    groups.forEach(g => { header0.push(g.dates ? `${g.name} (${g.dates})` : g.name, "", ""); SUBS.forEach(s => header1.push(s)); });

    const aoa = [[summaryLineForExcel()], [], header0, header1];   // row 1 = applied filters
    months.forEach(mk => {
      const r = [monthLabel(mk)];
      groups.forEach(g => { const c = (map[mk] && map[mk][g.key]) || { s: 0, t: 0, p: 0 }; r.push(c.s, c.t, c.p); });
      aoa.push(r);
    });

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const merges = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } },  // summary row across all cols
      { s: { r: 2, c: 0 }, e: { r: 3, c: 0 } }               // Month label
    ];
    groups.forEach((_, i) => { const c = 1 + i * 3; merges.push({ s: { r: 2, c }, e: { r: 2, c: c + 2 } }); });
    ws["!merges"] = merges;
    ws["!cols"] = header0.map((_, i) => ({ wch: i === 0 ? 12 : 20 }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Weekly");
    XLSX.writeFile(wb, `Vinoba_Weekly_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  async function downloadSnapshot() {
    if (!lastTable) return;
    const btn = $("snapshotBtn"); const old = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Rendering…';
    try {
      const bg = (getComputedStyle(document.documentElement).getPropertyValue("--panel") || "#171a21").trim();
      const tableEl = $("tableWrap").querySelector("table");
      const area = document.createElement("div");
      area.className = "snapshot-render";
      area.style.cssText = `position:fixed;left:-99999px;top:0;padding:24px;background:${bg};display:inline-block;`;
      const sumClone = $("summary").cloneNode(true);
      sumClone.style.marginBottom = "16px";
      area.appendChild(sumClone);
      if (tableEl) area.appendChild(tableEl.cloneNode(true));
      document.body.appendChild(area);
      const canvas = await html2canvas(area, { backgroundColor: bg, scale: 2 });
      area.remove();
      canvas.toBlob(b => {
        const u = URL.createObjectURL(b);
        const a = document.createElement("a");
        a.href = u; a.download = `Vinoba_Snapshot_${new Date().toISOString().slice(0, 10)}.png`;
        a.click(); URL.revokeObjectURL(u);
      });
    } catch (e) { showDashError(e); }
    finally { btn.disabled = false; btn.innerHTML = old; }
  }
})();
