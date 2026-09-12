"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabasePublicConfig } from "../config";

/**
 * Browser Supabase client for REAL USER MODE. Returns null when configuration
 * is missing so callers can render a setup state instead of pretending to work.
 * Only the public anon key is ever used here — never the service role key.
 */
export function createSupabaseBrowserClient() {
  const cfg = supabasePublicConfig();
  if (!cfg) return null;
  return createBrowserClient(cfg.url, cfg.anonKey);
}
