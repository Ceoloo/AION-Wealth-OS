import type { CreditIssue } from "../domain/types";
import { getSource } from "../domain/sources";

/**
 * A factual issue-summary the USER can review before deciding what to do. This
 * is NOT an automated dispute letter and is NOT submitted anywhere — v0.1 does
 * not integrate with any bureau.
 */
export function buildCreditIssueSummary(issues: CreditIssue[], generatedAt: string): string {
  const lines: string[] = [];
  lines.push(`# Credit report issue summary (for your review)`);
  lines.push("");
  lines.push(`_Prepared ${generatedAt.slice(0, 10)} from information you entered._`);
  lines.push("");
  lines.push(
    `> This is a factual summary for your own review. It is not a dispute letter, is not sent to any bureau or creditor, and is not legal advice. Only dispute information you believe is genuinely inaccurate — accurate, current information cannot simply be removed.`,
  );
  lines.push("");

  if (issues.length === 0) {
    lines.push(`No issues recorded.`);
    return lines.join("\n");
  }

  issues.forEach((c, i) => {
    lines.push(`## ${i + 1}. ${c.creditorNickname} (${c.bureau})`);
    lines.push(`- Category: ${c.category.replace(/_/g, " ")}`);
    lines.push(`- Status: ${c.state.replace(/_/g, " ")}`);
    if (c.relevantDate) lines.push(`- Relevant date: ${c.relevantDate}`);
    if (c.followUpDate) lines.push(`- Follow-up reminder: ${c.followUpDate}`);
    lines.push(`- Your factual explanation: ${c.explanation}`);
    lines.push("");
  });

  const acr = getSource("annualcreditreport");
  const ftc = getSource("ftc_credit_repair");
  lines.push(`## Official resources`);
  if (acr) lines.push(`- Get your reports: ${acr.url}`);
  if (ftc) lines.push(`- Your rights & how disputes work (FTC): ${ftc.url}`);
  lines.push("");
  lines.push(`---`);
  lines.push(`_Review these facts yourself and consult the official dispute process or a professional as needed._`);
  return lines.join("\n");
}
