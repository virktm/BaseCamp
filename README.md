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
| **Styling — Components** | Tailwind CSS Play CDN | Used for wellness tracker and filter carousels |
| **Fonts** | Google Fonts — Playfair Display + Inter | Serif for headings, sans-serif for UI |
| **Backend / Database** | Supabase (PostgreSQL) | Realtime-ready; used for data + file storage |
| **File Storage** | Supabase Storage | `member-avatars` public bucket for photos |
| **Maps** | Leaflet.js 1.9 | Interactive map with custom SVG pins |
| **PWA** | Web App Manifest + `<meta>` tags | Installable on iOS and Android home screens |

### Why no build step?

AllUsBasecamp is intentionally **zero-toolchain**. Every file is plain HTML/JSX/CSS served directly from a static host (or even opened from the file system). There is no `npm install`, no bundler, no deployment pipeline. This makes it trivially portable and easy for non-engineers to fork and run.

---

## Architecture

```
Browser
  │
  ├── index.html          ← App shell + React mount point
  │     ├── style.css     ← Global styles, screen transitions, layout
  │     ├── supabase-config.js  ← Supabase client (window.sb)
  │     └── App.jsx       ← Full React SPA (compiled in-browser by Babel)
  │
  └── wellness-tracker.html  ← Self-contained React mini-app for member wellness
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
- **`window.sb`** — the Supabase client is created once in `supabase-config.js` and exposed globally so both `App.jsx` (React) and the older `app.js` (vanilla JS) can share it without ES module imports.
- **Single round-trip boot** — both the main app and the wellness tracker use `Promise.all` to load all required data in one network round-trip before first render.
- **Optimistic UI** — plan additions and activity updates appear immediately in the DOM; if the Supabase call fails, the change is rolled back and a toast is shown.

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
├── App.jsx                 ← React SPA (all screens except wellness)
├── app.js                  ← Legacy vanilla-JS layer (retained for reference)
├── style.css               ← Global styles for the main app shell
│
├── wellness-tracker.html   ← Self-contained wellness tracker mini-app
│
├── supabase-config.js      ← Supabase URL + anon key → window.sb
├── setup.sql               ← Full database schema + RLS policies
├── manifest.json           ← PWA manifest (name, icons, display mode)
│
├── logo.svg                ← SVG logo (cream P + navy swoosh)
├── icon-192.png            ← PWA icon (192×192)
├── icon-512.png            ← PWA icon (512×512, maskable)
│
└── AllUsBasecamp.md        ← Design notes / internal documentation
```

---

## Database Structure

All tables live in a single Supabase project. Row Level Security (RLS) is enabled on every table with an `anon_all` policy — meaning the anonymous key has full read/write access. This is appropriate for a private family app with no public URL.

Run `setup.sql` once in the Supabase SQL Editor to create everything.

### Tables

#### `allusbasecamp_settings`
Generic key-value store for app-wide and per-member configuration.

| Column | Type | Description |
|---|---|---|
| `key` | TEXT (PK) | Unique key, e.g. `tagline`, `wt_custom_acts_{member_id}` |
| `value` | TEXT | JSON string or plain text |
| `updated_at` | TIMESTAMPTZ | Last write timestamp |

**Keys in use:**

| Key | Content |
|---|---|
| `tagline` | Welcome screen tagline text |
| `wt_custom_acts_{member_id}` | JSON array of custom wellness activity definitions |
| `wt_hidden_acts_{member_id}` | JSON array of built-in activity IDs removed by this member |
| `wt_tips_{member_id}` | JSON object `{ activity_id: "tip text" }` for custom tip overrides |

---

#### `allusbasecamp_members`
Up to 7 family members, each occupying a numbered slot (0–6).

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Auto-generated |
| `name` | TEXT | Member's display name |
| `avatar_url` | TEXT | Public URL from Supabase Storage, or `emoji:🐱` prefix for emoji avatars |
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
Family-shared custom activity types shown on the map (e.g. "Board Game Night").

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Auto-generated |
| `name` | TEXT | Display name |
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
| `type` | TEXT | Activity type — `vacation`, `event`, `dine`, or a custom activity UUID |
| `lat` / `lng` | DOUBLE PRECISION | Geographic coordinates |
| `label` | TEXT | Place name or description |
| `month_year` | TEXT | `YYYY-MM` string displayed on the pin (e.g. `2026-03`) |
| `created_at` | TIMESTAMPTZ | Row creation time |

---

### Storage Bucket: `member-avatars`

Public bucket. Files are stored under two path conventions:

| Path | Used by |
|---|---|
| `slot-{0-6}/avatar.{ext}` | Main app member grid (by slot position) |
| `members/{member_id}/avatar.{ext}` | Wellness tracker (by member UUID) |

---

## File Guide

### `index.html`
The single HTML entry point for the main app. Loads scripts in order:
1. Supabase JS v2 (CDN)
2. `supabase-config.js` (creates `window.sb`)
3. React 18 + ReactDOM (CDN)
4. Babel Standalone (CDN)
5. Leaflet.js (CDN)
6. `App.jsx` (compiled in-browser)

Also includes the Tailwind Play CDN with a `cream` colour token extension, and links to Google Fonts and Leaflet CSS.

---

### `App.jsx`
The main React Single Page App (~74 KB). Contains all screens for the primary app experience.

**Key sections:**

- **Constants** — `ACTIVITY_META`, `COMMON_TILES`, `MEMBER_TILES`, `PRESET_EMOJIS`, `PRESET_GRADIENTS`
- **Supabase helpers** — pure async functions: `sbLoadTagline`, `sbSaveTagline`, `sbLoadMembers`, `sbSaveMember`, `sbDeleteMember`, `sbLoadPlans`, `sbAddPlan`, `sbDeletePlan`, `sbLoadMapPins`, `sbSaveMapPin`, `sbDeleteMapPin`, `sbLoadCustomActivities`, `sbSaveCustomActivity`, `sbDeleteCustomActivity`
- **Components:**
  - `Toast` — auto-dismissing notification
  - `AvatarSlot` — renders member avatar (photo URL, `emoji:` prefix, or initial letter)
  - `LoadingScreen` — spinner shown during initial data fetch
  - `WelcomeScreen` — home screen with tagline, member grid, "Family Basecamp" button
  - `MemberModal` — add/edit member bottom sheet (name + photo upload)
  - `MemberAreaScreen` — individual member hub with 3 personal plan tiles
  - `CommonAreaScreen` — shared family hub with 3 common plan tiles + Memories button
  - `PlanScreen` — reusable list screen for any plan type (add/delete entries)
  - `MemoriesScreen` — full-screen Leaflet map + filter carousel + pin management
  - `AddPinModal` — modal to drop a new pin (click map → fill label + month)
  - `AddCustomActivityModal` — create a new custom map activity (name, emoji, gradient)
  - `App` — root component, owns all global state and navigation

---

### `wellness-tracker.html`
A self-contained React mini-app for individual member wellness tracking. Opened from the Member Area screen; receives member context via `sessionStorage`.

**Key sections:**

- **Session context** — `MEMBER_ID`, `MEMBER_NAME`, `MEMBER_AVATAR` read from `sessionStorage`
- **Supabase helpers** — `sbLoadWellness`, `sbSaveActivity`, `sbSaveLevel`, `sbUpdateMemberAvatar`, `sbSaveCustomActs`, `sbLoadCustomActs`, `sbLoadHiddenActs`, `sbSaveHiddenActs`, `sbLoadCustomTips`, `sbSaveCustomTips`
- **Data constants** — `ACTIVITIES` (6 built-in), `LEVELS`, `FREQ_OPTIONS`, `COLOR_THEMES` (8), `ACTIVITY_ICONS` (36 emoji), `AVATAR_EMOJIS` (25 emoji)
- **SVG icon components** — `IconSalad`, `IconWalk`, `IconWaves`, `IconBike`, `IconBadminton`, `IconBook`, `IconPlus`, nav icons
- **Components:**
  - `AddActivitySheet` — full-screen bottom sheet to create a custom activity (name, category, tip, icon, colour)
  - `AvatarSheet` — bottom sheet for photo upload or emoji avatar selection
  - `HomeScreen` — activity grid with tabs (All / Ongoing / Not Planned), profile row, level picker
  - `DetailScreen` — activity detail with status toggle, frequency picker, day streak, editable "Why it matters", remove button
  - `App` — root component; single `Promise.all` boot load for wellness data, custom acts, hidden acts, and custom tips

---

### `style.css`
Global styles for the main app shell (~28 KB). Organised into sections:

- **CSS variables** — `--sab` (safe area bottom), colour tokens
- **Phone frame** — centred 390×844 px frame on desktop; full-screen on mobile
- **Screen system** — `.screen`, `.screen.active`, slide-in/fade animations
- **Welcome screen** — logo, tagline, CTA area, member grid
- **Member grid** — avatar circles, filled/empty states
- **Member modal** — bottom sheet overlay
- **Common/Member area tiles** — gradient cards
- **Plan screen** — scrollable list, input row
- **Memories screen** — Leaflet map container, filter carousel, pin bottom sheet
- **Toast** — slide-up notification
- **Utilities** — `.press`, `.press-light`, `.hidden`

---

### `supabase-config.js`
Two lines of configuration:
```js
const SUPABASE_URL      = 'https://...supabase.co';
const SUPABASE_ANON_KEY = 'eyJ...';
window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
```
Replace these values with your own project credentials before deploying.

---

### `setup.sql`
Complete database bootstrap script. Run once in the Supabase SQL Editor. Creates:
- All 8 tables with constraints and indexes
- RLS enabled on every table
- `anon_all` permissive policy on every table
- `member-avatars` storage bucket
- Storage read/write policies for the anon role

Safe to re-run — all statements use `IF NOT EXISTS` / `ON CONFLICT DO NOTHING`.

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
Vector logo — a cream letterform "P" with a dark navy swoosh tail. Built from two SVG paths using `fill-rule="evenodd"` for the bowl counter-cutout.

---

### `app.js`
The original vanilla JavaScript implementation of the app logic (retained for reference). The React `App.jsx` is the active version. Both share the `window.sb` Supabase client.

---

## Screens & User Guide

### Main App (`index.html`)

#### 1. Welcome / Home Screen
The first screen after loading. Shows:
- **Logo** and **tagline** (tap the tagline to edit and save it)
- **Member grid** — up to 7 avatar circles; empty slots show a `+` button
- **"Family Basecamp" button** — opens the shared family area

**To add a member:** Tap an empty `+` slot → fill in a name → optionally upload a photo → tap **Save Member**.

**To edit a member:** Tap an existing avatar → the same modal opens pre-filled.

**To delete a member:** Open the edit modal → tap **Remove Member** (red button).

---

#### 2. Member Area Screen
Opened by tapping a filled member avatar. Shows:
- Member's name and avatar as a hero header
- **3 personal plan tiles:**
  - 🥗 Plan Meals
  - 🏃 Exercise
  - 📖 Read Book
- **"Wellness Tracker" button** — navigates to `wellness-tracker.html` for this member
- **Back** button returns to the Welcome screen

---

#### 3. Family Basecamp (Common Area) Screen
Shared space for the whole family. Shows:
- **3 shared activity tiles:**
  - ✈️ Plan Vacation
  - 🎉 Go to an Event
  - 🍽️ Dine Out
- **"Memories" button** — opens the interactive map
- **Back** button returns to the Welcome screen

---

#### 4. Plan Screen
A reusable list screen, opened from any activity tile (common or personal). Shows:
- The activity icon and title in the header
- Scrollable list of saved entries with date stamps
- Text input + **Add** button to create a new entry (also triggered by Enter key)
- **✕** button on each entry to delete it (optimistic — removed immediately, rolled back on error)

---

#### 5. Memories Screen
Full-screen interactive Leaflet map. Features:
- **Filter carousel** — horizontal swipeable chips (`All`, `Vacation`, `Events`, `Dining Out`, plus any custom activities). Active chip is highlighted in deep navy.
- **Map pins** — custom SVG shapes per activity type:
  - ✈️ Vacation → teardrop pin
  - 🎉 Event → star pin
  - 🍽️ Dining → pawn pin
  - Custom → badge pin
- **Tap the map** to drop a new pin; a bottom sheet asks for a label and month/year.
- **Tap a pin** to see its details and a delete option.
- **"+ Activity" button** — create a new custom activity type (name, emoji, gradient colour).
- **"+ Add Spot" button** — shortcut to pin-drop mode.

---

### Wellness Tracker (`wellness-tracker.html`)

Navigated to from a member's personal area. Fully per-member — all data is scoped to the member's UUID.

#### 1. Home Screen (Activity Grid)
- **Profile row** — avatar (tap to change), name, experience level badge (tap to change: Beginner / Intermediate / Advanced), XP progress bar
- **Filter tabs** — All / Ongoing / Not Planned
- **Activity grid** — 2-column card grid showing all activities with status badge and 🔥 streak count
- **"Add New" tile** — opens the Add Activity sheet

#### 2. Detail Screen
Opened by tapping any activity tile. Shows:
- **Hero card** with large icon and activity name
- **Status toggle** — Ongoing / Not Planned
- **Frequency picker** — Daily / Weekdays / 3×/week / Weekly / Monthly
- **Day Streak** — current streak with M (month) / W (week) / D (day) badge visualisation; **"Mission Accomplished!"** button increments the streak; **↺ Reset** clears it
- **Why it matters** — editable motivational tip; tap the pencil icon to edit, then Save or Cancel
- **Remove button** — "✕ Remove from My List" (built-in activities) or "🗑 Delete Activity" (custom activities)

#### 3. Add Activity Sheet
Bottom sheet opened by the "Add New" tile:
- **Live preview tile** updates in real time as you type
- **Activity Name** (required)
- **Category** (subtitle text)
- **Why it matters** (motivational tip)
- **Icon picker** — 36 emoji options
- **Colour theme** — 8 colour dot options (Violet, Green, Blue, Orange, Pink, Cyan, Amber, Rose)
- **"＋ Create Activity"** button saves and closes

#### 4. Avatar Sheet
Bottom sheet opened by tapping the avatar on the Home screen:
- **📷 Upload Photo** — opens the device photo picker; uploads to Supabase Storage
- **Emoji grid** — 25 emoji options; selecting one saves `emoji:🐱` as the avatar URL

---

## Quick Start

### Prerequisites

- A [Supabase](https://supabase.com) account (free tier is sufficient)
- Any static web server or browser that can serve local files

---

### Step 1 — Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → **New Project**
2. Note your **Project URL** and **anon/public key** from **Settings → API**

---

### Step 2 — Set up the database

1. In Supabase, open **SQL Editor**
2. Paste the entire contents of `setup.sql` and click **Run**
3. All tables, indexes, RLS policies, and the storage bucket will be created

---

### Step 3 — Configure Supabase credentials

Open `supabase-config.js` and replace the placeholder values:

```js
const SUPABASE_URL      = 'https://YOUR_PROJECT_ID.supabase.co';
const SUPABASE_ANON_KEY = 'eyJ...your-anon-key...';
```

---

### Step 4 — Create the storage bucket (if not auto-created by SQL)

1. In Supabase → **Storage** → **New bucket**
2. Name: `member-avatars`
3. Toggle **Public bucket** to ON

---

### Step 5 — Serve the app

**Option A — Local (simplest):**
```bash
# Python 3
cd 05_AllUsBasecamp
python3 -m http.server 8080
# Open http://localhost:8080
```

```bash
# Node (if you have npx)
npx serve .
```

**Option B — VS Code:**
Install the **Live Server** extension → right-click `index.html` → **Open with Live Server**

**Option C — Deploy to Netlify / Vercel / GitHub Pages:**
Drag the project folder into [Netlify Drop](https://app.netlify.com/drop) — no configuration needed.

---

### Step 6 — Install as a PWA (optional)

**iOS Safari:**
1. Open the app URL in Safari
2. Tap the **Share** button → **Add to Home Screen**
3. Tap **Add** — the app icon appears on your home screen

**Android Chrome:**
1. Open the app URL in Chrome
2. Tap the **⋮ menu** → **Add to Home Screen** (or look for the install banner)

---

### Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Spinner never stops | Wrong Supabase URL or key | Check `supabase-config.js`; open browser console for the error |
| "Configure Supabase" message on load | Placeholder credentials detected | Replace `YOUR_PROJECT_ID` / `YOUR_ANON` in `supabase-config.js` |
| Photos not uploading | Storage bucket missing or private | Ensure `member-avatars` bucket exists and is set to **Public** |
| Map not loading | Leaflet CDN blocked | Check network; Leaflet is loaded from `unpkg.com` |
| iOS keyboard pushes layout | Safe-area meta missing | Ensure `viewport-fit=cover` is in the `<meta name="viewport">` tag |
| Custom activities not saving across sessions | RLS policy missing on `allusbasecamp_settings` | Re-run `setup.sql` or manually add `anon_all` policy |

---

## Notes

- **No authentication** — AllUsBasecamp is designed as a trusted-device family app. The anon key grants full table access. Do not share the deployed URL publicly.
- **Offline support** — the app does not currently include a Service Worker for offline caching. All data requires a network connection to Supabase.
- **Max members** — capped at 7 (one per avatar slot). This is enforced at the UI level and by a `UNIQUE` index on `position` in the database.
