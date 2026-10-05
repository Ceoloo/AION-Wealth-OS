import type { ActionStatus, PlanCategory } from "@/lib/domain/types";

export type Tone = "brand" | "success" | "warning" | "danger" | "info" | "muted";

export function statusLabel(s: ActionStatus): string {
  switch (s) {
    case "needs_attention":
      return "Needs attention";
    case "in_progress":
      return "In progress";
    case "complete":
      return "Complete";
    case "insufficient_information":
      return "Needs more info";
  }
}

export function statusTone(s: ActionStatus): Tone {
  switch (s) {
    case "complete":
      return "success";
    case "in_progress":
      return "brand";
    case "needs_attention":
      return "warning";
    case "insufficient_information":
      return "muted";
  }
}

export function categoryLabel(c: PlanCategory): string {
  const map: Record<PlanCategory, string> = {
    clarify: "Clarify",
    stabilize: "Stabilize",
    past_due: "Past due",
    cash: "Cash cushion",
    credit_report: "Credit report",
    recordkeeping: "Recordkeeping",
    formation: "Business setup",
  };
  return map[c];
}
