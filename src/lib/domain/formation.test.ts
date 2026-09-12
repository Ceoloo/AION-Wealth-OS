import { describe, it, expect } from "vitest";
import { resolveChecklist, buildNewYorkChecklist } from "./formation";
import { isActionable, CONTENT_SOURCES, type ContentSource } from "./sources";

describe("NY formation checklist", () => {
  it("includes verified state fees from official sources", () => {
    const cl = buildNewYorkChecklist("2026-09-12");
    expect(cl.supported).toBe(true);
    const articles = cl.items.find((i) => i.id === "ny_articles");
    expect(articles?.stateFeeCents).toBe(20000); // $200 verified
    expect(articles?.sourceId).toBe("ny_articles");

    const pub = cl.items.find((i) => i.id === "ny_publication");
    expect(pub?.stateFeeCents).toBe(5000); // $50 certificate fee
    expect(pub?.deadline).toMatch(/120 days/);

    const biennial = cl.items.find((i) => i.id === "ny_recordkeeping_biennial");
    expect(biennial?.stateFeeCents).toBe(900); // $9
  });

  it("never marks checklist completion as creating the entity", () => {
    const cl = buildNewYorkChecklist("2026-09-12");
    const articles = cl.items.find((i) => i.id === "ny_articles");
    expect(articles?.explanation.toLowerCase()).toMatch(/not.*completing this checklist|creates the entity/);
  });
});

describe("acceptance #7 — stale/mismatched sources withhold instructions", () => {
  it("withholds NY fees when the source is stale relative to asOf", () => {
    // ny_articles has expiryDays 180; a date far in the future makes it stale.
    const cl = buildNewYorkChecklist("2030-01-01");
    const articles = cl.items.find((i) => i.id === "ny_articles");
    expect(articles?.stateFeeCents).toBeNull(); // withheld, not guessed
    expect(articles?.sourceId).toBeNull();
  });

  it("unsupported states get an honest handoff, not a fabricated checklist", () => {
    const cl = resolveChecklist("TX", "2026-09-12");
    expect(cl?.supported).toBe(false);
    expect(cl?.items.length).toBe(0);
    expect(cl?.unsupportedHandoff).toMatch(/TX/);
  });

  it("returns null when no state is chosen", () => {
    expect(resolveChecklist(null, "2026-09-12")).toBeNull();
  });
});

describe("source actionability gate", () => {
  const asOf = "2026-09-12";

  it("verified, in-jurisdiction, unexpired source is actionable", () => {
    expect(isActionable(CONTENT_SOURCES.ny_articles, { asOf, jurisdiction: "NY" })).toBe(true);
  });

  it("state source in wrong jurisdiction is not actionable", () => {
    expect(isActionable(CONTENT_SOURCES.ny_articles, { asOf, jurisdiction: "CA" })).toBe(false);
  });

  it("federal (US) source applies in any jurisdiction", () => {
    expect(isActionable(CONTENT_SOURCES.irs_llc, { asOf, jurisdiction: "CA" })).toBe(true);
  });

  it("unverified source is never actionable", () => {
    const s: ContentSource = { ...CONTENT_SOURCES.ny_articles!, status: "unverified" };
    expect(isActionable(s, { asOf, jurisdiction: "NY" })).toBe(false);
  });

  it("expired source is not actionable", () => {
    const s: ContentSource = { ...CONTENT_SOURCES.ny_articles!, reviewedAt: "2020-01-01" };
    expect(isActionable(s, { asOf, jurisdiction: "NY" })).toBe(false);
  });

  it("undefined source is not actionable", () => {
    expect(isActionable(undefined, { asOf, jurisdiction: "NY" })).toBe(false);
  });
});
