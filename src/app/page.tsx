import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/config";

export default function LandingPage() {
  const supabaseReady = isSupabaseConfigured();
  return (
    <main className="mx-auto flex min-h-screen max-w-app flex-col justify-center gap-6 px-4 py-10">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-teal">AION Wealth OS</p>
        <h1 className="mt-2 text-3xl font-bold leading-tight text-cloud">
          Understand your finances. Take one clear step at a time.
        </h1>
        <p className="mt-3 text-cloud-muted">
          A mobile-first workspace that helps you see your actual position, fix foundation gaps,
          evaluate forming a business, and complete an evidence-backed 30-day plan — learning why
          each step matters as you go.
        </p>
      </div>

      <div className="rounded-2xl border border-ink-line bg-ink-card p-4">
        <p className="text-sm font-semibold text-cloud">Try it now — synthetic demo</p>
        <p className="mt-1 text-sm text-cloud-muted">
          Explore the full loop with clearly-labeled <strong>synthetic</strong> data. No account or
          credentials required. Nothing here is real financial information.
        </p>
        <Link
          href="/today"
          className="mt-3 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-teal px-5 py-2 text-sm font-semibold text-ink transition hover:bg-teal/90"
        >
          Open the demo workspace →
        </Link>
      </div>

      <div className="rounded-2xl border border-ink-line bg-ink-soft p-4">
        <p className="text-sm font-semibold text-cloud">Real user mode</p>
        {supabaseReady ? (
          <p className="mt-1 text-sm text-cloud-muted">
            Authenticated persistence is configured. Real financial information is stored securely
            server-side with row-level security — never silently in your browser.
          </p>
        ) : (
          <p className="mt-1 text-sm text-cloud-muted">
            Not configured yet. Real user mode requires Supabase Auth + Postgres. See{" "}
            <code className="rounded bg-ink px-1 py-0.5 text-xs">.env.example</code> and the README
            setup steps. Until configured, only the synthetic demo is available — we won&apos;t fake a
            sign-in or store real data locally.
          </p>
        )}
      </div>

      <p className="text-xs leading-relaxed text-cloud-faint">
        Educational only. AION Wealth OS is not a licensed wealth manager, credit-repair service, or
        law/accounting firm, and this is not legal, tax, or financial advice. No credit scores,
        approval odds, or guaranteed outcomes are ever produced.
      </p>
    </main>
  );
}
