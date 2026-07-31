export { canonicalJson, CanonicalJsonError, type Canonical } from "./canonical.js";
export { digest, firstDivergence, HashDomain, prefixChain } from "./hash.js";
export {
  engineFor,
  MatchProtocol,
  type Attestation,
  type AttestationRejection,
  type FixtureParticipants,
  type MatchEngineKind,
  type MatchRecord,
  type TeamInput,
} from "./match.js";
export {
  rosterSnapshotHash,
  type RosterClub,
  type RosterCoach,
  type RosterPlayer,
  type RosterSnapshot,
} from "./roster.js";
export { buildTeam, TeamBuildError } from "./teamBuilder.js";
