import Link from "next/link";
import { ArrowRight, FlaskConical, LockKeyhole } from "lucide-react";
import { isSupabaseConfigured } from "@/lib/config";
import { Button } from "@/components/ui/button";
import { Spotlight } from "@/components/ui/spotlight-new";
import { Logo } from "@/components/brand/Logo";

export default function LandingPage() {
  const supabaseReady = isSupabaseConfigured();
  return (
    <main className="relative min-h-dvh overflow-hidden">
      <Spotlight
        gradientFirst="radial-gradient(68.54% 68.72% at 55.02% 31.46%, hsla(174, 80%, 70%, .10) 0, hsla(174, 80%, 50%, .03) 50%, hsla(174, 80%, 40%, 0) 80%)"
        gradientSecond="radial-gradient(50% 50% at 50% 50%, hsla(174, 80%, 70%, .07) 0, hsla(174, 80%, 50%, .02) 80%, transparent 100%)"
        gradientThird="radial-gradient(50% 50% at 50% 50%, hsla(210, 80%, 70%, .05) 0, hsla(210, 80%, 45%, .02) 80%, transparent 100%)"
        duration={10}
      />
      <div aria-hidden className="ground-dots pointer-events-none absolute inset-x-0 top-0 h-[640px]" />

      <div className="relative mx-auto flex min-h-dvh max-w-5xl flex-col px-5 sm:px-8">
        <header className="flex h-16 items-center justify-between">
          <Logo />
          {supabaseReady ? (
            <Button variant="ghost" size="sm" asChild>
              <Link href="/signin">Sign in</Link>
            </Button>
          ) : null}
        </header>

        <section className="flex flex-1 flex-col justify-center py-14 sm:py-20">
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl lg:leading-[1.05]">
            Understand your finances. Take one clear step at a time.
          </h1>
          <p className="mt-5 max-w-2xl text-base text-muted-foreground text-pretty sm:text-lg">
            A mobile-first workspace that helps you see your actual position, fix foundation gaps,
            evaluate forming a business, and complete an evidence-backed 30-day plan — learning why
            each step matters as you go.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col justify-between rounded-2xl bg-card p-6 ring-1 ring-foreground/[0.07] shadow-[inset_0_1px_0_oklch(1_0_0/5%),0_10px_30px_-14px_oklch(0_0_0/55%)]">
              <div>
                <span className="flex size-10 items-center justify-center rounded-xl bg-warning-surface text-warning">
                  <FlaskConical className="size-5" />
                </span>
                <p className="mt-4 font-semibold">Try it now — synthetic demo</p>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Explore the full loop with clearly-labeled <strong className="text-foreground">synthetic</strong>{" "}
                  data. No account or credentials required. Nothing here is real financial information.
                </p>
              </div>
              <Button asChild className="mt-6 w-full">
                <Link href="/today">
                  Open the demo workspace
                  <ArrowRight data-icon="inline-end" />
                </Link>
              </Button>
            </div>

            <div className="flex flex-col justify-between rounded-2xl bg-card p-6 ring-1 ring-foreground/[0.07] shadow-[inset_0_1px_0_oklch(1_0_0/5%),0_10px_30px_-14px_oklch(0_0_0/55%)]">
              <div>
                <span className="flex size-10 items-center justify-center rounded-xl bg-brand-surface text-primary">
                  <LockKeyhole className="size-5" />
                </span>
                <p className="mt-4 font-semibold">Real user mode</p>
                {supabaseReady ? (
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    Authenticated persistence is configured. Real financial information is stored
                    securely server-side with row-level security — never silently in your browser.
                  </p>
                ) : (
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    Not configured yet. Real user mode requires Supabase Auth + Postgres. See{" "}
                    <code className="rounded bg-secondary px-1.5 py-0.5 text-xs">.env.example</code> and
                    the README setup steps. Until configured, only the synthetic demo is available — we
                    won&apos;t fake a sign-in or store real data locally.
                  </p>
                )}
              </div>
              {supabaseReady ? (
                <Button variant="secondary" asChild className="mt-6 w-full">
                  <Link href="/signin">
                    Sign in / create account
                    <ArrowRight data-icon="inline-end" />
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>
        </section>

        <footer className="border-t border-border py-6">
          <p className="max-w-3xl text-xs leading-relaxed text-subtle">
            Educational only. AION Wealth OS is not a licensed wealth manager, credit-repair service, or
            law/accounting firm, and this is not legal, tax, or financial advice. No credit scores,
            approval odds, or guaranteed outcomes are ever produced.
          </p>
        </footer>
      </div>
    </main>
  );
}
