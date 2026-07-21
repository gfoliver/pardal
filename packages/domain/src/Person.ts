/**
 * Root of the people hierarchy: Person → Player → Goalkeeper, plus Coach,
 * Staff and Referee. Holds only identity common to any human in the game.
 */
export abstract class Person {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly age: number,
    public readonly nationality: string,
  ) {}

  /** Short human-readable label, handy for logs and debugging. */
  describe(): string {
    return `${this.name} (${this.age}, ${this.nationality})`;
  }
}
