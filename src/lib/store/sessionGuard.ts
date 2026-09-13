/**
 * Session generation + write serialization.
 *
 * Two correctness properties the app depends on:
 *  1. **Generation guarding** — every session activation (sign-in, sign-out,
 *     account switch, retry) bumps a generation counter. A load or mutation
 *     that was issued under an older generation must never apply its result,
 *     so a previous account's late response cannot populate a new session.
 *  2. **Serialization** — writes run one at a time, so an older response can
 *     never overwrite the state produced by a newer one.
 *
 * Kept free of React so it can be unit-tested directly.
 */

export type GuardOutcome<T> =
  | { status: "ok"; value: T }
  | { status: "stale" }
  | { status: "error"; error: unknown };

export class SessionGuard {
  private gen = 0;
  private chain: Promise<unknown> = Promise.resolve();

  /** The current session generation. */
  get generation(): number {
    return this.gen;
  }

  /** Invalidate everything in flight and start a new session generation. */
  bump(): number {
    this.gen += 1;
    return this.gen;
  }

  /**
   * Run `fn` serialized behind any earlier work. Returns `stale` — without
   * running `fn` at all — if the generation already moved on, and also discards
   * the result if the generation moves while `fn` is in flight.
   */
  run<T>(fn: () => Promise<T>): Promise<GuardOutcome<T>> {
    const issuedAt = this.gen;
    const task: Promise<GuardOutcome<T>> = this.chain.then(async () => {
      // Generation changed while queued: never even start the work.
      if (issuedAt !== this.gen) return { status: "stale" as const };
      try {
        const value = await fn();
        // Generation changed while running: drop the result on the floor.
        if (issuedAt !== this.gen) return { status: "stale" as const };
        return { status: "ok" as const, value };
      } catch (error) {
        if (issuedAt !== this.gen) return { status: "stale" as const };
        return { status: "error" as const, error };
      }
    });
    // Keep the chain unbroken even when a task rejects.
    this.chain = task.catch(() => undefined);
    return task;
  }
}
