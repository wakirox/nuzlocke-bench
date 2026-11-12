import { Pokemon } from "./pokemon";
import { SOSType } from "./sos-type";

export class Encounter {
  public level: number = 0;
  public maxLevel: number = 0;
  public pokemon: Pokemon | null = null;
  public formeNumber: number = 0;

  // Used only for Gen 7's SOS mechanic
  public isSOS: boolean = false;
  public sosType: SOSType | null = null;

  public toString(): string {
    if (this.pokemon == null) {
      return "ERROR";
    }
    if (this.maxLevel === 0) {
      return this.pokemon.name + " Lv" + this.level;
    } else {
      return this.pokemon.name + " Lvs " + this.level + "-" + this.maxLevel;
    }
  }
}
