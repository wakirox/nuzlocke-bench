import { Pokemon } from "./pokemon";

export class StaticEncounter {
  public pkmn!: Pokemon;
  public forme: number = 0;
  public level: number = 0;
  public maxLevel: number = 0;
  public heldItem: number = 0;
  public isEgg: boolean = false;
  public resetMoves: boolean = false;
  public restrictedPool: boolean = false;
  public restrictedList: Pokemon[] = [];

  // In the games, sometimes what is logically an encounter or set of encounters with one specific Pokemon
  // can actually consist of multiple encounters internally. This can happen because:
  // - The same Pokemon appears in multiple locations (e.g., Reshiram/Zekrom in BW1, Giratina in Pt)
  // - The same Pokemon appears at different levels depending on game progression (e.g., Volcarona in BW2)
  // - Rebattling a Pokemon actually is different encounter entirely (e.g., Xerneas/Yveltal in XY)
  // This list tracks encounters that should logically have the same species and forme, but *may* have
  // differences in other properties like level.
  public linkedEncounters: StaticEncounter[];

  constructor(pkmn?: Pokemon) {
    this.linkedEncounters = [];
    if (pkmn !== undefined) {
      this.pkmn = pkmn;
    }
  }

  public toString(printLevel: boolean = true): string {
    if (this.isEgg) {
      return this.pkmn.fullName() + " (egg)";
    } else if (!printLevel) {
      return this.pkmn.fullName();
    }
    let levelString = "Lv" + this.level;
    if (this.maxLevel > 0) {
      levelString += "-" + this.maxLevel;
    }
    let needToDisplayLinkedLevels = false;
    for (let i = 0; i < this.linkedEncounters.length; i++) {
      if (this.level !== this.linkedEncounters[i].level) {
        needToDisplayLinkedLevels = true;
      }
    }
    if (needToDisplayLinkedLevels) {
      for (let i = 0; i < this.linkedEncounters.length; i++) {
        levelString += " / " + "Lv" + this.linkedEncounters[i].level;
      }
    }
    return this.pkmn.fullName() + ", " + levelString;
  }

  public canMegaEvolve(): boolean {
    if (this.heldItem !== 0) {
      for (const mega of this.pkmn.megaEvolutionsFrom) {
        if (mega.argument === this.heldItem) {
          return true;
        }
      }
    }
    return false;
  }
}
