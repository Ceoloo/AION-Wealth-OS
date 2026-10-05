import { NextResponse } from "next/server";
import { plaidServiceDeps } from "@/lib/plaid/server";
import { handleWebhook, type PlaidWebhook } from "@/lib/plaid/service";
import { cachedKeyFetcher, verifyPlaidWebhook } from "@/lib/plaid/webhookVerify";

/**
 * Plaid webhook receiver. Nothing in the request is trusted until its
 * signature is verified (see webhookVerify.ts). Responses never say why a
 * request was refused.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 64 * 1024;

let fetchKey: ReturnType<typeof cachedKeyFetcher> | null = null;

export async function POST(request: Request): Promise<Response> {
  const deps = plaidServiceDeps();
  if (!deps) return new NextResponse(null, { status: 404 });

  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > MAX_BODY_BYTES) return new NextResponse(null, { status: 413 });
  // Verify against the exact bytes received: re-serialising parsed JSON would
  // change the hash.
  const body = await request.text();
  if (body.length > MAX_BODY_BYTES) return new NextResponse(null, { status: 413 });

  fetchKey ??= cachedKeyFetcher((kid) => deps.plaid.getWebhookVerificationKey(kid));
  const verified = await verifyPlaidWebhook({
    body,
    jwt: request.headers.get("plaid-verification"),
    getKey: fetchKey,
  });
  if (!verified.ok) {
    console.warn("[plaid webhook] rejected:", verified.reason);
    return new NextResponse(null, { status: 401 });
  }

  let payload: PlaidWebhook;
  try {
    payload = JSON.parse(body) as PlaidWebhook;
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  try {
    const outcome = await handleWebhook(deps, payload);
    return NextResponse.json({ received: true, outcome });
  } catch (err) {
    console.error("[plaid webhook] failed:", err instanceof Error ? err.message : "unknown");
    // 500 lets Plaid retry a transient failure.
    return new NextResponse(null, { status: 500 });
  }
}
