/** Aggregated per-team match statistics. */
export interface TeamStats {
  goals: number;
  shots: number;
  shotsOnTarget: number;
  passes: number;
  passesCompleted: number;
  tackles: number;
  fouls: number;
  offsides: number;
  corners: number;
  yellowCards: number;
  redCards: number;
  /** Internal counter of possession steps; used to derive possession%. */
  possessionSteps: number;
}

export function createTeamStats(): TeamStats {
  return {
    goals: 0,
    shots: 0,
    shotsOnTarget: 0,
    passes: 0,
    passesCompleted: 0,
    tackles: 0,
    fouls: 0,
    offsides: 0,
    corners: 0,
    yellowCards: 0,
    redCards: 0,
    possessionSteps: 0,
  };
}

/** Possession percentage for the home team given both teams' step counts. */
export function possessionPercent(home: TeamStats, away: TeamStats): {
  home: number;
  away: number;
} {
  const total = home.possessionSteps + away.possessionSteps;
  if (total === 0) return { home: 50, away: 50 };
  const h = Math.round((home.possessionSteps / total) * 100);
  return { home: h, away: 100 - h };
}
