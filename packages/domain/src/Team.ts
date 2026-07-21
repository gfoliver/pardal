import { type Coach } from "./Coach.js";
import { Goalkeeper } from "./Goalkeeper.js";
import { type Player } from "./Player.js";
import { type Tactics } from "./Tactics.js";

export interface TeamInit {
  readonly id: string;
  readonly name: string;
  readonly shortName: string;
  readonly coach: Coach;
  readonly startingXi: readonly Player[];
  readonly bench: readonly Player[];
  readonly tactics: Tactics;
}

/**
 * A team as set up for a single match: coach, starting XI, bench and tactics.
 * (Full squad/finance modelling belongs to later phases.)
 */
export class Team {
  public readonly id: string;
  public readonly name: string;
  public readonly shortName: string;
  public readonly coach: Coach;
  public readonly startingXi: readonly Player[];
  public readonly bench: readonly Player[];
  public readonly tactics: Tactics;

  constructor(init: TeamInit) {
    this.id = init.id;
    this.name = init.name;
    this.shortName = init.shortName;
    this.coach = init.coach;
    this.startingXi = init.startingXi;
    this.bench = init.bench;
    this.tactics = init.tactics;
  }

  /** The goalkeeper in the starting XI, if present. */
  goalkeeper(): Goalkeeper | undefined {
    return this.startingXi.find(
      (p): p is Goalkeeper => p instanceof Goalkeeper,
    );
  }
}
