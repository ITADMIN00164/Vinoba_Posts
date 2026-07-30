/* ============================================================
   Vinoba Posts · shared setup
   Creates the Supabase client, handles tabs + theme, and
   auto-loads the dashboard (the default tab) on landing.
   ============================================================ */

window.C  = window.CONFIG;
window.sb = supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);
window.$  = (id) => document.getElementById(id);
window.hasKey = () => C.SUPABASE_ANON_KEY && !C.SUPABASE_ANON_KEY.includes("PASTE_YOUR");

const THEME_KEY = "vinoba_theme";

function applyTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
  const btn = document.getElementById("themeBtn");
  if (btn) btn.textContent = t === "dark" ? "🌙" : "☀️";
}

document.addEventListener("DOMContentLoaded", () => {
  // theme toggle
  applyTheme(document.documentElement.getAttribute("data-theme") || "dark");
  const tbtn = document.getElementById("themeBtn");
  if (tbtn) tbtn.addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
    applyTheme(next);
  });

  // tabs
  const tabs = document.querySelectorAll(".tab");
  tabs.forEach(tab => tab.addEventListener("click", () => {
    tabs.forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    document.querySelectorAll(".panel").forEach(p => p.classList.remove("show"));
    document.getElementById("panel-" + tab.dataset.tab).classList.add("show");
    if (tab.dataset.tab === "dashboard" && window.__initDashboard) window.__initDashboard();
  }));

  // auto-load dashboard on landing (it's the default tab)
  if (window.__initDashboard) window.__initDashboard();
});
