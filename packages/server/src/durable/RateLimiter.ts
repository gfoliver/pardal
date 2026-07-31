/**
 * A token bucket per account, as a Durable Object.
 *
 * Two constraints shape this and both come from the free plan's Durable Object budget
 * of 13,000 GB-s a day — about 28 object-hours in total, across everything:
 *
 *  - **It never waits.** An awake object bills for every second it is alive, so there is
 *    no `setTimeout`, no polling and no keeping a socket open. State is read, mutated
 *    and returned inside a single invocation, and the bucket refills from ELAPSED TIME
 *    on the next call rather than being topped up by a timer.
 *  - **State lives in memory and is persisted after the decision**, not read back before
 *    it. Awaiting storage in the middle of a check-then-write is the classic Durable
 *    Object bug: the object is single-threaded between awaits, not across them, so a
 *    second request interleaves at exactly that point and both callers see the same
 *    remaining token.
 */

interface Bucket {
  tokens: number;
  updatedAt: number;
}

const CAPACITY = 10;
/** Milliseconds to earn one token back — 10 attempts, then one more every 30 seconds. */
const REFILL_MS = 30_000;

export class RateLimiter implements DurableObject {
  private bucket: Bucket | null = null;

  constructor(
    private readonly state: DurableObjectState,
    _env: unknown,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const now = Date.now();

    if (this.bucket === null) {
      this.bucket = (await this.state.storage.get<Bucket>("bucket")) ?? {
        tokens: CAPACITY,
        updatedAt: now,
      };
    }
    // Refill from elapsed time. This is what lets the object stay asleep between calls:
    // nothing has to happen while nobody is asking.
    const earned = Math.floor((now - this.bucket.updatedAt) / REFILL_MS);
    if (earned > 0) {
      this.bucket.tokens = Math.min(CAPACITY, this.bucket.tokens + earned);
      this.bucket.updatedAt = now;
    }

    if (url.pathname === "/peek") {
      return Response.json({ tokens: this.bucket.tokens });
    }

    // Decide first, THEN persist. No await between reading and mutating in-memory state.
    const allowed = this.bucket.tokens > 0;
    if (allowed) this.bucket.tokens -= 1;
    else if (earned === 0) {
      // A refused attempt still costs: it pushes the refill clock forward, so hammering
      // a locked account does not earn tokens back any faster.
      this.bucket.updatedAt = now;
    }
    await this.state.storage.put("bucket", this.bucket);

    return Response.json({
      allowed,
      tokens: this.bucket.tokens,
      retryAfterMs: allowed ? 0 : REFILL_MS - ((now - this.bucket.updatedAt) % REFILL_MS),
    });
  }

  /** Called after a successful login: a legitimate user should not stay throttled. */
  async reset(): Promise<void> {
    this.bucket = { tokens: CAPACITY, updatedAt: Date.now() };
    await this.state.storage.put("bucket", this.bucket);
  }
}
