# Vinoba Posts

A no-backend web app that uploads weekly teacher-post exports into Supabase,
blocks duplicate posts by **PostId**, and shows a live dashboard.

```
Vinoba_Posts/
├── index.html                     ← Upload page (home)
├── dashboard.html                 ← Dashboard (starter)
├── css/styles.css
├── js/
│   ├── config.js                  ← ✏️ paste your anon key here
│   ├── upload.js
│   └── dashboard.js
├── sql/schema.sql                 ← run once in Supabase
└── .github/workflows/keepalive.yml ← stops the project from pausing
```

## Setup (about 10 minutes)

### 1. Create the table
Supabase → **SQL Editor** → New query → paste all of `sql/schema.sql` → **Run**.

### 2. Paste your anon key
Supabase → **Project Settings → API** → copy the **`anon` `public`** key
(starts with `eyJ…`). Open `js/config.js` and paste it into `SUPABASE_ANON_KEY`.
The project URL is already filled in.

### 3. Push these files to the `Vinoba_Posts` GitHub repo
Keep the folder structure exactly as above.

### 4. Turn on GitHub Pages (free hosting)
Repo → **Settings → Pages** → Source: **Deploy from a branch** →
Branch: `main` / folder: `/ (root)` → Save.
Your app appears at `https://<your-username>.github.io/Vinoba_Posts/`.

### 5. Keep the database awake
Repo → **Settings → Secrets and variables → Actions → New repository secret**,
add two secrets:
- `SUPABASE_URL` = `https://bbizdjhlgrmlwobzxfgl.supabase.co`
- `SUPABASE_ANON_KEY` = your anon key

The included workflow pings the database every 3 days, so it never hits the
7-day inactivity pause. (You can also run it manually from the **Actions** tab.)

## How the upload works
1. Pick a **Start Date** and **End Date** (the reporting period for this batch).
2. Choose a `.xlsx`, `.xlsm`, or `.csv` file.
3. The app checks the column headers match the required format exactly.
4. It checks every **PostId** — against other rows in the same file **and**
   against everything already in the database.
5. If **any** PostId is a duplicate, the whole upload is **rejected** and you're
   told exactly which PostIds are the problem. Nothing partial is inserted.
6. Otherwise all rows are inserted and tagged with the period you chose.

Use **⬇ Download file format** to get a blank template with the correct headers.

## ⚠️ Security note
Right now the public anon key can **read and insert** (but not update or delete).
That's fine for testing, but before this holds real data you should add a login
(Supabase Auth) so only your team can write. Ask me and I'll add a login page
and tighten the policies.
