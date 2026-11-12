import { Encounter } from "./encounter";
import { Pokemon } from "./pokemon";

export class EncounterSet {
  public rate: number = 0;
  public encounters: Encounter[] = [];
  public bannedPokemon: Set<Pokemon> = new Set();
  public displayName: string | null = null;
  public offset: number = 0;

  public toString(): string {
    return "Encounter [Rate = " + this.rate + ", Encounters = " + this.encounters + "]";
  }
}
