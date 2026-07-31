const encoder = new TextEncoder();

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(input: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", encoder.encode(input)));
}

/** HMAC-SHA256, hex. Used for derived salts and for signing tokens. */
export async function hmacHex(key: string, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message)));
}

/**
 * Constant-time string comparison.
 *
 * `a === b` on a secret leaks its prefix through timing: it returns on the first
 * differing character, so an attacker who can measure the difference recovers a token
 * one character at a time. The cost of getting this right is four lines.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  // Length is not secret (all of ours are fixed-width), but the loop must not depend
  // on WHERE they differ.
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** A URL-safe random token with `bytes * 8` bits of entropy. */
export function randomToken(bytes = 32): string {
  const raw = new Uint8Array(bytes);
  crypto.getRandomValues(raw);
  return hex(raw.buffer);
}

/**
 * A human-transcribable recovery code: 128 bits, in groups of four, from an alphabet
 * with no 0/O or 1/I/L. Someone reads this off a screen and types it back months later,
 * possibly having written it on paper, so the characters that get confused are removed
 * rather than trusted to context.
 */
export function recoveryCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 31 symbols, ~4.95 bits each
  const raw = new Uint8Array(26); // 26 symbols ≈ 128 bits
  crypto.getRandomValues(raw);
  const symbols = [...raw].map((b) => alphabet[b % alphabet.length]!);
  return (symbols.join("").match(/.{1,4}/g) ?? []).join("-");
}

/** Normalise a recovery code for comparison: case and grouping are not part of it. */
export function normaliseRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
