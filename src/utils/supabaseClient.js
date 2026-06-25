import { createClient } from '@supabase/supabase-js';

// Values are injected at build time via VITE_ environment variables.
// Locally:  set them in .env.local (never commit that file).
// On Render: set them in the Render dashboard → Environment tab.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Missing Supabase environment variables.\n' +
    'Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env.local file.'
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
