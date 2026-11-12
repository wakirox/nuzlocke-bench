import { ExpCurve, expCurveToByte, expCurveFromByte } from "../pokemon/exp-curve";
import { GenRestrictions } from "../pokemon/gen-restrictions";
import { CustomNamesSet } from "./custom-names-set";
import { crc32 } from "../utils/crc32";
import { FileFunctions } from "../utils/file-functions";
import { Version } from "../utils/version";

// ---- Enums ----

export enum BaseStatisticsMod {
  UNCHANGED,
  SHUFFLE,
  RANDOM,
}

export enum ExpCurveMod {
  LEGENDARIES,
  STRONG_LEGENDARIES,
  ALL,
}

export enum AbilitiesMod {
  UNCHANGED,
  RANDOMIZE,
}

export enum StartersMod {
  UNCHANGED,
  CUSTOM,
  COMPLETELY_RANDOM,
  RANDOM_WITH_TWO_EVOLUTIONS,
}

export enum TypesMod {
  UNCHANGED,
  RANDOM_FOLLOW_EVOLUTIONS,
  COMPLETELY_RANDOM,
}

export enum EvolutionsMod {
  UNCHANGED,
  RANDOM,
  RANDOM_EVERY_LEVEL,
}

export enum MovesetsMod {
  UNCHANGED,
  RANDOM_PREFER_SAME_TYPE,
  COMPLETELY_RANDOM,
  METRONOME_ONLY,
}

export enum TrainersMod {
  UNCHANGED,
  RANDOM,
  DISTRIBUTED,
  MAINPLAYTHROUGH,
  TYPE_THEMED,
  TYPE_THEMED_ELITE4_GYMS,
}

export enum WildPokemonMod {
  UNCHANGED,
  RANDOM,
  AREA_MAPPING,
  GLOBAL_MAPPING,
}

export enum WildPokemonRestrictionMod {
  NONE,
  SIMILAR_STRENGTH,
  CATCH_EM_ALL,
  TYPE_THEME_AREAS,
}

export enum StaticPokemonMod {
  UNCHANGED,
  RANDOM_MATCHING,
  COMPLETELY_RANDOM,
  SIMILAR_STRENGTH,
}

export enum TotemPokemonMod {
  UNCHANGED,
  RANDOM,
  SIMILAR_STRENGTH,
}

export enum AllyPokemonMod {
  UNCHANGED,
  RANDOM,
  SIMILAR_STRENGTH,
}

export enum AuraMod {
  UNCHANGED,
  RANDOM,
  SAME_STRENGTH,
}

export enum TMsMod {
  UNCHANGED,
  RANDOM,
}

export enum TMsHMsCompatibilityMod {
  UNCHANGED,
  RANDOM_PREFER_TYPE,
  COMPLETELY_RANDOM,
  FULL,
}

export enum MoveTutorMovesMod {
  UNCHANGED,
  RANDOM,
}

export enum MoveTutorsCompatibilityMod {
  UNCHANGED,
  RANDOM_PREFER_TYPE,
  COMPLETELY_RANDOM,
  FULL,
}

export enum InGameTradesMod {
  UNCHANGED,
  RANDOMIZE_GIVEN,
  RANDOMIZE_GIVEN_AND_REQUESTED,
}

export enum FieldItemsMod {
  UNCHANGED,
  SHUFFLE,
  RANDOM,
  RANDOM_EVEN,
}

export enum ShopItemsMod {
  UNCHANGED,
  SHUFFLE,
  RANDOM,
}

export enum PickupItemsMod {
  UNCHANGED,
  RANDOM,
}

// ---- Helper functions ----

function makeByteSelected(...bools: boolean[]): number {
  if (bools.length > 8) {
    throw new Error("Can't set more than 8 bits in a byte!");
  }
  let initial = 0;
  let state = 1;
  for (const b of bools) {
    initial |= b ? state : 0;
    state *= 2;
  }
  return initial;
}

function restoreState(b: number, index: number): boolean {
  if (index >= 8) {
    throw new Error("Can't read more than 8 bits from a byte!");
  }
  const value = b & 0xff;
  return ((value >> index) & 0x01) === 0x01;
}

function getSetEnum(type: string, ...bools: boolean[]): number {
  let index = -1;
  for (let i = 0; i < bools.length; i++) {
    if (bools[i]) {
      if (index >= 0) {
        throw new Error(`Only one value for ${type} may be chosen!`);
      }
      index = i;
    }
  }
  return index >= 0 ? index : 0;
}

function getEnumValue<T>(values: T[], type: string, ...bools: boolean[]): T {
  const index = getSetEnum(type, ...bools);
  return values[index];
}

function restoreEnum<T>(values: T[], type: string, b: number, ...indices: number[]): T {
  const bools = indices.map((idx) => restoreState(b, idx));
  return getEnumValue(values, type, ...bools);
}

function writeFullInt(out: number[], value: number): void {
  // Big-endian 4 bytes, matching Java's ByteBuffer.putInt
  out.push((value >>> 24) & 0xff);
  out.push((value >>> 16) & 0xff);
  out.push((value >>> 8) & 0xff);
  out.push(value & 0xff);
}

function write2ByteInt(out: number[], value: number): void {
  // Little-endian 2 bytes, matching Java's write2ByteInt
  out.push(value & 0xff);
  out.push((value >> 8) & 0xff);
}

// Enum value arrays for use in restoreEnum
const baseStatisticsModValues = [
  BaseStatisticsMod.UNCHANGED,
  BaseStatisticsMod.SHUFFLE,
  BaseStatisticsMod.RANDOM,
];
const expCurveModValues = [
  ExpCurveMod.LEGENDARIES,
  ExpCurveMod.STRONG_LEGENDARIES,
  ExpCurveMod.ALL,
];
const abilitiesModValues = [AbilitiesMod.UNCHANGED, AbilitiesMod.RANDOMIZE];
const startersModValues = [
  StartersMod.UNCHANGED,
  StartersMod.CUSTOM,
  StartersMod.COMPLETELY_RANDOM,
  StartersMod.RANDOM_WITH_TWO_EVOLUTIONS,
];
const typesModValues = [
  TypesMod.UNCHANGED,
  TypesMod.RANDOM_FOLLOW_EVOLUTIONS,
  TypesMod.COMPLETELY_RANDOM,
];
const evolutionsModValues = [
  EvolutionsMod.UNCHANGED,
  EvolutionsMod.RANDOM,
  EvolutionsMod.RANDOM_EVERY_LEVEL,
];
const movesetsModValues = [
  MovesetsMod.UNCHANGED,
  MovesetsMod.RANDOM_PREFER_SAME_TYPE,
  MovesetsMod.COMPLETELY_RANDOM,
  MovesetsMod.METRONOME_ONLY,
];
const trainersModValues = [
  TrainersMod.UNCHANGED,
  TrainersMod.RANDOM,
  TrainersMod.DISTRIBUTED,
  TrainersMod.MAINPLAYTHROUGH,
  TrainersMod.TYPE_THEMED,
  TrainersMod.TYPE_THEMED_ELITE4_GYMS,
];
const wildPokemonModValues = [
  WildPokemonMod.UNCHANGED,
  WildPokemonMod.RANDOM,
  WildPokemonMod.AREA_MAPPING,
  WildPokemonMod.GLOBAL_MAPPING,
];
const wildPokemonRestrictionModValues = [
  WildPokemonRestrictionMod.NONE,
  WildPokemonRestrictionMod.SIMILAR_STRENGTH,
  WildPokemonRestrictionMod.CATCH_EM_ALL,
  WildPokemonRestrictionMod.TYPE_THEME_AREAS,
];
const staticPokemonModValues = [
  StaticPokemonMod.UNCHANGED,
  StaticPokemonMod.RANDOM_MATCHING,
  StaticPokemonMod.COMPLETELY_RANDOM,
  StaticPokemonMod.SIMILAR_STRENGTH,
];
const totemPokemonModValues = [
  TotemPokemonMod.UNCHANGED,
  TotemPokemonMod.RANDOM,
  TotemPokemonMod.SIMILAR_STRENGTH,
];
const allyPokemonModValues = [
  AllyPokemonMod.UNCHANGED,
  AllyPokemonMod.RANDOM,
  AllyPokemonMod.SIMILAR_STRENGTH,
];
const auraModValues = [AuraMod.UNCHANGED, AuraMod.RANDOM, AuraMod.SAME_STRENGTH];
const tmsModValues = [TMsMod.UNCHANGED, TMsMod.RANDOM];
const tmsHmsCompatibilityModValues = [
  TMsHMsCompatibilityMod.UNCHANGED,
  TMsHMsCompatibilityMod.RANDOM_PREFER_TYPE,
  TMsHMsCompatibilityMod.COMPLETELY_RANDOM,
  TMsHMsCompatibilityMod.FULL,
];
const moveTutorMovesModValues = [MoveTutorMovesMod.UNCHANGED, MoveTutorMovesMod.RANDOM];
const moveTutorsCompatibilityModValues = [
  MoveTutorsCompatibilityMod.UNCHANGED,
  MoveTutorsCompatibilityMod.RANDOM_PREFER_TYPE,
  MoveTutorsCompatibilityMod.COMPLETELY_RANDOM,
  MoveTutorsCompatibilityMod.FULL,
];
const inGameTradesModValues = [
  InGameTradesMod.UNCHANGED,
  InGameTradesMod.RANDOMIZE_GIVEN,
  InGameTradesMod.RANDOMIZE_GIVEN_AND_REQUESTED,
];
const fieldItemsModValues = [
  FieldItemsMod.UNCHANGED,
  FieldItemsMod.SHUFFLE,
  FieldItemsMod.RANDOM,
  FieldItemsMod.RANDOM_EVEN,
];
const shopItemsModValues = [ShopItemsMod.UNCHANGED, ShopItemsMod.SHUFFLE, ShopItemsMod.RANDOM];
const pickupItemsModValues = [PickupItemsMod.UNCHANGED, PickupItemsMod.RANDOM];

// ---- Settings class ----

export class Settings {
  static readonly VERSION = Version.VERSION;
  static readonly LENGTH_OF_SETTINGS_DATA = 51;

  // General
  romName: string = "";
  updatedFromOldVersion: boolean = false;
  currentRestrictions: GenRestrictions | null = null;
  currentMiscTweaks: number = 0;
  customNames: CustomNamesSet = new CustomNamesSet();

  changeImpossibleEvolutions: boolean = false;
  makeEvolutionsEasier: boolean = false;
  removeTimeBasedEvolutions: boolean = false;
  raceMode: boolean = false;
  blockBrokenMoves: boolean = false;
  limitPokemon: boolean = false;
  banIrregularAltFormes: boolean = false;
  dualTypeOnly: boolean = false;

  // Base stats
  baseStatisticsMod: BaseStatisticsMod = BaseStatisticsMod.UNCHANGED;
  baseStatsFollowEvolutions: boolean = false;
  baseStatsFollowMegaEvolutions: boolean = false;
  assignEvoStatsRandomly: boolean = false;
  updateBaseStats: boolean = false;
  updateBaseStatsToGeneration: number = 0;
  standardizeEXPCurves: boolean = false;
  selectedEXPCurve: ExpCurve = ExpCurve.MEDIUM_FAST;
  expCurveMod: ExpCurveMod = ExpCurveMod.LEGENDARIES;

  // Abilities
  abilitiesMod: AbilitiesMod = AbilitiesMod.UNCHANGED;
  allowWonderGuard: boolean = true;
  abilitiesFollowEvolutions: boolean = false;
  abilitiesFollowMegaEvolutions: boolean = false;
  banTrappingAbilities: boolean = false;
  banNegativeAbilities: boolean = false;
  banBadAbilities: boolean = false;
  weighDuplicateAbilitiesTogether: boolean = false;
  ensureTwoAbilities: boolean = false;

  // Starters
  startersMod: StartersMod = StartersMod.UNCHANGED;
  allowStarterAltFormes: boolean = false;
  customStarters: number[] = [0, 0, 0];
  randomizeStartersHeldItems: boolean = false;
  limitMainGameLegendaries: boolean = false;
  limit600: boolean = false;
  banBadRandomStarterHeldItems: boolean = false;

  // Types
  typesMod: TypesMod = TypesMod.UNCHANGED;
  typesFollowMegaEvolutions: boolean = false;

  // Evolutions
  evolutionsMod: EvolutionsMod = EvolutionsMod.UNCHANGED;
  evosSimilarStrength: boolean = false;
  evosSameTyping: boolean = false;
  evosMaxThreeStages: boolean = false;
  evosForceChange: boolean = false;
  evosAllowAltFormes: boolean = false;

  // Move data
  randomizeMovePowers: boolean = false;
  randomizeMoveAccuracies: boolean = false;
  randomizeMovePPs: boolean = false;
  randomizeMoveTypes: boolean = false;
  randomizeMoveCategory: boolean = false;
  updateMoves: boolean = false;
  updateMovesToGeneration: number = 0;
  updateMovesLegacy: boolean = false;

  // Movesets
  movesetsMod: MovesetsMod = MovesetsMod.UNCHANGED;
  startWithGuaranteedMoves: boolean = false;
  guaranteedMoveCount: number = 2;
  reorderDamagingMoves: boolean = false;
  movesetsForceGoodDamaging: boolean = false;
  movesetsGoodDamagingPercent: number = 0;
  blockBrokenMovesetMoves: boolean = false;
  evolutionMovesForAll: boolean = false;

  // Trainers
  trainersMod: TrainersMod = TrainersMod.UNCHANGED;
  rivalCarriesStarterThroughout: boolean = false;
  trainersUsePokemonOfSimilarStrength: boolean = false;
  trainersMatchTypingDistribution: boolean = false;
  trainersBlockLegendaries: boolean = true;
  trainersBlockEarlyWonderGuard: boolean = true;
  trainersEnforceDistribution: boolean = false;
  trainersEnforceMainPlaythrough: boolean = false;
  randomizeTrainerNames: boolean = false;
  randomizeTrainerClassNames: boolean = false;
  trainersForceFullyEvolved: boolean = false;
  trainersForceFullyEvolvedLevel: number = 30;
  trainersLevelModified: boolean = false;
  trainersLevelModifier: number = 0;
  eliteFourUniquePokemonNumber: number = 0;
  allowTrainerAlternateFormes: boolean = false;
  swapTrainerMegaEvos: boolean = false;
  additionalBossTrainerPokemon: number = 0;
  additionalImportantTrainerPokemon: number = 0;
  additionalRegularTrainerPokemon: number = 0;
  randomizeHeldItemsForBossTrainerPokemon: boolean = false;
  randomizeHeldItemsForImportantTrainerPokemon: boolean = false;
  randomizeHeldItemsForRegularTrainerPokemon: boolean = false;
  consumableItemsOnlyForTrainerPokemon: boolean = false;
  sensibleItemsOnlyForTrainerPokemon: boolean = false;
  highestLevelOnlyGetsItemsForTrainerPokemon: boolean = false;
  doubleBattleMode: boolean = false;
  shinyChance: boolean = false;
  betterTrainerMovesets: boolean = false;

  // Wild Pokemon
  wildPokemonMod: WildPokemonMod = WildPokemonMod.UNCHANGED;
  wildPokemonRestrictionMod: WildPokemonRestrictionMod = WildPokemonRestrictionMod.NONE;
  useTimeBasedEncounters: boolean = false;
  blockWildLegendaries: boolean = true;
  useMinimumCatchRate: boolean = false;
  minimumCatchRateLevel: number = 1;
  randomizeWildPokemonHeldItems: boolean = false;
  banBadRandomWildPokemonHeldItems: boolean = false;
  balanceShakingGrass: boolean = false;
  wildLevelsModified: boolean = false;
  wildLevelModifier: number = 0;
  allowWildAltFormes: boolean = false;

  // Static Pokemon
  staticPokemonMod: StaticPokemonMod = StaticPokemonMod.UNCHANGED;
  allowStaticAltFormes: boolean = false;
  swapStaticMegaEvos: boolean = false;
  staticLevelModified: boolean = false;
  staticLevelModifier: number = 0;
  correctStaticMusic: boolean = false;

  // Totem Pokemon
  totemPokemonMod: TotemPokemonMod = TotemPokemonMod.UNCHANGED;
  allyPokemonMod: AllyPokemonMod = AllyPokemonMod.UNCHANGED;
  auraMod: AuraMod = AuraMod.UNCHANGED;
  randomizeTotemHeldItems: boolean = false;
  totemLevelsModified: boolean = false;
  totemLevelModifier: number = 0;
  allowTotemAltFormes: boolean = false;

  // TMs
  tmsMod: TMsMod = TMsMod.UNCHANGED;
  tmLevelUpMoveSanity: boolean = false;
  keepFieldMoveTMs: boolean = false;
  fullHMCompat: boolean = false;
  tmsForceGoodDamaging: boolean = false;
  tmsGoodDamagingPercent: number = 0;
  blockBrokenTMMoves: boolean = false;
  tmsFollowEvolutions: boolean = false;
  tmsHmsCompatibilityMod: TMsHMsCompatibilityMod = TMsHMsCompatibilityMod.UNCHANGED;

  // Move Tutors
  moveTutorMovesMod: MoveTutorMovesMod = MoveTutorMovesMod.UNCHANGED;
  tutorLevelUpMoveSanity: boolean = false;
  keepFieldMoveTutors: boolean = false;
  tutorsForceGoodDamaging: boolean = false;
  tutorsGoodDamagingPercent: number = 0;
  blockBrokenTutorMoves: boolean = false;
  tutorFollowEvolutions: boolean = false;
  moveTutorsCompatibilityMod: MoveTutorsCompatibilityMod = MoveTutorsCompatibilityMod.UNCHANGED;

  // In-game trades
  inGameTradesMod: InGameTradesMod = InGameTradesMod.UNCHANGED;
  randomizeInGameTradesNicknames: boolean = false;
  randomizeInGameTradesOTs: boolean = false;
  randomizeInGameTradesIVs: boolean = false;
  randomizeInGameTradesItems: boolean = false;

  // Field items
  fieldItemsMod: FieldItemsMod = FieldItemsMod.UNCHANGED;
  banBadRandomFieldItems: boolean = false;

  // Shop items
  shopItemsMod: ShopItemsMod = ShopItemsMod.UNCHANGED;
  banBadRandomShopItems: boolean = false;
  banRegularShopItems: boolean = false;
  banOPShopItems: boolean = false;
  balanceShopPrices: boolean = false;
  guaranteeEvolutionItems: boolean = false;
  guaranteeXItems: boolean = false;

  // Pickup items
  pickupItemsMod: PickupItemsMod = PickupItemsMod.UNCHANGED;
  banBadRandomPickupItems: boolean = false;

  // ---- Serialization: write to file (binary header + base64 body) ----

  write(): Uint8Array {
    const encoder = new TextEncoder();
    const settingsBytes = encoder.encode(this.toString());
    const buf = new Uint8Array(settingsBytes.length + 8);
    const view = new DataView(buf.buffer);
    view.setInt32(0, Settings.VERSION, false); // big-endian
    view.setInt32(4, settingsBytes.length, false);
    buf.set(settingsBytes, 8);
    return buf;
  }

  static read(data: Uint8Array): Settings {
    if (data.length < 8) {
      throw new Error("Error reading version number from settings string.");
    }
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const version = view.getInt32(0, false);

    if (((version >> 24) & 0xff) > 0 && ((version >> 24) & 0xff) <= 172) {
      throw new Error("The settings file is too old to update and cannot be loaded.");
    }
    if (version > Settings.VERSION) {
      throw new Error("Cannot read settings from a newer version of the randomizer.");
    }

    const length = view.getInt32(4, false);
    if (data.length < 8 + length) {
      throw new Error("Error reading settings length from settings string.");
    }

    const decoder = new TextDecoder("utf-8");
    let settingsStr = decoder.decode(data.subarray(8, 8 + length));

    let oldUpdate = false;
    if (version < Settings.VERSION) {
      oldUpdate = true;
      // SettingsUpdater would be called here in full port
      // For now we just parse what we have
    }

    const settings = Settings.fromString(settingsStr);
    settings.updatedFromOldVersion = oldUpdate;
    return settings;
  }

  // ---- Base64 serialization (toString / fromString) ----

  toString(): string {
    const out: number[] = [];

    // 0: general options #1 + trainer/class names
    out.push(
      makeByteSelected(
        this.changeImpossibleEvolutions,
        this.updateMoves,
        this.updateMovesLegacy,
        this.randomizeTrainerNames,
        this.randomizeTrainerClassNames,
        this.makeEvolutionsEasier,
        this.removeTimeBasedEvolutions
      )
    );

    // 1: pokemon base stats & abilities
    out.push(
      makeByteSelected(
        this.baseStatsFollowEvolutions,
        this.baseStatisticsMod === BaseStatisticsMod.RANDOM,
        this.baseStatisticsMod === BaseStatisticsMod.SHUFFLE,
        this.baseStatisticsMod === BaseStatisticsMod.UNCHANGED,
        this.standardizeEXPCurves,
        this.updateBaseStats,
        this.baseStatsFollowMegaEvolutions,
        this.assignEvoStatsRandomly
      )
    );

    // 2: pokemon types & more general options
    out.push(
      makeByteSelected(
        this.typesMod === TypesMod.RANDOM_FOLLOW_EVOLUTIONS,
        this.typesMod === TypesMod.COMPLETELY_RANDOM,
        this.typesMod === TypesMod.UNCHANGED,
        this.raceMode,
        this.blockBrokenMoves,
        this.limitPokemon,
        this.typesFollowMegaEvolutions,
        this.dualTypeOnly
      )
    );

    // 3: abilities byte
    out.push(
      makeByteSelected(
        this.abilitiesMod === AbilitiesMod.UNCHANGED,
        this.abilitiesMod === AbilitiesMod.RANDOMIZE,
        this.allowWonderGuard,
        this.abilitiesFollowEvolutions,
        this.banTrappingAbilities,
        this.banNegativeAbilities,
        this.banBadAbilities,
        this.abilitiesFollowMegaEvolutions
      )
    );

    // 4: starter pokemon stuff
    out.push(
      makeByteSelected(
        this.startersMod === StartersMod.CUSTOM,
        this.startersMod === StartersMod.COMPLETELY_RANDOM,
        this.startersMod === StartersMod.UNCHANGED,
        this.startersMod === StartersMod.RANDOM_WITH_TWO_EVOLUTIONS,
        this.randomizeStartersHeldItems,
        this.banBadRandomStarterHeldItems,
        this.allowStarterAltFormes
      )
    );

    // 5 - 10: custom starter dropdowns
    write2ByteInt(out, this.customStarters[0] - 1);
    write2ByteInt(out, this.customStarters[1] - 1);
    write2ByteInt(out, this.customStarters[2] - 1);

    // 11: movesets
    out.push(
      makeByteSelected(
        this.movesetsMod === MovesetsMod.COMPLETELY_RANDOM,
        this.movesetsMod === MovesetsMod.RANDOM_PREFER_SAME_TYPE,
        this.movesetsMod === MovesetsMod.UNCHANGED,
        this.movesetsMod === MovesetsMod.METRONOME_ONLY,
        this.startWithGuaranteedMoves,
        this.reorderDamagingMoves
      ) | ((this.guaranteedMoveCount - 2) << 6)
    );

    // 12: movesets good damaging
    out.push((this.movesetsForceGoodDamaging ? 0x80 : 0) | this.movesetsGoodDamagingPercent);

    // 13: trainer pokemon
    out.push(
      makeByteSelected(
        this.trainersMod === TrainersMod.UNCHANGED,
        this.trainersMod === TrainersMod.RANDOM,
        this.trainersMod === TrainersMod.DISTRIBUTED,
        this.trainersMod === TrainersMod.MAINPLAYTHROUGH,
        this.trainersMod === TrainersMod.TYPE_THEMED,
        this.trainersMod === TrainersMod.TYPE_THEMED_ELITE4_GYMS
      )
    );

    // 14: trainer pokemon force evolutions
    out.push(
      (this.trainersForceFullyEvolved ? 0x80 : 0) | this.trainersForceFullyEvolvedLevel
    );

    // 15: wild pokemon
    out.push(
      makeByteSelected(
        this.wildPokemonRestrictionMod === WildPokemonRestrictionMod.CATCH_EM_ALL,
        this.wildPokemonMod === WildPokemonMod.AREA_MAPPING,
        this.wildPokemonRestrictionMod === WildPokemonRestrictionMod.NONE,
        this.wildPokemonRestrictionMod === WildPokemonRestrictionMod.TYPE_THEME_AREAS,
        this.wildPokemonMod === WildPokemonMod.GLOBAL_MAPPING,
        this.wildPokemonMod === WildPokemonMod.RANDOM,
        this.wildPokemonMod === WildPokemonMod.UNCHANGED,
        this.useTimeBasedEncounters
      )
    );

    // 16: wild pokemon 2
    out.push(
      makeByteSelected(
        this.useMinimumCatchRate,
        this.blockWildLegendaries,
        this.wildPokemonRestrictionMod === WildPokemonRestrictionMod.SIMILAR_STRENGTH,
        this.randomizeWildPokemonHeldItems,
        this.banBadRandomWildPokemonHeldItems,
        false,
        false,
        this.balanceShakingGrass
      )
    );

    // 17: static pokemon
    out.push(
      makeByteSelected(
        this.staticPokemonMod === StaticPokemonMod.UNCHANGED,
        this.staticPokemonMod === StaticPokemonMod.RANDOM_MATCHING,
        this.staticPokemonMod === StaticPokemonMod.COMPLETELY_RANDOM,
        this.staticPokemonMod === StaticPokemonMod.SIMILAR_STRENGTH,
        this.limitMainGameLegendaries,
        this.limit600,
        this.allowStaticAltFormes,
        this.swapStaticMegaEvos
      )
    );

    // 18: tm randomization
    out.push(
      makeByteSelected(
        this.tmsHmsCompatibilityMod === TMsHMsCompatibilityMod.COMPLETELY_RANDOM,
        this.tmsHmsCompatibilityMod === TMsHMsCompatibilityMod.RANDOM_PREFER_TYPE,
        this.tmsHmsCompatibilityMod === TMsHMsCompatibilityMod.UNCHANGED,
        this.tmsMod === TMsMod.RANDOM,
        this.tmsMod === TMsMod.UNCHANGED,
        this.tmLevelUpMoveSanity,
        this.keepFieldMoveTMs,
        this.tmsHmsCompatibilityMod === TMsHMsCompatibilityMod.FULL
      )
    );

    // 19: tms part 2
    out.push(
      makeByteSelected(this.fullHMCompat, this.tmsFollowEvolutions, this.tutorFollowEvolutions)
    );

    // 20: tms good damaging
    out.push((this.tmsForceGoodDamaging ? 0x80 : 0) | this.tmsGoodDamagingPercent);

    // 21: move tutor randomization
    out.push(
      makeByteSelected(
        this.moveTutorsCompatibilityMod === MoveTutorsCompatibilityMod.COMPLETELY_RANDOM,
        this.moveTutorsCompatibilityMod === MoveTutorsCompatibilityMod.RANDOM_PREFER_TYPE,
        this.moveTutorsCompatibilityMod === MoveTutorsCompatibilityMod.UNCHANGED,
        this.moveTutorMovesMod === MoveTutorMovesMod.RANDOM,
        this.moveTutorMovesMod === MoveTutorMovesMod.UNCHANGED,
        this.tutorLevelUpMoveSanity,
        this.keepFieldMoveTutors,
        this.moveTutorsCompatibilityMod === MoveTutorsCompatibilityMod.FULL
      )
    );

    // 22: tutors good damaging
    out.push((this.tutorsForceGoodDamaging ? 0x80 : 0) | this.tutorsGoodDamagingPercent);

    // 23: in game trades
    out.push(
      makeByteSelected(
        this.inGameTradesMod === InGameTradesMod.RANDOMIZE_GIVEN_AND_REQUESTED,
        this.inGameTradesMod === InGameTradesMod.RANDOMIZE_GIVEN,
        this.randomizeInGameTradesItems,
        this.randomizeInGameTradesIVs,
        this.randomizeInGameTradesNicknames,
        this.randomizeInGameTradesOTs,
        this.inGameTradesMod === InGameTradesMod.UNCHANGED
      )
    );

    // 24: field items
    out.push(
      makeByteSelected(
        this.fieldItemsMod === FieldItemsMod.RANDOM,
        this.fieldItemsMod === FieldItemsMod.SHUFFLE,
        this.fieldItemsMod === FieldItemsMod.UNCHANGED,
        this.banBadRandomFieldItems,
        this.fieldItemsMod === FieldItemsMod.RANDOM_EVEN
      )
    );

    // 25: move randomizers + static music
    out.push(
      makeByteSelected(
        this.randomizeMovePowers,
        this.randomizeMoveAccuracies,
        this.randomizeMovePPs,
        this.randomizeMoveTypes,
        this.randomizeMoveCategory,
        this.correctStaticMusic
      )
    );

    // 26: evolutions
    out.push(
      makeByteSelected(
        this.evolutionsMod === EvolutionsMod.UNCHANGED,
        this.evolutionsMod === EvolutionsMod.RANDOM,
        this.evosSimilarStrength,
        this.evosSameTyping,
        this.evosMaxThreeStages,
        this.evosForceChange,
        this.evosAllowAltFormes,
        this.evolutionsMod === EvolutionsMod.RANDOM_EVERY_LEVEL
      )
    );

    // 27: pokemon trainer misc
    out.push(
      makeByteSelected(
        this.trainersUsePokemonOfSimilarStrength,
        this.rivalCarriesStarterThroughout,
        this.trainersMatchTypingDistribution,
        this.trainersBlockLegendaries,
        this.trainersBlockEarlyWonderGuard,
        this.swapTrainerMegaEvos,
        this.shinyChance,
        this.betterTrainerMovesets
      )
    );

    // 28 - 31: pokemon restrictions
    if (this.currentRestrictions !== null) {
      writeFullInt(out, this.currentRestrictions.toInt());
    } else {
      writeFullInt(out, 0);
    }

    // 32 - 35: misc tweaks
    writeFullInt(out, this.currentMiscTweaks);

    // 36: trainer pokemon level modifier
    out.push((this.trainersLevelModified ? 0x80 : 0) | (this.trainersLevelModifier + 50));

    // 37: shop items
    out.push(
      makeByteSelected(
        this.shopItemsMod === ShopItemsMod.RANDOM,
        this.shopItemsMod === ShopItemsMod.SHUFFLE,
        this.shopItemsMod === ShopItemsMod.UNCHANGED,
        this.banBadRandomShopItems,
        this.banRegularShopItems,
        this.banOPShopItems,
        this.balanceShopPrices,
        this.guaranteeEvolutionItems
      )
    );

    // 38: wild level modifier
    out.push((this.wildLevelsModified ? 0x80 : 0) | (this.wildLevelModifier + 50));

    // 39: EXP curve mod, block broken moves, alt forme stuff
    out.push(
      makeByteSelected(
        this.expCurveMod === ExpCurveMod.LEGENDARIES,
        this.expCurveMod === ExpCurveMod.STRONG_LEGENDARIES,
        this.expCurveMod === ExpCurveMod.ALL,
        this.blockBrokenMovesetMoves,
        this.blockBrokenTMMoves,
        this.blockBrokenTutorMoves,
        this.allowTrainerAlternateFormes,
        this.allowWildAltFormes
      )
    );

    // 40: Double Battle Mode, Additional Boss/Important Trainer Pokemon, Weigh Duplicate Abilities
    out.push(
      (this.doubleBattleMode ? 0x1 : 0) |
        (this.additionalBossTrainerPokemon << 1) |
        (this.additionalImportantTrainerPokemon << 4) |
        (this.weighDuplicateAbilitiesTogether ? 0x80 : 0)
    );

    // 41: Additional Regular Trainer Pokemon, Aura modification, evolution moves, guarantee X items
    out.push(
      this.additionalRegularTrainerPokemon |
        (this.auraMod === AuraMod.UNCHANGED ? 0x8 : 0) |
        (this.auraMod === AuraMod.RANDOM ? 0x10 : 0) |
        (this.auraMod === AuraMod.SAME_STRENGTH ? 0x20 : 0) |
        (this.evolutionMovesForAll ? 0x40 : 0) |
        (this.guaranteeXItems ? 0x80 : 0)
    );

    // 42: Totem Pokemon settings
    out.push(
      makeByteSelected(
        this.totemPokemonMod === TotemPokemonMod.UNCHANGED,
        this.totemPokemonMod === TotemPokemonMod.RANDOM,
        this.totemPokemonMod === TotemPokemonMod.SIMILAR_STRENGTH,
        this.allyPokemonMod === AllyPokemonMod.UNCHANGED,
        this.allyPokemonMod === AllyPokemonMod.RANDOM,
        this.allyPokemonMod === AllyPokemonMod.SIMILAR_STRENGTH,
        this.randomizeTotemHeldItems,
        this.allowTotemAltFormes
      )
    );

    // 43: Totem level modifier
    out.push((this.totemLevelsModified ? 0x80 : 0) | (this.totemLevelModifier + 50));

    // 44 - 45: generation bytes
    out.push(this.updateBaseStatsToGeneration);
    out.push(this.updateMovesToGeneration);

    // 46: Selected EXP curve
    out.push(expCurveToByte(this.selectedEXPCurve));

    // 47: Static level modifier
    out.push((this.staticLevelModified ? 0x80 : 0) | (this.staticLevelModifier + 50));

    // 48: trainer pokemon held items / pokemon ensure two abilities
    out.push(
      makeByteSelected(
        this.randomizeHeldItemsForBossTrainerPokemon,
        this.randomizeHeldItemsForImportantTrainerPokemon,
        this.randomizeHeldItemsForRegularTrainerPokemon,
        this.consumableItemsOnlyForTrainerPokemon,
        this.sensibleItemsOnlyForTrainerPokemon,
        this.highestLevelOnlyGetsItemsForTrainerPokemon,
        this.ensureTwoAbilities
      )
    );

    // 49: pickup item randomization
    out.push(
      makeByteSelected(
        this.pickupItemsMod === PickupItemsMod.RANDOM,
        this.pickupItemsMod === PickupItemsMod.UNCHANGED,
        this.banBadRandomPickupItems,
        this.banIrregularAltFormes
      )
    );

    // 50: elite four unique pokemon (3 bits) + catch rate level (3 bits)
    out.push(this.eliteFourUniquePokemonNumber | ((this.minimumCatchRateLevel - 1) << 3));

    // ROM name
    const encoder = new TextEncoder();
    const romNameBytes = encoder.encode(this.romName);
    out.push(romNameBytes.length);
    for (const b of romNameBytes) {
      out.push(b);
    }

    // Checksum
    const current = new Uint8Array(out);
    const checksumValue = crc32(current);
    writeFullInt(out, checksumValue);

    // Custom names file checksum (write 0 since we don't have the file at serialization time)
    writeFullInt(out, 0);

    const finalData = new Uint8Array(out);
    // Base64 encode
    return uint8ArrayToBase64(finalData);
  }

  static fromString(settingsString: string): Settings {
    const data = base64ToUint8Array(settingsString);
    Settings.checkChecksum(data);

    const settings = new Settings();

    // Restore the actual controls
    settings.changeImpossibleEvolutions = restoreState(data[0], 0);
    settings.updateMoves = restoreState(data[0], 1);
    settings.updateMovesLegacy = restoreState(data[0], 2);
    settings.randomizeTrainerNames = restoreState(data[0], 3);
    settings.randomizeTrainerClassNames = restoreState(data[0], 4);
    settings.makeEvolutionsEasier = restoreState(data[0], 5);
    settings.removeTimeBasedEvolutions = restoreState(data[0], 6);

    settings.baseStatisticsMod = restoreEnum(
      baseStatisticsModValues,
      "BaseStatisticsMod",
      data[1],
      3, // UNCHANGED
      2, // SHUFFLE
      1 // RANDOM
    );
    settings.standardizeEXPCurves = restoreState(data[1], 4);
    settings.baseStatsFollowEvolutions = restoreState(data[1], 0);
    settings.updateBaseStats = restoreState(data[1], 5);
    settings.baseStatsFollowMegaEvolutions = restoreState(data[1], 6);
    settings.assignEvoStatsRandomly = restoreState(data[1], 7);

    settings.typesMod = restoreEnum(
      typesModValues,
      "TypesMod",
      data[2],
      2, // UNCHANGED
      0, // RANDOM_FOLLOW_EVOLUTIONS
      1 // COMPLETELY_RANDOM
    );
    settings.raceMode = restoreState(data[2], 3);
    settings.blockBrokenMoves = restoreState(data[2], 4);
    settings.limitPokemon = restoreState(data[2], 5);
    settings.typesFollowMegaEvolutions = restoreState(data[2], 6);
    settings.dualTypeOnly = restoreState(data[2], 7);

    settings.abilitiesMod = restoreEnum(
      abilitiesModValues,
      "AbilitiesMod",
      data[3],
      0, // UNCHANGED
      1 // RANDOMIZE
    );
    settings.allowWonderGuard = restoreState(data[3], 2);
    settings.abilitiesFollowEvolutions = restoreState(data[3], 3);
    settings.banTrappingAbilities = restoreState(data[3], 4);
    settings.banNegativeAbilities = restoreState(data[3], 5);
    settings.banBadAbilities = restoreState(data[3], 6);
    settings.abilitiesFollowMegaEvolutions = restoreState(data[3], 7);

    settings.startersMod = restoreEnum(
      startersModValues,
      "StartersMod",
      data[4],
      2, // UNCHANGED
      0, // CUSTOM
      1, // COMPLETELY_RANDOM
      3 // RANDOM_WITH_TWO_EVOLUTIONS
    );
    settings.randomizeStartersHeldItems = restoreState(data[4], 4);
    settings.banBadRandomStarterHeldItems = restoreState(data[4], 5);
    settings.allowStarterAltFormes = restoreState(data[4], 6);

    settings.customStarters = [
      FileFunctions.read2ByteInt(data, 5) + 1,
      FileFunctions.read2ByteInt(data, 7) + 1,
      FileFunctions.read2ByteInt(data, 9) + 1,
    ];

    settings.movesetsMod = restoreEnum(
      movesetsModValues,
      "MovesetsMod",
      data[11],
      2, // UNCHANGED
      1, // RANDOM_PREFER_SAME_TYPE
      0, // COMPLETELY_RANDOM
      3 // METRONOME_ONLY
    );
    settings.startWithGuaranteedMoves = restoreState(data[11], 4);
    settings.reorderDamagingMoves = restoreState(data[11], 5);
    settings.guaranteedMoveCount = ((data[11] & 0xc0) >> 6) + 2;

    settings.movesetsForceGoodDamaging = restoreState(data[12], 7);
    settings.movesetsGoodDamagingPercent = data[12] & 0x7f;

    settings.trainersMod = restoreEnum(
      trainersModValues,
      "TrainersMod",
      data[13],
      0, // UNCHANGED
      1, // RANDOM
      2, // DISTRIBUTED
      3, // MAINPLAYTHROUGH
      4, // TYPE_THEMED
      5 // TYPE_THEMED_ELITE4_GYMS
    );

    settings.trainersForceFullyEvolved = restoreState(data[14], 7);
    settings.trainersForceFullyEvolvedLevel = data[14] & 0x7f;

    settings.wildPokemonMod = restoreEnum(
      wildPokemonModValues,
      "WildPokemonMod",
      data[15],
      6, // UNCHANGED
      5, // RANDOM
      1, // AREA_MAPPING
      4 // GLOBAL_MAPPING
    );
    settings.wildPokemonRestrictionMod = getEnumValue(
      wildPokemonRestrictionModValues,
      "WildPokemonRestrictionMod",
      restoreState(data[15], 2), // NONE
      restoreState(data[16], 2), // SIMILAR_STRENGTH
      restoreState(data[15], 0), // CATCH_EM_ALL
      restoreState(data[15], 3) // TYPE_THEME_AREAS
    );
    settings.useTimeBasedEncounters = restoreState(data[15], 7);

    settings.useMinimumCatchRate = restoreState(data[16], 0);
    settings.blockWildLegendaries = restoreState(data[16], 1);
    settings.randomizeWildPokemonHeldItems = restoreState(data[16], 3);
    settings.banBadRandomWildPokemonHeldItems = restoreState(data[16], 4);
    settings.balanceShakingGrass = restoreState(data[16], 7);

    settings.staticPokemonMod = restoreEnum(
      staticPokemonModValues,
      "StaticPokemonMod",
      data[17],
      0, // UNCHANGED
      1, // RANDOM_MATCHING
      2, // COMPLETELY_RANDOM
      3 // SIMILAR_STRENGTH
    );
    settings.limitMainGameLegendaries = restoreState(data[17], 4);
    settings.limit600 = restoreState(data[17], 5);
    settings.allowStaticAltFormes = restoreState(data[17], 6);
    settings.swapStaticMegaEvos = restoreState(data[17], 7);

    settings.tmsMod = restoreEnum(tmsModValues, "TMsMod", data[18], 4, 3);
    settings.tmsHmsCompatibilityMod = restoreEnum(
      tmsHmsCompatibilityModValues,
      "TMsHMsCompatibilityMod",
      data[18],
      2, // UNCHANGED
      1, // RANDOM_PREFER_TYPE
      0, // COMPLETELY_RANDOM
      7 // FULL
    );
    settings.tmLevelUpMoveSanity = restoreState(data[18], 5);
    settings.keepFieldMoveTMs = restoreState(data[18], 6);

    settings.fullHMCompat = restoreState(data[19], 0);
    settings.tmsFollowEvolutions = restoreState(data[19], 1);
    settings.tutorFollowEvolutions = restoreState(data[19], 2);

    settings.tmsForceGoodDamaging = restoreState(data[20], 7);
    settings.tmsGoodDamagingPercent = data[20] & 0x7f;

    settings.moveTutorMovesMod = restoreEnum(
      moveTutorMovesModValues,
      "MoveTutorMovesMod",
      data[21],
      4,
      3
    );
    settings.moveTutorsCompatibilityMod = restoreEnum(
      moveTutorsCompatibilityModValues,
      "MoveTutorsCompatibilityMod",
      data[21],
      2, // UNCHANGED
      1, // RANDOM_PREFER_TYPE
      0, // COMPLETELY_RANDOM
      7 // FULL
    );
    settings.tutorLevelUpMoveSanity = restoreState(data[21], 5);
    settings.keepFieldMoveTutors = restoreState(data[21], 6);

    settings.tutorsForceGoodDamaging = restoreState(data[22], 7);
    settings.tutorsGoodDamagingPercent = data[22] & 0x7f;

    // new 150
    settings.inGameTradesMod = restoreEnum(
      inGameTradesModValues,
      "InGameTradesMod",
      data[23],
      6, // UNCHANGED
      1, // RANDOMIZE_GIVEN
      0 // RANDOMIZE_GIVEN_AND_REQUESTED
    );
    settings.randomizeInGameTradesItems = restoreState(data[23], 2);
    settings.randomizeInGameTradesIVs = restoreState(data[23], 3);
    settings.randomizeInGameTradesNicknames = restoreState(data[23], 4);
    settings.randomizeInGameTradesOTs = restoreState(data[23], 5);

    settings.fieldItemsMod = restoreEnum(
      fieldItemsModValues,
      "FieldItemsMod",
      data[24],
      2, // UNCHANGED
      1, // SHUFFLE
      0, // RANDOM
      4 // RANDOM_EVEN
    );
    settings.banBadRandomFieldItems = restoreState(data[24], 3);

    // new 170
    settings.randomizeMovePowers = restoreState(data[25], 0);
    settings.randomizeMoveAccuracies = restoreState(data[25], 1);
    settings.randomizeMovePPs = restoreState(data[25], 2);
    settings.randomizeMoveTypes = restoreState(data[25], 3);
    settings.randomizeMoveCategory = restoreState(data[25], 4);
    settings.correctStaticMusic = restoreState(data[25], 5);

    settings.evolutionsMod = restoreEnum(
      evolutionsModValues,
      "EvolutionsMod",
      data[26],
      0, // UNCHANGED
      1, // RANDOM
      7 // RANDOM_EVERY_LEVEL
    );
    settings.evosSimilarStrength = restoreState(data[26], 2);
    settings.evosSameTyping = restoreState(data[26], 3);
    settings.evosMaxThreeStages = restoreState(data[26], 4);
    settings.evosForceChange = restoreState(data[26], 5);
    settings.evosAllowAltFormes = restoreState(data[26], 6);

    // pokemon trainer misc
    settings.trainersUsePokemonOfSimilarStrength = restoreState(data[27], 0);
    settings.rivalCarriesStarterThroughout = restoreState(data[27], 1);
    settings.trainersMatchTypingDistribution = restoreState(data[27], 2);
    settings.trainersBlockLegendaries = restoreState(data[27], 3);
    settings.trainersBlockEarlyWonderGuard = restoreState(data[27], 4);
    settings.swapTrainerMegaEvos = restoreState(data[27], 5);
    settings.shinyChance = restoreState(data[27], 6);
    settings.betterTrainerMovesets = restoreState(data[27], 7);

    // gen restrictions
    const genLimit = FileFunctions.readFullIntBigEndian(data, 28);
    settings.currentRestrictions = genLimit !== 0 ? new GenRestrictions(genLimit) : null;

    settings.currentMiscTweaks = FileFunctions.readFullIntBigEndian(data, 32);

    settings.trainersLevelModified = restoreState(data[36], 7);
    settings.trainersLevelModifier = (data[36] & 0x7f) - 50;

    settings.shopItemsMod = restoreEnum(
      shopItemsModValues,
      "ShopItemsMod",
      data[37],
      2,
      1,
      0
    );
    settings.banBadRandomShopItems = restoreState(data[37], 3);
    settings.banRegularShopItems = restoreState(data[37], 4);
    settings.banOPShopItems = restoreState(data[37], 5);
    settings.balanceShopPrices = restoreState(data[37], 6);
    settings.guaranteeEvolutionItems = restoreState(data[37], 7);

    settings.wildLevelsModified = restoreState(data[38], 7);
    settings.wildLevelModifier = (data[38] & 0x7f) - 50;

    settings.expCurveMod = restoreEnum(expCurveModValues, "ExpCurveMod", data[39], 0, 1, 2);

    settings.blockBrokenMovesetMoves = restoreState(data[39], 3);
    settings.blockBrokenTMMoves = restoreState(data[39], 4);
    settings.blockBrokenTutorMoves = restoreState(data[39], 5);

    settings.allowTrainerAlternateFormes = restoreState(data[39], 6);
    settings.allowWildAltFormes = restoreState(data[39], 7);

    settings.doubleBattleMode = restoreState(data[40], 0);
    settings.additionalBossTrainerPokemon = (data[40] & 0xe) >> 1;
    settings.additionalImportantTrainerPokemon = (data[40] & 0x70) >> 4;
    settings.weighDuplicateAbilitiesTogether = restoreState(data[40], 7);

    settings.additionalRegularTrainerPokemon = data[41] & 0x7;
    settings.auraMod = restoreEnum(auraModValues, "AuraMod", data[41], 3, 4, 5);
    settings.evolutionMovesForAll = restoreState(data[41], 6);
    settings.guaranteeXItems = restoreState(data[41], 7);

    settings.totemPokemonMod = restoreEnum(
      totemPokemonModValues,
      "TotemPokemonMod",
      data[42],
      0,
      1,
      2
    );
    settings.allyPokemonMod = restoreEnum(
      allyPokemonModValues,
      "AllyPokemonMod",
      data[42],
      3,
      4,
      5
    );
    settings.randomizeTotemHeldItems = restoreState(data[42], 6);
    settings.allowTotemAltFormes = restoreState(data[42], 7);
    settings.totemLevelsModified = restoreState(data[43], 7);
    settings.totemLevelModifier = (data[43] & 0x7f) - 50;

    settings.updateBaseStatsToGeneration = data[44];
    settings.updateMovesToGeneration = data[45];

    const expCurve = expCurveFromByte(data[46]);
    settings.selectedEXPCurve = expCurve ?? ExpCurve.MEDIUM_FAST;

    settings.staticLevelModified = restoreState(data[47], 7);
    settings.staticLevelModifier = (data[47] & 0x7f) - 50;

    settings.randomizeHeldItemsForBossTrainerPokemon = restoreState(data[48], 0);
    settings.randomizeHeldItemsForImportantTrainerPokemon = restoreState(data[48], 1);
    settings.randomizeHeldItemsForRegularTrainerPokemon = restoreState(data[48], 2);
    settings.consumableItemsOnlyForTrainerPokemon = restoreState(data[48], 3);
    settings.sensibleItemsOnlyForTrainerPokemon = restoreState(data[48], 4);
    settings.highestLevelOnlyGetsItemsForTrainerPokemon = restoreState(data[48], 5);
    settings.ensureTwoAbilities = restoreState(data[48], 6);

    settings.pickupItemsMod = restoreEnum(
      pickupItemsModValues,
      "PickupItemsMod",
      data[49],
      1, // UNCHANGED
      0 // RANDOM
    );
    settings.banBadRandomPickupItems = restoreState(data[49], 2);
    settings.banIrregularAltFormes = restoreState(data[49], 3);

    settings.eliteFourUniquePokemonNumber = data[50] & 0x7;
    settings.minimumCatchRateLevel = ((data[50] & 0x38) >> 3) + 1;

    const romNameLength = data[Settings.LENGTH_OF_SETTINGS_DATA] & 0xff;
    const decoder = new TextDecoder("utf-8");
    settings.romName = decoder.decode(
      data.subarray(
        Settings.LENGTH_OF_SETTINGS_DATA + 1,
        Settings.LENGTH_OF_SETTINGS_DATA + 1 + romNameLength
      )
    );

    return settings;
  }

  private static checkChecksum(data: Uint8Array): void {
    // Read checksum from last 8 bytes (first 4 of those 8 are the CRC)
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const storedCrc = view.getInt32(data.length - 8, false);

    const checksumData = data.subarray(0, data.length - 8);
    const computedCrc = crc32(checksumData);

    // Compare as signed 32-bit integers (Java's CRC32.getValue() cast to int)
    if ((computedCrc | 0) !== (storedCrc | 0)) {
      throw new Error("Malformed input string");
    }
  }
}

// ---- Base64 helpers ----

function uint8ArrayToBase64(data: Uint8Array): string {
  // Node.js Buffer-based encoding
  if (typeof Buffer !== "undefined") {
    return Buffer.from(data).toString("base64");
  }
  // Browser fallback
  let binary = "";
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary);
}

function base64ToUint8Array(base64: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(base64, "base64"));
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
