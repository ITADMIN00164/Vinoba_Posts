/* ============================================================
   Vinoba Posts · shared setup
   Loaded once; creates the Supabase client and handles tabs.
   ============================================================ */

window.C  = window.CONFIG;
window.sb = supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);
window.$  = (id) => document.getElementById(id);

window.hasKey = () => C.SUPABASE_ANON_KEY && !C.SUPABASE_ANON_KEY.includes("PASTE_YOUR");

document.addEventListener("DOMContentLoaded", () => {
  const tabs = document.querySelectorAll(".tab");
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      document.querySelectorAll(".panel").forEach(p => p.classList.remove("show"));
      document.getElementById("panel-" + tab.dataset.tab).classList.add("show");
      if (tab.dataset.tab === "dashboard" && window.__initDashboard) window.__initDashboard();
    });
  });
});
