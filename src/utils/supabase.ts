import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

/** true si hay credenciales con pinta de válidas (habilita el intento de conexión). */
export const hasSupabaseConfig =
  /^https?:\/\/.+\.supabase\.(co|in)/.test(supabaseUrl) && supabaseAnonKey.length > 20;

// El cliente se crea siempre (con placeholders si hace falta) para que los imports
// no rompan; db.ts decide en runtime si realmente se usa.
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
);
