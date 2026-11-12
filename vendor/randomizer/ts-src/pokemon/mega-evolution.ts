import type { Pokemon } from "./pokemon";

export class MegaEvolution {
  public from: Pokemon;
  public to: Pokemon;
  public method: number;
  public argument: number;
  public carryStats: boolean = true;

  constructor(from: Pokemon, to: Pokemon, method: number, argument: number) {
    this.from = from;
    this.to = to;
    this.method = method;
    this.argument = argument;
  }
}
