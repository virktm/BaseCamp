// Use the environment variables from Vercel/Process, 
// but fall back to the strings if they aren't found (for local testing)
const SUPABASE_URL = 
  (typeof process !== 'undefined' && process.env.VITE_SUPABASE_URL) || 
  'https://lzwfjubrvszucggtrqjg.supabase.co';

const SUPABASE_ANON_KEY = 
  (typeof process !== 'undefined' && process.env.VITE_SUPABASE_ANON_KEY) || 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6d2ZqdWJydnN6dWNnZ3RycWpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NzA5OTksImV4cCI6MjA4OTE0Njk5OX0.wOjqSv0ChSURalpewBtRbb3nr-kK1_hferip56-P4z8'; // your full key here

// Exposed as a global so app.js can reference it
window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);