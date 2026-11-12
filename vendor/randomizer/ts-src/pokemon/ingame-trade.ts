import { Pokemon } from "./pokemon";

export class IngameTrade {
  public id: number = 0;

  public requestedPokemon!: Pokemon;
  public givenPokemon!: Pokemon;

  public nickname: string = "";
  public otName: string = "";

  public otId: number = 0;

  public ivs: number[] = [];

  public item: number = 0;
}
