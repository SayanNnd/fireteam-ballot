import { createClient } from '@supabase/supabase-js';

function sanitizeSupabaseUrl(rawUrl: string): string {
  let url = rawUrl.trim();
  // Strip trailing /rest/v1 or /rest/v1/
  url = url.replace(/\/rest\/v1\/?$/, '');
  // Strip trailing slashes
  url = url.replace(/\/+$/, '');
  return url;
}

const rawUrl = import.meta.env.VITE_SUPABASE_URL || '';
export const supabaseUrl = sanitizeSupabaseUrl(rawUrl);
export const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

export const isSupabaseConfigured = Boolean(
  supabaseUrl && 
  supabaseAnonKey && 
  supabaseUrl.startsWith('https://') &&
  !supabaseUrl.includes('your-project-ref')
);

// Supabase client configuration
// Disable auth session persistence and locks since Fireteam Ballot is an ephemeral anonymous app
export const supabase = createClient(
  isSupabaseConfigured ? supabaseUrl : 'https://placeholder.supabase.co',
  isSupabaseConfigured ? supabaseAnonKey : 'placeholder-key',
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    realtime: {
      params: {
        eventsPerSecond: 20,
      },
    },
  }
);
