import { canonicalJson } from "./canonical.js";

/**
 * Domain-separated hashing.
 *
 * Every hash in the protocol is tagged with what it is FOR, and the tag is part of
 * the preimage. Without that, a hash computed for one purpose is a valid hash for
 * another: a sealed lineup commitment could be replayed as a lineup commitment for a
 * different fixture, or a result root could be presented as an input hash. The tag
 * costs nothing and removes a whole class of confusion attack.
 *
 * The tag is length-prefixed rather than merely separated. A separator alone is
 * ambiguous the moment a tag could contain it; a length prefix cannot be confused
 * whatever the tags are, so nobody has to remember the rule.
 *
 * SHA-256 through WebCrypto, which is present and identical in Node, browsers and
 * workerd — no vendored crypto to keep in step.
 */

/** The purposes a hash may be taken for. Add a case rather than reusing one. */
export const HashDomain = {
  /** A team's sealed submission for one fixture. */
  Lineup: "fut/lineup/v1",
  /** The full, frozen input a match is played from. */
  MatchInput: "fut/match-input/v1",
  /** The squad data (every attribute) the input's ids resolve against. */
  RosterSnapshot: "fut/roster/v1",
  /**
   * A whole dataset artifact — every club, player and attribute the game reads.
   *
   * Separate from `RosterSnapshot` on purpose: that one identifies the squads ONE match resolves
   * against, this one identifies the world both clients loaded. Two players holding different builds
   * of "Brasileirão version 1" is a mismatch nobody can diagnose from a version string, so the string
   * is a content hash.
   */
  Dataset: "fut/dataset/v1",
  /** A completed match's full report — what attesters compare. */
  ResultRoot: "fut/result/v1",
  /** A prefix of the event list, for locating the first divergence. */
  EventPrefix: "fut/event-prefix/v1",
  /** A draft's pick order, published before the draft starts. */
  DraftOrder: "fut/draft-order/v1",
  /** The player pool a draft may pick from. */
  DraftPool: "fut/draft-pool/v1",
} as const;

export type HashDomain = (typeof HashDomain)[keyof typeof HashDomain];

const encoder = new TextEncoder();

function hex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let out = "";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
}

/** SHA-256 of `domain` (length-prefixed) followed by `value` in canonical JSON. */
export async function digest(domain: HashDomain, value: unknown): Promise<string> {
  const body = canonicalJson(value);
  const preimage = `${domain.length}:${domain}${body}`;
  return hex(await crypto.subtle.digest("SHA-256", encoder.encode(preimage)));
}

/**
 * A running hash over a sequence, exposing the digest after each element.
 *
 * This is how two disagreeing attesters find the FIRST event they differ on in
 * O(log n) round trips instead of uploading a whole match: they binary-search the
 * prefix digests. Reporting every difference after the first is useless — once one
 * event differs the two are different matches — so the value here is diagnosis:
 * telling a genuine engine bug apart from a version skew apart from a forged report.
 */
export async function prefixChain(domain: HashDomain, items: readonly unknown[]): Promise<string[]> {
  const out: string[] = [];
  let acc = `${domain.length}:${domain}`;
  for (const item of items) {
    acc = hex(await crypto.subtle.digest("SHA-256", encoder.encode(acc + canonicalJson(item))));
    out.push(acc);
  }
  return out;
}

/**
 * Index of the first position at which two prefix chains differ, or `null` if one is
 * simply a continuation of the other (or they are identical).
 */
export function firstDivergence(a: readonly string[], b: readonly string[]): number | null {
  const shared = Math.min(a.length, b.length);
  for (let i = 0; i < shared; i++) {
    if (a[i] !== b[i]) return i;
  }
  return null;
}
