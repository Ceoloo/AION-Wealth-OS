import type { UserDataBundle } from "../data/bundle";
import type { ActionEventType, SelfReportedScore } from "../domain/types";
import type { FormationItemStatus } from "../domain/formation";
import type { PartnerStatus } from "../domain/partners";
import type {
  AccountInput,
  CreditIssueInput,
  ProfileInput,
  SnapshotInput,
  WeeklyReviewInput,
} from "../validation/schemas";

/**
 * Persistence abstraction shared by demo (localStorage) and real (Supabase)
 * modes. Every mutating method takes the current bundle and returns the next
 * bundle, so the provider stays a thin state holder. Real-mode methods route
 * through authenticated, RLS-enforced server actions.
 */
export interface Repository {
  readonly mode: "demo" | "real";
  load(): Promise<UserDataBundle>;
  saveProfile(bundle: UserDataBundle, input: ProfileInput): Promise<UserDataBundle>;
  addSnapshot(
    bundle: UserDataBundle,
    input: SnapshotInput,
    score: SelfReportedScore | null,
  ): Promise<UserDataBundle>;
  upsertAccount(
    bundle: UserDataBundle,
    input: AccountInput,
    existingId?: string,
  ): Promise<UserDataBundle>;
  removeAccount(bundle: UserDataBundle, id: string): Promise<UserDataBundle>;
  addCreditIssue(bundle: UserDataBundle, input: CreditIssueInput): Promise<UserDataBundle>;
  updateCreditIssue(
    bundle: UserDataBundle,
    id: string,
    input: CreditIssueInput,
  ): Promise<UserDataBundle>;
  recordActionEvent(
    bundle: UserDataBundle,
    args: {
      actionId: string;
      ruleId: string;
      type: ActionEventType;
      reason?: string | null;
      occurrenceKey?: string | null;
    },
  ): Promise<UserDataBundle>;
  addWeeklyReview(bundle: UserDataBundle, input: WeeklyReviewInput): Promise<UserDataBundle>;
  setFormationStatus(
    bundle: UserDataBundle,
    itemId: string,
    status: FormationItemStatus,
  ): Promise<UserDataBundle>;
  setPartnerStatus(
    bundle: UserDataBundle,
    partnerId: string,
    status: PartnerStatus,
  ): Promise<UserDataBundle>;
  acknowledgePartners(bundle: UserDataBundle): Promise<UserDataBundle>;
  recordReferralClick(bundle: UserDataBundle, partnerId: string): Promise<UserDataBundle>;
  reportPartnerSignup(bundle: UserDataBundle, partnerId: string): Promise<UserDataBundle>;
  deleteAll(bundle: UserDataBundle): Promise<UserDataBundle>;
}
