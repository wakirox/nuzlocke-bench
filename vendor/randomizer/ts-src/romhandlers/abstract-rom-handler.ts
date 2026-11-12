/**
 * AbstractRomHandler.ts - a base class for all ROM handlers which
 * implements the majority of the actual randomizer logic by building
 * on the base getters & setters provided by each concrete handler.
 *
 * Faithfully ported from AbstractRomHandler.java (7,563 lines).
 */

import { type RomHandler, type LogStream, TrainerNameMode } from "./rom-handler";
import type { Settings } from "../config/settings";
import {
  BaseStatisticsMod,
  TypesMod,
  AbilitiesMod,
  TrainersMod,
  WildPokemonRestrictionMod,
  MovesetsMod,
  StaticPokemonMod,
  TMsHMsCompatibilityMod,
  MoveTutorsCompatibilityMod,
  InGameTradesMod,
  FieldItemsMod,
  ShopItemsMod,
  ExpCurveMod,
  EvolutionsMod,
} from "../config/settings";
import type { Pokemon } from "../pokemon/pokemon";
import { ExpCurve } from "../pokemon/exp-curve";
import { Move, MoveStatChange } from "../pokemon/move";
import type { MegaEvolution } from "../pokemon/mega-evolution";
import { MoveLearnt } from "../pokemon/move-learnt";
import { type Trainer, MultiBattleStatus } from "../pokemon/trainer";
import type { TrainerPokemon } from "../pokemon/trainer-pokemon";
import type { Encounter } from "../pokemon/encounter";
import { Evolution } from "../pokemon/evolution";
import type { EncounterSet } from "../pokemon/encounter-set";
import { StaticEncounter } from "../pokemon/static-encounter";
import type { TotemPokemon } from "../pokemon/totem-pokemon";
import type { IngameTrade } from "../pokemon/ingame-trade";
import type { PickupItem } from "../pokemon/pickup-item";
import { Shop } from "../pokemon/shop";
import type { ItemList } from "../pokemon/item-list";
import type { GenRestrictions } from "../pokemon/gen-restrictions";
import { Type, isHackOnly } from "../pokemon/type";
import { randomType as typeRandomType } from "../pokemon/type";
import { MoveCategory } from "../pokemon/move-category";
import { StatChangeMoveType } from "../pokemon/stat-change-move-type";
import { StatChangeType } from "../pokemon/stat-change-type";
import { StatusType } from "../pokemon/status-type";
import { Stat } from "../pokemon/stat";
import type { StatChange } from "../pokemon/stat-change";
import { EvolutionUpdate } from "./evolution-update";
import { EvolutionType, usesLevel as evoUsesLevel } from "../pokemon/evolution-type";
import type { RandomInstance } from "../utils/random-source";
import { RandomSource } from "../utils/random-source";
import { RomFunctions } from "../utils/rom-functions";
import { MiscTweak } from "../utils/misc-tweak";
import * as Abilities from "../constants/abilities";
import * as Moves from "../constants/moves";
import * as Species from "../constants/species";
import * as GlobalConstants from "../constants/global-constants";
import * as Gen2Constants from "../constants/gen2-constants";
import * as Gen3Constants from "../constants/gen3-constants";
import * as Gen4Constants from "../constants/gen4-constants";
import * as Gen5Constants from "../constants/gen5-constants";
import * as Gen6Constants from "../constants/gen6-constants";
import { RandomizationException } from "../exceptions/randomization-exception";

// ---- Internal helper interfaces ----

type BasePokemonAction = (pk: Pokemon) => void;
type EvolvedPokemonAction = (
  evFrom: Pokemon,
  evTo: Pokemon,
  toMonIsFinalEvo: boolean
) => void;

// ---- AbstractRomHandler ----

export abstract class AbstractRomHandler implements RomHandler {
  private restrictionsSet = false;
  protected mainPokemonList: Pokemon[] = [];
  protected mainPokemonListInclFormes: Pokemon[] = [];
  private altFormesList: Pokemon[] = [];
  private megaEvolutionsList: MegaEvolution[] = [];
  private noLegendaryList: Pokemon[] = [];
  private onlyLegendaryList: Pokemon[] = [];
  private ultraBeastList: Pokemon[] = [];
  private noLegendaryListInclFormes: Pokemon[] = [];
  private onlyLegendaryListInclFormes: Pokemon[] = [];
  private noLegendaryAltsList: Pokemon[] = [];
  private onlyLegendaryAltsList: Pokemon[] = [];
  private pickedStarters: Pokemon[] = [];
  protected readonly random: RandomInstance;
  private readonly cosmeticRandom: RandomInstance;
  protected logStream: LogStream | null;
  private alreadyPicked: Pokemon[] = [];
  private placementHistory: Map<Pokemon, number> = new Map();
  private itemPlacementHistory: Map<number, number> = new Map();
  private fullyEvolvedRandomSeed = -1;
  protected isORAS = false;
  protected isSM = false;
  protected perfectAccuracy = 100;

  protected impossibleEvolutionUpdates: Set<EvolutionUpdate> = new Set();
  protected timeBasedEvolutionUpdates: Set<EvolutionUpdate> = new Set();
  protected easierEvolutionUpdates: Set<EvolutionUpdate> = new Set();

  private moveUpdates: Map<number, boolean[]> = new Map();

  private twoEvoPokes: Pokemon[] | null = null;

  // -- Type weighting cache --
  private typeWeightings: Map<Type, number> | null = null;
  private totalTypeWeighting = 0;

  // -- Trainer Pokemon replacement caches --
  private cachedReplacementLists: Map<Type, Pokemon[]> | null = null;
  private cachedAllList: Pokemon[] = [];
  private bannedList: Pokemon[] = [];
  private usedAsUniqueList: Pokemon[] = [];

  constructor(random: RandomInstance, logStream: LogStream | null) {
    this.random = random;
    this.cosmeticRandom = RandomSource.cosmeticInstance();
    this.logStream = logStream;
  }

  // =======================================================================
  // Public implemented methods
  // =======================================================================

  setLog(logStream: LogStream): void {
    this.logStream = logStream;
  }

  setPokemonPool(settings: Settings | null): void {
    let restrictions: GenRestrictions | null = null;
    if (settings != null) {
      restrictions = settings.currentRestrictions;
      if (!settings.limitPokemon) {
        restrictions = null;
      }
    }

    this.restrictionsSet = true;
    this.mainPokemonList = this.allPokemonWithoutNull();
    this.mainPokemonListInclFormes = this.allPokemonInclFormesWithoutNull();
    this.altFormesList = this.getAltFormes();
    this.megaEvolutionsList = this.getMegaEvolutions();

    if (restrictions != null) {
      this.mainPokemonList = [];
      this.mainPokemonListInclFormes = [];
      this.megaEvolutionsList = [];
      const allPokemon = this.getPokemon();

      if (restrictions.allow_gen1) {
        this.addPokesFromRange(
          this.mainPokemonList,
          allPokemon,
          Species.bulbasaur,
          Species.mew
        );
      }
      if (
        restrictions.allow_gen2 &&
        allPokemon.length > Gen2Constants.pokemonCount
      ) {
        this.addPokesFromRange(
          this.mainPokemonList,
          allPokemon,
          Species.chikorita,
          Species.celebi
        );
      }
      if (
        restrictions.allow_gen3 &&
        allPokemon.length > Gen3Constants.pokemonCount
      ) {
        this.addPokesFromRange(
          this.mainPokemonList,
          allPokemon,
          Species.treecko,
          Species.deoxys
        );
      }
      if (
        restrictions.allow_gen4 &&
        allPokemon.length > Gen4Constants.pokemonCount
      ) {
        this.addPokesFromRange(
          this.mainPokemonList,
          allPokemon,
          Species.turtwig,
          Species.arceus
        );
      }
      if (
        restrictions.allow_gen5 &&
        allPokemon.length > Gen5Constants.pokemonCount
      ) {
        this.addPokesFromRange(
          this.mainPokemonList,
          allPokemon,
          Species.victini,
          Species.genesect
        );
      }
      if (
        restrictions.allow_gen6 &&
        allPokemon.length > Gen6Constants.pokemonCount
      ) {
        this.addPokesFromRange(
          this.mainPokemonList,
          allPokemon,
          Species.chespin,
          Species.volcanion
        );
      }

      const maxGen7SpeciesID = this.isSM
        ? Species.marshadow
        : Species.zeraora;
      if (restrictions.allow_gen7 && allPokemon.length > maxGen7SpeciesID) {
        this.addPokesFromRange(
          this.mainPokemonList,
          allPokemon,
          Species.rowlet,
          maxGen7SpeciesID
        );
      }

      if (restrictions.allow_evolutionary_relatives) {
        this.addEvolutionaryRelatives(this.mainPokemonList);
      }

      this.addAllPokesInclFormes(
        this.mainPokemonList,
        this.mainPokemonListInclFormes
      );

      const allMegaEvolutions = this.getMegaEvolutions();
      for (const megaEvo of allMegaEvolutions) {
        if (this.mainPokemonListInclFormes.includes(megaEvo.to)) {
          this.megaEvolutionsList.push(megaEvo);
        }
      }
    }

    this.noLegendaryList = [];
    this.noLegendaryListInclFormes = [];
    this.onlyLegendaryList = [];
    this.onlyLegendaryListInclFormes = [];
    this.noLegendaryAltsList = [];
    this.onlyLegendaryAltsList = [];
    this.ultraBeastList = [];

    for (const p of this.mainPokemonList) {
      if (p.isLegendary()) {
        this.onlyLegendaryList.push(p);
      } else if (p.isUltraBeast()) {
        this.ultraBeastList.push(p);
      } else {
        this.noLegendaryList.push(p);
      }
    }
    for (const p of this.mainPokemonListInclFormes) {
      if (p.isLegendary()) {
        this.onlyLegendaryListInclFormes.push(p);
      } else if (!this.ultraBeastList.includes(p)) {
        this.noLegendaryListInclFormes.push(p);
      }
    }
    for (const f of this.altFormesList) {
      if (f.isLegendary()) {
        this.onlyLegendaryAltsList.push(f);
      } else {
        this.noLegendaryAltsList.push(f);
      }
    }
  }

  // ---- Stats ----

  shufflePokemonStats(settings: Settings): void {
    const evolutionSanity = settings.baseStatsFollowEvolutions;
    const megaEvolutionSanity = settings.baseStatsFollowMegaEvolutions;

    if (evolutionSanity) {
      this.copyUpEvolutionsHelper(
        (pk) => pk.shuffleStats(() => this.random.nextDouble()),
        (_evFrom, evTo) => evTo.copyShuffledStatsUpEvolution(_evFrom)
      );
    } else {
      const allPokes = this.getPokemonInclFormes();
      for (const pk of allPokes) {
        if (pk != null) {
          pk.shuffleStats(() => this.random.nextDouble());
        }
      }
    }

    const allPokes = this.getPokemonInclFormes();
    for (const pk of allPokes) {
      if (pk != null && pk.actuallyCosmetic) {
        pk.copyBaseFormeBaseStats(pk.baseForme!);
      }
    }

    if (megaEvolutionSanity) {
      const allMegaEvos = this.getMegaEvolutions();
      for (const megaEvo of allMegaEvos) {
        if (megaEvo.from.megaEvolutionsFrom.length > 1) continue;
        megaEvo.to.copyShuffledStatsUpEvolution(megaEvo.from);
      }
    }
  }

  randomizePokemonStats(settings: Settings): void {
    const evolutionSanity = settings.baseStatsFollowEvolutions;
    const megaEvolutionSanity = settings.baseStatsFollowMegaEvolutions;
    const assignEvoStatsRandomly = settings.assignEvoStatsRandomly;

    if (evolutionSanity) {
      if (assignEvoStatsRandomly) {
        this.copyUpEvolutionsHelper4(
          (pk) => pk.randomizeStatsWithinBST(() => this.random.nextDouble()),
          (_evFrom, evTo) =>
            evTo.assignNewStatsForEvolution(
              _evFrom,
              () => this.random.nextDouble()
            ),
          (_evFrom, evTo) =>
            evTo.assignNewStatsForEvolution(
              _evFrom,
              () => this.random.nextDouble()
            ),
          true
        );
      } else {
        this.copyUpEvolutionsHelper4(
          (pk) => pk.randomizeStatsWithinBST(() => this.random.nextDouble()),
          (_evFrom, evTo) => evTo.copyRandomizedStatsUpEvolution(_evFrom),
          (_evFrom, evTo) =>
            evTo.assignNewStatsForEvolution(
              _evFrom,
              () => this.random.nextDouble()
            ),
          true
        );
      }
    } else {
      const allPokes = this.getPokemonInclFormes();
      for (const pk of allPokes) {
        if (pk != null) {
          pk.randomizeStatsWithinBST(() => this.random.nextDouble());
        }
      }
    }

    const allPokes = this.getPokemonInclFormes();
    for (const pk of allPokes) {
      if (pk != null && pk.actuallyCosmetic) {
        pk.copyBaseFormeBaseStats(pk.baseForme!);
      }
    }

    if (megaEvolutionSanity) {
      const allMegaEvos = this.getMegaEvolutions();
      for (const megaEvo of allMegaEvos) {
        if (
          megaEvo.from.megaEvolutionsFrom.length > 1 ||
          assignEvoStatsRandomly
        ) {
          megaEvo.to.assignNewStatsForEvolution(
            megaEvo.from,
            () => this.random.nextDouble()
          );
        } else {
          megaEvo.to.copyRandomizedStatsUpEvolution(megaEvo.from);
        }
      }
    }
  }

  updatePokemonStats(settings: Settings): void {
    const generation = settings.updateBaseStatsToGeneration;
    const pokes = this.getPokemonInclFormes();

    for (let gen = 6; gen <= generation; gen++) {
      const statChanges = this.getUpdatedPokemonStats(gen);
      for (let i = 1; i < pokes.length; i++) {
        const changedStats = statChanges.get(i);
        if (changedStats != null) {
          let statNum = 0;
          const pk = pokes[i]!;
          if ((changedStats.stat & Stat.HP) !== 0) {
            pk.hp = changedStats.values[statNum];
            statNum++;
          }
          if ((changedStats.stat & Stat.ATK) !== 0) {
            pk.attack = changedStats.values[statNum];
            statNum++;
          }
          if ((changedStats.stat & Stat.DEF) !== 0) {
            pk.defense = changedStats.values[statNum];
            statNum++;
          }
          if ((changedStats.stat & Stat.SPATK) !== 0) {
            if (this.generationOfPokemon() !== 1) {
              pk.spatk = changedStats.values[statNum];
            }
            statNum++;
          }
          if ((changedStats.stat & Stat.SPDEF) !== 0) {
            if (this.generationOfPokemon() !== 1) {
              pk.spdef = changedStats.values[statNum];
            }
            statNum++;
          }
          if ((changedStats.stat & Stat.SPEED) !== 0) {
            pk.speed = changedStats.values[statNum];
            statNum++;
          }
          if ((changedStats.stat & Stat.SPECIAL) !== 0) {
            pk.special = changedStats.values[statNum];
          }
        }
      }
    }
  }

  // ---- Random Pokemon selection ----

  randomPokemon(): Pokemon {
    this.checkPokemonRestrictions();
    return this.mainPokemonList[
      this.random.nextInt(this.mainPokemonList.length)
    ];
  }

  randomPokemonInclFormes(): Pokemon {
    this.checkPokemonRestrictions();
    return this.mainPokemonListInclFormes[
      this.random.nextInt(this.mainPokemonListInclFormes.length)
    ];
  }

  randomNonLegendaryPokemon(): Pokemon {
    this.checkPokemonRestrictions();
    return this.noLegendaryList[
      this.random.nextInt(this.noLegendaryList.length)
    ];
  }

  private randomNonLegendaryPokemonInclFormes(): Pokemon {
    this.checkPokemonRestrictions();
    return this.noLegendaryListInclFormes[
      this.random.nextInt(this.noLegendaryListInclFormes.length)
    ];
  }

  randomLegendaryPokemon(): Pokemon {
    this.checkPokemonRestrictions();
    return this.onlyLegendaryList[
      this.random.nextInt(this.onlyLegendaryList.length)
    ];
  }

  random2EvosPokemon(allowAltFormes: boolean): Pokemon {
    if (this.twoEvoPokes == null) {
      this.twoEvoPokes = [];
      const allPokes = allowAltFormes
        ? this.getPokemonInclFormes().filter(
            (pk) => pk == null || !pk.actuallyCosmetic
          )
        : this.getPokemon();
      for (const pk of allPokes) {
        if (
          pk != null &&
          pk.evolutionsTo.length === 0 &&
          pk.evolutionsFrom.length > 0
        ) {
          for (const ev of pk.evolutionsFrom) {
            if (ev.to.evolutionsFrom.length > 0) {
              this.twoEvoPokes.push(pk);
              break;
            }
          }
        }
      }
    }
    return this.twoEvoPokes[this.random.nextInt(this.twoEvoPokes.length)];
  }

  // ---- Types ----

  randomType(): Type {
    let t = typeRandomType(() => this.random.nextDouble());
    while (!this.typeInGame(t)) {
      t = typeRandomType(() => this.random.nextDouble());
    }
    return t;
  }

  randomizePokemonTypes(settings: Settings): void {
    const evolutionSanity =
      settings.typesMod === TypesMod.RANDOM_FOLLOW_EVOLUTIONS;
    const megaEvolutionSanity = settings.typesFollowMegaEvolutions;
    const dualTypeOnly = settings.dualTypeOnly;

    const allPokes = this.getPokemonInclFormes();
    if (evolutionSanity) {
      this.copyUpEvolutionsHelper(
        (pk) => {
          pk.primaryType = this.randomType();
          pk.secondaryType = null;
          if (
            pk.evolutionsFrom.length === 1 &&
            pk.evolutionsFrom[0].carryStats
          ) {
            if (this.random.nextDouble() < 0.35 || dualTypeOnly) {
              pk.secondaryType = this.randomType();
              while (pk.secondaryType === pk.primaryType) {
                pk.secondaryType = this.randomType();
              }
            }
          } else {
            if (this.random.nextDouble() < 0.5 || dualTypeOnly) {
              pk.secondaryType = this.randomType();
              while (pk.secondaryType === pk.primaryType) {
                pk.secondaryType = this.randomType();
              }
            }
          }
        },
        (evFrom, evTo, toMonIsFinalEvo) => {
          evTo.primaryType = evFrom.primaryType;
          evTo.secondaryType = evFrom.secondaryType;
          if (evTo.secondaryType == null) {
            const chance = toMonIsFinalEvo ? 0.25 : 0.15;
            if (this.random.nextDouble() < chance || dualTypeOnly) {
              evTo.secondaryType = this.randomType();
              while (evTo.secondaryType === evTo.primaryType) {
                evTo.secondaryType = this.randomType();
              }
            }
          }
        }
      );
    } else {
      for (const pkmn of allPokes) {
        if (pkmn != null) {
          pkmn.primaryType = this.randomType();
          pkmn.secondaryType = null;
          if (this.random.nextDouble() < 0.5 || settings.dualTypeOnly) {
            pkmn.secondaryType = this.randomType();
            while (pkmn.secondaryType === pkmn.primaryType) {
              pkmn.secondaryType = this.randomType();
            }
          }
        }
      }
    }

    for (const pk of allPokes) {
      if (pk != null && pk.actuallyCosmetic) {
        pk.primaryType = pk.baseForme!.primaryType;
        pk.secondaryType = pk.baseForme!.secondaryType;
      }
    }

    if (megaEvolutionSanity) {
      const allMegaEvos = this.getMegaEvolutions();
      for (const megaEvo of allMegaEvos) {
        if (megaEvo.from.megaEvolutionsFrom.length > 1) continue;
        megaEvo.to.primaryType = megaEvo.from.primaryType;
        megaEvo.to.secondaryType = megaEvo.from.secondaryType;
        if (megaEvo.to.secondaryType == null) {
          if (this.random.nextDouble() < 0.25) {
            megaEvo.to.secondaryType = this.randomType();
            while (megaEvo.to.secondaryType === megaEvo.to.primaryType) {
              megaEvo.to.secondaryType = this.randomType();
            }
          }
        }
      }
    }
  }

  // ---- Abilities ----

  randomizeAbilities(settings: Settings): void {
    const evolutionSanity = settings.abilitiesFollowEvolutions;
    const allowWonderGuard = settings.allowWonderGuard;
    const banTrappingAbilities = settings.banTrappingAbilities;
    const banNegativeAbilities = settings.banNegativeAbilities;
    const banBadAbilities = settings.banBadAbilities;
    const megaEvolutionSanity = settings.abilitiesFollowMegaEvolutions;
    const weighDuplicatesTogether = settings.weighDuplicateAbilitiesTogether;
    const ensureTwoAbilities = settings.ensureTwoAbilities;
    const doubleBattleMode = settings.doubleBattleMode;

    if (this.abilitiesPerPokemon() === 0) return;

    const hasDWAbilities = this.abilitiesPerPokemon() === 3;
    const bannedAbilities: number[] = [...this.getUselessAbilities()];

    if (!allowWonderGuard) {
      bannedAbilities.push(Abilities.wonderGuard);
    }
    if (banTrappingAbilities) {
      bannedAbilities.push(...GlobalConstants.battleTrappingAbilities);
    }
    if (banNegativeAbilities) {
      bannedAbilities.push(...GlobalConstants.negativeAbilities);
    }
    if (banBadAbilities) {
      bannedAbilities.push(...GlobalConstants.badAbilities);
      if (!doubleBattleMode) {
        bannedAbilities.push(...GlobalConstants.doubleBattleAbilities);
      }
    }
    if (weighDuplicatesTogether) {
      bannedAbilities.push(...GlobalConstants.duplicateAbilities);
      if (this.generationOfPokemon() === 3) {
        bannedAbilities.push(Gen3Constants.airLockIndex);
      }
    }

    const maxAbility = this.highestAbilityIndex();

    if (evolutionSanity) {
      this.copyUpEvolutionsHelper(
        (pk) => {
          if (
            pk.ability1 !== Abilities.wonderGuard &&
            pk.ability2 !== Abilities.wonderGuard &&
            pk.ability3 !== Abilities.wonderGuard
          ) {
            pk.ability1 = this.pickRandomAbility(
              maxAbility,
              bannedAbilities,
              weighDuplicatesTogether
            );
            if (ensureTwoAbilities || this.random.nextDouble() < 0.5) {
              pk.ability2 = this.pickRandomAbility(
                maxAbility,
                bannedAbilities,
                weighDuplicatesTogether,
                pk.ability1
              );
            } else {
              pk.ability2 = 0;
            }
            if (hasDWAbilities) {
              pk.ability3 = this.pickRandomAbility(
                maxAbility,
                bannedAbilities,
                weighDuplicatesTogether,
                pk.ability1,
                pk.ability2
              );
            }
          }
        },
        (evFrom, evTo) => {
          if (
            evTo.ability1 !== Abilities.wonderGuard &&
            evTo.ability2 !== Abilities.wonderGuard &&
            evTo.ability3 !== Abilities.wonderGuard
          ) {
            evTo.ability1 = evFrom.ability1;
            evTo.ability2 = evFrom.ability2;
            evTo.ability3 = evFrom.ability3;
          }
        }
      );
    } else {
      const allPokes = this.getPokemonInclFormes();
      for (const pk of allPokes) {
        if (pk == null) continue;
        if (
          pk.ability1 !== Abilities.wonderGuard &&
          pk.ability2 !== Abilities.wonderGuard &&
          pk.ability3 !== Abilities.wonderGuard
        ) {
          pk.ability1 = this.pickRandomAbility(
            maxAbility,
            bannedAbilities,
            weighDuplicatesTogether
          );
          if (ensureTwoAbilities || this.random.nextDouble() < 0.5) {
            pk.ability2 = this.pickRandomAbility(
              maxAbility,
              bannedAbilities,
              weighDuplicatesTogether,
              pk.ability1
            );
          } else {
            pk.ability2 = 0;
          }
          if (hasDWAbilities) {
            pk.ability3 = this.pickRandomAbility(
              maxAbility,
              bannedAbilities,
              weighDuplicatesTogether,
              pk.ability1,
              pk.ability2
            );
          }
        }
      }
    }

    const allPokes = this.getPokemonInclFormes();
    for (const pk of allPokes) {
      if (pk != null && pk.actuallyCosmetic) {
        pk.copyBaseFormeAbilities(pk.baseForme!);
      }
    }

    if (megaEvolutionSanity) {
      const allMegaEvos = this.getMegaEvolutions();
      for (const megaEvo of allMegaEvos) {
        if (megaEvo.from.megaEvolutionsFrom.length > 1) continue;
        megaEvo.to.ability1 = megaEvo.from.ability1;
        megaEvo.to.ability2 = megaEvo.from.ability2;
        megaEvo.to.ability3 = megaEvo.from.ability3;
      }
    }
  }

  private pickRandomAbilityVariation(
    selectedAbility: number,
    ...alreadySetAbilities: number[]
  ): number {
    let newAbility = selectedAbility;
    while (true) {
      const abilityVariations = this.getAbilityVariations();
      for (const [baseAbility, variations] of abilityVariations) {
        if (selectedAbility === baseAbility) {
          newAbility = variations[this.random.nextInt(variations.length)];
          break;
        }
      }
      let repeat = false;
      for (const alreadySet of alreadySetAbilities) {
        if (alreadySet === newAbility) {
          repeat = true;
          break;
        }
      }
      if (!repeat) break;
    }
    return newAbility;
  }

  private pickRandomAbility(
    maxAbility: number,
    bannedAbilities: number[],
    useVariations: boolean,
    ...alreadySetAbilities: number[]
  ): number {
    let newAbility: number;
    while (true) {
      newAbility = this.random.nextInt(maxAbility) + 1;
      if (bannedAbilities.includes(newAbility)) continue;
      let repeat = false;
      for (const alreadySet of alreadySetAbilities) {
        if (alreadySet === newAbility) {
          repeat = true;
          break;
        }
      }
      if (!repeat) {
        if (useVariations) {
          newAbility = this.pickRandomAbilityVariation(
            newAbility,
            ...alreadySetAbilities
          );
        }
        break;
      }
    }
    return newAbility;
  }

  // ---- Move randomization ----

  randomizeMovePowers(): void {
    const moves = this.getMoves();
    for (const mv of moves) {
      if (mv != null && mv.internalId !== Moves.struggle && mv.power >= 10) {
        if (this.random.nextInt(3) !== 2) {
          mv.power = this.random.nextInt(11) * 5 + 50;
        } else {
          mv.power = this.random.nextInt(27) * 5 + 20;
        }
        for (let i = 0; i < 2; i++) {
          if (this.random.nextInt(100) === 0) {
            mv.power += 50;
          }
        }
        if (mv.hitCount !== 1) {
          mv.power = Math.round(mv.power / mv.hitCount / 5) * 5;
          if (mv.power === 0) {
            mv.power = 5;
          }
        }
      }
    }
  }

  randomizeMovePPs(): void {
    const moves = this.getMoves();
    for (const mv of moves) {
      if (mv != null && mv.internalId !== Moves.struggle) {
        if (this.random.nextInt(3) !== 2) {
          mv.pp = this.random.nextInt(3) * 5 + 15;
        } else {
          mv.pp = this.random.nextInt(8) * 5 + 5;
        }
      }
    }
  }

  randomizeMoveAccuracies(): void {
    const moves = this.getMoves();
    for (const mv of moves) {
      if (
        mv != null &&
        mv.internalId !== Moves.struggle &&
        mv.hitratio >= 5
      ) {
        if (mv.hitratio <= 50) {
          mv.hitratio = this.random.nextInt(7) * 5 + 20;
          if (this.random.nextInt(10) === 0) {
            mv.hitratio = Math.floor((mv.hitratio * 3) / 2 / 5) * 5;
          }
        } else if (mv.hitratio < 90) {
          mv.hitratio = 100;
          while (mv.hitratio > 20) {
            if (this.random.nextInt(10) < 2) break;
            mv.hitratio -= 5;
          }
        } else {
          mv.hitratio = 100;
          while (mv.hitratio > 20) {
            if (this.random.nextInt(10) < 4) break;
            mv.hitratio -= 5;
          }
        }
      }
    }
  }

  randomizeMoveTypes(): void {
    const moves = this.getMoves();
    for (const mv of moves) {
      if (mv != null && mv.internalId !== Moves.struggle && mv.type != null) {
        mv.type = this.randomType();
      }
    }
  }

  randomizeMoveCategory(): void {
    if (!this.hasPhysicalSpecialSplit()) return;
    const moves = this.getMoves();
    for (const mv of moves) {
      if (
        mv != null &&
        mv.internalId !== Moves.struggle &&
        mv.category !== MoveCategory.STATUS
      ) {
        if (this.random.nextInt(2) === 0) {
          mv.category =
            mv.category === MoveCategory.PHYSICAL
              ? MoveCategory.SPECIAL
              : MoveCategory.PHYSICAL;
        }
      }
    }
  }

  // ---- Wild encounters ----

  onlyChangeWildLevels(settings: Settings): void {
    const levelModifier = settings.wildLevelModifier;
    const currentEncounters = this.getEncounters(true);
    if (levelModifier !== 0) {
      for (const area of currentEncounters) {
        for (const enc of area.encounters) {
          enc.level = Math.min(
            100,
            Math.round(enc.level * (1 + levelModifier / 100.0))
          );
          enc.maxLevel = Math.min(
            100,
            Math.round(enc.maxLevel * (1 + levelModifier / 100.0))
          );
        }
      }
      this.setEncounters(true, currentEncounters);
    }
  }

  // ---- Placement History ----

  renderPlacementHistory(): void {
    for (const [p, count] of this.placementHistory) {
      console.log(p.name + ": " + count);
    }
  }

  // ---- Default implementations ----

  typeInGame(type: Type): boolean {
    return !isHackOnly(type) && !(type === Type.FAIRY && this.generationOfPokemon() < 6);
  }

  abilityName(_number: number): string {
    return "";
  }

  getUselessAbilities(): number[] {
    return [];
  }

  getAbilityForTrainerPokemon(_tp: TrainerPokemon): number {
    return 0;
  }

  hasTimeBasedEncounters(): boolean {
    return false;
  }

  bannedForWildEncounters(): Pokemon[] {
    return [];
  }

  getMovesBannedFromLevelup(): number[] {
    return [];
  }

  bannedForStaticPokemon(): Pokemon[] {
    return [];
  }

  forceSwapStaticMegaEvos(): boolean {
    return false;
  }

  maxTrainerNameLength(): number {
    return Number.MAX_SAFE_INTEGER;
  }

  maxSumOfTrainerNameLengths(): number {
    return Number.MAX_SAFE_INTEGER;
  }

  maxTrainerClassNameLength(): number {
    return Number.MAX_SAFE_INTEGER;
  }

  maxTradeNicknameLength(): number {
    return 10;
  }

  maxTradeOTNameLength(): number {
    return 7;
  }

  altFormesCanHaveDifferentEvolutions(): boolean {
    return false;
  }

  getGameBreakingMoves(): number[] {
    return [49, 82]; // SonicBoom & Dragon Rage
  }

  getIllegalMoves(): number[] {
    return [];
  }

  isYellow(): boolean {
    return false;
  }

  writeCheckValueToROM(_value: number): void {
    // do nothing
  }

  miscTweaksAvailable(): number {
    return 0;
  }

  applyMiscTweaks(settings: Settings): void {
    const selectedMiscTweaks = settings.currentMiscTweaks;
    const codeTweaksAvailable = this.miscTweaksAvailable();
    const tweaksToApply: MiscTweak[] = [];
    for (const mt of MiscTweak.allTweaks) {
      if (
        (codeTweaksAvailable & mt.getValue()) > 0 &&
        (selectedMiscTweaks & mt.getValue()) > 0
      ) {
        tweaksToApply.push(mt);
      }
    }
    tweaksToApply.sort((a, b) => a.compareTo(b));
    for (const mt of tweaksToApply) {
      this.applyMiscTweak(mt);
    }
  }

  applyMiscTweak(_tweak: { value: number }): void {
    // do nothing
  }

  getXItems(): number[] {
    return GlobalConstants.xItems;
  }

  // ---- Item placement history helpers (for even distribution) ----

  private setItemPlacementHistory(newItem: number): void {
    const history = this.getItemPlacementHistory(newItem);
    this.itemPlacementHistory.set(newItem, history + 1);
  }

  private getItemPlacementHistory(newItem: number): number {
    if (this.itemPlacementHistory.has(newItem)) {
      return this.itemPlacementHistory.get(newItem)!;
    }
    return 0;
  }

  private getItemPlacementAverage(): number {
    const keys = Array.from(this.itemPlacementHistory.keys());
    if (keys.length === 0) return 0;
    let total = 0;
    for (const key of keys) {
      total += this.itemPlacementHistory.get(key)!;
    }
    return total / keys.length;
  }

  getSensibleHeldItemsFor(
    _tp: TrainerPokemon,
    _consumableOnly: boolean,
    _moves: Move[],
    _pokeMoves: number[]
  ): number[] {
    return [0];
  }

  getAllConsumableHeldItems(): number[] {
    return [0];
  }

  getAllHeldItems(): number[] {
    return [0];
  }

  getBannedFormesForTrainerPokemon(): Pokemon[] {
    return [];
  }

  getPickupItems(): PickupItem[] {
    return [];
  }

  setPickupItems(_pickupItems: PickupItem[]): void {
    // do nothing
  }

  getAbilityDependentFormes(): Pokemon[] {
    const abilityDependentFormes: Pokemon[] = [];
    for (const pokemon of this.mainPokemonListInclFormes) {
      if (pokemon.baseForme != null) {
        if (pokemon.baseForme.number === Species.castform) {
          abilityDependentFormes.push(pokemon);
        } else if (
          pokemon.baseForme.number === Species.darmanitan &&
          pokemon.formeNumber === 1
        ) {
          abilityDependentFormes.push(pokemon);
        } else if (pokemon.baseForme.number === Species.aegislash) {
          abilityDependentFormes.push(pokemon);
        } else if (pokemon.baseForme.number === Species.wishiwashi) {
          abilityDependentFormes.push(pokemon);
        }
      }
    }
    return abilityDependentFormes;
  }

  getBannedFormesForPlayerPokemon(): Pokemon[] {
    const bannedFormes: Pokemon[] = [];
    for (const pokemon of this.mainPokemonListInclFormes) {
      if (pokemon.baseForme != null) {
        if (pokemon.baseForme.number === Species.giratina) {
          bannedFormes.push(pokemon);
        } else if (pokemon.baseForme.number === Species.shaymin) {
          bannedFormes.push(pokemon);
        }
      }
    }
    return bannedFormes;
  }

  getPickedStarters(): Pokemon[] {
    return this.pickedStarters;
  }

  // ---- Logging helpers ----

  protected log(msg: string): void {
    if (this.logStream != null) {
      this.logStream.println(msg);
    }
  }

  protected logBlankLine(): void {
    if (this.logStream != null) {
      this.logStream.println();
    }
  }

  // ---- Internal helpers ----

  checkPokemonRestrictions(): void {
    if (!this.restrictionsSet) {
      this.setPokemonPool(null);
    }
  }

  private addPokesFromRange(
    pokemonPool: Pokemon[],
    allPokemon: (Pokemon | null)[],
    rangeMin: number,
    rangeMax: number
  ): void {
    for (let i = rangeMin; i <= rangeMax; i++) {
      const pk = allPokemon[i];
      if (pk != null && !pokemonPool.includes(pk)) {
        pokemonPool.push(pk);
      }
    }
  }

  private addEvolutionaryRelatives(pokemonPool: Pokemon[]): void {
    const newPokemon: Pokemon[] = [];
    for (const pk of pokemonPool) {
      const relatives = this.getEvolutionaryRelatives(pk);
      for (const relative of relatives) {
        if (
          !pokemonPool.includes(relative) &&
          !newPokemon.includes(relative)
        ) {
          newPokemon.push(relative);
        }
      }
    }
    pokemonPool.push(...newPokemon);
  }

  private getEvolutionaryRelatives(pk: Pokemon): Pokemon[] {
    const relatives: Pokemon[] = [];
    for (const ev of pk.evolutionsFrom) {
      if (!relatives.includes(ev.to)) {
        const evo = ev.to;
        relatives.push(evo);
        const queue = [...evo.evolutionsFrom];
        while (queue.length > 0) {
          const next = queue.shift()!.to;
          if (!relatives.includes(next)) {
            relatives.push(next);
            queue.push(...next.evolutionsFrom);
          }
        }
      }
    }
    for (const ev of pk.evolutionsTo) {
      if (!relatives.includes(ev.from)) {
        let preEvo = ev.from;
        relatives.push(preEvo);
        const relativesForPreEvo = this.getEvolutionaryRelatives(preEvo);
        for (const r of relativesForPreEvo) {
          if (!relatives.includes(r)) relatives.push(r);
        }
        while (preEvo.evolutionsTo.length > 0) {
          preEvo = preEvo.evolutionsTo[0].from;
          if (!relatives.includes(preEvo)) {
            relatives.push(preEvo);
            const r2 = this.getEvolutionaryRelatives(preEvo);
            for (const r of r2) {
              if (!relatives.includes(r)) relatives.push(r);
            }
          }
        }
      }
    }
    return relatives;
  }

  private addAllPokesInclFormes(
    pokemonPool: Pokemon[],
    pokemonPoolInclFormes: Pokemon[]
  ): void {
    const altFormes = this.getAltFormes();
    for (const currentPokemon of pokemonPool) {
      if (!pokemonPoolInclFormes.includes(currentPokemon)) {
        pokemonPoolInclFormes.push(currentPokemon);
      }
      for (const potentialAltForme of altFormes) {
        if (
          potentialAltForme.baseForme != null &&
          potentialAltForme.baseForme.number === currentPokemon.number
        ) {
          pokemonPoolInclFormes.push(potentialAltForme);
        }
      }
    }
  }

  private allPokemonWithoutNull(): Pokemon[] {
    const allPokes = [...this.getPokemon()];
    // Remove the null at index 0
    if (allPokes.length > 0 && allPokes[0] == null) {
      allPokes.shift();
    }
    return allPokes.filter((p): p is Pokemon => p != null);
  }

  private allPokemonInclFormesWithoutNull(): Pokemon[] {
    const allPokes = [...this.getPokemonInclFormes()];
    if (allPokes.length > 0 && allPokes[0] == null) {
      allPokes.shift();
    }
    return allPokes.filter((p): p is Pokemon => p != null);
  }

  private pokemonOfType(type: Type, noLegendaries: boolean): Pokemon[] {
    const typedPokes: Pokemon[] = [];
    for (const pk of this.mainPokemonList) {
      if (
        pk != null &&
        (!noLegendaries || !pk.isLegendary()) &&
        !pk.actuallyCosmetic
      ) {
        if (pk.primaryType === type || pk.secondaryType === type) {
          typedPokes.push(pk);
        }
      }
    }
    return typedPokes;
  }

  private pokemonOfTypeInclFormes(
    type: Type,
    noLegendaries: boolean
  ): Pokemon[] {
    const typedPokes: Pokemon[] = [];
    for (const pk of this.mainPokemonListInclFormes) {
      if (
        pk != null &&
        !pk.actuallyCosmetic &&
        (!noLegendaries || !pk.isLegendary())
      ) {
        if (pk.primaryType === type || pk.secondaryType === type) {
          typedPokes.push(pk);
        }
      }
    }
    return typedPokes;
  }

  private pokemonInArea(area: EncounterSet): Set<Pokemon> {
    const inArea = new Set<Pokemon>();
    for (const enc of area.encounters) {
      if (enc.pokemon != null) {
        inArea.add(enc.pokemon);
      }
    }
    return inArea;
  }

  pickEntirelyRandomPokemon(
    includeFormes: boolean,
    noLegendaries: boolean,
    area: EncounterSet,
    banned: Pokemon[]
  ): Pokemon {
    let result: Pokemon;
    const pickRandom = () =>
      noLegendaries
        ? includeFormes
          ? this.randomNonLegendaryPokemonInclFormes()
          : this.randomNonLegendaryPokemon()
        : includeFormes
          ? this.randomPokemonInclFormes()
          : this.randomPokemon();

    result = pickRandom();
    while (result.actuallyCosmetic) {
      result = pickRandom();
    }
    while (banned.includes(result) || area.bannedPokemon.has(result)) {
      result = pickRandom();
      while (result.actuallyCosmetic) {
        result = pickRandom();
      }
    }
    return result;
  }

  private pickWildPowerLvlReplacement(
    pokemonPool: Pokemon[],
    current: Pokemon,
    banSamePokemon: boolean,
    usedUp: Pokemon[] | null,
    bstBalanceLevel: number
  ): Pokemon {
    const balancedBST = bstBalanceLevel * 10 + 250;
    const currentBST = Math.min(current.bstForPowerLevels(), balancedBST);
    let minTarget = currentBST - Math.floor(currentBST / 10);
    let maxTarget = currentBST + Math.floor(currentBST / 10);
    const canPick: Pokemon[] = [];
    let expandRounds = 0;
    while (canPick.length === 0 || (canPick.length < 3 && expandRounds < 3)) {
      for (const pk of pokemonPool) {
        if (
          pk.bstForPowerLevels() >= minTarget &&
          pk.bstForPowerLevels() <= maxTarget &&
          (!banSamePokemon || pk !== current) &&
          (usedUp == null || !usedUp.includes(pk)) &&
          !canPick.includes(pk)
        ) {
          canPick.push(pk);
        }
      }
      minTarget -= Math.floor(currentBST / 20);
      maxTarget += Math.floor(currentBST / 20);
      expandRounds++;
    }
    return canPick[this.random.nextInt(canPick.length)];
  }

  private setFormeForEncounter(enc: Encounter, pk: Pokemon): void {
    let checkCosmetics = true;
    enc.formeNumber = 0;
    if (enc.pokemon != null && enc.pokemon.formeNumber > 0) {
      enc.formeNumber = enc.pokemon.formeNumber;
      enc.pokemon = enc.pokemon.baseForme;
      checkCosmetics = false;
    }
    if (enc.pokemon != null) {
      if (checkCosmetics && enc.pokemon.cosmeticForms > 0) {
        enc.formeNumber = enc.pokemon.getCosmeticFormNumber(
          this.random.nextInt(enc.pokemon.cosmeticForms)
        );
      } else if (!checkCosmetics && pk.cosmeticForms > 0) {
        enc.formeNumber += pk.getCosmeticFormNumber(
          this.random.nextInt(pk.cosmeticForms)
        );
      }
    }
  }

  // ---- CopyUpEvolutions helper ----

  private copyUpEvolutionsHelper(
    bpAction: BasePokemonAction,
    epAction: EvolvedPokemonAction
  ): void {
    this.copyUpEvolutionsHelper4(bpAction, epAction, null, false);
  }

  protected copyUpEvolutionsHelper4(
    bpAction: BasePokemonAction,
    epAction: EvolvedPokemonAction,
    splitAction: EvolvedPokemonAction | null,
    copySplitEvos: boolean
  ): void {
    const allPokes = this.getPokemonInclFormes();
    for (const pk of allPokes) {
      if (pk != null) {
        pk.temporaryFlag = false;
      }
    }

    const basicPokes = RomFunctions.getBasicPokemon(this);
    const splitEvos = RomFunctions.getSplitEvolutions(this);
    const middleEvos = RomFunctions.getMiddleEvolutions(this, copySplitEvos);

    for (const pk of basicPokes) {
      bpAction(pk);
      pk.temporaryFlag = true;
    }

    if (!copySplitEvos) {
      for (const pk of splitEvos) {
        bpAction(pk);
        pk.temporaryFlag = true;
      }
    }

    for (const pk of allPokes) {
      if (pk != null && !pk.temporaryFlag) {
        const currentStack: Evolution[] = [];
        let ev = pk.evolutionsTo[0];
        while (!ev.from.temporaryFlag) {
          currentStack.push(ev);
          ev = ev.from.evolutionsTo[0];
        }

        if (copySplitEvos && splitAction != null && splitEvos.has(ev.to)) {
          splitAction(ev.from, ev.to, !middleEvos.has(ev.to));
        } else {
          epAction(ev.from, ev.to, !middleEvos.has(ev.to));
        }
        ev.to.temporaryFlag = true;

        while (currentStack.length > 0) {
          ev = currentStack.pop()!;
          if (copySplitEvos && splitAction != null && splitEvos.has(pk)) {
            splitAction(ev.from, ev.to, !middleEvos.has(ev.to));
          } else {
            epAction(ev.from, ev.to, !middleEvos.has(ev.to));
          }
          ev.to.temporaryFlag = true;
        }
      }
    }
  }

  // -- Array shuffle using Fisher-Yates with the seeded random --
  private shuffleArray<T>(arr: T[]): void {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.random.nextInt(i + 1);
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
  }

  // -- Evolution helper methods --

  protected addEvoUpdateLevel(evolutionUpdates: Set<EvolutionUpdate>, evo: Evolution): void {
    evolutionUpdates.add(new EvolutionUpdate(evo.from, evo.to, EvolutionType.LEVEL, String(evo.extraInfo), false, false));
  }

  protected addEvoUpdateStone(evolutionUpdates: Set<EvolutionUpdate>, evo: Evolution, item: string): void {
    evolutionUpdates.add(new EvolutionUpdate(evo.from, evo.to, EvolutionType.STONE, item, false, false));
  }

  protected addEvoUpdateCondensed(evolutionUpdates: Set<EvolutionUpdate>, evo: Evolution, additional: boolean): void {
    evolutionUpdates.add(new EvolutionUpdate(evo.from, evo.to, EvolutionType.LEVEL, String(evo.extraInfo), true, additional));
  }

  protected addEvoUpdateHappiness(evolutionUpdates: Set<EvolutionUpdate>, evo: Evolution): void {
    evolutionUpdates.add(new EvolutionUpdate(evo.from, evo.to, EvolutionType.HAPPINESS, '', false, false));
  }

  protected addEvoUpdateHeldItem(evolutionUpdates: Set<EvolutionUpdate>, evo: Evolution, item: string): void {
    evolutionUpdates.add(new EvolutionUpdate(evo.from, evo.to, EvolutionType.LEVEL_ITEM_DAY, item, false, false));
  }

  private evoCycleCheck(from: Pokemon, to: Pokemon): boolean {
    const tempEvo = new Evolution(from, to, false, EvolutionType.NONE, 0);
    from.evolutionsFrom.push(tempEvo);
    const visited = new Set<Pokemon>();
    const recStack = new Set<Pokemon>();
    const recur = this.isCyclic(from, visited, recStack);
    const idx = from.evolutionsFrom.indexOf(tempEvo);
    if (idx >= 0) from.evolutionsFrom.splice(idx, 1);
    return recur;
  }

  private isCyclic(pk: Pokemon, visited: Set<Pokemon>, recStack: Set<Pokemon>): boolean {
    if (!visited.has(pk)) {
      visited.add(pk);
      recStack.add(pk);
      for (const ev of pk.evolutionsFrom) {
        if (!visited.has(ev.to) && this.isCyclic(ev.to, visited, recStack)) {
          return true;
        } else if (recStack.has(ev.to)) {
          return true;
        }
      }
    }
    recStack.delete(pk);
    return false;
  }

  private numPreEvolutions(pk: Pokemon, maxInterested: number, depth: number = 0): number {
    if (pk.evolutionsTo.length === 0) {
      return 0;
    }
    if (depth === maxInterested - 1) {
      return 1;
    }
    let maxPreEvos = 0;
    for (const ev of pk.evolutionsTo) {
      maxPreEvos = Math.max(maxPreEvos, this.numPreEvolutions(ev.from, maxInterested, depth + 1) + 1);
    }
    return maxPreEvos;
  }

  private relatedPokemon(original: Pokemon): Set<Pokemon> {
    const results = new Set<Pokemon>();
    results.add(original);
    const toCheck: Pokemon[] = [original];
    while (toCheck.length > 0) {
      const check = toCheck.shift()!;
      for (const ev of check.evolutionsFrom) {
        if (!results.has(ev.to)) { results.add(ev.to); toCheck.push(ev.to); }
      }
      for (const ev of check.evolutionsTo) {
        if (!results.has(ev.from)) { results.add(ev.from); toCheck.push(ev.from); }
      }
    }
    return results;
  }

  private pickEvoPowerLvlReplacement(pokemonPool: Pokemon[], current: Pokemon): Pokemon {
    const currentBST = current.bstForPowerLevels();
    let minTarget = currentBST - Math.floor(currentBST / 10);
    let maxTarget = currentBST + Math.floor(currentBST / 10);
    const canPick: Pokemon[] = [];
    const emergencyPick: Pokemon[] = [];
    let expandRounds = 0;
    while (canPick.length === 0 || (canPick.length < 3 && expandRounds < 3)) {
      for (const pk of pokemonPool) {
        const bst = pk.bstForPowerLevels();
        if (bst >= minTarget && bst <= maxTarget && !canPick.includes(pk) && !emergencyPick.includes(pk)) {
          if (this.alreadyPicked.includes(pk)) { emergencyPick.push(pk); } else { canPick.push(pk); }
        }
      }
      if (expandRounds >= 2 && canPick.length === 0) { canPick.push(...emergencyPick); }
      minTarget -= Math.floor(currentBST / 20);
      maxTarget += Math.floor(currentBST / 20);
      expandRounds++;
    }
    return canPick[this.random.nextInt(canPick.length)];
  }

  // -- Evolution randomization methods --

  condenseLevelEvolutions(maxLevel: number, maxIntermediateLevel: number): void {
    const allPokemon = this.getPokemon();
    for (const pk of allPokemon) {
      if (pk != null) {
        for (const checkEvo of pk.evolutionsFrom) {
          if (evoUsesLevel(checkEvo.type)) {
            if (checkEvo.extraInfo > maxIntermediateLevel && checkEvo.to.evolutionsFrom.length > 0) {
              checkEvo.extraInfo = maxIntermediateLevel;
              this.addEvoUpdateCondensed(this.easierEvolutionUpdates, checkEvo, false);
            } else if (checkEvo.extraInfo > maxLevel) {
              checkEvo.extraInfo = maxLevel;
              this.addEvoUpdateCondensed(this.easierEvolutionUpdates, checkEvo, false);
            }
          }
          if (checkEvo.type === EvolutionType.LEVEL_UPSIDE_DOWN) {
            checkEvo.type = EvolutionType.LEVEL;
            this.addEvoUpdateCondensed(this.easierEvolutionUpdates, checkEvo, false);
          }
        }
      }
    }
  }

  getImpossibleEvoUpdates(): Set<EvolutionUpdate> { return this.impossibleEvolutionUpdates; }
  getEasierEvoUpdates(): Set<EvolutionUpdate> { return this.easierEvolutionUpdates; }
  getTimeBasedEvoUpdates(): Set<EvolutionUpdate> { return this.timeBasedEvolutionUpdates; }

  randomizeEvolutions(settings: Settings): void {
    const similarStrength = settings.evosSimilarStrength;
    const sameType = settings.evosSameTyping;
    const limitToThreeStages = settings.evosMaxThreeStages;
    const forceChange = settings.evosForceChange;
    const allowAltFormes = settings.evosAllowAltFormes;
    const banIrregularAltFormes = settings.banIrregularAltFormes;
    const abilitiesAreRandomized = settings.abilitiesMod === AbilitiesMod.RANDOMIZE;

    this.checkPokemonRestrictions();
    let pokemonPool: Pokemon[];
    if (this.altFormesCanHaveDifferentEvolutions()) {
      pokemonPool = [...this.mainPokemonListInclFormes];
    } else {
      pokemonPool = [...this.mainPokemonList];
    }
    const actuallyCosmeticPokemonPool: Pokemon[] = [];
    const stageLimit = limitToThreeStages ? 3 : 10;

    const banned: Pokemon[] = [...this.getBannedFormesForPlayerPokemon()];
    if (!abilitiesAreRandomized) { banned.push(...this.getAbilityDependentFormes()); }
    if (banIrregularAltFormes) { banned.push(...this.getIrregularFormes()); }

    for (let i = 0; i < pokemonPool.length; i++) {
      const pk = pokemonPool[i];
      if (pk.actuallyCosmetic) { pokemonPool.splice(i, 1); i--; actuallyCosmeticPokemonPool.push(pk); }
    }

    const originalEvos = new Map<Pokemon, Evolution[]>();
    for (const pk of pokemonPool) { originalEvos.set(pk, [...pk.evolutionsFrom]); }

    const evoPairKey = (from: Pokemon, to: Pokemon): string => `${from.number}:${to.number}`;
    const newEvoPairs = new Set<string>();
    const oldEvoPairs = new Set<string>();

    if (forceChange) {
      for (const pk of pokemonPool) {
        for (const ev of pk.evolutionsFrom) {
          oldEvoPairs.add(evoPairKey(ev.from, ev.to));
          if (this.generationOfPokemon() >= 7 && ev.from.number === Species.cosmoem) {
            const opp = ev.to.number === Species.solgaleo ? Species.lunala : Species.solgaleo;
            const toPkmn = this.findPokemonInPoolWithSpeciesID(pokemonPool, opp);
            if (toPkmn != null) { oldEvoPairs.add(evoPairKey(ev.from, toPkmn)); }
          }
        }
      }
    }

    const replacements: Pokemon[] = [];
    let loops = 0;
    while (loops < 1) {
      let hadError = false;
      for (const pk of pokemonPool) { pk.evolutionsFrom.length = 0; pk.evolutionsTo.length = 0; }
      newEvoPairs.clear();
      this.shuffleArray(pokemonPool);

      for (const fromPK of pokemonPool) {
        const oldEvos = originalEvos.get(fromPK) || [];
        for (const ev of oldEvos) {
          replacements.length = 0;
          const chosenList: Pokemon[] = allowAltFormes
            ? this.mainPokemonListInclFormes.filter((pk) => !pk.actuallyCosmetic)
            : this.mainPokemonList;

          for (const pk of chosenList) {
            if (pk === fromPK) continue;
            if (pk.growthCurve !== fromPK.growthCurve) continue;
            if (banned.includes(pk)) continue;
            const epKey = evoPairKey(fromPK, pk);
            if (newEvoPairs.has(epKey)) continue;
            if (forceChange && oldEvoPairs.has(epKey)) continue;
            if (this.evoCycleCheck(fromPK, pk)) continue;

            const tempEvo = new Evolution(fromPK, pk, false, EvolutionType.NONE, 0);
            fromPK.evolutionsFrom.push(tempEvo);
            pk.evolutionsTo.push(tempEvo);
            let exceededLimit = false;
            const related = this.relatedPokemon(fromPK);
            for (const pk2 of related) {
              const npe = this.numPreEvolutions(pk2, stageLimit);
              if (npe >= stageLimit) { exceededLimit = true; break; }
              if (npe === stageLimit - 1 && pk2.evolutionsFrom.length === 0 && (originalEvos.get(pk2) || []).length > 0) { exceededLimit = true; break; }
            }
            const ti = fromPK.evolutionsFrom.indexOf(tempEvo);
            if (ti >= 0) fromPK.evolutionsFrom.splice(ti, 1);
            const ti2 = pk.evolutionsTo.indexOf(tempEvo);
            if (ti2 >= 0) pk.evolutionsTo.splice(ti2, 1);
            if (exceededLimit) continue;
            replacements.push(pk);
          }

          if (replacements.length === 0) { hadError = true; break; }

          if (replacements.length > 1 && sameType) {
            const includeType: Pokemon[] = [];
            for (const pk of replacements) {
              if (fromPK.number === Species.eevee) {
                if (pk.primaryType === ev.to.primaryType || (pk.secondaryType != null && pk.secondaryType === ev.to.primaryType)) { includeType.push(pk); }
              } else if (pk.primaryType === fromPK.primaryType
                || (fromPK.secondaryType != null && pk.primaryType === fromPK.secondaryType)
                || (pk.secondaryType != null && pk.secondaryType === fromPK.primaryType)
                || (fromPK.secondaryType != null && pk.secondaryType != null && pk.secondaryType === fromPK.secondaryType)) {
                includeType.push(pk);
              }
            }
            if (includeType.length !== 0) {
              const s = new Set(includeType);
              for (let i = replacements.length - 1; i >= 0; i--) { if (!s.has(replacements[i])) replacements.splice(i, 1); }
            }
          }

          if (!replacements.every((p) => this.alreadyPicked.includes(p)) && !similarStrength) {
            for (let i = replacements.length - 1; i >= 0; i--) {
              if (this.alreadyPicked.includes(replacements[i])) replacements.splice(i, 1);
            }
          }

          let picked: Pokemon;
          if (replacements.length === 1) { picked = replacements[0]; }
          else if (similarStrength) { picked = this.pickEvoPowerLvlReplacement(replacements, ev.to); }
          else { picked = replacements[this.random.nextInt(replacements.length)]; }
          this.alreadyPicked.push(picked);

          const newEvo = new Evolution(fromPK, picked, ev.carryStats, ev.type, ev.extraInfo);
          let checkCosmetics = true;
          if (picked.formeNumber > 0) { newEvo.forme = picked.formeNumber; newEvo.formeSuffix = picked.formeSuffix; checkCosmetics = false; }
          if (checkCosmetics && newEvo.to.cosmeticForms > 0) {
            newEvo.forme = newEvo.to.getCosmeticFormNumber(this.random.nextInt(newEvo.to.cosmeticForms));
          } else if (!checkCosmetics && picked.cosmeticForms > 0) {
            newEvo.forme += picked.getCosmeticFormNumber(this.random.nextInt(picked.cosmeticForms));
          }
          if (newEvo.type === EvolutionType.LEVEL_FEMALE_ESPURR) { newEvo.type = EvolutionType.LEVEL_FEMALE_ONLY; }
          fromPK.evolutionsFrom.push(newEvo);
          picked.evolutionsTo.push(newEvo);
          newEvoPairs.add(evoPairKey(fromPK, picked));
        }
        if (hadError) break;
      }

      if (!hadError) {
        for (const pk of actuallyCosmeticPokemonPool) { pk.copyBaseFormeEvolutions(pk.baseForme!); }
        return;
      }
      loops++;
    }
    throw new RandomizationException("Not able to randomize evolutions in a sane amount of retries.");
  }

  randomizeEvolutionsEveryLevel(settings: Settings): void {
    const sameType = settings.evosSameTyping;
    const forceChange = settings.evosForceChange;
    const allowAltFormes = settings.evosAllowAltFormes;
    const abilitiesAreRandomized = settings.abilitiesMod === AbilitiesMod.RANDOMIZE;

    this.checkPokemonRestrictions();
    let pokemonPool: Pokemon[];
    if (this.altFormesCanHaveDifferentEvolutions()) {
      pokemonPool = [...this.mainPokemonListInclFormes];
    } else {
      pokemonPool = [...this.mainPokemonList];
    }
    const actuallyCosmeticPokemonPool: Pokemon[] = [];
    const banned: Pokemon[] = [...this.getBannedFormesForPlayerPokemon()];
    if (!abilitiesAreRandomized) { banned.push(...this.getAbilityDependentFormes()); }

    for (let i = 0; i < pokemonPool.length; i++) {
      const pk = pokemonPool[i];
      if (pk.actuallyCosmetic) { pokemonPool.splice(i, 1); i--; actuallyCosmeticPokemonPool.push(pk); }
    }

    const evoPairKey = (from: Pokemon, to: Pokemon): string => `${from.number}:${to.number}`;
    const oldEvoPairs = new Set<string>();
    if (forceChange) {
      for (const pk of pokemonPool) {
        for (const ev of pk.evolutionsFrom) {
          oldEvoPairs.add(evoPairKey(ev.from, ev.to));
          if (this.generationOfPokemon() >= 7 && ev.from.number === Species.cosmoem) {
            const opp = ev.to.number === Species.solgaleo ? Species.lunala : Species.solgaleo;
            const toPkmn = this.findPokemonInPoolWithSpeciesID(pokemonPool, opp);
            if (toPkmn != null) { oldEvoPairs.add(evoPairKey(ev.from, toPkmn)); }
          }
        }
      }
    }

    const replacements: Pokemon[] = [];
    let loops = 0;
    while (loops < 1) {
      let hadError = false;
      for (const pk of pokemonPool) { pk.evolutionsFrom.length = 0; pk.evolutionsTo.length = 0; }
      this.shuffleArray(pokemonPool);

      for (const fromPK of pokemonPool) {
        replacements.length = 0;
        const chosenList: Pokemon[] = allowAltFormes
          ? this.mainPokemonListInclFormes.filter((pk) => !pk.actuallyCosmetic)
          : this.mainPokemonList;

        for (const pk of chosenList) {
          if (pk === fromPK) continue;
          if (pk.growthCurve !== fromPK.growthCurve) continue;
          if (banned.includes(pk)) continue;
          const epKey = evoPairKey(fromPK, pk);
          if (forceChange && oldEvoPairs.has(epKey)) continue;
          replacements.push(pk);
        }

        if (replacements.length === 0) { hadError = true; break; }

        if (replacements.length > 1 && sameType) {
          const includeType: Pokemon[] = [];
          for (const pk of replacements) {
            if (pk.primaryType === fromPK.primaryType
              || (fromPK.secondaryType != null && pk.primaryType === fromPK.secondaryType)
              || (pk.secondaryType != null && pk.secondaryType === fromPK.primaryType)
              || (pk.secondaryType != null && pk.secondaryType === fromPK.secondaryType)) {
              includeType.push(pk);
            }
          }
          if (includeType.length !== 0) {
            const s = new Set(includeType);
            for (let i = replacements.length - 1; i >= 0; i--) { if (!s.has(replacements[i])) replacements.splice(i, 1); }
          }
        }

        const picked = replacements.length === 1 ? replacements[0] : replacements[this.random.nextInt(replacements.length)];

        const newEvo = new Evolution(fromPK, picked, false, EvolutionType.LEVEL, 1);
        newEvo.level = 1;
        let checkCosmetics = true;
        if (picked.formeNumber > 0) { newEvo.forme = picked.formeNumber; newEvo.formeSuffix = picked.formeSuffix; checkCosmetics = false; }
        if (checkCosmetics && newEvo.to.cosmeticForms > 0) {
          newEvo.forme = newEvo.to.getCosmeticFormNumber(this.random.nextInt(newEvo.to.cosmeticForms));
        } else if (!checkCosmetics && picked.cosmeticForms > 0) {
          newEvo.forme += picked.getCosmeticFormNumber(this.random.nextInt(picked.cosmeticForms));
        }
        fromPK.evolutionsFrom.push(newEvo);
        picked.evolutionsTo.push(newEvo);
      }

      if (!hadError) {
        for (const pk of actuallyCosmeticPokemonPool) { pk.copyBaseFormeEvolutions(pk.baseForme!); }
        return;
      }
      loops++;
    }
    throw new RandomizationException("Not able to randomize evolutions in a sane amount of retries.");
  }

  // -- ORAS-specific stubs (only relevant for Gen6+ handlers) --
  protected collapseAreasORAS(encounters: EncounterSet[]): EncounterSet[] {
    return encounters;
  }

  protected enhanceRandomEncountersORAS(_collapsedEncounters: EncounterSet[], _settings: Settings): void {
    // no-op; overridden in Gen6 handler
  }

  // -- Helper: find a Pokemon in a pool by species number --
  private findPokemonInPoolWithSpeciesID(pokemonPool: Pokemon[], speciesID: number): Pokemon | null {
    for (const p of pokemonPool) {
      if (p.number === speciesID) return p;
    }
    return null;
  }

  // -- Helper: check if there's an unused move in the list --
  private checkForUnusedMove(potentialList: Move[], alreadyUsed: number[]): boolean {
    for (const mv of potentialList) {
      if (!alreadyUsed.includes(mv.number)) return true;
    }
    return false;
  }

  // -- Helper: build sets of valid moves for randomization --
  private createSetsOfMoves(
    noBroken: boolean,
    validMoves: Move[],
    validDamagingMoves: Move[],
    validTypeMoves: Map<Type, Move[]>,
    validTypeDamagingMoves: Map<Type, Move[]>
  ): void {
    const allMoves = this.getMoves();
    const hms = this.getHMMoves();
    const allBanned = new Set<number>(noBroken ? this.getGameBreakingMoves() : []);
    for (const h of hms) allBanned.add(h);
    for (const b of this.getMovesBannedFromLevelup()) allBanned.add(b);
    for (const z of GlobalConstants.zMoves) allBanned.add(z);
    for (const il of this.getIllegalMoves()) allBanned.add(il);

    for (const mv of allMoves) {
      if (mv != null && !GlobalConstants.bannedRandomMoves[mv.number] && !allBanned.has(mv.number)) {
        validMoves.push(mv);
        if (mv.type != null) {
          if (!validTypeMoves.has(mv.type)) {
            validTypeMoves.set(mv.type, []);
          }
          validTypeMoves.get(mv.type)!.push(mv);
        }
        if (!GlobalConstants.bannedForDamagingMove[mv.number]) {
          if (mv.isGoodDamaging(this.perfectAccuracy)) {
            validDamagingMoves.push(mv);
            if (mv.type != null) {
              if (!validTypeDamagingMoves.has(mv.type)) {
                validTypeDamagingMoves.set(mv.type, []);
              }
              validTypeDamagingMoves.get(mv.type)!.push(mv);
            }
          }
        }
      }
    }

    // Balance average power per type
    const avgTypePowers = new Map<Type, number>();
    let totalAvgPower = 0;

    for (const [type, typeMoves] of validTypeMoves) {
      let attackingSum = 0;
      for (const typeMove of typeMoves) {
        if (typeMove.power > 0) {
          attackingSum += typeMove.power * typeMove.hitCount;
        }
      }
      const avgTypePower = attackingSum / typeMoves.length;
      avgTypePowers.set(type, avgTypePower);
      totalAvgPower += avgTypePower;
    }

    totalAvgPower /= validTypeMoves.size;
    const minAvg = totalAvgPower * 0.75;
    const maxAvg = totalAvgPower * 1.25;

    for (const [type, avgPowerForType] of avgTypePowers) {
      let avg = avgPowerForType;
      const typeMoves = validTypeMoves.get(type)!;
      let alreadyPicked: Move[] = [];
      let iterLoops = 0;
      while (avg < minAvg && iterLoops < 10000) {
        const finalAvg = avg;
        let strongerMoves = typeMoves.filter(mv => mv.power * mv.hitCount > finalAvg);
        if (strongerMoves.length === 0) break;
        if (alreadyPicked.length >= strongerMoves.length) {
          alreadyPicked = [];
        } else {
          strongerMoves = strongerMoves.filter(m => !alreadyPicked.includes(m));
          if (strongerMoves.length === 0) break;
        }
        const extraMove = strongerMoves[this.random.nextInt(strongerMoves.length)];
        avg = (avg * typeMoves.length + extraMove.power * extraMove.hitCount) / (typeMoves.length + 1);
        typeMoves.push(extraMove);
        alreadyPicked.push(extraMove);
        iterLoops++;
      }
      iterLoops = 0;
      while (avg > maxAvg && iterLoops < 10000) {
        const finalAvg = avg;
        let weakerMoves = typeMoves.filter(mv => mv.power * mv.hitCount < finalAvg);
        if (weakerMoves.length === 0) break;
        if (alreadyPicked.length >= weakerMoves.length) {
          alreadyPicked = [];
        } else {
          weakerMoves = weakerMoves.filter(m => !alreadyPicked.includes(m));
          if (weakerMoves.length === 0) break;
        }
        const extraMove = weakerMoves[this.random.nextInt(weakerMoves.length)];
        avg = (avg * typeMoves.length + extraMove.power * extraMove.hitCount) / (typeMoves.length + 1);
        typeMoves.push(extraMove);
        alreadyPicked.push(extraMove);
        iterLoops++;
      }
    }
  }

  // -- Static encounter helpers (Gen6/7 specific, stubs for Gen1-5) --
  private cloneStaticEncounter(old: StaticEncounter): StaticEncounter {
    const ns = new StaticEncounter();
    ns.pkmn = old.pkmn;
    ns.forme = old.forme;
    ns.level = old.level;
    ns.maxLevel = old.maxLevel;
    ns.heldItem = old.heldItem;
    ns.isEgg = old.isEgg;
    ns.resetMoves = old.resetMoves;
    ns.restrictedPool = old.restrictedPool;
    ns.restrictedList = [...old.restrictedList];
    ns.linkedEncounters = old.linkedEncounters.map(le => {
      const nle = new StaticEncounter();
      nle.pkmn = le.pkmn; nle.forme = le.forme; nle.level = le.level;
      nle.maxLevel = le.maxLevel; nle.heldItem = le.heldItem; nle.isEgg = le.isEgg;
      return nle;
    });
    return ns;
  }

  private getMegaEvoPokemon(pool: Pokemon[], remaining: Pokemon[], _se: StaticEncounter): Pokemon {
    // Simplified: pick from remaining or pool
    if (remaining.length > 0) return remaining.splice(this.random.nextInt(remaining.length), 1)[0];
    return pool[this.random.nextInt(pool.length)];
  }

  private getRestrictedStaticPokemon(pool: Pokemon[], remaining: Pokemon[], old: StaticEncounter): Pokemon {
    let restricted = remaining.filter(pk => old.restrictedList.includes(pk));
    if (restricted.length === 0) restricted = pool.filter(pk => old.restrictedList.includes(pk));
    if (restricted.length === 0) restricted = remaining.length > 0 ? remaining : pool;
    const picked = restricted[this.random.nextInt(restricted.length)];
    const idx = remaining.indexOf(picked);
    if (idx >= 0) remaining.splice(idx, 1);
    return picked;
  }

  private setPokemonAndFormeForStaticEncounter(se: StaticEncounter, pk: Pokemon): void {
    se.pkmn = pk;
    se.forme = 0;
    for (const le of se.linkedEncounters) {
      if (le.pkmn === se.pkmn) {
        le.pkmn = pk;
        le.forme = 0;
      }
    }
  }

  private pickStaticPowerLvlReplacement(pokemonPool: Pokemon[], current: Pokemon, pokemonLeft: boolean, limitBST: boolean): Pokemon {
    const currentBST = current.bstForPowerLevels();
    const minTarget = limitBST ? currentBST - currentBST / 5 : currentBST * 0.8;
    const maxTarget = limitBST ? currentBST + currentBST / 5 : currentBST * 1.2;
    const canPick = pokemonPool.filter(pk => {
      const bst = pk.bstForPowerLevels();
      return bst >= minTarget && bst <= maxTarget;
    });
    if (canPick.length > 0) return canPick[this.random.nextInt(canPick.length)];
    return pokemonPool[this.random.nextInt(pokemonPool.length)];
  }

  // =====================================================================
  // Abstract methods - must be implemented by concrete ROM handlers
  // =====================================================================

  abstract loadRom(filename: string): boolean;
  abstract saveRomFile(filename: string, seed: number): boolean;
  abstract saveRomDirectory(filename: string): boolean;
  abstract loadedFilename(): string;

  abstract hasGameUpdateLoaded(): boolean;
  abstract loadGameUpdate(filename: string): boolean;
  abstract removeGameUpdate(): void;
  abstract getGameUpdateVersion(): string | null;

  abstract printRomDiagnostics(logStream: LogStream): void;
  abstract isRomValid(): boolean;

  abstract getPokemon(): (Pokemon | null)[];
  abstract getPokemonInclFormes(): (Pokemon | null)[];
  abstract getAltFormes(): Pokemon[];
  abstract getMegaEvolutions(): MegaEvolution[];
  abstract getAltFormeOfPokemon(pk: Pokemon, forme: number): Pokemon;
  abstract getIrregularFormes(): Pokemon[];

  abstract removeEvosForPokemonPool(): void;

  abstract getStarters(): Pokemon[];
  abstract setStarters(newStarters: Pokemon[]): boolean;
  abstract hasStarterAltFormes(): boolean;
  abstract starterCount(): number;
  customStarters(settings: Settings): void {
    const abilitiesUnchanged = settings.abilitiesMod === AbilitiesMod.UNCHANGED;
    const customStarterIds = settings.customStarters;
    const allowAltFormes = settings.allowStarterAltFormes;
    const banIrregularAltFormes = settings.banIrregularAltFormes;

    const romPokemon = this.getPokemonInclFormes().filter(
      (pk) => pk == null || !pk.actuallyCosmetic
    );

    const banned: Pokemon[] = [...this.getBannedFormesForPlayerPokemon()];
    if (abilitiesUnchanged) {
      banned.push(...this.getAbilityDependentFormes());
    }
    if (banIrregularAltFormes) {
      banned.push(...this.getIrregularFormes());
    }
    this.pickedStarters = [];

    for (let i = 0; i < customStarterIds.length; i++) {
      if (customStarterIds[i] - 1 !== 0) {
        banned.push(romPokemon[customStarterIds[i] - 1]!);
      }
    }

    if (customStarterIds[0] - 1 === 0) {
      let pkmn = allowAltFormes ? this.randomPokemonInclFormes() : this.randomPokemon();
      while (this.pickedStarters.includes(pkmn) || banned.includes(pkmn) || pkmn.actuallyCosmetic) {
        pkmn = allowAltFormes ? this.randomPokemonInclFormes() : this.randomPokemon();
      }
      this.pickedStarters.push(pkmn);
    } else {
      this.pickedStarters.push(romPokemon[customStarterIds[0] - 1]!);
    }

    if (customStarterIds[1] - 1 === 0) {
      let pkmn = allowAltFormes ? this.randomPokemonInclFormes() : this.randomPokemon();
      while (this.pickedStarters.includes(pkmn) || banned.includes(pkmn) || pkmn.actuallyCosmetic) {
        pkmn = allowAltFormes ? this.randomPokemonInclFormes() : this.randomPokemon();
      }
      this.pickedStarters.push(pkmn);
    } else {
      this.pickedStarters.push(romPokemon[customStarterIds[1] - 1]!);
    }

    if (this.isYellow()) {
      this.setStarters(this.pickedStarters);
    } else {
      if (customStarterIds[2] - 1 === 0) {
        let pkmn = allowAltFormes ? this.randomPokemonInclFormes() : this.randomPokemon();
        while (this.pickedStarters.includes(pkmn) || banned.includes(pkmn) || pkmn.actuallyCosmetic) {
          pkmn = allowAltFormes ? this.randomPokemonInclFormes() : this.randomPokemon();
        }
        this.pickedStarters.push(pkmn);
      } else {
        this.pickedStarters.push(romPokemon[customStarterIds[2] - 1]!);
      }
      if (this.starterCount() > 3) {
        for (let i = 3; i < this.starterCount(); i++) {
          let pkmn = this.random2EvosPokemon(allowAltFormes);
          while (this.pickedStarters.includes(pkmn)) {
            pkmn = this.random2EvosPokemon(allowAltFormes);
          }
          this.pickedStarters.push(pkmn);
        }
      }
      this.setStarters(this.pickedStarters);
    }
  }

  randomizeStarters(settings: Settings): void {
    const abilitiesUnchanged = settings.abilitiesMod === AbilitiesMod.UNCHANGED;
    const allowAltFormes = settings.allowStarterAltFormes;
    const banIrregularAltFormes = settings.banIrregularAltFormes;

    const count = this.starterCount();
    this.pickedStarters = [];
    const banned: Pokemon[] = [...this.getBannedFormesForPlayerPokemon()];
    if (abilitiesUnchanged) {
      banned.push(...this.getAbilityDependentFormes());
    }
    if (banIrregularAltFormes) {
      banned.push(...this.getIrregularFormes());
    }
    for (let i = 0; i < count; i++) {
      let pkmn = allowAltFormes ? this.randomPokemonInclFormes() : this.randomPokemon();
      while (this.pickedStarters.includes(pkmn) || banned.includes(pkmn) || pkmn.actuallyCosmetic) {
        pkmn = allowAltFormes ? this.randomPokemonInclFormes() : this.randomPokemon();
      }
      this.pickedStarters.push(pkmn);
    }
    this.setStarters(this.pickedStarters);
  }

  randomizeBasicTwoEvosStarters(settings: Settings): void {
    const abilitiesUnchanged = settings.abilitiesMod === AbilitiesMod.UNCHANGED;
    const allowAltFormes = settings.allowStarterAltFormes;
    const banIrregularAltFormes = settings.banIrregularAltFormes;

    const count = this.starterCount();
    this.pickedStarters = [];
    const banned: Pokemon[] = [...this.getBannedFormesForPlayerPokemon()];
    if (abilitiesUnchanged) {
      banned.push(...this.getAbilityDependentFormes());
    }
    if (banIrregularAltFormes) {
      banned.push(...this.getIrregularFormes());
    }
    for (let i = 0; i < count; i++) {
      let pkmn = this.random2EvosPokemon(allowAltFormes);
      while (this.pickedStarters.includes(pkmn) || banned.includes(pkmn)) {
        pkmn = this.random2EvosPokemon(allowAltFormes);
      }
      this.pickedStarters.push(pkmn);
    }
    this.setStarters(this.pickedStarters);
  }
  abstract supportsStarterHeldItems(): boolean;
  abstract getStarterHeldItems(): number[];
  abstract setStarterHeldItems(items: number[]): void;
  abstract randomizeStarterHeldItems(settings: Settings): void;

  abstract getUpdatedPokemonStats(generation: number): Map<number, StatChange>;
  standardizeEXPCurves(settings: Settings): void {
    const mod = settings.expCurveMod;
    const expCurve = settings.selectedEXPCurve;

    const pokes = this.getPokemonInclFormes();
    switch (mod) {
      case ExpCurveMod.LEGENDARIES:
        for (const pkmn of pokes) {
          if (pkmn == null) continue;
          pkmn.growthCurve = pkmn.isLegendary() ? ExpCurve.SLOW : expCurve;
        }
        break;
      case ExpCurveMod.STRONG_LEGENDARIES:
        for (const pkmn of pokes) {
          if (pkmn == null) continue;
          pkmn.growthCurve = pkmn.isStrongLegendary() ? ExpCurve.SLOW : expCurve;
        }
        break;
      case ExpCurveMod.ALL:
        for (const pkmn of pokes) {
          if (pkmn == null) continue;
          pkmn.growthCurve = expCurve;
        }
        break;
    }
  }

  abstract abilitiesPerPokemon(): number;
  abstract highestAbilityIndex(): number;
  abstract getAbilityVariations(): Map<number, number[]>;
  abstract hasMegaEvolutions(): boolean;

  abstract getEncounters(useTimeOfDay: boolean): EncounterSet[];
  abstract setEncounters(
    useTimeOfDay: boolean,
    encounters: EncounterSet[]
  ): void;
  randomEncounters(settings: Settings): void {
    const useTimeOfDay = settings.useTimeBasedEncounters;
    const catchEmAll = settings.wildPokemonRestrictionMod === WildPokemonRestrictionMod.CATCH_EM_ALL;
    const typeThemed = settings.wildPokemonRestrictionMod === WildPokemonRestrictionMod.TYPE_THEME_AREAS;
    const usePowerLevels = settings.wildPokemonRestrictionMod === WildPokemonRestrictionMod.SIMILAR_STRENGTH;
    const noLegendaries = settings.blockWildLegendaries;
    const balanceShakingGrass = settings.balanceShakingGrass;
    const levelModifier = settings.wildLevelsModified ? settings.wildLevelModifier : 0;
    const allowAltFormes = settings.allowWildAltFormes;
    const banIrregularAltFormes = settings.banIrregularAltFormes;
    const abilitiesAreRandomized = settings.abilitiesMod === AbilitiesMod.RANDOMIZE;

    const currentEncounters = this.getEncounters(useTimeOfDay);

    if (this.isORAS) {
      const collapsedEncounters = this.collapseAreasORAS(currentEncounters);
      this.area1to1EncountersImpl(collapsedEncounters, settings);
      this.enhanceRandomEncountersORAS(collapsedEncounters, settings);
      this.setEncounters(useTimeOfDay, currentEncounters);
      return;
    }

    this.checkPokemonRestrictions();

    // Randomize the order encounter sets are randomized in.
    const scrambledEncounters = [...currentEncounters];
    this.shuffleArray(scrambledEncounters);

    const banned = this.bannedForWildEncounters();
    banned.push(...this.getBannedFormesForPlayerPokemon());
    if (!abilitiesAreRandomized) {
      banned.push(...this.getAbilityDependentFormes());
    }
    if (banIrregularAltFormes) {
      banned.push(...this.getIrregularFormes());
    }

    if (catchEmAll) {
      let allPokes: Pokemon[];
      if (allowAltFormes) {
        allPokes = noLegendaries ? [...this.noLegendaryListInclFormes] : [...this.mainPokemonListInclFormes];
        allPokes = allPokes.filter(p => !p.actuallyCosmetic);
      } else {
        allPokes = noLegendaries ? [...this.noLegendaryList] : [...this.mainPokemonList];
      }
      allPokes = allPokes.filter(p => !banned.includes(p));

      for (const area of scrambledEncounters) {
        let pickablePokemon = allPokes;
        if (area.bannedPokemon.size > 0) {
          pickablePokemon = allPokes.filter(p => !area.bannedPokemon.has(p));
        }
        for (const enc of area.encounters) {
          if (enc.pokemon != null && banned.includes(enc.pokemon)) {
            continue;
          }

          if (pickablePokemon.length === 0) {
            let tempPickable: Pokemon[];
            if (allowAltFormes) {
              tempPickable = noLegendaries ? [...this.noLegendaryListInclFormes] : [...this.mainPokemonListInclFormes];
              tempPickable = tempPickable.filter(p => !p.actuallyCosmetic);
            } else {
              tempPickable = noLegendaries ? [...this.noLegendaryList] : [...this.mainPokemonList];
            }
            tempPickable = tempPickable.filter(p => !banned.includes(p) && !area.bannedPokemon.has(p));
            if (tempPickable.length === 0) {
              throw new RandomizationException("ERROR: Couldn't replace a wild Pokemon!");
            }
            const picked = this.random.nextInt(tempPickable.length);
            enc.pokemon = tempPickable[picked];
            this.setFormeForEncounter(enc, enc.pokemon!);
          } else {
            const picked = this.random.nextInt(pickablePokemon.length);
            enc.pokemon = pickablePokemon[picked];
            pickablePokemon.splice(picked, 1);
            if (allPokes !== pickablePokemon) {
              const idx = allPokes.indexOf(enc.pokemon);
              if (idx >= 0) allPokes.splice(idx, 1);
            }
            this.setFormeForEncounter(enc, enc.pokemon!);
            if (allPokes.length === 0) {
              if (allowAltFormes) {
                allPokes.push(...(noLegendaries ? this.noLegendaryListInclFormes : this.mainPokemonListInclFormes));
                const len = allPokes.length;
                for (let i = len - 1; i >= 0; i--) {
                  if (allPokes[i].actuallyCosmetic) allPokes.splice(i, 1);
                }
              } else {
                allPokes.push(...(noLegendaries ? this.noLegendaryList : this.mainPokemonList));
              }
              for (let i = allPokes.length - 1; i >= 0; i--) {
                if (banned.includes(allPokes[i])) allPokes.splice(i, 1);
              }
              if (pickablePokemon !== allPokes) {
                pickablePokemon.push(...allPokes);
                const pLen = pickablePokemon.length;
                for (let i = pLen - 1; i >= 0; i--) {
                  if (area.bannedPokemon.has(pickablePokemon[i])) pickablePokemon.splice(i, 1);
                }
              }
            }
          }
        }
      }
    } else if (typeThemed) {
      const cachedPokeLists = new Map<Type, Pokemon[]>();
      for (const area of scrambledEncounters) {
        let possiblePokemon: Pokemon[] | null = null;
        let iterLoops = 0;
        while (possiblePokemon === null && iterLoops < 10000) {
          const areaTheme = this.randomType();
          if (!cachedPokeLists.has(areaTheme)) {
            const pType = allowAltFormes
              ? this.pokemonOfTypeInclFormes(areaTheme, noLegendaries)
              : this.pokemonOfType(areaTheme, noLegendaries);
            cachedPokeLists.set(areaTheme, pType.filter(p => !banned.includes(p)));
          }
          possiblePokemon = cachedPokeLists.get(areaTheme)!;
          if (area.bannedPokemon.size > 0) {
            possiblePokemon = possiblePokemon.filter(p => !area.bannedPokemon.has(p));
          }
          if (possiblePokemon.length === 0) {
            possiblePokemon = null;
          }
          iterLoops++;
        }
        if (possiblePokemon === null) {
          throw new RandomizationException("Could not randomize an area in a reasonable amount of attempts.");
        }
        for (const enc of area.encounters) {
          enc.pokemon = possiblePokemon[this.random.nextInt(possiblePokemon.length)];
          while (enc.pokemon!.actuallyCosmetic) {
            enc.pokemon = possiblePokemon[this.random.nextInt(possiblePokemon.length)];
          }
          this.setFormeForEncounter(enc, enc.pokemon!);
        }
      }
    } else if (usePowerLevels) {
      let allowedPokes: Pokemon[];
      if (allowAltFormes) {
        allowedPokes = noLegendaries ? [...this.noLegendaryListInclFormes] : [...this.mainPokemonListInclFormes];
      } else {
        allowedPokes = noLegendaries ? [...this.noLegendaryList] : [...this.mainPokemonList];
      }
      allowedPokes = allowedPokes.filter(p => !banned.includes(p));
      for (const area of scrambledEncounters) {
        let localAllowed = allowedPokes;
        if (area.bannedPokemon.size > 0) {
          localAllowed = allowedPokes.filter(p => !area.bannedPokemon.has(p));
        }
        for (const enc of area.encounters) {
          if (balanceShakingGrass && area.displayName != null && area.displayName.includes("Shaking")) {
            enc.pokemon = this.pickWildPowerLvlReplacement(localAllowed, enc.pokemon!, false, null, Math.floor((enc.level + enc.maxLevel) / 2));
            while (enc.pokemon!.actuallyCosmetic) {
              enc.pokemon = this.pickWildPowerLvlReplacement(localAllowed, enc.pokemon!, false, null, Math.floor((enc.level + enc.maxLevel) / 2));
            }
          } else {
            enc.pokemon = this.pickWildPowerLvlReplacement(localAllowed, enc.pokemon!, false, null, 100);
            while (enc.pokemon!.actuallyCosmetic) {
              enc.pokemon = this.pickWildPowerLvlReplacement(localAllowed, enc.pokemon!, false, null, 100);
            }
          }
          this.setFormeForEncounter(enc, enc.pokemon!);
        }
      }
    } else {
      // Entirely random
      for (const area of scrambledEncounters) {
        for (const enc of area.encounters) {
          enc.pokemon = this.pickEntirelyRandomPokemon(allowAltFormes, noLegendaries, area, banned);
          this.setFormeForEncounter(enc, enc.pokemon!);
        }
      }
    }

    if (levelModifier !== 0) {
      for (const area of currentEncounters) {
        for (const enc of area.encounters) {
          enc.level = Math.min(100, Math.round(enc.level * (1 + levelModifier / 100.0)));
          enc.maxLevel = Math.min(100, Math.round(enc.maxLevel * (1 + levelModifier / 100.0)));
        }
      }
    }

    this.setEncounters(useTimeOfDay, currentEncounters);
  }

  area1to1Encounters(settings: Settings): void {
    const useTimeOfDay = settings.useTimeBasedEncounters;

    const currentEncounters = this.getEncounters(useTimeOfDay);
    if (this.isORAS) {
      const collapsedEncounters = this.collapseAreasORAS(currentEncounters);
      this.area1to1EncountersImpl(collapsedEncounters, settings);
      this.setEncounters(useTimeOfDay, currentEncounters);
      return;
    } else {
      this.area1to1EncountersImpl(currentEncounters, settings);
      this.setEncounters(useTimeOfDay, currentEncounters);
    }
  }

  private area1to1EncountersImpl(currentEncounters: EncounterSet[], settings: Settings): void {
    const catchEmAll = settings.wildPokemonRestrictionMod === WildPokemonRestrictionMod.CATCH_EM_ALL;
    const typeThemed = settings.wildPokemonRestrictionMod === WildPokemonRestrictionMod.TYPE_THEME_AREAS;
    const usePowerLevels = settings.wildPokemonRestrictionMod === WildPokemonRestrictionMod.SIMILAR_STRENGTH;
    const noLegendaries = settings.blockWildLegendaries;
    const levelModifier = settings.wildLevelsModified ? settings.wildLevelModifier : 0;
    const allowAltFormes = settings.allowWildAltFormes;
    const banIrregularAltFormes = settings.banIrregularAltFormes;
    const abilitiesAreRandomized = settings.abilitiesMod === AbilitiesMod.RANDOMIZE;

    this.checkPokemonRestrictions();
    const banned = this.bannedForWildEncounters();
    banned.push(...this.getBannedFormesForPlayerPokemon());
    if (!abilitiesAreRandomized) {
      banned.push(...this.getAbilityDependentFormes());
    }
    if (banIrregularAltFormes) {
      banned.push(...this.getIrregularFormes());
    }

    const scrambledEncounters = [...currentEncounters];
    this.shuffleArray(scrambledEncounters);

    if (catchEmAll) {
      let allPokes: Pokemon[];
      if (allowAltFormes) {
        allPokes = noLegendaries ? [...this.noLegendaryListInclFormes] : [...this.mainPokemonListInclFormes];
        allPokes = allPokes.filter(p => !p.actuallyCosmetic);
      } else {
        allPokes = noLegendaries ? [...this.noLegendaryList] : [...this.mainPokemonList];
      }
      allPokes = allPokes.filter(p => !banned.includes(p));

      for (const area of scrambledEncounters) {
        const inArea = this.pokemonInArea(area);
        const areaMap = new Map<Pokemon, Pokemon>();
        let pickablePokemon = allPokes;
        if (area.bannedPokemon.size > 0) {
          pickablePokemon = allPokes.filter(p => !area.bannedPokemon.has(p));
        }
        for (const areaPk of inArea) {
          if (pickablePokemon.length === 0) {
            let tempPickable: Pokemon[];
            if (allowAltFormes) {
              tempPickable = noLegendaries ? [...this.noLegendaryListInclFormes] : [...this.mainPokemonListInclFormes];
              tempPickable = tempPickable.filter(p => !p.actuallyCosmetic);
            } else {
              tempPickable = noLegendaries ? [...this.noLegendaryList] : [...this.mainPokemonList];
            }
            tempPickable = tempPickable.filter(p => !banned.includes(p) && !area.bannedPokemon.has(p));
            if (tempPickable.length === 0) {
              throw new RandomizationException("ERROR: Couldn't replace a wild Pokemon!");
            }
            const picked = this.random.nextInt(tempPickable.length);
            areaMap.set(areaPk, tempPickable[picked]);
          } else {
            const picked = this.random.nextInt(allPokes.length);
            const pickedMN = allPokes[picked];
            areaMap.set(areaPk, pickedMN);
            const pickIdx = pickablePokemon.indexOf(pickedMN);
            if (pickIdx >= 0) pickablePokemon.splice(pickIdx, 1);
            if (allPokes !== pickablePokemon) {
              allPokes.splice(picked, 1);
            }
            if (allPokes.length === 0) {
              if (allowAltFormes) {
                allPokes.push(...(noLegendaries ? this.noLegendaryListInclFormes : this.mainPokemonListInclFormes));
                for (let i = allPokes.length - 1; i >= 0; i--) {
                  if (allPokes[i].actuallyCosmetic) allPokes.splice(i, 1);
                }
              } else {
                allPokes.push(...(noLegendaries ? this.noLegendaryList : this.mainPokemonList));
              }
              for (let i = allPokes.length - 1; i >= 0; i--) {
                if (banned.includes(allPokes[i])) allPokes.splice(i, 1);
              }
              if (pickablePokemon !== allPokes) {
                pickablePokemon.push(...allPokes);
                for (let i = pickablePokemon.length - 1; i >= 0; i--) {
                  if (area.bannedPokemon.has(pickablePokemon[i])) pickablePokemon.splice(i, 1);
                }
              }
            }
          }
        }
        for (const enc of area.encounters) {
          if (enc.pokemon != null && banned.includes(enc.pokemon)) {
            continue;
          }
          enc.pokemon = areaMap.get(enc.pokemon!)!;
          this.setFormeForEncounter(enc, enc.pokemon!);
        }
      }
    } else if (typeThemed) {
      const cachedPokeLists = new Map<Type, Pokemon[]>();
      for (const area of scrambledEncounters) {
        const inArea = this.pokemonInArea(area);
        let possiblePokemon: Pokemon[] | null = null;
        let iterLoops = 0;
        while (possiblePokemon === null && iterLoops < 10000) {
          const areaTheme = this.randomType();
          if (!cachedPokeLists.has(areaTheme)) {
            const pType = allowAltFormes
              ? this.pokemonOfTypeInclFormes(areaTheme, noLegendaries)
              : this.pokemonOfType(areaTheme, noLegendaries);
            cachedPokeLists.set(areaTheme, pType.filter(p => !banned.includes(p)));
          }
          possiblePokemon = [...cachedPokeLists.get(areaTheme)!];
          if (area.bannedPokemon.size > 0) {
            possiblePokemon = possiblePokemon.filter(p => !area.bannedPokemon.has(p));
          }
          if (possiblePokemon.length < inArea.size) {
            possiblePokemon = null;
          }
          iterLoops++;
        }
        if (possiblePokemon === null) {
          throw new RandomizationException("Could not randomize an area in a reasonable amount of attempts.");
        }

        const areaMap = new Map<Pokemon, Pokemon>();
        for (const areaPk of inArea) {
          let picked = this.random.nextInt(possiblePokemon.length);
          let pickedMN = possiblePokemon[picked];
          while (pickedMN.actuallyCosmetic) {
            picked = this.random.nextInt(possiblePokemon.length);
            pickedMN = possiblePokemon[picked];
          }
          areaMap.set(areaPk, pickedMN);
          possiblePokemon.splice(picked, 1);
        }
        for (const enc of area.encounters) {
          enc.pokemon = areaMap.get(enc.pokemon!)!;
          this.setFormeForEncounter(enc, enc.pokemon!);
        }
      }
    } else if (usePowerLevels) {
      let allowedPokes: Pokemon[];
      if (allowAltFormes) {
        allowedPokes = noLegendaries ? [...this.noLegendaryListInclFormes] : [...this.mainPokemonListInclFormes];
      } else {
        allowedPokes = noLegendaries ? [...this.noLegendaryList] : [...this.mainPokemonList];
      }
      allowedPokes = allowedPokes.filter(p => !banned.includes(p));
      for (const area of scrambledEncounters) {
        const inArea = this.pokemonInArea(area);
        const areaMap = new Map<Pokemon, Pokemon>();
        const usedPks: Pokemon[] = [];
        let localAllowed = allowedPokes;
        if (area.bannedPokemon.size > 0) {
          localAllowed = allowedPokes.filter(p => !area.bannedPokemon.has(p));
        }
        for (const areaPk of inArea) {
          let picked = this.pickWildPowerLvlReplacement(localAllowed, areaPk, false, usedPks, 100);
          while (picked.actuallyCosmetic) {
            picked = this.pickWildPowerLvlReplacement(localAllowed, areaPk, false, usedPks, 100);
          }
          areaMap.set(areaPk, picked);
          usedPks.push(picked);
        }
        for (const enc of area.encounters) {
          enc.pokemon = areaMap.get(enc.pokemon!)!;
          this.setFormeForEncounter(enc, enc.pokemon!);
        }
      }
    } else {
      // Entirely random
      for (const area of scrambledEncounters) {
        const inArea = this.pokemonInArea(area);
        const areaMap = new Map<Pokemon, Pokemon>();
        const usedValues = new Set<Pokemon>();
        for (const areaPk of inArea) {
          let picked = this.pickEntirelyRandomPokemon(allowAltFormes, noLegendaries, area, banned);
          while (usedValues.has(picked)) {
            picked = this.pickEntirelyRandomPokemon(allowAltFormes, noLegendaries, area, banned);
          }
          areaMap.set(areaPk, picked);
          usedValues.add(picked);
        }
        for (const enc of area.encounters) {
          enc.pokemon = areaMap.get(enc.pokemon!)!;
          this.setFormeForEncounter(enc, enc.pokemon!);
        }
      }
    }

    if (levelModifier !== 0) {
      for (const area of currentEncounters) {
        for (const enc of area.encounters) {
          enc.level = Math.min(100, Math.round(enc.level * (1 + levelModifier / 100.0)));
          enc.maxLevel = Math.min(100, Math.round(enc.maxLevel * (1 + levelModifier / 100.0)));
        }
      }
    }
  }

  game1to1Encounters(settings: Settings): void {
    const useTimeOfDay = settings.useTimeBasedEncounters;
    const usePowerLevels = settings.wildPokemonRestrictionMod === WildPokemonRestrictionMod.SIMILAR_STRENGTH;
    const noLegendaries = settings.blockWildLegendaries;
    const levelModifier = settings.wildLevelsModified ? settings.wildLevelModifier : 0;
    const allowAltFormes = settings.allowWildAltFormes;
    const banIrregularAltFormes = settings.banIrregularAltFormes;
    const abilitiesAreRandomized = settings.abilitiesMod === AbilitiesMod.RANDOMIZE;

    this.checkPokemonRestrictions();
    const translateMap = new Map<Pokemon, Pokemon>();
    const remainingLeft = this.allPokemonInclFormesWithoutNull().filter(p => !p.actuallyCosmetic);
    let remainingRight: Pokemon[];
    if (allowAltFormes) {
      remainingRight = noLegendaries ? [...this.noLegendaryListInclFormes] : [...this.mainPokemonListInclFormes];
      remainingRight = remainingRight.filter(p => !p.actuallyCosmetic);
    } else {
      remainingRight = noLegendaries ? [...this.noLegendaryList] : [...this.mainPokemonList];
    }
    const banned = this.bannedForWildEncounters();
    banned.push(...this.getBannedFormesForPlayerPokemon());
    if (!abilitiesAreRandomized) {
      banned.push(...this.getAbilityDependentFormes());
    }
    if (banIrregularAltFormes) {
      banned.push(...this.getIrregularFormes());
    }
    // Banned pokemon should be mapped to themselves
    for (const bannedPK of banned) {
      translateMap.set(bannedPK, bannedPK);
      const leftIdx = remainingLeft.indexOf(bannedPK);
      if (leftIdx >= 0) remainingLeft.splice(leftIdx, 1);
      const rightIdx = remainingRight.indexOf(bannedPK);
      if (rightIdx >= 0) remainingRight.splice(rightIdx, 1);
    }
    while (remainingLeft.length > 0) {
      if (usePowerLevels) {
        const pickedLeft = this.random.nextInt(remainingLeft.length);
        const pickedLeftP = remainingLeft.splice(pickedLeft, 1)[0];
        let pickedRightP: Pokemon;
        if (remainingRight.length === 1) {
          pickedRightP = remainingRight[0];
        } else {
          pickedRightP = this.pickWildPowerLvlReplacement(remainingRight, pickedLeftP, true, null, 100);
        }
        const rIdx = remainingRight.indexOf(pickedRightP);
        if (rIdx >= 0) remainingRight.splice(rIdx, 1);
        translateMap.set(pickedLeftP, pickedRightP);
      } else {
        const pickedLeft = this.random.nextInt(remainingLeft.length);
        let pickedRight = this.random.nextInt(remainingRight.length);
        const pickedLeftP = remainingLeft.splice(pickedLeft, 1)[0];
        let pickedRightP = remainingRight[pickedRight];
        while (pickedLeftP.number === pickedRightP.number && remainingRight.length !== 1) {
          pickedRight = this.random.nextInt(remainingRight.length);
          pickedRightP = remainingRight[pickedRight];
        }
        remainingRight.splice(pickedRight, 1);
        translateMap.set(pickedLeftP, pickedRightP);
      }
      if (remainingRight.length === 0) {
        if (allowAltFormes) {
          remainingRight.push(...(noLegendaries ? this.noLegendaryListInclFormes : this.mainPokemonListInclFormes));
          for (let i = remainingRight.length - 1; i >= 0; i--) {
            if (remainingRight[i].actuallyCosmetic) remainingRight.splice(i, 1);
          }
        } else {
          remainingRight.push(...(noLegendaries ? this.noLegendaryList : this.mainPokemonList));
        }
        for (let i = remainingRight.length - 1; i >= 0; i--) {
          if (banned.includes(remainingRight[i])) remainingRight.splice(i, 1);
        }
      }
    }

    // Map remaining to themselves just in case
    const allPokes = this.allPokemonInclFormesWithoutNull();
    for (const poke of allPokes) {
      if (!translateMap.has(poke)) {
        translateMap.set(poke, poke);
      }
    }

    const currentEncounters = this.getEncounters(useTimeOfDay);

    for (const area of currentEncounters) {
      for (const enc of area.encounters) {
        enc.pokemon = translateMap.get(enc.pokemon!) ?? enc.pokemon;
        if (area.bannedPokemon.has(enc.pokemon!)) {
          let tempPickable: Pokemon[];
          if (allowAltFormes) {
            tempPickable = noLegendaries ? [...this.noLegendaryListInclFormes] : [...this.mainPokemonListInclFormes];
            tempPickable = tempPickable.filter(p => !p.actuallyCosmetic);
          } else {
            tempPickable = noLegendaries ? [...this.noLegendaryList] : [...this.mainPokemonList];
          }
          tempPickable = tempPickable.filter(p => !banned.includes(p) && !area.bannedPokemon.has(p));
          if (tempPickable.length === 0) {
            throw new RandomizationException("ERROR: Couldn't replace a wild Pokemon!");
          }
          if (usePowerLevels) {
            enc.pokemon = this.pickWildPowerLvlReplacement(tempPickable, enc.pokemon!, false, null, 100);
          } else {
            enc.pokemon = tempPickable[this.random.nextInt(tempPickable.length)];
          }
        }
        this.setFormeForEncounter(enc, enc.pokemon!);
      }
    }
    if (levelModifier !== 0) {
      for (const area of currentEncounters) {
        for (const enc of area.encounters) {
          enc.level = Math.min(100, Math.round(enc.level * (1 + levelModifier / 100.0)));
          enc.maxLevel = Math.min(100, Math.round(enc.maxLevel * (1 + levelModifier / 100.0)));
        }
      }
    }

    this.setEncounters(useTimeOfDay, currentEncounters);
  }
  abstract hasWildAltFormes(): boolean;
  randomizeWildHeldItems(settings: Settings): void {
    const banBadItems = settings.banBadRandomWildPokemonHeldItems;
    const pokemon = this.getPokemonInclFormes().filter((p): p is Pokemon => p != null);
    const possibleItems = banBadItems ? this.getNonBadItems() : this.getAllowedItems();
    for (const pk of pokemon) {
      if (pk.guaranteedHeldItem === -1 && pk.commonHeldItem === -1 && pk.rareHeldItem === -1
          && pk.darkGrassHeldItem === -1) { return; }
      let canHaveDarkGrass = pk.darkGrassHeldItem !== -1;
      if (pk.guaranteedHeldItem !== -1) {
        if (pk.guaranteedHeldItem > 0) {
          const decision = this.random.nextDouble();
          if (decision < 0.9) {
            canHaveDarkGrass = false;
            pk.guaranteedHeldItem = possibleItems.randomItem(() => this.random.nextDouble());
          } else {
            pk.guaranteedHeldItem = 0;
            pk.commonHeldItem = possibleItems.randomItem(() => this.random.nextDouble());
            pk.rareHeldItem = possibleItems.randomItem(() => this.random.nextDouble());
            while (pk.rareHeldItem === pk.commonHeldItem) {
              pk.rareHeldItem = possibleItems.randomItem(() => this.random.nextDouble());
            }
          }
        } else {
          const decision = this.random.nextDouble();
          if (decision < 0.5) { pk.commonHeldItem = 0; pk.rareHeldItem = 0; }
          else if (decision < 0.65) { pk.commonHeldItem = 0; pk.rareHeldItem = possibleItems.randomItem(() => this.random.nextDouble()); }
          else if (decision < 0.8) { pk.commonHeldItem = possibleItems.randomItem(() => this.random.nextDouble()); pk.rareHeldItem = 0; }
          else if (decision < 0.95) {
            pk.commonHeldItem = possibleItems.randomItem(() => this.random.nextDouble());
            pk.rareHeldItem = possibleItems.randomItem(() => this.random.nextDouble());
            while (pk.rareHeldItem === pk.commonHeldItem) {
              pk.rareHeldItem = possibleItems.randomItem(() => this.random.nextDouble());
            }
          } else {
            canHaveDarkGrass = false;
            pk.guaranteedHeldItem = possibleItems.randomItem(() => this.random.nextDouble());
            pk.commonHeldItem = 0; pk.rareHeldItem = 0;
          }
        }
      } else {
        const decision = this.random.nextDouble();
        if (decision < 0.5) { pk.commonHeldItem = 0; pk.rareHeldItem = 0; }
        else if (decision < 0.65) { pk.commonHeldItem = 0; pk.rareHeldItem = possibleItems.randomItem(() => this.random.nextDouble()); }
        else if (decision < 0.8) { pk.commonHeldItem = possibleItems.randomItem(() => this.random.nextDouble()); pk.rareHeldItem = 0; }
        else {
          pk.commonHeldItem = possibleItems.randomItem(() => this.random.nextDouble());
          pk.rareHeldItem = possibleItems.randomItem(() => this.random.nextDouble());
          while (pk.rareHeldItem === pk.commonHeldItem) {
            pk.rareHeldItem = possibleItems.randomItem(() => this.random.nextDouble());
          }
        }
      }
      if (canHaveDarkGrass) {
        if (this.random.nextDouble() < 0.5) {
          pk.darkGrassHeldItem = possibleItems.randomItem(() => this.random.nextDouble());
        } else {
          pk.darkGrassHeldItem = 0;
        }
      } else if (pk.darkGrassHeldItem !== -1) {
        pk.darkGrassHeldItem = 0;
      }
    }
  }
  changeCatchRates(settings: Settings): void {
    const minimumCatchRateLevel = settings.minimumCatchRateLevel;

    if (minimumCatchRateLevel === 5) {
      this.enableGuaranteedPokemonCatching();
    } else {
      let normalMin: number;
      let legendaryMin: number;
      switch (minimumCatchRateLevel) {
        case 2:
          normalMin = 128;
          legendaryMin = 64;
          break;
        case 3:
          normalMin = 200;
          legendaryMin = 100;
          break;
        case 4:
          normalMin = 255;
          legendaryMin = 255;
          break;
        case 1:
        default:
          normalMin = 75;
          legendaryMin = 37;
          break;
      }
      this.minimumCatchRate(normalMin, legendaryMin);
    }
  }

  minimumCatchRate(rateNonLegendary: number, rateLegendary: number): void {
    const pokes = this.getPokemonInclFormes();
    for (const pkmn of pokes) {
      if (pkmn == null) continue;
      const minCatchRate = pkmn.isLegendary() ? rateLegendary : rateNonLegendary;
      pkmn.catchRate = Math.max(pkmn.catchRate, minCatchRate);
    }
  }

  abstract enableGuaranteedPokemonCatching(): void;

  abstract getTrainers(): Trainer[];
  abstract getMainPlaythroughTrainers(): number[];
  abstract getEliteFourTrainers(isChallengeMode: boolean): number[];
  abstract setTrainers(
    trainerData: Trainer[],
    doubleBattleMode: boolean
  ): void;
  randomizeTrainerPokes(settings: Settings): void {
    const usePowerLevels = settings.trainersUsePokemonOfSimilarStrength;
    const noLegendaries = settings.trainersBlockLegendaries;
    const noEarlyWonderGuard = settings.trainersBlockEarlyWonderGuard;
    const levelModifier = settings.trainersLevelModified ? settings.trainersLevelModifier : 0;

    this.checkPokemonRestrictions();

    // Build Pokemon pool
    let pokemonPool: Pokemon[] = noLegendaries ? [...this.noLegendaryList] : [...this.mainPokemonList];
    pokemonPool = pokemonPool.filter(pk => !pk.actuallyCosmetic);
    const banned = this.getBannedFormesForTrainerPokemon();
    pokemonPool = pokemonPool.filter(pk => !banned.includes(pk));

    const currentTrainers = this.getTrainers();

    for (const t of currentTrainers) {
      // Apply level modifier
      if (levelModifier !== 0) {
        for (const tp of t.pokemon) {
          tp.level = Math.min(100, Math.round(tp.level * (1 + levelModifier / 100.0)));
        }
      }

      // Skip IRIVAL (Yellow first rival - determines non-player starter)
      if (t.tag != null && t.tag === "IRIVAL") continue;

      for (const tp of t.pokemon) {
        const wgAllowed = !noEarlyWonderGuard || tp.level >= 20;
        const oldPK = tp.pokemon;

        let newPK: Pokemon;
        if (usePowerLevels) {
          newPK = this.pickTrainerPowerLvlReplacement(pokemonPool, oldPK, wgAllowed);
        } else {
          newPK = this.pickRandomTrainerPokemon(pokemonPool, wgAllowed);
        }

        tp.pokemon = newPK;
        tp.resetMoves = true;
      }
    }

    this.setTrainers(currentTrainers, false);
  }

  private pickTrainerPowerLvlReplacement(pokemonPool: Pokemon[], current: Pokemon, wgAllowed: boolean): Pokemon {
    const currentBST = current.bstForPowerLevels();
    const minTarget = currentBST - currentBST / 6;
    const maxTarget = currentBST + currentBST / 6;
    let canPick = pokemonPool.filter(pk => {
      if (!wgAllowed && this.hasWonderGuard(pk)) return false;
      const bst = pk.bstForPowerLevels();
      return bst >= minTarget && bst <= maxTarget;
    });
    if (canPick.length === 0) {
      canPick = pokemonPool.filter(pk => wgAllowed || !this.hasWonderGuard(pk));
    }
    if (canPick.length === 0) canPick = pokemonPool;
    return canPick[this.random.nextInt(canPick.length)];
  }

  private pickRandomTrainerPokemon(pokemonPool: Pokemon[], wgAllowed: boolean): Pokemon {
    let canPick = wgAllowed ? pokemonPool : pokemonPool.filter(pk => !this.hasWonderGuard(pk));
    if (canPick.length === 0) canPick = pokemonPool;
    return canPick[this.random.nextInt(canPick.length)];
  }

  private hasWonderGuard(pk: Pokemon): boolean {
    return pk.ability1 === Abilities.wonderGuard
      || pk.ability2 === Abilities.wonderGuard
      || pk.ability3 === Abilities.wonderGuard;
  }

  randomizeTrainerHeldItems(_settings: Settings): void {
    // Simplified: no-op for Gen 1 (no held items in Gen 1)
  }

  // Ported from UPR-ZX AbstractRomHandler.java (added by nuzlocke-bench;
  // the port shipped this as an empty stub, so rivals never used the starter
  // they take from the table).
  rivalCarriesStarter(): void {
    const currentTrainers = this.getTrainers();
    this.rivalCarriesStarterUpdate(currentTrainers, "RIVAL", 1);
    this.rivalCarriesStarterUpdate(currentTrainers, "FRIEND", 2);
    this.setTrainers(currentTrainers, false);
  }

  private rivalCarriesStarterUpdate(currentTrainers: Trainer[], prefix: string, pokemonOffset: number): void {
    // Find the highest rival battle number (tags look like "RIVAL3-1")
    let highestRivalNum = 0;
    for (const t of currentTrainers) {
      if (t.tag != null && t.tag.startsWith(prefix)) {
        highestRivalNum = Math.max(highestRivalNum, parseInt(t.tag.substring(prefix.length, t.tag.indexOf("-")), 10));
      }
    }
    if (highestRivalNum === 0) return; // This rival type isn't used in this game

    const starters = this.getStarters();
    const change = (tag: string, starter: Pokemon) => this.changeStarterWithTag(currentTrainers, tag, starter);

    if (this.isYellow()) {
      // Yellow's rival always gets starter index 1 (the Eevee slot).
      let rivalStarter = starters[1];
      const timesEvolves = this.numEvolutions(rivalStarter, 2);
      if (timesEvolves === 0) {
        for (let j = 1; j <= 3; j++) change(`${prefix}${j}-0`, rivalStarter);
        for (let j = 4; j <= 7; j++) for (let i = 0; i < 3; i++) change(`${prefix}${j}-${i}`, rivalStarter);
      } else if (timesEvolves === 1) {
        for (let j = 1; j <= 3; j++) change(`${prefix}${j}-0`, rivalStarter);
        rivalStarter = this.pickRandomEvolutionOf(rivalStarter, false);
        for (let j = 4; j <= 7; j++) for (let i = 0; i < 3; i++) change(`${prefix}${j}-${i}`, rivalStarter);
      } else {
        for (let j = 1; j <= 2; j++) change(`${prefix}${j}-0`, rivalStarter);
        rivalStarter = this.pickRandomEvolutionOf(rivalStarter, true);
        change(`${prefix}3-0`, rivalStarter);
        for (let i = 0; i < 3; i++) change(`${prefix}4-${i}`, rivalStarter);
        rivalStarter = this.pickRandomEvolutionOf(rivalStarter, false);
        for (let j = 5; j <= 7; j++) for (let i = 0; i < 3; i++) change(`${prefix}${j}-${i}`, rivalStarter);
      }
      return;
    }

    // Our starter i => rival's is (i + pokemonOffset) % 3. Evolve by level.
    for (let i = 0; i < 3; i++) {
      let thisStarter = starters[(i + pokemonOffset) % 3];
      const timesEvolves = this.numEvolutions(thisStarter, 2);
      if (timesEvolves === 0) {
        for (let j = 1; j <= highestRivalNum; j++) change(`${prefix}${j}-${i}`, thisStarter);
      } else if (timesEvolves === 1) {
        let j = 1;
        for (; j <= Math.floor(highestRivalNum / 2); j++) {
          if (this.getLevelOfStarter(currentTrainers, `${prefix}${j}-${i}`) >= 30) break;
          change(`${prefix}${j}-${i}`, thisStarter);
        }
        thisStarter = this.pickRandomEvolutionOf(thisStarter, false);
        for (; j <= highestRivalNum; j++) change(`${prefix}${j}-${i}`, thisStarter);
      } else {
        let j = 1;
        for (; j <= highestRivalNum; j++) {
          if (this.getLevelOfStarter(currentTrainers, `${prefix}${j}-${i}`) >= 16) break;
          change(`${prefix}${j}-${i}`, thisStarter);
        }
        thisStarter = this.pickRandomEvolutionOf(thisStarter, true);
        for (; j <= highestRivalNum; j++) {
          if (this.getLevelOfStarter(currentTrainers, `${prefix}${j}-${i}`) >= 36) break;
          change(`${prefix}${j}-${i}`, thisStarter);
        }
        thisStarter = this.pickRandomEvolutionOf(thisStarter, false);
        for (; j <= highestRivalNum; j++) change(`${prefix}${j}-${i}`, thisStarter);
      }
    }
  }

  private numEvolutions(pk: Pokemon, maxInterested: number, depth = 0): number {
    if (pk.evolutionsFrom.length === 0) return 0;
    if (depth === maxInterested - 1) return 1;
    let maxEvos = 0;
    for (const ev of pk.evolutionsFrom) {
      maxEvos = Math.max(maxEvos, this.numEvolutions(ev.to, maxInterested, depth + 1) + 1);
    }
    return maxEvos;
  }

  private pickRandomEvolutionOf(base: Pokemon, mustEvolveItself: boolean): Pokemon {
    const candidates = base.evolutionsFrom
      .filter((ev) => !mustEvolveItself || ev.to.evolutionsFrom.length > 0)
      .map((ev) => ev.to);
    if (candidates.length === 0) {
      throw new Error("Random evolution called on a Pokemon without any usable evolutions.");
    }
    return candidates[this.random.nextInt(candidates.length)];
  }

  /** Highest level on the tagged team; the last Pokémon gets a +2 priority bonus. */
  private getLevelOfStarter(currentTrainers: Trainer[], tag: string): number {
    for (const t of currentTrainers) {
      if (t.tag === tag) {
        let highestLevel = t.pokemon[0].level;
        const n = t.pokemon.length;
        for (let i = 1; i < n; i++) {
          const levelBonus = i === n - 1 ? 2 : 0;
          if (t.pokemon[i].level + levelBonus > highestLevel) highestLevel = t.pokemon[i].level;
        }
        return highestLevel;
      }
    }
    return 0;
  }

  /** Replaces the tagged team's ace (highest level; last mon gets +2 priority) with the starter. */
  private changeStarterWithTag(currentTrainers: Trainer[], tag: string, starter: Pokemon): void {
    for (const t of currentTrainers) {
      if (t.tag !== tag) continue;
      let best = t.pokemon[0];
      if (t.forceStarterPosition >= 0) {
        best = t.pokemon[t.forceStarterPosition];
      } else {
        const n = t.pokemon.length;
        for (let i = 1; i < n; i++) {
          const levelBonus = i === n - 1 ? 2 : 0;
          if (t.pokemon[i].level + levelBonus > best.level) best = t.pokemon[i];
        }
      }
      best.pokemon = starter;
      best.forme = 0;
      best.resetMoves = true;
    }
  }

  hasRivalFinalBattle(): boolean {
    return false;
  }

  forceFullyEvolvedTrainerPokes(settings: Settings): void {
    const level = settings.trainersForceFullyEvolvedLevel;
    const trainers = this.getTrainers();
    for (const t of trainers) {
      for (const tp of t.pokemon) {
        if (tp.level >= level) {
          const evolved = this.fullyEvolve(tp.pokemon);
          if (evolved !== tp.pokemon) {
            tp.pokemon = evolved;
            tp.resetMoves = true;
          }
        }
      }
    }
    this.setTrainers(trainers, false);
  }

  private fullyEvolve(pk: Pokemon): Pokemon {
    let current = pk;
    let safety = 0;
    while (current.evolutionsFrom.length > 0 && safety < 10) {
      current = current.evolutionsFrom[0].to;
      safety++;
    }
    return current;
  }

  onlyChangeTrainerLevels(settings: Settings): void {
    const levelModifier = settings.trainersLevelModifier;
    const trainers = this.getTrainers();
    for (const t of trainers) {
      for (const tp of t.pokemon) {
        tp.level = Math.min(100, Math.round(tp.level * (1 + levelModifier / 100.0)));
      }
    }
    this.setTrainers(trainers, false);
  }

  addTrainerPokemon(_settings: Settings): void {
    // No-op by default; can be overridden
  }

  doubleBattleMode(): void {
    // No-op by default; can be overridden
  }
  getMoveSelectionPoolAtLevel(
    tp: TrainerPokemon,
    cyclicEvolutions: boolean
  ): Move[] {
    const allMoves = this.getMoves();
    const eggMoveProbability = 0.1;
    const preEvoMoveProbability = 0.5;
    const tmMoveProbability = 0.6;
    const tutorMoveProbability = 0.6;

    const levelUpMoves = this.getMovesLearnt();
    const eggMoveData = this.getEggMoves();
    const tmCompatMap = this.getTMHMCompatibility();
    const tmMoveList = this.getTMMoves();
    const tutorCompatMap = this.hasMoveTutors()
      ? this.getMoveTutorCompatibility()
      : null;
    const tutorMoveList = this.getMoveTutorMoves();

    const pk = this.getAltFormeOfPokemon(tp.pokemon, tp.forme);

    // Level-up Moves
    const pkMovesets = levelUpMoves.get(pk.number) || [];
    const movePool: Move[] = [];
    const seen = new Set<number>();
    for (const ml of pkMovesets) {
      if (
        (ml.level <= tp.level && ml.level !== 0) ||
        (ml.level === 0 && tp.level >= 30)
      ) {
        if (!seen.has(ml.move) && allMoves[ml.move]) {
          seen.add(ml.move);
          movePool.push(allMoves[ml.move]!);
        }
      }
    }

    // Pre-Evo Moves
    if (!cyclicEvolutions) {
      let preEvo: Pokemon;
      if (this.altFormesCanHaveDifferentEvolutions()) {
        preEvo = this.getAltFormeOfPokemon(tp.pokemon, tp.forme);
      } else {
        preEvo = tp.pokemon;
      }
      while (preEvo.evolutionsTo.length > 0) {
        preEvo = preEvo.evolutionsTo[0].from;
        const preEvoMoveList = levelUpMoves.get(preEvo.number) || [];
        for (const ml of preEvoMoveList) {
          if (
            ml.level <= tp.level &&
            this.random.nextDouble() < preEvoMoveProbability
          ) {
            if (!seen.has(ml.move) && allMoves[ml.move]) {
              seen.add(ml.move);
              movePool.push(allMoves[ml.move]!);
            }
          }
        }
      }
    }

    // TM Moves
    const pkTmCompat = tmCompatMap.get(pk);
    if (pkTmCompat) {
      for (let idx = 0; idx < tmMoveList.length; idx++) {
        const tmMove = tmMoveList[idx];
        if (pkTmCompat[idx + 1]) {
          const thisMove = allMoves[tmMove];
          if (!thisMove) continue;
          if (
            thisMove.power > 1 &&
            tp.level * 3 > thisMove.power * thisMove.hitCount &&
            this.random.nextDouble() < tmMoveProbability
          ) {
            movePool.push(thisMove);
          } else if (
            (thisMove.power <= 1 && this.random.nextInt(100) < tp.level) ||
            this.random.nextInt(200) < tp.level
          ) {
            movePool.push(thisMove);
          }
        }
      }
    }

    // Move Tutor Moves
    if (this.hasMoveTutors() && tutorCompatMap) {
      const pkTutorCompat = tutorCompatMap.get(pk);
      if (pkTutorCompat) {
        for (let idx = 0; idx < tutorMoveList.length; idx++) {
          const tutorMove = tutorMoveList[idx];
          if (pkTutorCompat[idx + 1]) {
            const thisMove = allMoves[tutorMove];
            if (!thisMove) continue;
            if (
              thisMove.power > 1 &&
              tp.level * 3 > thisMove.power * thisMove.hitCount &&
              this.random.nextDouble() < tutorMoveProbability
            ) {
              movePool.push(thisMove);
            } else if (
              (thisMove.power <= 1 && this.random.nextInt(100) < tp.level) ||
              this.random.nextInt(200) < tp.level
            ) {
              movePool.push(thisMove);
            }
          }
        }
      }
    }

    // Egg Moves
    if (!cyclicEvolutions) {
      let firstEvo: Pokemon;
      if (this.altFormesCanHaveDifferentEvolutions()) {
        firstEvo = this.getAltFormeOfPokemon(tp.pokemon, tp.forme);
      } else {
        firstEvo = tp.pokemon;
      }
      while (firstEvo.evolutionsTo.length > 0) {
        firstEvo = firstEvo.evolutionsTo[0].from;
      }
      const eggMoveList = eggMoveData.get(firstEvo.number);
      if (eggMoveList) {
        for (const egm of eggMoveList) {
          if (this.random.nextDouble() < eggMoveProbability && allMoves[egm]) {
            movePool.push(allMoves[egm]!);
          }
        }
      }
    }

    // Return distinct moves
    const distinctSeen = new Set<number>();
    return movePool.filter((m) => {
      if (distinctSeen.has(m.number)) return false;
      distinctSeen.add(m.number);
      return true;
    });
  }
  pickTrainerMovesets(settings: Settings): void {
    const isCyclicEvolutions =
      settings.evolutionsMod === EvolutionsMod.RANDOM_EVERY_LEVEL;
    const isDoubleBattleMode = settings.doubleBattleMode;
    const trainers = this.getTrainers();

    for (const t of trainers) {
      t.setPokemonHaveCustomMoves(true);
      for (const tp of t.pokemon) {
        tp.resetMoves = false;
        let movesAtLevel: Move[] = this.getMoveSelectionPoolAtLevel(tp, isCyclicEvolutions);
        movesAtLevel = this.trimMoveList(tp, movesAtLevel, isDoubleBattleMode);
        if (movesAtLevel.length === 0) continue;

        let trainerTypeModifier = 1;
        if (t.isImportant()) trainerTypeModifier = 1.5;
        else if (t.isBoss()) trainerTypeModifier = 2;
        const movePoolSizeModifier = movesAtLevel.length / 10.0;
        const bonusModifier = trainerTypeModifier * movePoolSizeModifier;
        const atkSpatkRatioModifier = 0.75;
        const stabMoveBias = 0.25 * bonusModifier;

        // Add bias for STAB
        const pk = this.getAltFormeOfPokemon(tp.pokemon, tp.forme);
        let stabMoves = movesAtLevel.filter(
          (mv) => mv.type === pk.primaryType && mv.category !== MoveCategory.STATUS,
        );
        this.shuffleArray(stabMoves);
        for (let i = 0; i < stabMoveBias * stabMoves.length; i++) {
          movesAtLevel.push(stabMoves[i % stabMoves.length]);
        }
        if (pk.secondaryType != null) {
          stabMoves = [...movesAtLevel].filter(
            (mv) => mv.type === pk.secondaryType && mv.category !== MoveCategory.STATUS,
          );
          this.shuffleArray(stabMoves);
          for (let i = 0; i < stabMoveBias * stabMoves.length; i++) {
            movesAtLevel.push(stabMoves[i % stabMoves.length]);
          }
        }

        // NOTE: MoveSynergy methods are not yet ported; ability/stat synergy
        // bias steps that depend on MoveSynergy are skipped.

        let distinctMoveList = [...new Set(movesAtLevel)];
        let movesLeft = distinctMoveList.length;
        if (movesLeft <= 4) {
          for (let i = 0; i < 4; i++) tp.moves[i] = i < movesLeft ? distinctMoveList[i].number : 0;
          continue;
        }

        // Add bias for atk/spatk ratio
        let atkSpatkRatio = pk.attack / pk.spatk;
        switch (this.getAbilityForTrainerPokemon(tp)) {
          case Abilities.hugePower: case Abilities.purePower: atkSpatkRatio *= 2; break;
          case Abilities.hustle: case Abilities.gorillaTactics: atkSpatkRatio *= 1.5; break;
          case Abilities.moxie: atkSpatkRatio *= 1.1; break;
          case Abilities.soulHeart: atkSpatkRatio *= 0.9; break;
        }
        const physicalMoves = [...movesAtLevel].filter((mv) => mv.category === MoveCategory.PHYSICAL);
        const specialMoves = [...movesAtLevel].filter((mv) => mv.category === MoveCategory.SPECIAL);
        if (atkSpatkRatio < 1 && specialMoves.length > 0) {
          atkSpatkRatio = 1 / atkSpatkRatio;
          const acceptedRatio = atkSpatkRatioModifier * atkSpatkRatio;
          const additionalMoves = Math.floor(physicalMoves.length * acceptedRatio) - specialMoves.length;
          for (let i = 0; i < additionalMoves; i++) {
            movesAtLevel.push(specialMoves[this.random.nextInt(specialMoves.length)]);
          }
        } else if (physicalMoves.length > 0) {
          const acceptedRatio = atkSpatkRatioModifier * atkSpatkRatio;
          const additionalMoves = Math.floor(specialMoves.length * acceptedRatio) - physicalMoves.length;
          for (let i = 0; i < additionalMoves; i++) {
            movesAtLevel.push(physicalMoves[this.random.nextInt(physicalMoves.length)]);
          }
        }

        // Pick moves
        const pickedMoves: Move[] = [];
        for (let i = 1; i <= 4; i++) {
          let pickFrom: Move[];
          if (i === 1) {
            pickFrom = movesAtLevel.filter((mv) => mv.isGoodDamaging(this.perfectAccuracy));
            if (pickFrom.length === 0) pickFrom = movesAtLevel;
          } else {
            pickFrom = movesAtLevel;
          }
          if (i === 4) {
            const uniqueRequires = [...new Set(
              movesAtLevel.filter((mv) => GlobalConstants.requiresOtherMove.includes(mv.number)),
            )];
            for (const dependentMove of uniqueRequires) {
              let hasRequiredMove = false;
              for (const picked of pickedMoves) {
                if (this.isEnablerFor(dependentMove, picked)) { hasRequiredMove = true; break; }
              }
              if (!hasRequiredMove) movesAtLevel = movesAtLevel.filter((mv) => mv !== dependentMove);
            }
            pickFrom = movesAtLevel;
          }
          if (pickFrom.length === 0) break;
          const move = pickFrom[this.random.nextInt(pickFrom.length)];
          pickedMoves.push(move);
          if (i === 4) break;

          movesAtLevel = movesAtLevel.filter((mv) => mv !== move);
          // NOTE: MoveSynergy hard/soft move synergy/anti-synergy steps skipped
          distinctMoveList = [...new Set(movesAtLevel)];
          movesLeft = distinctMoveList.length;
          if (movesLeft <= 4 - i) { pickedMoves.push(...distinctMoveList); break; }
        }

        const movesPicked = pickedMoves.length;
        for (let i = 0; i < 4; i++) tp.moves[i] = i < movesPicked ? pickedMoves[i].number : 0;
      }
    }
    this.setTrainers(trainers, false);
  }

  private trimMoveList(tp: TrainerPokemon, movesAtLevel: Move[], doubleBattleMode: boolean): Move[] {
    let movesLeft = movesAtLevel.length;
    if (movesLeft <= 4) {
      for (let i = 0; i < 4; i++) tp.moves[i] = i < movesLeft ? movesAtLevel[i].number : 0;
      return [];
    }
    movesAtLevel = movesAtLevel.filter(
      (mv) => !GlobalConstants.uselessMoves.includes(mv.number) &&
        (doubleBattleMode || !GlobalConstants.doubleBattleMoves.includes(mv.number)),
    );
    movesLeft = movesAtLevel.length;
    if (movesLeft <= 4) {
      for (let i = 0; i < 4; i++) tp.moves[i] = i < movesLeft ? movesAtLevel[i].number : 0;
      return [];
    }
    const obsoletedMoves = this.getObsoleteMoves(movesAtLevel);
    movesAtLevel = movesAtLevel.filter((mv) => !obsoletedMoves.includes(mv));
    movesLeft = movesAtLevel.length;
    if (movesLeft <= 4) {
      for (let i = 0; i < 4; i++) tp.moves[i] = i < movesLeft ? movesAtLevel[i].number : 0;
      return [];
    }
    // Remove dependent moves whose requirements aren't met
    const requiresOtherMoveList = movesAtLevel.filter(
      (mv) => GlobalConstants.requiresOtherMove.includes(mv.number),
    );
    for (const dependentMove of requiresOtherMoveList) {
      if (!this.hasEnablerInPool(dependentMove, movesAtLevel)) {
        const idx = movesAtLevel.indexOf(dependentMove);
        if (idx >= 0) movesAtLevel.splice(idx, 1);
      }
    }
    movesLeft = movesAtLevel.length;
    if (movesLeft <= 4) {
      for (let i = 0; i < 4; i++) tp.moves[i] = i < movesLeft ? movesAtLevel[i].number : 0;
      return [];
    }
    // NOTE: Hard ability anti-synergy removal skipped (requires MoveSynergy)
    return movesAtLevel;
  }

  private hasEnablerInPool(dependentMove: Move, movesAtLevel: Move[]): boolean {
    if (dependentMove.number === Moves.spitUp || dependentMove.number === Moves.swallow) {
      return movesAtLevel.some((mv) => mv.number === Moves.stockpile);
    }
    if (dependentMove.number === Moves.dreamEater || dependentMove.number === Moves.nightmare) {
      return movesAtLevel.some((mv) => mv.statusType === StatusType.SLEEP && mv.statusPercentChance > 0);
    }
    return true;
  }

  private isEnablerFor(dependentMove: Move, candidate: Move): boolean {
    if (dependentMove.number === Moves.spitUp || dependentMove.number === Moves.swallow) {
      return candidate.number === Moves.stockpile;
    }
    if (dependentMove.number === Moves.dreamEater || dependentMove.number === Moves.nightmare) {
      return candidate.statusType === StatusType.SLEEP && candidate.statusPercentChance > 0;
    }
    return false;
  }

  private getObsoleteMoves(movesAtLevel: Move[]): Move[] {
    const obsoletedMoves: Move[] = [];
    for (const mv of movesAtLevel) {
      if (GlobalConstants.cannotObsoleteMoves.includes(mv.number)) continue;
      if (mv.power > 0) {
        const obsoleteThis = movesAtLevel.filter((mv2) =>
          !GlobalConstants.cannotBeObsoletedMoves.includes(mv2.number) &&
          mv.type === mv2.type &&
          ((((mv.statChangeMoveType === mv2.statChangeMoveType &&
            mv.statChanges[0].equals(mv2.statChanges[0])) ||
            (mv2.statChangeMoveType === StatChangeMoveType.NONE_OR_UNKNOWN && mv.hasBeneficialStatChange())) &&
            mv.absorbPercent >= mv2.absorbPercent && !mv.isChargeMove && !mv.isRechargeMove) ||
            mv2.power * mv2.hitCount <= 30) &&
          mv.hitratio >= mv2.hitratio && mv.category === mv2.category &&
          mv.priority >= mv2.priority && mv2.power > 0 &&
          mv.power * mv.hitCount > mv2.power * mv2.hitCount,
        );
        obsoletedMoves.push(...obsoleteThis);
      } else if (
        mv.statChangeMoveType === StatChangeMoveType.NO_DAMAGE_USER ||
        mv.statChangeMoveType === StatChangeMoveType.NO_DAMAGE_TARGET
      ) {
        const obsoleteThis: Move[] = [];
        const statChanges1: MoveStatChange[] = mv.statChanges.filter((sc) => sc.type !== StatChangeType.NONE);
        const candidates = movesAtLevel.filter((otherMv) =>
          otherMv !== mv && otherMv.power <= 0 &&
          otherMv.statChangeMoveType === mv.statChangeMoveType &&
          (otherMv.statusType === mv.statusType || otherMv.statusType === StatusType.NONE),
        );
        for (const mv2 of candidates) {
          const statChanges2: MoveStatChange[] = mv2.statChanges.filter((sc) => sc.type !== StatChangeType.NONE);
          if (statChanges2.length > statChanges1.length) continue;
          const statChanges1Filtered = statChanges1.filter((sc) => !statChanges2.some((sc2) => sc.equals(sc2)));
          const statChanges2Remaining = statChanges2.filter((sc) => !statChanges1.some((sc2) => sc.equals(sc2)));
          if (statChanges1Filtered.length > 0 && statChanges2Remaining.length === 0) {
            if (!GlobalConstants.cannotBeObsoletedMoves.includes(mv2.number)) obsoleteThis.push(mv2);
            continue;
          }
          if (statChanges1Filtered.length === 0 && statChanges2Remaining.length === 0) continue;
          let maybeBetter = false;
          for (const sc1 of statChanges1Filtered) {
            let canStillBeBetter = false;
            for (const sc2 of statChanges2Remaining) {
              if (sc1.type === sc2.type) {
                canStillBeBetter = true;
                if ((mv.statChangeMoveType === StatChangeMoveType.NO_DAMAGE_USER && sc1.stages > sc2.stages) ||
                  (mv.statChangeMoveType === StatChangeMoveType.NO_DAMAGE_TARGET && sc1.stages < sc2.stages)) {
                  maybeBetter = true;
                } else {
                  canStillBeBetter = false;
                }
              }
            }
            if (!canStillBeBetter) { maybeBetter = false; break; }
          }
          if (maybeBetter && !GlobalConstants.cannotBeObsoletedMoves.includes(mv2.number)) {
            obsoleteThis.push(mv2);
          }
        }
        obsoletedMoves.push(...obsoleteThis);
      }
    }
    return [...new Set(obsoletedMoves)];
  }

  abstract hasPhysicalSpecialSplit(): boolean;

  updateMoves(settings: Settings): void {
    const generation = settings.updateMovesToGeneration;
    const moves = this.getMoves();

    if (generation >= 2 && this.generationOfPokemon() < 2) {
      this.updateMoveType(moves, Moves.karateChop, Type.FIGHTING);
      this.updateMoveType(moves, Moves.gust, Type.FLYING);
      this.updateMovePower(moves, Moves.wingAttack, 60);
      this.updateMoveAccuracy(moves, Moves.whirlwind, 100);
      this.updateMoveType(moves, Moves.sandAttack, Type.GROUND);
      this.updateMovePower(moves, Moves.doubleEdge, 120);
      this.updateMoveAccuracy(moves, Moves.blizzard, 70);
      this.updateMoveAccuracy(moves, Moves.rockThrow, 90);
      this.updateMoveAccuracy(moves, Moves.hypnosis, 60);
      this.updateMovePower(moves, Moves.selfDestruct, 200);
      this.updateMovePower(moves, Moves.explosion, 250);
      this.updateMovePower(moves, Moves.dig, 60);
    }

    if (generation >= 3 && this.generationOfPokemon() < 3) {
      this.updateMoveAccuracy(moves, Moves.razorWind, 100);
      this.updateMoveAccuracy(moves, Moves.lowKick, 100);
    }

    if (generation >= 4 && this.generationOfPokemon() < 4) {
      this.updateMovePower(moves, Moves.fly, 90);
      this.updateMovePP(moves, Moves.vineWhip, 15);
      this.updateMovePP(moves, Moves.absorb, 25);
      this.updateMovePP(moves, Moves.megaDrain, 15);
      this.updateMovePower(moves, Moves.dig, 80);
      this.updateMovePP(moves, Moves.recover, 10);
      this.updateMoveAccuracy(moves, Moves.flash, 100);
      this.updateMovePower(moves, Moves.petalDance, 90);
      this.updateMoveAccuracy(moves, Moves.disable, 80);
      this.updateMovePower(moves, Moves.jumpKick, 85);
      this.updateMovePower(moves, Moves.highJumpKick, 100);

      if (this.generationOfPokemon() >= 2) {
        this.updateMovePower(moves, Moves.zapCannon, 120);
        this.updateMovePower(moves, Moves.outrage, 120);
        this.updateMovePP(moves, Moves.outrage, 10);
        this.updateMovePP(moves, Moves.gigaDrain, 10);
        this.updateMovePower(moves, Moves.rockSmash, 40);
      }

      if (this.generationOfPokemon() === 3) {
        this.updateMovePP(moves, Moves.stockpile, 20);
        this.updateMovePower(moves, Moves.dive, 80);
        this.updateMovePower(moves, Moves.leafBlade, 90);
      }
    }

    if (generation >= 5 && this.generationOfPokemon() < 5) {
      this.updateMoveAccuracy(moves, Moves.bind, 85);
      this.updateMovePP(moves, Moves.jumpKick, 10);
      this.updateMovePower(moves, Moves.jumpKick, 100);
      this.updateMovePower(moves, Moves.tackle, 50);
      this.updateMoveAccuracy(moves, Moves.tackle, 100);
      this.updateMoveAccuracy(moves, Moves.wrap, 90);
      this.updateMovePP(moves, Moves.thrash, 10);
      this.updateMovePower(moves, Moves.thrash, 120);
      this.updateMoveAccuracy(moves, Moves.disable, 100);
      this.updateMovePP(moves, Moves.petalDance, 10);
      this.updateMovePower(moves, Moves.petalDance, 120);
      this.updateMoveAccuracy(moves, Moves.fireSpin, 85);
      this.updateMovePower(moves, Moves.fireSpin, 35);
      this.updateMoveAccuracy(moves, Moves.toxic, 90);
      this.updateMoveAccuracy(moves, Moves.clamp, 85);
      this.updateMovePP(moves, Moves.clamp, 15);
      this.updateMovePP(moves, Moves.highJumpKick, 10);
      this.updateMovePower(moves, Moves.highJumpKick, 130);
      this.updateMoveAccuracy(moves, Moves.glare, 90);
      this.updateMoveAccuracy(moves, Moves.poisonGas, 80);
      this.updateMoveAccuracy(moves, Moves.crabhammer, 90);

      if (this.generationOfPokemon() >= 2) {
        this.updateMoveType(moves, Moves.curse, Type.GHOST);
        this.updateMoveAccuracy(moves, Moves.cottonSpore, 100);
        this.updateMoveAccuracy(moves, Moves.scaryFace, 100);
        this.updateMoveAccuracy(moves, Moves.boneRush, 90);
        this.updateMovePower(moves, Moves.gigaDrain, 75);
        this.updateMovePower(moves, Moves.furyCutter, 20);
        this.updateMovePP(moves, Moves.futureSight, 10);
        this.updateMovePower(moves, Moves.futureSight, 100);
        this.updateMoveAccuracy(moves, Moves.futureSight, 100);
        this.updateMovePower(moves, Moves.whirlpool, 35);
        this.updateMoveAccuracy(moves, Moves.whirlpool, 85);
      }

      if (this.generationOfPokemon() >= 3) {
        this.updateMovePower(moves, Moves.uproar, 90);
        this.updateMovePower(moves, Moves.sandTomb, 35);
        this.updateMoveAccuracy(moves, Moves.sandTomb, 85);
        this.updateMovePower(moves, Moves.bulletSeed, 25);
        this.updateMovePower(moves, Moves.icicleSpear, 25);
        this.updateMovePower(moves, Moves.covet, 60);
        this.updateMoveAccuracy(moves, Moves.rockBlast, 90);
        this.updateMovePower(moves, Moves.doomDesire, 140);
        this.updateMoveAccuracy(moves, Moves.doomDesire, 100);
      }

      if (this.generationOfPokemon() === 4) {
        this.updateMovePower(moves, Moves.feint, 30);
        this.updateMovePower(moves, Moves.lastResort, 140);
        this.updateMovePP(moves, Moves.drainPunch, 10);
        this.updateMovePower(moves, Moves.drainPunch, 75);
        this.updateMoveAccuracy(moves, Moves.magmaStorm, 75);
      }
    }

    if (generation >= 6 && this.generationOfPokemon() < 6) {
      this.updateMovePP(moves, Moves.swordsDance, 20);
      this.updateMoveAccuracy(moves, Moves.whirlwind, this.perfectAccuracy);
      this.updateMovePP(moves, Moves.vineWhip, 25);
      this.updateMovePower(moves, Moves.vineWhip, 45);
      this.updateMovePower(moves, Moves.pinMissile, 25);
      this.updateMoveAccuracy(moves, Moves.pinMissile, 95);
      this.updateMovePower(moves, Moves.flamethrower, 90);
      this.updateMovePower(moves, Moves.hydroPump, 110);
      this.updateMovePower(moves, Moves.surf, 90);
      this.updateMovePower(moves, Moves.iceBeam, 90);
      this.updateMovePower(moves, Moves.blizzard, 110);
      this.updateMovePP(moves, Moves.growth, 20);
      this.updateMovePower(moves, Moves.thunderbolt, 90);
      this.updateMovePower(moves, Moves.thunder, 110);
      this.updateMovePP(moves, Moves.minimize, 10);
      this.updateMovePP(moves, Moves.barrier, 20);
      this.updateMovePower(moves, Moves.lick, 30);
      this.updateMovePower(moves, Moves.smog, 30);
      this.updateMovePower(moves, Moves.fireBlast, 110);
      this.updateMovePP(moves, Moves.skullBash, 10);
      this.updateMovePower(moves, Moves.skullBash, 130);
      this.updateMoveAccuracy(moves, Moves.glare, 100);
      this.updateMoveAccuracy(moves, Moves.poisonGas, 90);
      this.updateMovePower(moves, Moves.bubble, 40);
      this.updateMoveAccuracy(moves, Moves.psywave, 100);
      this.updateMovePP(moves, Moves.acidArmor, 20);
      this.updateMovePower(moves, Moves.crabhammer, 100);

      if (this.generationOfPokemon() >= 2) {
        this.updateMovePP(moves, Moves.thief, 25);
        this.updateMovePower(moves, Moves.thief, 60);
        this.updateMovePower(moves, Moves.snore, 50);
        this.updateMovePower(moves, Moves.furyCutter, 40);
        this.updateMovePower(moves, Moves.futureSight, 120);
      }

      if (this.generationOfPokemon() >= 3) {
        this.updateMovePower(moves, Moves.heatWave, 95);
        this.updateMoveAccuracy(moves, Moves.willOWisp, 85);
        this.updateMovePower(moves, Moves.smellingSalts, 70);
        this.updateMovePower(moves, Moves.knockOff, 65);
        this.updateMovePower(moves, Moves.meteorMash, 90);
        this.updateMoveAccuracy(moves, Moves.meteorMash, 90);
        this.updateMovePower(moves, Moves.airCutter, 60);
        this.updateMovePower(moves, Moves.overheat, 130);
        this.updateMovePP(moves, Moves.rockTomb, 15);
        this.updateMovePower(moves, Moves.rockTomb, 60);
        this.updateMoveAccuracy(moves, Moves.rockTomb, 95);
        this.updateMovePP(moves, Moves.extrasensory, 20);
        this.updateMovePower(moves, Moves.muddyWater, 90);
        this.updateMovePP(moves, Moves.covet, 25);
      }

      if (this.generationOfPokemon() >= 4) {
        this.updateMovePower(moves, Moves.wakeUpSlap, 70);
        this.updateMovePP(moves, Moves.tailwind, 15);
        this.updateMovePower(moves, Moves.assurance, 60);
        this.updateMoveAccuracy(moves, Moves.psychoShift, 100);
        this.updateMovePower(moves, Moves.auraSphere, 80);
        this.updateMovePP(moves, Moves.airSlash, 15);
        this.updateMovePower(moves, Moves.dragonPulse, 85);
        this.updateMovePower(moves, Moves.powerGem, 80);
        this.updateMovePower(moves, Moves.energyBall, 90);
        this.updateMovePower(moves, Moves.dracoMeteor, 130);
        this.updateMovePower(moves, Moves.leafStorm, 130);
        this.updateMoveAccuracy(moves, Moves.gunkShot, 80);
        this.updateMovePower(moves, Moves.chatter, 65);
        this.updateMovePower(moves, Moves.magmaStorm, 100);
      }

      if (this.generationOfPokemon() === 5) {
        this.updateMovePower(moves, Moves.synchronoise, 120);
        this.updateMovePower(moves, Moves.lowSweep, 65);
        this.updateMovePower(moves, Moves.hex, 65);
        this.updateMovePower(moves, Moves.incinerate, 60);
        this.updateMovePower(moves, Moves.waterPledge, 80);
        this.updateMovePower(moves, Moves.firePledge, 80);
        this.updateMovePower(moves, Moves.grassPledge, 80);
        this.updateMovePower(moves, Moves.struggleBug, 50);
        this.updateMovePower(moves, Moves.frostBreath, 45);
        this.updateMovePower(moves, Moves.stormThrow, 45);
        this.updateMovePP(moves, Moves.sacredSword, 15);
        this.updateMovePower(moves, Moves.hurricane, 110);
        this.updateMovePower(moves, Moves.technoBlast, 120);
      }
    }

    if (generation >= 7 && this.generationOfPokemon() < 7) {
      this.updateMovePower(moves, Moves.leechLife, 80);
      this.updateMovePP(moves, Moves.leechLife, 10);
      this.updateMovePP(moves, Moves.submission, 20);
      this.updateMovePower(moves, Moves.tackle, 40);
      this.updateMoveAccuracy(moves, Moves.thunderWave, 90);

      if (this.generationOfPokemon() >= 2) {
        this.updateMoveAccuracy(moves, Moves.swagger, 85);
      }

      if (this.generationOfPokemon() >= 3) {
        this.updateMovePP(moves, Moves.knockOff, 20);
      }

      if (this.generationOfPokemon() >= 4) {
        this.updateMoveAccuracy(moves, Moves.darkVoid, 50);
        this.updateMovePower(moves, Moves.suckerPunch, 70);
      }

      if (this.generationOfPokemon() === 6) {
        this.updateMoveAccuracy(
          moves,
          Moves.aromaticMist,
          this.perfectAccuracy
        );
        this.updateMovePower(moves, Moves.fellStinger, 50);
        this.updateMovePower(moves, Moves.flyingPress, 100);
        this.updateMovePP(moves, Moves.matBlock, 10);
        this.updateMovePower(moves, Moves.mysticalFire, 75);
        this.updateMovePower(moves, Moves.parabolicCharge, 65);
        this.updateMoveAccuracy(
          moves,
          Moves.topsyTurvy,
          this.perfectAccuracy
        );
        this.updateMoveCategory(
          moves,
          Moves.waterShuriken,
          MoveCategory.SPECIAL
        );
      }
    }

    if (generation >= 8 && this.generationOfPokemon() < 8) {
      if (this.generationOfPokemon() >= 2) {
        this.updateMovePower(moves, Moves.rapidSpin, 50);
      }

      if (this.generationOfPokemon() === 7) {
        this.updateMovePower(moves, Moves.multiAttack, 120);
      }
    }

    if (generation >= 9 && this.generationOfPokemon() < 9) {
      this.updateMovePP(moves, Moves.recover, 5);
      this.updateMovePP(moves, Moves.softBoiled, 5);
      this.updateMovePP(moves, Moves.rest, 5);

      if (this.generationOfPokemon() >= 2) {
        this.updateMovePP(moves, Moves.milkDrink, 5);
      }

      if (this.generationOfPokemon() >= 3) {
        this.updateMovePower(moves, Moves.lusterPurge, 95);
        this.updateMovePower(moves, Moves.mistBall, 95);
        this.updateMovePP(moves, Moves.slackOff, 5);
      }

      if (this.generationOfPokemon() >= 4) {
        this.updateMovePP(moves, Moves.roost, 5);
      }

      if (this.generationOfPokemon() >= 7) {
        this.updateMovePP(moves, Moves.shoreUp, 5);
      }

      if (this.generationOfPokemon() >= 8) {
        this.updateMovePower(moves, Moves.grassyGlide, 55);
        this.updateMovePower(moves, Moves.wickedBlow, 75);
        this.updateMovePower(moves, Moves.glacialLance, 120);
      }
    }
  }

  initMoveUpdates(): void {
    this.moveUpdates = new Map();
  }

  getMoveUpdates(): Map<number, boolean[]> {
    return this.moveUpdates;
  }

  abstract getMoves(): (Move | null)[];

  abstract getMovesLearnt(): Map<number, MoveLearnt[]>;
  abstract setMovesLearnt(movesets: Map<number, MoveLearnt[]>): void;
  abstract getEggMoves(): Map<number, number[]>;
  abstract setEggMoves(eggMoves: Map<number, number[]>): void;
  randomizeMovesLearnt(settings: Settings): void {
    const typeThemed = settings.movesetsMod === MovesetsMod.RANDOM_PREFER_SAME_TYPE;
    const noBroken = settings.blockBrokenMovesetMoves;
    const forceStartingMoves = this.supportsFourStartingMoves() && settings.startWithGuaranteedMoves;
    const forceStartingMoveCount = settings.guaranteedMoveCount;
    const goodDamagingPercentage =
      settings.movesetsForceGoodDamaging ? settings.movesetsGoodDamagingPercent / 100.0 : 0;
    const evolutionMovesForAll = settings.evolutionMovesForAll;

    const movesets = this.getMovesLearnt();
    const validMoves: Move[] = [];
    const validDamagingMoves: Move[] = [];
    const validTypeMoves = new Map<Type, Move[]>();
    const validTypeDamagingMoves = new Map<Type, Move[]>();
    this.createSetsOfMoves(noBroken, validMoves, validDamagingMoves, validTypeMoves, validTypeDamagingMoves);

    for (const [pkmnNum, moves] of movesets) {
      const learnt: number[] = [];
      let lv1AttackingMove = 0;
      const pkmn = this.findPokemonInPoolWithSpeciesID(this.mainPokemonListInclFormes, pkmnNum);
      if (pkmn == null) continue;

      const atkSpAtkRatio = pkmn.getAttackSpecialAttackRatio();

      if (forceStartingMoves) {
        let lv1count = 0;
        for (const ml of moves) {
          if (ml.level === 1) lv1count++;
        }
        if (lv1count < forceStartingMoveCount) {
          for (let i = 0; i < forceStartingMoveCount - lv1count; i++) {
            const fakeLv1 = new MoveLearnt();
            fakeLv1.level = 1;
            fakeLv1.move = 0;
            moves.unshift(fakeLv1);
          }
        }
      }

      if (evolutionMovesForAll) {
        if (moves[0].level !== 0) {
          const fakeEvoMove = new MoveLearnt();
          fakeEvoMove.level = 0;
          fakeEvoMove.move = 0;
          moves.unshift(fakeEvoMove);
        }
      }

      if (pkmn.actuallyCosmetic) {
        const baseMoveset = movesets.get(pkmn.baseForme!.number);
        if (baseMoveset) {
          for (let i = 0; i < moves.length; i++) {
            moves[i].move = baseMoveset[i].move;
          }
        }
        continue;
      }

      // Find last lv1 move
      let lv1index = moves[0].level === 1 ? 0 : 1; // Evolution move handling (level 0 = evo move)
      while (lv1index < moves.length && moves[lv1index].level === 1) {
        lv1index++;
      }
      if (lv1index !== 0) {
        lv1index--;
      }

      let goodDamagingLeft = Math.round(goodDamagingPercentage * moves.length);

      for (let i = 0; i < moves.length; i++) {
        const attemptDamaging = i === lv1index || goodDamagingLeft > 0;

        let typeOfMove: Type | null = null;
        if (typeThemed) {
          const picked = this.random.nextDouble();
          if (
            (pkmn.primaryType === Type.NORMAL && pkmn.secondaryType != null) ||
            (pkmn.secondaryType === Type.NORMAL)
          ) {
            const otherType = pkmn.primaryType === Type.NORMAL ? pkmn.secondaryType! : pkmn.primaryType;
            if (picked < 0.1) {
              typeOfMove = Type.NORMAL;
            } else if (picked < 0.4) {
              typeOfMove = otherType;
            }
          } else if (pkmn.secondaryType != null) {
            if (picked < 0.2) {
              typeOfMove = pkmn.primaryType;
            } else if (picked < 0.4) {
              typeOfMove = pkmn.secondaryType;
            }
          } else {
            if (picked < 0.4) {
              typeOfMove = pkmn.primaryType;
            }
          }
        }

        let pickList = validMoves;
        if (attemptDamaging) {
          if (typeOfMove != null) {
            if (
              validTypeDamagingMoves.has(typeOfMove) &&
              this.checkForUnusedMove(validTypeDamagingMoves.get(typeOfMove)!, learnt)
            ) {
              pickList = validTypeDamagingMoves.get(typeOfMove)!;
            } else if (this.checkForUnusedMove(validDamagingMoves, learnt)) {
              pickList = validDamagingMoves;
            }
          } else if (this.checkForUnusedMove(validDamagingMoves, learnt)) {
            pickList = validDamagingMoves;
          }
          const forcedCategory =
            this.random.nextDouble() < atkSpAtkRatio ? MoveCategory.PHYSICAL : MoveCategory.SPECIAL;
          const filteredList = pickList.filter((mv) => mv.category === forcedCategory);
          if (filteredList.length > 0 && this.checkForUnusedMove(filteredList, learnt)) {
            pickList = filteredList;
          }
        } else if (typeOfMove != null) {
          if (
            validTypeMoves.has(typeOfMove) &&
            this.checkForUnusedMove(validTypeMoves.get(typeOfMove)!, learnt)
          ) {
            pickList = validTypeMoves.get(typeOfMove)!;
          }
        }

        let mv = pickList[this.random.nextInt(pickList.length)];
        while (learnt.includes(mv.number)) {
          mv = pickList[this.random.nextInt(pickList.length)];
        }

        if (i === lv1index) {
          lv1AttackingMove = mv.number;
        } else {
          goodDamagingLeft--;
        }
        learnt.push(mv.number);
      }

      // Shuffle learnt moves
      for (let i = learnt.length - 1; i > 0; i--) {
        const j = this.random.nextInt(i + 1);
        [learnt[i], learnt[j]] = [learnt[j], learnt[i]];
      }

      // Ensure lv1 attacking move is at lv1index
      if (learnt[lv1index] !== lv1AttackingMove) {
        for (let i = 0; i < learnt.length; i++) {
          if (learnt[i] === lv1AttackingMove) {
            learnt[i] = learnt[lv1index];
            learnt[lv1index] = lv1AttackingMove;
            break;
          }
        }
      }

      for (let i = 0; i < learnt.length; i++) {
        moves[i].move = learnt[i];
        if (i === lv1index) {
          moves[i].level = 1;
        }
      }
    }
    this.setMovesLearnt(movesets);
  }
  randomizeEggMoves(settings: Settings): void {
    const typeThemed = settings.movesetsMod === MovesetsMod.RANDOM_PREFER_SAME_TYPE;
    const noBroken = settings.blockBrokenMovesetMoves;
    const goodDamagingPercentage =
      settings.movesetsForceGoodDamaging ? settings.movesetsGoodDamagingPercent / 100.0 : 0;

    const movesets = this.getEggMoves();

    const validMoves: Move[] = [];
    const validDamagingMoves: Move[] = [];
    const validTypeMoves = new Map<Type, Move[]>();
    const validTypeDamagingMoves = new Map<Type, Move[]>();
    this.createSetsOfMoves(noBroken, validMoves, validDamagingMoves, validTypeMoves, validTypeDamagingMoves);

    for (const [pkmnNum, moves] of movesets) {
      const learnt: number[] = [];
      const pkmn = this.findPokemonInPoolWithSpeciesID(this.mainPokemonListInclFormes, pkmnNum);
      if (pkmn == null) continue;

      const atkSpAtkRatio = pkmn.getAttackSpecialAttackRatio();

      if (pkmn.actuallyCosmetic) {
        const baseMoves = movesets.get(pkmn.baseForme!.number);
        if (baseMoves) {
          for (let i = 0; i < moves.length; i++) {
            moves[i] = baseMoves[i];
          }
        }
        continue;
      }

      let goodDamagingLeft = Math.round(goodDamagingPercentage * moves.length);

      for (let i = 0; i < moves.length; i++) {
        const attemptDamaging = goodDamagingLeft > 0;

        let typeOfMove: Type | null = null;
        if (typeThemed) {
          const picked = this.random.nextDouble();
          if (
            (pkmn.primaryType === Type.NORMAL && pkmn.secondaryType != null) ||
            (pkmn.secondaryType === Type.NORMAL)
          ) {
            const otherType = pkmn.primaryType === Type.NORMAL ? pkmn.secondaryType! : pkmn.primaryType;
            if (picked < 0.1) typeOfMove = Type.NORMAL;
            else if (picked < 0.4) typeOfMove = otherType;
          } else if (pkmn.secondaryType != null) {
            if (picked < 0.2) typeOfMove = pkmn.primaryType;
            else if (picked < 0.4) typeOfMove = pkmn.secondaryType;
          } else {
            if (picked < 0.4) typeOfMove = pkmn.primaryType;
          }
        }

        let pickList = validMoves;
        if (attemptDamaging) {
          if (typeOfMove != null) {
            if (
              validTypeDamagingMoves.has(typeOfMove) &&
              this.checkForUnusedMove(validTypeDamagingMoves.get(typeOfMove)!, learnt)
            ) {
              pickList = validTypeDamagingMoves.get(typeOfMove)!;
            } else if (this.checkForUnusedMove(validDamagingMoves, learnt)) {
              pickList = validDamagingMoves;
            }
          } else if (this.checkForUnusedMove(validDamagingMoves, learnt)) {
            pickList = validDamagingMoves;
          }
          const forcedCategory =
            this.random.nextDouble() < atkSpAtkRatio ? MoveCategory.PHYSICAL : MoveCategory.SPECIAL;
          const filteredList = pickList.filter((mv) => mv.category === forcedCategory);
          if (filteredList.length > 0 && this.checkForUnusedMove(filteredList, learnt)) {
            pickList = filteredList;
          }
        } else if (typeOfMove != null) {
          if (
            validTypeMoves.has(typeOfMove) &&
            this.checkForUnusedMove(validTypeMoves.get(typeOfMove)!, learnt)
          ) {
            pickList = validTypeMoves.get(typeOfMove)!;
          }
        }

        let mv = pickList[this.random.nextInt(pickList.length)];
        while (learnt.includes(mv.number)) {
          mv = pickList[this.random.nextInt(pickList.length)];
        }

        goodDamagingLeft--;
        learnt.push(mv.number);
      }

      // Shuffle learnt moves
      for (let i = learnt.length - 1; i > 0; i--) {
        const j = this.random.nextInt(i + 1);
        [learnt[i], learnt[j]] = [learnt[j], learnt[i]];
      }
      for (let i = 0; i < learnt.length; i++) {
        moves[i] = learnt[i];
      }
    }
    this.setEggMoves(movesets);
  }

  orderDamagingMovesByDamage(): void {
    const movesets = this.getMovesLearnt();
    const allMoves = this.getMoves();
    for (const [_pkmn, moves] of movesets) {
      // Build up a list of damaging moves and their positions
      const damagingMoveIndices: number[] = [];
      const damagingMoves: Move[] = [];
      for (let i = 0; i < moves.length; i++) {
        if (moves[i].level === 0) continue; // Don't reorder evolution move
        const mv = allMoves[moves[i].move];
        if (mv != null && mv.power > 1) {
          damagingMoveIndices.push(i);
          damagingMoves.push(mv);
        }
      }

      // Ties should be sorted randomly, so shuffle the list first.
      for (let i = damagingMoves.length - 1; i > 0; i--) {
        const j = this.random.nextInt(i + 1);
        const tmpMove = damagingMoves[i];
        damagingMoves[i] = damagingMoves[j];
        damagingMoves[j] = tmpMove;
      }

      // Sort the damaging moves by power
      damagingMoves.sort(
        (a, b) => a.power * a.hitCount - b.power * b.hitCount
      );

      // Reassign damaging moves in the ordered positions
      for (let i = 0; i < damagingMoves.length; i++) {
        moves[damagingMoveIndices[i]].move = damagingMoves[i].number;
      }
    }

    // Done, save
    this.setMovesLearnt(movesets);
  }

  metronomeOnlyMode(): void {
    // movesets
    const movesets = this.getMovesLearnt();

    const metronomeML = new MoveLearnt();
    metronomeML.level = 1;
    metronomeML.move = Moves.metronome;

    for (const ms of movesets.values()) {
      if (ms != null && ms.length > 0) {
        ms.length = 0;
        ms.push(metronomeML);
      }
    }

    this.setMovesLearnt(movesets);

    // trainers - run this to remove all custom non-Metronome moves
    const trainers = this.getTrainers();

    for (const t of trainers) {
      for (const tpk of t.pokemon) {
        tpk.resetMoves = true;
      }
    }

    this.setTrainers(trainers, false);

    // tms
    const tmMoves = this.getTMMoves();

    for (let i = 0; i < tmMoves.length; i++) {
      tmMoves[i] = Moves.metronome;
    }

    this.setTMMoves(tmMoves);

    // movetutors
    if (this.hasMoveTutors()) {
      const mtMoves = this.getMoveTutorMoves();

      for (let i = 0; i < mtMoves.length; i++) {
        mtMoves[i] = Moves.metronome;
      }

      this.setMoveTutorMoves(mtMoves);
    }

    // move tweaks
    const moveData = this.getMoves();

    const metronomeMove = moveData[Moves.metronome];
    if (metronomeMove != null) {
      metronomeMove.pp = 40;
    }

    const hms = this.getHMMoves();

    for (const hm of hms) {
      const thisHM = moveData[hm];
      if (thisHM != null) {
        thisHM.pp = 0;
      }
    }
  }

  abstract supportsFourStartingMoves(): boolean;

  abstract getStaticPokemon(): StaticEncounter[];
  abstract setStaticPokemon(staticPokemon: StaticEncounter[]): boolean;
  randomizeStaticPokemon(settings: Settings): void {
    const swapLegendaries = settings.staticPokemonMod === StaticPokemonMod.RANDOM_MATCHING;
    const similarStrength = settings.staticPokemonMod === StaticPokemonMod.SIMILAR_STRENGTH;
    const limitMGL = settings.limitMainGameLegendaries;
    const limit600 = settings.limit600;
    const allowAltFormes = settings.allowStaticAltFormes;
    const banIrregularAltFormes = settings.banIrregularAltFormes;
    const swapMegaEvos = settings.swapStaticMegaEvos;
    const abilitiesAreRandomized = settings.abilitiesMod === AbilitiesMod.RANDOMIZE;
    const levelModifier = settings.staticLevelModified ? settings.staticLevelModifier : 0;
    const correctStaticMusic = settings.correctStaticMusic;
    this.checkPokemonRestrictions();
    const currentStaticPokemon = this.getStaticPokemon();
    const replacements: StaticEncounter[] = [];
    const banned: Pokemon[] = [...this.bannedForStaticPokemon(), ...this.getBannedFormesForPlayerPokemon()];
    if (!abilitiesAreRandomized) banned.push(...this.getAbilityDependentFormes());
    if (banIrregularAltFormes) banned.push(...this.getIrregularFormes());
    const reallySwapMegaEvos = this.forceSwapStaticMegaEvos() || swapMegaEvos;
    const specialMusicStaticChanges = new Map<number, number>();
    let changeMusicStatics: number[] = [];
    if (correctStaticMusic) changeMusicStatics = this.getSpecialMusicStatics();
    const removeFromArray = (arr: Pokemon[], item: Pokemon) => { const i = arr.indexOf(item); if (i >= 0) arr.splice(i, 1); };
    const removeAllFromArray = (arr: Pokemon[], items: Pokemon[]) => { for (const item of items) removeFromArray(arr, item); };

    if (swapLegendaries) {
      let legendariesLeft = [...this.onlyLegendaryList];
      if (allowAltFormes) { legendariesLeft.push(...this.onlyLegendaryAltsList); legendariesLeft = legendariesLeft.filter(pk => !pk.actuallyCosmetic); }
      let nonlegsLeft = [...this.noLegendaryList];
      if (allowAltFormes) { nonlegsLeft.push(...this.noLegendaryAltsList); nonlegsLeft = nonlegsLeft.filter(pk => !pk.actuallyCosmetic); }
      const ultraBeastsLeft = [...this.ultraBeastList];
      removeAllFromArray(legendariesLeft, banned); removeAllFromArray(nonlegsLeft, banned); removeAllFromArray(ultraBeastsLeft, banned);
      const legendariesPool = [...legendariesLeft]; const nonlegsPool = [...nonlegsLeft]; const ultraBeastsPool = [...ultraBeastsLeft];

      for (const old of currentStaticPokemon) {
        const ns = this.cloneStaticEncounter(old);
        let newPK: Pokemon;
        if (old.pkmn.isLegendary()) {
          if (reallySwapMegaEvos && old.canMegaEvolve()) { newPK = this.getMegaEvoPokemon(this.onlyLegendaryList, legendariesLeft, ns); }
          else if (old.restrictedPool) { newPK = this.getRestrictedStaticPokemon(legendariesPool, legendariesLeft, old); }
          else { newPK = legendariesLeft.splice(this.random.nextInt(legendariesLeft.length), 1)[0]; }
          this.setPokemonAndFormeForStaticEncounter(ns, newPK);
          if (legendariesLeft.length === 0) legendariesLeft.push(...legendariesPool);
        } else if (this.ultraBeastList.includes(old.pkmn)) {
          if (old.restrictedPool) { newPK = this.getRestrictedStaticPokemon(ultraBeastsPool, ultraBeastsLeft, old); }
          else { newPK = ultraBeastsLeft.splice(this.random.nextInt(ultraBeastsLeft.length), 1)[0]; }
          this.setPokemonAndFormeForStaticEncounter(ns, newPK);
          if (ultraBeastsLeft.length === 0) ultraBeastsLeft.push(...ultraBeastsPool);
        } else {
          if (reallySwapMegaEvos && old.canMegaEvolve()) { newPK = this.getMegaEvoPokemon(this.noLegendaryList, nonlegsLeft, ns); }
          else if (old.restrictedPool) { newPK = this.getRestrictedStaticPokemon(nonlegsPool, nonlegsLeft, old); }
          else { newPK = nonlegsLeft.splice(this.random.nextInt(nonlegsLeft.length), 1)[0]; }
          this.setPokemonAndFormeForStaticEncounter(ns, newPK);
          if (nonlegsLeft.length === 0) nonlegsLeft.push(...nonlegsPool);
        }
        replacements.push(ns);
        if (changeMusicStatics.includes(old.pkmn.number)) specialMusicStaticChanges.set(old.pkmn.number, newPK.number);
      }
    } else if (similarStrength) {
      const exclCosmetics = this.mainPokemonListInclFormes.filter(pk => !pk.actuallyCosmetic);
      const pokemonLeft = [...(!allowAltFormes ? this.mainPokemonList : exclCosmetics)];
      removeAllFromArray(pokemonLeft, banned);
      const pokemonPool = [...pokemonLeft];
      const mainGameLegendaries = this.getMainGameLegendaries();
      for (const old of currentStaticPokemon) {
        const ns = this.cloneStaticEncounter(old);
        let newPK: Pokemon;
        let oldPK = old.pkmn;
        if (old.forme > 0) oldPK = this.getAltFormeOfPokemon(oldPK, old.forme);
        const oldBST = oldPK.bstForPowerLevels();
        if (oldBST >= 600 && limit600) {
          if (reallySwapMegaEvos && old.canMegaEvolve()) { newPK = this.getMegaEvoPokemon(this.mainPokemonList, pokemonLeft, ns); }
          else if (old.restrictedPool) { newPK = this.getRestrictedStaticPokemon(pokemonPool, pokemonLeft, old); }
          else { newPK = pokemonLeft.splice(this.random.nextInt(pokemonLeft.length), 1)[0]; }
          this.setPokemonAndFormeForStaticEncounter(ns, newPK);
        } else {
          const limitBST = oldPK.baseForme == null ? limitMGL && mainGameLegendaries.includes(oldPK.number) : limitMGL && mainGameLegendaries.includes(oldPK.baseForme.number);
          if (reallySwapMegaEvos && old.canMegaEvolve()) {
            let meLeft = this.megaEvolutionsList.filter(m => m.method === 1).map(m => m.from).filter((p, i, a) => a.indexOf(p) === i).filter(p => pokemonLeft.includes(p));
            if (meLeft.length === 0) meLeft = this.megaEvolutionsList.filter(m => m.method === 1).map(m => m.from).filter((p, i, a) => a.indexOf(p) === i).filter(p => this.mainPokemonList.includes(p));
            newPK = this.pickStaticPowerLvlReplacement(meLeft, oldPK, true, limitBST);
            ns.heldItem = newPK.megaEvolutionsFrom[this.random.nextInt(newPK.megaEvolutionsFrom.length)].argument;
          } else if (old.restrictedPool) {
            let rp = pokemonLeft.filter(pk => old.restrictedList.includes(pk));
            if (rp.length === 0) rp = pokemonPool.filter(pk => old.restrictedList.includes(pk));
            newPK = this.pickStaticPowerLvlReplacement(rp, oldPK, false, limitBST);
          } else {
            newPK = this.pickStaticPowerLvlReplacement(pokemonLeft, oldPK, true, limitBST);
          }
          removeFromArray(pokemonLeft, newPK);
          this.setPokemonAndFormeForStaticEncounter(ns, newPK);
        }
        if (pokemonLeft.length === 0) pokemonLeft.push(...pokemonPool);
        replacements.push(ns);
        if (changeMusicStatics.includes(old.pkmn.number)) specialMusicStaticChanges.set(old.pkmn.number, newPK.number);
      }
    } else {
      const exclCosmetics = this.mainPokemonListInclFormes.filter(pk => !pk.actuallyCosmetic);
      const pokemonLeft = [...(!allowAltFormes ? this.mainPokemonList : exclCosmetics)];
      removeAllFromArray(pokemonLeft, banned);
      const pokemonPool = [...pokemonLeft];
      for (const old of currentStaticPokemon) {
        const ns = this.cloneStaticEncounter(old);
        let newPK: Pokemon;
        if (reallySwapMegaEvos && old.canMegaEvolve()) { newPK = this.getMegaEvoPokemon(this.mainPokemonList, pokemonLeft, ns); }
        else if (old.restrictedPool) { newPK = this.getRestrictedStaticPokemon(pokemonPool, pokemonLeft, old); }
        else { newPK = pokemonLeft.splice(this.random.nextInt(pokemonLeft.length), 1)[0]; }
        removeFromArray(pokemonLeft, newPK);
        this.setPokemonAndFormeForStaticEncounter(ns, newPK);
        if (pokemonLeft.length === 0) pokemonLeft.push(...pokemonPool);
        replacements.push(ns);
        if (changeMusicStatics.includes(old.pkmn.number)) specialMusicStaticChanges.set(old.pkmn.number, newPK.number);
      }
    }

    if (levelModifier !== 0) {
      for (const se of replacements) {
        if (!se.isEgg) {
          se.level = Math.min(100, Math.round(se.level * (1 + levelModifier / 100.0)));
          se.maxLevel = Math.min(100, Math.round(se.maxLevel * (1 + levelModifier / 100.0)));
          for (const ls of se.linkedEncounters) {
            if (!ls.isEgg) {
              ls.level = Math.min(100, Math.round(ls.level * (1 + levelModifier / 100.0)));
              ls.maxLevel = Math.min(100, Math.round(ls.maxLevel * (1 + levelModifier / 100.0)));
            }
          }
        }
      }
    }
    if (specialMusicStaticChanges.size > 0) this.applyCorrectStaticMusic(specialMusicStaticChanges);
    this.setStaticPokemon(replacements);
  }

  abstract canChangeStaticPokemon(): boolean;
  abstract hasStaticAltFormes(): boolean;
  onlyChangeStaticLevels(settings: Settings): void {
    const levelModifier = settings.staticLevelModifier;

    const currentStaticPokemon = this.getStaticPokemon();
    for (const se of currentStaticPokemon) {
      if (!se.isEgg) {
        se.level = Math.min(100, Math.round(se.level * (1 + levelModifier / 100.0)));
        for (const linkedStatic of se.linkedEncounters) {
          if (!linkedStatic.isEgg) {
            linkedStatic.level = Math.min(100, Math.round(linkedStatic.level * (1 + levelModifier / 100.0)));
          }
        }
      }
      this.setPokemonAndFormeForStaticEncounter(se, se.pkmn);
    }
    this.setStaticPokemon(currentStaticPokemon);
  }
  abstract hasMainGameLegendaries(): boolean;
  abstract getMainGameLegendaries(): number[];
  abstract getSpecialMusicStatics(): number[];
  abstract applyCorrectStaticMusic(
    specialMusicStaticChanges: Map<number, number>
  ): void;
  abstract hasStaticMusicFix(): boolean;

  abstract getTotemPokemon(): TotemPokemon[];
  abstract setTotemPokemon(totemPokemon: TotemPokemon[]): void;
  abstract randomizeTotemPokemon(settings: Settings): void;

  abstract getTMMoves(): number[];
  abstract getHMMoves(): number[];
  abstract setTMMoves(moveIndexes: number[]): void;
  randomizeTMMoves(settings: Settings): void {
    const noBroken = settings.blockBrokenTMMoves;
    const preserveField = settings.keepFieldMoveTMs;
    const goodDamagingPercentage = settings.tmsForceGoodDamaging
      ? settings.tmsGoodDamagingPercent / 100.0
      : 0;

    const tmCount = this.getTMCount();
    const allMoves = this.getMoves();
    const hms = this.getHMMoves();
    const oldTMs = this.getTMMoves();

    const banned = new Set<number>(noBroken ? this.getGameBreakingMoves() : []);
    for (const b of this.getMovesBannedFromLevelup()) banned.add(b);
    for (const il of this.getIllegalMoves()) banned.add(il);

    // field moves?
    const fieldMoves = this.getFieldMoves();
    let preservedFieldMoveCount = 0;

    if (preserveField) {
      const existingFieldTMs = oldTMs.filter((tm) => fieldMoves.includes(tm));
      preservedFieldMoveCount = existingFieldTMs.length;
      for (const fm of existingFieldTMs) banned.add(fm);
    }

    // Determine which moves are pickable
    const usableMoves: Move[] = [];
    const usableDamagingMoves: Move[] = [];

    for (let i = 1; i < allMoves.length; i++) {
      const mv = allMoves[i];
      if (mv == null) continue;
      if (
        GlobalConstants.bannedRandomMoves[mv.number] ||
        GlobalConstants.zMoves.includes(mv.number) ||
        hms.includes(mv.number) ||
        banned.has(mv.number)
      ) {
        continue;
      }
      usableMoves.push(mv);
      if (
        !GlobalConstants.bannedForDamagingMove[mv.number] &&
        mv.isGoodDamaging(this.perfectAccuracy)
      ) {
        usableDamagingMoves.push(mv);
      }
    }

    // pick (tmCount - preservedFieldMoveCount) moves
    const pickedMoves: number[] = [];
    let goodDamagingLeft = Math.round(
      goodDamagingPercentage * (tmCount - preservedFieldMoveCount)
    );

    for (let i = 0; i < tmCount - preservedFieldMoveCount; i++) {
      let chosenMove: Move;
      if (goodDamagingLeft > 0 && usableDamagingMoves.length > 0) {
        const idx = this.random.nextInt(usableDamagingMoves.length);
        chosenMove = usableDamagingMoves[idx];
      } else {
        const idx = this.random.nextInt(usableMoves.length);
        chosenMove = usableMoves[idx];
      }
      pickedMoves.push(chosenMove.number);
      // Remove from both lists
      const uIdx = usableMoves.indexOf(chosenMove);
      if (uIdx >= 0) usableMoves.splice(uIdx, 1);
      const dIdx = usableDamagingMoves.indexOf(chosenMove);
      if (dIdx >= 0) usableDamagingMoves.splice(dIdx, 1);
      goodDamagingLeft--;
    }

    // shuffle picked moves to avoid bias from goodDamagingPercentage
    this.shuffleArray(pickedMoves);

    // distribute as TMs
    let pickedMoveIndex = 0;
    const newTMs: number[] = [];

    for (let i = 0; i < tmCount; i++) {
      if (preserveField && fieldMoves.includes(oldTMs[i])) {
        newTMs.push(oldTMs[i]);
      } else {
        newTMs.push(pickedMoves[pickedMoveIndex++]);
      }
    }

    this.setTMMoves(newTMs);
  }
  abstract getTMCount(): number;
  abstract getHMCount(): number;
  abstract getTMHMCompatibility(): Map<Pokemon, boolean[]>;
  abstract setTMHMCompatibility(compatData: Map<Pokemon, boolean[]>): void;
  randomizeTMHMCompatibility(settings: Settings): void {
    const preferSameType =
      settings.tmsHmsCompatibilityMod === TMsHMsCompatibilityMod.RANDOM_PREFER_TYPE;
    const followEvolutions = settings.tmsFollowEvolutions;

    // Get current compatibility
    // increase HM chances if required early on
    const requiredEarlyOn = this.getEarlyRequiredHMMoves();
    const compat = this.getTMHMCompatibility();
    const tmHMs: number[] = [...this.getTMMoves(), ...this.getHMMoves()];

    if (followEvolutions) {
      this.copyUpEvolutionsHelper4(
        (pk: Pokemon) =>
          this.randomizePokemonMoveCompatibility(
            pk,
            compat.get(pk)!,
            tmHMs,
            requiredEarlyOn,
            preferSameType
          ),
        (evFrom: Pokemon, evTo: Pokemon, _toMonIsFinalEvo: boolean) =>
          this.copyPokemonMoveCompatibilityUpEvolutions(
            evFrom,
            evTo,
            compat.get(evFrom)!,
            compat.get(evTo)!,
            tmHMs,
            preferSameType
          ),
        null,
        true
      );
    } else {
      for (const [pk, flags] of compat) {
        this.randomizePokemonMoveCompatibility(
          pk,
          flags,
          tmHMs,
          requiredEarlyOn,
          preferSameType
        );
      }
    }

    // Set the new compatibility
    this.setTMHMCompatibility(compat);
  }

  private randomizePokemonMoveCompatibility(
    pkmn: Pokemon,
    moveCompatibilityFlags: boolean[],
    moveIDs: number[],
    prioritizedMoves: number[],
    preferSameType: boolean
  ): void {
    const moveData = this.getMoves();
    for (let i = 1; i <= moveIDs.length; i++) {
      const move = moveIDs[i - 1];
      const mv = moveData[move]!;
      const probability = this.getMoveCompatibilityProbability(
        pkmn,
        mv,
        prioritizedMoves.includes(move),
        preferSameType
      );
      moveCompatibilityFlags[i] = this.random.nextDouble() < probability;
    }
  }

  private copyPokemonMoveCompatibilityUpEvolutions(
    evFrom: Pokemon,
    evTo: Pokemon,
    prevCompatibilityFlags: boolean[],
    toCompatibilityFlags: boolean[],
    moveIDs: number[],
    preferSameType: boolean
  ): void {
    const moveData = this.getMoves();
    for (let i = 1; i <= moveIDs.length; i++) {
      if (!prevCompatibilityFlags[i]) {
        // Slight chance to gain TM/HM compatibility for a move if not learned by an earlier evolution step
        // Without prefer same type: 25% chance
        // With prefer same type:    10% chance, 90% chance for a type new to this evolution
        const move = moveIDs[i - 1];
        const mv = moveData[move]!;
        let probability = 0.25;
        if (preferSameType) {
          probability = 0.1;
          if (
            (evTo.primaryType === mv.type &&
              evTo.primaryType !== evFrom.primaryType &&
              evTo.primaryType !== evFrom.secondaryType) ||
            (evTo.secondaryType != null &&
              evTo.secondaryType === mv.type &&
              evTo.secondaryType !== evFrom.secondaryType &&
              evTo.secondaryType !== evFrom.primaryType)
          ) {
            probability = 0.9;
          }
        }
        toCompatibilityFlags[i] = this.random.nextDouble() < probability;
      } else {
        toCompatibilityFlags[i] = prevCompatibilityFlags[i];
      }
    }
  }

  private getMoveCompatibilityProbability(
    pkmn: Pokemon,
    mv: Move,
    requiredEarlyOn: boolean,
    preferSameType: boolean
  ): number {
    let probability = 0.5;
    if (preferSameType) {
      if (
        pkmn.primaryType === mv.type ||
        (pkmn.secondaryType != null && pkmn.secondaryType === mv.type)
      ) {
        probability = 0.9;
      } else if (mv.type != null && mv.type === Type.NORMAL) {
        probability = 0.5;
      } else {
        probability = 0.25;
      }
    }
    if (requiredEarlyOn) {
      probability = Math.min(1.0, probability * 1.8);
    }
    return probability;
  }

  fullTMHMCompatibility(): void {
    const compat = this.getTMHMCompatibility();
    for (const flags of compat.values()) {
      for (let i = 1; i < flags.length; i++) {
        flags[i] = true;
      }
    }
    this.setTMHMCompatibility(compat);
  }

  ensureTMCompatSanity(): void {
    // if a pokemon learns a move in its moveset
    // and there is a TM of that move, make sure
    // that TM can be learned.
    const compat = this.getTMHMCompatibility();
    const movesets = this.getMovesLearnt();
    const tmMoves = this.getTMMoves();
    for (const [pkmn, pkmnCompat] of compat) {
      const moveset = movesets.get(pkmn.number);
      if (moveset) {
        for (const ml of moveset) {
          const tmIndex = tmMoves.indexOf(ml.move);
          if (tmIndex >= 0) {
            pkmnCompat[tmIndex + 1] = true;
          }
        }
      }
    }
    this.setTMHMCompatibility(compat);
  }

  ensureTMEvolutionSanity(): void {
    const compat = this.getTMHMCompatibility();
    // Don't do anything with the base, just copy upwards to ensure later evolutions retain learn compatibility
    this.copyUpEvolutionsHelper4(
      (_pk: Pokemon) => {},
      (evFrom: Pokemon, evTo: Pokemon, _toMonIsFinalEvo: boolean) => {
        const fromCompat = compat.get(evFrom)!;
        const toCompat = compat.get(evTo)!;
        for (let i = 1; i < toCompat.length; i++) {
          toCompat[i] = toCompat[i] || fromCompat[i];
        }
      },
      null,
      true
    );
    this.setTMHMCompatibility(compat);
  }

  fullHMCompatibility(): void {
    const compat = this.getTMHMCompatibility();
    const tmCount = this.getTMCount();
    for (const flags of compat.values()) {
      for (let i = tmCount + 1; i < flags.length; i++) {
        flags[i] = true;
      }
    }
    // Set the new compatibility
    this.setTMHMCompatibility(compat);
  }

  copyTMCompatibilityToCosmeticFormes(): void {
    const compat = this.getTMHMCompatibility();
    for (const [pkmn, flags] of compat) {
      if (pkmn.actuallyCosmetic) {
        const baseFlags = compat.get(pkmn.baseForme!)!;
        for (let i = 1; i < flags.length; i++) {
          flags[i] = baseFlags[i];
        }
      }
    }
    this.setTMHMCompatibility(compat);
  }
  abstract hasMoveTutors(): boolean;
  abstract getMoveTutorMoves(): number[];
  abstract setMoveTutorMoves(moves: number[]): void;
  randomizeMoveTutorMoves(settings: Settings): void {
    if (!this.hasMoveTutors()) return;

    const noBroken = settings.blockBrokenTutorMoves;
    const preserveField = settings.keepFieldMoveTutors;
    const goodDamagingPercentage = settings.tutorsForceGoodDamaging
      ? settings.tutorsGoodDamagingPercent / 100.0
      : 0;

    const allMoves = this.getMoves();
    const tms = this.getTMMoves();
    const oldMTs = this.getMoveTutorMoves();
    const mtCount = oldMTs.length;
    const hms = this.getHMMoves();

    const banned = new Set<number>(noBroken ? this.getGameBreakingMoves() : []);
    for (const b of this.getMovesBannedFromLevelup()) banned.add(b);
    for (const il of this.getIllegalMoves()) banned.add(il);

    const fieldMoves = this.getFieldMoves();
    let preservedFieldMoveCount = 0;
    if (preserveField) {
      const existingFieldTutors = oldMTs.filter((mt) => fieldMoves.includes(mt));
      preservedFieldMoveCount = existingFieldTutors.length;
      for (const fm of existingFieldTutors) banned.add(fm);
    }

    const usableMoves: Move[] = [];
    const usableDamagingMoves: Move[] = [];

    for (let i = 1; i < allMoves.length; i++) {
      const mv = allMoves[i];
      if (mv == null) continue;
      if (
        GlobalConstants.bannedRandomMoves[mv.number] ||
        GlobalConstants.zMoves.includes(mv.number) ||
        tms.includes(mv.number) ||
        hms.includes(mv.number) ||
        banned.has(mv.number)
      ) {
        continue;
      }
      usableMoves.push(mv);
      if (
        !GlobalConstants.bannedForDamagingMove[mv.number] &&
        mv.isGoodDamaging(this.perfectAccuracy)
      ) {
        usableDamagingMoves.push(mv);
      }
    }

    const pickedMoves: number[] = [];
    let goodDamagingLeft = Math.round(
      goodDamagingPercentage * (mtCount - preservedFieldMoveCount)
    );

    for (let i = 0; i < mtCount - preservedFieldMoveCount; i++) {
      let chosenMove: Move;
      if (goodDamagingLeft > 0 && usableDamagingMoves.length > 0) {
        chosenMove = usableDamagingMoves[this.random.nextInt(usableDamagingMoves.length)];
      } else {
        chosenMove = usableMoves[this.random.nextInt(usableMoves.length)];
      }
      pickedMoves.push(chosenMove.number);
      const uIdx = usableMoves.indexOf(chosenMove);
      if (uIdx >= 0) usableMoves.splice(uIdx, 1);
      const dIdx = usableDamagingMoves.indexOf(chosenMove);
      if (dIdx >= 0) usableDamagingMoves.splice(dIdx, 1);
      goodDamagingLeft--;
    }

    this.shuffleArray(pickedMoves);

    let pickedMoveIndex = 0;
    const newMTs: number[] = [];
    for (const oldMT of oldMTs) {
      if (preserveField && fieldMoves.includes(oldMT)) {
        newMTs.push(oldMT);
      } else {
        newMTs.push(pickedMoves[pickedMoveIndex++]);
      }
    }

    this.setMoveTutorMoves(newMTs);
  }
  abstract getMoveTutorCompatibility(): Map<Pokemon, boolean[]>;
  abstract setMoveTutorCompatibility(
    compatData: Map<Pokemon, boolean[]>
  ): void;
  randomizeMoveTutorCompatibility(settings: Settings): void {
    const preferSameType = settings.moveTutorsCompatibilityMod === MoveTutorsCompatibilityMod.RANDOM_PREFER_TYPE;
    const followEvolutions = settings.tutorFollowEvolutions;

    if (!this.hasMoveTutors()) return;

    const compat = this.getMoveTutorCompatibility();
    const mts = this.getMoveTutorMoves();

    const priorityTutors: number[] = [];

    if (followEvolutions) {
      this.copyUpEvolutionsHelper4(
        (pk: Pokemon) =>
          this.randomizePokemonMoveCompatibility(
            pk,
            compat.get(pk)!,
            mts,
            priorityTutors,
            preferSameType
          ),
        (evFrom: Pokemon, evTo: Pokemon, _toMonIsFinalEvo: boolean) =>
          this.copyPokemonMoveCompatibilityUpEvolutions(
            evFrom,
            evTo,
            compat.get(evFrom)!,
            compat.get(evTo)!,
            mts,
            preferSameType
          ),
        null,
        true
      );
    } else {
      for (const [pk, flags] of compat) {
        this.randomizePokemonMoveCompatibility(
          pk,
          flags,
          mts,
          priorityTutors,
          preferSameType
        );
      }
    }

    this.setMoveTutorCompatibility(compat);
  }
  abstract fullMoveTutorCompatibility(): void;
  abstract ensureMoveTutorCompatSanity(): void;
  abstract ensureMoveTutorEvolutionSanity(): void;

  abstract copyMoveTutorCompatibilityToCosmeticFormes(): void;
  abstract canChangeTrainerText(): boolean;
  abstract getTrainerNames(): string[];
  abstract setTrainerNames(trainerNames: string[]): void;
  abstract trainerNameMode(): TrainerNameMode;
  abstract getTCNameLengthsByTrainer(): number[];
  randomizeTrainerNames(settings: Settings): void {
    const customNames = settings.customNames;

    if (!this.canChangeTrainerText()) {
      return;
    }

    // index 0 = singles, 1 = doubles
    const allTrainerNames: string[][] = [[], []];
    const trainerNamesByLength: Map<number, string[]>[] = [new Map(), new Map()];

    const repeatedTrainerNames = ["GRUNT", "EXECUTIVE", "SHADOW", "ADMIN", "GOON", "EMPLOYEE"];

    // Read name lists
    for (const trainername of customNames.getTrainerNames()) {
      const len = this.internalStringLength(trainername);
      if (len <= 10) {
        allTrainerNames[0].push(trainername);
        if (trainerNamesByLength[0].has(len)) {
          trainerNamesByLength[0].get(len)!.push(trainername);
        } else {
          trainerNamesByLength[0].set(len, [trainername]);
        }
      }
    }

    for (const trainername of customNames.getDoublesTrainerNames()) {
      const len = this.internalStringLength(trainername);
      if (len <= 10) {
        allTrainerNames[1].push(trainername);
        if (trainerNamesByLength[1].has(len)) {
          trainerNamesByLength[1].get(len)!.push(trainername);
        } else {
          trainerNamesByLength[1].set(len, [trainername]);
        }
      }
    }

    // Get the current trainer names data
    const currentTrainerNames = this.getTrainerNames();
    if (currentTrainerNames.length === 0) {
      // RBY have no trainer names
      return;
    }
    const mode = this.trainerNameMode();
    const maxLength = this.maxTrainerNameLength();
    const totalMaxLength = this.maxSumOfTrainerNameLengths();

    let success = false;
    let tries = 0;

    // Init the translation map and new list
    const translation = new Map<string, string>();
    let newTrainerNames: string[] = [];
    const tcNameLengths = this.getTCNameLengthsByTrainer();

    // loop until we successfully pick names that fit
    while (!success && tries < 10000) {
      success = true;
      translation.clear();
      newTrainerNames = [];
      let totalLength = 0;

      let tnIndex = -1;
      for (const trainerName of currentTrainerNames) {
        tnIndex++;
        if (translation.has(trainerName) && !repeatedTrainerNames.includes(trainerName.toUpperCase())) {
          const translated = translation.get(trainerName)!;
          newTrainerNames.push(translated);
          totalLength += this.internalStringLength(translated);
        } else {
          const idx = trainerName.includes("&") ? 1 : 0;
          let pickFrom: string[] | undefined = allTrainerNames[idx];
          const intStrLen = this.internalStringLength(trainerName);
          if (mode === TrainerNameMode.SAME_LENGTH) {
            pickFrom = trainerNamesByLength[idx].get(intStrLen);
          }
          let changeTo = trainerName;
          let ctl = intStrLen;
          if (pickFrom != null && pickFrom.length > 0 && intStrLen > 0) {
            let innerTries = 0;
            changeTo = pickFrom[this.cosmeticRandom.nextInt(pickFrom.length)];
            ctl = this.internalStringLength(changeTo);
            while (
              (mode === TrainerNameMode.MAX_LENGTH && ctl > maxLength) ||
              (mode === TrainerNameMode.MAX_LENGTH_WITH_CLASS &&
                ctl + (tcNameLengths[tnIndex] ?? 0) > maxLength)
            ) {
              innerTries++;
              if (innerTries === 100) {
                changeTo = trainerName;
                ctl = intStrLen;
                break;
              }
              changeTo = pickFrom[this.cosmeticRandom.nextInt(pickFrom.length)];
              ctl = this.internalStringLength(changeTo);
            }
          }
          translation.set(trainerName, changeTo);
          newTrainerNames.push(changeTo);
          totalLength += ctl;
        }

        if (totalLength > totalMaxLength) {
          success = false;
          tries++;
          break;
        }
      }
    }

    if (!success) {
      throw new RandomizationException(
        "Could not randomize trainer names in a reasonable amount of attempts." +
          "\nPlease add some shorter names to your custom trainer names.",
      );
    }

    // Done choosing, save
    this.setTrainerNames(newTrainerNames);
  }

  abstract getTrainerClassNames(): string[];
  abstract setTrainerClassNames(trainerClassNames: string[]): void;
  abstract fixedTrainerClassNamesLength(): boolean;
  randomizeTrainerClassNames(settings: Settings): void {
    const customNames = settings.customNames;

    if (!this.canChangeTrainerText()) {
      return;
    }

    // index 0 = singles, index 1 = doubles
    const allTrainerClasses: string[][] = [[], []];
    const trainerClassesByLength: Map<number, string[]>[] = [new Map(), new Map()];

    // Read names data
    for (const trainerClassName of customNames.getTrainerClasses()) {
      allTrainerClasses[0].push(trainerClassName);
      const len = this.internalStringLength(trainerClassName);
      if (trainerClassesByLength[0].has(len)) {
        trainerClassesByLength[0].get(len)!.push(trainerClassName);
      } else {
        trainerClassesByLength[0].set(len, [trainerClassName]);
      }
    }

    for (const trainerClassName of customNames.getDoublesTrainerClasses()) {
      allTrainerClasses[1].push(trainerClassName);
      const len = this.internalStringLength(trainerClassName);
      if (trainerClassesByLength[1].has(len)) {
        trainerClassesByLength[1].get(len)!.push(trainerClassName);
      } else {
        trainerClassesByLength[1].set(len, [trainerClassName]);
      }
    }

    // Get the current trainer names data
    const currentClassNames = this.getTrainerClassNames();
    const mustBeSameLength = this.fixedTrainerClassNamesLength();
    const maxLength = this.maxTrainerClassNameLength();

    // Init the translation map and new list
    const translation = new Map<string, string>();
    const newClassNames: string[] = [];

    const numTrainerClasses = currentClassNames.length;
    const doublesClasses = this.getDoublesTrainerClasses();

    // Start choosing
    for (let i = 0; i < numTrainerClasses; i++) {
      const trainerClassName = currentClassNames[i];
      if (translation.has(trainerClassName)) {
        newClassNames.push(translation.get(trainerClassName)!);
      } else {
        const idx = doublesClasses.includes(i) ? 1 : 0;
        let pickFrom: string[] | undefined = allTrainerClasses[idx];
        const intStrLen = this.internalStringLength(trainerClassName);
        if (mustBeSameLength) {
          pickFrom = trainerClassesByLength[idx].get(intStrLen);
        }
        let changeTo = trainerClassName;
        if (pickFrom != null && pickFrom.length > 0) {
          changeTo = pickFrom[this.cosmeticRandom.nextInt(pickFrom.length)];
          let safetyCounter = 0;
          while (changeTo.length > maxLength && safetyCounter < 100) {
            changeTo = pickFrom[this.cosmeticRandom.nextInt(pickFrom.length)];
            safetyCounter++;
          }
          if (changeTo.length > maxLength) {
            changeTo = trainerClassName;
          }
        }
        translation.set(trainerClassName, changeTo);
        newClassNames.push(changeTo);
      }
    }

    // Done choosing, save
    this.setTrainerClassNames(newClassNames);
  }

  abstract getDoublesTrainerClasses(): number[];

  abstract getAllowedItems(): ItemList;
  abstract getNonBadItems(): ItemList;
  abstract getEvolutionItems(): number[];
  abstract getUniqueNoSellItems(): number[];
  abstract getRegularShopItems(): number[];
  abstract getOPShopItems(): number[];
  abstract getItemNames(): string[];

  abstract getRequiredFieldTMs(): number[];
  abstract getCurrentFieldTMs(): number[];
  abstract setFieldTMs(fieldTMs: number[]): void;
  abstract getRegularFieldItems(): number[];
  abstract setRegularFieldItems(items: number[]): void;
  shuffleFieldItems(): void {
    const currentItems = this.getRegularFieldItems();
    const currentTMs = this.getCurrentFieldTMs();

    this.shuffleArray(currentItems);
    this.shuffleArray(currentTMs);

    this.setRegularFieldItems(currentItems);
    this.setFieldTMs(currentTMs);
  }

  randomizeFieldItems(settings: Settings): void {
    const banBadItems = settings.banBadRandomFieldItems;
    const distributeItemsControl =
      settings.fieldItemsMod === FieldItemsMod.RANDOM_EVEN;
    const uniqueItems = !settings.balanceShopPrices;

    const possibleItems = banBadItems
      ? this.getNonBadItems().copy()
      : this.getAllowedItems().copy();
    const currentItems = this.getRegularFieldItems();
    const currentTMs = this.getCurrentFieldTMs();
    const requiredTMs = this.getRequiredFieldTMs();
    const uniqueNoSellItems = this.getUniqueNoSellItems();

    const fieldItemCount = currentItems.length;
    const fieldTMCount = currentTMs.length;
    const reqTMCount = requiredTMs.length;
    const totalTMCount = this.getTMCount();

    const newItems: number[] = [];
    const newTMs: number[] = [...requiredTMs];

    const rng = () => this.random.nextDouble();

    if (distributeItemsControl) {
      for (let i = 0; i < fieldItemCount; i++) {
        let chosenItem = possibleItems.randomNonTM(rng);
        let iterNum = 0;
        while (
          this.getItemPlacementHistory(chosenItem) >
            this.getItemPlacementAverage() &&
          iterNum < 100
        ) {
          chosenItem = possibleItems.randomNonTM(rng);
          iterNum++;
        }
        newItems.push(chosenItem);
        if (uniqueItems && uniqueNoSellItems.includes(chosenItem)) {
          possibleItems.banSingles(chosenItem);
        } else {
          this.setItemPlacementHistory(chosenItem);
        }
      }
    } else {
      for (let i = 0; i < fieldItemCount; i++) {
        const chosenItem = possibleItems.randomNonTM(rng);
        newItems.push(chosenItem);
        if (uniqueItems && uniqueNoSellItems.includes(chosenItem)) {
          possibleItems.banSingles(chosenItem);
        }
      }
    }

    for (let i = reqTMCount; i < fieldTMCount; i++) {
      while (true) {
        const tm = this.random.nextInt(totalTMCount) + 1;
        if (!newTMs.includes(tm)) {
          newTMs.push(tm);
          break;
        }
      }
    }

    this.shuffleArray(newItems);
    this.shuffleArray(newTMs);

    this.setRegularFieldItems(newItems);
    this.setFieldTMs(newTMs);
  }

  abstract hasShopRandomization(): boolean;

  shuffleShopItems(): void {
    const currentItems = this.getShopItems();
    if (currentItems == null || currentItems.size === 0) return;

    const itemList: number[] = [];
    for (const shop of currentItems.values()) {
      if (shop.items) {
        itemList.push(...shop.items);
      }
    }
    this.shuffleArray(itemList);

    let idx = 0;
    for (const shop of currentItems.values()) {
      if (shop.items) {
        for (let i = 0; i < shop.items.length; i++) {
          shop.items[i] = itemList[idx++];
        }
      }
    }

    this.setShopItems(currentItems);
  }

  randomizeShopItems(settings: Settings): void {
    const banBadItems = settings.banBadRandomShopItems;
    const banRegularShopItems = settings.banRegularShopItems;
    const banOPShopItems = settings.banOPShopItems;
    const balancePrices = settings.balanceShopPrices;
    const placeEvolutionItems = settings.guaranteeEvolutionItems;
    const placeXItems = settings.guaranteeXItems;

    if (this.getShopItems() == null || this.getShopItems().size === 0) return;

    const possibleItems = banBadItems
      ? this.getNonBadItems()
      : this.getAllowedItems();
    if (banRegularShopItems) {
      possibleItems.banSingles(...this.getRegularShopItems());
    }
    if (banOPShopItems) {
      possibleItems.banSingles(...this.getOPShopItems());
    }
    const currentItems = this.getShopItems();

    let shopItemCount = 0;
    for (const shop of currentItems.values()) {
      if (shop.items) {
        shopItemCount += shop.items.length;
      }
    }

    const newItems: number[] = [];
    const newItemsMap = new Map<number, Shop>();
    const rng = () => this.random.nextDouble();
    const guaranteedItems: number[] = [];

    if (placeEvolutionItems) {
      guaranteedItems.push(...this.getEvolutionItems());
    }
    if (placeXItems) {
      guaranteedItems.push(...this.getXItems());
    }

    if (placeEvolutionItems || placeXItems) {
      newItems.push(...guaranteedItems);
      shopItemCount = shopItemCount - newItems.length;

      for (let i = 0; i < shopItemCount; i++) {
        let newItem: number;
        do {
          newItem = possibleItems.randomNonTM(rng);
        } while (newItems.includes(newItem));
        newItems.push(newItem);
      }

      // Guarantee main-game
      const mainGameShops: number[] = [];
      const nonMainGameShops: number[] = [];
      for (const [key, shop] of currentItems) {
        if (shop.isMainGame) {
          mainGameShops.push(key);
        } else {
          nonMainGameShops.push(key);
        }
      }

      // Place items in non-main-game shops; skip over guaranteed items
      this.shuffleArray(newItems);
      for (const shopKey of nonMainGameShops) {
        let j = 0;
        const newShopItems: number[] = [];
        const oldShop = currentItems.get(shopKey)!;
        const oldItems = oldShop.items ?? [];
        for (let _idx = 0; _idx < oldItems.length; _idx++) {
          let item = newItems[j];
          while (guaranteedItems.includes(item)) {
            j++;
            item = newItems[j];
          }
          newShopItems.push(item);
          const removeIdx = newItems.indexOf(item);
          if (removeIdx >= 0) newItems.splice(removeIdx, 1);
        }
        const shop = new Shop(oldShop);
        shop.items = newShopItems;
        newItemsMap.set(shopKey, shop);
      }

      // Place items in main-game shops
      this.shuffleArray(newItems);
      for (const shopKey of mainGameShops) {
        const newShopItems: number[] = [];
        const oldShop = currentItems.get(shopKey)!;
        const oldItems = oldShop.items ?? [];
        for (let _idx = 0; _idx < oldItems.length; _idx++) {
          const item = newItems[0];
          newShopItems.push(item);
          newItems.splice(0, 1);
        }
        const shop = new Shop(oldShop);
        shop.items = newShopItems;
        newItemsMap.set(shopKey, shop);
      }
    } else {
      for (let i = 0; i < shopItemCount; i++) {
        let newItem: number;
        do {
          newItem = possibleItems.randomNonTM(rng);
        } while (newItems.includes(newItem));
        newItems.push(newItem);
      }

      let newItemIdx = 0;
      for (const [key, oldShop] of currentItems) {
        const newShopItems: number[] = [];
        const oldItems = oldShop.items ?? [];
        for (let _idx = 0; _idx < oldItems.length; _idx++) {
          newShopItems.push(newItems[newItemIdx++]);
        }
        const shop = new Shop(oldShop);
        shop.items = newShopItems;
        newItemsMap.set(key, shop);
      }
    }

    this.setShopItems(newItemsMap);
    if (balancePrices) {
      this.setShopPrices();
    }
  }

  abstract getShopItems(): Map<number, Shop>;
  abstract setShopItems(shopItems: Map<number, Shop>): void;
  abstract setShopPrices(): void;

  // Gen1 has no pickup ability; subclasses with pickup override this.
  randomizePickupItems(_settings: Settings): void {
    // no-op by default
  }

  abstract getIngameTrades(): IngameTrade[];
  abstract setIngameTrades(trades: IngameTrade[]): void;

  randomizeIngameTrades(settings: Settings): void {
    const randomizeRequest =
      settings.inGameTradesMod ===
      InGameTradesMod.RANDOMIZE_GIVEN_AND_REQUESTED;
    const randomNickname = settings.randomizeInGameTradesNicknames;
    const randomOT = settings.randomizeInGameTradesOTs;
    const randomStats = settings.randomizeInGameTradesIVs;
    const randomItem = settings.randomizeInGameTradesItems;
    const customNames = settings.customNames;

    this.checkPokemonRestrictions();

    // Process trainer names
    const trainerNames: string[] = [];
    if (randomOT) {
      const maxOT = this.maxTradeOTNameLength();
      for (const trainername of customNames.getTrainerNames()) {
        const len = this.internalStringLength(trainername);
        if (len <= maxOT && !trainerNames.includes(trainername)) {
          trainerNames.push(trainername);
        }
      }
    }

    // Process nicknames
    const nicknames: string[] = [];
    if (randomNickname) {
      const maxNN = this.maxTradeNicknameLength();
      for (const nickname of customNames.getPokemonNicknames()) {
        const len = this.internalStringLength(nickname);
        if (len <= maxNN && !nicknames.includes(nickname)) {
          nicknames.push(nickname);
        }
      }
    }

    // get old trades
    const trades = this.getIngameTrades();
    const usedRequests: Pokemon[] = [];
    const usedGivens: Pokemon[] = [];
    const usedOTs: string[] = [];
    const usedNicknames: string[] = [];
    const possibleItems = this.getAllowedItems();

    const nickCount = nicknames.length;
    const trnameCount = trainerNames.length;

    for (const trade of trades) {
      // pick new given pokemon
      const oldgiven = trade.givenPokemon;
      let given = this.randomPokemon();
      while (usedGivens.includes(given)) {
        given = this.randomPokemon();
      }
      usedGivens.push(given);
      trade.givenPokemon = given;

      // requested pokemon?
      if (oldgiven === trade.requestedPokemon) {
        // preserve trades for the same pokemon
        trade.requestedPokemon = given;
      } else if (randomizeRequest) {
        if (trade.requestedPokemon != null) {
          let request = this.randomPokemon();
          while (usedRequests.includes(request) || request === given) {
            request = this.randomPokemon();
          }
          usedRequests.push(request);
          trade.requestedPokemon = request;
        }
      }

      // nickname?
      if (randomNickname && nickCount > usedNicknames.length) {
        let nickname = nicknames[this.random.nextInt(nickCount)];
        while (usedNicknames.includes(nickname)) {
          nickname = nicknames[this.random.nextInt(nickCount)];
        }
        usedNicknames.push(nickname);
        trade.nickname = nickname;
      } else if (
        trade.nickname.toLowerCase() === oldgiven.name.toLowerCase()
      ) {
        // change the name for sanity
        trade.nickname = trade.givenPokemon.name;
      }

      if (randomOT && trnameCount > usedOTs.length) {
        let ot = trainerNames[this.random.nextInt(trnameCount)];
        while (usedOTs.includes(ot)) {
          ot = trainerNames[this.random.nextInt(trnameCount)];
        }
        usedOTs.push(ot);
        trade.otName = ot;
        trade.otId = this.random.nextInt(65536);
      }

      if (randomStats) {
        const maxIV = this.hasDVs() ? 16 : 32;
        for (let i = 0; i < trade.ivs.length; i++) {
          trade.ivs[i] = this.random.nextInt(maxIV);
        }
      }

      if (randomItem) {
        trade.item = possibleItems.randomItem(
          () => this.random.nextDouble(),
        );
      }
    }

    // things that the game doesn't support should just be ignored
    this.setIngameTrades(trades);
  }

  abstract hasDVs(): boolean;

  abstract removeImpossibleEvolutions(settings: Settings): void;
  abstract makeEvolutionsEasier(settings: Settings): void;
  abstract removeTimeBasedEvolutions(): void;

  abstract getFieldMoves(): number[];
  abstract getEarlyRequiredHMMoves(): number[];

  abstract getROMName(): string;
  abstract getROMCode(): string;
  abstract getSupportLevel(): string;
  abstract getDefaultExtension(): string;
  abstract internalStringLength(s: string): number;
  abstract randomizeIntroPokemon(): void;
  abstract getMascotImage(): Uint8Array | null;
  abstract generationOfPokemon(): number;

  abstract isEffectivenessUpdated(): boolean;

  abstract hasFunctionalFormes(): boolean;

  // -- Move update helpers --

  private updateMovePower(
    moves: (Move | null)[],
    moveNum: number,
    power: number
  ): void {
    const mv = moves[moveNum];
    if (mv != null && mv.power !== power) {
      mv.power = power;
      this.addMoveUpdate(moveNum, 0);
    }
  }

  private updateMovePP(
    moves: (Move | null)[],
    moveNum: number,
    pp: number
  ): void {
    const mv = moves[moveNum];
    if (mv != null && mv.pp !== pp) {
      mv.pp = pp;
      this.addMoveUpdate(moveNum, 1);
    }
  }

  private updateMoveAccuracy(
    moves: (Move | null)[],
    moveNum: number,
    accuracy: number
  ): void {
    const mv = moves[moveNum];
    if (mv != null && Math.abs(mv.hitratio - accuracy) >= 1) {
      mv.hitratio = accuracy;
      this.addMoveUpdate(moveNum, 2);
    }
  }

  private updateMoveType(
    moves: (Move | null)[],
    moveNum: number,
    type: Type
  ): void {
    const mv = moves[moveNum];
    if (mv != null && mv.type !== type) {
      mv.type = type;
      this.addMoveUpdate(moveNum, 3);
    }
  }

  private updateMoveCategory(
    moves: (Move | null)[],
    moveNum: number,
    category: MoveCategory
  ): void {
    const mv = moves[moveNum];
    if (mv != null && mv.category !== category) {
      mv.category = category;
      this.addMoveUpdate(moveNum, 4);
    }
  }

  private addMoveUpdate(moveNum: number, updateType: number): void {
    if (!this.moveUpdates.has(moveNum)) {
      const updateField = [false, false, false, false, false];
      updateField[updateType] = true;
      this.moveUpdates.set(moveNum, updateField);
    } else {
      this.moveUpdates.get(moveNum)![updateType] = true;
    }
  }
}
