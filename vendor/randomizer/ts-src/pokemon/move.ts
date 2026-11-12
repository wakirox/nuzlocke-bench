import { Type } from "./type";
import { MoveCategory } from "./move-category";
import { StatChangeType } from "./stat-change-type";
import { StatChangeMoveType } from "./stat-change-move-type";
import { StatusMoveType } from "./status-move-type";
import { StatusType } from "./status-type";
import { CriticalChance } from "./critical-chance";

const MIN_DAMAGING_MOVE_POWER = 50;

export class MoveStatChange {
  public type: StatChangeType = StatChangeType.NONE;
  public stages: number = 0;
  public percentChance: number = 0;

  public equals(other: MoveStatChange): boolean {
    return (
      this.type === other.type &&
      this.stages === other.stages &&
      this.percentChance === other.percentChance
    );
  }
}

export class Move {
  public name: string = "";
  public number: number = 0;
  public internalId: number = 0;
  public power: number = 0;
  public pp: number = 0;
  public hitratio: number = 0;
  public type!: Type;
  public category!: MoveCategory;
  public statChangeMoveType: StatChangeMoveType =
    StatChangeMoveType.NONE_OR_UNKNOWN;
  public statChanges: MoveStatChange[] = new Array(3);
  public statusMoveType: StatusMoveType = StatusMoveType.NONE_OR_UNKNOWN;
  public statusType: StatusType = StatusType.NONE;
  public criticalChance: CriticalChance = CriticalChance.NORMAL;
  public statusPercentChance: number = 0;
  public flinchPercentChance: number = 0;
  public recoilPercent: number = 0;
  public absorbPercent: number = 0;
  public priority: number = 0;
  public makesContact: boolean = false;
  public isChargeMove: boolean = false;
  public isRechargeMove: boolean = false;
  public isPunchMove: boolean = false;
  public isSoundMove: boolean = false;
  public isTrapMove: boolean = false; // True for both binding moves (like Wrap) and trapping moves (like Mean Look)
  public effectIndex: number = 0;
  public target: number = 0;
  public hitCount: number = 1; // not saved, only used in randomized move powers.

  constructor() {
    // Initialize all statStageChanges to something sensible so that we don't need to have
    // each RomHandler mess with them if they don't need to.
    for (let i = 0; i < this.statChanges.length; i++) {
      this.statChanges[i] = new MoveStatChange();
      this.statChanges[i].type = StatChangeType.NONE;
    }
  }

  public hasSpecificStatChange(
    type: StatChangeType,
    isPositive: boolean
  ): boolean {
    for (const sc of this.statChanges) {
      if (sc.type === type && (isPositive ? sc.stages > 0 : sc.stages < 0)) {
        return true;
      }
    }
    return false;
  }

  public hasBeneficialStatChange(): boolean {
    return (
      (this.statChangeMoveType === StatChangeMoveType.DAMAGE_TARGET &&
        this.statChanges[0].stages < 0) ||
      (this.statChangeMoveType === StatChangeMoveType.DAMAGE_USER &&
        this.statChanges[0].stages > 0)
    );
  }

  public isGoodDamaging(perfectAccuracy: number): boolean {
    return (
      this.power * this.hitCount >= 2 * MIN_DAMAGING_MOVE_POWER ||
      (this.power * this.hitCount >= MIN_DAMAGING_MOVE_POWER &&
        (this.hitratio >= 90 || this.hitratio === perfectAccuracy))
    );
  }

  public toString(): string {
    return (
      "#" +
      this.number +
      " " +
      this.name +
      " - Power: " +
      this.power +
      ", Base PP: " +
      this.pp +
      ", Type: " +
      this.type +
      ", Hit%: " +
      this.hitratio +
      ", Effect: " +
      this.effectIndex +
      ", Priority: " +
      this.priority
    );
  }
}
