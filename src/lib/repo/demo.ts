import type { Repository } from "./types";
import type { UserDataBundle } from "../data/bundle";
import { emptyBundle } from "../data/bundle";
import { DEMO_OWNER_ID } from "../store/demoData";
import { nowISO } from "../today";
import { PARTNERS } from "../domain/partners";
import type { Ctx } from "../store/mutations";
import {
  acknowledgePartners,
  addCreditIssue,
  addSnapshot,
  addWeeklyReview,
  recordActionEvent,
  recordReferralEvent,
  removeAccount,
  setFormationStatus,
  setPartnerStatus,
  setProfile,
  updateCreditIssue,
  upsertAccount,
} from "../store/mutations";

export const DEMO_KEY = "aion.demo.v1";

function genId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

/**
 * Demo repository: synthetic single-user state persisted to localStorage. This
 * is the clearly-labeled demo path — real financial data is never stored here.
 */
export class DemoRepository implements Repository {
  readonly mode = "demo" as const;
  private ctx: Ctx = { ownerId: DEMO_OWNER_ID, id: genId, now: () => nowISO() };

  private persist(bundle: UserDataBundle): UserDataBundle {
    try {
      if (typeof window !== "undefined") window.localStorage.setItem(DEMO_KEY, JSON.stringify(bundle));
    } catch {
      // storage unavailable (private mode) — continue in-memory
    }
    return bundle;
  }

  async load(): Promise<UserDataBundle> {
    if (typeof window === "undefined") return emptyBundle(DEMO_OWNER_ID);
    try {
      const raw = window.localStorage.getItem(DEMO_KEY);
      if (!raw) return emptyBundle(DEMO_OWNER_ID);
      const parsed = JSON.parse(raw) as Partial<UserDataBundle>;
      return {
        ...emptyBundle(parsed.ownerId ?? DEMO_OWNER_ID),
        ...parsed,
        formationStatuses: parsed.formationStatuses ?? {},
        partnerStatuses: parsed.partnerStatuses ?? {},
        partnersAcknowledged: parsed.partnersAcknowledged ?? false,
        referralEvents: parsed.referralEvents ?? [],
      } as UserDataBundle;
    } catch {
      return emptyBundle(DEMO_OWNER_ID);
    }
  }

  async saveProfile(b: UserDataBundle, input: Parameters<Repository["saveProfile"]>[1]) {
    return this.persist(setProfile(b, input, this.ctx));
  }
  async addSnapshot(b: UserDataBundle, input: Parameters<Repository["addSnapshot"]>[1], score: Parameters<Repository["addSnapshot"]>[2]) {
    return this.persist(addSnapshot(b, input, this.ctx, score));
  }
  async upsertAccount(b: UserDataBundle, input: Parameters<Repository["upsertAccount"]>[1], existingId?: string) {
    return this.persist(upsertAccount(b, input, this.ctx, existingId));
  }
  async removeAccount(b: UserDataBundle, id: string) {
    return this.persist(removeAccount(b, id, this.ctx));
  }
  async addCreditIssue(b: UserDataBundle, input: Parameters<Repository["addCreditIssue"]>[1]) {
    return this.persist(addCreditIssue(b, input, this.ctx));
  }
  async updateCreditIssue(b: UserDataBundle, id: string, input: Parameters<Repository["updateCreditIssue"]>[2]) {
    return this.persist(updateCreditIssue(b, id, input, this.ctx));
  }
  async recordActionEvent(b: UserDataBundle, args: Parameters<Repository["recordActionEvent"]>[1]) {
    return this.persist(recordActionEvent(b, args, this.ctx));
  }
  async addWeeklyReview(b: UserDataBundle, input: Parameters<Repository["addWeeklyReview"]>[1]) {
    return this.persist(addWeeklyReview(b, input, this.ctx));
  }
  async setFormationStatus(b: UserDataBundle, itemId: string, status: Parameters<Repository["setFormationStatus"]>[2]) {
    return this.persist(setFormationStatus(b, itemId, status));
  }
  async setPartnerStatus(b: UserDataBundle, partnerId: string, status: Parameters<Repository["setPartnerStatus"]>[2]) {
    return this.persist(setPartnerStatus(b, partnerId, status));
  }
  async acknowledgePartners(b: UserDataBundle) {
    return this.persist(acknowledgePartners(b));
  }
  async recordReferralClick(b: UserDataBundle, partnerId: string) {
    const category = PARTNERS.find((p) => p.id === partnerId)?.category ?? "banking";
    let next = recordReferralEvent(b, { partnerId, category, type: "click" }, this.ctx);
    const cur = b.partnerStatuses[partnerId];
    if (cur !== "signed_up" && cur !== "already_use") {
      next = setPartnerStatus(next, partnerId, "clicked");
    }
    return this.persist(next);
  }
  async reportPartnerSignup(b: UserDataBundle, partnerId: string) {
    const category = PARTNERS.find((p) => p.id === partnerId)?.category ?? "banking";
    let next = recordReferralEvent(b, { partnerId, category, type: "signup_reported" }, this.ctx);
    next = setPartnerStatus(next, partnerId, "signed_up");
    return this.persist(next);
  }
  async deleteAll(): Promise<UserDataBundle> {
    try {
      if (typeof window !== "undefined") window.localStorage.removeItem(DEMO_KEY);
    } catch {
      /* ignore */
    }
    return emptyBundle(DEMO_OWNER_ID);
  }
}
