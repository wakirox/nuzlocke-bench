/**
 * Gen1RomHandler.ts - randomizer handler for R/B/Y.
 *
 * Part of "Universal Pokemon Randomizer ZX" by the UPR-ZX team
 * Originally part of "Universal Pokemon Randomizer" by Dabomstew
 * Pokemon and any associated names and the like are
 * trademark and (C) Nintendo 1996-2020.
 *
 * Licensed under the terms of the GPL v3+.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { AbstractGBCRomHandler } from './abstract-gbc-rom-handler';
import type { LogStream, RomHandler } from './rom-handler';
import { TrainerNameMode, RomHandlerFactory } from './rom-handler';
import type { RandomInstance } from '../utils/random-source';
import type { Settings } from '../config/settings';
import * as Gen1Constants from '../constants/gen1-constants';
import * as GBConstants from '../constants/gb-constants';
import * as GlobalConstants from '../constants/global-constants';
import * as Moves from '../constants/moves';
import * as Species from '../constants/species';
import { Pokemon } from '../pokemon/pokemon';
import { Gen1Pokemon } from '../pokemon/gen1-pokemon';
import { Move, MoveStatChange } from '../pokemon/move';
import { MoveCategory } from '../pokemon/move-category';
import { ExpCurve, expCurveFromByte, expCurveToByte } from '../pokemon/exp-curve';
import { StatChangeType } from '../pokemon/stat-change-type';
import { StatChangeMoveType } from '../pokemon/stat-change-move-type';
import { StatusMoveType } from '../pokemon/status-move-type';
import { StatusType } from '../pokemon/status-type';
import { CriticalChance } from '../pokemon/critical-chance';
import { Type, isHackOnly } from '../pokemon/type';
import { Stat } from '../pokemon/stat';
import { StatChange } from '../pokemon/stat-change';
import { ItemList } from '../pokemon/item-list';
import { MiscTweak } from '../utils/misc-tweak';
import type { MegaEvolution } from '../pokemon/mega-evolution';
import { MoveLearnt } from '../pokemon/move-learnt';
import { RandomizationException } from '../exceptions';
import { Trainer } from '../pokemon/trainer';
import { TrainerPokemon } from '../pokemon/trainer-pokemon';
import { EncounterSet } from '../pokemon/encounter-set';
import { Encounter } from '../pokemon/encounter';
import { StaticEncounter } from '../pokemon/static-encounter';
import type { TotemPokemon } from '../pokemon/totem-pokemon';
import { IngameTrade } from '../pokemon/ingame-trade';
import { Shop } from '../pokemon/shop';
import type { EvolutionUpdate } from './evolution-update';
import { FileFunctions } from '../utils/file-functions';
import { RomFunctions } from '../utils/rom-functions';
import { Effectiveness } from '../pokemon/effectiveness';
import { Evolution } from '../pokemon/evolution';
import {
  EvolutionType,
  evolutionTypeFromIndex,
  evolutionTypeToIndex,
} from '../pokemon/evolution-type';

// ---------------------------------------------------------------------------
// ROM Entry (parsed from gen1_offsets.ini in the Java version)
// ---------------------------------------------------------------------------

export interface RomEntry {
  name: string;
  romName: string;
  version: number;
  nonJapanese: number;
  extraTableFile: string | null;
  isYellow: boolean;
  expectedCRC32: number;
  crcInHeader: number;
  tweakFiles: Map<string, string>;
  entries: Map<string, number>;
  arrayEntries: Map<string, number[]>;
  extraTypeLookup: Map<number, string>;
  extraTypeReverse: Map<string, number>;
  staticPokemon: StaticPokemonEntry[];
  ghostMarowakOffsets: number[];
}

export function createDefaultRomEntry(): RomEntry {
  return {
    name: '',
    romName: '',
    version: 0,
    nonJapanese: 0,
    extraTableFile: null,
    isYellow: false,
    expectedCRC32: -1,
    crcInHeader: -1,
    tweakFiles: new Map(),
    entries: new Map(),
    arrayEntries: new Map(),
    extraTypeLookup: new Map(),
    extraTypeReverse: new Map(),
    staticPokemon: [],
    ghostMarowakOffsets: [],
  };
}

function romEntryGetValue(entry: RomEntry, key: string): number {
  if (!entry.entries.has(key)) {
    entry.entries.set(key, 0);
  }
  return entry.entries.get(key)!;
}

// ---------------------------------------------------------------------------
// Text table helpers (standalone, kept for backward compatibility)
// ---------------------------------------------------------------------------

export interface TextTables {
  tb: (string | null)[];
  d: Map<string, number>;
  longestTableToken: number;
}

export function createTextTables(): TextTables {
  return {
    tb: new Array<string | null>(256).fill(null),
    d: new Map(),
    longestTableToken: 0,
  };
}

export function readTextTable(tables: TextTables, lines: string[]): void {
  for (const line of lines) {
    // Don't trim the value: "7F= " maps byte 0x7F to a space (nuzlocke-bench
    // fix — trimming dropped every space from text the randomizer writes).
    const q = line.replace(/\r$/, '');
    if (q.trim() === '') continue;
    const eq = q.indexOf('=');
    if (eq < 0) continue;
    const value = q.substring(eq + 1);
    const hexcode = parseInt(q.substring(0, eq).trim(), 16);
    if (isNaN(hexcode)) continue;
    if (tables.tb[hexcode] != null) {
      const oldMatch = tables.tb[hexcode]!;
      tables.tb[hexcode] = null;
      if (tables.d.get(oldMatch) === hexcode) {
        tables.d.delete(oldMatch);
      }
    }
    tables.tb[hexcode] = value;
    tables.longestTableToken = Math.max(tables.longestTableToken, value.length);
    tables.d.set(value, hexcode);
  }
}

export function readStringFromRom(
  rom: Uint8Array,
  offset: number,
  maxLength: number,
  textEngineMode: boolean,
  tables: TextTables
): string {
  let result = '';
  for (let c = 0; c < maxLength; c++) {
    const currChar = rom[offset + c] & 0xff;
    if (tables.tb[currChar] != null) {
      result += tables.tb[currChar];
      if (
        textEngineMode &&
        (tables.tb[currChar] === '\\r' || tables.tb[currChar] === '\\e')
      ) {
        break;
      }
    } else {
      if (currChar === GBConstants.stringTerminator) {
        break;
      } else {
        result +=
          '\\x' + currChar.toString(16).padStart(2, '0').toUpperCase();
      }
    }
  }
  return result;
}

export function lengthOfStringAt(
  rom: Uint8Array,
  offset: number,
  textEngineMode: boolean
): number {
  let len = 0;
  while (
    rom[offset + len] !== GBConstants.stringTerminator &&
    (!textEngineMode ||
      (rom[offset + len] !== GBConstants.stringPrintedTextEnd &&
        rom[offset + len] !== GBConstants.stringPrintedTextPromptEnd))
  ) {
    len++;
  }
  if (
    textEngineMode &&
    (rom[offset + len] === GBConstants.stringPrintedTextEnd ||
      rom[offset + len] === GBConstants.stringPrintedTextPromptEnd)
  ) {
    len++;
  }
  return len;
}

export function translateString(
  text: string,
  tables: TextTables
): Uint8Array {
  const bytes: number[] = [];
  let remaining = text;
  while (remaining.length !== 0) {
    let i = Math.max(0, tables.longestTableToken - remaining.length);
    if (
      remaining.charAt(0) === '\\' &&
      remaining.length > 1 &&
      remaining.charAt(1) === 'x'
    ) {
      bytes.push(parseInt(remaining.substring(2, 4), 16));
      remaining = remaining.substring(4);
    } else {
      while (
        !(
          tables.d.has(
            remaining.substring(0, tables.longestTableToken - i)
          ) || i === tables.longestTableToken
        )
      ) {
        i++;
      }
      if (i === tables.longestTableToken) {
        remaining = remaining.substring(1);
      } else {
        bytes.push(
          tables.d.get(
            remaining.substring(0, tables.longestTableToken - i)
          )! & 0xff
        );
        remaining = remaining.substring(tables.longestTableToken - i);
      }
    }
  }
  return new Uint8Array(bytes);
}

// ---------------------------------------------------------------------------
// Low-level ROM reading helpers (standalone, kept for backward compatibility)
// ---------------------------------------------------------------------------

export function readWord(data: Uint8Array, offset: number): number {
  return (data[offset] & 0xff) + ((data[offset + 1] & 0xff) << 8);
}

export function writeWord(
  data: Uint8Array,
  offset: number,
  value: number
): void {
  data[offset] = value & 0xff;
  data[offset + 1] = (value >> 8) & 0xff;
}

export function romSig(rom: Uint8Array, sig: string): boolean {
  const sigOffset = GBConstants.romSigOffset;
  for (let i = 0; i < sig.length; i++) {
    if (rom[sigOffset + i] !== sig.charCodeAt(i)) {
      return false;
    }
  }
  return true;
}

export function romCode(rom: Uint8Array, code: string): boolean {
  const sigOffset = GBConstants.romCodeOffset;
  for (let i = 0; i < code.length; i++) {
    if (rom[sigOffset + i] !== code.charCodeAt(i)) {
      return false;
    }
  }
  return true;
}

export function makeGBPointer(offset: number): number {
  if (offset < GBConstants.bankSize) {
    return offset;
  } else {
    return (offset % GBConstants.bankSize) + GBConstants.bankSize;
  }
}

export function bankOf(offset: number): number {
  return Math.floor(offset / GBConstants.bankSize);
}

export function calculateOffset(bank: number, pointer: number): number {
  if (pointer < GBConstants.bankSize) {
    return pointer;
  } else {
    return (pointer % GBConstants.bankSize) + bank * GBConstants.bankSize;
  }
}

// ---------------------------------------------------------------------------
// Type helpers
// ---------------------------------------------------------------------------

function idToType(value: number, romEntry: RomEntry): string | null {
  if (
    value < Gen1Constants.typeTable.length &&
    Gen1Constants.typeTable[value] != null
  ) {
    return Gen1Constants.typeTable[value];
  }
  if (romEntry.extraTypeLookup.has(value)) {
    return romEntry.extraTypeLookup.get(value)!;
  }
  return null;
}

function typeToByte(type: string | null, romEntry: RomEntry): number {
  if (type == null) {
    return 0x00;
  }
  if (romEntry.extraTypeReverse.has(type)) {
    return romEntry.extraTypeReverse.get(type)!;
  }
  return Gen1Constants.typeToByte(type);
}

// ---------------------------------------------------------------------------
// ROM detection
// ---------------------------------------------------------------------------

export function checkRomEntry(
  rom: Uint8Array,
  romEntries: RomEntry[]
): RomEntry | null {
  const version = rom[GBConstants.versionOffset] & 0xff;
  const nonjap = rom[GBConstants.jpFlagOffset] & 0xff;
  const crcInHeader =
    ((rom[GBConstants.crcOffset] & 0xff) << 8) |
    (rom[GBConstants.crcOffset + 1] & 0xff);

  for (const re of romEntries) {
    if (
      romSig(rom, re.romName) &&
      re.version === version &&
      re.nonJapanese === nonjap &&
      re.crcInHeader === crcInHeader
    ) {
      return re;
    }
  }
  for (const re of romEntries) {
    if (
      romSig(rom, re.romName) &&
      re.version === version &&
      re.nonJapanese === nonjap &&
      re.crcInHeader === -1
    ) {
      return re;
    }
  }
  return null;
}

export function detectRomInner(
  rom: Uint8Array,
  romSize: number,
  romEntries: RomEntry[]
): boolean {
  return (
    romSize >= GBConstants.minRomSize &&
    romSize <= GBConstants.maxRomSize &&
    checkRomEntry(rom, romEntries) !== null
  );
}

// ---------------------------------------------------------------------------
// Pokemon stats loading / saving
// ---------------------------------------------------------------------------

export function loadBasicPokeStats(
  pkmn: Pokemon,
  rom: Uint8Array,
  offset: number,
  romEntry: RomEntry
): void {
  pkmn.hp = rom[offset + Gen1Constants.bsHPOffset] & 0xff;
  pkmn.attack = rom[offset + Gen1Constants.bsAttackOffset] & 0xff;
  pkmn.defense = rom[offset + Gen1Constants.bsDefenseOffset] & 0xff;
  pkmn.speed = rom[offset + Gen1Constants.bsSpeedOffset] & 0xff;
  pkmn.special = rom[offset + Gen1Constants.bsSpecialOffset] & 0xff;
  pkmn.primaryType = idToType(
    rom[offset + Gen1Constants.bsPrimaryTypeOffset] & 0xff,
    romEntry
  ) as any;
  pkmn.secondaryType = idToType(
    rom[offset + Gen1Constants.bsSecondaryTypeOffset] & 0xff,
    romEntry
  ) as any;
  if (pkmn.secondaryType === pkmn.primaryType) {
    pkmn.secondaryType = null;
  }
  pkmn.catchRate = rom[offset + Gen1Constants.bsCatchRateOffset] & 0xff;
  pkmn.expYield = rom[offset + Gen1Constants.bsExpYieldOffset] & 0xff;
  const growthCurve = expCurveFromByte(
    rom[offset + Gen1Constants.bsGrowthCurveOffset]
  );
  if (growthCurve != null) {
    pkmn.growthCurve = growthCurve;
  }
  pkmn.frontSpritePointer = readWord(
    rom,
    offset + Gen1Constants.bsFrontSpriteOffset
  );

  pkmn.guaranteedHeldItem = -1;
  pkmn.commonHeldItem = -1;
  pkmn.rareHeldItem = -1;
  pkmn.darkGrassHeldItem = -1;
}

export function saveBasicPokeStats(
  pkmn: Pokemon,
  rom: Uint8Array,
  offset: number,
  romEntry: RomEntry
): void {
  rom[offset + Gen1Constants.bsHPOffset] = pkmn.hp;
  rom[offset + Gen1Constants.bsAttackOffset] = pkmn.attack;
  rom[offset + Gen1Constants.bsDefenseOffset] = pkmn.defense;
  rom[offset + Gen1Constants.bsSpeedOffset] = pkmn.speed;
  rom[offset + Gen1Constants.bsSpecialOffset] = pkmn.special;
  rom[offset + Gen1Constants.bsPrimaryTypeOffset] = typeToByte(
    pkmn.primaryType as any,
    romEntry
  );
  if (pkmn.secondaryType == null) {
    rom[offset + Gen1Constants.bsSecondaryTypeOffset] =
      rom[offset + Gen1Constants.bsPrimaryTypeOffset];
  } else {
    rom[offset + Gen1Constants.bsSecondaryTypeOffset] = typeToByte(
      pkmn.secondaryType as any,
      romEntry
    );
  }
  rom[offset + Gen1Constants.bsCatchRateOffset] = pkmn.catchRate;
  rom[offset + Gen1Constants.bsGrowthCurveOffset] = expCurveToByte(
    pkmn.growthCurve
  );
  rom[offset + Gen1Constants.bsExpYieldOffset] = pkmn.expYield;
}

// ---------------------------------------------------------------------------
// Move loading / saving
// ---------------------------------------------------------------------------

export function loadMoveData(
  rom: Uint8Array,
  movesOffset: number,
  moveIndex: number,
  moveName: string,
  romEntry: RomEntry
): Move {
  const i = moveIndex;
  const base = movesOffset + (i - 1) * 6;
  const move = new Move();
  move.name = moveName;
  move.internalId = i;
  move.effectIndex = rom[base + 1] & 0xff;
  move.hitratio = ((rom[base + 4] & 0xff) / 255.0) * 100;
  move.power = rom[base + 2] & 0xff;
  move.pp = rom[base + 5] & 0xff;
  move.type = idToType(rom[base + 3] & 0xff, romEntry) as any;
  move.category = GBConstants.physicalTypes.has(move.type as any)
    ? MoveCategory.PHYSICAL
    : MoveCategory.SPECIAL;
  if (
    move.power === 0 &&
    !GlobalConstants.noPowerNonStatusMoves.includes(i)
  ) {
    move.category = MoveCategory.STATUS;
  }

  if (GlobalConstants.normalMultihitMoves.includes(i)) {
    move.hitCount = 3;
  } else if (GlobalConstants.doubleHitMoves.includes(i)) {
    move.hitCount = 2;
  }

  loadStatChangesFromEffect(move);
  loadStatusFromEffect(move);
  loadMiscMoveInfoFromEffect(move);

  return move;
}

export function saveMoveData(
  rom: Uint8Array,
  movesOffset: number,
  move: Move,
  romEntry: RomEntry
): void {
  const i = move.internalId;
  const base = movesOffset + (i - 1) * 6;
  rom[base + 1] = move.effectIndex;
  rom[base + 2] = move.power;
  rom[base + 3] = typeToByte(move.type as any, romEntry);
  let hitratio = Math.round(move.hitratio * 2.55);
  if (hitratio < 0) hitratio = 0;
  if (hitratio > 255) hitratio = 255;
  rom[base + 4] = hitratio;
  rom[base + 5] = move.pp;
}

// ---------------------------------------------------------------------------
// Move effect helpers
// ---------------------------------------------------------------------------

function loadStatChangesFromEffect(move: Move): void {
  switch (move.effectIndex) {
    case Gen1Constants.noDamageAtkPlusOneEffect:
      move.statChanges[0].type = StatChangeType.ATTACK;
      move.statChanges[0].stages = 1;
      break;
    case Gen1Constants.noDamageDefPlusOneEffect:
      move.statChanges[0].type = StatChangeType.DEFENSE;
      move.statChanges[0].stages = 1;
      break;
    case Gen1Constants.noDamageSpecialPlusOneEffect:
      move.statChanges[0].type = StatChangeType.SPECIAL;
      move.statChanges[0].stages = 1;
      break;
    case Gen1Constants.noDamageEvasionPlusOneEffect:
      move.statChanges[0].type = StatChangeType.EVASION;
      move.statChanges[0].stages = 1;
      break;
    case Gen1Constants.noDamageAtkMinusOneEffect:
    case Gen1Constants.damageAtkMinusOneEffect:
      move.statChanges[0].type = StatChangeType.ATTACK;
      move.statChanges[0].stages = -1;
      break;
    case Gen1Constants.noDamageDefMinusOneEffect:
    case Gen1Constants.damageDefMinusOneEffect:
      move.statChanges[0].type = StatChangeType.DEFENSE;
      move.statChanges[0].stages = -1;
      break;
    case Gen1Constants.noDamageSpeMinusOneEffect:
    case Gen1Constants.damageSpeMinusOneEffect:
      move.statChanges[0].type = StatChangeType.SPEED;
      move.statChanges[0].stages = -1;
      break;
    case Gen1Constants.noDamageAccuracyMinusOneEffect:
      move.statChanges[0].type = StatChangeType.ACCURACY;
      move.statChanges[0].stages = -1;
      break;
    case Gen1Constants.noDamageAtkPlusTwoEffect:
      move.statChanges[0].type = StatChangeType.ATTACK;
      move.statChanges[0].stages = 2;
      break;
    case Gen1Constants.noDamageDefPlusTwoEffect:
      move.statChanges[0].type = StatChangeType.DEFENSE;
      move.statChanges[0].stages = 2;
      break;
    case Gen1Constants.noDamageSpePlusTwoEffect:
      move.statChanges[0].type = StatChangeType.SPEED;
      move.statChanges[0].stages = 2;
      break;
    case Gen1Constants.noDamageSpecialPlusTwoEffect:
      move.statChanges[0].type = StatChangeType.SPECIAL;
      move.statChanges[0].stages = 2;
      break;
    case Gen1Constants.noDamageDefMinusTwoEffect:
      move.statChanges[0].type = StatChangeType.DEFENSE;
      move.statChanges[0].stages = -2;
      break;
    case Gen1Constants.damageSpecialMinusOneEffect:
      move.statChanges[0].type = StatChangeType.SPECIAL;
      move.statChanges[0].stages = -1;
      break;
    default:
      return;
  }

  switch (move.effectIndex) {
    case Gen1Constants.noDamageAtkPlusOneEffect:
    case Gen1Constants.noDamageDefPlusOneEffect:
    case Gen1Constants.noDamageSpecialPlusOneEffect:
    case Gen1Constants.noDamageEvasionPlusOneEffect:
    case Gen1Constants.noDamageAtkMinusOneEffect:
    case Gen1Constants.noDamageDefMinusOneEffect:
    case Gen1Constants.noDamageSpeMinusOneEffect:
    case Gen1Constants.noDamageAccuracyMinusOneEffect:
    case Gen1Constants.noDamageAtkPlusTwoEffect:
    case Gen1Constants.noDamageDefPlusTwoEffect:
    case Gen1Constants.noDamageSpePlusTwoEffect:
    case Gen1Constants.noDamageSpecialPlusTwoEffect:
    case Gen1Constants.noDamageDefMinusTwoEffect:
      if (move.statChanges[0].stages < 0) {
        move.statChangeMoveType = StatChangeMoveType.NO_DAMAGE_TARGET;
      } else {
        move.statChangeMoveType = StatChangeMoveType.NO_DAMAGE_USER;
      }
      break;

    case Gen1Constants.damageAtkMinusOneEffect:
    case Gen1Constants.damageDefMinusOneEffect:
    case Gen1Constants.damageSpeMinusOneEffect:
    case Gen1Constants.damageSpecialMinusOneEffect:
      move.statChangeMoveType = StatChangeMoveType.DAMAGE_TARGET;
      break;
  }

  if (move.statChangeMoveType === StatChangeMoveType.DAMAGE_TARGET) {
    for (let i = 0; i < move.statChanges.length; i++) {
      if (move.statChanges[i].type !== StatChangeType.NONE) {
        move.statChanges[i].percentChance = 85 / 256.0;
      }
    }
  }
}

function loadStatusFromEffect(move: Move): void {
  switch (move.effectIndex) {
    case Gen1Constants.noDamageSleepEffect:
    case Gen1Constants.noDamageConfusionEffect:
    case Gen1Constants.noDamagePoisonEffect:
    case Gen1Constants.noDamageParalyzeEffect:
      move.statusMoveType = StatusMoveType.NO_DAMAGE;
      break;

    case Gen1Constants.damagePoison20PercentEffect:
    case Gen1Constants.damageBurn10PercentEffect:
    case Gen1Constants.damageFreeze10PercentEffect:
    case Gen1Constants.damageParalyze10PercentEffect:
    case Gen1Constants.damagePoison40PercentEffect:
    case Gen1Constants.damageBurn30PercentEffect:
    case Gen1Constants.damageFreeze30PercentEffect:
    case Gen1Constants.damageParalyze30PercentEffect:
    case Gen1Constants.damageConfusionEffect:
    case Gen1Constants.twineedleEffect:
      move.statusMoveType = StatusMoveType.DAMAGE;
      break;

    default:
      return;
  }

  switch (move.effectIndex) {
    case Gen1Constants.noDamageSleepEffect:
      move.statusType = StatusType.SLEEP;
      break;
    case Gen1Constants.damagePoison20PercentEffect:
    case Gen1Constants.damagePoison40PercentEffect:
    case Gen1Constants.noDamagePoisonEffect:
    case Gen1Constants.twineedleEffect:
      move.statusType = StatusType.POISON;
      if (move.number === Moves.toxic) {
        move.statusType = StatusType.TOXIC_POISON;
      }
      break;
    case Gen1Constants.damageBurn10PercentEffect:
    case Gen1Constants.damageBurn30PercentEffect:
      move.statusType = StatusType.BURN;
      break;
    case Gen1Constants.damageFreeze10PercentEffect:
    case Gen1Constants.damageFreeze30PercentEffect:
      move.statusType = StatusType.FREEZE;
      break;
    case Gen1Constants.damageParalyze10PercentEffect:
    case Gen1Constants.damageParalyze30PercentEffect:
    case Gen1Constants.noDamageParalyzeEffect:
      move.statusType = StatusType.PARALYZE;
      break;
    case Gen1Constants.noDamageConfusionEffect:
    case Gen1Constants.damageConfusionEffect:
      move.statusType = StatusType.CONFUSION;
      break;
  }

  if (move.statusMoveType === StatusMoveType.DAMAGE) {
    switch (move.effectIndex) {
      case Gen1Constants.damageBurn10PercentEffect:
      case Gen1Constants.damageFreeze10PercentEffect:
      case Gen1Constants.damageParalyze10PercentEffect:
      case Gen1Constants.damageConfusionEffect:
        move.statusPercentChance = 10.0;
        break;
      case Gen1Constants.damagePoison20PercentEffect:
      case Gen1Constants.twineedleEffect:
        move.statusPercentChance = 20.0;
        break;
      case Gen1Constants.damageBurn30PercentEffect:
      case Gen1Constants.damageFreeze30PercentEffect:
      case Gen1Constants.damageParalyze30PercentEffect:
        move.statusPercentChance = 30.0;
        break;
      case Gen1Constants.damagePoison40PercentEffect:
        move.statusPercentChance = 40.0;
        break;
    }
  }
}

function loadMiscMoveInfoFromEffect(move: Move): void {
  switch (move.effectIndex) {
    case Gen1Constants.flinch10PercentEffect:
      move.flinchPercentChance = 10.0;
      break;
    case Gen1Constants.flinch30PercentEffect:
      move.flinchPercentChance = 30.0;
      break;
    case Gen1Constants.damageAbsorbEffect:
    case Gen1Constants.dreamEaterEffect:
      move.absorbPercent = 50;
      break;
    case Gen1Constants.damageRecoilEffect:
      move.recoilPercent = 25;
      break;
    case Gen1Constants.chargeEffect:
    case Gen1Constants.flyEffect:
      move.isChargeMove = true;
      break;
    case Gen1Constants.hyperBeamEffect:
      move.isRechargeMove = true;
      break;
  }

  if (Gen1Constants.increasedCritMoves.includes(move.number)) {
    move.criticalChance = CriticalChance.INCREASED;
  }
}

// ===========================================================================
// Gen1RomHandler class - extends AbstractGBCRomHandler
// ===========================================================================

export class Gen1RomHandler extends AbstractGBCRomHandler {
  private romEntry: RomEntry = createDefaultRomEntry();
  private pokemonList: (Pokemon | null)[] = [];
  private pokes: Pokemon[] = [];
  private movesList: (Move | null)[] = [];
  private pokeNumToRBYTable: number[] = [];
  private pokeRBYToNumTable: number[] = [];
  private moveNumToRomTable: number[] = [];
  private moveRomToNumTable: number[] = [];
  private pokedexCount: number = 0;
  private actualCRC32: number = 0;
  private effectivenessUpdated: boolean = false;
  private xAccNerfed: boolean = false;
  private itemNames: string[] = [];
  private textTables: TextTables = createTextTables();
  private dexMapping: PokedexMapping = { pokeNumToRBY: [], pokeRBYToNum: [], pokedexCount: 0 };
  private romEntries: RomEntry[] = [];
  private mapNames: string[] = [];

  constructor(random: RandomInstance, logStream: LogStream | null, romEntries?: RomEntry[]) {
    super(random, logStream);
    if (romEntries) {
      this.romEntries = romEntries;
    } else {
      // Load from INI file
      try {
        const iniPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/com/dabomstew/pkrandom/config/gen1_offsets.ini');
        if (fs.existsSync(iniPath)) {
          const iniText = fs.readFileSync(iniPath, 'utf-8');
          this.romEntries = parseGen1OffsetsIni(iniText);
        }
      } catch {
        // Fall back to hardcoded entries
        this.romEntries = knownGen1RomEntries;
      }
    }
  }

  // === AbstractGBRomHandler abstract methods ===

  detectRom(rom: Uint8Array): boolean {
    return detectRomInner(rom, rom.length, this.romEntries);
  }

  loadedRom(): void {
    // Detect the ROM entry
    const entry = checkRomEntry(this.rom, this.romEntries);
    if (entry == null) {
      throw new Error('Could not detect ROM entry');
    }
    this.romEntry = entry;

    // Load text tables (Java loads gameboy_jpn first, then extra table)
    this.clearTextTables();
    this.textTables = createTextTables();
    const configDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/com/dabomstew/pkrandom/config');

    // Read base Japanese text table first (has digits F6-FF = 0-9)
    const jpnTablePath = path.join(configDir, 'gameboy_jpn.tbl');
    if (fs.existsSync(jpnTablePath)) {
      const jpnLines = fs.readFileSync(jpnTablePath, 'utf-8').split('\n');
      readTextTable(this.textTables, jpnLines);
      this.readTextTable('gameboy_jpn');
    }

    // Then overlay extra table (e.g. rby_english)
    const extraTableFile = entry.extraTableFile;
    if (extraTableFile && extraTableFile.toLowerCase() !== 'none') {
      const extraTablePath = path.join(configDir, extraTableFile + '.tbl');
      if (fs.existsSync(extraTablePath)) {
        const extraLines = fs.readFileSync(extraTablePath, 'utf-8').split('\n');
        readTextTable(this.textTables, extraLines);
        this.readTextTable(extraTableFile);
      }
    }

    // Load pokedex order
    this.dexMapping = loadPokedexOrder(this.rom, this.romEntry);
    this.pokeNumToRBYTable = this.dexMapping.pokeNumToRBY;
    this.pokeRBYToNumTable = this.dexMapping.pokeRBYToNum;
    this.pokedexCount = this.dexMapping.pokedexCount;

    // Load Pokemon stats
    this.pokes = loadAllPokemonStats(this.rom, this.romEntry, this.dexMapping, this.textTables);
    populateEvolutions(this.rom, this.romEntry, this.pokes, this.dexMapping);

    this.pokemonList = new Array(this.pokes.length).fill(null);
    for (let i = 0; i < this.pokes.length; i++) {
      this.pokemonList[i] = this.pokes[i] ?? null;
    }

    // Load moves
    const moveResult = loadAllMoves(this.rom, this.romEntry, this.textTables);
    this.movesList = moveResult.moves;
    this.moveNumToRomTable = moveResult.moveNumToRomTable;
    this.moveRomToNumTable = moveResult.moveRomToNumTable;

    // Load item names
    this.itemNames = getGen1ItemNames(this.rom, this.romEntry, this.textTables);

    // Load map names
    this.loadMapNames();

    // Calculate CRC32 for ROM validity check
    this.actualCRC32 = FileFunctions.getCRC32(this.rom);
  }

  private loadMapNames(): void {
    this.mapNames = new Array(256).fill('');
    try {
      let mapNameTableOffset = romEntryGetValue(this.romEntry, 'MapNameTableOffset');
      if (mapNameTableOffset === 0) return;
      const mapNameBank = bankOf(mapNameTableOffset);

      // external names (first 0x25 entries)
      const usedExternal = new Set<number>();
      for (let i = 0; i < 0x25; i++) {
        const externalOffset = calculateOffset(
          mapNameBank,
          readWord(this.rom, mapNameTableOffset + 1)
        );
        usedExternal.add(externalOffset);
        this.mapNames[i] = this.readVariableLengthString(externalOffset, false);
        mapNameTableOffset += 3;
      }

      // internal names
      let lastMaxMap = 0x25;
      const previousMapCounts = new Map<number, number>();
      while ((this.rom[mapNameTableOffset] & 0xFF) !== 0xFF) {
        const maxMap = this.rom[mapNameTableOffset] & 0xFF;
        const nameOffset = calculateOffset(
          mapNameBank,
          readWord(this.rom, mapNameTableOffset + 2)
        );
        const actualName = this.readVariableLengthString(nameOffset, false).trim();
        if (usedExternal.has(nameOffset)) {
          for (let i = lastMaxMap; i < maxMap; i++) {
            this.mapNames[i] = actualName + ' (Building)';
          }
        } else {
          let mapCount = previousMapCounts.get(nameOffset) ?? 0;
          for (let i = lastMaxMap; i < maxMap; i++) {
            mapCount++;
            this.mapNames[i] = actualName + ' (' + mapCount + ')';
          }
          previousMapCounts.set(nameOffset, mapCount);
        }
        lastMaxMap = maxMap;
        mapNameTableOffset += 4;
      }
    } catch {
      // Fall back to generic names on error
      for (let i = 0; i < 256; i++) {
        if (!this.mapNames[i]) {
          this.mapNames[i] = 'Map ' + i;
        }
      }
    }
  }

  savingRom(): void {
    saveAllPokemonStats(this.rom, this.romEntry, this.pokes, this.dexMapping, this.textTables);
    saveAllMoves(this.rom, this.romEntry, this.movesList);
  }

  // === TRIVIAL STUBS ===

  abilitiesPerPokemon(): number {
    return 0;
  }

  highestAbilityIndex(): number {
    return 0;
  }

  getAbilityVariations(): Map<number, number[]> {
    return new Map();
  }

  hasMegaEvolutions(): boolean {
    return false;
  }

  getPokemonInclFormes(): (Pokemon | null)[] {
    return this.pokemonList;
  }

  getAltFormes(): Pokemon[] {
    return [];
  }

  getMegaEvolutions(): MegaEvolution[] {
    return [];
  }

  getAltFormeOfPokemon(pk: Pokemon, _forme: number): Pokemon {
    return pk;
  }

  getIrregularFormes(): Pokemon[] {
    return [];
  }

  hasFunctionalFormes(): boolean {
    return false;
  }

  hasWildAltFormes(): boolean {
    return false;
  }

  hasStarterAltFormes(): boolean {
    return false;
  }

  getMainPlaythroughTrainers(): number[] {
    return [];
  }

  getEliteFourTrainers(_isChallengeMode: boolean): number[] {
    return [];
  }

  hasRivalFinalBattle(): boolean {
    return true;
  }

  hasStaticAltFormes(): boolean {
    return false;
  }

  hasMainGameLegendaries(): boolean {
    return false;
  }

  getMainGameLegendaries(): number[] {
    return [];
  }

  getSpecialMusicStatics(): number[] {
    return [];
  }

  getTotemPokemon(): TotemPokemon[] {
    return [];
  }

  setTotemPokemon(_totemPokemon: TotemPokemon[]): void {}

  getEggMoves(): Map<number, number[]> {
    return new Map();
  }

  setEggMoves(_eggMoves: Map<number, number[]>): void {}

  hasMoveTutors(): boolean {
    return false;
  }

  getMoveTutorMoves(): number[] {
    return [];
  }

  setMoveTutorMoves(_moves: number[]): void {}

  getMoveTutorCompatibility(): Map<Pokemon, boolean[]> {
    return new Map();
  }

  setMoveTutorCompatibility(_compatData: Map<Pokemon, boolean[]>): void {}

  // === SIMPLE METADATA METHODS ===

  generationOfPokemon(): number {
    return 1;
  }

  getDefaultExtension(): string {
    return 'gbc';
  }

  isYellow(): boolean {
    return this.romEntry.isYellow;
  }

  starterCount(): number {
    return this.isYellow() ? 2 : 3;
  }

  canChangeStaticPokemon(): boolean {
    return romEntryGetValue(this.romEntry, 'StaticPokemonSupport') > 0;
  }

  hasPhysicalSpecialSplit(): boolean {
    return false;
  }

  supportsFourStartingMoves(): boolean {
    return true;
  }

  supportsStarterHeldItems(): boolean {
    return false;
  }

  getStarterHeldItems(): number[] {
    return [];
  }

  setStarterHeldItems(_items: number[]): void {}

  getGameBreakingMoves(): number[] {
    if (this.xAccNerfed) {
      return Gen1Constants.bannedMovesWithXAccBanned;
    } else {
      return Gen1Constants.bannedMovesWithoutXAccBanned;
    }
  }

  getFieldMoves(): number[] {
    return Gen1Constants.fieldMoves;
  }

  getEarlyRequiredHMMoves(): number[] {
    return Gen1Constants.earlyRequiredHMs;
  }

  getMovesBannedFromLevelup(): number[] {
    return Gen1Constants.bannedLevelupMoves;
  }

  getDoublesTrainerClasses(): number[] {
    return [];
  }

  fixedTrainerClassNamesLength(): boolean {
    return true;
  }

  canChangeTrainerText(): boolean {
    return romEntryGetValue(this.romEntry, 'CanChangeTrainerText') > 0;
  }

  hasDVs(): boolean {
    return true;
  }

  getHMCount(): number {
    return Gen1Constants.hmCount;
  }

  getTMCount(): number {
    return Gen1Constants.tmCount;
  }

  typeInGame(type: Type): boolean {
    if (
      !isHackOnly(type) &&
      type !== Type.DARK &&
      type !== Type.STEEL &&
      type !== Type.FAIRY
    ) {
      return true;
    }
    const typeName = Type[type];
    return this.romEntry.extraTypeReverse.has(typeName);
  }

  getUpdatedPokemonStats(generation: number): Map<number, StatChange> {
    const map = GlobalConstants.getStatChanges(generation);
    switch (generation) {
      case 6:
        map.set(Species.butterfree, new StatChange(Stat.SPECIAL, 90));
        map.set(Species.clefable, new StatChange(Stat.SPECIAL, 95));
        map.set(Species.vileplume, new StatChange(Stat.SPECIAL, 110));
        break;
      default:
        break;
    }
    return map;
  }

  isEffectivenessUpdated(): boolean {
    return this.effectivenessUpdated;
  }

  internalStringLength(s: string): number {
    return this.translateString(s).length;
  }

  hasShopRandomization(): boolean {
    return false;
  }

  setShopPrices(): void {}

  miscTweaksAvailable(): number {
    let available = MiscTweak.LOWER_CASE_POKEMON_NAMES.getValue();
    available |= MiscTweak.UPDATE_TYPE_EFFECTIVENESS.getValue();
    if (this.romEntry.tweakFiles.get('BWXPTweak') != null) {
      available |= MiscTweak.BW_EXP_PATCH.getValue();
    }
    if (this.romEntry.tweakFiles.get('XAccNerfTweak') != null) {
      available |= MiscTweak.NERF_X_ACCURACY.getValue();
    }
    if (this.romEntry.tweakFiles.get('CritRateTweak') != null) {
      available |= MiscTweak.FIX_CRIT_RATE.getValue();
    }
    if (romEntryGetValue(this.romEntry, 'TextDelayFunctionOffset') !== 0) {
      available |= MiscTweak.FASTEST_TEXT.getValue();
    }
    if (romEntryGetValue(this.romEntry, 'PCPotionOffset') !== 0) {
      available |= MiscTweak.RANDOMIZE_PC_POTION.getValue();
    }
    if (romEntryGetValue(this.romEntry, 'PikachuEvoJumpOffset') !== 0) {
      available |= MiscTweak.ALLOW_PIKACHU_EVOLUTION.getValue();
    }
    if (
      romEntryGetValue(this.romEntry, 'CatchingTutorialMonOffset') !== 0
    ) {
      available |= MiscTweak.RANDOMIZE_CATCHING_TUTORIAL.getValue();
    }
    return available;
  }

  applyMiscTweak(_tweak: { value: number }): void {
    // Stub: full implementation requires IPS patching and ROM manipulation
  }

  getROMName(): string {
    return 'Pokemon ' + this.romEntry.name;
  }

  getROMCode(): string {
    return (
      this.romEntry.romName +
      ' (' +
      this.romEntry.version +
      '/' +
      this.romEntry.nonJapanese +
      ')'
    );
  }

  getSupportLevel(): string {
    return romEntryGetValue(this.romEntry, 'StaticPokemonSupport') > 0
      ? 'Complete'
      : 'No Static Pokemon';
  }

  trainerNameMode(): TrainerNameMode {
    return TrainerNameMode.SAME_LENGTH;
  }

  isRomValid(): boolean {
    return this.romEntry.expectedCRC32 === this.actualCRC32;
  }

  // === STUB IMPLEMENTATIONS (complex methods for later steps) ===

  getPokemon(): (Pokemon | null)[] {
    return this.pokemonList;
  }

  getMoves(): (Move | null)[] {
    return this.movesList;
  }

  getStarters(): Pokemon[] {
    return getGen1Starters(this.rom, this.romEntry, this.pokes, this.pokeRBYToNumTable);
  }

  setStarters(newStarters: Pokemon[]): boolean {
    return setGen1Starters(this.rom, this.romEntry, this.pokes, this.pokeNumToRBYTable, newStarters, this.textTables);
  }

  customStarters(_settings: Settings): void {}

  // randomizeStarters and randomizeBasicTwoEvosStarters inherited from AbstractRomHandler

  randomizeStarterHeldItems(_settings: Settings): void {}

  getEvolutionItems(): number[] {
    return [];
  }

  // standardizeEXPCurves is now a concrete method in AbstractRomHandler

  getEncounters(_useTimeOfDay: boolean): EncounterSet[] {
    return this.getGen1EncountersImpl();
  }

  setEncounters(
    _useTimeOfDay: boolean,
    encounters: EncounterSet[]
  ): void {
    this.setGen1EncountersImpl(encounters);
  }

  // randomEncounters, area1to1Encounters, and game1to1Encounters
  // are now concrete methods in AbstractRomHandler

  // randomizeWildHeldItems inherited from AbstractRomHandler

  // changeCatchRates and minimumCatchRate are now concrete methods in AbstractRomHandler

  enableGuaranteedPokemonCatching(): void {
    const offset = Gen1RomHandler.find(this.rom, Gen1Constants.guaranteedCatchPrefix);
    if (offset > 0) {
      const patchOffset = offset + Gen1Constants.guaranteedCatchPrefix.length / 2;

      // The game ensures the Master Ball always catches by checking:
      //   cp MASTER_BALL
      //   jp z, .captured     (opcode 0xCA)
      // By changing jp z (0xCA) to jp (0xC3), catching always succeeds
      // regardless of ball type.
      if (this.rom[patchOffset] === 0xCA) {
        this.rom[patchOffset] = 0xC3;
      }
    }
  }

  getTrainers(): Trainer[] {
    return this.getGen1TrainersImpl();
  }

  setTrainers(
    trainerData: Trainer[],
    _doubleBattleMode: boolean
  ): void {
    this.setGen1TrainersImpl(trainerData);
  }

  // randomizeTrainerPokes, randomizeTrainerHeldItems, rivalCarriesStarter,
  // forceFullyEvolvedTrainerPokes, onlyChangeTrainerLevels, addTrainerPokemon,
  // doubleBattleMode are now concrete in AbstractRomHandler

  // getMoveSelectionPoolAtLevel inherited from AbstractRomHandler

  // pickTrainerMovesets is now concrete in AbstractRomHandler

  // updateMoves, initMoveUpdates, getMoveUpdates inherited from AbstractRomHandler

  getMovesLearnt(): Map<number, MoveLearnt[]> {
    return getGen1MovesLearnt(this.rom, this.romEntry, this.pokes, this.pokeRBYToNumTable, this.moveRomToNumTable);
  }

  setMovesLearnt(movesets: Map<number, MoveLearnt[]>): void {
    writeGen1EvosAndMovesLearnt(
      this.rom, this.romEntry, this.pokes,
      this.pokeRBYToNumTable, this.pokeNumToRBYTable,
      this.moveNumToRomTable, movesets, false,
    );
  }

  // randomizeMovesLearnt inherited from AbstractRomHandler

  // randomizeEggMoves inherited from AbstractRomHandler (no-op: Gen1 has no egg moves)

  // orderDamagingMovesByDamage, metronomeOnlyMode inherited from AbstractRomHandler

  getStaticPokemon(): StaticEncounter[] {
    return getGen1StaticPokemon(
      this.rom, this.romEntry, this.romEntry.staticPokemon,
      this.pokemonList, this.pokeRBYToNumTable,
    );
  }

  setStaticPokemon(staticPokemon: StaticEncounter[]): boolean {
    return setGen1StaticPokemon(
      this.rom, this.romEntry, this.romEntry.staticPokemon,
      staticPokemon, this.pokeNumToRBYTable,
    );
  }

  // randomizeStaticPokemon inherited from AbstractRomHandler

  // onlyChangeStaticLevels inherited from AbstractRomHandler

  applyCorrectStaticMusic(
    _specialMusicStaticChanges: Map<number, number>
  ): void {}

  hasStaticMusicFix(): boolean {
    return false;
  }

  randomizeTotemPokemon(_settings: Settings): void {}

  getTMMoves(): number[] {
    return getGen1TMMoves(this.rom, this.romEntry, this.moveRomToNumTable);
  }

  getHMMoves(): number[] {
    return getGen1HMMoves(this.rom, this.romEntry, this.moveRomToNumTable);
  }

  setTMMoves(moveIndexes: number[]): void {
    setGen1TMMoves(this.rom, this.romEntry, this.moveNumToRomTable, moveIndexes);
  }

  // randomizeTMMoves inherited from AbstractRomHandler

  getTMHMCompatibility(): Map<Pokemon, boolean[]> {
    return getGen1TMHMCompatibility(this.rom, this.romEntry, this.pokes, this.pokedexCount);
  }

  setTMHMCompatibility(compatData: Map<Pokemon, boolean[]>): void {
    setGen1TMHMCompatibility(this.rom, this.romEntry, this.pokes, compatData);
  }

  // TM/HM compatibility methods inherited from AbstractRomHandler

  // randomizeMoveTutorMoves inherited from AbstractRomHandler

  // randomizeMoveTutorCompatibility inherited from AbstractRomHandler

  fullMoveTutorCompatibility(): void {}

  ensureMoveTutorCompatSanity(): void {}

  ensureMoveTutorEvolutionSanity(): void {}

  copyMoveTutorCompatibilityToCosmeticFormes(): void {}

  getTrainerNames(): string[] {
    const offsets = this.romEntry.arrayEntries.get('TrainerClassNamesOffsets');
    if (!offsets || offsets.length === 0) return [];
    const trainerNames: string[] = [];
    let offset = offsets[offsets.length - 1];
    for (let j = 0; j < Gen1Constants.tclassesCounts[1]; j++) {
      const name = this.readVariableLengthString(offset, false);
      offset += this.lengthOfStringAt(offset, false) + 1;
      if (Gen1Constants.singularTrainers.includes(j)) {
        trainerNames.push(name);
      }
    }
    return trainerNames;
  }

  setTrainerNames(trainerNames: string[]): void {
    if (romEntryGetValue(this.romEntry, 'CanChangeTrainerText') <= 0) return;
    const offsets = this.romEntry.arrayEntries.get('TrainerClassNamesOffsets');
    if (!offsets || offsets.length === 0) return;
    let nameIdx = 0;
    let offset = offsets[offsets.length - 1];
    for (let j = 0; j < Gen1Constants.tclassesCounts[1]; j++) {
      const oldLength = this.lengthOfStringAt(offset, false) + 1;
      if (Gen1Constants.singularTrainers.includes(j)) {
        const newName = trainerNames[nameIdx++];
        this.writeFixedLengthString(newName, offset, oldLength);
      }
      offset += oldLength;
    }
  }

  getTCNameLengthsByTrainer(): number[] {
    return [];
  }

  // randomizeTrainerNames is now concrete in AbstractRomHandler

  getTrainerClassNames(): string[] {
    const offsets = this.romEntry.arrayEntries.get('TrainerClassNamesOffsets');
    if (!offsets || offsets.length === 0) return [];
    const trainerClassNames: string[] = [];
    if (offsets.length === 2) {
      for (let i = 0; i < offsets.length; i++) {
        let offset = offsets[i];
        for (let j = 0; j < Gen1Constants.tclassesCounts[i]; j++) {
          const name = this.readVariableLengthString(offset, false);
          offset += this.lengthOfStringAt(offset, false) + 1;
          if (i === 0 || !Gen1Constants.singularTrainers.includes(j)) {
            trainerClassNames.push(name);
          }
        }
      }
    } else {
      let offset = offsets[0];
      for (let j = 0; j < Gen1Constants.tclassesCounts[1]; j++) {
        const name = this.readVariableLengthString(offset, false);
        offset += this.lengthOfStringAt(offset, false) + 1;
        if (!Gen1Constants.singularTrainers.includes(j)) {
          trainerClassNames.push(name);
        }
      }
    }
    return trainerClassNames;
  }

  setTrainerClassNames(trainerClassNames: string[]): void {
    if (romEntryGetValue(this.romEntry, 'CanChangeTrainerText') <= 0) return;
    const offsets = this.romEntry.arrayEntries.get('TrainerClassNamesOffsets');
    if (!offsets || offsets.length === 0) return;
    let nameIdx = 0;
    if (offsets.length === 2) {
      for (let i = 0; i < offsets.length; i++) {
        let offset = offsets[i];
        for (let j = 0; j < Gen1Constants.tclassesCounts[i]; j++) {
          const oldLength = this.lengthOfStringAt(offset, false) + 1;
          if (i === 0 || !Gen1Constants.singularTrainers.includes(j)) {
            const newName = trainerClassNames[nameIdx++];
            this.writeFixedLengthString(newName, offset, oldLength);
          }
          offset += oldLength;
        }
      }
    } else {
      let offset = offsets[0];
      for (let j = 0; j < Gen1Constants.tclassesCounts[1]; j++) {
        const oldLength = this.lengthOfStringAt(offset, false) + 1;
        if (!Gen1Constants.singularTrainers.includes(j)) {
          const newName = trainerClassNames[nameIdx++];
          this.writeFixedLengthString(newName, offset, oldLength);
        }
        offset += oldLength;
      }
    }
  }

  // randomizeTrainerClassNames is now concrete in AbstractRomHandler

  // nuzlocke-bench: these returned empty lists, so field-item randomization never found an item.
  private static allowedItems: ItemList | null = null;

  getAllowedItems(): ItemList {
    return (Gen1RomHandler.allowedItems ??= Gen1Constants.setupAllowedItems());
  }

  getNonBadItems(): ItemList {
    // Gen 1 has no "bad" items (same as the Java original).
    return this.getAllowedItems();
  }

  getUniqueNoSellItems(): number[] {
    return [];
  }

  getRegularShopItems(): number[] {
    return [];
  }

  getOPShopItems(): number[] {
    return [];
  }

  getItemNames(): string[] {
    return this.itemNames;
  }

  getRequiredFieldTMs(): number[] {
    return Gen1Constants.requiredFieldTMs;
  }

  getCurrentFieldTMs(): number[] {
    const itemOffsets = this.getItemOffsets();
    const fieldTMs: number[] = [];
    for (const offset of itemOffsets) {
      const itemHere = this.rom[offset] & 0xFF;
      if (itemHere >= Gen1Constants.tmsStartIndex && itemHere < Gen1Constants.tmsStartIndex + Gen1Constants.tmCount) {
        fieldTMs.push(itemHere - Gen1Constants.tmsStartIndex + 1);
      }
    }
    return fieldTMs;
  }

  setFieldTMs(fieldTMs: number[]): void {
    const itemOffsets = this.getItemOffsets();
    let tmIdx = 0;
    for (const offset of itemOffsets) {
      const itemHere = this.rom[offset] & 0xFF;
      if (itemHere >= Gen1Constants.tmsStartIndex && itemHere < Gen1Constants.tmsStartIndex + Gen1Constants.tmCount) {
        this.rom[offset] = (fieldTMs[tmIdx++] + Gen1Constants.tmsStartIndex - 1) & 0xFF;
      }
    }
  }

  getRegularFieldItems(): number[] {
    const itemOffsets = this.getItemOffsets();
    const fieldItems: number[] = [];
    for (const offset of itemOffsets) {
      const itemHere = this.rom[offset] & 0xFF;
      const isTM = itemHere >= Gen1Constants.tmsStartIndex && itemHere < Gen1Constants.tmsStartIndex + Gen1Constants.tmCount;
      // In a full implementation, would use allowedItems.isAllowed(); for now accept all non-zero non-TM items
      if (itemHere > 0 && !isTM) {
        fieldItems.push(itemHere);
      }
    }
    return fieldItems;
  }

  setRegularFieldItems(items: number[]): void {
    const itemOffsets = this.getItemOffsets();
    let itemIdx = 0;
    for (const offset of itemOffsets) {
      const itemHere = this.rom[offset] & 0xFF;
      const isTM = itemHere >= Gen1Constants.tmsStartIndex && itemHere < Gen1Constants.tmsStartIndex + Gen1Constants.tmCount;
      if (itemHere > 0 && !isTM) {
        this.rom[offset] = items[itemIdx++] & 0xFF;
      }
    }
  }

  /**
   * Item-ball offsets of every reachable map plus hidden items. Ported from
   * UPR-ZX Gen1RomHandler.java (nuzlocke-bench fix: the port returned [],
   * so field items and field TMs were never randomized).
   */
  private getItemOffsets(): number[] {
    if (!this.mapItemOffsets) this.preloadMaps();
    const itemOffs: number[] = [];
    for (const offs of this.mapItemOffsets!) if (offs) itemOffs.push(...offs);

    const hiRoutine = romEntryGetValue(this.romEntry, 'HiddenItemRoutine');
    const spclTable = romEntryGetValue(this.romEntry, 'SpecialMapPointerTable');
    const spclBank = bankOf(spclTable);
    const scan = (spclOffset: number) => {
      while ((this.rom[spclOffset] & 0xFF) !== 0xFF) {
        if (calculateOffset(this.rom[spclOffset + 3] & 0xFF, readWord(this.rom, spclOffset + 4)) === hiRoutine) {
          itemOffs.push(spclOffset + 2);
        }
        spclOffset += 6;
      }
    };
    if (!this.isYellow()) {
      let lOffs = romEntryGetValue(this.romEntry, 'SpecialMapList');
      let idx = 0;
      while ((this.rom[lOffs] & 0xFF) !== 0xFF) {
        scan(calculateOffset(spclBank, readWord(this.rom, spclTable + idx)));
        lOffs++;
        idx += 2;
      }
    } else {
      let lOffs = spclTable;
      while ((this.rom[lOffs] & 0xFF) !== 0xFF) {
        scan(calculateOffset(spclBank, readWord(this.rom, lOffs + 1)));
        lOffs += 3;
      }
    }
    return itemOffs;
  }

  /** Map id → item-ball offsets, for every map reachable from Pallet Town via connections and warps. */
  private mapItemOffsets: (number[] | null)[] | null = null;

  private preloadMaps(): void {
    this.mapItemOffsets = new Array(256).fill(null);
    const mapBanks = romEntryGetValue(this.romEntry, 'MapBanks');
    const mapAddresses = romEntryGetValue(this.romEntry, 'MapAddresses');
    // Iterative depth-first walk (the Java version recurses).
    const stack = [0];
    while (stack.length) {
      const mapID = stack.pop()!;
      if (this.mapItemOffsets[mapID] || mapID === 0xED || mapID === 0xFF) continue;
      const items: number[] = [];
      this.mapItemOffsets[mapID] = items;

      const addr = calculateOffset(this.rom[mapBanks + mapID] & 0xFF, readWord(this.rom, mapAddresses + mapID * 2));
      const bank = bankOf(addr);
      const cb = this.rom[addr + 9] & 0xFF;
      const nCons = ((cb & 8) >> 3) + ((cb & 4) >> 2) + ((cb & 2) >> 1) + (cb & 1);
      const consOffset = addr + 10;
      for (let i = 0; i < nCons; i++) stack.push(this.rom[consOffset + i * 11] & 0xFF);
      const objAddr = calculateOffset(bank, readWord(this.rom, consOffset + nCons * 11));

      // +0 border tile, +1 warp count, then warps (4 bytes; +3 = destination map)
      const nWarps = this.rom[objAddr + 1] & 0xFF;
      let offs = objAddr + 2;
      for (let i = 0; i < nWarps; i++) {
        stack.push(this.rom[offs + 3] & 0xFF);
        offs += 4;
      }
      const nSigns = this.rom[offs++] & 0xFF;
      offs += nSigns * 3;
      // Entities: text id bit 6 = trainer (8 bytes), bit 7 = item (7 bytes), else 6 bytes.
      const nEntities = this.rom[offs++] & 0xFF;
      for (let i = 0; i < nEntities; i++) {
        const tid = this.rom[offs + 5] & 0xFF;
        if (tid & (1 << 6)) {
          offs += 8;
        } else if (tid & (1 << 7) && this.rom[offs + 6] !== 0x00) {
          items.push(offs + 6);
          offs += 7;
        } else {
          offs += 6;
        }
      }
    }
  }

  getShopItems(): Map<number, Shop> {
    return new Map();
  }

  setShopItems(_shopItems: Map<number, Shop>): void {}

  getIngameTrades(): IngameTrade[] {
    const trades: IngameTrade[] = [];
    const tableOffset = romEntryGetValue(this.romEntry, 'TradeTableOffset');
    const tableSize = romEntryGetValue(this.romEntry, 'TradeTableSize');
    const nicknameLength = romEntryGetValue(this.romEntry, 'TradeNameLength');
    if (tableSize === 0) return trades;

    const unused = this.romEntry.arrayEntries.get('TradesUnused') ?? [];
    let unusedOffset = 0;
    const entryLength = nicknameLength + 3;

    for (let entry = 0; entry < tableSize; entry++) {
      if (unusedOffset < unused.length && unused[unusedOffset] === entry) {
        unusedOffset++;
        continue;
      }
      const trade = new IngameTrade();
      const entryOffset = tableOffset + entry * entryLength;
      const reqId = this.pokeRBYToNumTable[this.rom[entryOffset] & 0xFF];
      const givId = this.pokeRBYToNumTable[this.rom[entryOffset + 1] & 0xFF];
      trade.requestedPokemon = this.pokes[reqId]!;
      trade.givenPokemon = this.pokes[givId]!;
      trade.nickname = this.readString(entryOffset + 3, nicknameLength, false);
      trades.push(trade);
    }
    return trades;
  }

  setIngameTrades(trades: IngameTrade[]): void {
    const tableOffset = romEntryGetValue(this.romEntry, 'TradeTableOffset');
    const tableSize = romEntryGetValue(this.romEntry, 'TradeTableSize');
    const nicknameLength = romEntryGetValue(this.romEntry, 'TradeNameLength');
    if (tableSize === 0) return;

    const unused = this.romEntry.arrayEntries.get('TradesUnused') ?? [];
    let unusedOffset = 0;
    const entryLength = nicknameLength + 3;
    let tradeOffset = 0;

    for (let entry = 0; entry < tableSize; entry++) {
      if (unusedOffset < unused.length && unused[unusedOffset] === entry) {
        unusedOffset++;
        continue;
      }
      const trade = trades[tradeOffset++];
      const entryOffset = tableOffset + entry * entryLength;
      this.rom[entryOffset] = this.pokeNumToRBYTable[trade.requestedPokemon.number] & 0xFF;
      this.rom[entryOffset + 1] = this.pokeNumToRBYTable[trade.givenPokemon.number] & 0xFF;
      if (romEntryGetValue(this.romEntry, 'CanChangeTrainerText') > 0) {
        this.writeFixedLengthString(trade.nickname, entryOffset + 3, nicknameLength);
      }
    }
  }

  removeImpossibleEvolutions(_settings: Settings): void {
    // Gen 1: only regular trade evos - change them all to evolve at level 37
    for (const pkmn of this.pokes) {
      if (pkmn != null) {
        for (const evo of pkmn.evolutionsFrom) {
          if (evo.type === EvolutionType.TRADE) {
            evo.type = EvolutionType.LEVEL;
            evo.extraInfo = 37;
            this.addEvoUpdateLevel(this.impossibleEvolutionUpdates, evo);
          }
        }
      }
    }
  }

  makeEvolutionsEasier(_settings: Settings): void {
    // No such thing in Gen 1
  }

  removeTimeBasedEvolutions(): void {
    // No such thing in Gen 1
  }

  randomizeIntroPokemon(): void {
    const introPokemon = this.pokeNumToRBYTable[this.randomPokemon().number];
    this.rom[romEntryGetValue(this.romEntry, 'IntroPokemonOffset')] = introPokemon & 0xFF;
    this.rom[romEntryGetValue(this.romEntry, 'IntroCryOffset')] = introPokemon & 0xFF;
  }

  getMascotImage(): Uint8Array | null {
    return null;
  }

  removeEvosForPokemonPool(): void {
    // Gen 1 doesn't have this functionality
  }

  writeCheckValueToROM(_value: number): void {}

  // === Encounter implementation ===

  private getGen1EncountersImpl(): EncounterSet[] {
    const encounters: EncounterSet[] = [];
    const ghostMarowak = this.pokes[Species.marowak] ?? this.pokes[1];

    // grass & water
    const usedOffsets: number[] = [];
    const tableOffset0 = romEntryGetValue(this.romEntry, 'WildPokemonTableOffset');
    const tableBank = bankOf(tableOffset0);
    let mapID = -1;
    let tblOff = tableOffset0;

    while (readWord(this.rom, tblOff) !== Gen1Constants.encounterTableEnd) {
      mapID++;
      const offset0 = calculateOffset(tableBank, readWord(this.rom, tblOff));
      const rootOffset = offset0;
      if (!usedOffsets.includes(offset0)) {
        usedOffsets.push(offset0);
        let offset = offset0;
        for (let a = 0; a < 2; a++) {
          const rate = this.rom[offset++] & 0xFF;
          if (rate > 0) {
            const thisSet = new EncounterSet();
            thisSet.rate = rate;
            thisSet.offset = rootOffset;
            thisSet.displayName = (a === 1 ? 'Surfing' : 'Grass/Cave') + ' on ' + (this.mapNames[mapID] || ('Map ' + mapID));
            if (mapID >= Gen1Constants.towerMapsStartIndex && mapID <= Gen1Constants.towerMapsEndIndex) {
              thisSet.bannedPokemon.add(ghostMarowak);
            }
            for (let slot = 0; slot < Gen1Constants.encounterTableSize; slot++) {
              const enc = new Encounter();
              enc.level = this.rom[offset] & 0xFF;
              const pkIdx = this.pokeRBYToNumTable[this.rom[offset + 1] & 0xFF] ?? 0;
              enc.pokemon = pkIdx > 0 && pkIdx < this.pokes.length ? this.pokes[pkIdx] : this.pokes[1];
              thisSet.encounters.push(enc);
              offset += 2;
            }
            encounters.push(thisSet);
          }
        }
      } else {
        for (const es of encounters) {
          if (es.offset === offset0) {
            es.displayName = (es.displayName || '') + ', ' + (this.mapNames[mapID] || ('Map ' + mapID));
          }
        }
      }
      tblOff += 2;
    }

    // old rod
    const oldRodOffset = romEntryGetValue(this.romEntry, 'OldRodOffset');
    if (oldRodOffset !== 0) {
      const oldRodSet = new EncounterSet();
      oldRodSet.displayName = 'Old Rod Fishing';
      const oldRodEnc = new Encounter();
      oldRodEnc.level = this.rom[oldRodOffset + 2] & 0xFF;
      const oldRodIdx = this.pokeRBYToNumTable[this.rom[oldRodOffset + 1] & 0xFF] ?? 0;
      oldRodEnc.pokemon = oldRodIdx > 0 ? this.pokes[oldRodIdx] : this.pokes[1];
      oldRodSet.encounters.push(oldRodEnc);
      oldRodSet.bannedPokemon.add(ghostMarowak);
      encounters.push(oldRodSet);
    }

    // good rod
    const goodRodOffset = romEntryGetValue(this.romEntry, 'GoodRodOffset');
    if (goodRodOffset !== 0) {
      const goodRodSet = new EncounterSet();
      goodRodSet.displayName = 'Good Rod Fishing';
      for (let grSlot = 0; grSlot < 2; grSlot++) {
        const enc = new Encounter();
        enc.level = this.rom[goodRodOffset + grSlot * 2] & 0xFF;
        const grIdx = this.pokeRBYToNumTable[this.rom[goodRodOffset + grSlot * 2 + 1] & 0xFF] ?? 0;
        enc.pokemon = grIdx > 0 ? this.pokes[grIdx] : this.pokes[1];
        goodRodSet.encounters.push(enc);
      }
      goodRodSet.bannedPokemon.add(ghostMarowak);
      encounters.push(goodRodSet);
    }

    // super rod
    const superRodTableOffset = romEntryGetValue(this.romEntry, 'SuperRodTableOffset');
    if (superRodTableOffset !== 0) {
      if (this.romEntry.isYellow) {
        let srOff = superRodTableOffset;
        while ((this.rom[srOff] & 0xFF) !== 0xFF) {
          const map = this.rom[srOff++] & 0xFF;
          const thisSet = new EncounterSet();
          thisSet.displayName = 'Super Rod Fishing on ' + (this.mapNames[map] || ('Map ' + map));
          for (let encN = 0; encN < Gen1Constants.yellowSuperRodTableSize; encN++) {
            const enc = new Encounter();
            enc.level = this.rom[srOff + 1] & 0xFF;
            const srIdx = this.pokeRBYToNumTable[this.rom[srOff] & 0xFF] ?? 0;
            enc.pokemon = srIdx > 0 ? this.pokes[srIdx] : this.pokes[1];
            thisSet.encounters.push(enc);
            srOff += 2;
          }
          thisSet.bannedPokemon.add(ghostMarowak);
          encounters.push(thisSet);
        }
      } else {
        let srOff = superRodTableOffset;
        const srBank = bankOf(superRodTableOffset);
        const usedSROffsets: number[] = [];
        while ((this.rom[srOff] & 0xFF) !== 0xFF) {
          const map = this.rom[srOff++] & 0xFF;
          const setOffset = calculateOffset(srBank, readWord(this.rom, srOff));
          srOff += 2;
          if (!usedSROffsets.includes(setOffset)) {
            usedSROffsets.push(setOffset);
            const thisSet = new EncounterSet();
            thisSet.displayName = 'Super Rod Fishing on ' + (this.mapNames[map] || ('Map ' + map));
            thisSet.offset = setOffset;
            let so = setOffset;
            const pokesInSet = this.rom[so++] & 0xFF;
            for (let encN = 0; encN < pokesInSet; encN++) {
              const enc = new Encounter();
              enc.level = this.rom[so] & 0xFF;
              const sIdx = this.pokeRBYToNumTable[this.rom[so + 1] & 0xFF] ?? 0;
              enc.pokemon = sIdx > 0 ? this.pokes[sIdx] : this.pokes[1];
              thisSet.encounters.push(enc);
              so += 2;
            }
            thisSet.bannedPokemon.add(ghostMarowak);
            encounters.push(thisSet);
          } else {
            for (const es of encounters) {
              if (es.offset === setOffset) {
                es.displayName = (es.displayName || '') + ', ' + (this.mapNames[map] || ('Map ' + map));
              }
            }
          }
        }
      }
    }

    return encounters;
  }

  private setGen1EncountersImpl(encounters: EncounterSet[]): void {
    let encIdx = 0;

    // grass & water
    const usedOffsets: number[] = [];
    const tableOffset0 = romEntryGetValue(this.romEntry, 'WildPokemonTableOffset');
    const tableBank = bankOf(tableOffset0);
    let tblOff = tableOffset0;

    while (readWord(this.rom, tblOff) !== Gen1Constants.encounterTableEnd) {
      const offset0 = calculateOffset(tableBank, readWord(this.rom, tblOff));
      if (!usedOffsets.includes(offset0)) {
        usedOffsets.push(offset0);
        let offset = offset0;
        for (let a = 0; a < 2; a++) {
          const rate = this.rom[offset++] & 0xFF;
          if (rate > 0) {
            const thisSet = encounters[encIdx++];
            for (let slot = 0; slot < Gen1Constants.encounterTableSize; slot++) {
              const enc = thisSet.encounters[slot];
              this.rom[offset] = enc.level & 0xFF;
              this.rom[offset + 1] = this.pokeNumToRBYTable[enc.pokemon!.number] & 0xFF;
              offset += 2;
            }
          }
        }
      }
      tblOff += 2;
    }

    // old rod
    const oldRodOffset = romEntryGetValue(this.romEntry, 'OldRodOffset');
    if (oldRodOffset !== 0) {
      const oldRodSet = encounters[encIdx++];
      const oldRodEnc = oldRodSet.encounters[0];
      this.rom[oldRodOffset + 2] = oldRodEnc.level & 0xFF;
      this.rom[oldRodOffset + 1] = this.pokeNumToRBYTable[oldRodEnc.pokemon!.number] & 0xFF;
    }

    // good rod
    const goodRodOffset = romEntryGetValue(this.romEntry, 'GoodRodOffset');
    if (goodRodOffset !== 0) {
      const goodRodSet = encounters[encIdx++];
      for (let grSlot = 0; grSlot < 2; grSlot++) {
        const enc = goodRodSet.encounters[grSlot];
        this.rom[goodRodOffset + grSlot * 2] = enc.level & 0xFF;
        this.rom[goodRodOffset + grSlot * 2 + 1] = this.pokeNumToRBYTable[enc.pokemon!.number] & 0xFF;
      }
    }

    // super rod
    const superRodTableOffset = romEntryGetValue(this.romEntry, 'SuperRodTableOffset');
    if (superRodTableOffset !== 0) {
      if (this.romEntry.isYellow) {
        let srOff = superRodTableOffset;
        while ((this.rom[srOff] & 0xFF) !== 0xFF) {
          srOff++;
          const thisSet = encounters[encIdx++];
          for (let encN = 0; encN < Gen1Constants.yellowSuperRodTableSize; encN++) {
            const enc = thisSet.encounters[encN];
            this.rom[srOff + 1] = enc.level & 0xFF;
            this.rom[srOff] = this.pokeNumToRBYTable[enc.pokemon!.number] & 0xFF;
            srOff += 2;
          }
        }
      } else {
        let srOff = superRodTableOffset;
        const srBank = bankOf(superRodTableOffset);
        const usedSROffsets: number[] = [];
        while ((this.rom[srOff] & 0xFF) !== 0xFF) {
          srOff++;
          const setOffset = calculateOffset(srBank, readWord(this.rom, srOff));
          srOff += 2;
          if (!usedSROffsets.includes(setOffset)) {
            usedSROffsets.push(setOffset);
            let so = setOffset;
            const pokesInSet = this.rom[so++] & 0xFF;
            const thisSet = encounters[encIdx++];
            for (let encN = 0; encN < pokesInSet; encN++) {
              const enc = thisSet.encounters[encN];
              this.rom[so] = enc.level & 0xFF;
              this.rom[so + 1] = this.pokeNumToRBYTable[enc.pokemon!.number] & 0xFF;
              so += 2;
            }
          }
        }
      }
    }
  }

  // === Trainer implementation ===

  private getTrainerClassesForText(): string[] {
    const tcnames: string[] = [];
    const offsets = this.romEntry.arrayEntries.get('TrainerClassNamesOffsets');
    if (!offsets || offsets.length === 0) {
      for (let i = 0; i < Gen1Constants.trainerClassCount; i++) {
        tcnames.push('Trainer Class ' + i);
      }
      return tcnames;
    }
    // Use the last offset (which is the "real" class names list)
    let offset = offsets[offsets.length - 1];
    for (let j = 0; j < Gen1Constants.tclassesCounts[offsets.length === 2 ? 1 : 1]; j++) {
      const name = this.readVariableLengthString(offset, false);
      offset += this.lengthOfStringAt(offset, false) + 1;
      tcnames.push(name);
    }
    return tcnames;
  }

  private getGen1TrainersImpl(): Trainer[] {
    const traineroffset = romEntryGetValue(this.romEntry, 'TrainerDataTableOffset');
    const traineramount = Gen1Constants.trainerClassCount;
    const trainerclasslimits = this.romEntry.arrayEntries.get('TrainerDataClassCounts') ?? [];

    const pointers: number[] = new Array(traineramount + 1).fill(0);
    for (let i = 1; i <= traineramount; i++) {
      const tPointer = readWord(this.rom, traineroffset + (i - 1) * 2);
      pointers[i] = calculateOffset(bankOf(traineroffset), tPointer);
    }

    const tcnames = this.getTrainerClassesForText();

    const allTrainers: Trainer[] = [];
    let index = 0;
    for (let i = 1; i <= traineramount; i++) {
      let offs = pointers[i];
      const limit = trainerclasslimits[i] ?? 0;
      const tcname = tcnames[i - 1] ?? ('Class ' + i);
      for (let trnum = 0; trnum < limit; trnum++) {
        index++;
        const tr = new Trainer();
        tr.offset = offs;
        tr.index = index;
        tr.trainerclass = i;
        tr.fullDisplayName = tcname;
        const dataType = this.rom[offs] & 0xFF;
        if (dataType === 0xFF) {
          // Special trainer with per-pokemon levels
          tr.poketype = 1;
          offs++;
          while (this.rom[offs] !== 0x00) {
            const tpk = new TrainerPokemon();
            tpk.level = this.rom[offs] & 0xFF;
            const pkIdx = this.pokeRBYToNumTable[this.rom[offs + 1] & 0xFF] ?? 0;
            tpk.pokemon = pkIdx > 0 && pkIdx < this.pokes.length ? this.pokes[pkIdx] : this.pokes[1];
            tr.pokemon.push(tpk);
            offs += 2;
          }
        } else {
          // Regular trainer with fixed level
          tr.poketype = 0;
          offs++;
          while (this.rom[offs] !== 0x00) {
            const tpk = new TrainerPokemon();
            tpk.level = dataType;
            const pkIdx = this.pokeRBYToNumTable[this.rom[offs] & 0xFF] ?? 0;
            tpk.pokemon = pkIdx > 0 && pkIdx < this.pokes.length ? this.pokes[pkIdx] : this.pokes[1];
            tr.pokemon.push(tpk);
            offs++;
          }
        }
        offs++;
        allTrainers.push(tr);
      }
    }
    Gen1Constants.tagTrainersUniversal(allTrainers);
    if (this.romEntry.isYellow) {
      Gen1Constants.tagTrainersYellow(allTrainers);
    } else {
      Gen1Constants.tagTrainersRB(allTrainers);
    }
    return allTrainers;
  }

  private setGen1TrainersImpl(trainerData: Trainer[]): void {
    const traineroffset = romEntryGetValue(this.romEntry, 'TrainerDataTableOffset');
    const traineramount = Gen1Constants.trainerClassCount;
    const trainerclasslimits = this.romEntry.arrayEntries.get('TrainerDataClassCounts') ?? [];

    const pointers: number[] = new Array(traineramount + 1).fill(0);
    for (let i = 1; i <= traineramount; i++) {
      const tPointer = readWord(this.rom, traineroffset + (i - 1) * 2);
      pointers[i] = calculateOffset(bankOf(traineroffset), tPointer);
    }

    let tdIdx = 0;
    for (let i = 1; i <= traineramount; i++) {
      let offs = pointers[i];
      const limit = trainerclasslimits[i] ?? 0;
      for (let trnum = 0; trnum < limit; trnum++) {
        const tr = trainerData[tdIdx++];
        if (tr.poketype === 0) {
          // Regular trainer
          const fixedLevel = tr.pokemon[0]?.level ?? 5;
          this.rom[offs] = fixedLevel & 0xFF;
          offs++;
          for (const tpk of tr.pokemon) {
            this.rom[offs] = this.pokeNumToRBYTable[tpk.pokemon.number] & 0xFF;
            offs++;
          }
        } else {
          // Special trainer
          this.rom[offs] = 0xFF;
          offs++;
          for (const tpk of tr.pokemon) {
            this.rom[offs] = tpk.level & 0xFF;
            this.rom[offs + 1] = this.pokeNumToRBYTable[tpk.pokemon.number] & 0xFF;
            offs += 2;
          }
        }
        this.rom[offs] = 0;
        offs++;
      }
    }

    // Zero out custom moves AI table
    const extraTrainerMovesOffset = romEntryGetValue(this.romEntry, 'ExtraTrainerMovesTableOffset');
    if (extraTrainerMovesOffset !== 0) {
      this.rom[extraTrainerMovesOffset] = 0xFF;
    }

    // Champion Rival overrides in Red/Blue
    if (!this.isYellow()) {
      const glMovesOffset = romEntryGetValue(this.romEntry, 'GymLeaderMovesTableOffset');
      if (glMovesOffset !== 0) {
        const champRivalJump = glMovesOffset - Gen1Constants.champRivalOffsetFromGymLeaderMoves;
        this.rom[champRivalJump] = GBConstants.gbZ80Nop;
        this.rom[champRivalJump + 1] = GBConstants.gbZ80Nop;
      }
    }
  }

  /**
   * Search for a hex-string pattern in the ROM.
   * Returns the offset if found uniquely, -1 if not found, -2 if not unique, -3 on error.
   */
  private static find(haystack: Uint8Array, hexString: string): number {
    if (hexString.length % 2 !== 0) {
      return -3; // error
    }
    const searchFor = new Uint8Array(hexString.length / 2);
    for (let i = 0; i < searchFor.length; i++) {
      searchFor[i] = parseInt(hexString.substring(i * 2, i * 2 + 2), 16);
    }
    const found = RomFunctions.search(haystack, searchFor);
    if (found.length === 0) {
      return -1; // not found
    } else if (found.length > 1) {
      return -2; // not unique
    } else {
      return found[0];
    }
  }
}

// ---------------------------------------------------------------------------
// Bitfield helpers (ported from AbstractGBRomHandler)
// ---------------------------------------------------------------------------

export function readByteIntoFlags(
  rom: Uint8Array,
  flags: boolean[],
  offsetIntoFlags: number,
  offsetIntoROM: number,
): void {
  const thisByte = rom[offsetIntoROM] & 0xFF;
  for (let i = 0; i < 8 && (i + offsetIntoFlags) < flags.length; i++) {
    flags[offsetIntoFlags + i] = ((thisByte >> i) & 0x01) === 0x01;
  }
}

export function getByteFromFlags(flags: boolean[], offsetIntoFlags: number): number {
  let thisByte = 0;
  for (let i = 0; i < 8 && (i + offsetIntoFlags) < flags.length; i++) {
    thisByte |= (flags[offsetIntoFlags + i] ? 1 : 0) << i;
  }
  return thisByte & 0xFF;
}

// ---------------------------------------------------------------------------
// Starters (standalone functions)
// ---------------------------------------------------------------------------

export function getGen1Starters(
  rom: Uint8Array,
  romEntry: RomEntry,
  pokemonList: Pokemon[],
  pokeRBYToNumTable: number[],
): Pokemon[] {
  const starters: Pokemon[] = [];
  const offsets1 = romEntry.arrayEntries.get('StarterOffsets1')!;
  const offsets2 = romEntry.arrayEntries.get('StarterOffsets2')!;
  starters.push(pokemonList[pokeRBYToNumTable[rom[offsets1[0]] & 0xFF]]);
  starters.push(pokemonList[pokeRBYToNumTable[rom[offsets2[0]] & 0xFF]]);
  if (!romEntry.isYellow) {
    const offsets3 = romEntry.arrayEntries.get('StarterOffsets3')!;
    starters.push(pokemonList[pokeRBYToNumTable[rom[offsets3[0]] & 0xFF]]);
  }
  return starters;
}

export function setGen1Starters(
  rom: Uint8Array,
  romEntry: RomEntry,
  pokemonList: Pokemon[],
  pokeNumToRBYTable: number[],
  starters: Pokemon[],
  textTables?: TextTables,
): boolean {
  const starterAmount = romEntry.isYellow ? 2 : 3;
  if (starters.length !== starterAmount) {
    return false;
  }

  for (let i = 0; i < starterAmount; i++) {
    const starter = pokeNumToRBYTable[starters[i].number] & 0xFF;
    const offsets = romEntry.arrayEntries.get('StarterOffsets' + (i + 1))!;
    for (const offset of offsets) {
      rom[offset] = starter;
    }
  }

  if (!romEntry.isYellow) {
    if (romEntryGetValue(romEntry, 'CanChangeStarterText') > 0 && textTables) {
      const starterTextOffsets = romEntry.arrayEntries.get('StarterTextOffsets');
      if (starterTextOffsets) {
        for (let i = 0; i < 3 && i < starterTextOffsets.length; i++) {
          const text = `So! You want\\n${starters[i].name}?\\e`;
          const translated = translateString(text, textTables);
          translated.forEach((b, j) => { rom[starterTextOffsets[i] + j] = b; });
        }
      }
    }

    if (romEntryGetValue(romEntry, 'PatchPokedex') > 0) {
      const onValues = new Map<number, number>();
      for (let i = 0; i < 3; i++) {
        const pkDexNum = starters[i].number;
        const ramOffset = Math.floor((pkDexNum - 1) / 8) + romEntryGetValue(romEntry, 'PokedexRamOffset');
        const bitShift = (pkDexNum - 1) % 8;
        const writeValue = 1 << bitShift;
        if (onValues.has(ramOffset)) {
          onValues.set(ramOffset, onValues.get(ramOffset)! | writeValue);
        } else {
          onValues.set(ramOffset, writeValue);
        }
      }

      const pkDexOnOffset = romEntryGetValue(romEntry, 'StarterPokedexOnOffset');
      const pkDexOffOffset = romEntryGetValue(romEntry, 'StarterPokedexOffOffset');
      const sizeForOnRoutine = 5 * onValues.size + 3;
      const writeOnRoutineTo = romEntryGetValue(romEntry, 'StarterPokedexBranchOffset');
      const writeOffRoutineTo = writeOnRoutineTo + sizeForOnRoutine;
      const offsetForOnRoutine = makeGBPointer(writeOnRoutineTo);
      const offsetForOffRoutine = makeGBPointer(writeOffRoutineTo);
      const retOnOffset = makeGBPointer(pkDexOnOffset + 5);
      const retOffOffset = makeGBPointer(pkDexOffOffset + 4);

      rom[pkDexOnOffset] = GBConstants.gbZ80Jump;
      writeWord(rom, pkDexOnOffset + 1, offsetForOnRoutine);
      rom[pkDexOnOffset + 3] = GBConstants.gbZ80Nop;
      rom[pkDexOnOffset + 4] = GBConstants.gbZ80Nop;

      rom[pkDexOffOffset] = GBConstants.gbZ80Jump;
      writeWord(rom, pkDexOffOffset + 1, offsetForOffRoutine);
      rom[pkDexOffOffset + 3] = GBConstants.gbZ80Nop;

      rom[writeOffRoutineTo] = GBConstants.gbZ80XorA;
      let turnOnOffset = writeOnRoutineTo;
      let turnOffOffset = writeOffRoutineTo + 1;
      const sortedKeys = [...onValues.keys()].sort((a, b) => a - b);
      for (const ramOffset of sortedKeys) {
        const onValue = onValues.get(ramOffset)!;
        rom[turnOnOffset++] = GBConstants.gbZ80LdA;
        rom[turnOnOffset++] = onValue & 0xFF;
        rom[turnOnOffset++] = GBConstants.gbZ80LdAToFar;
        rom[turnOnOffset++] = ramOffset % 0x100;
        rom[turnOnOffset++] = Math.floor(ramOffset / 0x100);
        rom[turnOffOffset++] = GBConstants.gbZ80LdAToFar;
        rom[turnOffOffset++] = ramOffset % 0x100;
        rom[turnOffOffset++] = Math.floor(ramOffset / 0x100);
      }
      rom[turnOnOffset++] = GBConstants.gbZ80Jump;
      writeWord(rom, turnOnOffset, retOnOffset);
      rom[turnOffOffset++] = GBConstants.gbZ80Jump;
      writeWord(rom, turnOffOffset, retOffOffset);
    }
  }

  return true;
}

// ---------------------------------------------------------------------------
// Moveset loading (standalone function)
// ---------------------------------------------------------------------------

export function getGen1MovesLearnt(
  rom: Uint8Array,
  romEntry: RomEntry,
  pokemonList: Pokemon[],
  pokeRBYToNumTable: number[],
  moveRomToNumTable: number[],
): Map<number, MoveLearnt[]> {
  const movesets = new Map<number, MoveLearnt[]>();
  const pointersOffset = romEntryGetValue(romEntry, 'PokemonMovesetsTableOffset');
  const pokeStatsOffset = romEntryGetValue(romEntry, 'PokemonStatsOffset');
  const pkmnCount = romEntryGetValue(romEntry, 'InternalPokemonCount');

  for (let i = 1; i <= pkmnCount; i++) {
    const pointer = readWord(rom, pointersOffset + (i - 1) * 2);
    let realPointer = calculateOffset(bankOf(pointersOffset), pointer);
    if (pokeRBYToNumTable[i] !== 0) {
      const pokeNum = pokeRBYToNumTable[i];
      let statsOffset: number;
      if (pokeNum === Species.mew && !romEntry.isYellow) {
        statsOffset = romEntryGetValue(romEntry, 'MewStatsOffset');
      } else {
        statsOffset = (pokeNum - 1) * Gen1Constants.baseStatsEntrySize + pokeStatsOffset;
      }

      const ourMoves: MoveLearnt[] = [];
      for (let delta = Gen1Constants.bsLevel1MovesOffset; delta < Gen1Constants.bsLevel1MovesOffset + 4; delta++) {
        if (rom[statsOffset + delta] !== 0x00) {
          const learnt = new MoveLearnt();
          learnt.level = 1;
          learnt.move = moveRomToNumTable[rom[statsOffset + delta] & 0xFF];
          ourMoves.push(learnt);
        }
      }

      while (rom[realPointer] !== 0) {
        if (rom[realPointer] === 1) {
          realPointer += 3;
        } else if (rom[realPointer] === 2) {
          realPointer += 4;
        } else if (rom[realPointer] === 3) {
          realPointer += 3;
        }
      }
      realPointer++;

      while (rom[realPointer] !== 0) {
        const learnt = new MoveLearnt();
        learnt.level = rom[realPointer] & 0xFF;
        learnt.move = moveRomToNumTable[rom[realPointer + 1] & 0xFF];
        ourMoves.push(learnt);
        realPointer += 2;
      }

      movesets.set(pokeNum, ourMoves);
    }
  }

  return movesets;
}

// ---------------------------------------------------------------------------
// writeEvosAndMovesLearnt (standalone function)
// ---------------------------------------------------------------------------

export function writeGen1EvosAndMovesLearnt(
  rom: Uint8Array,
  romEntry: RomEntry,
  pokemonList: Pokemon[],
  pokeRBYToNumTable: number[],
  pokeNumToRBYTable: number[],
  moveNumToRomTable: number[],
  movesets: Map<number, MoveLearnt[]> | null,
  writeEvos: boolean,
): void {
  const pokeStatsOffset = romEntryGetValue(romEntry, 'PokemonStatsOffset');
  const movesEvosStart = romEntryGetValue(romEntry, 'PokemonMovesetsTableOffset');
  const movesEvosBank = bankOf(movesEvosStart);
  const pkmnCount = romEntryGetValue(romEntry, 'InternalPokemonCount');
  const pointerTable = new Uint8Array(pkmnCount * 2);
  const mainDataBlockSize = romEntryGetValue(romEntry, 'PokemonMovesetsDataSize');
  const mainDataBlockOffset = movesEvosStart + pointerTable.length;
  const mainDataBlock = new Uint8Array(mainDataBlockSize);
  let offsetInMainData = 0;

  const extraSpaceOffset = romEntryGetValue(romEntry, 'PokemonMovesetsExtraSpaceOffset');
  const extraSpaceBank = bankOf(extraSpaceOffset);
  let extraSpaceEnabled = false;
  let extraDataBlock: Uint8Array | null = null;
  let offsetInExtraData = 0;
  let extraSpaceSize = 0;

  if (movesEvosBank === extraSpaceBank && extraSpaceOffset !== 0) {
    extraSpaceEnabled = true;
    const startOfNextBank = (Math.floor(extraSpaceOffset / GBConstants.bankSize) + 1) * GBConstants.bankSize;
    extraSpaceSize = startOfNextBank - extraSpaceOffset;
    extraDataBlock = new Uint8Array(extraSpaceSize);
  }

  let nullEntryPointer = -1;

  for (let i = 1; i <= pkmnCount; i++) {
    let writeData: Uint8Array | null = null;
    const oldDataOffset = calculateOffset(movesEvosBank, readWord(rom, movesEvosStart + (i - 1) * 2));
    let setNullEntryPointerHere = false;

    if (pokeRBYToNumTable[i] === 0) {
      if (nullEntryPointer === -1) {
        writeData = new Uint8Array([0, 0]);
        setNullEntryPointerHere = true;
      } else {
        writeWord(pointerTable, (i - 1) * 2, nullEntryPointer);
      }
    } else {
      const pokeNum = pokeRBYToNumTable[i];
      const pkmn = pokemonList[pokeNum];
      const dataBytes: number[] = [];

      if (!writeEvos) {
        let evoOffset = oldDataOffset;
        while (rom[evoOffset] !== 0x00) {
          const method = rom[evoOffset] & 0xFF;
          const limiter = (method === 2) ? 4 : 3;
          for (let b = 0; b < limiter; b++) {
            dataBytes.push(rom[evoOffset++] & 0xFF);
          }
        }
      } else {
        if (pkmn.evolutionsFrom) {
          for (const evo of pkmn.evolutionsFrom) {
            dataBytes.push(evolutionTypeToIndex(evo.type, 1));
            if (evo.type.toString() === 'LEVEL') {
              dataBytes.push(evo.extraInfo);
            } else if (evo.type.toString() === 'STONE') {
              dataBytes.push(evo.extraInfo);
              dataBytes.push(1);
            } else if (evo.type.toString() === 'TRADE') {
              dataBytes.push(1);
            }
            const pokeIndexTo = pokeNumToRBYTable[evo.to.number];
            dataBytes.push(pokeIndexTo);
          }
        }
      }
      dataBytes.push(0);

      if (movesets === null) {
        let movesOffset = oldDataOffset;
        while (rom[movesOffset] !== 0x00) {
          const method = rom[movesOffset] & 0xFF;
          movesOffset += (method === 2) ? 4 : 3;
        }
        movesOffset++;
        while (rom[movesOffset] !== 0x00) {
          dataBytes.push(rom[movesOffset++] & 0xFF);
          dataBytes.push(rom[movesOffset++] & 0xFF);
        }
      } else {
        const ourMoves = movesets.get(pkmn.number) || [];
        let statsOffset: number;
        if (pokeNum === Species.mew && !romEntry.isYellow) {
          statsOffset = romEntryGetValue(romEntry, 'MewStatsOffset');
        } else {
          statsOffset = (pokeNum - 1) * Gen1Constants.baseStatsEntrySize + pokeStatsOffset;
        }
        let movenum = 0;
        while (movenum < 4 && ourMoves.length > movenum && ourMoves[movenum].level === 1) {
          rom[statsOffset + Gen1Constants.bsLevel1MovesOffset + movenum] =
            moveNumToRomTable[ourMoves[movenum].move] & 0xFF;
          movenum++;
        }
        for (let mn = movenum; mn < 4; mn++) {
          rom[statsOffset + Gen1Constants.bsLevel1MovesOffset + mn] = 0;
        }
        while (movenum < ourMoves.length) {
          dataBytes.push(ourMoves[movenum].level & 0xFF);
          dataBytes.push(moveNumToRomTable[ourMoves[movenum].move] & 0xFF);
          movenum++;
        }
      }
      dataBytes.push(0);

      writeData = new Uint8Array(dataBytes);
    }

    if (writeData !== null) {
      const lengthToFit = writeData.length;
      let pointerToWrite = -1;

      if (
        (offsetInMainData + lengthToFit <= mainDataBlockSize) ||
        (writeData[0] === 0 && offsetInMainData > 0 && offsetInMainData + lengthToFit === mainDataBlockSize + 1)
      ) {
        if (writeData[0] === 0 && offsetInMainData > 0) {
          const writtenDataOffset = mainDataBlockOffset + offsetInMainData - 1;
          pointerToWrite = makeGBPointer(writtenDataOffset);
          mainDataBlock.set(writeData.subarray(1), offsetInMainData);
          offsetInMainData += lengthToFit - 1;
        } else {
          const writtenDataOffset = mainDataBlockOffset + offsetInMainData;
          pointerToWrite = makeGBPointer(writtenDataOffset);
          mainDataBlock.set(writeData, offsetInMainData);
          offsetInMainData += lengthToFit;
        }
      } else if (
        extraSpaceEnabled &&
        extraDataBlock !== null &&
        ((offsetInExtraData + lengthToFit <= extraSpaceSize) ||
          (writeData[0] === 0 && offsetInExtraData > 0 && offsetInExtraData + lengthToFit === extraSpaceSize + 1))
      ) {
        if (writeData[0] === 0 && offsetInExtraData > 0) {
          const writtenDataOffset = extraSpaceOffset + offsetInExtraData - 1;
          pointerToWrite = makeGBPointer(writtenDataOffset);
          extraDataBlock.set(writeData.subarray(1), offsetInExtraData);
          offsetInExtraData += lengthToFit - 1;
        } else {
          const writtenDataOffset = extraSpaceOffset + offsetInExtraData;
          pointerToWrite = makeGBPointer(writtenDataOffset);
          extraDataBlock.set(writeData, offsetInExtraData);
          offsetInExtraData += lengthToFit;
        }
      } else {
        throw new Error('Unable to save moves/evolutions, out of space');
      }

      if (pointerToWrite >= 0) {
        writeWord(pointerTable, (i - 1) * 2, pointerToWrite);
        if (setNullEntryPointerHere) {
          nullEntryPointer = pointerToWrite;
        }
      }
    }
  }

  rom.set(pointerTable, movesEvosStart);
  rom.set(mainDataBlock, mainDataBlockOffset);
  if (extraSpaceEnabled && extraDataBlock !== null) {
    rom.set(extraDataBlock, extraSpaceOffset);
  }
}

// ---------------------------------------------------------------------------
// TM / HM functions (standalone)
// ---------------------------------------------------------------------------

export function getGen1TMMoves(
  rom: Uint8Array,
  romEntry: RomEntry,
  moveRomToNumTable: number[],
): number[] {
  const tms: number[] = [];
  const offset = romEntryGetValue(romEntry, 'TMMovesOffset');
  for (let i = 1; i <= Gen1Constants.tmCount; i++) {
    tms.push(moveRomToNumTable[rom[offset + (i - 1)] & 0xFF]);
  }
  return tms;
}

export function setGen1TMMoves(
  rom: Uint8Array,
  romEntry: RomEntry,
  moveNumToRomTable: number[],
  moves: number[],
): void {
  const offset = romEntryGetValue(romEntry, 'TMMovesOffset');
  for (let i = 1; i <= Gen1Constants.tmCount; i++) {
    rom[offset + (i - 1)] = moveNumToRomTable[moves[i - 1]] & 0xFF;
  }
  if (!romEntry.isYellow) {
    const tms = Gen1Constants.gymLeaderTMs;
    const glMovesOffset = romEntryGetValue(romEntry, 'GymLeaderMovesTableOffset');
    for (let i = 0; i < tms.length; i++) {
      rom[glMovesOffset + i * 2] = moveNumToRomTable[moves[tms[i] - 1]] & 0xFF;
    }
  }
}

export function getGen1HMMoves(
  rom: Uint8Array,
  romEntry: RomEntry,
  moveRomToNumTable: number[],
): number[] {
  const hms: number[] = [];
  const offset = romEntryGetValue(romEntry, 'TMMovesOffset');
  for (let i = 1; i <= Gen1Constants.hmCount; i++) {
    hms.push(moveRomToNumTable[rom[offset + Gen1Constants.tmCount + (i - 1)] & 0xFF]);
  }
  return hms;
}

export function getGen1TMHMCompatibility(
  rom: Uint8Array,
  romEntry: RomEntry,
  pokemonList: Pokemon[],
  pokedexCount: number,
): Map<Pokemon, boolean[]> {
  const compat = new Map<Pokemon, boolean[]>();
  const pokeStatsOffset = romEntryGetValue(romEntry, 'PokemonStatsOffset');
  for (let i = 1; i <= pokedexCount; i++) {
    const baseStatsOffset = (romEntry.isYellow || i !== Species.mew)
      ? (pokeStatsOffset + (i - 1) * Gen1Constants.baseStatsEntrySize)
      : romEntryGetValue(romEntry, 'MewStatsOffset');
    const pkmn = pokemonList[i];
    const flags = new Array<boolean>(Gen1Constants.tmCount + Gen1Constants.hmCount + 1).fill(false);
    for (let j = 0; j < 7; j++) {
      readByteIntoFlags(rom, flags, j * 8 + 1, baseStatsOffset + Gen1Constants.bsTMHMCompatOffset + j);
    }
    compat.set(pkmn, flags);
  }
  return compat;
}

export function setGen1TMHMCompatibility(
  rom: Uint8Array,
  romEntry: RomEntry,
  pokemonList: Pokemon[],
  compatData: Map<Pokemon, boolean[]>,
): void {
  const pokeStatsOffset = romEntryGetValue(romEntry, 'PokemonStatsOffset');
  for (const [pkmn, flags] of compatData) {
    const baseStatsOffset = (romEntry.isYellow || pkmn.number !== Species.mew)
      ? (pokeStatsOffset + (pkmn.number - 1) * Gen1Constants.baseStatsEntrySize)
      : romEntryGetValue(romEntry, 'MewStatsOffset');
    for (let j = 0; j < 7; j++) {
      rom[baseStatsOffset + Gen1Constants.bsTMHMCompatOffset + j] = getByteFromFlags(flags, j * 8 + 1);
    }
  }
}

// ---------------------------------------------------------------------------
// Factory (ROM detection without loading)
// ---------------------------------------------------------------------------

export class Gen1Factory {
  static isLoadable(data: Uint8Array, romEntries: RomEntry[]): boolean {
    if (data.length > 8 * 1024 * 1024) {
      return false;
    }
    if (data.length === 0) {
      return false;
    }
    const partial =
      data.length > 0x1000 ? data.subarray(0, 0x1000) : data;
    return detectRomInner(partial, data.length, romEntries);
  }
}

// ---------------------------------------------------------------------------
// Standalone helpers (kept for backward compatibility)
// ---------------------------------------------------------------------------

export function readFixedLengthString(
  rom: Uint8Array,
  offset: number,
  length: number,
  tables: TextTables,
): string {
  return readStringFromRom(rom, offset, length, false, tables);
}

export function writeFixedLengthString(
  rom: Uint8Array,
  str: string,
  offset: number,
  length: number,
  tables: TextTables,
): void {
  const translated = translateString(str, tables);
  const len = Math.min(translated.length, length);
  rom.set(translated.subarray(0, len), offset);
  for (let i = len; i < length; i++) {
    rom[offset + i] = GBConstants.stringTerminator;
  }
}

export function readVariableLengthString(
  rom: Uint8Array,
  offset: number,
  textEngineMode: boolean,
  tables: TextTables,
): string {
  return readStringFromRom(rom, offset, 0x7fffffff, textEngineMode, tables);
}

// ---------------------------------------------------------------------------
// Pokedex order: maps between internal RBY order and national dex order
// ---------------------------------------------------------------------------

export interface PokedexMapping {
  pokeNumToRBY: number[];
  pokeRBYToNum: number[];
  pokedexCount: number;
}

export function loadPokedexOrder(
  rom: Uint8Array,
  romEntry: RomEntry,
): PokedexMapping {
  const pkmnCount = romEntryGetValue(romEntry, 'InternalPokemonCount');
  const orderOffset = romEntryGetValue(romEntry, 'PokedexOrder');
  const pokeNumToRBY = new Array<number>(256).fill(0);
  const pokeRBYToNum = new Array<number>(256).fill(0);
  let pokedexCount = 0;

  for (let i = 1; i <= pkmnCount; i++) {
    const pokedexNum = rom[orderOffset + i - 1] & 0xff;
    pokeRBYToNum[i] = pokedexNum;
    if (pokedexNum !== 0 && pokeNumToRBY[pokedexNum] === 0) {
      pokeNumToRBY[pokedexNum] = i;
    }
    pokedexCount = Math.max(pokedexCount, pokedexNum);
  }

  return { pokeNumToRBY, pokeRBYToNum, pokedexCount };
}

// ---------------------------------------------------------------------------
// Bulk Pokemon name reading
// ---------------------------------------------------------------------------

export function readPokemonNames(
  rom: Uint8Array,
  romEntry: RomEntry,
  tables: TextTables,
): string[] {
  const offs = romEntryGetValue(romEntry, 'PokemonNamesOffset');
  const nameLength = romEntryGetValue(romEntry, 'PokemonNamesLength');
  const pkmnCount = romEntryGetValue(romEntry, 'InternalPokemonCount');
  const names: string[] = new Array(pkmnCount + 1).fill('');
  for (let i = 1; i <= pkmnCount; i++) {
    names[i] = readFixedLengthString(
      rom,
      offs + (i - 1) * nameLength,
      nameLength,
      tables,
    );
  }
  return names;
}

// ---------------------------------------------------------------------------
// Bulk move name reading
// ---------------------------------------------------------------------------

export function readMoveNames(
  rom: Uint8Array,
  romEntry: RomEntry,
  tables: TextTables,
): string[] {
  const moveCount = romEntryGetValue(romEntry, 'MoveCount');
  let offset = romEntryGetValue(romEntry, 'MoveNamesOffset');
  const moveNames: string[] = new Array(moveCount + 1).fill('');
  for (let i = 1; i <= moveCount; i++) {
    moveNames[i] = readVariableLengthString(rom, offset, false, tables);
    offset += lengthOfStringAt(rom, offset, false) + 1;
  }
  return moveNames;
}

// ---------------------------------------------------------------------------
// Bulk Pokemon stats loading / saving
// ---------------------------------------------------------------------------

export function loadAllPokemonStats(
  rom: Uint8Array,
  romEntry: RomEntry,
  dexMapping: PokedexMapping,
  tables: TextTables,
): Pokemon[] {
  const { pokeNumToRBY, pokedexCount } = dexMapping;
  const pokes: (Pokemon | null)[] = new Array(pokedexCount + 1).fill(null);

  const pokeNames = readPokemonNames(rom, romEntry, tables);

  const pokeStatsOffset = romEntryGetValue(romEntry, 'PokemonStatsOffset');
  for (let i = 1; i <= pokedexCount; i++) {
    pokes[i] = new Gen1Pokemon();
    pokes[i]!.number = i;
    if (i !== Species.mew || romEntry.isYellow) {
      loadBasicPokeStats(
        pokes[i]!,
        rom,
        pokeStatsOffset + (i - 1) * Gen1Constants.baseStatsEntrySize,
        romEntry,
      );
    }
    pokes[i]!.name = pokeNames[pokeNumToRBY[i]] || '';
  }

  // Mew override for R/B (only if Mew exists in this ROM)
  if (!romEntry.isYellow && Species.mew <= pokedexCount && pokes[Species.mew] != null) {
    loadBasicPokeStats(
      pokes[Species.mew]!,
      rom,
      romEntryGetValue(romEntry, 'MewStatsOffset'),
      romEntry,
    );
  }

  return pokes as Pokemon[];
}

export function saveAllPokemonStats(
  rom: Uint8Array,
  romEntry: RomEntry,
  pokes: Pokemon[],
  dexMapping: PokedexMapping,
  tables: TextTables,
): void {
  const { pokeNumToRBY, pokedexCount } = dexMapping;

  const offs = romEntryGetValue(romEntry, 'PokemonNamesOffset');
  const nameLength = romEntryGetValue(romEntry, 'PokemonNamesLength');
  for (let i = 1; i <= pokedexCount; i++) {
    const rbynum = pokeNumToRBY[i];
    const stringOffset = offs + (rbynum - 1) * nameLength;
    writeFixedLengthString(rom, pokes[i].name, stringOffset, nameLength, tables);
  }

  const pokeStatsOffset = romEntryGetValue(romEntry, 'PokemonStatsOffset');
  for (let i = 1; i <= pokedexCount; i++) {
    if (i === Species.mew) {
      continue;
    }
    saveBasicPokeStats(
      pokes[i],
      rom,
      pokeStatsOffset + (i - 1) * Gen1Constants.baseStatsEntrySize,
      romEntry,
    );
  }

  // Write MEW (only if it exists in this ROM)
  if (Species.mew <= pokedexCount && pokes[Species.mew] != null) {
    const mewOffset = romEntry.isYellow
      ? pokeStatsOffset + (Species.mew - 1) * Gen1Constants.baseStatsEntrySize
      : romEntryGetValue(romEntry, 'MewStatsOffset');
    saveBasicPokeStats(pokes[Species.mew], rom, mewOffset, romEntry);
  }
}

// ---------------------------------------------------------------------------
// Bulk move loading / saving
// ---------------------------------------------------------------------------

export interface MoveLoadResult {
  moves: (Move | null)[];
  moveNumToRomTable: number[];
  moveRomToNumTable: number[];
}

export function loadAllMoves(
  rom: Uint8Array,
  romEntry: RomEntry,
  tables: TextTables,
): MoveLoadResult {
  const moveNames = readMoveNames(rom, romEntry, tables);
  const moveCount = romEntryGetValue(romEntry, 'MoveCount');
  const movesOffset = romEntryGetValue(romEntry, 'MoveDataOffset');

  const moveNumToRomTable = new Array<number>(256).fill(0);
  const moveRomToNumTable = new Array<number>(256).fill(0);

  let trueMoveCount = 0;
  for (let i = 1; i <= moveCount; i++) {
    if (
      (rom[movesOffset + (i - 1) * 6] & 0xff) !== 0 &&
      moveNames[i] !== 'Nothing'
    ) {
      trueMoveCount++;
    }
  }

  const moves: (Move | null)[] = new Array(trueMoveCount + 1).fill(null);
  let trueMoveIndex = 0;

  for (let i = 1; i <= moveCount; i++) {
    const anim = rom[movesOffset + (i - 1) * 6] & 0xff;
    if (anim > 0 && moveNames[i] !== 'Nothing') {
      trueMoveIndex++;
      moveNumToRomTable[trueMoveIndex] = i;
      moveRomToNumTable[i] = trueMoveIndex;
      const move = loadMoveData(rom, movesOffset, i, moveNames[i], romEntry);
      move.number = trueMoveIndex;
      moves[trueMoveIndex] = move;
    }
  }

  return { moves, moveNumToRomTable, moveRomToNumTable };
}

export function saveAllMoves(
  rom: Uint8Array,
  romEntry: RomEntry,
  moves: (Move | null)[],
): void {
  const movesOffset = romEntryGetValue(romEntry, 'MoveDataOffset');
  for (const m of moves) {
    if (m != null) {
      saveMoveData(rom, movesOffset, m, romEntry);
    }
  }
}

// ---------------------------------------------------------------------------
// Evolution parsing
// ---------------------------------------------------------------------------

export function populateEvolutions(
  rom: Uint8Array,
  romEntry: RomEntry,
  pokes: Pokemon[],
  dexMapping: PokedexMapping,
): void {
  const { pokeRBYToNum } = dexMapping;

  for (const pkmn of pokes) {
    if (pkmn != null) {
      pkmn.evolutionsFrom = [];
      pkmn.evolutionsTo = [];
    }
  }

  const pointersOffset = romEntryGetValue(
    romEntry,
    'PokemonMovesetsTableOffset',
  );
  const pkmnCount = romEntryGetValue(romEntry, 'InternalPokemonCount');

  for (let i = 1; i <= pkmnCount; i++) {
    const pointer = readWord(rom, pointersOffset + (i - 1) * 2);
    let realPointer = calculateOffset(bankOf(pointersOffset), pointer);
    if (pokeRBYToNum[i] !== 0) {
      const thisPoke = pokeRBYToNum[i];
      if (thisPoke < 1 || thisPoke >= pokes.length || pokes[thisPoke] == null) {
        continue;
      }
      const pkmn = pokes[thisPoke];
      while (rom[realPointer] !== 0) {
        const method = rom[realPointer];
        const type = evolutionTypeFromIndex(1, method);
        if (type == null) {
          realPointer += 3;
          continue;
        }
        const targetInternalId =
          rom[realPointer + 2 + (type === EvolutionType.STONE ? 1 : 0)] & 0xff;
        const otherPoke = pokeRBYToNum[targetInternalId];
        const extraInfo = rom[realPointer + 1] & 0xff;

        if (
          otherPoke > 0 &&
          otherPoke < pokes.length &&
          pokes[otherPoke] != null
        ) {
          const evo = new Evolution(
            pkmn,
            pokes[otherPoke],
            true,
            type,
            extraInfo,
          );
          const isDuplicate = pkmn.evolutionsFrom.some(
            (e) =>
              e.from === evo.from && e.to === evo.to && e.type === evo.type,
          );
          if (!isDuplicate) {
            pkmn.evolutionsFrom.push(evo);
            pokes[otherPoke].evolutionsTo.push(evo);
          }
        }
        realPointer += type === EvolutionType.STONE ? 4 : 3;
      }
      if (pkmn.evolutionsFrom.length > 1) {
        for (const e of pkmn.evolutionsFrom) {
          e.carryStats = false;
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// ROM I/O: loading and saving
// ---------------------------------------------------------------------------

export interface Gen1RomData {
  rom: Uint8Array;
  originalRom: Uint8Array;
  romEntry: RomEntry;
  tables: TextTables;
  pokes: Pokemon[];
  pokemonList: (Pokemon | null)[];
  moves: (Move | null)[];
  moveNumToRomTable: number[];
  moveRomToNumTable: number[];
  dexMapping: PokedexMapping;
  loadedFilename: string;
}

export function parseGen1OffsetsIni(text: string): RomEntry[] {
  const entries: RomEntry[] = [];
  let current: RomEntry | null = null;
  const copyFromQueue: { entry: RomEntry; copyFrom: string }[] = [];

  for (const rawLine of text.split('\n')) {
    let q = rawLine.trim();
    const commentIdx = q.indexOf('//');
    if (commentIdx >= 0) {
      q = q.substring(0, commentIdx).trim();
    }
    if (q === '') continue;

    if (q.startsWith('[') && q.endsWith(']')) {
      current = createDefaultRomEntry();
      current.name = q.substring(1, q.length - 1);
      entries.push(current);
    } else if (current != null) {
      const eqIdx = q.indexOf('=');
      if (eqIdx < 0) continue;
      const key = q.substring(0, eqIdx).trim();
      let value = q.substring(eqIdx + 1).trim();
      if (value.endsWith('\r')) {
        value = value.substring(0, value.length - 1);
      }

      if (key === 'Game') {
        current.romName = value;
      } else if (key === 'Version') {
        current.version = parseIniInt(value);
      } else if (key === 'NonJapanese') {
        current.nonJapanese = parseIniInt(value);
      } else if (key === 'Type') {
        current.isYellow = value.toLowerCase() === 'yellow';
      } else if (key === 'ExtraTableFile') {
        current.extraTableFile = value;
      } else if (key === 'CRCInHeader') {
        current.crcInHeader = parseIniInt(value);
      } else if (key === 'CRC32') {
        current.expectedCRC32 = parseInt(value.trim(), 16);
      } else if (key === 'CopyFrom') {
        copyFromQueue.push({ entry: current, copyFrom: value });
      } else if (key === 'CopyTMText') {
        // ignored for now
      } else if (key.endsWith('Tweak') || key.endsWith('tweak')) {
        current.tweakFiles.set(key, value);
      } else if (key.endsWith('[]') || (value.startsWith('[') && value.endsWith(']') && !key.includes('{}'))) {
        const arrayKey = key.endsWith('[]') ? key.substring(0, key.length - 2) : key;
        if (value.startsWith('[') && value.endsWith(']')) {
          const inner = value.substring(1, value.length - 1);
          const nums = inner.split(',').map((s) => parseIniInt(s.trim()));
          current.arrayEntries.set(arrayKey, nums);
        }
      } else if (key.startsWith('StaticPokemon') && key.includes('{}')) {
        // Parse StaticPokemon{}={Species=[...], Level=[...]}
        const sp = parseStaticPokemonEntry(value);
        if (sp) {
          if (key.includes('GhostMarowak')) {
            current.ghostMarowakOffsets = sp.speciesOffsets;
          } else {
            current.staticPokemon.push(sp);
          }
        }
      } else if (key.startsWith('TMText')) {
        // ignored
      } else if (!key.includes('{}')) {
        current.entries.set(key, parseIniInt(value));
      }
    }
  }

  // Process CopyFrom directives
  for (const { entry, copyFrom } of copyFromQueue) {
    const source = entries.find((e) => e.name === copyFrom);
    if (source) {
      // Copy entries that don't already exist in the target
      for (const [k, v] of source.entries) {
        if (!entry.entries.has(k)) {
          entry.entries.set(k, v);
        }
      }
      for (const [k, v] of source.arrayEntries) {
        if (!entry.arrayEntries.has(k)) {
          entry.arrayEntries.set(k, [...v]);
        }
      }
      for (const [k, v] of source.tweakFiles) {
        if (!entry.tweakFiles.has(k)) {
          entry.tweakFiles.set(k, v);
        }
      }
      if (entry.extraTableFile == null && source.extraTableFile != null) {
        entry.extraTableFile = source.extraTableFile;
      }
      if (entry.staticPokemon.length === 0 && source.staticPokemon.length > 0) {
        entry.staticPokemon = source.staticPokemon.map((sp) => ({
          speciesOffsets: [...sp.speciesOffsets],
          levelOffsets: [...sp.levelOffsets],
        }));
      }
      if (entry.ghostMarowakOffsets.length === 0 && source.ghostMarowakOffsets.length > 0) {
        entry.ghostMarowakOffsets = [...source.ghostMarowakOffsets];
      }
    }
  }

  return entries;
}

function parseStaticPokemonEntry(value: string): StaticPokemonEntry | null {
  // Format: {Species=[0x..., 0x...], Level=[0x...]}
  const speciesMatch = value.match(/Species=\[([^\]]*)\]/);
  const levelMatch = value.match(/Level=\[([^\]]*)\]/);
  if (!speciesMatch) return null;
  const speciesOffsets = speciesMatch[1]
    .split(',')
    .map((s) => parseIniInt(s.trim()))
    .filter((n) => !isNaN(n));
  const levelOffsets = levelMatch
    ? levelMatch[1]
        .split(',')
        .map((s) => parseIniInt(s.trim()))
        .filter((n) => !isNaN(n))
    : [];
  return { speciesOffsets, levelOffsets };
}

function parseIniInt(s: string): number {
  s = s.trim();
  if (s.startsWith('0x') || s.startsWith('0X')) {
    return parseInt(s, 16);
  }
  return parseInt(s, 10);
}

export function loadGen1Rom(
  romBytes: Uint8Array,
  romEntries: RomEntry[],
  textTableLines: string[],
  extraTableLines: string[] | null,
  filename: string,
): Gen1RomData {
  const romEntry = checkRomEntry(romBytes, romEntries);
  if (romEntry == null) {
    throw new Error(
      'Could not detect ROM entry. ROM is not a recognized Gen 1 ROM.',
    );
  }

  const rom = new Uint8Array(romBytes);
  const originalRom = new Uint8Array(romBytes);

  const tables = createTextTables();
  readTextTable(tables, textTableLines);
  if (extraTableLines != null) {
    readTextTable(tables, extraTableLines);
  }

  const dexMapping = loadPokedexOrder(rom, romEntry);
  const pokes = loadAllPokemonStats(rom, romEntry, dexMapping, tables);
  populateEvolutions(rom, romEntry, pokes, dexMapping);

  const pokemonList: (Pokemon | null)[] = new Array(pokes.length).fill(null);
  for (let i = 0; i < pokes.length; i++) {
    pokemonList[i] = pokes[i] ?? null;
  }

  const { moves, moveNumToRomTable, moveRomToNumTable } = loadAllMoves(
    rom,
    romEntry,
    tables,
  );

  return {
    rom,
    originalRom,
    romEntry,
    tables,
    pokes,
    pokemonList,
    moves,
    moveNumToRomTable,
    moveRomToNumTable,
    dexMapping,
    loadedFilename: filename,
  };
}

export function saveGen1Rom(data: Gen1RomData): Uint8Array {
  saveAllPokemonStats(
    data.rom,
    data.romEntry,
    data.pokes,
    data.dexMapping,
    data.tables,
  );
  saveAllMoves(data.rom, data.romEntry, data.moves);
  return data.rom;
}

// ---------------------------------------------------------------------------
// ROM metadata helpers
// ---------------------------------------------------------------------------

export function getROMName(rom: Uint8Array): string {
  let name = '';
  for (
    let i = GBConstants.romSigOffset;
    i < GBConstants.romSigOffset + 16;
    i++
  ) {
    const ch = rom[i] & 0xff;
    if (ch === 0) break;
    name += String.fromCharCode(ch);
  }
  return name;
}

export function getROMCode(rom: Uint8Array): string {
  let code = '';
  for (
    let i = GBConstants.romCodeOffset;
    i < GBConstants.romCodeOffset + 4;
    i++
  ) {
    const ch = rom[i] & 0xff;
    if (ch === 0) break;
    code += String.fromCharCode(ch);
  }
  return code;
}

export function getSupportLevel(romEntry: RomEntry): string {
  if (romEntry.name.includes('(J)')) {
    return 'partial';
  }
  return 'full';
}

export function isRomValid(rom: Uint8Array, romEntries: RomEntry[]): boolean {
  return detectRomInner(rom, rom.length, romEntries);
}

export function printRomDiagnostics(
  rom: Uint8Array,
  romEntry: RomEntry,
  filename: string,
): string[] {
  const lines: string[] = [];
  lines.push('File name: ' + filename);
  lines.push('ROM name: ' + getROMName(rom));
  lines.push('ROM entry: ' + romEntry.name);
  lines.push('Type: ' + (romEntry.isYellow ? 'Yellow' : 'Red/Blue'));
  return lines;
}

// ---------------------------------------------------------------------------
// Type Effectiveness (standalone functions for Step 8)
// ---------------------------------------------------------------------------

/**
 * A single type effectiveness relationship: attacker type vs defender type.
 */
export interface TypeRelationship {
  attacker: string;
  defender: string;
  effectiveness: Effectiveness;
}

/**
 * Read the type effectiveness table from ROM.
 */
export function readGen1TypeEffectiveness(
  rom: Uint8Array,
  romEntry: RomEntry,
): TypeRelationship[] {
  const typeEffectivenessTable: TypeRelationship[] = [];
  let currentOffset = romEntryGetValue(romEntry, 'TypeEffectivenessOffset');
  let attackingType = rom[currentOffset] & 0xFF;

  while (attackingType !== 0xFF) {
    const defendingType = rom[currentOffset + 1] & 0xFF;
    const effectivenessInternal = rom[currentOffset + 2] & 0xFF;

    const attacking =
      attackingType < Gen1Constants.typeTable.length
        ? Gen1Constants.typeTable[attackingType]
        : null;
    const defending =
      defendingType < Gen1Constants.typeTable.length
        ? Gen1Constants.typeTable[defendingType]
        : null;

    let effectiveness: Effectiveness | null = null;
    switch (effectivenessInternal) {
      case 20:
        effectiveness = Effectiveness.DOUBLE;
        break;
      case 10:
        effectiveness = Effectiveness.NEUTRAL;
        break;
      case 5:
        effectiveness = Effectiveness.HALF;
        break;
      case 0:
        effectiveness = Effectiveness.ZERO;
        break;
    }

    if (effectiveness !== null && attacking !== null && defending !== null) {
      typeEffectivenessTable.push({
        attacker: attacking,
        defender: defending,
        effectiveness,
      });
    }

    currentOffset += 3;
    attackingType = rom[currentOffset] & 0xFF;
  }

  return typeEffectivenessTable;
}

/**
 * Write the type effectiveness table back to ROM.
 */
export function writeGen1TypeEffectiveness(
  rom: Uint8Array,
  romEntry: RomEntry,
  typeEffectivenessTable: TypeRelationship[],
): void {
  let currentOffset = romEntryGetValue(romEntry, 'TypeEffectivenessOffset');
  for (const relationship of typeEffectivenessTable) {
    rom[currentOffset] = Gen1Constants.typeToByte(relationship.attacker);
    rom[currentOffset + 1] = Gen1Constants.typeToByte(relationship.defender);
    let effectivenessInternal = 0;
    switch (relationship.effectiveness) {
      case Effectiveness.DOUBLE:
        effectivenessInternal = 20;
        break;
      case Effectiveness.NEUTRAL:
        effectivenessInternal = 10;
        break;
      case Effectiveness.HALF:
        effectivenessInternal = 5;
        break;
      case Effectiveness.ZERO:
        effectivenessInternal = 0;
        break;
    }
    rom[currentOffset + 2] = effectivenessInternal;
    currentOffset += 3;
  }
}

// ---------------------------------------------------------------------------
// Item Names (standalone function for Step 8)
// ---------------------------------------------------------------------------

/**
 * Load item names from ROM. Ported from Gen1RomHandler.loadItemNames().
 */
export function getGen1ItemNames(
  rom: Uint8Array,
  romEntry: RomEntry,
  tables: TextTables,
): string[] {
  const itemNames: string[] = new Array(256).fill('glitch');
  const origOffset = romEntryGetValue(romEntry, 'ItemNamesOffset');
  let itemNameOffset = origOffset;

  for (let index = 1; index <= 0x100; index++) {
    if (Math.floor(itemNameOffset / GBConstants.bankSize) > Math.floor(origOffset / GBConstants.bankSize)) {
      break;
    }
    const startOfText = itemNameOffset;
    while (itemNameOffset < rom.length && (rom[itemNameOffset] & 0xFF) !== GBConstants.stringTerminator) {
      itemNameOffset++;
    }
    itemNameOffset++;
    itemNames[index % 256] = readFixedLengthString(rom, startOfText, 20, tables);
  }

  // HMs override
  for (let index = Gen1Constants.hmsStartIndex; index < Gen1Constants.tmsStartIndex; index++) {
    const hmNum = index - Gen1Constants.hmsStartIndex + 1;
    itemNames[index] = 'HM' + hmNum.toString().padStart(2, '0');
  }

  // TMs override
  for (let index = Gen1Constants.tmsStartIndex; index < 0x100; index++) {
    const tmNum = index - Gen1Constants.tmsStartIndex + 1;
    itemNames[index] = 'TM' + tmNum.toString().padStart(2, '0');
  }

  return itemNames;
}

// ---------------------------------------------------------------------------
// Misc: Randomize Intro Pokemon (standalone function for Step 8)
// ---------------------------------------------------------------------------

/**
 * Randomize the intro Pokemon shown at the title screen.
 */
export function randomizeGen1IntroPokemon(
  rom: Uint8Array,
  romEntry: RomEntry,
  randomInternalId: number,
): void {
  rom[romEntryGetValue(romEntry, 'IntroPokemonOffset')] = randomInternalId & 0xFF;
  rom[romEntryGetValue(romEntry, 'IntroCryOffset')] = randomInternalId & 0xFF;
}

// ---------------------------------------------------------------------------
// Static Pokemon (standalone types/functions for Step 8)
// ---------------------------------------------------------------------------

/**
 * Represents a static Pokemon entry from the ROM entry config.
 */
export interface StaticPokemonEntry {
  speciesOffsets: number[];
  levelOffsets: number[];
}

/**
 * Read static Pokemon encounters from ROM using standalone function.
 */
export function getGen1StaticPokemon(
  rom: Uint8Array,
  romEntry: RomEntry,
  staticEntries: StaticPokemonEntry[],
  pokemonList: (Pokemon | null)[],
  pokeRBYToNumTable: number[],
): StaticEncounter[] {
  const statics: StaticEncounter[] = [];
  if (romEntryGetValue(romEntry, 'StaticPokemonSupport') > 0) {
    for (const sp of staticEntries) {
      const se = new StaticEncounter();
      const internalId = rom[sp.speciesOffsets[0]] & 0xFF;
      const nationalNum = pokeRBYToNumTable[internalId] ?? 0;
      se.pkmn = pokemonList[nationalNum]!;
      se.level = sp.levelOffsets.length > 0 ? (rom[sp.levelOffsets[0]] & 0xFF) : 1;
      statics.push(se);
    }
  }
  return statics;
}

/**
 * Write static Pokemon encounters back to ROM using standalone function.
 */
export function setGen1StaticPokemon(
  rom: Uint8Array,
  romEntry: RomEntry,
  staticEntries: StaticPokemonEntry[],
  statics: StaticEncounter[],
  pokeNumToRBYTable: number[],
): boolean {
  if (romEntryGetValue(romEntry, 'StaticPokemonSupport') === 0) {
    return false;
  }
  for (let i = 0; i < staticEntries.length; i++) {
    const se = statics[i];
    const sp = staticEntries[i];
    const rbyId = pokeNumToRBYTable[se.pkmn.number] & 0xFF;
    for (const offset of sp.speciesOffsets) {
      rom[offset] = rbyId;
    }
    if (sp.levelOffsets.length > 0) {
      rom[sp.levelOffsets[0]] = se.level & 0xFF;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// In-game Trades (standalone functions for Step 8)
// ---------------------------------------------------------------------------

/**
 * Read in-game trades from ROM using standalone function.
 */
export function getGen1IngameTrades(
  rom: Uint8Array,
  romEntry: RomEntry,
  pokemonList: (Pokemon | null)[],
  pokeRBYToNumTable: number[],
  tables: TextTables,
): IngameTrade[] {
  const trades: IngameTrade[] = [];

  const tableOffset = romEntryGetValue(romEntry, 'TradeTableOffset');
  const tableSize = romEntryGetValue(romEntry, 'TradeTableSize');
  const nicknameLength = romEntryGetValue(romEntry, 'TradeNameLength');
  const unused = romEntry.arrayEntries.get('TradesUnused') ?? [];
  let unusedOffset = 0;
  const entryLength = nicknameLength + 3;

  for (let entry = 0; entry < tableSize; entry++) {
    if (unusedOffset < unused.length && unused[unusedOffset] === entry) {
      unusedOffset++;
      continue;
    }
    const trade = new IngameTrade();
    const entryOffset = tableOffset + entry * entryLength;
    trade.requestedPokemon = pokemonList[pokeRBYToNumTable[rom[entryOffset] & 0xFF]]!;
    trade.givenPokemon = pokemonList[pokeRBYToNumTable[rom[entryOffset + 1] & 0xFF]]!;
    trade.nickname = readStringFromRom(rom, entryOffset + 3, nicknameLength, false, tables);
    trades.push(trade);
  }

  return trades;
}

/**
 * Write in-game trades back to ROM using standalone function.
 */
export function setGen1IngameTrades(
  rom: Uint8Array,
  romEntry: RomEntry,
  trades: IngameTrade[],
  pokeNumToRBYTable: number[],
  tables: TextTables,
): void {
  const tableOffset = romEntryGetValue(romEntry, 'TradeTableOffset');
  const tableSize = romEntryGetValue(romEntry, 'TradeTableSize');
  const nicknameLength = romEntryGetValue(romEntry, 'TradeNameLength');
  const unused = romEntry.arrayEntries.get('TradesUnused') ?? [];
  let unusedOffset = 0;
  const entryLength = nicknameLength + 3;
  let tradeOffset = 0;

  for (let entry = 0; entry < tableSize; entry++) {
    if (unusedOffset < unused.length && unused[unusedOffset] === entry) {
      unusedOffset++;
      continue;
    }
    const trade = trades[tradeOffset++];
    const entryOffset = tableOffset + entry * entryLength;
    rom[entryOffset] = pokeNumToRBYTable[trade.requestedPokemon.number] & 0xFF;
    rom[entryOffset + 1] = pokeNumToRBYTable[trade.givenPokemon.number] & 0xFF;
    if (romEntryGetValue(romEntry, 'CanChangeTrainerText') > 0) {
      writeFixedLengthString(rom, trade.nickname, entryOffset + 3, nicknameLength, tables);
    }
  }
}

// ---------------------------------------------------------------------------
// Field TMs (standalone functions for Step 8)
// ---------------------------------------------------------------------------

export function getGen1RequiredFieldTMs(): number[] {
  return [...Gen1Constants.requiredFieldTMs];
}

export function getGen1CurrentFieldTMs(
  rom: Uint8Array,
  itemOffsets: number[],
): number[] {
  const fieldTMs: number[] = [];
  for (const offset of itemOffsets) {
    const itemHere = rom[offset] & 0xFF;
    if (itemHere >= Gen1Constants.tmsStartIndex && itemHere < Gen1Constants.tmsStartIndex + Gen1Constants.tmCount) {
      fieldTMs.push(itemHere - Gen1Constants.tmsStartIndex + 1);
    }
  }
  return fieldTMs;
}

export function setGen1FieldTMs(
  rom: Uint8Array,
  itemOffsets: number[],
  fieldTMs: number[],
): void {
  let tmIdx = 0;
  for (const offset of itemOffsets) {
    const itemHere = rom[offset] & 0xFF;
    if (itemHere >= Gen1Constants.tmsStartIndex && itemHere < Gen1Constants.tmsStartIndex + Gen1Constants.tmCount) {
      rom[offset] = (fieldTMs[tmIdx++] + Gen1Constants.tmsStartIndex - 1) & 0xFF;
    }
  }
}

export function getGen1RegularFieldItems(
  rom: Uint8Array,
  itemOffsets: number[],
  isAllowed: (itemId: number) => boolean,
  isTM: (itemId: number) => boolean,
): number[] {
  const fieldItems: number[] = [];
  for (const offset of itemOffsets) {
    const itemHere = rom[offset] & 0xFF;
    if (isAllowed(itemHere) && !isTM(itemHere)) {
      fieldItems.push(itemHere);
    }
  }
  return fieldItems;
}

export function setGen1RegularFieldItems(
  rom: Uint8Array,
  itemOffsets: number[],
  items: number[],
  isAllowed: (itemId: number) => boolean,
  isTM: (itemId: number) => boolean,
): void {
  let itemIdx = 0;
  for (const offset of itemOffsets) {
    const itemHere = rom[offset] & 0xFF;
    if (isAllowed(itemHere) && !isTM(itemHere)) {
      rom[offset] = items[itemIdx++] & 0xFF;
    }
  }
}

// ---------------------------------------------------------------------------
// Shops (standalone functions for Step 8)
// ---------------------------------------------------------------------------

export function getGen1ShopItems(): Map<number, Shop> | null {
  return null;
}

export function setGen1ShopItems(_shops: Map<number, Shop>): void {
  // Not implemented for Gen 1
}

// ---------------------------------------------------------------------------
// Trainer Names (standalone functions for Step 8)
// ---------------------------------------------------------------------------

export function getGen1TrainerNames(
  rom: Uint8Array,
  romEntry: RomEntry,
  tables: TextTables,
): string[] {
  const offsets = romEntry.arrayEntries.get('TrainerClassNamesOffsets') ?? [];
  if (offsets.length === 0) return [];
  const trainerNames: string[] = [];
  let offset = offsets[offsets.length - 1];
  for (let j = 0; j < Gen1Constants.tclassesCounts[1]; j++) {
    const name = readVariableLengthString(rom, offset, false, tables);
    offset += lengthOfStringAt(rom, offset, false) + 1;
    if (Gen1Constants.singularTrainers.includes(j)) {
      trainerNames.push(name);
    }
  }
  return trainerNames;
}

export function setGen1TrainerNames(
  rom: Uint8Array,
  romEntry: RomEntry,
  names: string[],
  tables: TextTables,
): void {
  if (romEntryGetValue(romEntry, 'CanChangeTrainerText') <= 0) return;
  const offsets = romEntry.arrayEntries.get('TrainerClassNamesOffsets') ?? [];
  if (offsets.length === 0) return;
  let nameIdx = 0;
  let offset = offsets[offsets.length - 1];
  for (let j = 0; j < Gen1Constants.tclassesCounts[1]; j++) {
    const oldLength = lengthOfStringAt(rom, offset, false) + 1;
    if (Gen1Constants.singularTrainers.includes(j)) {
      const newName = names[nameIdx++];
      writeFixedLengthString(rom, newName, offset, oldLength, tables);
    }
    offset += oldLength;
  }
}

export function getGen1TrainerClassNames(
  rom: Uint8Array,
  romEntry: RomEntry,
  tables: TextTables,
): string[] {
  const offsets = romEntry.arrayEntries.get('TrainerClassNamesOffsets') ?? [];
  if (offsets.length === 0) return [];
  const trainerClassNames: string[] = [];
  if (offsets.length === 2) {
    for (let i = 0; i < offsets.length; i++) {
      let offset = offsets[i];
      for (let j = 0; j < Gen1Constants.tclassesCounts[i]; j++) {
        const name = readVariableLengthString(rom, offset, false, tables);
        offset += lengthOfStringAt(rom, offset, false) + 1;
        if (i === 0 || !Gen1Constants.singularTrainers.includes(j)) {
          trainerClassNames.push(name);
        }
      }
    }
  } else {
    let offset = offsets[0];
    for (let j = 0; j < Gen1Constants.tclassesCounts[1]; j++) {
      const name = readVariableLengthString(rom, offset, false, tables);
      offset += lengthOfStringAt(rom, offset, false) + 1;
      if (!Gen1Constants.singularTrainers.includes(j)) {
        trainerClassNames.push(name);
      }
    }
  }
  return trainerClassNames;
}

export function setGen1TrainerClassNames(
  rom: Uint8Array,
  romEntry: RomEntry,
  names: string[],
  tables: TextTables,
): void {
  if (romEntryGetValue(romEntry, 'CanChangeTrainerText') <= 0) return;
  const offsets = romEntry.arrayEntries.get('TrainerClassNamesOffsets') ?? [];
  if (offsets.length === 0) return;
  let nameIdx = 0;
  if (offsets.length === 2) {
    for (let i = 0; i < offsets.length; i++) {
      let offset = offsets[i];
      for (let j = 0; j < Gen1Constants.tclassesCounts[i]; j++) {
        const oldLength = lengthOfStringAt(rom, offset, false) + 1;
        if (i === 0 || !Gen1Constants.singularTrainers.includes(j)) {
          const newName = names[nameIdx++];
          writeFixedLengthString(rom, newName, offset, oldLength, tables);
        }
        offset += oldLength;
      }
    }
  } else {
    let offset = offsets[0];
    for (let j = 0; j < Gen1Constants.tclassesCounts[1]; j++) {
      const oldLength = lengthOfStringAt(rom, offset, false) + 1;
      if (!Gen1Constants.singularTrainers.includes(j)) {
        const newName = names[nameIdx++];
        writeFixedLengthString(rom, newName, offset, oldLength, tables);
      }
      offset += oldLength;
    }
  }
}

// ---------------------------------------------------------------------------
// Known Gen 1 ROM entries for factory detection
// ---------------------------------------------------------------------------

export const knownGen1RomEntries: RomEntry[] = [
  { ...createDefaultRomEntry(), name: 'Pokemon Red (U)', romName: 'POKEMON RED', version: 0, nonJapanese: 1, crcInHeader: -1 },
  { ...createDefaultRomEntry(), name: 'Pokemon Blue (U)', romName: 'POKEMON BLUE', version: 0, nonJapanese: 1, crcInHeader: -1 },
  { ...createDefaultRomEntry(), name: 'Pokemon Yellow (U)', romName: 'POKEMON YELLOW', version: 0, nonJapanese: 1, crcInHeader: -1, isYellow: true },
];

// ---------------------------------------------------------------------------
// Gen1RomHandlerFactory - extends RomHandlerFactory for CLI wiring
// ---------------------------------------------------------------------------

export class Gen1RomHandlerFactory extends RomHandlerFactory {
  private romEntries: RomEntry[];

  constructor(romEntries?: RomEntry[]) {
    super();
    if (romEntries) {
      this.romEntries = romEntries;
    } else {
      // Try to load from INI file
      try {
        const iniPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/com/dabomstew/pkrandom/config/gen1_offsets.ini');
        if (fs.existsSync(iniPath)) {
          const iniText = fs.readFileSync(iniPath, 'utf-8');
          this.romEntries = parseGen1OffsetsIni(iniText);
        } else {
          this.romEntries = knownGen1RomEntries;
        }
      } catch {
        this.romEntries = knownGen1RomEntries;
      }
    }
  }

  isLoadable(filename: string): boolean {
    try {
      const stats = fs.statSync(filename);
      if (stats.size < GBConstants.minRomSize || stats.size > GBConstants.maxRomSize) {
        return false;
      }
      const fd = fs.openSync(filename, 'r');
      const headerSize = Math.min(stats.size, 0x1000);
      const buffer = Buffer.alloc(headerSize);
      fs.readSync(fd, buffer, 0, headerSize, 0);
      fs.closeSync(fd);
      const data = new Uint8Array(buffer);
      return detectRomInner(data, stats.size, this.romEntries);
    } catch {
      return false;
    }
  }

  createWithLog(random: RandomInstance, log: LogStream | null): RomHandler {
    return new Gen1RomHandler(random, log, this.romEntries) as unknown as RomHandler;
  }
}
