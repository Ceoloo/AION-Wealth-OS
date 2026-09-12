"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { UserDataBundle } from "../data/bundle";
import { emptyBundle } from "../data/bundle";
import { buildDemoBundle, DEMO_OWNER_ID } from "./demoData";
import { generatePlan } from "../domain/plan/engine";
import type { GeneratedPlan } from "../domain/types";
import { nowISO, todayISO } from "../today";
import type { Ctx } from "./mutations";
import {
  addCreditIssue,
  addSnapshot,
  addWeeklyReview,
  recordActionEvent,
  removeAccount,
  setFormationStatus,
  setProfile,
  updateCreditIssue,
  upsertAccount,
} from "./mutations";
import type { FormationItemStatus } from "../domain/formation";
import type {
  AccountInput,
  CreditIssueInput,
  ProfileInput,
  SnapshotInput,
  WeeklyReviewInput,
} from "../validation/schemas";
import type { ActionEventType, SelfReportedScore } from "../domain/types";

const DEMO_KEY = "aion.demo.v1";

type Mode = "demo";

interface AppState {
  ready: boolean;
  mode: Mode;
  bundle: UserDataBundle;
  plan: GeneratedPlan;
  hasData: boolean;
  // actions
  loadDemoSeed: () => void;
  startFresh: () => void;
  resetAll: () => void;
  saveProfile: (input: ProfileInput) => void;
  saveSnapshot: (input: SnapshotInput, score?: SelfReportedScore | null) => void;
  saveAccount: (input: AccountInput, existingId?: string) => void;
  deleteAccount: (id: string) => void;
  createCreditIssue: (input: CreditIssueInput) => void;
  editCreditIssue: (id: string, input: CreditIssueInput) => void;
  actionEvent: (args: { actionId: string; ruleId: string; type: ActionEventType; reason?: string | null }) => void;
  saveWeeklyReview: (input: WeeklyReviewInput) => void;
  setFormationStatus: (itemId: string, status: FormationItemStatus) => void;
}

const AppContext = createContext<AppState | null>(null);

function makeCtx(ownerId: string): Ctx {
  return {
    ownerId,
    id: () =>
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `id-${Math.random().toString(36).slice(2)}-${Date.now()}`,
    now: () => nowISO(),
  };
}

function loadDemo(): UserDataBundle | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DEMO_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<UserDataBundle>;
    // Normalize older persisted shapes so new fields never come back undefined.
    return {
      ...emptyBundle(parsed.ownerId ?? DEMO_OWNER_ID),
      ...parsed,
      formationStatuses: parsed.formationStatuses ?? {},
    } as UserDataBundle;
  } catch {
    return null;
  }
}

function persistDemo(bundle: UserDataBundle) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DEMO_KEY, JSON.stringify(bundle));
  } catch {
    // Storage may be unavailable (private mode); the app still functions in-memory.
  }
}

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [bundle, setBundle] = useState<UserDataBundle>(() => emptyBundle(DEMO_OWNER_ID));

  useEffect(() => {
    const saved = loadDemo();
    if (saved) setBundle(saved);
    setReady(true);
  }, []);

  const commit = useCallback((next: UserDataBundle) => {
    setBundle(next);
    persistDemo(next);
  }, []);

  const ctx = useMemo(() => makeCtx(DEMO_OWNER_ID), []);

  const plan = useMemo<GeneratedPlan>(
    () =>
      generatePlan({
        asOf: todayISO(),
        generatedAt: nowISO(),
        profile: bundle.profile,
        snapshot: latest(bundle),
        accounts: bundle.accounts,
        creditIssues: bundle.creditIssues,
        events: bundle.actionEvents,
      }),
    [bundle],
  );

  const value: AppState = {
    ready,
    mode: "demo",
    bundle,
    plan,
    hasData: bundle.profile !== null || bundle.snapshots.length > 0,
    loadDemoSeed: () => commit(buildDemoBundle()),
    startFresh: () => commit(emptyBundle(DEMO_OWNER_ID)),
    resetAll: () => {
      if (typeof window !== "undefined") window.localStorage.removeItem(DEMO_KEY);
      setBundle(emptyBundle(DEMO_OWNER_ID));
    },
    saveProfile: (input) => commit(setProfile(bundle, input, ctx)),
    saveSnapshot: (input, score = null) => commit(addSnapshot(bundle, input, ctx, score)),
    saveAccount: (input, existingId) => commit(upsertAccount(bundle, input, ctx, existingId)),
    deleteAccount: (id) => commit(removeAccount(bundle, id, ctx)),
    createCreditIssue: (input) => commit(addCreditIssue(bundle, input, ctx)),
    editCreditIssue: (id, input) => commit(updateCreditIssue(bundle, id, input, ctx)),
    actionEvent: (args) => commit(recordActionEvent(bundle, args, ctx)),
    saveWeeklyReview: (input) => commit(addWeeklyReview(bundle, input, ctx)),
    setFormationStatus: (itemId, status) => commit(setFormationStatus(bundle, itemId, status)),
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

function latest(b: UserDataBundle) {
  if (b.snapshots.length === 0) return null;
  return b.snapshots
    .slice()
    .sort((a, c) => (a.asOf === c.asOf ? a.createdAt.localeCompare(c.createdAt) : a.asOf.localeCompare(c.asOf)))
    .at(-1)!;
}

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppStateProvider");
  return ctx;
}
