import "server-only";
import { randomUUID } from "node:crypto";
import { createSupabaseAdminClient } from "../supabase/admin";
import { readPlaidConfig } from "./config";
import { createPlaidGateway } from "./gateway";
import type { ServiceDeps } from "./service";
import { createSupabaseConnectionStore } from "./supabaseStore";

/** Wires the real Plaid gateway and Supabase store, or null when not configured. */
export function plaidServiceDeps(): ServiceDeps | null {
  const cfg = readPlaidConfig();
  if (!cfg.ok) return null;
  const admin = createSupabaseAdminClient();
  if (!admin) return null;
  return {
    store: createSupabaseConnectionStore(admin),
    plaid: createPlaidGateway(cfg.config),
    tokenKey: cfg.config.tokenKey,
    now: () => new Date(),
    newId: () => randomUUID(),
    maxItemsPerUser: cfg.config.maxItemsPerUser,
  };
}
