import { Settings,
  BaseStatisticsMod,
  AbilitiesMod,
  StartersMod,
  TypesMod,
  EvolutionsMod,
  MovesetsMod,
  TrainersMod,
  WildPokemonMod,
  StaticPokemonMod,
  TotemPokemonMod,
  AllyPokemonMod,
  AuraMod,
  TMsMod,
  TMsHMsCompatibilityMod,
  MoveTutorMovesMod,
  MoveTutorsCompatibilityMod,
  InGameTradesMod,
  FieldItemsMod,
  ShopItemsMod,
  PickupItemsMod,
} from "./config/settings";
import type { RomHandler, LogStream } from "./romhandlers/rom-handler";
import { RandomSource } from "./utils/random-source";
import { Version } from "./utils/version";
import { MiscTweak } from "./utils/misc-tweak";
import type { IngameTrade } from "./pokemon/ingame-trade";
import type { Move } from "./pokemon/move";
import type { Pokemon } from "./pokemon/pokemon";
import type { StaticEncounter } from "./pokemon/static-encounter";
import type { TotemPokemon } from "./pokemon/totem-pokemon";
import type { EvolutionUpdate } from "./romhandlers/evolution-update";
import { MoveCategory } from "./pokemon/move-category";
import { SOSType } from "./pokemon/sos-type";

const NEWLINE = "\n";

/**
 * Helper to safely call printf on a LogStream that may not have it.
 */
function logPrintf(log: LogStream, format: string, ...args: unknown[]): void {
  if (log.printf) {
    log.printf(format, ...args);
  } else {
    log.print(sprintf(format, ...args));
  }
}

/**
 * A no-op log stream that discards all output.
 */
class NullLogStream implements LogStream {
  print(_s: string): void {}
  println(_s?: string): void {}
  printf(_format: string, ..._args: unknown[]): void {}
}

/**
 * A log stream that accumulates output into a string buffer.
 */
export class StringLogStream implements LogStream {
  private buffer: string[] = [];

  print(s: string): void {
    this.buffer.push(s);
  }

  println(s?: string): void {
    if (s !== undefined) {
      this.buffer.push(s);
    }
    this.buffer.push(NEWLINE);
  }

  printf(format: string, ...args: unknown[]): void {
    this.buffer.push(sprintf(format, ...args));
  }

  getOutput(): string {
    return this.buffer.join("");
  }
}

/**
 * Minimal sprintf implementation covering the format specifiers used in logging.
 */
function sprintf(format: string, ...args: unknown[]): string {
  let argIndex = 0;
  return format.replace(/%(-?\d*(?:\.\d+)?)(d|s|X|f|02d)/g, (_match, flags, type) => {
    const arg = args[argIndex++];
    let result: string;
    switch (type) {
      case "d":
      case "02d":
        result = String(Math.floor(Number(arg)));
        if (type === "02d") {
          result = result.padStart(2, "0");
        }
        break;
      case "s":
        result = String(arg);
        break;
      case "X":
        result = Number(arg).toString(16).toUpperCase();
        break;
      case "f":
        result = Number(arg).toFixed(flags.includes(".") ? parseInt(flags.split(".")[1]) : 6);
        break;
      default:
        result = String(arg);
    }
    // Handle width/alignment
    const widthMatch = flags.match(/^(-?)(\d+)/);
    if (widthMatch) {
      const leftAlign = widthMatch[1] === "-";
      const width = parseInt(widthMatch[2]);
      if (leftAlign) {
        result = result.padEnd(width);
      } else {
        result = result.padStart(width);
      }
    }
    return result;
  });
}

/**
 * Randomizer - Can randomize a file based on settings.
 * Output varies by seed.
 *
 * This is the orchestration layer that coordinates the entire randomization process.
 * It calls methods on the RomHandler in sequence based on Settings flags.
 *
 * Ported from Java: com.dabomstew.pkrandom.Randomizer
 */
export class Randomizer {
  private readonly settings: Settings;
  private readonly romHandler: RomHandler;
  private readonly saveAsDirectory: boolean;

  constructor(
    settings: Settings,
    romHandler: RomHandler,
    saveAsDirectory: boolean = false,
  ) {
    this.settings = settings;
    this.romHandler = romHandler;
    this.saveAsDirectory = saveAsDirectory;
  }

  randomize(filename: string): number;
  randomize(filename: string, log: LogStream): number;
  randomize(filename: string, log: LogStream, seed: bigint): number;
  randomize(filename: string, log?: LogStream, seed?: bigint): number {
    if (log === undefined) {
      return this.randomize(filename, new NullLogStream());
    }
    if (seed === undefined) {
      const pickedSeed = RandomSource.pickSeed();
      return this.randomize(filename, log, pickedSeed);
    }

    const startTime = Date.now();
    RandomSource.seed(seed);

    let checkValue = 0;

    log.println("Randomizer Version: " + Version.VERSION_STRING);
    log.println("Random Seed: " + seed);
    log.println("Settings String: " + Version.VERSION + this.settings.toString());
    log.println();

    // All possible changes that can be logged
    let movesUpdated = false;
    let movesChanged = false;
    let movesetsChanged = false;
    let pokemonTraitsChanged = false;
    let startersChanged = false;
    let evolutionsChanged = false;
    let trainersChanged = false;
    let trainerMovesetsChanged = false;
    let staticsChanged = false;
    let totemsChanged = false;
    let wildsChanged = false;
    let tmMovesChanged = false;
    let moveTutorMovesChanged = false;
    let tradesChanged = false;
    let tmsHmsCompatChanged = false;
    let tutorCompatChanged = false;
    let shopsChanged = false;

    // Limit Pokemon
    // 1. Set Pokemon pool according to limits (or lack thereof)
    // 2. If limited, remove evolutions that are outside of the pool

    this.romHandler.setPokemonPool(this.settings);

    if (this.settings.limitPokemon) {
      this.romHandler.removeEvosForPokemonPool();
    }

    // Move updates & data changes
    // 1. Update moves to a future generation
    // 2. Randomize move stats

    if (this.settings.updateMoves) {
      this.romHandler.initMoveUpdates();
      this.romHandler.updateMoves(this.settings);
      movesUpdated = true;
    }

    if (movesUpdated) {
      this.logMoveUpdates(log);
    }

    if (this.settings.randomizeMovePowers) {
      this.romHandler.randomizeMovePowers();
      movesChanged = true;
    }

    if (this.settings.randomizeMoveAccuracies) {
      this.romHandler.randomizeMoveAccuracies();
      movesChanged = true;
    }

    if (this.settings.randomizeMovePPs) {
      this.romHandler.randomizeMovePPs();
      movesChanged = true;
    }

    if (this.settings.randomizeMoveTypes) {
      this.romHandler.randomizeMoveTypes();
      movesChanged = true;
    }

    if (this.settings.randomizeMoveCategory && this.romHandler.hasPhysicalSpecialSplit()) {
      this.romHandler.randomizeMoveCategory();
      movesChanged = true;
    }

    // Misc Tweaks
    if (this.settings.currentMiscTweaks !== MiscTweak.NO_MISC_TWEAKS) {
      this.romHandler.applyMiscTweaks(this.settings);
    }

    // Update base stats to a future generation
    if (this.settings.updateBaseStats) {
      this.romHandler.updatePokemonStats(this.settings);
      pokemonTraitsChanged = true;
    }

    // Standardize EXP curves
    if (this.settings.standardizeEXPCurves) {
      this.romHandler.standardizeEXPCurves(this.settings);
    }

    // Pokemon Types
    if (this.settings.typesMod !== TypesMod.UNCHANGED) {
      this.romHandler.randomizePokemonTypes(this.settings);
      pokemonTraitsChanged = true;
    }

    // Wild Held Items
    if (this.settings.randomizeWildPokemonHeldItems) {
      this.romHandler.randomizeWildHeldItems(this.settings);
      pokemonTraitsChanged = true;
    }

    // Random Evos
    // Applied after type to pick new evos based on new types.

    if (this.settings.evolutionsMod === EvolutionsMod.RANDOM) {
      this.romHandler.randomizeEvolutions(this.settings);
      evolutionsChanged = true;
    } else if (this.settings.evolutionsMod === EvolutionsMod.RANDOM_EVERY_LEVEL) {
      this.romHandler.randomizeEvolutionsEveryLevel(this.settings);
      evolutionsChanged = true;
    }

    if (evolutionsChanged) {
      this.logEvolutionChanges(log);
    }

    // Base stat randomization
    switch (this.settings.baseStatisticsMod) {
      case BaseStatisticsMod.SHUFFLE:
        this.romHandler.shufflePokemonStats(this.settings);
        pokemonTraitsChanged = true;
        break;
      case BaseStatisticsMod.RANDOM:
        this.romHandler.randomizePokemonStats(this.settings);
        pokemonTraitsChanged = true;
        break;
      default:
        break;
    }

    // Abilities
    if (this.settings.abilitiesMod === AbilitiesMod.RANDOMIZE) {
      this.romHandler.randomizeAbilities(this.settings);
      pokemonTraitsChanged = true;
    }

    // Log Pokemon traits (stats, abilities, etc) if any have changed
    if (pokemonTraitsChanged) {
      this.logPokemonTraitChanges(log);
    } else {
      log.println("Pokemon base stats & type: unchanged" + NEWLINE);
    }

    for (const pkmn of this.romHandler.getPokemon()) {
      if (pkmn != null) {
        checkValue = Randomizer.addToCV(
          checkValue,
          pkmn.hp,
          pkmn.attack,
          pkmn.defense,
          pkmn.speed,
          pkmn.spatk,
          pkmn.spdef,
          pkmn.ability1,
          pkmn.ability2,
          pkmn.ability3,
        );
      }
    }

    // Trade evolutions removal
    if (this.settings.changeImpossibleEvolutions) {
      this.romHandler.removeImpossibleEvolutions(this.settings);
    }

    // Easier evolutions
    if (this.settings.makeEvolutionsEasier) {
      this.romHandler.condenseLevelEvolutions(40, 30);
      this.romHandler.makeEvolutionsEasier(this.settings);
    }

    // Remove time-based evolutions
    if (this.settings.removeTimeBasedEvolutions) {
      this.romHandler.removeTimeBasedEvolutions();
    }

    // Log everything afterwards, so that "impossible evolutions" can account for "easier evolutions"
    if (this.settings.changeImpossibleEvolutions) {
      log.println("--Removing Impossible Evolutions--");
      this.logUpdatedEvolutions(
        log,
        this.romHandler.getImpossibleEvoUpdates(),
        this.romHandler.getEasierEvoUpdates(),
      );
    }

    if (this.settings.makeEvolutionsEasier) {
      log.println("--Making Evolutions Easier--");
      if (this.romHandler.generationOfPokemon() !== 1) {
        log.println("Friendship evolutions now take 160 happiness (was 220).");
      }
      this.logUpdatedEvolutions(log, this.romHandler.getEasierEvoUpdates(), null);
    }

    if (this.settings.removeTimeBasedEvolutions) {
      log.println("--Removing Timed-Based Evolutions--");
      this.logUpdatedEvolutions(log, this.romHandler.getTimeBasedEvoUpdates(), null);
    }

    // Starter Pokemon
    // Applied after type to update the strings correctly based on new types
    switch (this.settings.startersMod) {
      case StartersMod.CUSTOM:
        this.romHandler.customStarters(this.settings);
        startersChanged = true;
        break;
      case StartersMod.COMPLETELY_RANDOM:
        this.romHandler.randomizeStarters(this.settings);
        startersChanged = true;
        break;
      case StartersMod.RANDOM_WITH_TWO_EVOLUTIONS:
        this.romHandler.randomizeBasicTwoEvosStarters(this.settings);
        startersChanged = true;
        break;
      default:
        break;
    }
    if (this.settings.randomizeStartersHeldItems && this.romHandler.generationOfPokemon() !== 1) {
      this.romHandler.randomizeStarterHeldItems(this.settings);
    }

    if (startersChanged) {
      this.logStarters(log);
    }

    // Move Data Log
    // Placed here so it matches its position in the randomizer interface
    if (movesChanged) {
      this.logMoveChanges(log);
    } else if (!movesUpdated) {
      log.println("Move Data: Unchanged." + NEWLINE);
    }

    // Movesets
    // 1. Randomize movesets
    // 2. Reorder moves by damage
    // Note: "Metronome only" is handled after trainers instead

    if (
      this.settings.movesetsMod !== MovesetsMod.UNCHANGED &&
      this.settings.movesetsMod !== MovesetsMod.METRONOME_ONLY
    ) {
      this.romHandler.randomizeMovesLearnt(this.settings);
      this.romHandler.randomizeEggMoves(this.settings);
      movesetsChanged = true;
    }

    if (this.settings.reorderDamagingMoves) {
      this.romHandler.orderDamagingMovesByDamage();
      movesetsChanged = true;
    }

    // Show the new movesets if applicable
    if (movesetsChanged) {
      this.logMovesetChanges(log);
    } else if (this.settings.movesetsMod === MovesetsMod.METRONOME_ONLY) {
      log.println("Pokemon Movesets: Metronome Only." + NEWLINE);
    } else {
      log.println("Pokemon Movesets: Unchanged." + NEWLINE);
    }

    // TMs

    if (
      !(this.settings.movesetsMod === MovesetsMod.METRONOME_ONLY) &&
      this.settings.tmsMod === TMsMod.RANDOM
    ) {
      this.romHandler.randomizeTMMoves(this.settings);
      tmMovesChanged = true;
    }

    if (tmMovesChanged) {
      checkValue = this.logTMMoves(log, checkValue);
    } else if (this.settings.movesetsMod === MovesetsMod.METRONOME_ONLY) {
      log.println("TM Moves: Metronome Only." + NEWLINE);
    } else {
      log.println("TM Moves: Unchanged." + NEWLINE);
    }

    // TM/HM compatibility

    switch (this.settings.tmsHmsCompatibilityMod) {
      case TMsHMsCompatibilityMod.COMPLETELY_RANDOM:
      case TMsHMsCompatibilityMod.RANDOM_PREFER_TYPE:
        this.romHandler.randomizeTMHMCompatibility(this.settings);
        tmsHmsCompatChanged = true;
        break;
      case TMsHMsCompatibilityMod.FULL:
        this.romHandler.fullTMHMCompatibility();
        tmsHmsCompatChanged = true;
        break;
      default:
        break;
    }

    if (this.settings.tmLevelUpMoveSanity) {
      this.romHandler.ensureTMCompatSanity();
      if (this.settings.tmsFollowEvolutions) {
        this.romHandler.ensureTMEvolutionSanity();
      }
      tmsHmsCompatChanged = true;
    }

    if (this.settings.fullHMCompat) {
      this.romHandler.fullHMCompatibility();
      tmsHmsCompatChanged = true;
    }

    // Copy TM/HM compatibility to cosmetic formes if it was changed at all, and log changes
    if (tmsHmsCompatChanged) {
      this.romHandler.copyTMCompatibilityToCosmeticFormes();
      this.logTMHMCompatibility(log);
    }

    // Move Tutors
    if (this.romHandler.hasMoveTutors()) {
      const oldMtMoves = this.romHandler.getMoveTutorMoves();

      if (
        !(this.settings.movesetsMod === MovesetsMod.METRONOME_ONLY) &&
        this.settings.moveTutorMovesMod === MoveTutorMovesMod.RANDOM
      ) {
        this.romHandler.randomizeMoveTutorMoves(this.settings);
        moveTutorMovesChanged = true;
      }

      if (moveTutorMovesChanged) {
        checkValue = this.logMoveTutorMoves(log, checkValue, oldMtMoves);
      } else if (this.settings.movesetsMod === MovesetsMod.METRONOME_ONLY) {
        log.println("Move Tutor Moves: Metronome Only." + NEWLINE);
      } else {
        log.println("Move Tutor Moves: Unchanged." + NEWLINE);
      }

      // Move Tutor Compatibility

      switch (this.settings.moveTutorsCompatibilityMod) {
        case MoveTutorsCompatibilityMod.COMPLETELY_RANDOM:
        case MoveTutorsCompatibilityMod.RANDOM_PREFER_TYPE:
          this.romHandler.randomizeMoveTutorCompatibility(this.settings);
          tutorCompatChanged = true;
          break;
        case MoveTutorsCompatibilityMod.FULL:
          this.romHandler.fullMoveTutorCompatibility();
          tutorCompatChanged = true;
          break;
        default:
          break;
      }

      if (this.settings.tutorLevelUpMoveSanity) {
        this.romHandler.ensureMoveTutorCompatSanity();
        if (this.settings.tutorFollowEvolutions) {
          this.romHandler.ensureMoveTutorEvolutionSanity();
        }
        tutorCompatChanged = true;
      }

      // Copy move tutor compatibility to cosmetic formes if it was changed at all
      if (tutorCompatChanged) {
        this.romHandler.copyMoveTutorCompatibilityToCosmeticFormes();
        this.logTutorCompatibility(log);
      }
    }

    // Trainer Pokemon

    if (
      this.settings.additionalRegularTrainerPokemon > 0 ||
      this.settings.additionalImportantTrainerPokemon > 0 ||
      this.settings.additionalBossTrainerPokemon > 0
    ) {
      this.romHandler.addTrainerPokemon(this.settings);
      trainersChanged = true;
    }

    if (this.settings.doubleBattleMode) {
      this.romHandler.doubleBattleMode();
      trainersChanged = true;
    }

    switch (this.settings.trainersMod) {
      case TrainersMod.RANDOM:
      case TrainersMod.DISTRIBUTED:
      case TrainersMod.MAINPLAYTHROUGH:
      case TrainersMod.TYPE_THEMED:
      case TrainersMod.TYPE_THEMED_ELITE4_GYMS:
        this.romHandler.randomizeTrainerPokes(this.settings);
        trainersChanged = true;
        break;
      default:
        if (this.settings.trainersLevelModified) {
          this.romHandler.onlyChangeTrainerLevels(this.settings);
          trainersChanged = true;
        }
        break;
    }

    if (
      (this.settings.trainersMod !== TrainersMod.UNCHANGED ||
        this.settings.startersMod !== StartersMod.UNCHANGED) &&
      this.settings.rivalCarriesStarterThroughout
    ) {
      this.romHandler.rivalCarriesStarter();
      trainersChanged = true;
    }

    if (this.settings.trainersForceFullyEvolved) {
      this.romHandler.forceFullyEvolvedTrainerPokes(this.settings);
      trainersChanged = true;
    }

    if (this.settings.betterTrainerMovesets) {
      this.romHandler.pickTrainerMovesets(this.settings);
      trainersChanged = true;
      trainerMovesetsChanged = true;
    }

    if (
      this.settings.randomizeHeldItemsForBossTrainerPokemon ||
      this.settings.randomizeHeldItemsForImportantTrainerPokemon ||
      this.settings.randomizeHeldItemsForRegularTrainerPokemon
    ) {
      this.romHandler.randomizeTrainerHeldItems(this.settings);
      trainersChanged = true;
    }

    const originalTrainerNames = this.getTrainerNames();
    let trainerNamesChanged = false;

    // Trainer names & class names randomization
    if (this.romHandler.canChangeTrainerText()) {
      if (this.settings.randomizeTrainerClassNames) {
        this.romHandler.randomizeTrainerClassNames(this.settings);
        trainersChanged = true;
        trainerNamesChanged = true;
      }

      if (this.settings.randomizeTrainerNames) {
        this.romHandler.randomizeTrainerNames(this.settings);
        trainersChanged = true;
        trainerNamesChanged = true;
      }
    }

    if (trainersChanged) {
      this.maybeLogTrainerChanges(log, originalTrainerNames, trainerNamesChanged, trainerMovesetsChanged);
    } else {
      log.println("Trainers: Unchanged." + NEWLINE);
    }

    // Apply metronome only mode now that trainers have been dealt with
    if (this.settings.movesetsMod === MovesetsMod.METRONOME_ONLY) {
      this.romHandler.metronomeOnlyMode();
    }

    const trainers = this.romHandler.getTrainers();
    for (const t of trainers) {
      for (const tpk of t.pokemon) {
        checkValue = Randomizer.addToCV(checkValue, tpk.level, tpk.pokemon.number);
      }
    }

    // Static Pokemon
    if (this.romHandler.canChangeStaticPokemon()) {
      const oldStatics = this.romHandler.getStaticPokemon();
      if (this.settings.staticPokemonMod !== StaticPokemonMod.UNCHANGED) {
        this.romHandler.randomizeStaticPokemon(this.settings);
        staticsChanged = true;
      } else if (this.settings.staticLevelModified) {
        this.romHandler.onlyChangeStaticLevels(this.settings);
        staticsChanged = true;
      }

      if (staticsChanged) {
        checkValue = this.logStaticPokemon(log, checkValue, oldStatics);
      } else {
        log.println("Static Pokemon: Unchanged." + NEWLINE);
      }
    }

    // Totem Pokemon
    if (this.romHandler.generationOfPokemon() === 7) {
      const oldTotems = this.romHandler.getTotemPokemon();
      if (
        this.settings.totemPokemonMod !== TotemPokemonMod.UNCHANGED ||
        this.settings.allyPokemonMod !== AllyPokemonMod.UNCHANGED ||
        this.settings.auraMod !== AuraMod.UNCHANGED ||
        this.settings.randomizeTotemHeldItems ||
        this.settings.totemLevelsModified
      ) {
        this.romHandler.randomizeTotemPokemon(this.settings);
        totemsChanged = true;
      }

      if (totemsChanged) {
        checkValue = this.logTotemPokemon(log, checkValue, oldTotems);
      } else {
        log.println("Totem Pokemon: Unchanged." + NEWLINE);
      }
    }

    // Wild Pokemon
    // 1. Update catch rates
    // 2. Randomize Wild Pokemon

    if (this.settings.useMinimumCatchRate) {
      this.romHandler.changeCatchRates(this.settings);
    }

    switch (this.settings.wildPokemonMod) {
      case WildPokemonMod.RANDOM:
        this.romHandler.randomEncounters(this.settings);
        wildsChanged = true;
        break;
      case WildPokemonMod.AREA_MAPPING:
        this.romHandler.area1to1Encounters(this.settings);
        wildsChanged = true;
        break;
      case WildPokemonMod.GLOBAL_MAPPING:
        this.romHandler.game1to1Encounters(this.settings);
        wildsChanged = true;
        break;
      default:
        if (this.settings.wildLevelsModified) {
          this.romHandler.onlyChangeWildLevels(this.settings);
          wildsChanged = true;
        }
        break;
    }

    if (wildsChanged) {
      this.logWildPokemonChanges(log);
    } else {
      log.println("Wild Pokemon: Unchanged." + NEWLINE);
    }

    const useTimeBasedEncounters =
      this.settings.useTimeBasedEncounters ||
      (this.settings.wildPokemonMod === WildPokemonMod.UNCHANGED && this.settings.wildLevelsModified);
    const encounters = this.romHandler.getEncounters(useTimeBasedEncounters);
    for (const es of encounters) {
      for (const e of es.encounters) {
        if (e.pokemon != null) {
          checkValue = Randomizer.addToCV(checkValue, e.level, e.pokemon.number);
        }
      }
    }

    // In-game trades

    const oldTrades = this.romHandler.getIngameTrades();
    switch (this.settings.inGameTradesMod) {
      case InGameTradesMod.RANDOMIZE_GIVEN:
      case InGameTradesMod.RANDOMIZE_GIVEN_AND_REQUESTED:
        this.romHandler.randomizeIngameTrades(this.settings);
        tradesChanged = true;
        break;
      default:
        break;
    }

    if (tradesChanged) {
      this.logTrades(log, oldTrades);
    }

    // Field Items
    switch (this.settings.fieldItemsMod) {
      case FieldItemsMod.SHUFFLE:
        this.romHandler.shuffleFieldItems();
        break;
      case FieldItemsMod.RANDOM:
      case FieldItemsMod.RANDOM_EVEN:
        this.romHandler.randomizeFieldItems(this.settings);
        break;
      default:
        break;
    }

    // Shops

    switch (this.settings.shopItemsMod) {
      case ShopItemsMod.SHUFFLE:
        this.romHandler.shuffleShopItems();
        shopsChanged = true;
        break;
      case ShopItemsMod.RANDOM:
        this.romHandler.randomizeShopItems(this.settings);
        shopsChanged = true;
        break;
      default:
        break;
    }

    if (shopsChanged) {
      this.logShops(log);
    }

    // Pickup Items
    if (this.settings.pickupItemsMod === PickupItemsMod.RANDOM) {
      this.romHandler.randomizePickupItems(this.settings);
      this.logPickupItems(log);
    }

    // Intro Pokemon...
    this.romHandler.randomizeIntroPokemon();

    // Record check value?
    this.romHandler.writeCheckValueToROM(checkValue);

    // Save
    if (this.saveAsDirectory) {
      this.romHandler.saveRomDirectory(filename);
    } else {
      this.romHandler.saveRomFile(filename, Number(seed));
    }

    // Log tail
    let gameName = this.romHandler.getROMName();
    if (this.romHandler.hasGameUpdateLoaded()) {
      gameName = gameName + " (" + this.romHandler.getGameUpdateVersion() + ")";
    }
    log.println("------------------------------------------------------------------");
    log.println("Randomization of " + gameName + " completed.");
    log.println("Time elapsed: " + (Date.now() - startTime) + "ms");
    log.println("RNG Calls: " + RandomSource.callsSinceSeed());
    log.println("------------------------------------------------------------------");
    log.println();

    // Diagnostics
    log.println("--ROM Diagnostics--");
    if (!this.romHandler.isRomValid()) {
      log.println("WARNING: ROM may not be valid.");
    }
    this.romHandler.printRomDiagnostics(log);

    return checkValue;
  }

  // ---- Private logging helper methods ----

  private logMoveTutorMoves(log: LogStream, checkValue: number, oldMtMoves: number[]): number {
    log.println("--Move Tutor Moves--");
    const newMtMoves = this.romHandler.getMoveTutorMoves();
    const moves = this.romHandler.getMoves();
    for (let i = 0; i < newMtMoves.length; i++) {
      const oldMove = moves[oldMtMoves[i]];
      const newMove = moves[newMtMoves[i]];
      logPrintf(
        log,
        "%-10s -> %-10s" + NEWLINE,
        oldMove ? oldMove.name : "???",
        newMove ? newMove.name : "???",
      );
      checkValue = Randomizer.addToCV(checkValue, newMtMoves[i]);
    }
    log.println();
    return checkValue;
  }

  private logTMMoves(log: LogStream, checkValue: number): number {
    log.println("--TM Moves--");
    const tmMoves = this.romHandler.getTMMoves();
    const moves = this.romHandler.getMoves();
    for (let i = 0; i < tmMoves.length; i++) {
      const move = moves[tmMoves[i]];
      logPrintf(log, "TM%02d %s" + NEWLINE, i + 1, move ? move.name : "???");
      checkValue = Randomizer.addToCV(checkValue, tmMoves[i]);
    }
    log.println();
    return checkValue;
  }

  private logTrades(log: LogStream, oldTrades: IngameTrade[]): void {
    log.println("--In-Game Trades--");
    const newTrades = this.romHandler.getIngameTrades();
    const size = oldTrades.length;
    for (let i = 0; i < size; i++) {
      const oldT = oldTrades[i];
      const newT = newTrades[i];
      logPrintf(
        log,
        "Trade %-11s -> %-11s the %-11s        ->      %-11s -> %-15s the %s" + NEWLINE,
        oldT.requestedPokemon != null ? oldT.requestedPokemon.fullName() : "Any",
        oldT.nickname,
        oldT.givenPokemon.fullName(),
        newT.requestedPokemon != null ? newT.requestedPokemon.fullName() : "Any",
        newT.nickname,
        newT.givenPokemon.fullName(),
      );
    }
    log.println();
  }

  private logMovesetChanges(log: LogStream): void {
    log.println("--Pokemon Movesets--");
    const movesets: string[] = [];
    const moveData = this.romHandler.getMovesLearnt();
    const eggMoves = this.romHandler.getEggMoves();
    const moves = this.romHandler.getMoves();
    const pkmnList = this.romHandler.getPokemonInclFormes();
    let i = 1;
    for (const pkmn of pkmnList) {
      if (pkmn == null || pkmn.actuallyCosmetic) {
        continue;
      }
      let evoStr: string;
      try {
        evoStr = " -> " + pkmn.evolutionsFrom[0].to.fullName();
      } catch {
        evoStr = " (no evolution)";
      }

      let sb = "";

      if (this.romHandler.generationOfPokemon() === 1) {
        sb += sprintf("%03d %s", i, pkmn.fullName()) + evoStr + NEWLINE;
        sb += sprintf("HP   %-3d", pkmn.hp) + NEWLINE;
        sb += sprintf("ATK  %-3d", pkmn.attack) + NEWLINE;
        sb += sprintf("DEF  %-3d", pkmn.defense) + NEWLINE;
        sb += sprintf("SPEC %-3d", pkmn.special) + NEWLINE;
        sb += sprintf("SPE  %-3d", pkmn.speed) + NEWLINE;
      } else {
        sb += sprintf("%03d %s", i, pkmn.fullName()) + evoStr + NEWLINE;
        sb += sprintf("HP  %-3d", pkmn.hp) + NEWLINE;
        sb += sprintf("ATK %-3d", pkmn.attack) + NEWLINE;
        sb += sprintf("DEF %-3d", pkmn.defense) + NEWLINE;
        sb += sprintf("SPA %-3d", pkmn.spatk) + NEWLINE;
        sb += sprintf("SPD %-3d", pkmn.spdef) + NEWLINE;
        sb += sprintf("SPE %-3d", pkmn.speed) + NEWLINE;
      }

      i++;

      const data = moveData.get(pkmn.number);
      if (data) {
        for (const ml of data) {
          try {
            const move = moves[ml.move];
            if (ml.level === 0) {
              sb += "Learned upon evolution: " + (move ? move.name : "???") + NEWLINE;
            } else {
              sb += "Level " + sprintf("%-2d", ml.level) + ": " + (move ? move.name : "???") + NEWLINE;
            }
          } catch {
            sb += "invalid move at level" + ml.level;
          }
        }
      }
      const eggMove = eggMoves.get(pkmn.number);
      if (eggMove != null && eggMove.length !== 0) {
        sb += "Egg Moves:" + NEWLINE;
        for (const move of eggMove) {
          const m = moves[move];
          sb += " - " + (m ? m.name : "???") + NEWLINE;
        }
      }

      movesets.push(sb);
    }
    movesets.sort();
    for (const moveset of movesets) {
      log.println(moveset);
    }
    log.println();
  }

  private logMoveUpdates(log: LogStream): void {
    log.println("--Move Updates--");
    const moves = this.romHandler.getMoves();
    const moveUpdates = this.romHandler.getMoveUpdates();
    for (const [moveID, changes] of moveUpdates) {
      const mv = moves[moveID];
      if (!mv) continue;
      const nonTypeChanges: string[] = [];
      if (changes[0]) {
        nonTypeChanges.push(`${mv.power} power`);
      }
      if (changes[1]) {
        nonTypeChanges.push(`${mv.pp} PP`);
      }
      if (changes[2]) {
        nonTypeChanges.push(`${Math.floor(mv.hitratio)}% accuracy`);
      }
      let logStr = "Made " + mv.name;
      // type or not?
      if (changes[3]) {
        logStr += " be " + (mv.type != null ? String(mv.type) : "???") + "-type";
        if (nonTypeChanges.length > 0) {
          logStr += " and";
        }
      }
      if (changes[4]) {
        if (mv.category === MoveCategory.PHYSICAL) {
          logStr += " a Physical move";
        } else if (mv.category === MoveCategory.SPECIAL) {
          logStr += " a Special move";
        } else if (mv.category === MoveCategory.STATUS) {
          logStr += " a Status move";
        }
      }
      if (nonTypeChanges.length > 0) {
        logStr += " have ";
        if (nonTypeChanges.length === 3) {
          logStr += nonTypeChanges[0] + ", " + nonTypeChanges[1] + " and " + nonTypeChanges[2];
        } else if (nonTypeChanges.length === 2) {
          logStr += nonTypeChanges[0] + " and " + nonTypeChanges[1];
        } else {
          logStr += nonTypeChanges[0];
        }
      }
      log.println(logStr);
    }
    log.println();
  }

  private logEvolutionChanges(log: LogStream): void {
    log.println("--Randomized Evolutions--");
    const allPokes = this.romHandler.getPokemonInclFormes();
    for (const pk of allPokes) {
      if (pk != null && !pk.actuallyCosmetic) {
        const numEvos = pk.evolutionsFrom.length;
        if (numEvos > 0) {
          let evoStr = pk.evolutionsFrom[0].toFullName();
          for (let i = 1; i < numEvos; i++) {
            if (i === numEvos - 1) {
              evoStr += " and " + pk.evolutionsFrom[i].toFullName();
            } else {
              evoStr += ", " + pk.evolutionsFrom[i].toFullName();
            }
          }
          logPrintf(log, "%-15s -> %-15s" + NEWLINE, pk.fullName(), evoStr);
        }
      }
    }

    log.println();
  }

  private logPokemonTraitChanges(log: LogStream): void {
    const allPokes = this.romHandler.getPokemonInclFormes();
    const itemNames = this.romHandler.getItemNames();
    // Log base stats & types
    log.println("--Pokemon Base Stats & Types--");
    if (this.romHandler.generationOfPokemon() === 1) {
      log.println("NUM|NAME      |TYPE             |  HP| ATK| DEF| SPE|SPEC");
      for (const pkmn of allPokes) {
        if (pkmn != null) {
          let typeString = pkmn.primaryType == null ? "???" : String(pkmn.primaryType);
          if (pkmn.secondaryType != null) {
            typeString += "/" + String(pkmn.secondaryType);
          }
          logPrintf(
            log,
            "%3d|%-10s|%-17s|%4d|%4d|%4d|%4d|%4d" + NEWLINE,
            pkmn.number,
            pkmn.fullName(),
            typeString,
            pkmn.hp,
            pkmn.attack,
            pkmn.defense,
            pkmn.speed,
            pkmn.special,
          );
        }
      }
    } else {
      let nameSp = "      ";
      let nameSpFormat = "%-13s";
      let abSp = "    ";
      let abSpFormat = "%-12s";
      const gen = this.romHandler.generationOfPokemon();
      if (gen === 5) {
        nameSp = "         ";
      } else if (gen === 6) {
        nameSp = "            ";
        nameSpFormat = "%-16s";
        abSp = "      ";
        abSpFormat = "%-14s";
      } else if (gen >= 7) {
        nameSp = "            ";
        nameSpFormat = "%-16s";
        abSp = "        ";
        abSpFormat = "%-16s";
      }

      let header = "NUM|NAME" + nameSp + "|TYPE             |  HP| ATK| DEF|SATK|SDEF| SPD";
      const abils = this.romHandler.abilitiesPerPokemon();
      for (let a = 0; a < abils; a++) {
        header += "|ABILITY" + (a + 1) + abSp;
      }
      header += "|ITEM";
      log.println(header);
      let idx = 0;
      for (const pkmn of allPokes) {
        if (pkmn != null && !pkmn.actuallyCosmetic) {
          idx++;
          let typeString = pkmn.primaryType == null ? "???" : String(pkmn.primaryType);
          if (pkmn.secondaryType != null) {
            typeString += "/" + String(pkmn.secondaryType);
          }
          let line = sprintf(
            "%3d|" + nameSpFormat + "|%-17s|%4d|%4d|%4d|%4d|%4d|%4d",
            idx,
            pkmn.fullName(),
            typeString,
            pkmn.hp,
            pkmn.attack,
            pkmn.defense,
            pkmn.spatk,
            pkmn.spdef,
            pkmn.speed,
          );
          if (abils > 0) {
            line += sprintf(
              "|" + abSpFormat + "|" + abSpFormat,
              this.romHandler.abilityName(pkmn.ability1),
              pkmn.ability1 === pkmn.ability2 ? "--" : this.romHandler.abilityName(pkmn.ability2),
            );
            if (abils > 2) {
              line += sprintf("|" + abSpFormat, this.romHandler.abilityName(pkmn.ability3));
            }
          }
          line += "|";
          if (pkmn.guaranteedHeldItem > 0) {
            line += itemNames[pkmn.guaranteedHeldItem] + " (100%)";
          } else {
            let itemCount = 0;
            if (pkmn.commonHeldItem > 0) {
              itemCount++;
              line += itemNames[pkmn.commonHeldItem] + " (common)";
            }
            if (pkmn.rareHeldItem > 0) {
              if (itemCount > 0) {
                line += ", ";
              }
              itemCount++;
              line += itemNames[pkmn.rareHeldItem] + " (rare)";
            }
            if (pkmn.darkGrassHeldItem > 0) {
              if (itemCount > 0) {
                line += ", ";
              }
              line += itemNames[pkmn.darkGrassHeldItem] + " (dark grass only)";
            }
          }
          log.println(line);
        }
      }
    }
    log.println();
  }

  private logTMHMCompatibility(log: LogStream): void {
    log.println("--TM Compatibility--");
    const compat = this.romHandler.getTMHMCompatibility();
    const tmHMs = [...this.romHandler.getTMMoves(), ...this.romHandler.getHMMoves()];
    const moveData = this.romHandler.getMoves();
    this.logCompatibility(log, compat, tmHMs, moveData, true);
  }

  private logTutorCompatibility(log: LogStream): void {
    log.println("--Move Tutor Compatibility--");
    const compat = this.romHandler.getMoveTutorCompatibility();
    const tutorMoves = this.romHandler.getMoveTutorMoves();
    const moveData = this.romHandler.getMoves();
    this.logCompatibility(log, compat, tutorMoves, moveData, false);
  }

  private logCompatibility(
    log: LogStream,
    compat: Map<Pokemon, boolean[]>,
    moveList: number[],
    moveData: (Move | null)[],
    includeTMNumber: boolean,
  ): void {
    const tmCount = this.romHandler.getTMCount();
    for (const [pkmn, flags] of compat) {
      if (pkmn.actuallyCosmetic) continue;

      let nameSpFormat = "%-14s";
      if (this.romHandler.generationOfPokemon() >= 6) {
        nameSpFormat = "%-17s";
      }
      let line = sprintf("%3d " + nameSpFormat, pkmn.number, pkmn.fullName() + " ");

      for (let i = 1; i < flags.length; i++) {
        const move = moveData[moveList[i - 1]];
        let moveName = move ? move.name : "";
        if (moveName.length === 0) {
          moveName = "(BLANK)";
        }
        const moveNameLength = moveName.length;
        if (flags[i]) {
          if (includeTMNumber) {
            if (i <= tmCount) {
              line += "|TM" + String(i).padStart(2, "0") + " " + moveName.padStart(moveNameLength) + " ";
            } else {
              line += "|HM" + String(i - tmCount).padStart(2, "0") + " " + moveName.padStart(moveNameLength) + " ";
            }
          } else {
            line += "|" + moveName.padStart(moveNameLength) + " ";
          }
        } else {
          if (includeTMNumber) {
            line += "| " + "-".padStart(moveNameLength + 4) + " ";
          } else {
            line += "| " + "-".padStart(moveNameLength - 1) + " ";
          }
        }
      }
      line += "|";
      log.println(line);
    }
    log.println("");
  }

  private logUpdatedEvolutions(
    log: LogStream,
    updatedEvolutions: Set<EvolutionUpdate>,
    otherUpdatedEvolutions: Set<EvolutionUpdate> | null,
  ): void {
    for (const evo of updatedEvolutions) {
      if (otherUpdatedEvolutions != null && otherUpdatedEvolutions.has(evo)) {
        log.println(evo.toString() + ' (Overwritten by "Make Evolutions Easier", see below)');
      } else {
        log.println(evo.toString());
      }
    }
    log.println();
  }

  private logStarters(log: LogStream): void {
    switch (this.settings.startersMod) {
      case StartersMod.CUSTOM:
        log.println("--Custom Starters--");
        break;
      case StartersMod.COMPLETELY_RANDOM:
        log.println("--Random Starters--");
        break;
      case StartersMod.RANDOM_WITH_TWO_EVOLUTIONS:
        log.println("--Random 2-Evolution Starters--");
        break;
      default:
        break;
    }

    const starters = this.romHandler.getPickedStarters();
    let i = 1;
    for (const starter of starters) {
      log.println("Set starter " + i + " to " + starter.fullName());
      i++;
    }
    log.println();
  }

  private logWildPokemonChanges(log: LogStream): void {
    log.println("--Wild Pokemon--");
    const useTimeBasedEncounters =
      this.settings.useTimeBasedEncounters ||
      (this.settings.wildPokemonMod === WildPokemonMod.UNCHANGED && this.settings.wildLevelsModified);
    const encounters = this.romHandler.getEncounters(useTimeBasedEncounters);
    let idx = 0;
    for (const es of encounters) {
      idx++;
      let line = "Set #" + idx + " ";
      if (es.displayName != null) {
        line += "- " + es.displayName + " ";
      }
      line += "(rate=" + es.rate + ")";
      log.println(line);
      for (const e of es.encounters) {
        let sb = "";
        if (e.isSOS) {
          switch (e.sosType) {
            case SOSType.RAIN:
              sb += "Rain SOS: ";
              break;
            case SOSType.HAIL:
              sb += "Hail SOS: ";
              break;
            case SOSType.SAND:
              sb += "Sand SOS: ";
              break;
            default:
              sb += "  SOS: ";
              break;
          }
        }
        const pokemon = e.pokemon;
        if (pokemon != null) {
          sb += pokemon.fullName() + " Lv";
          if (e.maxLevel > 0 && e.maxLevel !== e.level) {
            sb += "s " + e.level + "-" + e.maxLevel;
          } else {
            sb += e.level;
          }
          const whitespaceFormat = this.romHandler.generationOfPokemon() === 7 ? "%-31s" : "%-25s";
          let encounterLine = sprintf(whitespaceFormat, sb);
          if (this.romHandler.generationOfPokemon() === 1) {
            encounterLine += sprintf(
              "HP %-3d ATK %-3d DEF %-3d SPECIAL %-3d SPEED %-3d",
              pokemon.hp,
              pokemon.attack,
              pokemon.defense,
              pokemon.special,
              pokemon.speed,
            );
          } else {
            encounterLine += sprintf(
              "HP %-3d ATK %-3d DEF %-3d SPATK %-3d SPDEF %-3d SPEED %-3d",
              pokemon.hp,
              pokemon.attack,
              pokemon.defense,
              pokemon.spatk,
              pokemon.spdef,
              pokemon.speed,
            );
          }
          log.println(encounterLine);
        }
      }
      log.println();
    }
    log.println();
  }

  private maybeLogTrainerChanges(
    log: LogStream,
    originalTrainerNames: string[],
    trainerNamesChanged: boolean,
    logTrainerMovesets: boolean,
  ): void {
    log.println("--Trainers Pokemon--");
    const trainers = this.romHandler.getTrainers();
    for (const t of trainers) {
      let line = "#" + t.index + " ";
      const originalTrainerName = originalTrainerNames[t.index] || "";
      let currentTrainerName = "";
      if (t.fullDisplayName != null) {
        currentTrainerName = t.fullDisplayName;
      } else if (t.name != null) {
        currentTrainerName = t.name;
      }
      if (currentTrainerName !== "") {
        if (trainerNamesChanged) {
          line += "(" + originalTrainerName + " => " + currentTrainerName + ")";
        } else {
          line += "(" + currentTrainerName + ")";
        }
      }
      if (t.offset !== 0) {
        line += "@" + t.offset.toString(16).toUpperCase();
      }

      const itemNames = this.romHandler.getItemNames();
      if (logTrainerMovesets) {
        log.println(line);
        for (const tpk of t.pokemon) {
          const moves = this.romHandler.getMoves();
          let tpkLine = sprintf(tpk.toString(), itemNames[tpk.heldItem]);
          tpkLine += ", Ability: " + this.romHandler.abilityName(this.romHandler.getAbilityForTrainerPokemon(tpk));
          tpkLine += " - ";
          let first = true;
          for (const move of tpk.moves) {
            if (move !== 0) {
              if (!first) {
                tpkLine += ", ";
              }
              const m = moves[move];
              tpkLine += m ? m.name : "???";
              first = false;
            }
          }
          log.println(tpkLine);
        }
      } else {
        line += " - ";
        let first = true;
        for (const tpk of t.pokemon) {
          if (!first) {
            line += ", ";
          }
          line += sprintf(tpk.toString(), itemNames[tpk.heldItem]);
          first = false;
        }
      }
      log.println(line);
    }
    log.println();
  }

  private logStaticPokemon(
    log: LogStream,
    checkValue: number,
    oldStatics: StaticEncounter[],
  ): number {
    const newStatics = this.romHandler.getStaticPokemon();

    log.println("--Static Pokemon--");
    const seenPokemon = new Map<string, number>();
    for (let i = 0; i < oldStatics.length; i++) {
      const oldP = oldStatics[i];
      const newP = newStatics[i];
      checkValue = Randomizer.addToCV(checkValue, newP.pkmn.number);
      const oldStaticString = oldP.toString(this.settings.staticLevelModified);
      let line = oldStaticString;
      if (seenPokemon.has(oldStaticString)) {
        let amount = seenPokemon.get(oldStaticString)!;
        line += "(" + ++amount + ")";
        seenPokemon.set(oldStaticString, amount);
      } else {
        seenPokemon.set(oldStaticString, 1);
      }
      line += " => " + newP.toString(this.settings.staticLevelModified);
      log.println(line);
    }
    log.println();

    return checkValue;
  }

  private logTotemPokemon(
    log: LogStream,
    checkValue: number,
    oldTotems: TotemPokemon[],
  ): number {
    const newTotems = this.romHandler.getTotemPokemon();
    const itemNames = this.romHandler.getItemNames();
    log.println("--Totem Pokemon--");
    for (let i = 0; i < oldTotems.length; i++) {
      const oldP = oldTotems[i];
      const newP = newTotems[i];
      checkValue = Randomizer.addToCV(checkValue, newP.pkmn.number);
      log.println(oldP.pkmn.fullName() + " =>");
      logPrintf(log, newP.toString(), itemNames[newP.heldItem]);
    }
    log.println();

    return checkValue;
  }

  private logMoveChanges(log: LogStream): void {
    log.println("--Move Data--");
    let header = "NUM|NAME           |TYPE    |POWER|ACC.|PP";
    if (this.romHandler.hasPhysicalSpecialSplit()) {
      header += " |CATEGORY";
    }
    log.println(header);
    const allMoves = this.romHandler.getMoves();
    for (const mv of allMoves) {
      if (mv != null) {
        const mvType = mv.type == null ? "???" : String(mv.type);
        let line = sprintf(
          "%3d|%-15s|%-8s|%5d|%4d|%3d",
          mv.internalId,
          mv.name,
          mvType,
          mv.power,
          Math.floor(mv.hitratio),
          mv.pp,
        );
        if (this.romHandler.hasPhysicalSpecialSplit()) {
          line += sprintf("| %s", String(mv.category));
        }
        log.println(line);
      }
    }
    log.println();
  }

  private logShops(log: LogStream): void {
    const itemNames = this.romHandler.getItemNames();
    log.println("--Shops--");
    const shopsDict = this.romHandler.getShopItems();
    for (const [_shopID, shop] of shopsDict) {
      logPrintf(log, "%s", shop.name);
      log.println();
      const shopItems = shop.items ?? [];
      for (const shopItemID of shopItems) {
        logPrintf(log, "- %5s", itemNames[shopItemID]);
        log.println();
      }
      log.println();
    }
    log.println();
  }

  private logPickupItems(log: LogStream): void {
    const pickupItems = this.romHandler.getPickupItems();
    const itemNames = this.romHandler.getItemNames();
    log.println("--Pickup Items--");
    for (let levelRange = 0; levelRange < 10; levelRange++) {
      const startingLevel = levelRange * 10 + 1;
      const endingLevel = (levelRange + 1) * 10;
      logPrintf(log, "Level %s-%s", startingLevel, endingLevel);
      log.println();
      // Build probability -> items map sorted descending
      const itemListPerProbability = new Map<number, string[]>();
      for (const pickupItem of pickupItems) {
        const probability = pickupItem.probabilities[levelRange];
        if (probability > 0) {
          if (itemListPerProbability.has(probability)) {
            itemListPerProbability.get(probability)!.push(itemNames[pickupItem.item]);
          } else {
            itemListPerProbability.set(probability, [itemNames[pickupItem.item]]);
          }
        }
      }
      // Sort by probability descending
      const sortedEntries = [...itemListPerProbability.entries()].sort((a, b) => b[0] - a[0]);
      for (const [probability, itemList] of sortedEntries) {
        const itemsString = itemList.join(", ");
        logPrintf(log, "%d%%: %s", probability, itemsString);
        log.println();
      }
      log.println();
    }
    log.println();
  }

  private getTrainerNames(): string[] {
    const trainerNames: string[] = [""];  // for index 0
    const trainers = this.romHandler.getTrainers();
    for (const t of trainers) {
      if (t.fullDisplayName != null) {
        trainerNames.push(t.fullDisplayName);
      } else if (t.name != null) {
        trainerNames.push(t.name);
      } else {
        trainerNames.push("");
      }
    }
    return trainerNames;
  }

  private static addToCV(checkValue: number, ...values: number[]): number {
    for (const value of values) {
      checkValue = Randomizer.rotateLeft(checkValue, 3);
      checkValue ^= value;
    }
    return checkValue;
  }

  /**
   * Rotate a 32-bit integer left by the given number of bits,
   * matching Java's Integer.rotateLeft.
   */
  private static rotateLeft(value: number, bits: number): number {
    // Ensure 32-bit unsigned
    value = value >>> 0;
    return ((value << bits) | (value >>> (32 - bits))) >>> 0;
  }
}
