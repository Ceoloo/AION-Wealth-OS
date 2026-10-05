"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "../supabase/server";
import { loadBundle } from "../supabase/data";
import type { UserDataBundle } from "../data/bundle";
import { PlaidApiError } from "./gateway";
import type { SkippedAccount } from "./normalize";
import { TranslationError } from "./normalize";
import { plaidServiceDeps } from "./server";
import { ConnectionError, connect, createLinkToken, disconnect, sync, type ServiceDeps } from "./service";

/**
 * Server actions for connecting accounts. Each one:
 *  1. resolves the signed-in user from their session cookie (never from input),
 *  2. validates its input,
 *  3. runs the workflow with that user's id as the owner scope,
 *  4. returns the user's freshly loaded bundle, read AS THE USER (RLS applies),
 *     so nothing the user may not see can come back — the token included.
 *
 * Results are returned, not thrown: production builds strip thrown messages,
 * and the UI needs the code to say something useful.
 */

export type PlaidActionResult<T = object> =
  | ({ ok: true; bundle: UserDataBundle } & T)
  | { ok: false; code: string };

const connectionIdSchema = z.string().uuid();
const publicTokenSchema = z.string().regex(/^public-(sandbox|production)-[A-Za-z0-9-]{1,200}$/);

async function ctx(): Promise<
  | { ok: true; uid: string; deps: ServiceDeps; reload: () => Promise<UserDataBundle> }
  | { ok: false; code: string }
> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, code: "SUPABASE_NOT_CONFIGURED" };
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) return { ok: false, code: "AUTH_REQUIRED" };
  const deps = plaidServiceDeps();
  if (!deps) return { ok: false, code: "PLAID_NOT_CONFIGURED" };
  return { ok: true, uid, deps, reload: () => loadBundle(supabase, uid) };
}

function failure(err: unknown): { ok: false; code: string } {
  if (err instanceof ConnectionError) return { ok: false, code: err.code };
  if (err instanceof PlaidApiError) return { ok: false, code: `PLAID_${err.code}` };
  if (err instanceof TranslationError) return { ok: false, code: "TRANSLATION_FAILED" };
  // Log only the message; never request objects, which can carry tokens.
  console.error("[plaid]", err instanceof Error ? err.message : "unknown error");
  return { ok: false, code: "FAILED" };
}

/** True when connections can be offered at all (no detail about what is missing). */
export async function plaidAvailableAction(): Promise<boolean> {
  return plaidServiceDeps() !== null;
}

/** A short-lived Link token. With a connection id, opens Link to repair it. */
export async function createLinkTokenAction(
  connectionId?: string,
): Promise<{ ok: true; linkToken: string } | { ok: false; code: string }> {
  const c = await ctx();
  if (!c.ok) return c;
  if (connectionId !== undefined && !connectionIdSchema.safeParse(connectionId).success) {
    return { ok: false, code: "INVALID_INPUT" };
  }
  try {
    return { ok: true, linkToken: await createLinkToken(c.deps, c.uid, connectionId) };
  } catch (err) {
    return failure(err);
  }
}

/** Finishes Link: exchange, store encrypted, first sync. */
export async function exchangePublicTokenAction(
  publicToken: string,
): Promise<PlaidActionResult<{ skipped: SkippedAccount[] }>> {
  const c = await ctx();
  if (!c.ok) return c;
  if (!publicTokenSchema.safeParse(publicToken).success) return { ok: false, code: "INVALID_INPUT" };
  try {
    const report = await connect(c.deps, c.uid, publicToken);
    return { ok: true, bundle: await c.reload(), skipped: report.skipped };
  } catch (err) {
    return failure(err);
  }
}

export async function syncConnectionAction(
  connectionId: string,
): Promise<PlaidActionResult<{ skipped: SkippedAccount[] }>> {
  const c = await ctx();
  if (!c.ok) return c;
  if (!connectionIdSchema.safeParse(connectionId).success) return { ok: false, code: "INVALID_INPUT" };
  try {
    const report = await sync(c.deps, c.uid, connectionId);
    return { ok: true, bundle: await c.reload(), skipped: report.skipped };
  } catch (err) {
    return failure(err);
  }
}

/** Revokes access at Plaid, then removes the connection and its accounts. */
export async function disconnectConnectionAction(connectionId: string): Promise<PlaidActionResult> {
  const c = await ctx();
  if (!c.ok) return c;
  if (!connectionIdSchema.safeParse(connectionId).success) return { ok: false, code: "INVALID_INPUT" };
  try {
    await disconnect(c.deps, c.uid, connectionId);
    return { ok: true, bundle: await c.reload() };
  } catch (err) {
    return failure(err);
  }
}
