import { type CoachAttributes } from "./attributes.js";
import { Person } from "./Person.js";

export interface CoachInit {
  readonly id: string;
  readonly name: string;
  readonly age: number;
  readonly nationality: string;
  readonly attributes: CoachAttributes;
}

/**
 * A coach/manager. Attributes are purely tactical and drive how (and how
 * eagerly) the AI intervenes during a match — see `AiCoachController`.
 */
export class Coach extends Person {
  public readonly attributes: CoachAttributes;

  constructor(init: CoachInit) {
    super(init.id, init.name, init.age, init.nationality);
    this.attributes = init.attributes;
  }
}
