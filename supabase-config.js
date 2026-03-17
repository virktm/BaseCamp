// Use the environment variables from Vercel/Process, 
// but fall back to the strings if they aren't found (for local testing)
const SUPABASE_URL = 
  (typeof process !== 'undefined' && process.env.VITE_SUPABASE_URL) || 
  'https://lzwfjubrvszucggtrqjg.supabase.co';

const SUPABASE_ANON_KEY = 
  (typeof process !== 'undefined' && process.env.VITE_SUPABASE_ANON_KEY) || 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'; // your full key here

// Exposed as a global so app.js can reference it
window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);