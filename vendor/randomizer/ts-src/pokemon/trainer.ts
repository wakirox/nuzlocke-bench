import { TrainerPokemon } from "./trainer-pokemon";

export enum MultiBattleStatus {
  NEVER,
  POTENTIAL,
  ALWAYS,
}

export class Trainer {
  public offset: number = 0;
  public index: number = 0;
  public pokemon: TrainerPokemon[] = [];
  public tag: string | null = null;
  public importantTrainer: boolean = false;
  // This value has some flags about the trainer's pokemon (e.g. if they have items or custom moves)
  public poketype: number = 0;
  public name: string | null = null;
  public trainerclass: number = 0;
  public fullDisplayName: string | null = null;
  public multiBattleStatus: MultiBattleStatus = MultiBattleStatus.NEVER;
  public forceStarterPosition: number = -1;
  // Certain trainers (e.g., trainers in the PWT in BW2) require unique held items for all of their Pokemon to prevent a game crash.
  public requiresUniqueHeldItems: boolean = false;

  public toString(): string {
    let sb = "[";
    if (this.fullDisplayName != null) {
      sb += this.fullDisplayName + " ";
    } else if (this.name != null) {
      sb += this.name + " ";
    }
    if (this.trainerclass !== 0) {
      sb += "(" + this.trainerclass + ") - ";
    }
    if (this.offset > 0) {
      sb += this.offset.toString(16);
    }
    sb += " => ";
    let first = true;
    for (const p of this.pokemon) {
      if (!first) {
        sb += ",";
      }
      sb += p.pokemon.name + " Lv" + p.level;
      first = false;
    }
    sb += "]";
    if (this.tag != null) {
      sb += " (" + this.tag + ")";
    }
    return sb;
  }

  public hashCode(): number {
    const prime = 31;
    let result = 1;
    result = prime * result + this.index;
    return result;
  }

  public equals(other: Trainer | null): boolean {
    if (this === other) return true;
    if (other == null) return false;
    return this.index === other.index;
  }

  public compareTo(o: Trainer): number {
    return this.index - o.index;
  }

  public isBoss(): boolean {
    return (
      this.tag != null &&
      (this.tag.startsWith("ELITE") ||
        this.tag.startsWith("CHAMPION") ||
        this.tag.startsWith("UBER") ||
        this.tag.endsWith("LEADER"))
    );
  }

  public isImportant(): boolean {
    return (
      this.tag != null &&
      (this.tag.startsWith("RIVAL") ||
        this.tag.startsWith("FRIEND") ||
        this.tag.endsWith("STRONG"))
    );
  }

  public skipImportant(): boolean {
    return (
      this.tag != null &&
      (this.tag.startsWith("RIVAL1-") ||
        this.tag.startsWith("FRIEND1-") ||
        this.tag.endsWith("NOTSTRONG"))
    );
  }

  public setPokemonHaveItems(haveItems: boolean): void {
    if (haveItems) {
      this.poketype |= 2;
    } else {
      this.poketype = this.poketype & ~2;
    }
  }

  public pokemonHaveItems(): boolean {
    // This flag seems consistent for all gens
    return (this.poketype & 2) === 2;
  }

  public setPokemonHaveCustomMoves(haveCustomMoves: boolean): void {
    if (haveCustomMoves) {
      this.poketype |= 1;
    } else {
      this.poketype = this.poketype & ~1;
    }
  }

  public pokemonHaveCustomMoves(): boolean {
    // This flag seems consistent for all gens
    return (this.poketype & 1) === 1;
  }

  public pokemonHaveUniqueHeldItems(): boolean {
    const heldItemsForThisTrainer: number[] = [];
    for (const poke of this.pokemon) {
      if (poke.heldItem > 0) {
        if (heldItemsForThisTrainer.includes(poke.heldItem)) {
          return false;
        } else {
          heldItemsForThisTrainer.push(poke.heldItem);
        }
      }
    }
    return true;
  }
}
