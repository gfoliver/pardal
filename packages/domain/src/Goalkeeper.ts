import { type GoalkeepingAttributes } from "./attributes.js";
import { Player, type PlayerInit } from "./Player.js";
import { Position } from "./types.js";

export interface GoalkeeperInit extends Omit<PlayerInit, "position"> {
  readonly goalkeeping: GoalkeepingAttributes;
}

/**
 * A goalkeeper. Substitutable anywhere a `Player` is expected (LSP), while
 * adding the goalkeeping attributes the shot/shootout resolvers read.
 */
export class Goalkeeper extends Player {
  public readonly goalkeeping: GoalkeepingAttributes;

  constructor(init: GoalkeeperInit) {
    super({
      ...init,
      position: Position.Goalkeeper,
      naturalPositions: init.naturalPositions ?? [Position.Goalkeeper],
    });
    this.goalkeeping = init.goalkeeping;
  }
}
