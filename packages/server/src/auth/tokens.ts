import { hmacHex, timingSafeEqual } from "../crypto.js";
import type { Env } from "../env.js";

/**
 * Access tokens: signed, short-lived, and never stored.
 *
 * Not stored is the point. At 200 daily users doing a few sessions each, verifying
 * every request against a database row would spend the free plan's read allowance on
 * nothing but "yes, still you" — so the token carries its own claims and its own
 * expiry, and a normal request never touches D1 at all.
 *
 * The cost of that is that an access token cannot be revoked individually, which is
 * exactly why it lives for an hour and why REVOCATION lives on the refresh token, which
 * IS stored. Rotating `TOKEN_KEY` invalidates every access token at once, which is the
 * blunt instrument worth having.
 */

const ACCESS_TTL_SECONDS = 60 * 60;
export const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 30;

export interface AccessClaims {
  readonly userId: string;
  readonly kind: "guest" | "full";
  /** Unix seconds. */
  readonly exp: number;
}

function b64url(input: string): string {
  return btoa(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function unb64url(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  return atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
}

/**
 * `nowSeconds` is a parameter rather than read from the clock inside, so a test can
 * age a token without waiting an hour and so nothing here depends on when it ran.
 */
export async function signAccessToken(
  env: Env,
  claims: Omit<AccessClaims, "exp">,
  nowSeconds: number,
): Promise<string> {
  const payload: AccessClaims = { ...claims, exp: nowSeconds + ACCESS_TTL_SECONDS };
  const body = b64url(JSON.stringify(payload));
  const signature = await hmacHex(env.TOKEN_KEY, `fut/access/v1:${body}`);
  return `v1.${body}.${signature}`;
}

export type TokenFailure = "malformed" | "signature" | "expired";

export async function verifyAccessToken(
  env: Env,
  token: string,
  nowSeconds: number,
): Promise<{ claims: AccessClaims } | { error: TokenFailure }> {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return { error: "malformed" };
  const [, body, signature] = parts as [string, string, string];

  // Signature BEFORE parsing: the payload is attacker-controlled until it is verified,
  // so nothing should be decoded, trusted or logged from it first.
  const expected = await hmacHex(env.TOKEN_KEY, `fut/access/v1:${body}`);
  if (!timingSafeEqual(signature, expected)) return { error: "signature" };

  let claims: AccessClaims;
  try {
    claims = JSON.parse(unb64url(body)) as AccessClaims;
  } catch {
    return { error: "malformed" };
  }
  if (typeof claims.userId !== "string" || typeof claims.exp !== "number") {
    return { error: "malformed" };
  }
  if (claims.exp <= nowSeconds) return { error: "expired" };
  return { claims };
}
