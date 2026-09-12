import type { Repository } from "./types";
import type { UserDataBundle } from "../data/bundle";
import {
  acknowledgePartnersAction,
  addCreditIssueAction,
  addSnapshotAction,
  addWeeklyReviewAction,
  deleteAllDataAction,
  loadBundleAction,
  recordActionEventAction,
  recordReferralEventAction,
  removeAccountAction,
  saveProfileAction,
  setFormationStatusAction,
  setPartnerStatusAction,
  updateCreditIssueAction,
  upsertAccountAction,
} from "../supabase/actions";

/**
 * Real-mode repository. Every mutation is an authenticated, RLS-enforced server
 * action that returns a freshly-loaded bundle. The passed-in bundle is used
 * only for local decisions (e.g. not downgrading a partner status on click);
 * the server remains the source of truth.
 */
export class SupabaseRepository implements Repository {
  readonly mode = "real" as const;

  load() {
    return loadBundleAction();
  }
  saveProfile(_b: UserDataBundle, input: Parameters<Repository["saveProfile"]>[1]) {
    return saveProfileAction(input);
  }
  addSnapshot(_b: UserDataBundle, input: Parameters<Repository["addSnapshot"]>[1], score: Parameters<Repository["addSnapshot"]>[2]) {
    return addSnapshotAction(input, score);
  }
  upsertAccount(_b: UserDataBundle, input: Parameters<Repository["upsertAccount"]>[1], existingId?: string) {
    return upsertAccountAction(input, existingId);
  }
  removeAccount(_b: UserDataBundle, id: string) {
    return removeAccountAction(id);
  }
  addCreditIssue(_b: UserDataBundle, input: Parameters<Repository["addCreditIssue"]>[1]) {
    return addCreditIssueAction(input);
  }
  updateCreditIssue(_b: UserDataBundle, id: string, input: Parameters<Repository["updateCreditIssue"]>[2]) {
    return updateCreditIssueAction(id, input);
  }
  recordActionEvent(_b: UserDataBundle, args: Parameters<Repository["recordActionEvent"]>[1]) {
    return recordActionEventAction(args);
  }
  addWeeklyReview(_b: UserDataBundle, input: Parameters<Repository["addWeeklyReview"]>[1]) {
    return addWeeklyReviewAction(input);
  }
  setFormationStatus(_b: UserDataBundle, itemId: string, status: Parameters<Repository["setFormationStatus"]>[2]) {
    return setFormationStatusAction(itemId, status);
  }
  setPartnerStatus(_b: UserDataBundle, partnerId: string, status: Parameters<Repository["setPartnerStatus"]>[2]) {
    return setPartnerStatusAction(partnerId, status);
  }
  acknowledgePartners() {
    return acknowledgePartnersAction();
  }
  async recordReferralClick(b: UserDataBundle, partnerId: string) {
    await recordReferralEventAction(partnerId, "click");
    const cur = b.partnerStatuses[partnerId];
    if (cur !== "signed_up" && cur !== "already_use") {
      return setPartnerStatusAction(partnerId, "clicked");
    }
    return loadBundleAction();
  }
  async reportPartnerSignup(_b: UserDataBundle, partnerId: string) {
    await recordReferralEventAction(partnerId, "signup_reported");
    return setPartnerStatusAction(partnerId, "signed_up");
  }
  deleteAll() {
    return deleteAllDataAction();
  }
}
