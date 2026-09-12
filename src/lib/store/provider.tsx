"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { UserDataBundle } from "../data/bundle";
import { emptyBundle } from "../data/bundle";
import { buildDemoBundle, DEMO_OWNER_ID } from "./demoData";
import { generatePlan } from "../domain/plan/engine";
import type { GeneratedPlan } from "../domain/types";
import { nowISO, todayISO } from "../today";
import type {
  AccountInput,
  CreditIssueInput,
  ProfileInput,
  SnapshotInput,
  WeeklyReviewInput,
} from "../validation/schemas";
import type { ActionEventType, SelfReportedScore } from "../domain/types";
import type { FormationItemStatus } from "../domain/formation";
import type { PartnerStatus } from "../domain/partners";
import type { Repository } from "../repo/types";
import { DemoRepository, DEMO_KEY } from "../repo/demo";
import { SupabaseRepository } from "../repo/supabase";
import { createSupabaseBrowserClient } from "../supabase/client";

export type Mode = "demo" | "real";

interface AppState {
  ready: boolean;
  mode: Mode;
  userEmail: string | null;
  busy: boolean;
  error: string | null;
  bundle: UserDataBundle;
  plan: GeneratedPlan;
  hasData: boolean;
  // demo-only entry helpers
  loadDemoSeed: () => void;
  startFresh: () => void;
  resetAll: () => void;
  // auth
  signOut: () => void;
  // data actions
  saveProfile: (input: ProfileInput) => void;
  saveSnapshot: (input: SnapshotInput, score?: SelfReportedScore | null) => void;
  saveAccount: (input: AccountInput, existingId?: string) => void;
  deleteAccount: (id: string) => void;
  createCreditIssue: (input: CreditIssueInput) => void;
  editCreditIssue: (id: string, input: CreditIssueInput) => void;
  actionEvent: (args: { actionId: string; ruleId: string; type: ActionEventType; reason?: string | null }) => void;
  saveWeeklyReview: (input: WeeklyReviewInput) => void;
  setFormationStatus: (itemId: string, status: FormationItemStatus) => void;
  setPartnerStatus: (partnerId: string, status: PartnerStatus) => void;
  acknowledgePartners: () => void;
  recordReferralClick: (partnerId: string) => void;
  reportPartnerSignup: (partnerId: string) => void;
}

const AppContext = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<Mode>("demo");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bundle, setBundle] = useState<UserDataBundle>(() => emptyBundle(DEMO_OWNER_ID));

  // The active repository. A ref so async callbacks always see the latest.
  const repoRef = useRef<Repository>(new DemoRepository());
  const bundleRef = useRef(bundle);
  bundleRef.current = bundle;

  const activateDemo = useCallback(async () => {
    const repo = new DemoRepository();
    repoRef.current = repo;
    setMode("demo");
    setUserEmail(null);
    setBundle(await repo.load());
  }, []);

  const activateReal = useCallback(async (email: string | null) => {
    const repo = new SupabaseRepository();
    repoRef.current = repo;
    setMode("real");
    setUserEmail(email);
    setBundle(await repo.load());
  }, []);

  // Determine mode on mount, and react to auth changes.
  useEffect(() => {
    let cancelled = false;
    const supabase = createSupabaseBrowserClient();

    (async () => {
      try {
        if (supabase) {
          const { data } = await supabase.auth.getUser();
          if (!cancelled && data.user) {
            await activateReal(data.user.email ?? null);
          } else if (!cancelled) {
            await activateDemo();
          }
        } else if (!cancelled) {
          await activateDemo();
        }
      } catch {
        if (!cancelled) await activateDemo();
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    const sub = supabase?.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      if (session?.user) void activateReal(session.user.email ?? null);
      else void activateDemo();
    });

    return () => {
      cancelled = true;
      sub?.data.subscription.unsubscribe();
    };
  }, [activateDemo, activateReal]);

  // Run a mutating repo call: set busy, apply result, surface errors.
  const run = useCallback((fn: (repo: Repository, b: UserDataBundle) => Promise<UserDataBundle>) => {
    setBusy(true);
    setError(null);
    void (async () => {
      try {
        const next = await fn(repoRef.current, bundleRef.current);
        setBundle(next);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Something went wrong";
        setError(msg === "AUTH_REQUIRED" ? "Please sign in again." : msg);
      } finally {
        setBusy(false);
      }
    })();
  }, []);

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
    mode,
    userEmail,
    busy,
    error,
    bundle,
    plan,
    hasData: bundle.profile !== null || bundle.snapshots.length > 0,

    loadDemoSeed: () => {
      if (repoRef.current.mode !== "demo") return;
      const seeded = buildDemoBundle();
      try {
        if (typeof window !== "undefined") window.localStorage.setItem(DEMO_KEY, JSON.stringify(seeded));
      } catch {
        /* ignore */
      }
      setBundle(seeded);
    },
    startFresh: () => {
      if (repoRef.current.mode !== "demo") return;
      const fresh = emptyBundle(DEMO_OWNER_ID);
      try {
        if (typeof window !== "undefined") window.localStorage.setItem(DEMO_KEY, JSON.stringify(fresh));
      } catch {
        /* ignore */
      }
      setBundle(fresh);
    },
    resetAll: () => run((repo, b) => repo.deleteAll(b)),

    signOut: () => {
      const supabase = createSupabaseBrowserClient();
      void (async () => {
        try {
          await supabase?.auth.signOut();
        } finally {
          await activateDemo();
        }
      })();
    },

    saveProfile: (input) => run((repo, b) => repo.saveProfile(b, input)),
    saveSnapshot: (input, score = null) => run((repo, b) => repo.addSnapshot(b, input, score)),
    saveAccount: (input, existingId) => run((repo, b) => repo.upsertAccount(b, input, existingId)),
    deleteAccount: (id) => run((repo, b) => repo.removeAccount(b, id)),
    createCreditIssue: (input) => run((repo, b) => repo.addCreditIssue(b, input)),
    editCreditIssue: (id, input) => run((repo, b) => repo.updateCreditIssue(b, id, input)),
    actionEvent: (args) => run((repo, b) => repo.recordActionEvent(b, args)),
    saveWeeklyReview: (input) => run((repo, b) => repo.addWeeklyReview(b, input)),
    setFormationStatus: (itemId, status) => run((repo, b) => repo.setFormationStatus(b, itemId, status)),
    setPartnerStatus: (partnerId, status) => run((repo, b) => repo.setPartnerStatus(b, partnerId, status)),
    acknowledgePartners: () => run((repo, b) => repo.acknowledgePartners(b)),
    recordReferralClick: (partnerId) => run((repo, b) => repo.recordReferralClick(b, partnerId)),
    reportPartnerSignup: (partnerId) => run((repo, b) => repo.reportPartnerSignup(b, partnerId)),
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
