/**
 * The Worker's bindings and secrets.
 *
 * The binding list is short on purpose and enforced by `test/costZero.test.ts`: only
 * D1, a SQLite-backed Durable Object and the Rate Limiting binding, all of which are
 * free-plan features that REFUSE work at their quota rather than billing for it. R2,
 * Workers AI, Vectorize, Browser Rendering, Hyperdrive, Queues, Stream and Images are
 * not here and must not be added — see the test for the reasoning.
 */
export interface Env {
  /** The relational store. Small indexed rows; blobs live in single columns. */
  readonly DB: D1Database;

  /** Per-username token buckets, for what genuinely needs per-account state. */
  readonly RATE_LIMITER: DurableObjectNamespace;

  /**
   * Per-IP limiting that runs INSIDE the Worker, which is the point: it shields the D1
   * and Durable Object quotas from being spent before the day is out. Works on
   * *.workers.dev with no zone and at no cost.
   */
  readonly IP_LIMIT: RateLimit;

  /**
   * Derives each account's password salt from its username. Rotating it invalidates
   * every stored password hash, so treat it as permanent.
   */
  readonly SALT_KEY: string;

  /** Mixed into stored password and recovery hashes, so a leaked table is not enough. */
  readonly PEPPER: string;

  /** Signs access tokens. Rotating it logs everybody out, which is a feature. */
  readonly TOKEN_KEY: string;

  /** Mints match seeds. Must never leave the server: a known seed is a grindable seed. */
  readonly SERVER_SEED: string;

  /**
   * Origins allowed to call this API from a browser, comma-separated.
   *
   * The site is never the same origin as the Worker — `*.pages.dev` against `*.workers.dev` in
   * production — so without this every call is refused before it is sent. Localhost dev origins are
   * always allowed and do not need listing.
   */
  readonly ALLOWED_ORIGINS?: string;

  readonly ENVIRONMENT?: string;
}

/** The Rate Limiting binding's shape (it has no published type yet). */
export interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}
