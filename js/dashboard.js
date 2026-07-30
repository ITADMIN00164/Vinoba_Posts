/* ============================================================
   Vinoba Posts · Dashboard
   Uses shared globals from common.js:  sb, $, C, hasKey
   ============================================================ */
(function () {
  const C = window.C, sb = window.sb, $ = window.$;

  // ---------------- reusable multi-select dropdown ----------------
  function MultiSelect(container, { title, labelFn, onApply }) {
    labelFn = labelFn || (v => v);
    let options = [], checked = new Set(), applied = new Set(), enabled = true;

    const root   = document.createElement("div"); root.className = "ms";
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
      const n = applied.size;
      btn.innerHTML = `<span>${n === 0 || n === options.length ? "All " + title : n + " selected"}</span><span class="ms-caret">▾</span>`;
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
    allBox.addEventListener("change", () => {
      checked = allBox.checked ? new Set(options) : new Set(); renderList();
    });
    clr.addEventListener("click", () => { checked = new Set(); allBox.checked = false; renderList(); });
    app.addEventListener("click", () => {
      applied = new Set(checked); updateBtn(); close();
      onApply([...applied]);
    });

    return {
      el: root,
      setOptions(opts) {
        options = opts.slice(); checked = new Set(); applied = new Set();
        allBox.checked = false; updateBtn(); renderList();
      },
      getApplied() { return [...applied]; },
      setEnabled(on, placeholder) {
        enabled = on; root.classList.toggle("disabled", !on);
        if (!on) { btn.innerHTML = `<span class="ms-ph">${placeholder || "Unavailable"}</span><span class="ms-caret">▾</span>`; close(); }
        else updateBtn();
      }
    };
  }
  const openPanels = () => document.querySelectorAll(".ms-panel.show");
  function closeAll() { openPanels().forEach(p => p.classList.remove("show")); }
  document.addEventListener("click", closeAll);

  // ---------------- dashboard state ----------------
  let community, district, category, subject, month, initialised = false, lastTable = null;
  const filters = { communities: [], districts: [], categories: [], subjects: [], months: [], includeDnc: false };

  function monthLabel(key) {
    const [y, m] = key.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "short", year: "numeric" });
  }
  const fmt = n => (n ?? 0).toLocaleString("en-IN");

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
    district  = MultiSelect(fb, { title: "Districts",   onApply: v => { filters.districts = v; loadTable(); } });
    category  = MultiSelect(fb, { title: "Categories",  onApply: v => { filters.categories = v; loadTable(); } });
    subject   = MultiSelect(fb, { title: "Subjects",    onApply: v => { filters.subjects = v; loadTable(); } });
    month     = MultiSelect(fb, { title: "Months", labelFn: monthLabel, onApply: v => { filters.months = v; loadTable(); } });
    district.setEnabled(false, "Choose a community first");

    try {
      const { data, error } = await sb.rpc("dashboard_options");
      if (error) throw error;
      community.setOptions(data.communities || []);
      category.setOptions(data.categories || []);
      subject.setOptions(data.subjects || []);
      month.setOptions(data.months || []);
    } catch (e) { return showDashError(e); }

    $("dncToggle").addEventListener("change", e => { filters.includeDnc = e.target.checked; loadTable(); });
    $("downloadBtn").addEventListener("click", downloadExcel);
    loadTable();
  }
  window.__initDashboard = initDashboard;

  async function onCommunityApply(sel) {
    filters.communities = sel;
    filters.districts = [];
    if (sel.length) {
      try {
        const { data, error } = await sb.rpc("dashboard_districts", { p_communities: sel });
        if (error) throw error;
        district.setOptions((data || []).map(r => r.district));
        district.setEnabled(true);
      } catch (e) { return showDashError(e); }
    } else {
      district.setOptions([]);
      district.setEnabled(false, "Choose a community first");
    }
    loadTable();
  }

  function showDashError(e) {
    console.error(e);
    $("dashMsg").className = "msg show err";
    $("dashMsg").innerHTML = `<b>Could not load data.</b><br><code>${(e && e.message) || e}</code>`;
  }

  async function loadTable() {
    $("dashMsg").className = "msg";
    $("tableWrap").innerHTML = `<div class="loading"><span class="spinner dark"></span> Loading…</div>`;
    try {
      const { data, error } = await sb.rpc("dashboard_weekly", {
        p_communities: filters.communities,
        p_districts:   filters.districts,
        p_categories:  filters.categories,
        p_subjects:    filters.subjects,
        p_months:      filters.months,
        p_include_dnc: filters.includeDnc
      });
      if (error) throw error;
      renderTable(data || []);
    } catch (e) { $("tableWrap").innerHTML = ""; showDashError(e); }
  }

  // pivot rows -> { months:[keys], weeks:[1..max], map:{month:{week:{s,t,p}}} }
  function pivot(rows) {
    const months = [], seen = new Set(), map = {}; let maxWeek = 1;
    rows.forEach(r => {
      if (!seen.has(r.month_key)) { seen.add(r.month_key); months.push(r.month_key); }
      (map[r.month_key] = map[r.month_key] || {})[r.week_no] = {
        s: r.unique_schools, t: r.unique_teachers, p: r.total_posts
      };
      if (r.week_no > maxWeek) maxWeek = r.week_no;
    });
    months.sort();
    const weeks = []; for (let w = 1; w <= maxWeek; w++) weeks.push(w);
    return { months, weeks, map };
  }

  const SUBS = ["Unique Schools Posted", "Unique Teachers Posted", "Total Posts"];

  function renderTable(rows) {
    if (!rows.length) {
      lastTable = null;
      $("tableWrap").innerHTML = `<div class="empty">No data for the selected filters.</div>`;
      return;
    }
    const { months, weeks, map } = pivot(rows);
    lastTable = { months, weeks, map };

    const groups = weeks.map(w => ({ key: w, name: "Week " + w })).concat([{ key: 0, name: "Month Total" }]);

    let h = '<table class="grid"><thead><tr>';
    h += '<th class="corner" rowspan="2">Month</th>';
    groups.forEach(g => h += `<th class="grp${g.key === 0 ? " total" : ""}" colspan="3">${g.name}</th>`);
    h += '</tr><tr>';
    groups.forEach(g => SUBS.forEach(s =>
      h += `<th class="sub${g.key === 0 ? " total" : ""}">${s}</th>`));
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

  // ---------------- excel export of the visible table ----------------
  function downloadExcel() {
    if (!lastTable) return;
    const { months, weeks, map } = lastTable;
    const groups = weeks.map(w => "Week " + w).concat(["Month Total"]);

    const row0 = ["Month"], row1 = [""];
    groups.forEach(g => { row0.push(g, "", ""); SUBS.forEach(s => row1.push(s)); });
    const aoa = [row0, row1];
    months.forEach(mk => {
      const r = [monthLabel(mk)];
      const gk = weeks.concat([0]);
      gk.forEach(k => { const c = (map[mk] && map[mk][k]) || { s: 0, t: 0, p: 0 }; r.push(c.s, c.t, c.p); });
      aoa.push(r);
    });

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const merges = [{ s: { r: 0, c: 0 }, e: { r: 1, c: 0 } }]; // Month label
    groups.forEach((_, i) => { const c = 1 + i * 3; merges.push({ s: { r: 0, c }, e: { r: 0, c: c + 2 } }); });
    ws["!merges"] = merges;
    ws["!cols"] = aoa[0].map((_, i) => ({ wch: i === 0 ? 12 : 20 }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Weekly");
    const stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Vinoba_Weekly_${stamp}.xlsx`);
  }
})();
