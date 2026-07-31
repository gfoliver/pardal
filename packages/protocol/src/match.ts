import type { Position, TeamInstructions } from "@fut/domain";

/**
 * Which simulation plays a fixture.
 *
 * Chosen by the FIXTURE, never by who happens to be looking at it: two AI clubs are
 * quick-simmed by the zone engine, and anything with a person in it runs in the
 * spatial engine they actually watch. The choice is then RECORDED on the match, and an
 * attester runs the engine the record names rather than the one it would have picked —
 * otherwise a client verifying somebody else's fixture would reach for the wrong
 * simulation and report a divergence that is really a disagreement about which game
 * was being played.
 */
export type MatchEngineKind = "zone" | "spatial";

/** Whether each side is a person or the computer. */
export interface FixtureParticipants {
  readonly homeIsHuman: boolean;
  readonly awayIsHuman: boolean;
}

/** The engine rule, in one place so client and server cannot drift apart on it. */
export function engineFor(participants: FixtureParticipants): MatchEngineKind {
  return participants.homeIsHuman || participants.awayIsHuman ? "spatial" : "zone";
}

/**
 * Constants the protocol PINS, and why each one has to be pinned.
 *
 * These exist because "same seed" is not the same as "same match". Each of these is a
 * genuine input to the simulation that a client could set differently in good faith,
 * producing a divergence that looks exactly like cheating.
 */
export const MatchProtocol = {
  version: 1,

  /**
   * No side manages its own bench in a competitive match: the engine substitutes for
   * both, identically, for everyone.
   *
   * This one is not hypothetical. In the career app the watched path passes
   * `manualSubsTeamId` and the quick-sim path does not, and the spatial engine uses it
   * to decide whether a side substitutes for itself at all — so watching a fixture and
   * simulating it are today two different matches from the same seed. An attester who
   * is not a participant has no human bench to manage, so the only value that can
   * possibly agree for everybody is "nobody".
   *
   * It also happens to match the product rule that a league match takes no in-play
   * instructions.
   */
  manualSubsTeamId: undefined as string | undefined,

  /**
   * Every player starts the match fully fit.
   *
   * The spatial engine seeds live stamina from each player's pre-match `condition`, so
   * two clients disagreeing about a squad's fitness by a hair produce different
   * matches. Fatigue between fixtures is a feature worth having later, but it has to
   * arrive as a server-authored value inside the roster snapshot, not as something
   * each client computes for itself.
   */
  condition: 1,

  /** Regulation length in minutes. Also an engine input, so also pinned. */
  regulationMinutes: 90,
} as const;

/**
 * One side's submission for one fixture.
 *
 * ORDER IS DATA in both arrays and must survive serialisation untouched:
 * `startingXi` order feeds slot assignment, and `bench` order decides who the engine
 * brings on — it substitutes on its own in every match, so the bench is load-bearing
 * input even though nobody touches it during play.
 */
export interface TeamInput {
  readonly clubId: string;
  /** Player ids, in order. */
  readonly startingXi: readonly string[];
  /** Player ids, in order — the engine's substitution queue. */
  readonly bench: readonly string[];
  readonly instructions: TeamInstructions;
  /** playerId → role key. */
  readonly roles: Readonly<Record<string, string>>;
  /** playerId → the position they are FIELDED at, which need not be their natural one. */
  readonly fieldedPositions: Readonly<Record<string, Position>>;
  readonly coachId: string;
}

/**
 * Everything a match is played from. Given this and the roster it names, any runtime
 * reproduces the match exactly — that is the whole basis of the multiplayer model, so
 * anything missing here is a divergence waiting to happen.
 */
export interface MatchRecord {
  readonly protocolVersion: number;
  /**
   * The exact simulation build. A league pins one for its whole season and never
   * migrates: a behaviour change invalidates stored records for REPLAY, which is why
   * confirmed scores are denormalised rather than re-derived.
   */
  readonly engineVersion: string;
  readonly matchId: string;
  /** Which simulation plays it. See {@link MatchEngineKind}. */
  readonly engine: MatchEngineKind;
  readonly seed: number;
  readonly regulationMinutes: number;
  /**
   * Hash of the squad data the ids above resolve against — every attribute, not just
   * the ids. Without it a transfer or a development point landing between the match
   * and a later replay silently changes the result.
   */
  readonly rosterSnapshotHash: string;
  readonly home: TeamInput;
  readonly away: TeamInput;
}

/** What an attester reports back. Never a bare score — a commitment to a full report. */
export interface Attestation {
  readonly matchId: string;
  readonly engineVersion: string;
  /** Digest of the complete match report. */
  readonly resultRoot: string;
  readonly homeScore: number;
  readonly awayScore: number;
  /** Length of the event timeline, a cheap first signal that two reports differ. */
  readonly eventCount: number;
}

/** Why a submitted attestation was not accepted. */
export type AttestationRejection =
  /**
   * The attester ran a different simulation build. NEVER a cheating signal — it is the
   * expected outcome of an engine upgrade reaching some clients first.
   */
  | "engineVersion"
  /** Same build, different result. This is the one worth a third opinion. */
  | "result"
  /** The record names a roster the attester did not have. */
  | "rosterSnapshot"
  /** No verification job was outstanding for this attester and fixture. */
  | "notAssigned";
