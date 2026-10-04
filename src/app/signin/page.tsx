"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, EyeOff, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spotlight } from "@/components/ui/spotlight-new";
import { Field, InlineError } from "@/components/app/primitives";
import { Logo } from "@/components/brand/Logo";

export default function SignInPage() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [mode, setMode] = useState<"sign_in" | "sign_up">("sign_in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const ids = { email: useId(), password: useId() };

  // Setup state: real mode isn't configured, so we don't fake a sign-in.
  if (!supabase) {
    return (
      <AuthLayout>
        <h1 className="text-2xl font-semibold tracking-tight">Real user mode isn&apos;t set up</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This build has no Supabase configuration, so authenticated accounts aren&apos;t available
          yet. Set <code className="rounded bg-secondary px-1.5 py-0.5 text-xs">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code className="rounded bg-secondary px-1.5 py-0.5 text-xs">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> (see
          the README), then run the migrations. Until then, use the synthetic demo.
        </p>
        <Button asChild className="mt-6">
          <Link href="/today">
            Open the demo instead
            <ArrowRight data-icon="inline-end" />
          </Link>
        </Button>
      </AuthLayout>
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
    <AuthLayout>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        {mode === "sign_in" ? "Sign in" : "Create your account"}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground text-pretty">
        Real user mode stores your data securely with row-level security — never silently in your
        browser.
      </p>

      {/* A real form, so Enter submits — the previous page only submitted on click. */}
      <form
        className="mt-7 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy && email && password) void submit();
        }}
      >
        <Field label="Email" htmlFor={ids.email}>
          <Input
            id={ids.email}
            type="email"
            placeholder="you@example.com"
            value={email}
            autoComplete="email"
            required
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Password" htmlFor={ids.password}>
          <Input
            id={ids.password}
            type="password"
            placeholder="Password"
            value={password}
            autoComplete={mode === "sign_in" ? "current-password" : "new-password"}
            required
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Button type="submit" size="lg" className="w-full" disabled={busy || !email || !password}>
          {busy ? "Working…" : mode === "sign_in" ? "Sign in" : "Create account"}
        </Button>
        <Button type="button" variant="ghost" className="w-full" disabled={busy} onClick={magicLink}>
          <Mail data-icon="inline-start" />
          Email me a sign-in link instead
        </Button>
      </form>

      <div className="mt-4 space-y-3" aria-live="polite">
        {err ? <InlineError>{err}</InlineError> : null}
        {msg ? (
          <p className="flex items-start gap-2 rounded-lg border border-success/25 bg-success-surface px-3 py-2 text-sm text-success">
            <Check className="mt-0.5 size-4 shrink-0" />
            {msg}
          </p>
        ) : null}
      </div>

      <div className="mt-6 space-y-3 border-t border-border pt-6 text-center">
        <button
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => setMode((m) => (m === "sign_in" ? "sign_up" : "sign_in"))}
        >
          {mode === "sign_in" ? (
            <>
              Need an account? <span className="font-medium text-primary">Sign up</span>
            </>
          ) : (
            <>
              Have an account? <span className="font-medium text-primary">Sign in</span>
            </>
          )}
        </button>
        <p>
          <Link href="/today" className="text-xs text-subtle underline hover:text-muted-foreground">
            Or explore the synthetic demo without an account
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}

/**
 * Split auth layout: a brand panel on wide screens, a single focused column on
 * phones. The panel repeats only promises the product already makes elsewhere.
 */
function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden border-r border-border bg-panel lg:flex lg:flex-col lg:justify-between lg:p-12">
        <Spotlight
          gradientFirst="radial-gradient(68.54% 68.72% at 55.02% 31.46%, hsla(174, 80%, 70%, .10) 0, hsla(174, 80%, 50%, .03) 50%, hsla(174, 80%, 40%, 0) 80%)"
          gradientSecond="radial-gradient(50% 50% at 50% 50%, hsla(174, 80%, 70%, .07) 0, hsla(174, 80%, 50%, .02) 80%, transparent 100%)"
          gradientThird="radial-gradient(50% 50% at 50% 50%, hsla(210, 80%, 70%, .05) 0, hsla(210, 80%, 45%, .02) 80%, transparent 100%)"
          duration={10}
        />
        <div aria-hidden className="ground-dots absolute inset-0" />
        <Link href="/" className="relative">
          <Logo />
        </Link>
        <div className="relative max-w-md">
          <p className="text-3xl font-semibold tracking-tight text-balance">
            Understand your finances. Take one clear step at a time.
          </p>
          <ul className="mt-8 space-y-4 text-sm text-muted-foreground">
            <li className="flex gap-3">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
              Real user mode stores your data securely with row-level security — never silently in your browser.
            </li>
            <li className="flex gap-3">
              <EyeOff className="mt-0.5 size-4 shrink-0 text-primary" />
              We never ask for bank logins, SSNs, full account numbers, identity documents, or credit-report uploads.
            </li>
            <li className="flex gap-3">
              <LockKeyhole className="mt-0.5 size-4 shrink-0 text-primary" />
              No credit scores, approval odds, or guaranteed outcomes are ever produced.
            </li>
          </ul>
        </div>
        <p className="relative text-xs text-subtle">Educational only — not legal, tax, or financial advice.</p>
      </aside>

      <section className="relative flex flex-col px-5 py-6 sm:px-10">
        <div aria-hidden className="ground-dots pointer-events-none absolute inset-x-0 top-0 h-80 lg:hidden" />
        <div className="relative flex items-center justify-between lg:justify-end">
          <Link href="/" className="lg:hidden" aria-label="AION Wealth OS home">
            <Logo />
          </Link>
          <Link href="/today" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3.5" />
            Back
          </Link>
        </div>
        <div className="relative mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">{children}</div>
      </section>
    </main>
  );
}
