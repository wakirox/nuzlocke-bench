/**
 * RomHandler interface - defines the functionality that each randomization
 * handler must implement.
 *
 * Ported from Java: com.dabomstew.pkrandom.romhandlers.RomHandler
 */

import type { Settings } from "../config/settings";
import type { Pokemon } from "../pokemon/pokemon";
import type { Move } from "../pokemon/move";
import type { MoveLearnt } from "../pokemon/move-learnt";
import type { MegaEvolution } from "../pokemon/mega-evolution";
import type { Trainer } from "../pokemon/trainer";
import type { TrainerPokemon } from "../pokemon/trainer-pokemon";
import type { EncounterSet } from "../pokemon/encounter-set";
import type { StaticEncounter } from "../pokemon/static-encounter";
import type { TotemPokemon } from "../pokemon/totem-pokemon";
import type { IngameTrade } from "../pokemon/ingame-trade";
import type { PickupItem } from "../pokemon/pickup-item";
import type { Shop } from "../pokemon/shop";
import type { Type } from "../pokemon/type";
import type { ItemList } from "../pokemon/item-list";
import type { StatChange } from "../pokemon/stat-change";
import type { EvolutionUpdate } from "./evolution-update";
import type { RandomInstance } from "../utils/random-source";

/**
 * Simple log stream interface replacing Java's PrintStream.
 */
export interface LogStream {
  print(s: string): void;
  println(s?: string): void;
  printf?(format: string, ...args: unknown[]): void;
}

export enum TrainerNameMode {
  SAME_LENGTH,
  MAX_LENGTH,
  MAX_LENGTH_WITH_CLASS,
}

export interface RomHandler {
  // Basic load/save methods
  loadRom(filename: string): boolean;
  saveRomFile(filename: string, seed: number): boolean;
  saveRomDirectory(filename: string): boolean;
  loadedFilename(): string;

  // Game updates
  hasGameUpdateLoaded(): boolean;
  loadGameUpdate(filename: string): boolean;
  removeGameUpdate(): void;
  getGameUpdateVersion(): string | null;

  // Log methods
  setLog(logStream: LogStream): void;
  printRomDiagnostics(logStream: LogStream): void;
  isRomValid(): boolean;

  // Pokemon lists
  getPokemon(): (Pokemon | null)[];
  getPokemonInclFormes(): (Pokemon | null)[];
  getAltFormes(): Pokemon[];
  getMegaEvolutions(): MegaEvolution[];
  getAltFormeOfPokemon(pk: Pokemon, forme: number): Pokemon;
  getIrregularFormes(): Pokemon[];

  // Gen Restrictions
  setPokemonPool(settings: Settings | null): void;
  removeEvosForPokemonPool(): void;

  // Starter Pokemon
  getStarters(): Pokemon[];
  setStarters(newStarters: Pokemon[]): boolean;
  hasStarterAltFormes(): boolean;
  starterCount(): number;
  customStarters(settings: Settings): void;
  randomizeStarters(settings: Settings): void;
  randomizeBasicTwoEvosStarters(settings: Settings): void;
  getPickedStarters(): Pokemon[];
  supportsStarterHeldItems(): boolean;
  getStarterHeldItems(): number[];
  setStarterHeldItems(items: number[]): void;
  randomizeStarterHeldItems(settings: Settings): void;

  // Pokemon Base Statistics
  shufflePokemonStats(settings: Settings): void;
  randomizePokemonStats(settings: Settings): void;
  updatePokemonStats(settings: Settings): void;
  getUpdatedPokemonStats(generation: number): Map<number, StatChange>;
  standardizeEXPCurves(settings: Settings): void;

  // Random Pokemon selection
  randomPokemon(): Pokemon;
  randomPokemonInclFormes(): Pokemon;
  randomNonLegendaryPokemon(): Pokemon;
  randomLegendaryPokemon(): Pokemon;
  random2EvosPokemon(allowAltFormes: boolean): Pokemon;

  // Pokemon Types
  randomType(): Type;
  typeInGame(type: Type): boolean;
  randomizePokemonTypes(settings: Settings): void;

  // Pokemon Abilities
  abilitiesPerPokemon(): number;
  highestAbilityIndex(): number;
  abilityName(n: number): string;
  randomizeAbilities(settings: Settings): void;
  getAbilityVariations(): Map<number, number[]>;
  getUselessAbilities(): number[];
  getAbilityForTrainerPokemon(tp: TrainerPokemon): number;
  hasMegaEvolutions(): boolean;

  // Wild Pokemon
  getEncounters(useTimeOfDay: boolean): EncounterSet[];
  setEncounters(useTimeOfDay: boolean, encounters: EncounterSet[]): void;
  randomEncounters(settings: Settings): void;
  area1to1Encounters(settings: Settings): void;
  game1to1Encounters(settings: Settings): void;
  onlyChangeWildLevels(settings: Settings): void;
  hasTimeBasedEncounters(): boolean;
  hasWildAltFormes(): boolean;
  bannedForWildEncounters(): Pokemon[];
  randomizeWildHeldItems(settings: Settings): void;
  changeCatchRates(settings: Settings): void;
  minimumCatchRate(rateNonLegendary: number, rateLegendary: number): void;
  enableGuaranteedPokemonCatching(): void;

  // Trainer Pokemon
  getTrainers(): Trainer[];
  getMainPlaythroughTrainers(): number[];
  getEliteFourTrainers(isChallengeMode: boolean): number[];
  setTrainers(trainerData: Trainer[], doubleBattleMode: boolean): void;
  randomizeTrainerPokes(settings: Settings): void;
  randomizeTrainerHeldItems(settings: Settings): void;
  getSensibleHeldItemsFor(
    tp: TrainerPokemon,
    consumableOnly: boolean,
    moves: Move[],
    pokeMoves: number[]
  ): number[];
  getAllConsumableHeldItems(): number[];
  getAllHeldItems(): number[];
  rivalCarriesStarter(): void;
  hasRivalFinalBattle(): boolean;
  forceFullyEvolvedTrainerPokes(settings: Settings): void;
  onlyChangeTrainerLevels(settings: Settings): void;
  addTrainerPokemon(settings: Settings): void;
  doubleBattleMode(): void;
  getMoveSelectionPoolAtLevel(
    tp: TrainerPokemon,
    cyclicEvolutions: boolean
  ): Move[];
  pickTrainerMovesets(settings: Settings): void;

  // Move Data
  randomizeMovePowers(): void;
  randomizeMovePPs(): void;
  randomizeMoveAccuracies(): void;
  randomizeMoveTypes(): void;
  hasPhysicalSpecialSplit(): boolean;
  randomizeMoveCategory(): void;
  updateMoves(settings: Settings): void;
  initMoveUpdates(): void;
  getMoveUpdates(): Map<number, boolean[]>;
  getMoves(): (Move | null)[];

  // Pokemon Movesets
  getMovesLearnt(): Map<number, MoveLearnt[]>;
  setMovesLearnt(movesets: Map<number, MoveLearnt[]>): void;
  getMovesBannedFromLevelup(): number[];
  getEggMoves(): Map<number, number[]>;
  setEggMoves(eggMoves: Map<number, number[]>): void;
  randomizeMovesLearnt(settings: Settings): void;
  randomizeEggMoves(settings: Settings): void;
  orderDamagingMovesByDamage(): void;
  metronomeOnlyMode(): void;
  supportsFourStartingMoves(): boolean;

  // Static Pokemon
  getStaticPokemon(): StaticEncounter[];
  setStaticPokemon(staticPokemon: StaticEncounter[]): boolean;
  randomizeStaticPokemon(settings: Settings): void;
  canChangeStaticPokemon(): boolean;
  hasStaticAltFormes(): boolean;
  bannedForStaticPokemon(): Pokemon[];
  forceSwapStaticMegaEvos(): boolean;
  onlyChangeStaticLevels(settings: Settings): void;
  hasMainGameLegendaries(): boolean;
  getMainGameLegendaries(): number[];
  getSpecialMusicStatics(): number[];
  applyCorrectStaticMusic(
    specialMusicStaticChanges: Map<number, number>
  ): void;
  hasStaticMusicFix(): boolean;

  // Totem Pokemon
  getTotemPokemon(): TotemPokemon[];
  setTotemPokemon(totemPokemon: TotemPokemon[]): void;
  randomizeTotemPokemon(settings: Settings): void;

  // TMs & HMs
  getTMMoves(): number[];
  getHMMoves(): number[];
  setTMMoves(moveIndexes: number[]): void;
  randomizeTMMoves(settings: Settings): void;
  getTMCount(): number;
  getHMCount(): number;
  getTMHMCompatibility(): Map<Pokemon, boolean[]>;
  setTMHMCompatibility(compatData: Map<Pokemon, boolean[]>): void;
  randomizeTMHMCompatibility(settings: Settings): void;
  fullTMHMCompatibility(): void;
  ensureTMCompatSanity(): void;
  ensureTMEvolutionSanity(): void;
  fullHMCompatibility(): void;

  // Move Tutors
  copyTMCompatibilityToCosmeticFormes(): void;
  hasMoveTutors(): boolean;
  getMoveTutorMoves(): number[];
  setMoveTutorMoves(moves: number[]): void;
  randomizeMoveTutorMoves(settings: Settings): void;
  getMoveTutorCompatibility(): Map<Pokemon, boolean[]>;
  setMoveTutorCompatibility(compatData: Map<Pokemon, boolean[]>): void;
  randomizeMoveTutorCompatibility(settings: Settings): void;
  fullMoveTutorCompatibility(): void;
  ensureMoveTutorCompatSanity(): void;
  ensureMoveTutorEvolutionSanity(): void;

  // Trainer Names
  copyMoveTutorCompatibilityToCosmeticFormes(): void;
  canChangeTrainerText(): boolean;
  getTrainerNames(): string[];
  setTrainerNames(trainerNames: string[]): void;
  trainerNameMode(): TrainerNameMode;
  maxTrainerNameLength(): number;
  maxSumOfTrainerNameLengths(): number;
  getTCNameLengthsByTrainer(): number[];
  randomizeTrainerNames(settings: Settings): void;

  // Trainer Classes
  getTrainerClassNames(): string[];
  setTrainerClassNames(trainerClassNames: string[]): void;
  fixedTrainerClassNamesLength(): boolean;
  maxTrainerClassNameLength(): number;
  randomizeTrainerClassNames(settings: Settings): void;
  getDoublesTrainerClasses(): number[];

  // Items
  getAllowedItems(): ItemList;
  getNonBadItems(): ItemList;
  getEvolutionItems(): number[];
  getXItems(): number[];
  getUniqueNoSellItems(): number[];
  getRegularShopItems(): number[];
  getOPShopItems(): number[];
  getItemNames(): string[];

  // Field Items
  getRequiredFieldTMs(): number[];
  getCurrentFieldTMs(): number[];
  setFieldTMs(fieldTMs: number[]): void;
  getRegularFieldItems(): number[];
  setRegularFieldItems(items: number[]): void;
  shuffleFieldItems(): void;
  randomizeFieldItems(settings: Settings): void;

  // Special Shops
  hasShopRandomization(): boolean;
  shuffleShopItems(): void;
  randomizeShopItems(settings: Settings): void;
  getShopItems(): Map<number, Shop>;
  setShopItems(shopItems: Map<number, Shop>): void;
  setShopPrices(): void;

  // Pickup Items
  getPickupItems(): PickupItem[];
  setPickupItems(pickupItems: PickupItem[]): void;
  randomizePickupItems(settings: Settings): void;

  // In-Game Trades
  getIngameTrades(): IngameTrade[];
  setIngameTrades(trades: IngameTrade[]): void;
  randomizeIngameTrades(settings: Settings): void;
  hasDVs(): boolean;
  maxTradeNicknameLength(): number;
  maxTradeOTNameLength(): number;

  // Pokemon Evolutions
  removeImpossibleEvolutions(settings: Settings): void;
  condenseLevelEvolutions(
    maxLevel: number,
    maxIntermediateLevel: number
  ): void;
  makeEvolutionsEasier(settings: Settings): void;
  removeTimeBasedEvolutions(): void;
  getImpossibleEvoUpdates(): Set<EvolutionUpdate>;
  getEasierEvoUpdates(): Set<EvolutionUpdate>;
  getTimeBasedEvoUpdates(): Set<EvolutionUpdate>;
  randomizeEvolutions(settings: Settings): void;
  randomizeEvolutionsEveryLevel(settings: Settings): void;
  altFormesCanHaveDifferentEvolutions(): boolean;

  // Unchanging move lists
  getGameBreakingMoves(): number[];
  getIllegalMoves(): number[];
  getFieldMoves(): number[];
  getEarlyRequiredHMMoves(): number[];

  // Misc
  isYellow(): boolean;
  getROMName(): string;
  getROMCode(): string;
  getSupportLevel(): string;
  getDefaultExtension(): string;
  internalStringLength(s: string): number;
  randomizeIntroPokemon(): void;
  getMascotImage(): Uint8Array | null;
  generationOfPokemon(): number;
  writeCheckValueToROM(value: number): void;

  // Code tweaks
  miscTweaksAvailable(): number;
  applyMiscTweaks(settings: Settings): void;
  applyMiscTweak(tweak: { value: number }): void;
  isEffectivenessUpdated(): boolean;
  renderPlacementHistory(): void;

  // Forme-related methods
  hasFunctionalFormes(): boolean;
  getAbilityDependentFormes(): Pokemon[];
  getBannedFormesForPlayerPokemon(): Pokemon[];
  getBannedFormesForTrainerPokemon(): Pokemon[];
}

/**
 * Abstract factory for creating RomHandler instances.
 * Mirrors Java's RomHandler.Factory abstract class.
 */
export abstract class RomHandlerFactory {
  create(random: RandomInstance): RomHandler {
    return this.createWithLog(random, null);
  }

  abstract createWithLog(
    random: RandomInstance,
    log: LogStream | null
  ): RomHandler;

  abstract isLoadable(filename: string): boolean;
}
