import type { Pokemon } from "./pokemon";
import { EvolutionType } from "./evolution-type";

export class Evolution {
  public from: Pokemon;
  public to: Pokemon;
  public carryStats: boolean;
  public type: EvolutionType;
  public extraInfo: number;
  public forme: number = 0;
  public formeSuffix: string = "";
  public level: number = 0;

  constructor(
    from: Pokemon,
    to: Pokemon,
    carryStats: boolean,
    type: EvolutionType,
    extra: number
  ) {
    this.from = from;
    this.to = to;
    this.carryStats = carryStats;
    this.type = type;
    this.extraInfo = extra;
  }

  public hashCode(): number {
    const prime = 31;
    let result = 1;
    result = prime * result + this.from.number;
    result = prime * result + this.to.number;
    result = prime * result + this.type;
    return result;
  }

  public equals(other: Evolution | null): boolean {
    if (this === other) return true;
    if (other == null) return false;
    return (
      this.from === other.from &&
      this.to === other.to &&
      this.type === other.type
    );
  }

  public compareTo(o: Evolution): number {
    if (this.from.number < o.from.number) {
      return -1;
    } else if (this.from.number > o.from.number) {
      return 1;
    } else if (this.to.number < o.to.number) {
      return -1;
    } else if (this.to.number > o.to.number) {
      return 1;
    } else {
      return this.type - o.type;
    }
  }

  public toFullName(): string {
    return this.to.name + this.formeSuffix;
  }
}
