import { Person } from "./Person.js";

/**
 * Non-playing, non-coaching club member (physio, scout, ...). Not used by the
 * MVP match engine, but present to complete the people hierarchy.
 */
export class Staff extends Person {
  constructor(
    id: string,
    name: string,
    age: number,
    nationality: string,
    public readonly role: string,
  ) {
    super(id, name, age, nationality);
  }
}
