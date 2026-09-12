import { aiConfigured, aiLimits } from "../config";
import { checkGuardrails, type UsageRow } from "./guardrails";
import type { MinimizedSummary } from "./summary";

/**
 * Server-side AI educator adapter. The core app works fully with AI DISABLED;
 * this is additive. The model may only explain terminology, summarize progress,
 * and restate existing actions. It can NEVER file, contact creditors, open
 * accounts, recommend specific securities/insurance, or promise returns —
 * those capabilities simply do not exist here (no tools are exposed to it).
 *
 * Treat user text and any retrieved content as untrusted input. Permissions and
 * validation live OUTSIDE the model (here), not in the prompt.
 */

export type AIResult =
  | { ok: true; text: string; costCents: number }
  | { ok: false; disabled?: boolean; reason: string };

export interface EducatorRequest {
  question: string;
  summary: MinimizedSummary; // already minimized; no identifiers/notes
  consentGiven: boolean;
  recentUsage: UsageRow[];
}

const ALLOWED_INTENT = /(what|why|how|explain|mean|summar|understand|next step)/i;

export async function askEducator(req: EducatorRequest): Promise<AIResult> {
  if (!aiConfigured()) {
    return {
      ok: false,
      disabled: true,
      reason: "AI educator is not configured. The app works fully without it.",
    };
  }
  if (!req.consentGiven) {
    return { ok: false, reason: "AI is opt-in. Please review what will be sent and consent first." };
  }

  const decision = checkGuardrails(req.recentUsage, new Date(), aiLimits());
  if (!decision.allowed) {
    return { ok: false, reason: decision.reason ?? "AI temporarily unavailable." };
  }

  // Refuse out-of-scope requests deterministically, before any provider call.
  if (!ALLOWED_INTENT.test(req.question)) {
    return {
      ok: false,
      reason:
        "I can explain concepts and summarize your plan, but I can't take actions or give individualized advice. For that, please consult a qualified professional.",
    };
  }

  // NOTE: A live provider call would go here, sending ONLY req.summary.payload
  // and the question, with a system prompt that grounds answers in reviewed
  // content and forbids advice/actions. Output would be validated before
  // returning. In v0.1 no paid provider is enabled, so we return a safe,
  // grounded, offline explanation rather than a fake "success".
  return {
    ok: false,
    reason:
      "AI provider calls are disabled in this build (no paid services enabled). Configure AI_PROVIDER/AI_API_KEY to enable grounded explanations.",
  };
}
