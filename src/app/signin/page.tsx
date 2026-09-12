"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function SignInPage() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [mode, setMode] = useState<"sign_in" | "sign_up">("sign_in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const inputCls =
    "w-full rounded-xl border border-ink-line bg-ink-soft px-3 py-2 text-sm text-cloud placeholder:text-cloud-faint focus:border-teal focus:outline-none min-h-[44px]";
  const btnCls =
    "inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-teal px-4 py-2 text-sm font-semibold text-ink transition hover:bg-teal/90 disabled:opacity-50";

  // Setup state: real mode isn't configured, so we don't fake a sign-in.
  if (!supabase) {
    return (
      <main className="mx-auto flex min-h-screen max-w-app flex-col justify-center gap-4 px-4 py-10">
        <h1 className="text-2xl font-bold text-cloud">Real user mode isn&apos;t set up</h1>
        <p className="text-sm text-cloud-muted">
          This build has no Supabase configuration, so authenticated accounts aren&apos;t available
          yet. Set <code className="rounded bg-ink-soft px-1">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code className="rounded bg-ink-soft px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> (see the
          README), then run the migrations. Until then, use the synthetic demo.
        </p>
        <Link href="/today" className="text-sm font-medium text-teal underline">
          Open the demo instead →
        </Link>
      </main>
    );
  }

  async function submit() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      if (mode === "sign_up") {
        const { error } = await supabase!.auth.signUp({ email, password });
        if (error) throw error;
        setMsg("Account created. If email confirmation is on, check your inbox, then sign in.");
        setMode("sign_in");
      } else {
        const { error } = await supabase!.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push("/today");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  async function magicLink() {
    if (!email) {
      setErr("Enter your email first.");
      return;
    }
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const { error } = await supabase!.auth.signInWithOtp({ email });
      if (error) throw error;
      setMsg("Check your email for a sign-in link.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not send link");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-app flex-col justify-center gap-4 px-4 py-10">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-teal">AION Wealth OS</p>
        <h1 className="mt-1 text-2xl font-bold text-cloud">
          {mode === "sign_in" ? "Sign in" : "Create your account"}
        </h1>
        <p className="mt-1 text-sm text-cloud-muted">
          Real user mode stores your data securely with row-level security — never silently in your
          browser.
        </p>
      </div>

      <div className="space-y-3">
        <input
          className={inputCls}
          type="email"
          placeholder="you@example.com"
          value={email}
          autoComplete="email"
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className={inputCls}
          type="password"
          placeholder="Password"
          value={password}
          autoComplete={mode === "sign_in" ? "current-password" : "new-password"}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button className={btnCls} disabled={busy || !email || !password} onClick={submit}>
          {busy ? "Working…" : mode === "sign_in" ? "Sign in" : "Create account"}
        </button>
        <button
          className="w-full text-center text-sm text-teal underline disabled:opacity-50"
          disabled={busy}
          onClick={magicLink}
        >
          Email me a sign-in link instead
        </button>
      </div>

      {err ? <p className="text-sm text-danger">{err}</p> : null}
      {msg ? <p className="text-sm text-ok">{msg}</p> : null}

      <button
        className="text-sm text-cloud-muted underline"
        onClick={() => setMode((m) => (m === "sign_in" ? "sign_up" : "sign_in"))}
      >
        {mode === "sign_in" ? "Need an account? Sign up" : "Have an account? Sign in"}
      </button>

      <Link href="/today" className="text-center text-xs text-cloud-faint underline">
        Or explore the synthetic demo without an account
      </Link>
    </main>
  );
}
