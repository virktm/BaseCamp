# AllUsBasecamp — Family Hub PWA

Mobile-first single-page PWA. Warm cream & forest-green aesthetic.
Fits any phone screen. Runs offline-ready. Backed by Supabase.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Markup | HTML5 |
| Style | Tailwind CSS CDN + custom `style.css` |
| Logic | Vanilla JS + React 18 (Babel standalone, no bundler) |
| Data | Supabase (Postgres + Storage) |
| PWA | `manifest.json` + `viewport-fit=cover` |

---

## Files

| File | Purpose |
|------|---------|
| `index.html` | AllUsBasecamp home — all 5 screens + modal in one file |
| `style.css` | `100dvh`, safe-area insets, transitions, components |
| `App.jsx` | All Supabase calls, navigation, render functions |
| `supabase-config.js` | **Edit this** — paste your URL + anon key |
| `setup.sql` | Run once in Supabase SQL Editor to create all tables |
| `manifest.json` | PWA install manifest |
| `wellness-tracker.html` | Per-member wellness/habit tracker screen |

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

---

## Supabase Tables

All tables are prefixed `allusbasecamp_` as required.

### `allusbasecamp_settings`
| Column | Type | Notes |
|--------|------|-------|
| key | TEXT PK | `'tagline'` stores the editable headline |
| value | TEXT | The setting value |
| updated_at | TIMESTAMPTZ | Auto-set |

### `allusbasecamp_members`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | Auto-generated |
| name | TEXT | Display name |
| avatar_url | TEXT | Public URL from Storage |
| position | INT | 0–6 (slot in grid), UNIQUE |
| created_at | TIMESTAMPTZ | Auto-set |

### `allusbasecamp_common_plans`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | Auto-generated |
| type | TEXT | `vacation` \| `event` \| `dine` |
| content | TEXT | Plan entry text |
| created_at | TIMESTAMPTZ | Auto-set |

### `allusbasecamp_personal_plans`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | Auto-generated |
| member_id | UUID FK | → `allusbasecamp_members.id` (CASCADE delete) |
| type | TEXT | `meals` \| `exercise` \| `book` |
| content | TEXT | Plan entry text |
| created_at | TIMESTAMPTZ | Auto-set |

### `allusbasecamp_wellness`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | Auto-generated |
| member_id | UUID FK | → `allusbasecamp_members.id` (CASCADE delete) |
| activity_id | TEXT | `healthy` \| `walk` \| `swim` \| `cycle` \| `badminton` \| `read` |
| status | TEXT | `ongoing` \| `notplanned` |
| freq | TEXT | `Daily` \| `Weekdays` \| `3×/week` \| `Weekly` \| `Monthly` |
| streak | INT | Day streak count (0 = reset) |
| updated_at | TIMESTAMPTZ | Auto-set on every save |
| *(unique)* | | `(member_id, activity_id)` — one row per member per habit |

### `allusbasecamp_wellness_level`
| Column | Type | Notes |
|--------|------|-------|
| member_id | UUID PK | → `allusbasecamp_members.id` (CASCADE delete) |
| level_idx | INT | `0` = Beginner, `1` = Intermediate, `2` = Advanced |
| updated_at | TIMESTAMPTZ | Auto-set |

---

## Supabase Storage

- **Bucket:** `member-avatars` (public)
- **Path pattern:** `slot-{0–6}/avatar.{ext}`
- Upload uses `upsert: true` — new photo overwrites old for same slot
- Cache-buster appended to URL after upload (`?t=timestamp`)
- Deleting a member removes all `slot-{n}/avatar.*` paths

---

## Navigation Flow

```
index.html (AllUsBasecamp Home)
  │
  ├── Tap empty avatar slot  →  Add Member modal
  ├── Tap filled avatar slot →  wellness-tracker.html?  (sessionStorage: wt_member_id, wt_name, wt_avatar)
  └── Family Basecamp button →  Common Area screen
        └── Select tile + Continue  →  Plan screen
```

---

## Screens — index.html

### Welcome Screen (`screen-welcome`)
- **Editable tagline** — tap to edit inline; saves to `allusbasecamp_settings`
- **7 circular avatar slots** — tap empty = add modal; tap filled = opens Wellness Tracker
- **Family Basecamp button** — opens Common Area

### Common Area (`screen-common`)
Three tiles → each opens the Plan screen for that type:
- ✈️ Plan Vacation → `type = 'vacation'`
- 🎉 Go to an Event → `type = 'event'`
- 🍽️ Dine Out → `type = 'dine'`

### Plan Screen (`screen-plan`)
- Scrollable list of plan entries from Supabase
- Add entry (optimistic insert, rolls back on error)
- Delete per entry (immediate DOM remove, then Supabase delete)

### Add/Edit Member Modal
- Bottom sheet with slide-up animation
- Photo picker → uploads to `member-avatars` bucket
- Name input (max 20 chars)
- Edit mode shows **Remove Member** button

---

## Wellness Tracker (`wellness-tracker.html`)

Standalone screen opened when a family member avatar is tapped.
Member identity is passed via `sessionStorage` (no URL params).

### Data flow
1. `App.jsx` writes `wt_member_id`, `wt_name`, `wt_avatar` to `sessionStorage`
2. Browser navigates to `wellness-tracker.html`
3. On load, fetches `allusbasecamp_wellness` + `allusbasecamp_wellness_level` for that member
4. Every change (status, frequency, streak, level) is upserted to Supabase in real time
5. All family members viewing the same member's tracker see live-updated data

### Habits tracked
| ID | Label | Default status |
|----|-------|---------------|
| `healthy` | Eat Healthy | Ongoing |
| `walk` | Go for a Walk | Not Planned |
| `swim` | Swim | Not Planned |
| `cycle` | Cycle | Ongoing |
| `badminton` | Badminton | Not Planned |
| `read` | Read Book | Not Planned |

### Features per habit (detail screen)
- **Status toggle** — Ongoing / Not Planned (saved to Supabase)
- **Frequency picker** — Daily, Weekdays, 3×/week, Weekly, Monthly
- **Day Streak** — shows count + badge row (D / W / M)
- **🎯 Mission Accomplished** button — increments streak by 1
- **↺ Reset** — resets streak to 0 (visible only when streak > 0)

### Streak badge logic
| Streak | Display |
|--------|---------|
| 1–6 | `D D D …` gray pills |
| 7 | `W` violet pill |
| 8–13 | `W D …` |
| 14 | `W W` |
| 30 | `M` rose pill |
| 31+ | `M` + remaining W/D |

### Level selector
Tappable badge on the profile row — cycles through:
- **Beginner** (violet) — 40% progress bar
- **Intermediate** (amber) — 65% progress bar
- **Advanced** (rose) — 100% progress bar

Saved to `allusbasecamp_wellness_level` per member.

---

## Design Tokens

```css
--cream:        #FDFBF7   /* page background */
--cream-dark:   #F0EBE1   /* input backgrounds */
--cream-border: #E4D9C8   /* subtle borders */
--forest:       #1A531A   /* primary text & buttons */
--forest-light: #2D7A2D   /* back buttons */
```

Wellness tracker palette: violet primary, pastel tile backgrounds per habit.

---

## Mobile-First Technical Notes

| Feature | Implementation |
|---------|---------------|
| Viewport height | `height: 100dvh` — shrinks when browser chrome appears |
| Notch / home bar | `env(safe-area-inset-*)` CSS variables on every screen |
| Full-screen PWA | `viewport-fit=cover` + `apple-mobile-web-app-capable` |
| No iOS input zoom | `font-size: max(16px, ...)` on all inputs |
| No rubber-band | `overscroll-behavior: none` |
| Touch targets | `min-height: 44–52px` on all interactive elements |
| Scrollbar hidden | `scrollbar-width: none` + `::-webkit-scrollbar { display: none }` |
| Desktop preview | Phone frame (390×844 px) centered on dark backdrop via CSS `transform` |
