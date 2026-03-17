# AllUsBasecamp

A family-first Progressive Web App (PWA) that acts as a shared hub for planning trips, tracking personal wellness habits, managing shared meals and events, and storing memories — all in one place, no app store required.

---

## Table of Contents

1. [Tech Stack](#tech-stack)
2. [Architecture](#architecture)
3. [Project Structure](#project-structure)
4. [Database Structure](#database-structure)
5. [File Guide](#file-guide)
6. [Screens & User Guide](#screens--user-guide)
7. [Quick Start](#quick-start)

---

## Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| **UI Framework** | React 18 (UMD/CDN) | No build step — loaded via unpkg CDN |
| **JSX Compiler** | Babel Standalone | Transpiles JSX in the browser at runtime |
| **Styling — App shell** | Custom CSS (`style.css`) | Hand-crafted with CSS variables + animations |
| **Styling — Components** | Tailwind CSS Play CDN | Filter carousels, wellness tracker UI, bottom sheets |
| **Fonts** | Google Fonts — Playfair Display + Inter | Serif for headings, sans-serif for UI |
| **Backend / Database** | Supabase (PostgreSQL) | Realtime-ready; used for data + file storage |
| **File Storage** | Supabase Storage | `member-avatars` public bucket for photos |
| **Maps** | Leaflet.js 1.9 | Interactive map with custom SVG pins |
| **PWA** | Web App Manifest + `<meta>` tags | Installable on iOS and Android home screens |
| **Deployment** | Vercel | Static hosting, zero build step, `vercel.json` configures MIME types |

### Why no build step?

AllUsBasecamp is intentionally **zero-toolchain**. Every file is plain HTML/JSX/CSS served directly from a static host. There is no `npm install`, no bundler, no deployment pipeline. This makes it trivially portable and easy for non-engineers to fork and run.

---

## Architecture

```
Browser
  │
  ├── index.html               ← App shell + React mount point
  │     ├── style.css          ← Global styles, screen transitions, layout
  │     ├── supabase-config.js ← Supabase client (window.sb)
  │     └── App.jsx            ← Full React SPA (compiled in-browser by Babel)
  │
  └── wellness-tracker.html    ← Self-contained React mini-app for member wellness
        └── (inline <script type="text/babel">)
```

### Data flow

```
User action
    │
    ▼
React state update (useState / useCallback)
    │
    ├── Optimistic UI update (instant feedback)
    │
    └── Async Supabase call (upsert / insert / delete)
            │
            └── Supabase PostgreSQL / Storage
```

- **No Redux / Context API** — state is local to each component or lifted to the nearest parent that needs it.
- **`window.sb`** — the Supabase client is created once in `supabase-config.js` and exposed globally so both `App.jsx` (React) and the legacy `app.js` can share it without ES module imports.
- **Single round-trip boot** — both apps use `Promise.all` to load all required data in one network round-trip before first render.
- **Optimistic UI** — plan additions and activity updates appear immediately in the DOM; Supabase errors trigger a rollback and toast notification.

### Bottom sheet containment rule

`.phone-frame` uses `transform: translate(-50%,-50%)` + `overflow: hidden`. CSS transforms create a new containing block, so `position: fixed` children are clipped. All bottom sheet overlays (`AddActivitySheet`, `AvatarSheet`) are rendered as **direct children of `.phone-frame`** with `position: absolute` to avoid this.

### PWA behaviour

- Runs in `standalone` display mode on mobile (no browser chrome).
- `viewport-fit=cover` + `maximum-scale=1` prevents iOS zoom and respects the safe area inset (notch / home bar).
- `theme-color` and `background_color` in the manifest match the cream `#FDFBF7` palette for a native-feeling launch screen.
- Icons at 192×192 and 512×512 (maskable) satisfy Android adaptive icon requirements.

---

## Project Structure

```
05_AllUsBasecamp/
│
├── index.html              ← Main PWA entry point
├── App.jsx                 ← React SPA (all screens except wellness tracker)
├── app.js                  ← Legacy vanilla-JS implementation (retained for reference)
├── style.css               ← Global styles for the main app shell
│
├── wellness-tracker.html   ← Self-contained wellness tracker React mini-app
│
├── supabase-config.js      ← Supabase URL + anon key → window.sb
├── setup.sql               ← Full database schema + RLS policies
├── manifest.json           ← PWA manifest (name, icons, display mode)
├── vercel.json             ← Vercel static deployment config
│
├── logo.svg                ← SVG logo (cream P letterform + navy swoosh)
├── icon-192.png            ← PWA icon (192×192)
├── icon-512.png            ← PWA icon (512×512, maskable)
│
├── README.md               ← This file
└── AllUsBasecamp.md        ← Concise internal design reference
```

---

## Database Structure

All tables live in a single Supabase project. Row Level Security (RLS) is enabled on every table with an `anon_all` policy — the anonymous key has full read/write access. Appropriate for a private family app with no public URL.

Run `setup.sql` once in the Supabase SQL Editor to create everything.

### Tables

#### `allusbasecamp_settings`
Generic key-value store for app-wide and per-member configuration.

| Column | Type | Description |
|---|---|---|
| `key` | TEXT (PK) | Unique namespaced key |
| `value` | TEXT | Plain text or JSON string |
| `updated_at` | TIMESTAMPTZ | Last write timestamp |

**Keys in use:**

| Key | Format | Purpose |
|---|---|---|
| `tagline` | Plain text | Welcome screen editable headline |
| `wt_custom_acts_{member_id}` | JSON array | Custom wellness activity definitions per member |
| `wt_hidden_acts_{member_id}` | JSON array of IDs | Built-in activity IDs removed from a member's list |
| `wt_tips_{member_id}` | JSON object `{id: tip}` | Custom "Why it matters" text overrides per member |

---

#### `allusbasecamp_members`
Up to 7 family members, each occupying a numbered slot (0–6).

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Auto-generated |
| `name` | TEXT | Member's display name |
| `avatar_url` | TEXT | Public Storage URL, or `emoji:🐱` prefix for emoji avatars |
| `position` | INT | Slot index 0–6 (unique constraint) |
| `created_at` | TIMESTAMPTZ | Row creation time |

---

#### `allusbasecamp_common_plans`
Shared family plans (vacation, events, dining out).

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Auto-generated |
| `type` | TEXT | One of `vacation`, `event`, `dine` |
| `content` | TEXT | The plan entry text |
| `created_at` | TIMESTAMPTZ | Row creation time |

---

#### `allusbasecamp_personal_plans`
Per-member private plans (meals, exercise, reading).

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Auto-generated |
| `member_id` | UUID (FK → members) | Cascades on member delete |
| `type` | TEXT | One of `meals`, `exercise`, `book` |
| `content` | TEXT | The plan entry text |
| `created_at` | TIMESTAMPTZ | Row creation time |

---

#### `allusbasecamp_wellness`
Tracks each member's status, frequency, and streak per activity.

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Auto-generated |
| `member_id` | UUID (FK → members) | Cascades on member delete |
| `activity_id` | TEXT | Built-in ID (e.g. `walk`) or custom ID (e.g. `custom_1710000000_abc12`) |
| `status` | TEXT | `ongoing` or `notplanned` |
| `freq` | TEXT | `Daily`, `Weekdays`, `3×/week`, `Weekly`, `Monthly` |
| `streak` | INT | Current day streak count |
| `updated_at` | TIMESTAMPTZ | Last update time |

Unique constraint: `(member_id, activity_id)` — one row per member per activity.

---

#### `allusbasecamp_wellness_level`
One row per member, stores their self-selected experience level.

| Column | Type | Description |
|---|---|---|
| `member_id` | UUID (PK + FK → members) | One row per member |
| `level_idx` | INT | `0` = Beginner, `1` = Intermediate, `2` = Advanced |
| `updated_at` | TIMESTAMPTZ | Last update time |

---

#### `allusbasecamp_custom_activities`
Family-shared custom activity types shown on the Memories map.

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Auto-generated; also used as `type` in `allusbasecamp_map_pins` |
| `name` | TEXT | Display name (e.g. "Board Game Night") |
| `emoji` | TEXT | Emoji icon |
| `gradient` | TEXT | CSS gradient string for the activity tile |
| `pin_color` | TEXT | Hex colour for the Leaflet map pin |
| `created_at` | TIMESTAMPTZ | Row creation time |

---

#### `allusbasecamp_map_pins`
Location pins dropped on the Memories map.

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Auto-generated |
| `type` | TEXT | `vacation`, `event`, `dine`, or a custom activity UUID |
| `lat` / `lng` | DOUBLE PRECISION | Geographic coordinates |
| `label` | TEXT | Place name or description |
| `month_year` | TEXT | `YYYY-MM` string displayed on the pin (e.g. `2026-03`) |
| `created_at` | TIMESTAMPTZ | Row creation time |

---

### Storage Bucket: `member-avatars`

Public bucket. Files are stored under two path conventions:

| Path | Used by |
|---|---|
| `slot-{0-6}/avatar.{ext}` | Main app member grid (keyed by slot position) |
| `members/{member_id}/avatar.{ext}` | Wellness tracker (keyed by member UUID) |

Uploads use `upsert: true`. A cache-buster (`?t=timestamp`) is appended to the public URL after each upload.

---

## File Guide

### `index.html`
The single HTML entry point. Loads scripts in strict order:
1. Supabase JS v2 (CDN)
2. `supabase-config.js` (creates `window.sb`)
3. React 18 + ReactDOM (CDN)
4. Babel Standalone (CDN)
5. Leaflet.js (CDN)
6. `App.jsx` (compiled in-browser by Babel)

Also includes Tailwind Play CDN with a `cream` colour token extension, and links to Google Fonts and Leaflet CSS.

---

### `App.jsx`
The main React Single Page App (~74 KB). All screens for the primary experience.

**Constants:**
- `ACTIVITY_META` — vacation / event / dine metadata (icon, gradient, pin shape/colour)
- `COMMON_TILES` / `MEMBER_TILES` — derived tile config for Common and Member area screens
- `PRESET_EMOJIS` / `PRESET_GRADIENTS` — options for creating custom map activities

**Supabase helpers:**
`sbLoadTagline`, `sbSaveTagline`, `sbLoadMembers`, `sbSaveMember`, `sbDeleteMember`, `sbLoadPlans`, `sbAddPlan`, `sbDeletePlan`, `sbLoadMapPins`, `sbSaveMapPin`, `sbDeleteMapPin`, `sbLoadCustomActivities`, `sbSaveCustomActivity`, `sbDeleteCustomActivity`

**Components:**
| Component | Purpose |
|---|---|
| `Toast` | Auto-dismissing slide-up notification |
| `AvatarSlot` | Renders member avatar — handles photo URL, `emoji:` prefix, and initial-letter fallback |
| `LoadingScreen` | Spinner during initial Supabase boot |
| `WelcomeScreen` | Home screen: logo, editable tagline, 7-slot member grid, Family Basecamp button |
| `MemberModal` | Add / edit member bottom sheet (name + photo upload) |
| `MemberAreaScreen` | Individual member hub: 3 personal plan tiles + Wellness Tracker button |
| `CommonAreaScreen` | Shared family hub: 3 common plan tiles + Memories button |
| `PlanScreen` | Reusable scrollable list for any plan type (add / delete entries) |
| `MemoriesScreen` | Full-screen Leaflet map with filter carousel and pin management |
| `AddPinModal` | Drop a new map pin (click map → fill label + month/year) |
| `AddCustomActivityModal` | Create a new custom map activity (name, emoji, gradient) |
| `App` | Root: owns all state, single `Promise.all` boot, navigation |

---

### `wellness-tracker.html`
Self-contained React mini-app for individual member wellness tracking (~57 KB). Navigated to from the Member Area screen; receives member context via `sessionStorage`.

**Session context:** `MEMBER_ID`, `MEMBER_NAME`, `MEMBER_AVATAR` — written by `App.jsx` before navigation.

**Supabase helpers:**
`sbLoadWellness`, `sbSaveActivity`, `sbSaveLevel`, `sbUpdateMemberAvatar`, `sbSaveCustomActs`, `sbLoadCustomActs`, `sbLoadHiddenActs`, `sbSaveHiddenActs`, `sbLoadCustomTips`, `sbSaveCustomTips`

**Data constants:**
- `ACTIVITIES` — 6 built-in habits (Eat Healthy, Walk, Swim, Cycle, Badminton, Read Book)
- `LEVELS` — Beginner / Intermediate / Advanced
- `FREQ_OPTIONS` — Daily / Weekdays / 3×/week / Weekly / Monthly
- `COLOR_THEMES` — 8 Tailwind colour themes (Violet, Green, Blue, Orange, Pink, Cyan, Amber, Rose)
- `ACTIVITY_ICONS` — 36 emoji options for custom activities
- `AVATAR_EMOJIS` — 25 emoji options for avatars

**Components:**
| Component | Purpose |
|---|---|
| `AddActivitySheet` | Bottom sheet to create a custom activity (name, category, tip, icon picker, colour picker). Rendered at App level to avoid `overflow: hidden` clipping |
| `AvatarSheet` | Bottom sheet for photo upload or emoji avatar selection |
| `HomeScreen` | Activity grid with filter tabs, profile row, level picker |
| `DetailScreen` | Activity detail: status, frequency, day streak, editable "Why it matters", remove/delete button |
| `App` | Root: single `Promise.all` boot load across 4 Supabase reads, all state, navigation |

---

### `style.css`
Global styles for the main app shell (~28 KB). Key sections:

- **CSS variables** — `--sab` safe area bottom, cream/forest colour tokens
- **Phone frame** — 390×844 px centred on desktop; full-screen on mobile
- **Screen system** — `.screen` / `.screen.active`, slide-in/fade animations
- **Welcome screen** — logo positioning, tagline, CTA area (padding accounts for logo height), member grid
- **Filter carousel** — `.filter-carousel`, webkit scrollbar hiding, active chip styles
- **Member grid** — avatar circles, filled/empty states
- **Modal** — bottom sheet overlay with slide-up animation
- **Common/Member area tiles** — gradient cards with press animation
- **Plan screen** — scrollable list, sticky input row
- **Memories screen** — Leaflet map container, pin bottom sheet
- **Toast** — slide-up notification with auto-dismiss
- **Utilities** — `.press`, `.press-light`, `.hidden`

---

### `supabase-config.js`
Creates the Supabase client and exposes it as `window.sb`. Falls back to hardcoded credentials if Vercel environment variables are not present (appropriate for a static CDN app with no server-side rendering):

```js
const SUPABASE_URL      = (typeof process !== 'undefined' && process.env.VITE_SUPABASE_URL) || 'https://YOUR_PROJECT.supabase.co';
const SUPABASE_ANON_KEY = (typeof process !== 'undefined' && process.env.VITE_SUPABASE_ANON_KEY) || 'eyJ...';
window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
```

> **Important:** The anon key must be the full JWT (~200+ characters). A truncated key causes 401 errors on all Supabase API calls.

---

### `setup.sql`
Complete database bootstrap. Run once in the Supabase SQL Editor. Creates:
- All 8 tables with constraints and indexes
- RLS enabled on every table
- `anon_all` permissive policy on every table
- `member-avatars` storage bucket
- Storage read/write/delete policies for the anon role

Safe to re-run — all statements use `IF NOT EXISTS` / `ON CONFLICT DO NOTHING`.

---

### `vercel.json`
Configures Vercel for zero-build static serving:
```json
{
  "buildCommand": null,
  "outputDirectory": ".",
  "framework": null,
  "cleanUrls": false,
  "headers": [ ... ]
}
```

- `cleanUrls: false` — preserves `.html` extensions so `wellness-tracker.html` and `index.html` hrefs work as written in code
- Custom headers ensure correct MIME types for `.jsx` (Babel), `.js`, `.css`, and `.svg` files

---

### `manifest.json`
PWA manifest. Key fields:

| Field | Value |
|---|---|
| `name` | AllUsBasecamp |
| `short_name` | Basecamp |
| `display` | `standalone` |
| `start_url` | `./index.html` |
| `background_color` | `#FDFBF7` (cream) |
| `theme_color` | `#1A531A` (forest green) |

---

### `logo.svg`
Vector logo — a cream letterform "P" with a dark navy swoosh tail. Two SVG paths: `fill-rule="evenodd"` creates the bowl counter-cutout on the P; the navy path sweeps from the bowl base outward to form the swoosh.

---

### `app.js`
The original vanilla JavaScript implementation (retained for reference). The React `App.jsx` is the active version. Both share `window.sb`.

---

## Screens & User Guide

### Main App (`index.html`)

#### 1. Welcome / Home Screen
- **Logo** in the bottom-left; **tagline** above it (tap to edit and save)
- **Member grid** — up to 7 avatar circles; empty slots show a `+` button
- **"Family Basecamp" button** — opens the shared family area

**Add a member:** Tap an empty `+` slot → enter name → optionally upload a photo → **Save Member**

**Edit a member:** Tap a filled avatar → same modal opens pre-filled

**Delete a member:** Open edit modal → tap **Remove Member** (red)

---

#### 2. Member Area Screen
- Hero header: member avatar + name
- **3 personal plan tiles:** 🥗 Plan Meals · 🏃 Exercise · 📖 Read Book
- **Wellness Tracker button** → navigates to `wellness-tracker.html` for this member

---

#### 3. Family Basecamp (Common Area) Screen
- **3 shared activity tiles:** ✈️ Plan Vacation · 🎉 Go to an Event · 🍽️ Dine Out
- **Memories button** → opens the interactive map

---

#### 4. Plan Screen
- Scrollable list of saved entries with date stamps
- Text input + **Add** (or Enter key) to create a new entry — optimistic insert
- **✕** on each entry to delete — optimistic remove, rolled back on error

---

#### 5. Memories Screen
Full-screen interactive Leaflet map:
- **Filter carousel** — swipeable chips (All, Vacation, Events, Dining Out, custom activities); fades out on the right edge; active chip is deep navy
- **Map pins** — custom SVG shapes: ✈️ teardrop · 🎉 star · 🍽️ pawn · custom → badge
- **Tap the map** → bottom sheet: enter label and month/year → pin is dropped
- **Tap a pin** → details popup with delete option
- **"+ Activity"** → create a custom activity type (name, emoji, gradient)

---

### Wellness Tracker (`wellness-tracker.html`)

Per-member. All data scoped to the member's UUID. Navigated to from the Member Area.

#### 1. Home Screen (Activity Grid)
- **Profile row** — avatar (tap → AvatarSheet), name, level badge (tap → Beginner / Intermediate / Advanced picker), XP progress bar
- **Filter tabs** — All / Ongoing / Not Planned
- **2-column activity grid** — each card shows icon, name, status badge, 🔥 streak
- **"Add New" tile** (dashed) → opens Add Activity Sheet

#### 2. Detail Screen
- **Hero card** — large icon, activity name, category
- **Status toggle** — ✅ Ongoing / ⏸ Not Planned
- **Frequency picker** — Daily / Weekdays / 3×/week / Weekly / Monthly
- **Day Streak** — M/W/D badge row; **🎯 Mission Accomplished** increments streak; **↺ Reset** clears it
- **Why it matters** — tap pencil icon → textarea → Save / Cancel (persisted to Supabase)
- **Remove button:**
  - Built-in activity → "✕ Remove from My List" (hidden per-member, other members unaffected)
  - Custom activity → "🗑 Delete Activity" (fully removed including wellness row)

#### 3. Add Activity Sheet
- Live preview tile updates in real time
- **Activity Name** (required) · **Category** · **Why it matters**
- **Icon picker** — 36 emoji
- **Colour theme** — 8 dot options (Violet, Green, Blue, Orange, Pink, Cyan, Amber, Rose)
- **＋ Create Activity** — saves definition to `wt_custom_acts_{id}` + initialises wellness row

#### 4. Avatar Sheet
- **📷 Upload Photo** — file picker → uploads to `members/{member_id}/avatar.{ext}` in Supabase Storage
- **Emoji grid** — 25 options; stores `emoji:🐱` as the `avatar_url`

---

## Quick Start

### Prerequisites
- A [Supabase](https://supabase.com) account (free tier is sufficient)
- A static web server or the Vercel CLI

---

### Step 1 — Create a Supabase project
1. Go to [supabase.com](https://supabase.com) → **New Project**
2. Copy your **Project URL** and **anon/public key** from **Settings → API**

---

### Step 2 — Set up the database
1. In Supabase → **SQL Editor**
2. Paste the entire contents of `setup.sql` → **Run**

---

### Step 3 — Configure credentials
Open `supabase-config.js` and paste your real values:
```js
'https://YOUR_PROJECT_ID.supabase.co'
'eyJ...your-full-anon-key...'   // must be the complete JWT, ~200+ characters
```

---

### Step 4 — Create the storage bucket (if not auto-created)
**Storage → New bucket** → Name: `member-avatars` → **Public bucket: ON**

---

### Step 5 — Run locally
```bash
# Python 3
python3 -m http.server 8080

# Node
npx serve .
```
Open `http://localhost:8080`

---

### Step 6 — Deploy to Vercel
1. Push to GitHub: `git add -A && git commit -m "deploy" && git push`
2. Go to [vercel.com/new](https://vercel.com/new) → **Import** your repo
3. Settings: Framework → **Other** · Build Command → *(blank)* · Output Directory → `.`
4. Click **Deploy**

Vercel auto-deploys on every push to `main`.

---

### Step 7 — Install as a PWA (optional)

**iOS Safari:** Share → **Add to Home Screen**

**Android Chrome:** ⋮ menu → **Add to Home Screen** (or tap the install banner)

---

### Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Spinner never stops | Wrong Supabase URL or key | Check `supabase-config.js`; open browser DevTools console |
| 401 errors on all API calls | Anon key is truncated | Copy the **full** JWT from Supabase → Settings → API |
| 404 on `supabase-config.js` | Server not serving from project root | Make sure your server/Vercel serves from `05_AllUsBasecamp/` |
| Photos not uploading | `member-avatars` bucket missing or private | Create bucket in Supabase Storage, enable **Public** |
| Map not loading | Leaflet CDN blocked | Check network; Leaflet loads from `unpkg.com` |
| `wellness-tracker.html` gives 404 on Vercel | `cleanUrls: true` was stripping `.html` | Ensure `vercel.json` has `"cleanUrls": false` |
| Custom activities not persisting | RLS policy missing on `allusbasecamp_settings` | Re-run `setup.sql` or add `anon_all` policy manually |
| Bottom sheet can't scroll | `position: fixed` inside transformed container | Sheet must be a direct child of `.phone-frame` with `position: absolute` |

---

## Notes

- **No authentication** — AllUsBasecamp is a trusted-device family app. The anon key grants full table access. Do not share the deployed URL publicly.
- **Offline support** — no Service Worker is included. All data requires a live Supabase connection.
- **Max members** — capped at 7, enforced by a `UNIQUE` index on `position` in the database and validated in the UI.
- **Per-member wellness customisation** — hidden activities, custom activity definitions, and tip overrides are all stored in the `allusbasecamp_settings` key-value table using namespaced keys. No schema changes needed to add per-member features.
