import type { FinancialSnapshot, SnapshotFigure } from "@/lib/domain/types";
import { SOURCE_DESCRIPTION, SOURCE_LABEL, snapshotFigureSource } from "@/lib/domain/provenance";
import { Badge } from "@/components/ui/badge";

const FIGURE_LABEL: Record<SnapshotFigure, string> = {
  takeHomeIncomeCents: "Take-home income",
  essentialSpendingCents: "Essential spending",
  otherSpendingCents: "Other spending",
  requiredDebtPaymentsCents: "Required debt payments",
  availableCashCents: "Available cash",
  otherAssetsCents: "Other assets",
  liabilitiesCents: "Total debt",
  hasPastDueAccounts: "Past-due status",
};

/**
 * Where each snapshot figure came from — shown only when something did not
 * come from the user, so a manual-only user sees no extra noise.
 */
export function SnapshotSources({ snapshot }: { snapshot: FinancialSnapshot }) {
  const figures = (Object.keys(FIGURE_LABEL) as SnapshotFigure[]).filter(
    (f) => snapshotFigureSource(snapshot, f) !== "user_reported",
  );
  if (figures.length === 0) return null;
  return (
    <div className="rounded-xl border border-border px-4 py-3">
      <p className="text-xs font-medium text-muted-foreground">Where these figures came from</p>
      <ul className="mt-2 space-y-1.5">
        {figures.map((f) => {
          const src = snapshotFigureSource(snapshot, f);
          return (
            <li key={f} className="flex items-center justify-between gap-3 text-xs">
              <span className="text-muted-foreground">{FIGURE_LABEL[f]}</span>
              <Badge variant={src === "connected_account" ? "info" : "muted"} title={SOURCE_DESCRIPTION[src]}>
                {src === "derived" ? "Calculated from your accounts" : SOURCE_LABEL[src]}
              </Badge>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-subtle">Everything else is as you entered it.</p>
    </div>
  );
}
