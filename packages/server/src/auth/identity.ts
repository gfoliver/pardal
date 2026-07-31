import { hmacHex, sha256Hex } from "../crypto.js";
import type { Env } from "../env.js";

/**
 * Normalise a username for comparison and for salt derivation.
 *
 * NFKC then casefold, and the two together matter: NFKC alone leaves `Gabriel` and
 * `GABRIEL` distinct, and casefold alone leaves the many Unicode ways of writing the
 * same letter distinct. Together they stop an account being impersonated by a
 * homoglyph — `GabrieI` with a capital i is a different string and the same word to
 * every reader.
 *
 * The normalised form is what the UNIQUE index is on and what the salt is derived from.
 * The form the user typed is kept only for display.
 */
export function normaliseUsername(raw: string): string {
  return raw.normalize("NFKC").toLowerCase().trim();
}

export interface UsernameProblem {
  readonly reason: "tooShort" | "tooLong" | "charset";
  readonly detail: string;
}

/** Usernames are deliberately boring: they are an identity, not a display name. */
export function validateUsername(raw: string): UsernameProblem | null {
  const norm = normaliseUsername(raw);
  if (norm.length < 3) return { reason: "tooShort", detail: "at least 3 characters" };
  if (norm.length > 24) return { reason: "tooLong", detail: "at most 24 characters" };
  if (!/^[a-z0-9._-]+$/.test(norm)) {
    return { reason: "charset", detail: "letters, digits, dot, underscore or hyphen" };
  }
  return null;
}

/**
 * The salt a client stretches its password with — DERIVED, never stored.
 *
 * This is what makes the salt endpoint useless for enumeration. A stored random salt
 * forces a choice between looking up a row (and answering differently for an account
 * that does not exist) or inventing one (which must then be stable per username, or two
 * requests reveal the difference). Deriving it from the username with a server key
 * answers instantly, identically, and without touching the database, for every string
 * anyone cares to try.
 */
export function deriveSalt(env: Env, username: string): Promise<string> {
  return hmacHex(env.SALT_KEY, `fut/salt/v1:${normaliseUsername(username)}`);
}

/**
 * What gets stored for a password.
 *
 * The input is the client's DERIVED KEY, not a password: the device already ran
 * PBKDF2-SHA256 600k times over the password and the salt above. So a single peppered
 * SHA-256 here is enough — brute-forcing a 256-bit input is not a thing — and it is
 * cheap enough to fit the free plan's 10ms CPU budget, which server-side stretching
 * flatly would not.
 *
 * Be clear about what this does and does not buy. It does NOT protect the wire: the
 * derived key is a password equivalent, and anyone who sees it can replay it forever.
 * TLS covers the wire; it does not cover our own request logs or a future XSS on the
 * origin, which is why the key is exchanged ONCE for a short-lived token and never
 * sent again. What it does buy is real: the plaintext password never leaves the
 * device, so a leaked table or a leaked log does not hand over a password the user
 * also uses at their bank.
 */
export function storedPasswordHash(env: Env, derivedKey: string): Promise<string> {
  return sha256Hex(`${env.PEPPER}:pw:${derivedKey}`);
}

/** Same treatment for the one-time recovery code. */
export function storedRecoveryHash(env: Env, normalisedCode: string): Promise<string> {
  return sha256Hex(`${env.PEPPER}:recovery:${normalisedCode}`);
}

/** Refresh tokens are stored hashed, so a leaked table cannot be used to log in. */
export function storedTokenHash(token: string): Promise<string> {
  return sha256Hex(`fut/refresh/v1:${token}`);
}
