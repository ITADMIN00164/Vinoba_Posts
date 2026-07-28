/* ============================================================
   Vinoba Posts · Dashboard (starter stub)
   Shows a few live numbers now so you can confirm the database
   connection works. We'll build out the real charts/filters next.
   ============================================================ */

const C = window.CONFIG;
const sb = supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);

function $(id) { return document.getElementById(id); }

async function loadStats() {
  if (!C.SUPABASE_ANON_KEY || C.SUPABASE_ANON_KEY.includes("PASTE_YOUR")) {
    $("dashMsg").className = "msg show err";
    $("dashMsg").innerHTML = "<b>Setup needed:</b> paste your Supabase anon key into <code>js/config.js</code>.";
    return;
  }

  try {
    // total rows
    const { count, error: e1 } = await sb
      .from(C.TABLE_NAME).select("*", { count: "exact", head: true });
    if (e1) throw e1;
    $("totalPosts").textContent = (count ?? 0).toLocaleString("en-IN");

    // latest upload / period
    const { data, error: e2 } = await sb
      .from(C.TABLE_NAME)
      .select("period_start, period_end, uploaded_at")
      .order("uploaded_at", { ascending: false })
      .limit(1);
    if (e2) throw e2;

    if (data && data.length) {
      const row = data[0];
      $("latestPeriod").textContent = row.period_start && row.period_end
        ? `${row.period_start} → ${row.period_end}` : "—";
      $("lastUpload").textContent = row.uploaded_at
        ? new Date(row.uploaded_at).toLocaleString("en-IN") : "—";
    } else {
      $("latestPeriod").textContent = "—";
      $("lastUpload").textContent = "No data yet";
    }
  } catch (e) {
    console.error(e);
    $("dashMsg").className = "msg show err";
    $("dashMsg").innerHTML = `<b>Could not load data.</b><br><code>${(e && e.message) || e}</code>`;
  }
}

document.addEventListener("DOMContentLoaded", loadStats);
