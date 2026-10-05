import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabasePublicConfig } from "../config";

/**
 * Service-role client. It BYPASSES row-level security, so it is used for one
 * thing only: connection records, which users are not allowed to write and
 * whose token column they cannot read. Every query made with it must filter
 * by owner_id explicitly (see src/lib/plaid/supabaseStore.ts).
 *
 * Server-only: the key is not NEXT_PUBLIC_ and this module cannot be bundled
 * into the browser.
 */
export function createSupabaseAdminClient(): SupabaseClient | null {
  const cfg = supabasePublicConfig();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!cfg || !serviceKey) return null;
  return createClient(cfg.url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
