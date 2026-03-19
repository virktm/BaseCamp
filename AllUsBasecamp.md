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
| `member_pin_{member_id}` | SHA-256 hex string | Hashed 4-digit PIN (salted with member UUID) |
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
| email | TEXT | Optional email address |
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
  │     ├── Long-press avatar    →  wiggle/edit mode (Done button exits)
  │     │     └── Tap ✕ badge   →  PIN modal (if PIN set) → remove member
  │     │                           (no PIN → remove immediately)
  │     ├── Tap empty slot       →  MemberModal (add member: name + optional email + photo)
  │     ├── Tap filled avatar    →  (no email) → MemberEmailModal
  │     │                           (has email, no PIN) → MemberPinModal (set mode)
  │     │                           (has email + PIN) → MemberPinModal (enter mode)
  │     │                                 └── correct PIN → MemberAreaScreen
  │     │                                       ├── Plan tile  →  PlanScreen (meals / exercise / book)
  │     │                                       └── Wellness Tracker button
  │     │                                             └── window.location → wellness-tracker.html
  │     │                                                   (sessionStorage: wt_member_id, wt_name, wt_avatar)
  │     └── Family Basecamp btn  →  gate popup ("Access granted only after clicking your avatar.")
  │
  ├── CommonAreaScreen  (opened after PIN verified, or via sessionStorage abc_goto)
  │     ├── Back arrow           →  wellness-tracker.html (if abc_from=tracker) OR WelcomeScreen
  │     ├── Plan tab             →  PlanScreen (vacation / event / dine)
  │     └── Memories tab         →  MemoriesScreen (Leaflet map)
  │
  └── wellness-tracker.html  (separate React app)
        ├── HomeScreen (activity grid)
        │     ├── EN/DE toggle         →  switch page language (localStorage: wt_lang)
        │     ├── Swap User button     →  index.html (home screen)
        │     ├── 🏡 Family Basecamp   →  index.html with abc_goto=plan + abc_from=tracker
        │     ├── Tap activity tile    →  DetailScreen
        │     ├── Tap Add New tile     →  AddActivitySheet (overlay)
        │     └── Tap avatar           →  AvatarSheet (overlay)
        └── DetailScreen
              ├── Status / Freq / Streak controls (labels translated)
              ├── Edit "Why it matters"
              └── Remove / Delete activity
```

---

## Screens

### Welcome Screen
- **Editable tagline** — tap to edit inline; saves to `allusbasecamp_settings`
- **7 circular avatar slots** — empty = add modal (name + optional email + photo); filled = PIN auth flow
- **Long-press any avatar** — enters wiggle/edit mode; red ✕ badge appears; tap Done (green pill) or outside grid to exit
- **Removing a member** — if member has a PIN, must verify it first; if no PIN, removed immediately
- **Family Basecamp button** — shows gate popup; navigation only possible after tapping an avatar and entering PIN
- **PIN auth flow:** no email → email prompt → has email, no PIN → set PIN → has PIN → enter PIN → Member Area

### Member Area Screen
- Hero header: member avatar + name
- 3 personal plan tiles: 🥗 Plan Meals · 🏃 Exercise · 📖 Read Book
- **Wellness Tracker** button → navigates to `wellness-tracker.html`

### Common Area Screen (Family Basecamp)
- **Plan tab** — 3 shared plan tiles: ✈️ Plan Vacation · 🎉 Go to an Event · 🍽️ Dine Out
- **Memories tab** — opens Leaflet map with filter carousel (All / Vacation / Events / Dining Out / custom activities; swipeable, fading right edge, deep-navy active chip)
- **Back arrow** — returns to `wellness-tracker.html` if navigated from there (`abc_from=tracker`); otherwise returns to home screen
- Opens on a specific tab via `abc_goto` sessionStorage key (`'plan'` or `'memories'`)

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
- **Top-right controls:** EN/DE language toggle (`LangSwitch`) · Swap User button (diamond → home screen)
- **Filter tabs:** All / Ongoing / Not Planned (translated)
- **2-column activity grid** — each tile shows icon, name (translated for built-ins), status badge, 🔥 streak
- **"Add New" tile** (dashed border) → opens AddActivitySheet at App level
- **🏡 Family Basecamp button** (bottom) → navigates to Family Basecamp Plan tab with back-arrow support

### Detail Screen
- Hero card with large icon, name, and category (translated for built-ins)
- Status toggle: ✅ Ongoing / ⏸ Not Planned
- Frequency picker: Daily / Weekdays / 3×/week / Weekly / Monthly (all translated)
- Day Streak: M (month) / W (week) / D (day) badge row + **🎯 Mission Accomplished** / **↺ Reset**
- **Why it matters** — pencil icon → inline textarea → Save / Cancel (persisted per member; overrides default translated tip)
- **Remove button** — built-ins: "✕ Remove from My List" (hides per-member); custom: "🗑 Delete Activity" (fully removes)
- All button labels and section headings translated in the selected language

### Add Activity Sheet (bottom sheet)
- Live preview tile updates as you type (status badge translated)
- Fields: Activity Name · Category · Why it matters (labels translated)
- Icon picker: 36 emoji
- Colour picker: 8 themes (Violet, Green, Blue, Orange, Pink, Cyan, Amber, Rose)
- **＋ Create Activity** saves definition + initial wellness row to Supabase
- Default sub/tip fallbacks use translated strings

### Avatar Sheet (bottom sheet)
- **📷 Upload Photo** → device file picker → uploads to `member-avatars` bucket
- **Emoji grid** — 25 options; saves `emoji:🐱` string as `avatar_url`
- Sheet title and button labels translated in selected language

---

## Wellness Tracker — Per-Member Customisation

All customisations are stored in `allusbasecamp_settings` using namespaced keys. No schema changes needed.

| Feature | Storage key | Format |
|---------|------------|--------|
| 4-digit PIN (hashed) | `member_pin_{id}` | SHA-256 hex string, salted with member UUID |
| Custom activities | `wt_custom_acts_{id}` | JSON array of activity definition objects |
| Hidden built-ins | `wt_hidden_acts_{id}` | JSON array of activity ID strings |
| Custom tips | `wt_tips_{id}` | JSON object `{ activityId: "tip text" }` |

Boot load uses a single `Promise.all` across 4 Supabase reads before first render.

## Multilingual Support (Wellness Tracker)

The wellness tracker supports English (`en`) and German (`de`). Language is controlled by a `LangSwitch` pill toggle in the profile row and persisted in `localStorage` (`wt_lang`).

- `TRANSLATIONS` object maps all UI strings under `en` and `de` keys
- Built-in activity labels, sub-titles, and default tips are translated
- Custom activities (user-created) are never translated — shown as entered
- Frequency option keys (`'Daily'`, `'Weekly'`, etc.) remain English in storage; only their display labels are translated
- Components that accept translated text receive a `lang` prop: `HomeScreen`, `DetailScreen`, `AddActivitySheet`, `AvatarSheet`

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
