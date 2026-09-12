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
import { SessionGuard } from "./sessionGuard";

/**
 * Explicit session states. There is deliberately no "fall back to demo on
 * error" path: a failed real-mode load or an expired session must never route a
 * pending financial write into browser localStorage. Demo is only ever entered
 * by explicit user choice (`enterDemo`).
 */
export type SessionState =
  | "initializing"
  | "signed_out" // real mode available, nobody signed in, demo not chosen
  | "demo" // explicit synthetic demo
  | "auth_loading" // signed in, loading this account's bundle
  | "auth_ready" // signed in, bundle loaded — the only real-mode writable state
  | "session_expired" // was signed in; session gone. Writes refused, not redirected
  | "error"; // recoverable load failure. Retry offered; never silently demoted

export type Mode = "demo" | "real";

export type MutationResult =
  | { ok: true }
  | { ok: false; error: string; code: "AUTH_REQUIRED" | "SESSION_CHANGED" | "NOT_WRITABLE" | "FAILED" };

/** Remembers that the visitor explicitly opted into the synthetic demo. */
const DEMO_OPTIN_KEY = "aion.demo.optin";

function readDemoOptIn(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(DEMO_OPTIN_KEY) === "1";
  } catch {
    return false;
  }
}
function writeDemoOptIn(on: boolean) {
  try {
    if (typeof window === "undefined") return;
    if (on) window.localStorage.setItem(DEMO_OPTIN_KEY, "1");
    else window.localStorage.removeItem(DEMO_OPTIN_KEY);
  } catch {
    /* storage unavailable; demo still works in-memory for this tab */
  }
}

interface AppState {
  ready: boolean;
  sessionState: SessionState;
  /** True when Supabase is configured, so real mode is offered at all. */
  configured: boolean;
  mode: Mode;
  userEmail: string | null;
  busy: boolean;
  error: string | null;
  /** True only when a write can be safely persisted to the active repository. */
  canWrite: boolean;
  bundle: UserDataBundle;
  plan: GeneratedPlan;
  hasData: boolean;

  // session control
  enterDemo: () => void;
  retryLoad: () => void;
  signOut: () => void;

  // demo-only helpers
  loadDemoSeed: () => void;
  startFresh: () => void;
  resetAll: () => Promise<MutationResult>;

  // data actions — all report success/failure instead of silently swallowing it
  saveProfile: (input: ProfileInput) => Promise<MutationResult>;
  saveSnapshot: (input: SnapshotInput, score?: SelfReportedScore | null) => Promise<MutationResult>;
  saveAccount: (input: AccountInput, existingId?: string) => Promise<MutationResult>;
  deleteAccount: (id: string) => Promise<MutationResult>;
  createCreditIssue: (input: CreditIssueInput) => Promise<MutationResult>;
  editCreditIssue: (id: string, input: CreditIssueInput) => Promise<MutationResult>;
  actionEvent: (args: {
    actionId: string;
    ruleId: string;
    type: ActionEventType;
    reason?: string | null;
    occurrenceKey?: string | null;
  }) => Promise<MutationResult>;
  saveWeeklyReview: (input: WeeklyReviewInput) => Promise<MutationResult>;
  setFormationStatus: (itemId: string, status: FormationItemStatus) => Promise<MutationResult>;
  setPartnerStatus: (partnerId: string, status: PartnerStatus) => Promise<MutationResult>;
  acknowledgePartners: () => Promise<MutationResult>;
  recordReferralClick: (partnerId: string) => Promise<MutationResult>;
  reportPartnerSignup: (partnerId: string) => Promise<MutationResult>;
}

const AppContext = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [sessionState, setSessionState] = useState<SessionState>("initializing");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bundle, setBundle] = useState<UserDataBundle>(() => emptyBundle(DEMO_OWNER_ID));
  const [configured] = useState(() => createSupabaseBrowserClient() !== null);

  const repoRef = useRef<Repository | null>(null);
  const bundleRef = useRef(bundle);
  bundleRef.current = bundle;

  /**
   * Session generation + write serialization (unit-tested in sessionGuard.test.ts).
   * Every activation, auth change and sign-out bumps the generation so a previous
   * account's late response can never populate a new session's state.
   */
  const guardRef = useRef<SessionGuard>(new SessionGuard());
  const userIdRef = useRef<string | null>(null);

  const newGeneration = useCallback(() => guardRef.current.bump(), []);

  /** Drop every private record held in memory (sign-out / account change). */
  const clearPrivateState = useCallback(() => {
    setBundle(emptyBundle(DEMO_OWNER_ID));
    setUserEmail(null);
    setError(null);
  }, []);

  const activateReal = useCallback(
    async (gen: number, email: string | null) => {
      if (gen !== guardRef.current.generation) return; // superseded before we began
      const repo = new SupabaseRepository();
      repoRef.current = repo;
      setUserEmail(email);
      setSessionState("auth_loading");
      try {
        const loaded = await repo.load();
        if (gen !== guardRef.current.generation) return; // stale: a newer session took over
        setBundle(loaded);
        setSessionState("auth_ready");
      } catch (e) {
        if (gen !== guardRef.current.generation) return;
        const msg = e instanceof Error ? e.message : "Could not load your data";
        // Never demote to demo here — that would send real writes to localStorage.
        if (msg === "AUTH_REQUIRED") {
          clearPrivateState();
          setSessionState("session_expired");
        } else {
          setError(msg);
          setSessionState("error");
        }
      }
    },
    [clearPrivateState],
  );

  const activateDemo = useCallback(async (gen: number) => {
    if (gen !== guardRef.current.generation) return; // superseded before we began
    const repo = new DemoRepository();
    repoRef.current = repo;
    setUserEmail(null);
    const loaded = await repo.load();
    if (gen !== guardRef.current.generation) return;
    setBundle(loaded);
    setSessionState("demo");
  }, []);

  // Initial resolution + auth change handling.
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const gen = newGeneration();

    void (async () => {
      try {
        if (!supabase) {
          // Real mode unavailable. Demo is still an explicit choice.
          if (readDemoOptIn()) await activateDemo(gen);
          else if (gen === guardRef.current.generation) setSessionState("signed_out");
          return;
        }
        const { data, error: authError } = await supabase.auth.getUser();
        if (gen !== guardRef.current.generation) return;
        if (authError && authError.name !== "AuthSessionMissingError") {
          setError(authError.message);
          setSessionState("error");
          return;
        }
        if (data.user) {
          userIdRef.current = data.user.id;
          await activateReal(gen, data.user.email ?? null);
        } else if (readDemoOptIn()) {
          await activateDemo(gen);
        } else {
          setSessionState("signed_out");
        }
      } catch (e) {
        if (gen !== guardRef.current.generation) return;
        setError(e instanceof Error ? e.message : "Startup failed");
        setSessionState("error");
      }
    })();

    const sub = supabase?.auth.onAuthStateChange((_event, session) => {
      // Auth callbacks are async; failures here must not escape unhandled.
      void (async () => {
        try {
          const nextUserId = session?.user?.id ?? null;
          // No identity change (covers INITIAL_SESSION with no session, which
          // Supabase emits on subscribe and must NOT cancel an in-flight
          // activation or force the visitor back to the chooser).
          if (nextUserId === userIdRef.current) return;
          userIdRef.current = nextUserId;
          const g = newGeneration();
          clearPrivateState(); // never show the previous account's data
          if (nextUserId) {
            await activateReal(g, session?.user?.email ?? null);
          } else {
            // Signed out: do NOT auto-enter demo; that would make localStorage
            // the destination for anything the user types next.
            if (g === guardRef.current.generation) setSessionState("signed_out");
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : "Session change failed");
          setSessionState("error");
        }
      })();
    });

    return () => {
      newGeneration(); // invalidate anything still in flight
      sub?.data.subscription.unsubscribe();
    };
  }, [activateDemo, activateReal, clearPrivateState, newGeneration]);

  const canWrite = sessionState === "demo" || sessionState === "auth_ready";

  /**
   * Queue + generation guarded mutation. Returns a typed result so callers can
   * keep the user's input on screen when a save fails.
   */
  const runMutation = useCallback(
    async (fn: (repo: Repository, b: UserDataBundle) => Promise<UserDataBundle>): Promise<MutationResult> => {
      setBusy(true);
      setError(null);
      const outcome = await guardRef.current.run(async () => {
        const repo = repoRef.current;
        if (!repo) throw new Error("NOT_READY");
        return fn(repo, bundleRef.current);
      });
      setBusy(false);

      if (outcome.status === "stale") {
        return {
          ok: false,
          error: "Your session changed before this could save. Nothing was saved.",
          code: "SESSION_CHANGED",
        };
      }
      if (outcome.status === "error") {
        const msg = outcome.error instanceof Error ? outcome.error.message : "Something went wrong";
        if (msg === "AUTH_REQUIRED") {
          clearPrivateState();
          setSessionState("session_expired");
          return { ok: false, error: "Your session expired. Please sign in again.", code: "AUTH_REQUIRED" };
        }
        setError(msg);
        return { ok: false, error: msg, code: "FAILED" };
      }
      setBundle(outcome.value);
      return { ok: true };
    },
    [clearPrivateState],
  );

  /** Refuses the write outright unless the session is in a writable state. */
  const guardedMutation = useCallback(
    (fn: (repo: Repository, b: UserDataBundle) => Promise<UserDataBundle>): Promise<MutationResult> => {
      if (!canWrite) {
        const msg =
          sessionState === "session_expired"
            ? "Your session expired. Please sign in again — nothing was saved."
            : "Not ready to save yet.";
        return Promise.resolve({ ok: false, error: msg, code: "NOT_WRITABLE" as const });
      }
      return runMutation(fn);
    },
    [canWrite, runMutation, sessionState],
  );

  const plan = useMemo<GeneratedPlan>(
    () =>
      generatePlan({
        asOf: todayISO(),
        generatedAt: nowISO(),
        profile: bundle.profile,
        snapshot: latest(bundle),
        snapshots: bundle.snapshots,
        accounts: bundle.accounts,
        creditIssues: bundle.creditIssues,
        events: bundle.actionEvents,
      }),
    [bundle],
  );

  const persistDemoBundle = useCallback((next: UserDataBundle) => {
    try {
      if (typeof window !== "undefined") window.localStorage.setItem(DEMO_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    setBundle(next);
  }, []);

  const value: AppState = {
    ready: sessionState !== "initializing",
    sessionState,
    configured,
    mode: sessionState === "demo" ? "demo" : "real",
    userEmail,
    busy,
    error,
    canWrite,
    bundle,
    plan,
    hasData: bundle.profile !== null || bundle.snapshots.length > 0,

    enterDemo: () => {
      writeDemoOptIn(true);
      const g = newGeneration();
      void activateDemo(g);
    },

    retryLoad: () => {
      const supabase = createSupabaseBrowserClient();
      const g = newGeneration();
      setError(null);
      void (async () => {
        try {
          if (!supabase) {
            setSessionState("signed_out");
            return;
          }
          const { data } = await supabase.auth.getUser();
          if (g !== guardRef.current.generation) return;
          if (data.user) {
            userIdRef.current = data.user.id;
            await activateReal(g, data.user.email ?? null);
          } else {
            setSessionState("signed_out");
          }
        } catch (e) {
          if (g !== guardRef.current.generation) return;
          setError(e instanceof Error ? e.message : "Retry failed");
          setSessionState("error");
        }
      })();
    },

    signOut: () => {
      const supabase = createSupabaseBrowserClient();
      const g = newGeneration();
      userIdRef.current = null;
      clearPrivateState();
      writeDemoOptIn(false);
      void (async () => {
        try {
          await supabase?.auth.signOut();
        } catch {
          /* signing out locally regardless */
        } finally {
          if (g === guardRef.current.generation) setSessionState("signed_out");
        }
      })();
    },

    loadDemoSeed: () => {
      if (sessionState !== "demo") return;
      persistDemoBundle(buildDemoBundle());
    },
    startFresh: () => {
      if (sessionState !== "demo") return;
      persistDemoBundle(emptyBundle(DEMO_OWNER_ID));
    },
    resetAll: () => guardedMutation((repo, b) => repo.deleteAll(b)),

    saveProfile: (input) => guardedMutation((repo, b) => repo.saveProfile(b, input)),
    saveSnapshot: (input, score = null) => guardedMutation((repo, b) => repo.addSnapshot(b, input, score)),
    saveAccount: (input, existingId) => guardedMutation((repo, b) => repo.upsertAccount(b, input, existingId)),
    deleteAccount: (id) => guardedMutation((repo, b) => repo.removeAccount(b, id)),
    createCreditIssue: (input) => guardedMutation((repo, b) => repo.addCreditIssue(b, input)),
    editCreditIssue: (id, input) => guardedMutation((repo, b) => repo.updateCreditIssue(b, id, input)),
    actionEvent: (args) => guardedMutation((repo, b) => repo.recordActionEvent(b, args)),
    saveWeeklyReview: (input) => guardedMutation((repo, b) => repo.addWeeklyReview(b, input)),
    setFormationStatus: (itemId, status) => guardedMutation((repo, b) => repo.setFormationStatus(b, itemId, status)),
    setPartnerStatus: (partnerId, status) => guardedMutation((repo, b) => repo.setPartnerStatus(b, partnerId, status)),
    acknowledgePartners: () => guardedMutation((repo, b) => repo.acknowledgePartners(b)),
    recordReferralClick: (partnerId) => guardedMutation((repo, b) => repo.recordReferralClick(b, partnerId)),
    reportPartnerSignup: (partnerId) => guardedMutation((repo, b) => repo.reportPartnerSignup(b, partnerId)),
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
