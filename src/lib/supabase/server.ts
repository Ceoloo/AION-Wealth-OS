import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabasePublicConfig } from "../config";

/**
 * Server-side Supabase client bound to the request's auth cookies. Returns null
 * when configuration is missing (setup state). Service credentials are never
 * sent to the browser; this runs only on the server.
 */
export async function createSupabaseServerClient() {
  const cfg = supabasePublicConfig();
  if (!cfg) return null;

  const cookieStore = await cookies();
  return createServerClient(cfg.url, cfg.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component render — safe to ignore; middleware
          // refreshes the session cookie in real deployments.
        }
      },
    },
  });
}

/** The current authenticated user id, or null if unconfigured / signed out. */
export async function currentUserId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}
