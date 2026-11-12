import type { Pokemon } from "../pokemon/pokemon";
import type { EvolutionType } from "../pokemon/evolution-type";

/**
 * Represents an update to a Pokemon's evolution method.
 * Ported from com.dabomstew.pkrandom.pokemon.EvolutionUpdate.
 */
export class EvolutionUpdate {
  public from: Pokemon;
  public to: Pokemon;
  public fromName: string;
  public toName: string;
  public type: EvolutionType;
  public extraInfo: string;
  public condensed: boolean;
  public additional: boolean;

  constructor(
    from: Pokemon,
    to: Pokemon,
    type: EvolutionType,
    extraInfo: string,
    condensed: boolean,
    additional: boolean
  ) {
    this.from = from;
    this.to = to;
    this.fromName = from.fullName();
    this.toName = to.fullName();
    this.type = type;
    this.extraInfo = extraInfo;
    this.condensed = condensed;
    this.additional = additional;
  }

  public hashCode(): number {
    const prime = 31;
    let result = 1;
    result = prime * result + this.fromName.length;
    result = prime * result + this.toName.length;
    result = prime * result + this.type;
    return result;
  }

  public equals(other: EvolutionUpdate | null): boolean {
    if (this === other) return true;
    if (other == null) return false;
    return (
      this.fromName === other.fromName &&
      this.toName === other.toName &&
      this.type === other.type
    );
  }

  public compareTo(o: EvolutionUpdate): number {
    if (this.fromName < o.fromName) return -1;
    if (this.fromName > o.fromName) return 1;
    if (this.toName < o.toName) return -1;
    if (this.toName > o.toName) return 1;
    return this.type - o.type;
  }

  public toString(): string {
    return this.fromName + " Pokemon now " +
      (this.condensed ? "also " : "") +
      "evolves into " + this.toName +
      (this.additional ? " (additional Pokemon)" : "") +
      " by " + this.extraInfo;
  }
}
