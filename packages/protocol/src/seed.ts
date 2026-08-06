import { digest, HashDomain, preimage } from "./hash.js";
import type { TeamInput } from "./match.js";

/**
 * Where a match's randomness comes from.
 *
 * The server cannot simulate: a spatial match is 6.3 seconds of CPU against a 10 ms budget per
 * invocation on the free plan, 440 times over. So it does not verify results — it draws the SEED and
 * publishes the inputs, and every client that runs them arrives at the same match. That makes this
 * function the load-bearing one in the whole model: whoever controls the seed controls the game.
 *
 * Two properties, and both are structural rather than a matter of care:
 *
 *  1. TIED TO THE LINEUPS. The lineup hashes are in the preimage, so changing a single instruction
 *     changes the seed. Nobody can hold a lineup back, look at the seed, and pick the version of his
 *     team that wins.
 *  2. NOT KNOWABLE EARLY. It is an HMAC under a server-held key, so no client can compute it, and the
 *     server only computes it when both lineups are sealed. Without the key this would be a public
 *     function of public inputs and every player could grind seeds before submitting.
 *
 * The two together are why a lineup is ONE-SHOT per fixture. If a lineup could be edited after the seed
 * is published, tying the seed to the lineups would not close a mining channel, it would open one: edit,
 * observe the new seed, edit again. Either lineups are final on submission (what we do — see the match
 * routes) or the seed is derived at a deadline nobody can submit after. There is no third option that
 * keeps property 1.
 *
 * WHAT IS NOT HERE, deliberately: no commit–reveal. It would only earn its keep if we did not trust the
 * server to keep a secret — but we already trust it to hold this key and draw this number, so a
 * client-side commitment adds a round trip and no guarantee. What a player actually wants is proof that
 * nothing was altered afterwards, and that comes from publishing the lineup hashes and the seed together
 * and immutably at the lock.
 */

/** Everything the seed is a function of. The key is separate: it is never part of a published record. */
export interface SeedInputs {
  readonly matchId: string;
  /** The simulation build. A different engine is a different match, so it gets a different seed. */
  readonly engineVersion: string;
  /** From {@link lineupHash} — the sealed submissions, in home/away order. */
  readonly homeLineupHash: string;
  readonly awayLineupHash: string;
}

/**
 * A sealed lineup's hash, bound to the fixture and the side it was submitted for.
 *
 * The binding is the point. A bare hash of the team is replayable: the same eleven submitted for a
 * different fixture, or entered as the other side, would produce the same commitment, and a commitment
 * that fits more than one situation commits to nothing. `matchId` and `teamId` are inside the preimage,
 * so a submission means "this team, this side, this fixture, this engine" and nothing else.
 */
export function lineupHash(args: {
  readonly matchId: string;
  readonly teamId: string;
  readonly engineVersion: string;
  readonly input: TeamInput;
}): Promise<string> {
  return digest(HashDomain.Lineup, {
    matchId: args.matchId,
    teamId: args.teamId,
    engineVersion: args.engineVersion,
    input: args.input,
  });
}

/**
 * The 32-bit seed the engines take, from an HMAC under the server's key.
 *
 * REDUCED BY TAKING THE FIRST FOUR BYTES, big-endian, of the 32-byte MAC. Written down because a
 * different reduction is a different match from the same inputs: this is as much part of the protocol as
 * the preimage is, and a future implementation that folded all 32 bytes together would silently
 * reproduce nothing. `SeededRandom` normalises with `>>> 0`, so the whole unsigned range is usable and
 * zero is an ordinary seed.
 */
export async function deriveSeed(secret: string, inputs: SeedInputs): Promise<number> {
  if (!secret) {
    // Louder than a fallback. A default key here would look like it worked and make every seed in the
    // deployment computable by anyone who read this file.
    throw new Error("deriveSeed: no server key — SERVER_SEED is not set");
  }
  const mac = await hmac(secret, preimage(HashDomain.Seed, inputs));
  return new DataView(mac).getUint32(0, false) >>> 0;
}

async function hmac(secret: string, message: Uint8Array): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", key, message);
}
