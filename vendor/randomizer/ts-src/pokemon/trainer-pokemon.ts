import { Pokemon } from "./pokemon";

export class TrainerPokemon {
  public pokemon!: Pokemon;
  public level: number = 0;

  public moves: number[] = [0, 0, 0, 0];

  public heldItem: number = 0;
  public hasMegaStone: boolean = false;
  public hasZCrystal: boolean = false;
  public abilitySlot: number = 0;
  public forme: number = 0;
  public formeSuffix: string = "";

  public forcedGenderFlag: number = 0;
  public nature: number = 0;
  public hpEVs: number = 0;
  public atkEVs: number = 0;
  public defEVs: number = 0;
  public spatkEVs: number = 0;
  public spdefEVs: number = 0;
  public speedEVs: number = 0;
  public IVs: number = 0;
  // In gens 3-5, there is a byte or word that corresponds
  // to the IVs a trainer's pokemon has. In X/Y, this byte
  // also encodes some other information, possibly related
  // to EV spread. Because of the unknown part in X/Y,
  // we store the whole "strength byte" so we can
  // write it unchanged when randomizing trainer pokemon.
  public strength: number = 0;

  public resetMoves: boolean = false;

  public toString(): string {
    let s = this.pokemon.name + this.formeSuffix;
    if (this.heldItem !== 0) {
      // This can be filled in with the actual name when written to the log.
      s += "@%s";
    }
    s += " Lv" + this.level;
    return s;
  }

  public canMegaEvolve(): boolean {
    if (this.heldItem !== 0) {
      for (const mega of this.pokemon.megaEvolutionsFrom) {
        if (mega.argument === this.heldItem) {
          return true;
        }
      }
    }
    return false;
  }

  public copy(): TrainerPokemon {
    const tpk = new TrainerPokemon();
    tpk.pokemon = this.pokemon;
    tpk.level = this.level;

    tpk.moves[0] = this.moves[0];
    tpk.moves[1] = this.moves[1];
    tpk.moves[2] = this.moves[2];
    tpk.moves[3] = this.moves[3];

    tpk.forcedGenderFlag = this.forcedGenderFlag;
    tpk.nature = this.nature;
    tpk.IVs = this.IVs;
    tpk.hpEVs = this.hpEVs;
    tpk.atkEVs = this.atkEVs;
    tpk.defEVs = this.defEVs;
    tpk.spatkEVs = this.spatkEVs;
    tpk.spdefEVs = this.spdefEVs;
    tpk.speedEVs = this.speedEVs;
    tpk.strength = this.strength;
    tpk.heldItem = this.heldItem;
    tpk.abilitySlot = this.abilitySlot;
    tpk.forme = this.forme;
    tpk.formeSuffix = this.formeSuffix;

    tpk.resetMoves = this.resetMoves;

    return tpk;
  }
}
