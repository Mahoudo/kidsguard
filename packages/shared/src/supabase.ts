import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Creates a Supabase client. Pass a platform storage adapter (e.g.
 * AsyncStorage on RN) so the session persists across app restarts.
 */
export function createKidsguardClient(opts: {
  url: string;
  anonKey: string;
  storage?: unknown;
}): SupabaseClient {
  return createClient(opts.url, opts.anonKey, {
    auth: {
      // @ts-expect-error RN storage adapter is structurally compatible
      storage: opts.storage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
}
