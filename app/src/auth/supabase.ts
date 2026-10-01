import { createClient } from '@supabase/supabase-js';

// This is Supabase's browser-safe publishable key, never a service-role key.
const SUPABASE_URL = 'https://qchbcokqfsclivvchquj.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_pejVtkb2GZlifbS1FGr_5g_Qbb4d2jg';

export const GUEST_STORAGE_KEY = 'shosholoza_guest';
export const AUTH_DESTINATION = '/home';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export function authReturnUrl() {
  // The deployed root is already registered in Supabase's redirect allow-list.
  // AuthStart detects the returned session and continues to AUTH_DESTINATION.
  return `${window.location.origin}/`;
}

