/**
 * Real-mode browser journey against a DISPOSABLE Supabase instance — in CI, a
 * local Supabase started fresh for the run (see .github/workflows/ci.yml):
 *   sign in -> onboarding save -> snapshot save -> complete an action ->
 *   reload (persistence) -> export -> delete my data (verified empty).
 *
 * Two rules this script enforces on itself:
 *  1. It NEVER runs against the production project. It refuses if the target
 *     URL matches the one committed in .env.production.
 *  2. If the disposable environment is not configured it reports NOT RUN and
 *     exits neutrally. A gate whose dependencies are missing is never reported
 *     as passed.
 */
import fs from "node:fs";
import { spawn, spawnSync } from "node:child_process";

const REQUIRED = ["E2E_SUPABASE_URL", "E2E_SUPABASE_ANON_KEY", "E2E_EMAIL", "E2E_PASSWORD"];
const missing = REQUIRED.filter((k) => !process.env[k]);

if (missing.length) {
  // CI boots a local Supabase for every run, so there the credentials must
  // exist; their absence means the setup broke, and that must fail the job
  // rather than pass it neutrally.
  if (process.env.E2E_REQUIRED === "1") {
    console.error("FAILED: real-mode browser journey could not start");
    console.error(`  reason: missing ${missing.join(", ")} although E2E_REQUIRED=1`);
    process.exit(1);
  }
  console.log("NOT RUN: real-mode browser journey");
  console.log(`  reason: missing ${missing.join(", ")}`);
  console.log("  This gate requires a disposable Supabase project. It has NOT passed.");
  process.exit(0);
}

// --- production guard -------------------------------------------------------
const prodEnv = fs.existsSync(".env.production") ? fs.readFileSync(".env.production", "utf8") : "";
const prodUrl = (prodEnv.match(/^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m)?.[1] ?? "").trim();
const target = process.env.E2E_SUPABASE_URL.trim();
if (prodUrl && target === prodUrl) {
  console.error("REFUSING: E2E_SUPABASE_URL points at the production project.");
  console.error("This journey seeds and then DELETES data. Use a disposable project.");
  process.exit(2);
}

let playwright;
try {
  playwright = await import("playwright");
} catch {
  console.log("NOT RUN: playwright is not installed (npm i -D playwright).");
  console.log("  This gate has NOT passed.");
  process.exit(0);
}

const PORT = process.env.E2E_PORT ?? "3399";
const BASE = `http://localhost:${PORT}`;
const BACKUP = ".env.local.e2e-backup";
let restored = false;

function restoreEnv() {
  if (restored) return;
  restored = true;
  try {
    if (fs.existsSync(BACKUP)) {
      fs.renameSync(BACKUP, ".env.local");
    } else if (fs.existsSync(".env.local")) {
      fs.unlinkSync(".env.local");
    }
  } catch {
    /* best effort */
  }
}
process.on("exit", restoreEnv);
process.on("SIGINT", () => { restoreEnv(); process.exit(130); });

// NEXT_PUBLIC_* values are inlined at BUILD time, so we must build against the
// disposable project rather than only setting them at runtime.
if (fs.existsSync(".env.local")) fs.renameSync(".env.local", BACKUP);
fs.writeFileSync(
  ".env.local",
  `NEXT_PUBLIC_SUPABASE_URL=${target}\nNEXT_PUBLIC_SUPABASE_ANON_KEY=${process.env.E2E_SUPABASE_ANON_KEY}\n`,
);

console.log("==> building against the disposable project");
const build = spawnSync("npx", ["next", "build"], { stdio: "inherit" });
if (build.status !== 0) {
  console.error("BUILD FAILED — journey not run");
  process.exit(1);
}

// Server output is kept, not discarded: errors thrown inside server actions
// only ever appear here, never in the browser.
const ART = "e2e-artifacts";
fs.mkdirSync(ART, { recursive: true });
const serverLog = fs.openSync(`${ART}/next-server.log`, "w");
const server = spawn("npx", ["next", "start", "-p", PORT], {
  stdio: ["ignore", serverLog, serverLog],
  detached: true,
});
const stop = () => { try { process.kill(-server.pid); } catch { /* already gone */ } };

let failures = 0;
let page = null;
const browserErrors = [];
const check = async (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}${detail ? ` — ${detail}` : ""}`);
  if (ok) return;
  failures += 1;
  if (!page) return;
  // What the user would have seen at the moment of failure.
  const slug = name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  await page.screenshot({ path: `${ART}/${slug}.png`, fullPage: true }).catch(() => {});
  const alerts = await page.getByRole("alert").allInnerTexts().catch(() => []);
  const shown = alerts.map((a) => a.trim()).filter(Boolean);
  if (shown.length) console.log(`  on-screen error: ${shown.join(" | ")}`);
  console.log(`  url: ${page.url()} · screenshot: ${ART}/${slug}.png`);
};

try {
  // wait for the server
  for (let i = 0; i < 40; i += 1) {
    try {
      const r = await fetch(`${BASE}/signin`);
      if (r.ok) break;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }

  const browser = await playwright.chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? undefined,
    args: ["--no-sandbox"],
  });
  page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  page.on("pageerror", (e) => browserErrors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") browserErrors.push(`console: ${m.text()}`); });

  // 1. sign in
  await page.goto(`${BASE}/signin`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', process.env.E2E_EMAIL);
  await page.fill('input[type="password"]', process.env.E2E_PASSWORD);
  await page.getByRole("button", { name: /^Sign in$/ }).click();
  await page.waitForTimeout(3000);
  await check("signed in reaches real mode", !(await page.locator("text=Choose how to start").isVisible().catch(() => true)));

  // 2. onboarding save (must await persistence before navigating)
  await page.goto(`${BASE}/onboarding`, { waitUntil: "networkidle" });
  await page.selectOption("select >> nth=0", "NY").catch(() => {});
  await page.getByRole("button", { name: /Save & add my finances/ }).click();
  await page.waitForURL(/\/finances/, { timeout: 15000 }).catch(() => {});
  await check("onboarding navigates only after a confirmed save", /\/finances/.test(page.url()));

  // 3. snapshot save
  await page.getByRole("tab", { name: /Edit snapshot/ }).click();
  const money = page.locator('input[inputmode="decimal"]');
  await money.first().waitFor({ state: "visible", timeout: 10000 });
  await money.nth(0).fill("4200");
  await money.nth(1).fill("2600");
  await money.nth(3).fill("550");
  await money.nth(4).fill("1800");
  const saveBtn = page.getByRole("button", { name: /Save snapshot/ });
  await check("snapshot form accepts the figures", await saveBtn.isEnabled());
  await saveBtn.click();
  // Success moves the user to Overview showing the new snapshot; the inline
  // "Saved." message unmounts with its tab, so it can't be the evidence.
  // Reload so the check proves the row persisted, not just that state changed.
  await page.getByText(/Snapshot as of/).waitFor({ timeout: 15000 }).catch(() => {});
  const shownBeforeReload = await page.getByText(/Snapshot as of/).isVisible().catch(() => false);
  await check("snapshot save confirmed", shownBeforeReload);
  await page.reload({ waitUntil: "networkidle" });
  await page.getByText(/Snapshot as of/).waitFor({ timeout: 15000 }).catch(() => {});
  await check(
    "snapshot persisted across reload",
    await page.getByText(/Snapshot as of/).isVisible().catch(() => false),
  );

  // 4. complete an action, then reload
  await page.goto(`${BASE}/today`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const gate = page.getByRole("button", { name: /Continue to my plan/ });
  if (await gate.isVisible().catch(() => false)) { await gate.click(); await page.waitForTimeout(1000); }
  await page.getByRole("button", { name: /Mark done \(self-reported\)/ }).first().click();
  await page.waitForTimeout(2500);
  const progress = await page.locator("text=/\\d \\/ \\d complete/").first().textContent();
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  const afterReload = await page.locator("text=/\\d \\/ \\d complete/").first().textContent();
  await check("completion survives reload in real mode", progress === afterReload, `${progress} -> ${afterReload}`);

  // 5. export
  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
  const dl = page.waitForEvent("download", { timeout: 15000 }).catch(() => null);
  await page.getByRole("button", { name: /Download plan \+ data/ }).click();
  await check("export produces a file", (await dl) !== null);

  // 6. delete my data (requires password re-entry) and verify emptiness
  await page.getByRole("button", { name: /^Delete my data$/ }).click();
  await page.fill('input[type="password"]', process.env.E2E_PASSWORD);
  await page.getByRole("button", { name: /Permanently delete my data/ }).click();
  await page.waitForTimeout(5000);
  await check("deletion reports verified success", await page.locator("text=Deleted and verified").isVisible().catch(() => false));
  await page.goto(`${BASE}/today`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await check("no records remain after deletion", await page.locator("text=No data yet").isVisible().catch(() => false));

  await browser.close();
} finally {
  stop();
  restoreEnv();
}

if (failures) {
  if (browserErrors.length) {
    console.error("--- browser errors ---");
    for (const e of browserErrors.slice(-20)) console.error(e);
  }
  try {
    const tail = fs.readFileSync(`${ART}/next-server.log`, "utf8").split("\n").slice(-60).join("\n");
    console.error("--- next server log (tail) ---\n" + tail);
  } catch { /* no log */ }
  console.error(`REAL-MODE JOURNEY FAILED (${failures} check(s))`);
  process.exit(1);
}
console.log("REAL-MODE JOURNEY PASSED");
