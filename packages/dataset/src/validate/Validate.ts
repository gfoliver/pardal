import { Position } from "@fut/domain";
import type { RawSnapshot } from "../raw/RawSnapshot.js";
import type { InferredPlayer } from "../infer/InferAttributes.js";

export interface ValidationReport {
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

const MIN_SQUAD = 11;

/** Mean confidence across a player's outfield attributes (rough coverage gauge). */
function meanConfidence(p: InferredPlayer): number {
  const all = [...Object.values(p.physical), ...Object.values(p.mental), ...Object.values(p.technical)];
  return all.reduce((s, a) => s + a.confidence, 0) / all.length;
}

/**
 * Sanity-check an inferred league before emit. Errors are structural (would
 * break `loadLeagueTeams` or a career); warnings flag quality concerns. Pure.
 */
export function validate(snapshot: RawSnapshot, inferred: readonly InferredPlayer[]): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  const league = snapshot.competitions.find((c) => c.id === snapshot.primaryCompetitionId);
  const leagueClubIds = league?.entrantClubIds ?? snapshot.clubs.map((c) => c.id);
  const byClub = new Map<string, InferredPlayer[]>();
  for (const p of inferred) (byClub.get(p.clubId) ?? byClub.set(p.clubId, []).get(p.clubId)!).push(p);

  // Completeness: every league club needs a full squad with a keeper.
  for (const clubId of leagueClubIds) {
    const squad = byClub.get(clubId) ?? [];
    if (squad.length < MIN_SQUAD) errors.push(`Club ${clubId} has ${squad.length} players (< ${MIN_SQUAD}).`);
    if (!squad.some((p) => p.position === Position.Goalkeeper)) errors.push(`Club ${clubId} has no goalkeeper.`);
  }

  // Overall outliers per position group (z-score).
  const byGroup = new Map<number, number[]>();
  for (const p of inferred) (byGroup.get(p.position.length) ?? byGroup.set(p.position.length, []).get(p.position.length)!).push(p.overall);

  // Distribution: league-wide mean overall should sit in a sane band.
  if (inferred.length > 0) {
    const mean = inferred.reduce((s, p) => s + p.overall, 0) / inferred.length;
    if (mean < 55 || mean > 82) warnings.push(`League mean overall ${mean.toFixed(1)} is outside the expected 55–82 band.`);
    const sd = Math.sqrt(inferred.reduce((s, p) => s + (p.overall - mean) ** 2, 0) / inferred.length) || 1;
    for (const p of inferred) if (Math.abs((p.overall - mean) / sd) > 3.5) warnings.push(`Outlier overall ${p.overall} for ${p.id}.`);
  }

  // Coverage: how many players rest almost entirely on low-confidence priors.
  const lowConf = inferred.filter((p) => meanConfidence(p) < 0.4).length;
  if (lowConf > 0) warnings.push(`${lowConf} players are mostly low-confidence (position priors, little stat signal).`);

  return { errors, warnings };
}
