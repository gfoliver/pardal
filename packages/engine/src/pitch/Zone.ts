/**
 * A pitch zone. Coordinates are ABSOLUTE (independent of which team has the ball):
 *   third: 0 = home team's goal end … (thirds-1) = away team's goal end
 *   lane:  0 = left touchline … (lanes-1) = right touchline
 * The default grid is 5 bands × 5 lanes (see `PitchGrid`); that resolution can
 * change without touching the decision/positioning logic, which reasons via the
 * grid's helpers (attackingThird, centerLane, advancement, …).
 */
export interface Zone {
  readonly third: number;
  readonly lane: number;
}

export function zone(third: number, lane: number): Zone {
  return { third, lane };
}

export function sameZone(a: Zone, b: Zone): boolean {
  return a.third === b.third && a.lane === b.lane;
}

export function zonesAdjacent(a: Zone, b: Zone): boolean {
  return Math.abs(a.third - b.third) <= 1 && Math.abs(a.lane - b.lane) <= 1;
}
