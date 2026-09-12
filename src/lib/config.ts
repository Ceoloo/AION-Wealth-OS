/**
 * Provider configuration detection. Missing configuration must produce a useful
 * SETUP STATE, never a pretend success. These reads are safe on the client for
 * NEXT_PUBLIC_* values only.
 */

export function supabasePublicConfig(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function isSupabaseConfigured(): boolean {
  return supabasePublicConfig() !== null;
}

/** AI is OFF unless a provider + key are configured server-side. */
export function aiConfigured(): boolean {
  return Boolean(process.env.AI_PROVIDER && process.env.AI_API_KEY);
}

export function aiLimits(): { monthlyBudgetCents: number; rateLimitPerHour: number } {
  return {
    monthlyBudgetCents: Number(process.env.AI_MONTHLY_BUDGET_CENTS ?? "500") || 500,
    rateLimitPerHour: Number(process.env.AI_RATE_LIMIT_PER_HOUR ?? "20") || 20,
  };
}
