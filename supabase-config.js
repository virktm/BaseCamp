// ─────────────────────────────────────────────────────────────────
// AllUsBasecamp — Supabase Configuration
//
// Setup steps:
//   1. Go to https://supabase.com → create a new project
//   2. Project Settings → API → copy Project URL + anon/public key
//   3. Paste them below
//   4. Run setup.sql in the Supabase SQL Editor
//   5. In Storage → create a bucket named "member-avatars" → make it Public
// ─────────────────────────────────────────────────────────────────

const SUPABASE_URL      = 'https://lzwfjubrvszucggtrqjg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6d2ZqdWJydnN6dWNnZ3RycWpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NzA5OTksImV4cCI6MjA4OTE0Njk5OX0.wOjqSv0ChSURalpewBtRbb3nr-kK1_hferip56-P4z8';

// Exposed as a global so app.js can reference it without ES module imports
window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
