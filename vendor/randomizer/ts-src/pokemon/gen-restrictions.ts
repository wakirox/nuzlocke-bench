import { Type } from "./type";

export class GenRestrictions {
  public allow_gen1: boolean = false;
  public allow_gen2: boolean = false;
  public allow_gen3: boolean = false;
  public allow_gen4: boolean = false;
  public allow_gen5: boolean = false;
  public allow_gen6: boolean = false;
  public allow_gen7: boolean = false;
  public allow_evolutionary_relatives: boolean = false;

  constructor(state?: number) {
    if (state !== undefined) {
      this.allow_gen1 = (state & 1) > 0;
      this.allow_gen2 = (state & 2) > 0;
      this.allow_gen3 = (state & 4) > 0;
      this.allow_gen4 = (state & 8) > 0;
      this.allow_gen5 = (state & 16) > 0;
      this.allow_gen6 = (state & 32) > 0;
      this.allow_gen7 = (state & 64) > 0;
      this.allow_evolutionary_relatives = (state & 128) > 0;
    }
  }

  public nothingSelected(): boolean {
    return (
      !this.allow_gen1 &&
      !this.allow_gen2 &&
      !this.allow_gen3 &&
      !this.allow_gen4 &&
      !this.allow_gen5 &&
      !this.allow_gen6 &&
      !this.allow_gen7
    );
  }

  public toInt(): number {
    return GenRestrictions.makeIntSelected(
      this.allow_gen1,
      this.allow_gen2,
      this.allow_gen3,
      this.allow_gen4,
      this.allow_gen5,
      this.allow_gen6,
      this.allow_gen7,
      this.allow_evolutionary_relatives
    );
  }

  public limitToGen(generation: number): void {
    if (generation < 2) this.allow_gen2 = false;
    if (generation < 3) this.allow_gen3 = false;
    if (generation < 4) this.allow_gen4 = false;
    if (generation < 5) this.allow_gen5 = false;
    if (generation < 6) this.allow_gen6 = false;
    if (generation < 7) this.allow_gen7 = false;
  }

  public allowTrainerSwapMegaEvolvables(
    isXY: boolean,
    isTypeThemedTrainers: boolean
  ): boolean {
    if (isTypeThemedTrainers) {
      return this.megaEvolutionsOfEveryTypeAreInPool(isXY);
    } else {
      return this.megaEvolutionsAreInPool(isXY);
    }
  }

  public megaEvolutionsOfEveryTypeAreInPool(isXY: boolean): boolean {
    const typePool = new Set<Type>();
    if (this.allow_gen1) {
      [
        Type.GRASS, Type.POISON, Type.FIRE, Type.FLYING, Type.WATER,
        Type.PSYCHIC, Type.GHOST, Type.NORMAL, Type.BUG, Type.ROCK,
      ].forEach((t) => typePool.add(t));
    }
    if (this.allow_gen2) {
      [
        Type.ELECTRIC, Type.BUG, Type.STEEL, Type.FIGHTING, Type.DARK,
        Type.FIRE, Type.ROCK,
      ].forEach((t) => typePool.add(t));
      if (!isXY) {
        typePool.add(Type.GROUND);
      }
    }
    if (this.allow_gen3) {
      [
        Type.FIRE, Type.FIGHTING, Type.PSYCHIC, Type.FAIRY, Type.STEEL,
        Type.ROCK, Type.ELECTRIC, Type.GHOST, Type.DARK, Type.DRAGON,
      ].forEach((t) => typePool.add(t));
      if (!isXY) {
        [Type.GRASS, Type.WATER, Type.GROUND, Type.FLYING, Type.ICE].forEach(
          (t) => typePool.add(t)
        );
      }
    }
    if (this.allow_gen4) {
      [
        Type.DRAGON, Type.GROUND, Type.FIGHTING, Type.STEEL, Type.GRASS,
        Type.ICE,
      ].forEach((t) => typePool.add(t));
      if (!isXY) {
        [Type.NORMAL, Type.PSYCHIC].forEach((t) => typePool.add(t));
      }
    }
    if (this.allow_gen5 && !isXY) {
      typePool.add(Type.NORMAL);
    }
    if (this.allow_gen6 && !isXY) {
      [Type.ROCK, Type.FAIRY].forEach((t) => typePool.add(t));
    }
    return typePool.size === 18;
  }

  public megaEvolutionsAreInPool(isXY: boolean): boolean {
    if (isXY) {
      return (
        this.allow_gen1 ||
        this.allow_gen2 ||
        this.allow_gen3 ||
        this.allow_gen4
      );
    } else {
      return (
        this.allow_gen1 ||
        this.allow_gen2 ||
        this.allow_gen3 ||
        this.allow_gen4 ||
        this.allow_gen5 ||
        this.allow_gen6
      );
    }
  }

  private static makeIntSelected(...switches: boolean[]): number {
    if (switches.length > 32) {
      return 0;
    }
    let initial = 0;
    let state = 1;
    for (const b of switches) {
      initial |= b ? state : 0;
      state *= 2;
    }
    return initial;
  }
}
