import { Type } from "./type";
import { ExpCurve } from "./exp-curve";
import { Evolution } from "./evolution";
import { MegaEvolution } from "./mega-evolution";

// Species constants referenced in the original Java code
const Species = {
  shedinja: 292,
  articuno: 144,
  zapdos: 145,
  moltres: 146,
  mewtwo: 150,
  mew: 151,
  raikou: 243,
  entei: 244,
  suicune: 245,
  lugia: 249,
  hoOh: 250,
  celebi: 251,
  regirock: 377,
  regice: 378,
  registeel: 379,
  latias: 380,
  latios: 381,
  kyogre: 382,
  groudon: 383,
  rayquaza: 384,
  jirachi: 385,
  deoxys: 386,
  uxie: 480,
  mesprit: 481,
  azelf: 482,
  dialga: 483,
  palkia: 484,
  heatran: 485,
  regigigas: 486,
  giratina: 487,
  cresselia: 488,
  phione: 489,
  manaphy: 490,
  darkrai: 491,
  shaymin: 492,
  arceus: 493,
  victini: 494,
  cobalion: 638,
  terrakion: 639,
  virizion: 640,
  tornadus: 641,
  thundurus: 642,
  reshiram: 643,
  zekrom: 644,
  landorus: 645,
  kyurem: 646,
  keldeo: 647,
  meloetta: 648,
  genesect: 649,
  xerneas: 716,
  yveltal: 717,
  zygarde: 718,
  diancie: 719,
  hoopa: 720,
  volcanion: 721,
  typeNull: 772,
  silvally: 773,
  tapuKoko: 785,
  tapuLele: 786,
  tapuBulu: 787,
  tapuFini: 788,
  cosmog: 789,
  cosmoem: 790,
  solgaleo: 791,
  lunala: 792,
  necrozma: 800,
  magearna: 801,
  marshadow: 802,
  zeraora: 807,
  nihilego: 793,
  buzzwole: 794,
  pheromosa: 795,
  xurkitree: 796,
  celesteela: 797,
  kartana: 798,
  guzzlord: 799,
  poipole: 803,
  naganadel: 804,
  stakataka: 805,
  blacephalon: 806,
} as const;

const legendaries: ReadonlySet<number> = new Set([
  Species.articuno, Species.zapdos, Species.moltres,
  Species.mewtwo, Species.mew, Species.raikou, Species.entei, Species.suicune,
  Species.lugia, Species.hoOh, Species.celebi, Species.regirock, Species.regice,
  Species.registeel, Species.latias, Species.latios, Species.kyogre, Species.groudon,
  Species.rayquaza, Species.jirachi, Species.deoxys, Species.uxie, Species.mesprit,
  Species.azelf, Species.dialga, Species.palkia, Species.heatran, Species.regigigas,
  Species.giratina, Species.cresselia, Species.phione, Species.manaphy, Species.darkrai,
  Species.shaymin, Species.arceus, Species.victini, Species.cobalion, Species.terrakion,
  Species.virizion, Species.tornadus, Species.thundurus, Species.reshiram, Species.zekrom,
  Species.landorus, Species.kyurem, Species.keldeo, Species.meloetta, Species.genesect,
  Species.xerneas, Species.yveltal, Species.zygarde, Species.diancie, Species.hoopa,
  Species.volcanion, Species.typeNull, Species.silvally, Species.tapuKoko, Species.tapuLele,
  Species.tapuBulu, Species.tapuFini, Species.cosmog, Species.cosmoem, Species.solgaleo,
  Species.lunala, Species.necrozma, Species.magearna, Species.marshadow, Species.zeraora,
]);

const strongLegendaries: ReadonlySet<number> = new Set([
  Species.mewtwo, Species.lugia, Species.hoOh, Species.kyogre, Species.groudon,
  Species.rayquaza, Species.dialga, Species.palkia, Species.regigigas, Species.giratina,
  Species.arceus, Species.reshiram, Species.zekrom, Species.kyurem, Species.xerneas,
  Species.yveltal, Species.cosmog, Species.cosmoem, Species.solgaleo, Species.lunala,
]);

const ultraBeasts: ReadonlySet<number> = new Set([
  Species.nihilego, Species.buzzwole, Species.pheromosa, Species.xurkitree,
  Species.celesteela, Species.kartana, Species.guzzlord, Species.poipole,
  Species.naganadel, Species.stakataka, Species.blacephalon,
]);

export class Pokemon {
  public name: string = "";
  public number: number = 0;

  public formeSuffix: string = "";
  public baseForme: Pokemon | null = null;
  public formeNumber: number = 0;
  public cosmeticForms: number = 0;
  public formeSpriteIndex: number = 0;
  public actuallyCosmetic: boolean = false;
  public realCosmeticFormNumbers: number[] = [];

  public primaryType!: Type;
  public secondaryType: Type | null = null;

  public hp: number = 0;
  public attack: number = 0;
  public defense: number = 0;
  public spatk: number = 0;
  public spdef: number = 0;
  public speed: number = 0;
  public special: number = 0;

  public ability1: number = 0;
  public ability2: number = 0;
  public ability3: number = 0;

  public catchRate: number = 0;
  public expYield: number = 0;

  public guaranteedHeldItem: number = 0;
  public commonHeldItem: number = 0;
  public rareHeldItem: number = 0;
  public darkGrassHeldItem: number = 0;

  public genderRatio: number = 0;

  public frontSpritePointer: number = 0;
  public picDimensions: number = 0;

  public callRate: number = 0;

  public growthCurve!: ExpCurve;

  public evolutionsFrom: Evolution[] = [];
  public evolutionsTo: Evolution[] = [];

  public megaEvolutionsFrom: MegaEvolution[] = [];
  public megaEvolutionsTo: MegaEvolution[] = [];

  protected shuffledStatsOrder: number[];

  // A flag to use for things like recursive stats copying.
  // Must not rely on the state of this flag being preserved between calls.
  public temporaryFlag: boolean = false;

  constructor() {
    this.shuffledStatsOrder = [0, 1, 2, 3, 4, 5];
  }

  public shuffleStats(random: () => number): void {
    // Fisher-Yates shuffle
    const arr = this.shuffledStatsOrder;
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    this.applyShuffledOrderToStats();
  }

  public copyShuffledStatsUpEvolution(evolvesFrom: Pokemon): void {
    // If stats were already shuffled once, un-shuffle them
    const order = this.shuffledStatsOrder;
    this.shuffledStatsOrder = [
      order.indexOf(0),
      order.indexOf(1),
      order.indexOf(2),
      order.indexOf(3),
      order.indexOf(4),
      order.indexOf(5),
    ];
    this.applyShuffledOrderToStats();
    this.shuffledStatsOrder = evolvesFrom.shuffledStatsOrder;
    this.applyShuffledOrderToStats();
  }

  protected applyShuffledOrderToStats(): void {
    const stats = [
      this.hp,
      this.attack,
      this.defense,
      this.spatk,
      this.spdef,
      this.speed,
    ];

    // Copy in new stats
    this.hp = stats[this.shuffledStatsOrder[0]];
    this.attack = stats[this.shuffledStatsOrder[1]];
    this.defense = stats[this.shuffledStatsOrder[2]];
    this.spatk = stats[this.shuffledStatsOrder[3]];
    this.spdef = stats[this.shuffledStatsOrder[4]];
    this.speed = stats[this.shuffledStatsOrder[5]];
  }

  public randomizeStatsWithinBST(random: () => number): void {
    if (this.number === Species.shedinja) {
      // Shedinja is horribly broken unless we restrict him to 1HP.
      const bst = this.bst() - 51;

      // Make weightings
      const atkW = random(),
        defW = random();
      const spaW = random(),
        spdW = random(),
        speW = random();

      const totW = atkW + defW + spaW + spdW + speW;

      this.hp = 1;
      this.attack = Math.max(1, Math.round((atkW / totW) * bst)) + 10;
      this.defense = Math.max(1, Math.round((defW / totW) * bst)) + 10;
      this.spatk = Math.max(1, Math.round((spaW / totW) * bst)) + 10;
      this.spdef = Math.max(1, Math.round((spdW / totW) * bst)) + 10;
      this.speed = Math.max(1, Math.round((speW / totW) * bst)) + 10;
    } else {
      // Minimum 20 HP, 10 everything else
      const bst = this.bst() - 70;

      // Make weightings
      const hpW = random(),
        atkW = random(),
        defW = random();
      const spaW = random(),
        spdW = random(),
        speW = random();

      const totW = hpW + atkW + defW + spaW + spdW + speW;

      this.hp = Math.max(1, Math.round((hpW / totW) * bst)) + 20;
      this.attack = Math.max(1, Math.round((atkW / totW) * bst)) + 10;
      this.defense = Math.max(1, Math.round((defW / totW) * bst)) + 10;
      this.spatk = Math.max(1, Math.round((spaW / totW) * bst)) + 10;
      this.spdef = Math.max(1, Math.round((spdW / totW) * bst)) + 10;
      this.speed = Math.max(1, Math.round((speW / totW) * bst)) + 10;
    }

    // Check for something we can't store
    if (
      this.hp > 255 ||
      this.attack > 255 ||
      this.defense > 255 ||
      this.spatk > 255 ||
      this.spdef > 255 ||
      this.speed > 255
    ) {
      // re roll
      this.randomizeStatsWithinBST(random);
    }
  }

  public copyRandomizedStatsUpEvolution(evolvesFrom: Pokemon): void {
    const ourBST = this.bst();
    const theirBST = evolvesFrom.bst();

    const bstRatio = ourBST / theirBST;

    this.hp = Math.min(255, Math.max(1, Math.round(evolvesFrom.hp * bstRatio)));
    this.attack = Math.min(255, Math.max(1, Math.round(evolvesFrom.attack * bstRatio)));
    this.defense = Math.min(255, Math.max(1, Math.round(evolvesFrom.defense * bstRatio)));
    this.speed = Math.min(255, Math.max(1, Math.round(evolvesFrom.speed * bstRatio)));
    this.spatk = Math.min(255, Math.max(1, Math.round(evolvesFrom.spatk * bstRatio)));
    this.spdef = Math.min(255, Math.max(1, Math.round(evolvesFrom.spdef * bstRatio)));
  }

  public assignNewStatsForEvolution(
    evolvesFrom: Pokemon,
    random: () => number
  ): void {
    const ourBST = this.bst();
    const theirBST = evolvesFrom.bst();

    const bstDiff = ourBST - theirBST;

    // Make weightings
    const hpW = random(),
      atkW = random(),
      defW = random();
    const spaW = random(),
      spdW = random(),
      speW = random();

    const totW = hpW + atkW + defW + spaW + spdW + speW;

    const hpDiff = Math.round((hpW / totW) * bstDiff);
    const atkDiff = Math.round((atkW / totW) * bstDiff);
    const defDiff = Math.round((defW / totW) * bstDiff);
    const spaDiff = Math.round((spaW / totW) * bstDiff);
    const spdDiff = Math.round((spdW / totW) * bstDiff);
    const speDiff = Math.round((speW / totW) * bstDiff);

    this.hp = Math.min(255, Math.max(1, evolvesFrom.hp + hpDiff));
    this.attack = Math.min(255, Math.max(1, evolvesFrom.attack + atkDiff));
    this.defense = Math.min(255, Math.max(1, evolvesFrom.defense + defDiff));
    this.speed = Math.min(255, Math.max(1, evolvesFrom.speed + speDiff));
    this.spatk = Math.min(255, Math.max(1, evolvesFrom.spatk + spaDiff));
    this.spdef = Math.min(255, Math.max(1, evolvesFrom.spdef + spdDiff));
  }

  public bst(): number {
    return (
      this.hp +
      this.attack +
      this.defense +
      this.spatk +
      this.spdef +
      this.speed
    );
  }

  public bstForPowerLevels(): number {
    // Take into account Shedinja's purposefully nerfed HP
    if (this.number === Species.shedinja) {
      return (
        ((this.attack + this.defense + this.spatk + this.spdef + this.speed) *
          6) /
        5
      );
    } else {
      return (
        this.hp +
        this.attack +
        this.defense +
        this.spatk +
        this.spdef +
        this.speed
      );
    }
  }

  public getAttackSpecialAttackRatio(): number {
    return this.attack / (this.attack + this.spatk);
  }

  public getBaseNumber(): number {
    let base: Pokemon = this;
    while (base.baseForme != null) {
      base = base.baseForme;
    }
    return base.number;
  }

  public copyBaseFormeBaseStats(baseForme: Pokemon): void {
    this.hp = baseForme.hp;
    this.attack = baseForme.attack;
    this.defense = baseForme.defense;
    this.speed = baseForme.speed;
    this.spatk = baseForme.spatk;
    this.spdef = baseForme.spdef;
  }

  public copyBaseFormeAbilities(baseForme: Pokemon): void {
    this.ability1 = baseForme.ability1;
    this.ability2 = baseForme.ability2;
    this.ability3 = baseForme.ability3;
  }

  public copyBaseFormeEvolutions(baseForme: Pokemon): void {
    this.evolutionsFrom = baseForme.evolutionsFrom;
  }

  public getSpriteIndex(): number {
    return this.formeNumber === 0
      ? this.number
      : this.formeSpriteIndex + this.formeNumber - 1;
  }

  public fullName(): string {
    return this.name + this.formeSuffix;
  }

  public toString(): string {
    return (
      "Pokemon [name=" +
      this.name +
      this.formeSuffix +
      ", number=" +
      this.number +
      ", primaryType=" +
      this.primaryType +
      ", secondaryType=" +
      this.secondaryType +
      ", hp=" +
      this.hp +
      ", attack=" +
      this.attack +
      ", defense=" +
      this.defense +
      ", spatk=" +
      this.spatk +
      ", spdef=" +
      this.spdef +
      ", speed=" +
      this.speed +
      "]"
    );
  }

  public hashCode(): number {
    const prime = 31;
    let result = 1;
    result = prime * result + this.number;
    return result;
  }

  public equals(other: Pokemon | null): boolean {
    if (this === other) return true;
    if (other == null) return false;
    return this.number === other.number;
  }

  public compareTo(o: Pokemon): number {
    return this.number - o.number;
  }

  public isLegendary(): boolean {
    return this.formeNumber === 0
      ? legendaries.has(this.number)
      : legendaries.has(this.baseForme!.number);
  }

  public isStrongLegendary(): boolean {
    return this.formeNumber === 0
      ? strongLegendaries.has(this.number)
      : strongLegendaries.has(this.baseForme!.number);
  }

  // This method can only be used in contexts where alt formes are NOT involved; otherwise, some alt formes
  // will be considered as Ultra Beasts in SM.
  // In contexts where formes are involved, use "if (ultraBeastList.contains(...))" instead,
  // assuming "checkPokemonRestrictions" has been used at some point beforehand.
  public isUltraBeast(): boolean {
    return ultraBeasts.has(this.number);
  }

  public getCosmeticFormNumber(num: number): number {
    return this.realCosmeticFormNumbers.length === 0
      ? num
      : this.realCosmeticFormNumbers[num];
  }
}
