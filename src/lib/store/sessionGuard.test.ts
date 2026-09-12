import { describe, it, expect } from "vitest";
import { SessionGuard } from "./sessionGuard";

/** Flush pending microtasks so queued work has a chance to start. */
const tick = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

const defer = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe("SessionGuard — generation guarding", () => {
  it("applies a result when the generation is unchanged", async () => {
    const g = new SessionGuard();
    const out = await g.run(async () => "saved");
    expect(out).toEqual({ status: "ok", value: "saved" });
  });

  it("discards a result when the session changed MID-flight", async () => {
    const g = new SessionGuard();
    const d = defer<string>();
    const pending = g.run(() => d.promise);
    g.bump(); // e.g. the user signed out / switched accounts
    d.resolve("previous account bundle");
    await expect(pending).resolves.toEqual({ status: "stale" });
  });

  it("never even starts work issued under an older generation", async () => {
    const g = new SessionGuard();
    const block = defer<void>();
    void g.run(() => block.promise); // occupies the queue
    let ran = false;
    const queued = g.run(async () => {
      ran = true;
      return "should not run";
    });
    g.bump();
    block.resolve();
    await expect(queued).resolves.toEqual({ status: "stale" });
    expect(ran).toBe(false);
  });

  it("reports errors instead of swallowing them", async () => {
    const g = new SessionGuard();
    const out = await g.run(async () => {
      throw new Error("AUTH_REQUIRED");
    });
    expect(out.status).toBe("error");
    expect((out as { error: Error }).error.message).toBe("AUTH_REQUIRED");
  });

  it("a rejected task does not break the queue for later writes", async () => {
    const g = new SessionGuard();
    await g.run(async () => {
      throw new Error("boom");
    });
    await expect(g.run(async () => "next")).resolves.toEqual({ status: "ok", value: "next" });
  });
});

describe("SessionGuard — serialization", () => {
  it("runs writes one at a time, in issue order", async () => {
    const g = new SessionGuard();
    const order: string[] = [];
    const slow = defer<void>();

    const first = g.run(async () => {
      order.push("first:start");
      await slow.promise;
      order.push("first:end");
      return 1;
    });
    const second = g.run(async () => {
      order.push("second:start");
      return 2;
    });

    // The second write must not begin until the first finishes.
    await tick();
    expect(order).toEqual(["first:start"]);
    slow.resolve();
    await Promise.all([first, second]);
    expect(order).toEqual(["first:start", "first:end", "second:start"]);
  });

  it("an older slow response cannot land after a newer write", async () => {
    const g = new SessionGuard();
    const applied: number[] = [];
    const slow = defer<void>();

    const a = g.run(async () => {
      await slow.promise;
      return 1;
    });
    const b = g.run(async () => 2);

    slow.resolve();
    const [ra, rb] = await Promise.all([a, b]);
    if (ra.status === "ok") applied.push(ra.value);
    if (rb.status === "ok") applied.push(rb.value);
    expect(applied).toEqual([1, 2]); // strictly ordered, newest last
  });
});
