import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Variables VITE_SUPABASE_URL et VITE_SUPABASE_PUBLISHABLE_KEY manquantes dans .env.local');
}

export const supabase = createClient(supabaseUrl, supabaseKey);