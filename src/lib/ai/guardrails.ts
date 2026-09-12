/**
 * Rate + spend guardrails for the optional AI educator. Pure functions over the
 * user's recent ai_usage rows, so they are deterministic and testable. Enforced
 * on the SERVER before any provider call.
 */

export interface UsageRow {
  at: string; // ISODateTime
  costCents: number;
}

export interface GuardrailDecision {
  allowed: boolean;
  reason: string | null;
}

export function checkGuardrails(
  usage: UsageRow[],
  now: Date,
  limits: { monthlyBudgetCents: number; rateLimitPerHour: number },
): GuardrailDecision {
  const nowMs = now.getTime();
  const hourAgo = nowMs - 60 * 60 * 1000;
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).getTime();

  let lastHourCount = 0;
  let monthSpend = 0;
  for (const u of usage) {
    const t = Date.parse(u.at);
    if (!Number.isFinite(t)) continue;
    if (t >= hourAgo) lastHourCount += 1;
    if (t >= monthStart) monthSpend += u.costCents;
  }

  if (lastHourCount >= limits.rateLimitPerHour) {
    return { allowed: false, reason: "Hourly request limit reached. Try again later." };
  }
  if (monthSpend >= limits.monthlyBudgetCents) {
    return { allowed: false, reason: "Monthly AI budget reached. AI is paused until next month." };
  }
  return { allowed: true, reason: null };
}
