-- ════════════════════════════════════════════════════════════════
-- AllUsBasecamp — Supabase Setup
-- Run this entire file in: Supabase Dashboard → SQL Editor → Run
-- ════════════════════════════════════════════════════════════════


-- ── 1. Settings (tagline and app-wide key/value pairs) ─────────
CREATE TABLE IF NOT EXISTS allusbasecamp_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed the default tagline (safe to re-run)
INSERT INTO allusbasecamp_settings (key, value)
VALUES ('tagline', 'Together we make unforgettable memories')
ON CONFLICT (key) DO NOTHING;


-- ── 2. Members (max 7, one per position slot 0–6) ──────────────
CREATE TABLE IF NOT EXISTS allusbasecamp_members (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  name       TEXT        NOT NULL,
  avatar_url TEXT,
  email      TEXT,
  position   INT         NOT NULL CHECK (position >= 0 AND position <= 6),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add email column to existing installs (safe to run on new installs too)
ALTER TABLE allusbasecamp_members ADD COLUMN IF NOT EXISTS email TEXT;

-- Enforce one member per slot at the database level
CREATE UNIQUE INDEX IF NOT EXISTS idx_allusbasecamp_members_position
  ON allusbasecamp_members (position);


-- ── 3. Common / family plans ───────────────────────────────────
CREATE TABLE IF NOT EXISTS allusbasecamp_common_plans (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  type       TEXT        NOT NULL
               CHECK (type IN ('vacation', 'event', 'dine')),
  content    TEXT        NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);


-- ── 4. Personal / per-member plans ────────────────────────────
CREATE TABLE IF NOT EXISTS allusbasecamp_personal_plans (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id  UUID        NOT NULL
               REFERENCES allusbasecamp_members(id) ON DELETE CASCADE,
  type       TEXT        NOT NULL
               CHECK (type IN ('meals', 'exercise', 'book')),
  content    TEXT        NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);


-- ── 5. Wellness tracker — per-member activity data ────────────
CREATE TABLE IF NOT EXISTS allusbasecamp_wellness (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id   UUID        NOT NULL
                REFERENCES allusbasecamp_members(id) ON DELETE CASCADE,
  activity_id TEXT        NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'notplanned'
                CHECK (status IN ('ongoing', 'notplanned')),
  freq        TEXT        NOT NULL DEFAULT 'Daily',
  streak      INT         NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (member_id, activity_id)
);

-- ── 6. Wellness tracker — per-member level ──────────────────────
CREATE TABLE IF NOT EXISTS allusbasecamp_wellness_level (
  member_id   UUID        PRIMARY KEY
                REFERENCES allusbasecamp_members(id) ON DELETE CASCADE,
  level_idx   INT         NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ DEFAULT now()
);


-- ── 7. Custom activities created by the family ─────────────────
CREATE TABLE IF NOT EXISTS allusbasecamp_custom_activities (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  name       TEXT        NOT NULL,
  emoji      TEXT        NOT NULL DEFAULT '✨',
  gradient   TEXT        NOT NULL DEFAULT 'linear-gradient(135deg,#7c3aed,#a855f7)',
  pin_color  TEXT        NOT NULL DEFAULT '#6366f1',
  created_at TIMESTAMPTZ DEFAULT now()
);


-- ── 8. Map pins — family activity locations with date labels ───
CREATE TABLE IF NOT EXISTS allusbasecamp_map_pins (
  id         UUID             DEFAULT gen_random_uuid() PRIMARY KEY,
  type       TEXT             NOT NULL
               CHECK (type IN ('vacation', 'event', 'dine')),
  lat        DOUBLE PRECISION NOT NULL,
  lng        DOUBLE PRECISION NOT NULL,
  label      TEXT             NOT NULL DEFAULT '',
  month_year TEXT             NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ      DEFAULT now()
);


-- ── 8. Row Level Security (anon access — family app) ───────────
ALTER TABLE allusbasecamp_settings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE allusbasecamp_members           ENABLE ROW LEVEL SECURITY;
ALTER TABLE allusbasecamp_common_plans      ENABLE ROW LEVEL SECURITY;
ALTER TABLE allusbasecamp_personal_plans    ENABLE ROW LEVEL SECURITY;
ALTER TABLE allusbasecamp_wellness          ENABLE ROW LEVEL SECURITY;
ALTER TABLE allusbasecamp_wellness_level    ENABLE ROW LEVEL SECURITY;
ALTER TABLE allusbasecamp_custom_activities  ENABLE ROW LEVEL SECURITY;
ALTER TABLE allusbasecamp_map_pins          ENABLE ROW LEVEL SECURITY;

-- Allow custom activity UUIDs as the type value
ALTER TABLE allusbasecamp_map_pins
  DROP CONSTRAINT IF EXISTS allusbasecamp_map_pins_type_check;

-- Allow anon key full access (PIN protection is handled in-app)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'allusbasecamp_settings'         AND policyname = 'anon_all') THEN
    CREATE POLICY anon_all ON allusbasecamp_settings         FOR ALL TO anon USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'allusbasecamp_members'           AND policyname = 'anon_all') THEN
    CREATE POLICY anon_all ON allusbasecamp_members          FOR ALL TO anon USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'allusbasecamp_common_plans'      AND policyname = 'anon_all') THEN
    CREATE POLICY anon_all ON allusbasecamp_common_plans     FOR ALL TO anon USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'allusbasecamp_personal_plans'    AND policyname = 'anon_all') THEN
    CREATE POLICY anon_all ON allusbasecamp_personal_plans   FOR ALL TO anon USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'allusbasecamp_wellness'          AND policyname = 'anon_all') THEN
    CREATE POLICY anon_all ON allusbasecamp_wellness         FOR ALL TO anon USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'allusbasecamp_wellness_level'    AND policyname = 'anon_all') THEN
    CREATE POLICY anon_all ON allusbasecamp_wellness_level   FOR ALL TO anon USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'allusbasecamp_custom_activities' AND policyname = 'anon_all') THEN
    CREATE POLICY anon_all ON allusbasecamp_custom_activities FOR ALL TO anon USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'allusbasecamp_map_pins'          AND policyname = 'anon_all') THEN
    CREATE POLICY anon_all ON allusbasecamp_map_pins         FOR ALL TO anon USING (true) WITH CHECK (true); END IF;
END;
$$;


-- ── 6. Storage bucket ──────────────────────────────────────────
-- Option A: Run via SQL (may need superuser)
INSERT INTO storage.buckets (id, name, public)
VALUES ('member-avatars', 'member-avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Option B (recommended): Go to Storage → New Bucket →
--   Name: member-avatars  |  Public bucket: ON

-- Storage access policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects' AND policyname = 'avatar_public_read'
  ) THEN
    CREATE POLICY avatar_public_read ON storage.objects
      FOR SELECT USING (bucket_id = 'member-avatars');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects' AND policyname = 'avatar_anon_write'
  ) THEN
    CREATE POLICY avatar_anon_write ON storage.objects
      FOR INSERT TO anon WITH CHECK (bucket_id = 'member-avatars');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects' AND policyname = 'avatar_anon_update'
  ) THEN
    CREATE POLICY avatar_anon_update ON storage.objects
      FOR UPDATE TO anon USING (bucket_id = 'member-avatars');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects' AND policyname = 'avatar_anon_delete'
  ) THEN
    CREATE POLICY avatar_anon_delete ON storage.objects
      FOR DELETE TO anon USING (bucket_id = 'member-avatars');
  END IF;
END;
$$;
