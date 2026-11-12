import { camelCase } from "./type";

export enum AuraStat {
  NONE,
  ATTACK,
  DEFENSE,
  SPECIAL_ATTACK,
  SPECIAL_DEFENSE,
  SPEED,
  ALL,
}

export class Aura {
  public stat: AuraStat;
  public stages: number;

  constructor(b: number);
  constructor(stat: AuraStat, stages: number);
  constructor(statOrByte: AuraStat | number, stages?: number) {
    if (stages !== undefined) {
      this.stat = statOrByte as AuraStat;
      this.stages = stages;
    } else {
      const b = statOrByte as number;
      if (b === 0) {
        this.stat = AuraStat.NONE;
        this.stages = 0;
      } else {
        const allStats = Object.values(AuraStat).filter(
          (v) => typeof v === "number"
        ) as AuraStat[];
        this.stat = allStats[Math.floor((b - 1) / 3) + 1];
        this.stages = ((b - 1) % 3) + 1;
      }
    }
  }

  public toByte(): number {
    if (this.stat === AuraStat.NONE) {
      return 0;
    } else {
      return (this.stat - 1) * 3 + this.stages;
    }
  }

  public static randomAura(random: () => number): Aura {
    return new Aura(Math.floor(random() * 18) + 1);
  }

  public static randomAuraSimilarStrength(
    random: () => number,
    old: Aura
  ): Aura {
    if (old.stat === AuraStat.NONE || old.stat === AuraStat.ALL) {
      return old;
    } else {
      const allStats = Object.values(AuraStat).filter(
        (v) => typeof v === "number"
      ) as AuraStat[];
      return new Aura(allStats[Math.floor(random() * 5) + 1], old.stages);
    }
  }

  public toString(): string {
    const ret = camelCase(AuraStat[this.stat]).replace(/_/g, " ");
    return this.stat === AuraStat.NONE ? ret : ret + " +" + this.stages;
  }
}
