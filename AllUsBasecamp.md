# AllUsBasecamp — Family Hub PWA

Mobile-first single-page PWA. Warm cream & forest-green aesthetic.
Fits any phone screen. Runs offline-ready. Backed by Supabase.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Markup | HTML5 |
| Style | Tailwind CSS CDN + custom `style.css` |
| Logic | Vanilla JS (`app.js`, retained) + React 18 (Babel standalone, no bundler) |
| Data | Supabase (Postgres + Storage) |
| PWA | `manifest.json` + `viewport-fit=cover` |
| Deployment | Vercel (static, zero build) |

---

## Files

| File | Purpose |
|------|---------|
| `index.html` | PWA entry point — loads all scripts in order, mounts React root |
| `App.jsx` | Active React SPA — all screens, Supabase helpers, state, navigation |
| `app.js` | Original vanilla-JS implementation (retained for reference) |
| `style.css` | `100dvh`, safe-area insets, transitions, phone-frame, all component styles |
| `wellness-tracker.html` | Self-contained React mini-app for per-member habit tracking |
| `supabase-config.js` | **Edit this** — paste your URL + anon key, exposes `window.sb` |
| `setup.sql` | Run once in Supabase SQL Editor to create all tables, RLS policies, and storage bucket |
| `manifest.json` | PWA install manifest (name, icons, display mode, theme colour) |
| `vercel.json` | Vercel static deployment config — disables build, sets MIME type headers |
| `logo.svg` | Vector logo: cream "P" letterform + dark navy swoosh tail |
| `icon-192.png` | PWA home-screen icon (192×192) |
| `icon-512.png` | PWA home-screen icon (512×512, maskable for Android) |
| `README.md` | Full project documentation (tech stack, DB schema, user guide, quick start) |
| `AllUsBasecamp.md` | This file — concise internal design reference |

---

## First-Time Setup

### 1. Create Supabase project
1. Go to [supabase.com](https://supabase.com) → New Project
2. **Project Settings → API** → copy `Project URL` and `anon/public` key
3. Paste into `supabase-config.js`

### 2. Run the SQL
Open **SQL Editor** in Supabase and run the full contents of `setup.sql`.

### 3. Create the Storage bucket
**Storage → New Bucket**
- Name: `member-avatars`
- Public bucket: **ON**

### 4. Serve locally
```bash
npx serve .
# or
python3 -m http.server 8080
```
Open `http://localhost:8080` in a browser or Chrome DevTools → Device toolbar.

**Install as PWA on iPhone:** Safari → Share → Add to Home Screen

### 5. Deploy to Vercel
1. Push to GitHub
2. Import repo at [vercel.com/new](https://vercel.com/new) → Framework: **Other**, Build Command: *(blank)*, Output: `.`
3. Deploy — `vercel.json` handles all static serving configuration

---

## Supabase Tables

All tables are prefixed `allusbasecamp_`.

### `allusbasecamp_settings`
Generic key-value store — app-wide and per-member configuration.

| Column | Type | Notes |
|--------|------|-------|
| key | TEXT PK | Namespaced key |
| value | TEXT | Plain text or JSON string |
| updated_at | TIMESTAMPTZ | Auto-set |

**Keys in use:**

| Key | Value format | Purpose |
|-----|-------------|---------|
| `tagline` | Plain text | Editable welcome screen headline |
| `wt_custom_acts_{member_id}` | JSON array | Custom wellness activity definitions per member |
| `wt_hidden_acts_{member_id}` | JSON array of strings | Built-in activity IDs removed from a member's list |
| `wt_tips_{member_id}` | JSON object `{id: tip}` | Custom "Why it matters" text overrides per member |

---

### `allusbasecamp_members`
Up to 7 family members, one per position slot (0–6).

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | Auto-generated |
| name | TEXT | Display name |
| avatar_url | TEXT | Public Storage URL, or `emoji:🐱` prefix for emoji avatars |
| position | INT | 0–6 (slot in grid), UNIQUE |
| created_at | TIMESTAMPTZ | Auto-set |

---

### `allusbasecamp_common_plans`
Shared family plans.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | Auto-generated |
| type | TEXT | `vacation` \| `event` \| `dine` |
| content | TEXT | Plan entry text |
| created_at | TIMESTAMPTZ | Auto-set |

---

### `allusbasecamp_personal_plans`
Per-member private plans.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | Auto-generated |
| member_id | UUID FK | → `allusbasecamp_members.id` (CASCADE delete) |
| type | TEXT | `meals` \| `exercise` \| `book` |
| content | TEXT | Plan entry text |
| created_at | TIMESTAMPTZ | Auto-set |

---

### `allusbasecamp_wellness`
Per-member activity tracking state.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | Auto-generated |
| member_id | UUID FK | → `allusbasecamp_members.id` (CASCADE delete) |
| activity_id | TEXT | Built-in e.g. `walk`, or custom e.g. `custom_1710000000_abc12` |
| status | TEXT | `ongoing` \| `notplanned` |
| freq | TEXT | `Daily` \| `Weekdays` \| `3×/week` \| `Weekly` \| `Monthly` |
| streak | INT | Day streak count (0 = reset) |
| updated_at | TIMESTAMPTZ | Auto-set on every save |
| *(unique)* | | `(member_id, activity_id)` — one row per member per habit |

---

### `allusbasecamp_wellness_level`
Self-selected experience level per member.

| Column | Type | Notes |
|--------|------|-------|
| member_id | UUID PK | → `allusbasecamp_members.id` (CASCADE delete) |
| level_idx | INT | `0` = Beginner, `1` = Intermediate, `2` = Advanced |
| updated_at | TIMESTAMPTZ | Auto-set |

---

### `allusbasecamp_custom_activities`
Family-shared custom activity types shown on the Memories map.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | Auto-generated; also used as `type` in `allusbasecamp_map_pins` |
| name | TEXT | Display name e.g. "Board Game Night" |
| emoji | TEXT | Emoji icon |
| gradient | TEXT | CSS gradient string for tile background |
| pin_color | TEXT | Hex colour for the Leaflet map pin |
| created_at | TIMESTAMPTZ | Auto-set |

---

### `allusbasecamp_map_pins`
Location pins dropped on the Memories map.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | Auto-generated |
| type | TEXT | `vacation` \| `event` \| `dine` or a custom activity UUID |
| lat / lng | DOUBLE PRECISION | Geographic coordinates |
| label | TEXT | Place name or description |
| month_year | TEXT | `YYYY-MM` e.g. `2026-03` — displayed on the pin |
| created_at | TIMESTAMPTZ | Auto-set |

---

## Supabase Storage

- **Bucket:** `member-avatars` (public)
- **Path — main app:** `slot-{0–6}/avatar.{ext}` (keyed by position slot)
- **Path — wellness tracker:** `members/{member_id}/avatar.{ext}` (keyed by UUID)
- Upload uses `upsert: true` — new photo overwrites old for same path
- Cache-buster appended to URL after upload (`?t=timestamp`)
- Deleting a member removes all related avatar paths

---

## Navigation Flow

```
index.html  (React SPA — App.jsx)
  │
  ├── WelcomeScreen
  │     ├── Tap empty slot     →  MemberModal (add member)
  │     ├── Tap filled avatar  →  MemberAreaScreen
  │     │     ├── Plan tile    →  PlanScreen (meals / exercise / book)
  │     │     └── Wellness Tracker button
  │     │           └── window.location → wellness-tracker.html
  │     │                 (sessionStorage: wt_member_id, wt_name, wt_avatar)
  │     └── Family Basecamp   →  CommonAreaScreen
  │           ├── Plan tile    →  PlanScreen (vacation / event / dine)
  │           └── Memories     →  MemoriesScreen (Leaflet map)
  │
  └── wellness-tracker.html  (separate React app)
        ├── HomeScreen (activity grid)
        │     ├── Tap activity tile  →  DetailScreen
        │     ├── Tap Add New tile   →  AddActivitySheet (overlay)
        │     └── Tap avatar         →  AvatarSheet (overlay)
        └── DetailScreen
              ├── Status / Freq / Streak controls
              ├── Edit "Why it matters"
              └── Remove / Delete activity
```

---

## Screens

### Welcome Screen
- **Editable tagline** — tap to edit inline; saves to `allusbasecamp_settings`
- **7 circular avatar slots** — empty = add modal; filled = opens Member Area
- **Family Basecamp button** — opens Common Area

### Member Area Screen
- Hero header: member avatar + name
- 3 personal plan tiles: 🥗 Plan Meals · 🏃 Exercise · 📖 Read Book
- **Wellness Tracker** button → navigates to `wellness-tracker.html`

### Common Area Screen
- 3 shared plan tiles: ✈️ Plan Vacation · 🎉 Go to an Event · 🍽️ Dine Out
- **Memories** button → opens Leaflet map
- Filter carousel: All / Vacation / Events / Dining Out / custom activities (swipeable, fading right edge, deep-navy active chip)

### Plan Screen
- Scrollable list of entries with timestamps
- Add entry (optimistic insert, rolls back on Supabase error)
- Delete per entry (immediate DOM remove, async Supabase delete)

### Memories Screen (Leaflet map)
- Full-screen interactive map
- Filter carousel to show/hide pins by activity type
- Tap map → AddPinModal (label + month/year)
- Custom SVG pin shapes: teardrop (vacation), star (event), pawn (dine), badge (custom)
- **+ Activity** → AddCustomActivityModal (name, emoji, gradient)

---

## Wellness Tracker Screens

### Home Screen (Activity Grid)
- **Profile row:** tappable avatar (opens AvatarSheet) · name · level badge (opens picker) · XP bar
- **Filter tabs:** All / Ongoing / Not Planned
- **2-column activity grid** — each tile shows icon, name, status badge, 🔥 streak
- **"Add New" tile** (dashed border) → opens AddActivitySheet at App level

### Detail Screen
- Hero card with large icon
- Status toggle: ✅ Ongoing / ⏸ Not Planned
- Frequency picker: Daily / Weekdays / 3×/week / Weekly / Monthly
- Day Streak: M (month) / W (week) / D (day) badge row + **🎯 Mission Accomplished** / **↺ Reset**
- **Why it matters** — pencil icon → inline textarea → Save / Cancel (persisted per member)
- **Remove button** — built-ins: "✕ Remove from My List" (hides per-member); custom: "🗑 Delete Activity" (fully removes)

### Add Activity Sheet (bottom sheet)
- Live preview tile updates as you type
- Fields: Activity Name · Category · Why it matters
- Icon picker: 36 emoji
- Colour picker: 8 themes (Violet, Green, Blue, Orange, Pink, Cyan, Amber, Rose)
- **＋ Create Activity** saves definition + initial wellness row to Supabase

### Avatar Sheet (bottom sheet)
- **📷 Upload Photo** → device file picker → uploads to `member-avatars` bucket
- **Emoji grid** — 25 options; saves `emoji:🐱` string as `avatar_url`

---

## Wellness Tracker — Per-Member Customisation

All customisations are stored in `allusbasecamp_settings` using namespaced keys. No schema changes needed.

| Feature | Storage key | Format |
|---------|------------|--------|
| Custom activities | `wt_custom_acts_{id}` | JSON array of activity definition objects |
| Hidden built-ins | `wt_hidden_acts_{id}` | JSON array of activity ID strings |
| Custom tips | `wt_tips_{id}` | JSON object `{ activityId: "tip text" }` |

Boot load uses a single `Promise.all` across 4 Supabase reads before first render.

---

## Design Tokens

```css
/* Main app — cream & forest */
--cream:        #FDFBF7   /* page background */
--cream-dark:   #F0EBE1   /* input backgrounds */
--cream-border: #E4D9C8   /* subtle borders */
--forest:       #1A531A   /* primary text & buttons */
--forest-light: #2D7A2D   /* back buttons */
```

Wellness tracker palette: violet primary (`#7C3AED`), pastel tile backgrounds per habit.
Filter carousel active chip: deep navy `#1e3a8a`.

---

## Mobile-First Technical Notes

| Feature | Implementation |
|---------|---------------|
| Viewport height | `height: 100dvh` — shrinks when browser chrome appears |
| Notch / home bar | `env(safe-area-inset-*)` CSS variables on every screen |
| Full-screen PWA | `viewport-fit=cover` + `apple-mobile-web-app-capable` |
| No iOS input zoom | `font-size: max(16px, ...)` on all inputs and textareas |
| No rubber-band | `overscroll-behavior: none` |
| Touch targets | `min-height: 44–52px` on all interactive elements |
| Scrollbar hidden | `scrollbar-width: none` + `::-webkit-scrollbar { display: none }` |
| Desktop preview | Phone frame (390×844 px) centred on dark backdrop via CSS `transform` |
| Bottom sheet overlays | `position: absolute` inside phone-frame (not `fixed`) — avoids CSS `transform` containment clipping bug |

### CSS containment note
`.phone-frame` uses `transform: translate(-50%,-50%)` + `overflow: hidden`. This creates a new containing block for positioned children. Bottom sheets (`AddActivitySheet`, `AvatarSheet`) must be **direct children of `.phone-frame`** and use `position: absolute` — not `position: fixed` — otherwise they are clipped and cannot scroll.
