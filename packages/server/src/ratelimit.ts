import type { Env } from "./env.js";

/**
 * Rate limiting in three layers, because they defend different things.
 *
 * The threat that actually matters here is not a stolen account — it is a login flood
 * spending the free plan's 100,000 requests a day and taking the whole API down until
 * midnight UTC. On the free plan volume cannot produce a bill, so it produces an
 * outage instead, and that is the thing to spend effort on.
 *
 *  1. An isolate-local counter. Free, synchronous, and stops an obvious flood before it
 *     reaches anything that costs quota. It only sees one isolate, so it is a filter and
 *     not a limit — which is fine, because that is all it is asked to be.
 *  2. The Rate Limiting binding, by IP. Runs inside the Worker, needs no zone, works on
 *     *.workers.dev, and shields the D1 and Durable Object allowances.
 *  3. A Durable Object token bucket per username, for the one thing the others cannot
 *     do: count attempts against an ACCOUNT rather than a caller.
 *
 * Never KV for any of it. Its free allowance is 1,000 writes a day — exhausted almost
 * immediately by a counter — and it is eventually consistent, which rate-limits nothing.
 */

/**
 * The IP Cloudflare saw, or `null` if we cannot tell.
 *
 * Not knowing has to be handled deliberately rather than by falling back to a constant.
 * Keying a bucket on a placeholder puts every unidentifiable caller in ONE bucket, where
 * they lock each other out — a collateral outage triggered by a missing header. The edge
 * always sets `cf-connecting-ip` and a client cannot strip it, so in production this is
 * never null; when it is, the caller-based layers stand down and the ACCOUNT-based layer
 * (which does not need an IP) still protects login.
 */
export function identifiedIp(request: Request): string | null {
  return request.headers.get("cf-connecting-ip");
}

/** Layer 1. Per-isolate, resets whenever the isolate is recycled. */
const isolateHits = new Map<string, { count: number; resetAt: number }>();

export function isolateAllows(key: string, limit: number, windowMs: number, now: number): boolean {
  const entry = isolateHits.get(key);
  if (!entry || now >= entry.resetAt) {
    isolateHits.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  entry.count += 1;
  // Unbounded growth is the one way this layer could hurt rather than help; the map is
  // per-isolate and short-lived, but a pathological key space would still bloat it.
  if (isolateHits.size > 10_000) isolateHits.clear();
  return entry.count <= limit;
}

/** Layer 2. The binding is absent in some test setups, where it fails open by design. */
export async function ipAllows(env: Env, ip: string): Promise<boolean> {
  if (!env.IP_LIMIT) return true;
  const { success } = await env.IP_LIMIT.limit({ key: ip });
  return success;
}

/** Layer 3. Per-account, and therefore per-username rather than per-caller. */
export async function accountAllows(env: Env, usernameNorm: string): Promise<boolean> {
  const id = env.RATE_LIMITER.idFromName(`login:${usernameNorm}`);
  const stub = env.RATE_LIMITER.get(id);
  const response = await stub.fetch("https://rate-limiter/consume");
  const body = (await response.json()) as { allowed: boolean };
  return body.allowed;
}
