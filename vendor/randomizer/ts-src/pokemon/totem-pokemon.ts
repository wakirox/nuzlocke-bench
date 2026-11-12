import { Pokemon } from "./pokemon";
import { Aura } from "./aura";
import { StaticEncounter } from "./static-encounter";

export class TotemPokemon extends StaticEncounter {
  public aura!: Aura;
  public ally1Offset: number = 0;
  public ally2Offset: number = 0;
  public allies: Map<number, StaticEncounter> = new Map();

  public unused: boolean = false;

  constructor(pkmn?: Pokemon) {
    super(pkmn);
  }

  public override toString(): string {
    // The %s will be formatted to include the held item.
    let ret =
      this.pkmn.fullName() +
      "@%s Lv" +
      this.level +
      "\n    Aura: " +
      this.aura.toString() +
      "\n";
    let i = 1;
    for (const ally of this.allies.values()) {
      ret += "    Ally " + i + ": " + ally.toString() + "\n";
      i++;
    }
    return ret + "\n";
  }
}
