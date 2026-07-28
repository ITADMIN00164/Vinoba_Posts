// ============================================================
//  EDIT THIS FILE  ·  paste your Supabase anon key below
// ============================================================
//  Where to find the key:
//    Supabase -> Project Settings -> API -> "anon public" key
// ============================================================

window.CONFIG = {
  // Already filled in from your project screenshot:
  SUPABASE_URL: "https://bbizdjhlgrmlwobzxfgl.supabase.co",

  // 👇 PASTE YOUR ANON PUBLIC KEY HERE (it starts with "eyJ...")
  SUPABASE_ANON_KEY: "PASTE_YOUR_ANON_PUBLIC_KEY_HERE",

  TABLE_NAME: "teacher_posts",

  // The exact column headers a file MUST have, in this exact order.
  EXPECTED_HEADERS: [
    "post_created_date", "community_name", "district_name", "block_name",
    "circle_name", "school_name", "full_name", "mobile_number", "email",
    "PostId", "LinkURL", "Score", "category_name", "subject_name", "tags",
    "DO NOT CONSIDER", "CLASS"
  ],

  // Each file header -> the database column it goes into.
  HEADER_TO_COLUMN: {
    "post_created_date": "post_created_date_raw",
    "community_name":    "community_name",
    "district_name":     "district_name",
    "block_name":        "block_name",
    "circle_name":       "circle_name",
    "school_name":       "school_name",
    "full_name":         "full_name",
    "mobile_number":     "mobile_number",
    "email":             "email",
    "PostId":            "post_id",
    "LinkURL":           "link_url",
    "Score":             "score",
    "category_name":     "category_name",
    "subject_name":      "subject_name",
    "tags":              "tags",
    "DO NOT CONSIDER":   "do_not_consider",
    "CLASS":             "class_value"
  }
};
