/*----------------------------------------------------------------------------*/
/*--  gen3-rom-handler.ts - randomizer handler for R/S/E/FR/LG.             --*/
/*--                                                                        --*/
/*--  Part of "Universal Pokemon Randomizer ZX" by the UPR-ZX team          --*/
/*--  Originally part of "Universal Pokemon Randomizer" by Dabomstew        --*/
/*--  Pokemon and any associated names and the like are                     --*/
/*--  trademark and (C) Nintendo 1996-2020.                                 --*/
/*--                                                                        --*/
/*--  The custom code written here is licensed under the terms of the GPL:  --*/
/*--                                                                        --*/
/*--  This program is free software: you can redistribute it and/or modify  --*/
/*--  it under the terms of the GNU General Public License as published by  --*/
/*--  the Free Software Foundation, either version 3 of the License, or     --*/
/*--  (at your option) any later version.                                   --*/
/*--                                                                        --*/
/*--  This program is distributed in the hope that it will be useful,       --*/
/*--  but WITHOUT ANY WARRANTY; without even the implied warranty of        --*/
/*--  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the          --*/
/*--  GNU General Public License for more details.                          --*/
/*--                                                                        --*/
/*--  You should have received a copy of the GNU General Public License     --*/
/*--  along with this program. If not, see <http://www.gnu.org/licenses/>.  --*/
/*----------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as Gen3Constants from "../constants/gen3-constants";
import * as Gen3Items from "../constants/gen3-items";
import { Effectiveness } from "../pokemon/effectiveness";
import { FileFunctions } from '../utils/file-functions';
import * as GBConstants from "../constants/gb-constants";
import * as GlobalConstants from "../constants/global-constants";
import * as Moves from "../constants/moves";
import * as Species from "../constants/species";
import { AbstractGBRomHandler } from './abstract-gb-rom-handler';
import type { LogStream, RomHandler } from './rom-handler';
import { TrainerNameMode, RomHandlerFactory } from './rom-handler';
import type { RandomInstance } from '../utils/random-source';
import type { Settings } from '../config/settings';
import { Pokemon } from "../pokemon/pokemon";
import { Move, MoveStatChange } from "../pokemon/move";
import { MoveCategory } from "../pokemon/move-category";
import { MoveLearnt } from '../pokemon/move-learnt';
import { StatChangeMoveType } from "../pokemon/stat-change-move-type";
import { StatChangeType } from "../pokemon/stat-change-type";
import { StatusMoveType } from "../pokemon/status-move-type";
import { StatusType } from "../pokemon/status-type";
import { Type } from "../pokemon/type";
import { CriticalChance } from "../pokemon/critical-chance";
import { expCurveFromByte, expCurveToByte } from "../pokemon/exp-curve";
import { ItemList } from '../pokemon/item-list';
import { Trainer } from '../pokemon/trainer';
import { TrainerPokemon } from '../pokemon/trainer-pokemon';
import { Encounter } from '../pokemon/encounter';
import { EncounterSet } from '../pokemon/encounter-set';
import { StaticEncounter } from '../pokemon/static-encounter';
import { Evolution } from '../pokemon/evolution';
import { EvolutionType, evolutionTypeFromIndex, evolutionTypeToIndex } from '../pokemon/evolution-type';
import { EvolutionUpdate } from './evolution-update';
import { IngameTrade } from '../pokemon/ingame-trade';
import { Shop } from '../pokemon/shop';
import type { MegaEvolution } from '../pokemon/mega-evolution';
import type { TotemPokemon } from '../pokemon/totem-pokemon';
import type { StatChange } from '../pokemon/stat-change';
import { RomFunctions, type StringSizeDeterminer } from "../utils/rom-functions";
import { MiscTweak } from '../utils/misc-tweak';
import { RandomizerIOException } from '../exceptions/randomizer-io-exception';

// ---- Inner types ----

interface TMOrMTTextEntry {
  number: number;
  mapBank: number;
  mapNumber: number;
  personNum: number;
  offsetInScript: number;
  actualOffset: number;
  template: string;
  isMoveTutor: boolean;
}

export interface StaticPokemon {
  speciesOffsets: number[];
  levelOffsets: number[];
}

export class RomEntry {
  name: string = "";
  romCode: string = "";
  tableFile: string = "";
  version: number = 0;
  romType: number = 0;
  copyStaticPokemon: boolean = false;
  entries: Map<string, number> = new Map();
  arrayEntries: Map<string, number[]> = new Map();
  strings: Map<string, string> = new Map();
  staticPokemon: StaticPokemon[] = [];
  roamingPokemon: StaticPokemon[] = [];
  tmmtTexts: TMOrMTTextEntry[] = [];
  codeTweaks: Map<string, string> = new Map();
  expectedCRC32: number = -1;

  constructor(toCopy?: RomEntry) {
    if (toCopy) {
      this.name = toCopy.name;
      this.romCode = toCopy.romCode;
      this.tableFile = toCopy.tableFile;
      this.version = toCopy.version;
      this.romType = toCopy.romType;
      this.copyStaticPokemon = toCopy.copyStaticPokemon;
      this.entries = new Map(toCopy.entries);
      this.arrayEntries = new Map(toCopy.arrayEntries);
      this.strings = new Map(toCopy.strings);
      this.staticPokemon = [...toCopy.staticPokemon];
      this.roamingPokemon = [...toCopy.roamingPokemon];
      this.tmmtTexts = [...toCopy.tmmtTexts];
      this.codeTweaks = new Map(toCopy.codeTweaks);
      this.expectedCRC32 = toCopy.expectedCRC32;
    }
  }

  getValue(key: string): number {
    if (!this.entries.has(key)) {
      this.entries.set(key, 0);
    }
    return this.entries.get(key)!;
  }

  getString(key: string): string {
    if (!this.strings.has(key)) {
      this.strings.set(key, "");
    }
    return this.strings.get(key)!;
  }
}

/**
 * The empty Pokemon signature used to detect unused slots.
 */
export const emptyPokemonSig = new Uint8Array([
  0x32, 0x96, 0x32, 0x96, 0x96, 0x32, 0x00, 0x00, 0x03, 0x01, 0xaa, 0x0a,
  0x00, 0x00, 0x00, 0x00, 0xff, 0x78, 0x00, 0x00, 0x0f, 0x0f, 0x00, 0x00,
  0x00, 0x04, 0x00, 0x00,
]);

// ---- Helper functions ----

function parseRIInt(off: string): number {
  let radix = 10;
  off = off.trim().toLowerCase();
  if (off.startsWith("0x") || off.startsWith("&h")) {
    radix = 16;
    off = off.substring(2);
  }
  const result = parseInt(off, radix);
  if (isNaN(result)) {
    return 0;
  }
  return result;
}

function parseRILong(off: string): number {
  // In TS we use number (64-bit float), sufficient for these values
  return parseRIInt(off);
}

function parseStaticPokemon(staticPokemonString: string): StaticPokemon {
  const sp: StaticPokemon = { speciesOffsets: [], levelOffsets: [] };
  const pattern = /[A-Za-z]+=\[(0x[0-9a-fA-F]+,?\s?)+\]/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(staticPokemonString)) !== null) {
    const segments = match[0].split("=");
    const romOffsets = segments[1].substring(1, segments[1].length - 1).split(",");
    const offsets: number[] = romOffsets.map((o) => parseRIInt(o));
    switch (segments[0]) {
      case "Species":
        sp.speciesOffsets = offsets;
        break;
      case "Level":
        sp.levelOffsets = offsets;
        break;
    }
  }
  return sp;
}

// ---- ROM name / code checks ----

export function romName(rom: Uint8Array, name: string): boolean {
  const sigOffset = Gen3Constants.romNameOffset;
  for (let i = 0; i < name.length; i++) {
    if (rom[sigOffset + i] !== name.charCodeAt(i)) {
      return false;
    }
  }
  return true;
}

export function romCode(rom: Uint8Array, codeToCheck: string): boolean {
  const sigOffset = Gen3Constants.romCodeOffset;
  for (let i = 0; i < codeToCheck.length; i++) {
    if (rom[sigOffset + i] !== codeToCheck.charCodeAt(i)) {
      return false;
    }
  }
  return true;
}

// ---- Byte search helpers ----

export function hexStringToBytes(hexString: string): Uint8Array {
  const bytes = new Uint8Array(hexString.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hexString.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function find(haystack: Uint8Array, hexString: string): number {
  if (hexString.length % 2 !== 0) {
    return -3; // error
  }
  const searchFor = hexStringToBytes(hexString);
  const found = RomFunctions.search(haystack, searchFor);
  if (found.length === 0) {
    return -1; // not found
  } else if (found.length > 1) {
    return -2; // not unique
  } else {
    return found[0];
  }
}

export function findMultiple(haystack: Uint8Array, hexString: string): number[] {
  if (hexString.length % 2 !== 0) {
    return []; // error
  }
  const searchFor = hexStringToBytes(hexString);
  return RomFunctions.search(haystack, searchFor);
}

// ---- ROM byte read/write helpers ----

export function readWord(rom: Uint8Array, offset: number): number {
  return (rom[offset] & 0xff) + ((rom[offset + 1] & 0xff) << 8);
}

export function writeWord(rom: Uint8Array, offset: number, value: number): void {
  rom[offset] = value & 0xff;
  rom[offset + 1] = (value >>> 8) & 0xff;
}

export function readLong(rom: Uint8Array, offset: number): number {
  return (
    (rom[offset] & 0xff) +
    ((rom[offset + 1] & 0xff) << 8) +
    ((rom[offset + 2] & 0xff) << 16) +
    ((rom[offset + 3] & 0xff) << 24)
  ) >>> 0; // unsigned 32-bit
}

export function writeLong(rom: Uint8Array, offset: number, value: number): void {
  rom[offset] = value & 0xff;
  rom[offset + 1] = (value >>> 8) & 0xff;
  rom[offset + 2] = (value >>> 16) & 0xff;
  rom[offset + 3] = (value >>> 24) & 0xff;
}

export function readPointer(rom: Uint8Array, offset: number): number {
  // GBA pointers are stored as offset + 0x08000000
  const raw = readLong(rom, offset);
  return (raw - 0x08000000) | 0; // signed 32-bit subtraction
}

export function writePointer(rom: Uint8Array, offset: number, pointer: number): void {
  writeLong(rom, offset, (pointer + 0x08000000) >>> 0);
}

export function matches(data: Uint8Array, offset: number, needle: Uint8Array): boolean {
  for (let i = 0; i < needle.length; i++) {
    if (offset + i >= data.length) {
      return false;
    }
    if (data[offset + i] !== needle[i]) {
      return false;
    }
  }
  return true;
}

// ---- ROM detection ----

/**
 * Inner detection logic: checks size, magic prefixes, known game codes.
 */
export function detectRomInner(
  rom: Uint8Array,
  romSize: number,
  roms: RomEntry[]
): boolean {
  if (
    romSize !== Gen3Constants.size8M &&
    romSize !== Gen3Constants.size16M &&
    romSize !== Gen3Constants.size32M
  ) {
    return false;
  }

  // Special case for Emerald unofficial translation
  if (romName(rom, Gen3Constants.unofficialEmeraldROMName)) {
    rom[Gen3Constants.romCodeOffset] = 0x42; // 'B'
    rom[Gen3Constants.romCodeOffset + 1] = 0x50; // 'P'
    rom[Gen3Constants.romCodeOffset + 2] = 0x45; // 'E'
    rom[Gen3Constants.romCodeOffset + 3] = 0x54; // 'T'
    rom[Gen3Constants.headerChecksumOffset] = 0x66;
  }

  // Wild Pokemon header
  if (find(rom, Gen3Constants.wildPokemonPointerPrefix) === -1) {
    return false;
  }

  // Map Banks header
  if (find(rom, Gen3Constants.mapBanksPointerPrefix) === -1) {
    return false;
  }

  // Pokedex Order header (must have exactly 3 matches)
  if (findMultiple(rom, Gen3Constants.pokedexOrderPointerPrefix).length !== 3) {
    return false;
  }

  // Check for matching game code and version
  for (const re of roms) {
    if (
      romCode(rom, re.romCode) &&
      (rom[Gen3Constants.romVersionOffset] & 0xff) === re.version
    ) {
      return true;
    }
  }

  return false; // GBA rom we don't support yet
}

// ---- Pokemon data loading ----

/**
 * Loads basic Pokemon stats from ROM bytes at the given offset.
 */
export function loadBasicPokeStats(
  pk: Pokemon,
  rom: Uint8Array,
  offset: number
): void {
  pk.hp = rom[offset + Gen3Constants.bsHPOffset] & 0xff;
  pk.attack = rom[offset + Gen3Constants.bsAttackOffset] & 0xff;
  pk.defense = rom[offset + Gen3Constants.bsDefenseOffset] & 0xff;
  pk.speed = rom[offset + Gen3Constants.bsSpeedOffset] & 0xff;
  pk.spatk = rom[offset + Gen3Constants.bsSpAtkOffset] & 0xff;
  pk.spdef = rom[offset + Gen3Constants.bsSpDefOffset] & 0xff;

  // Type
  const primaryTypeStr =
    Gen3Constants.typeTable[rom[offset + Gen3Constants.bsPrimaryTypeOffset] & 0xff];
  const secondaryTypeStr =
    Gen3Constants.typeTable[rom[offset + Gen3Constants.bsSecondaryTypeOffset] & 0xff];

  pk.primaryType = primaryTypeStr as any;
  pk.secondaryType =
    secondaryTypeStr === primaryTypeStr ? null : (secondaryTypeStr as any);

  pk.catchRate = rom[offset + Gen3Constants.bsCatchRateOffset] & 0xff;

  const growthByte = rom[offset + Gen3Constants.bsGrowthCurveOffset];
  const curve = expCurveFromByte(growthByte);
  if (curve !== null) {
    pk.growthCurve = curve;
  }

  // Abilities
  pk.ability1 = rom[offset + Gen3Constants.bsAbility1Offset] & 0xff;
  pk.ability2 = rom[offset + Gen3Constants.bsAbility2Offset] & 0xff;

  // Held Items
  const item1 = readWord(rom, offset + Gen3Constants.bsCommonHeldItemOffset);
  const item2 = readWord(rom, offset + Gen3Constants.bsRareHeldItemOffset);

  if (item1 === item2) {
    pk.guaranteedHeldItem = item1;
    pk.commonHeldItem = 0;
    pk.rareHeldItem = 0;
  } else {
    pk.guaranteedHeldItem = 0;
    pk.commonHeldItem = item1;
    pk.rareHeldItem = item2;
  }
  pk.darkGrassHeldItem = -1;

  pk.genderRatio = rom[offset + Gen3Constants.bsGenderRatioOffset] & 0xff;
}

/**
 * Saves basic Pokemon stats to ROM bytes at the given offset.
 */
export function saveBasicPokeStats(
  pk: Pokemon,
  rom: Uint8Array,
  offset: number
): void {
  rom[offset + Gen3Constants.bsHPOffset] = pk.hp;
  rom[offset + Gen3Constants.bsAttackOffset] = pk.attack;
  rom[offset + Gen3Constants.bsDefenseOffset] = pk.defense;
  rom[offset + Gen3Constants.bsSpeedOffset] = pk.speed;
  rom[offset + Gen3Constants.bsSpAtkOffset] = pk.spatk;
  rom[offset + Gen3Constants.bsSpDefOffset] = pk.spdef;

  rom[offset + Gen3Constants.bsPrimaryTypeOffset] = Gen3Constants.typeToByte(
    pk.primaryType as any
  );
  if (pk.secondaryType == null) {
    rom[offset + Gen3Constants.bsSecondaryTypeOffset] =
      rom[offset + Gen3Constants.bsPrimaryTypeOffset];
  } else {
    rom[offset + Gen3Constants.bsSecondaryTypeOffset] = Gen3Constants.typeToByte(
      pk.secondaryType as any
    );
  }

  rom[offset + Gen3Constants.bsCatchRateOffset] = pk.catchRate;
  if (pk.growthCurve !== undefined) {
    rom[offset + Gen3Constants.bsGrowthCurveOffset] = expCurveToByte(pk.growthCurve);
  }

  rom[offset + Gen3Constants.bsAbility1Offset] = pk.ability1;
  if (pk.ability2 === 0) {
    rom[offset + Gen3Constants.bsAbility2Offset] = pk.ability1;
  } else {
    rom[offset + Gen3Constants.bsAbility2Offset] = pk.ability2;
  }

  // Held items
  if (pk.guaranteedHeldItem > 0) {
    writeWord(rom, offset + Gen3Constants.bsCommonHeldItemOffset, pk.guaranteedHeldItem);
    writeWord(rom, offset + Gen3Constants.bsRareHeldItemOffset, pk.guaranteedHeldItem);
  } else {
    writeWord(rom, offset + Gen3Constants.bsCommonHeldItemOffset, pk.commonHeldItem);
    writeWord(rom, offset + Gen3Constants.bsRareHeldItemOffset, pk.rareHeldItem);
  }

  rom[offset + Gen3Constants.bsGenderRatioOffset] = pk.genderRatio;
}

// ---- Move data loading ----

/**
 * Loads move data from ROM bytes.
 * @param rom The ROM data
 * @param moveDataOffset The offset to the move data table
 * @param moveIndex The index of the move (1-based)
 * @returns A partially populated Move (name not set here)
 */
export function loadMoveData(
  rom: Uint8Array,
  moveDataOffset: number,
  moveIndex: number
): Move {
  const move = new Move();
  move.number = moveIndex;
  move.internalId = moveIndex;

  const offs = moveDataOffset + moveIndex * 0x0c;

  move.effectIndex = rom[offs] & 0xff;
  move.power = rom[offs + 1] & 0xff;
  move.hitratio = rom[offs + 3] & 0xff;
  move.pp = rom[offs + 4] & 0xff;
  move.target = rom[offs + 6] & 0xff;

  const typeIndex = rom[offs + 2] & 0xff;
  const typeStr = Gen3Constants.typeTable[typeIndex];
  move.type = typeStr as any;

  move.category = GBConstants.physicalTypes.has(typeStr!)
    ? MoveCategory.PHYSICAL
    : MoveCategory.SPECIAL;
  if (move.power === 0 && !GlobalConstants.noPowerNonStatusMoves.includes(moveIndex)) {
    move.category = MoveCategory.STATUS;
  }

  // Priority is signed
  const rawPriority = rom[offs + 7];
  move.priority = rawPriority > 127 ? rawPriority - 256 : rawPriority;

  const flags = rom[offs + 8] & 0xff;
  move.makesContact = (flags & 1) !== 0;
  move.isSoundMove = Gen3Constants.soundMoves.includes(move.number);

  if (GlobalConstants.normalMultihitMoves.includes(moveIndex)) {
    move.hitCount = 3;
  } else if (GlobalConstants.doubleHitMoves.includes(moveIndex)) {
    move.hitCount = 2;
  } else if (moveIndex === Moves.tripleKick) {
    move.hitCount = 2.71; // assumes the first hit lands
  }

  const secondaryEffectChance = rom[offs + 5] & 0xff;
  loadStatChangesFromEffect(move, secondaryEffectChance);
  loadStatusFromEffect(move, secondaryEffectChance);
  loadMiscMoveInfoFromEffect(move, secondaryEffectChance);

  return move;
}

/**
 * Saves move data back to ROM bytes.
 */
export function saveMoveData(
  rom: Uint8Array,
  moveDataOffset: number,
  move: Move
): void {
  const offs = moveDataOffset + move.number * 0x0c;
  rom[offs] = move.effectIndex;
  rom[offs + 1] = move.power;
  rom[offs + 2] = Gen3Constants.typeToByte(move.type as any);

  let hitratio = Math.round(move.hitratio);
  if (hitratio < 0) hitratio = 0;
  if (hitratio > 100) hitratio = 100;
  rom[offs + 3] = hitratio;
  rom[offs + 4] = move.pp;
}

// ---- Stat change loading ----

function loadStatChangesFromEffect(move: Move, secondaryEffectChance: number): void {
  switch (move.effectIndex) {
    case Gen3Constants.noDamageAtkPlusOneEffect:
    case Gen3Constants.noDamageDefPlusOneEffect:
    case Gen3Constants.noDamageSpAtkPlusOneEffect:
    case Gen3Constants.noDamageEvasionPlusOneEffect:
    case Gen3Constants.noDamageAtkMinusOneEffect:
    case Gen3Constants.noDamageDefMinusOneEffect:
    case Gen3Constants.noDamageSpeMinusOneEffect:
    case Gen3Constants.noDamageAccuracyMinusOneEffect:
    case Gen3Constants.noDamageEvasionMinusOneEffect:
    case Gen3Constants.noDamageAtkPlusTwoEffect:
    case Gen3Constants.noDamageDefPlusTwoEffect:
    case Gen3Constants.noDamageSpePlusTwoEffect:
    case Gen3Constants.noDamageSpAtkPlusTwoEffect:
    case Gen3Constants.noDamageSpDefPlusTwoEffect:
    case Gen3Constants.noDamageAtkMinusTwoEffect:
    case Gen3Constants.noDamageDefMinusTwoEffect:
    case Gen3Constants.noDamageSpeMinusTwoEffect:
    case Gen3Constants.noDamageSpDefMinusTwoEffect:
    case Gen3Constants.minimizeEffect:
    case Gen3Constants.swaggerEffect:
    case Gen3Constants.defenseCurlEffect:
    case Gen3Constants.flatterEffect:
    case Gen3Constants.chargeEffect:
    case Gen3Constants.noDamageAtkAndDefMinusOneEffect:
    case Gen3Constants.noDamageDefAndSpDefPlusOneEffect:
    case Gen3Constants.noDamageAtkAndDefPlusOneEffect:
    case Gen3Constants.noDamageSpAtkAndSpDefPlusOneEffect:
    case Gen3Constants.noDamageAtkAndSpePlusOneEffect:
      if (move.target === 16) {
        move.statChangeMoveType = StatChangeMoveType.NO_DAMAGE_USER;
      } else {
        move.statChangeMoveType = StatChangeMoveType.NO_DAMAGE_TARGET;
      }
      break;

    case Gen3Constants.damageAtkMinusOneEffect:
    case Gen3Constants.damageDefMinusOneEffect:
    case Gen3Constants.damageSpeMinusOneEffect:
    case Gen3Constants.damageSpAtkMinusOneEffect:
    case Gen3Constants.damageSpDefMinusOneEffect:
    case Gen3Constants.damageAccuracyMinusOneEffect:
      move.statChangeMoveType = StatChangeMoveType.DAMAGE_TARGET;
      break;

    case Gen3Constants.damageUserDefPlusOneEffect:
    case Gen3Constants.damageUserAtkPlusOneEffect:
    case Gen3Constants.damageUserAllPlusOneEffect:
    case Gen3Constants.damageUserAtkAndDefMinusOneEffect:
    case Gen3Constants.damageUserSpAtkMinusTwoEffect:
      move.statChangeMoveType = StatChangeMoveType.DAMAGE_USER;
      break;

    default:
      return;
  }

  switch (move.effectIndex) {
    case Gen3Constants.noDamageAtkPlusOneEffect:
    case Gen3Constants.damageUserAtkPlusOneEffect:
      move.statChanges[0].type = StatChangeType.ATTACK;
      move.statChanges[0].stages = 1;
      break;
    case Gen3Constants.noDamageDefPlusOneEffect:
    case Gen3Constants.damageUserDefPlusOneEffect:
    case Gen3Constants.defenseCurlEffect:
      move.statChanges[0].type = StatChangeType.DEFENSE;
      move.statChanges[0].stages = 1;
      break;
    case Gen3Constants.noDamageSpAtkPlusOneEffect:
    case Gen3Constants.flatterEffect:
      move.statChanges[0].type = StatChangeType.SPECIAL_ATTACK;
      move.statChanges[0].stages = 1;
      break;
    case Gen3Constants.noDamageEvasionPlusOneEffect:
    case Gen3Constants.minimizeEffect:
      move.statChanges[0].type = StatChangeType.EVASION;
      move.statChanges[0].stages = 1;
      break;
    case Gen3Constants.noDamageAtkMinusOneEffect:
    case Gen3Constants.damageAtkMinusOneEffect:
      move.statChanges[0].type = StatChangeType.ATTACK;
      move.statChanges[0].stages = -1;
      break;
    case Gen3Constants.noDamageDefMinusOneEffect:
    case Gen3Constants.damageDefMinusOneEffect:
      move.statChanges[0].type = StatChangeType.DEFENSE;
      move.statChanges[0].stages = -1;
      break;
    case Gen3Constants.noDamageSpeMinusOneEffect:
    case Gen3Constants.damageSpeMinusOneEffect:
      move.statChanges[0].type = StatChangeType.SPEED;
      move.statChanges[0].stages = -1;
      break;
    case Gen3Constants.noDamageAccuracyMinusOneEffect:
    case Gen3Constants.damageAccuracyMinusOneEffect:
      move.statChanges[0].type = StatChangeType.ACCURACY;
      move.statChanges[0].stages = -1;
      break;
    case Gen3Constants.noDamageEvasionMinusOneEffect:
      move.statChanges[0].type = StatChangeType.EVASION;
      move.statChanges[0].stages = -1;
      break;
    case Gen3Constants.noDamageAtkPlusTwoEffect:
    case Gen3Constants.swaggerEffect:
      move.statChanges[0].type = StatChangeType.ATTACK;
      move.statChanges[0].stages = 2;
      break;
    case Gen3Constants.noDamageDefPlusTwoEffect:
      move.statChanges[0].type = StatChangeType.DEFENSE;
      move.statChanges[0].stages = 2;
      break;
    case Gen3Constants.noDamageSpePlusTwoEffect:
      move.statChanges[0].type = StatChangeType.SPEED;
      move.statChanges[0].stages = 2;
      break;
    case Gen3Constants.noDamageSpAtkPlusTwoEffect:
      move.statChanges[0].type = StatChangeType.SPECIAL_ATTACK;
      move.statChanges[0].stages = 2;
      break;
    case Gen3Constants.noDamageSpDefPlusTwoEffect:
      move.statChanges[0].type = StatChangeType.SPECIAL_DEFENSE;
      move.statChanges[0].stages = 2;
      break;
    case Gen3Constants.noDamageAtkMinusTwoEffect:
      move.statChanges[0].type = StatChangeType.ATTACK;
      move.statChanges[0].stages = -2;
      break;
    case Gen3Constants.noDamageDefMinusTwoEffect:
      move.statChanges[0].type = StatChangeType.DEFENSE;
      move.statChanges[0].stages = -2;
      break;
    case Gen3Constants.noDamageSpeMinusTwoEffect:
      move.statChanges[0].type = StatChangeType.SPEED;
      move.statChanges[0].stages = -2;
      break;
    case Gen3Constants.noDamageSpDefMinusTwoEffect:
      move.statChanges[0].type = StatChangeType.SPECIAL_DEFENSE;
      move.statChanges[0].stages = -2;
      break;
    case Gen3Constants.damageSpAtkMinusOneEffect:
      move.statChanges[0].type = StatChangeType.SPECIAL_ATTACK;
      move.statChanges[0].stages = -1;
      break;
    case Gen3Constants.damageSpDefMinusOneEffect:
      move.statChanges[0].type = StatChangeType.SPECIAL_DEFENSE;
      move.statChanges[0].stages = -1;
      break;
    case Gen3Constants.damageUserAllPlusOneEffect:
      move.statChanges[0].type = StatChangeType.ALL;
      move.statChanges[0].stages = 1;
      break;
    case Gen3Constants.chargeEffect:
      move.statChanges[0].type = StatChangeType.SPECIAL_DEFENSE;
      move.statChanges[0].stages = 1;
      break;
    case Gen3Constants.damageUserAtkAndDefMinusOneEffect:
    case Gen3Constants.noDamageAtkAndDefMinusOneEffect:
      move.statChanges[0].type = StatChangeType.ATTACK;
      move.statChanges[0].stages = -1;
      move.statChanges[1].type = StatChangeType.DEFENSE;
      move.statChanges[1].stages = -1;
      break;
    case Gen3Constants.damageUserSpAtkMinusTwoEffect:
      move.statChanges[0].type = StatChangeType.SPECIAL_ATTACK;
      move.statChanges[0].stages = -2;
      break;
    case Gen3Constants.noDamageDefAndSpDefPlusOneEffect:
      move.statChanges[0].type = StatChangeType.DEFENSE;
      move.statChanges[0].stages = 1;
      move.statChanges[1].type = StatChangeType.SPECIAL_DEFENSE;
      move.statChanges[1].stages = 1;
      break;
    case Gen3Constants.noDamageAtkAndDefPlusOneEffect:
      move.statChanges[0].type = StatChangeType.ATTACK;
      move.statChanges[0].stages = 1;
      move.statChanges[1].type = StatChangeType.DEFENSE;
      move.statChanges[1].stages = 1;
      break;
    case Gen3Constants.noDamageSpAtkAndSpDefPlusOneEffect:
      move.statChanges[0].type = StatChangeType.SPECIAL_ATTACK;
      move.statChanges[0].stages = 1;
      move.statChanges[1].type = StatChangeType.SPECIAL_DEFENSE;
      move.statChanges[1].stages = 1;
      break;
    case Gen3Constants.noDamageAtkAndSpePlusOneEffect:
      move.statChanges[0].type = StatChangeType.ATTACK;
      move.statChanges[0].stages = 1;
      move.statChanges[1].type = StatChangeType.SPEED;
      move.statChanges[1].stages = 1;
      break;
  }

  if (
    move.statChangeMoveType === StatChangeMoveType.DAMAGE_TARGET ||
    move.statChangeMoveType === StatChangeMoveType.DAMAGE_USER
  ) {
    for (let i = 0; i < move.statChanges.length; i++) {
      if (move.statChanges[i].type !== StatChangeType.NONE) {
        move.statChanges[i].percentChance = secondaryEffectChance;
        if (move.statChanges[i].percentChance === 0) {
          move.statChanges[i].percentChance = 100;
        }
      }
    }
  }
}

function loadStatusFromEffect(move: Move, secondaryEffectChance: number): void {
  if (move.number === Moves.bounce) {
    // GF hardcoded this
    move.statusMoveType = StatusMoveType.DAMAGE;
    move.statusType = StatusType.PARALYZE;
    move.statusPercentChance = secondaryEffectChance;
    return;
  }

  switch (move.effectIndex) {
    case Gen3Constants.noDamageSleepEffect:
    case Gen3Constants.toxicEffect:
    case Gen3Constants.noDamageConfusionEffect:
    case Gen3Constants.noDamagePoisonEffect:
    case Gen3Constants.noDamageParalyzeEffect:
    case Gen3Constants.noDamageBurnEffect:
    case Gen3Constants.swaggerEffect:
    case Gen3Constants.flatterEffect:
    case Gen3Constants.teeterDanceEffect:
      move.statusMoveType = StatusMoveType.NO_DAMAGE;
      break;

    case Gen3Constants.damagePoisonEffect:
    case Gen3Constants.damageBurnEffect:
    case Gen3Constants.damageFreezeEffect:
    case Gen3Constants.damageParalyzeEffect:
    case Gen3Constants.damageConfusionEffect:
    case Gen3Constants.twineedleEffect:
    case Gen3Constants.damageBurnAndThawUserEffect:
    case Gen3Constants.thunderEffect:
    case Gen3Constants.blazeKickEffect:
    case Gen3Constants.poisonFangEffect:
    case Gen3Constants.poisonTailEffect:
      move.statusMoveType = StatusMoveType.DAMAGE;
      break;

    default:
      return;
  }

  switch (move.effectIndex) {
    case Gen3Constants.noDamageSleepEffect:
      move.statusType = StatusType.SLEEP;
      break;
    case Gen3Constants.damagePoisonEffect:
    case Gen3Constants.noDamagePoisonEffect:
    case Gen3Constants.twineedleEffect:
    case Gen3Constants.poisonTailEffect:
      move.statusType = StatusType.POISON;
      break;
    case Gen3Constants.damageBurnEffect:
    case Gen3Constants.damageBurnAndThawUserEffect:
    case Gen3Constants.noDamageBurnEffect:
    case Gen3Constants.blazeKickEffect:
      move.statusType = StatusType.BURN;
      break;
    case Gen3Constants.damageFreezeEffect:
      move.statusType = StatusType.FREEZE;
      break;
    case Gen3Constants.damageParalyzeEffect:
    case Gen3Constants.noDamageParalyzeEffect:
    case Gen3Constants.thunderEffect:
      move.statusType = StatusType.PARALYZE;
      break;
    case Gen3Constants.toxicEffect:
    case Gen3Constants.poisonFangEffect:
      move.statusType = StatusType.TOXIC_POISON;
      break;
    case Gen3Constants.noDamageConfusionEffect:
    case Gen3Constants.damageConfusionEffect:
    case Gen3Constants.swaggerEffect:
    case Gen3Constants.flatterEffect:
    case Gen3Constants.teeterDanceEffect:
      move.statusType = StatusType.CONFUSION;
      break;
  }

  if (move.statusMoveType === StatusMoveType.DAMAGE) {
    move.statusPercentChance = secondaryEffectChance;
    if (move.statusPercentChance === 0) {
      move.statusPercentChance = 100;
    }
  }
}

function loadMiscMoveInfoFromEffect(move: Move, secondaryEffectChance: number): void {
  switch (move.effectIndex) {
    case Gen3Constants.increasedCritEffect:
    case Gen3Constants.blazeKickEffect:
    case Gen3Constants.poisonTailEffect:
      move.criticalChance = CriticalChance.INCREASED;
      break;

    case Gen3Constants.futureSightAndDoomDesireEffect:
    case Gen3Constants.spitUpEffect:
      move.criticalChance = CriticalChance.NONE;
      // Note: fall-through in original Java (missing break).
      // The Java switch falls through to flinch cases below.
      // Replicating that behavior:
      move.flinchPercentChance = secondaryEffectChance;
      break;

    case Gen3Constants.flinchEffect:
    case Gen3Constants.snoreEffect:
    case Gen3Constants.twisterEffect:
    case Gen3Constants.flinchWithMinimizeBonusEffect:
    case Gen3Constants.fakeOutEffect:
      move.flinchPercentChance = secondaryEffectChance;
      break;

    case Gen3Constants.damageAbsorbEffect:
    case Gen3Constants.dreamEaterEffect:
      move.absorbPercent = 50;
      break;

    case Gen3Constants.damageRecoil25PercentEffect:
      move.recoilPercent = 25;
      break;

    case Gen3Constants.damageRecoil33PercentEffect:
      move.recoilPercent = 33;
      break;

    case Gen3Constants.bindingEffect:
    case Gen3Constants.trappingEffect:
      move.isTrapMove = true;
      break;

    case Gen3Constants.razorWindEffect:
    case Gen3Constants.skullBashEffect:
    case Gen3Constants.solarbeamEffect:
    case Gen3Constants.semiInvulnerableEffect:
      move.isChargeMove = true;
      break;

    case Gen3Constants.rechargeEffect:
      move.isRechargeMove = true;
      break;

    case Gen3Constants.skyAttackEffect:
      move.criticalChance = CriticalChance.INCREASED;
      move.flinchPercentChance = secondaryEffectChance;
      move.isChargeMove = true;
      break;
  }
}

// ---- Text handling ----

/**
 * Read a GBA string using a text table, up to maxLength bytes or until the terminator 0xFF.
 */
export function readString(
  rom: Uint8Array,
  offset: number,
  maxLength: number,
  tb: (string | null)[]
): string {
  let result = "";
  for (let c = 0; c < maxLength; c++) {
    const currChar = rom[offset + c] & 0xff;
    if (tb[currChar] != null) {
      result += tb[currChar];
    } else {
      if (currChar === Gen3Constants.textTerminator) {
        break;
      } else if (currChar === Gen3Constants.textVariable) {
        const nextChar = rom[offset + c + 1] & 0xff;
        result += "\\v" + nextChar.toString(16).padStart(2, "0").toUpperCase();
        c++;
      } else {
        result += "\\x" + currChar.toString(16).padStart(2, "0").toUpperCase();
      }
    }
  }
  return result;
}

/**
 * Translate a string into GBA encoded bytes using a reverse text table.
 */
export function translateString(
  text: string,
  d: Map<string, number>
): Uint8Array {
  const data: number[] = [];
  let pos = 0;
  while (pos < text.length) {
    if (
      pos + 1 < text.length &&
      text[pos] === "\\" &&
      text[pos + 1] === "x"
    ) {
      data.push(parseInt(text.substring(pos + 2, pos + 4), 16));
      pos += 4;
    } else if (
      pos + 1 < text.length &&
      text[pos] === "\\" &&
      text[pos + 1] === "v"
    ) {
      data.push(Gen3Constants.textVariable);
      data.push(parseInt(text.substring(pos + 2, pos + 4), 16));
      pos += 4;
    } else {
      let i = Math.max(0, 4 - (text.length - pos));
      while (i < 4 && !d.has(text.substring(pos, pos + 4 - i))) {
        i++;
      }
      if (i === 4) {
        pos += 1;
      } else {
        data.push(d.get(text.substring(pos, pos + 4 - i))!);
        pos += 4 - i;
      }
    }
  }
  return new Uint8Array(data);
}

/**
 * Read a fixed-length string.
 */
export function readFixedLengthString(
  rom: Uint8Array,
  offset: number,
  length: number,
  tb: (string | null)[]
): string {
  return readString(rom, offset, length, tb);
}

/**
 * Read a variable-length string (up to end of ROM or 0xFF terminator).
 */
export function readVariableLengthString(
  rom: Uint8Array,
  offset: number,
  tb: (string | null)[]
): string {
  return readString(rom, offset, rom.length - offset, tb);
}

/**
 * Write a fixed-length string into ROM.
 */
export function writeFixedLengthString(
  rom: Uint8Array,
  str: string,
  offset: number,
  length: number,
  d: Map<string, number>
): void {
  const translated = translateString(str, d);
  const len = Math.min(translated.length, length);
  rom.set(translated.subarray(0, len), offset);
  let pos = len;
  if (pos < length) {
    rom[offset + pos] = Gen3Constants.textTerminator;
    pos++;
  }
  while (pos < length) {
    rom[offset + pos] = 0;
    pos++;
  }
}

/**
 * Write a variable-length string into ROM at the given offset, terminated by 0xFF.
 */
export function writeVariableLengthString(
  rom: Uint8Array,
  str: string,
  offset: number,
  d: Map<string, number>
): void {
  const translated = translateString(str, d);
  rom.set(translated, offset);
  rom[offset + translated.length] = Gen3Constants.textTerminator;
}

/**
 * Compute the length of a GBA string at the given offset (excluding the 0xFF terminator).
 */
export function lengthOfStringAt(rom: Uint8Array, offset: number): number {
  let len = 0;
  while ((rom[offset + len] & 0xff) !== 0xff) {
    len++;
  }
  return len;
}

/**
 * Write a hex string into the ROM at the given offset.
 */
export function writeHexString(
  rom: Uint8Array,
  hexString: string,
  offset: number
): void {
  if (hexString.length % 2 !== 0) return;
  for (let i = 0; i < hexString.length / 2; i++) {
    rom[offset + i] = parseInt(hexString.substring(i * 2, i * 2 + 2), 16);
  }
}

// ---- Pointer prefix/suffix search ----

/**
 * Find a pointer that is sandwiched between a known prefix and suffix.
 * Returns the offset of the pointer, or -1 if not found.
 */
export function findPointerPrefixAndSuffix(
  rom: Uint8Array,
  prefix: string,
  suffix: string
): number {
  if (prefix.length % 2 !== 0 || suffix.length % 2 !== 0) {
    return -1;
  }
  const searchPref = hexStringToBytes(prefix);
  const searchSuff = hexStringToBytes(suffix);

  if (searchPref.length >= searchSuff.length) {
    // Prefix first
    const offsets = RomFunctions.search(rom, searchPref);
    if (offsets.length === 0) return -1;
    for (const prefOffset of offsets) {
      if (prefOffset + 4 + searchSuff.length > rom.length) continue;
      const ptrOffset = prefOffset + searchPref.length;
      const pointerValue = readPointer(rom, ptrOffset);
      if (pointerValue < 0 || pointerValue >= rom.length) continue;
      let suffixMatch = true;
      for (let i = 0; i < searchSuff.length; i++) {
        if (rom[ptrOffset + 4 + i] !== searchSuff[i]) {
          suffixMatch = false;
          break;
        }
      }
      if (suffixMatch) return ptrOffset;
    }
    return -1;
  } else {
    // Suffix first
    const offsets = RomFunctions.search(rom, searchSuff);
    if (offsets.length === 0) return -1;
    for (const suffOffset of offsets) {
      if (suffOffset - 4 - searchPref.length < 0) continue;
      const ptrOffset = suffOffset - 4;
      const pointerValue = readPointer(rom, ptrOffset);
      if (pointerValue < 0 || pointerValue >= rom.length) continue;
      let prefixMatch = true;
      for (let i = 0; i < searchPref.length; i++) {
        if (rom[ptrOffset - searchPref.length + i] !== searchPref[i]) {
          prefixMatch = false;
          break;
        }
      }
      if (prefixMatch) return ptrOffset;
    }
    return -1;
  }
}

// ---- RomEntry INI parsing ----

/**
 * Parse a gen3_offsets.ini string into a list of RomEntry objects.
 */
export function parseRomEntries(iniContent: string): RomEntry[] {
  const roms: RomEntry[] = [];
  let current: RomEntry | null = null;

  const lines = iniContent.split(/\r?\n/);
  for (let line of lines) {
    let q = line.trim();
    // Strip comments
    const commentIdx = q.indexOf("//");
    if (commentIdx !== -1) {
      q = q.substring(0, commentIdx).trim();
    }
    if (q.length === 0) continue;

    if (q.startsWith("[") && q.endsWith("]")) {
      current = new RomEntry();
      current.name = q.substring(1, q.length - 1);
      roms.push(current);
    } else if (current) {
      const eqIdx = q.indexOf("=");
      if (eqIdx === -1) continue;
      const key = q.substring(0, eqIdx);
      let val = q.substring(eqIdx + 1).trim();

      if (key === "StaticPokemon{}") {
        current.staticPokemon.push(parseStaticPokemon(val));
      } else if (key === "RoamingPokemon{}") {
        current.roamingPokemon.push(parseStaticPokemon(val));
      } else if (key === "TMText[]") {
        if (val.startsWith("[") && val.endsWith("]")) {
          const parts = val.substring(1, val.length - 1).split(",", 6);
          const tte: TMOrMTTextEntry = {
            number: parseRIInt(parts[0]),
            mapBank: parseRIInt(parts[1]),
            mapNumber: parseRIInt(parts[2]),
            personNum: parseRIInt(parts[3]),
            offsetInScript: parseRIInt(parts[4]),
            template: parts[5],
            actualOffset: 0,
            isMoveTutor: false,
          };
          current.tmmtTexts.push(tte);
        }
      } else if (key === "MoveTutorText[]") {
        if (val.startsWith("[") && val.endsWith("]")) {
          const parts = val.substring(1, val.length - 1).split(",", 6);
          const tte: TMOrMTTextEntry = {
            number: parseRIInt(parts[0]),
            mapBank: parseRIInt(parts[1]),
            mapNumber: parseRIInt(parts[2]),
            personNum: parseRIInt(parts[3]),
            offsetInScript: parseRIInt(parts[4]),
            template: parts[5],
            actualOffset: 0,
            isMoveTutor: true,
          };
          current.tmmtTexts.push(tte);
        }
      } else if (key === "Game") {
        current.romCode = val;
      } else if (key === "Version") {
        current.version = parseRIInt(val);
      } else if (key === "Type") {
        if (val.toLowerCase() === "ruby") {
          current.romType = Gen3Constants.RomType_Ruby;
        } else if (val.toLowerCase() === "sapp") {
          current.romType = Gen3Constants.RomType_Sapp;
        } else if (val.toLowerCase() === "em") {
          current.romType = Gen3Constants.RomType_Em;
        } else if (val.toLowerCase() === "frlg") {
          current.romType = Gen3Constants.RomType_FRLG;
        }
      } else if (key === "TableFile") {
        current.tableFile = val;
      } else if (key === "CopyStaticPokemon") {
        current.copyStaticPokemon = parseRIInt(val) > 0;
      } else if (key === "CRC32") {
        current.expectedCRC32 = parseRILong("0x" + val);
      } else if (key.endsWith("Tweak")) {
        current.codeTweaks.set(key, val);
      } else if (key === "CopyFrom") {
        for (const otherEntry of roms) {
          if (val.toLowerCase() === otherEntry.name.toLowerCase()) {
            current.arrayEntries = new Map([
              ...current.arrayEntries,
              ...otherEntry.arrayEntries,
            ]);
            current.entries = new Map([...current.entries, ...otherEntry.entries]);
            current.strings = new Map([...current.strings, ...otherEntry.strings]);
            const cTT = current.getValue("CopyTMText") === 1;
            if (current.copyStaticPokemon) {
              current.staticPokemon.push(...otherEntry.staticPokemon);
              current.roamingPokemon.push(...otherEntry.roamingPokemon);
              current.entries.set("StaticPokemonSupport", 1);
            } else {
              current.entries.set("StaticPokemonSupport", 0);
            }
            if (cTT) {
              current.tmmtTexts.push(...otherEntry.tmmtTexts);
            }
            current.tableFile = otherEntry.tableFile;
          }
        }
      } else if (key.endsWith("Locator") || key.endsWith("Prefix")) {
        current.strings.set(key, val);
      } else {
        if (val.startsWith("[") && val.endsWith("]")) {
          const inner = val.substring(1, val.length - 1);
          const parts = inner.split(",");
          if (parts.length === 1 && parts[0].trim().length === 0) {
            current.arrayEntries.set(key, []);
          } else {
            current.arrayEntries.set(key, parts.map((s) => parseRIInt(s)));
          }
        } else {
          current.entries.set(key, parseRIInt(val));
        }
      }
    }
  }
  return roms;
}

// ---- Factory ----

export class Gen3RomHandlerFactory extends RomHandlerFactory {
  private romEntries: RomEntry[];

  /**
   * Static helper for backward compatibility / unit tests.
   */
  static isLoadable(
    data: Uint8Array,
    fileLength: number,
    romEntries: RomEntry[]
  ): boolean {
    if (fileLength > 32 * 1024 * 1024) return false;
    if (data.length === 0) return false;
    return detectRomInner(data, fileLength, romEntries);
  }

  constructor(romEntries?: RomEntry[]) {
    super();
    if (romEntries) {
      this.romEntries = romEntries;
    } else {
      try {
        const iniPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/com/dabomstew/pkrandom/config/gen3_offsets.ini');
        if (fs.existsSync(iniPath)) {
          const iniText = fs.readFileSync(iniPath, 'utf-8');
          this.romEntries = parseRomEntries(iniText);
        } else {
          this.romEntries = [];
        }
      } catch {
        this.romEntries = [];
      }
    }
  }

  isLoadable(filename: string): boolean {
    try {
      const stats = fs.statSync(filename);
      if (stats.size > 32 * 1024 * 1024) {
        return false;
      }
      const fd = fs.openSync(filename, 'r');
      const data = Buffer.alloc(stats.size);
      fs.readSync(fd, data, 0, stats.size, 0);
      fs.closeSync(fd);
      return detectRomInner(new Uint8Array(data), stats.size, this.romEntries);
    } catch {
      return false;
    }
  }

  createWithLog(random: RandomInstance, log: LogStream | null): RomHandler {
    return new Gen3RomHandler(random, log, this.romEntries) as unknown as RomHandler;
  }
}

// ---- Main handler class ----

export class Gen3RomHandler extends AbstractGBRomHandler {
  private pokes: (Pokemon | null)[] = [];
  private pokesInternal: (Pokemon | null)[] = [];
  private pokemonList: (Pokemon | null)[] = [];
  private numRealPokemon: number = 0;
  private moves: (Move | null)[] = [];
  private romEntryData: RomEntry = new RomEntry();
  private havePatchedObedience: boolean = false;
  private tb: (string | null)[] = new Array(256).fill(null);
  private d: Map<string, number> = new Map();
  private abilityNamesArr: string[] = [];
  private itemNamesArr: string[] = [];
  private mapLoadingDone: boolean = false;
  private mapNames: string[][] = [];
  private isRomHackFlag: boolean = false;
  private internalToPokedex: number[] = [];
  private pokedexToInternal: number[] = [];
  private pokedexCount: number = 0;
  private pokeNames: string[] = [];
  private jamboMovesetHack: boolean = false;
  private romEntries: RomEntry[];
  private allowedItemsList: ItemList = new ItemList(0);
  private nonBadItemsList: ItemList = new ItemList(0);
  private itemOffs: number[] = [];
  private effectivenessUpdated: boolean = false;

  constructor(random: RandomInstance, logStream: LogStream | null, romEntries?: RomEntry[]) {
    super(random, logStream);
    if (romEntries) {
      this.romEntries = romEntries;
    } else {
      try {
        const iniPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/com/dabomstew/pkrandom/config/gen3_offsets.ini');
        if (fs.existsSync(iniPath)) {
          const iniText = fs.readFileSync(iniPath, 'utf-8');
          this.romEntries = parseRomEntries(iniText);
        } else {
          this.romEntries = [];
        }
      } catch {
        this.romEntries = [];
      }
    }
  }

  // ---- AbstractGBRomHandler abstract methods ----

  detectRom(rom: Uint8Array): boolean {
    return detectRomInner(rom, rom.length, this.romEntries);
  }

  loadedRom(): void {
    for (const re of this.romEntries) {
      if (
        romCode(this.rom, re.romCode) &&
        (this.rom[0xbc] & 0xff) === re.version
      ) {
        this.romEntryData = new RomEntry(re);
        break;
      }
    }

    this.tb = new Array(256).fill(null);
    this.d = new Map();
    this.isRomHackFlag = false;
    this.jamboMovesetHack = false;

    // Load text table
    this.loadTextTable();

    // Pokemon count stuff
    const pokedexOrderPrefixes = findMultiple(
      this.rom,
      Gen3Constants.pokedexOrderPointerPrefix
    );
    if (pokedexOrderPrefixes.length > 1) {
      this.romEntryData.entries.set(
        "PokedexOrder",
        readPointer(this.rom, pokedexOrderPrefixes[1] + 16)
      );
    }

    // Pokemon names offset
    if (
      this.romEntryData.romType === Gen3Constants.RomType_Ruby ||
      this.romEntryData.romType === Gen3Constants.RomType_Sapp
    ) {
      const baseNomOffset = find(
        this.rom,
        Gen3Constants.rsPokemonNamesPointerSuffix
      );
      if (baseNomOffset >= 0) {
        this.romEntryData.entries.set(
          "PokemonNames",
          readPointer(this.rom, baseNomOffset - 4)
        );
      }
      const frontSpritesPtr = findPointerPrefixAndSuffix(
        this.rom,
        Gen3Constants.rsFrontSpritesPointerPrefix,
        Gen3Constants.rsFrontSpritesPointerSuffix
      );
      if (frontSpritesPtr >= 0) {
        this.romEntryData.entries.set(
          "FrontSprites",
          readPointer(this.rom, frontSpritesPtr)
        );
      }
      const palettesPtr = findPointerPrefixAndSuffix(
        this.rom,
        Gen3Constants.rsPokemonPalettesPointerPrefix,
        Gen3Constants.rsPokemonPalettesPointerSuffix
      );
      if (palettesPtr >= 0) {
        this.romEntryData.entries.set(
          "PokemonPalettes",
          readPointer(this.rom, palettesPtr)
        );
      }
    } else {
      this.romEntryData.entries.set(
        "PokemonNames",
        readPointer(this.rom, Gen3Constants.efrlgPokemonNamesPointer)
      );
      this.romEntryData.entries.set(
        "MoveNames",
        readPointer(this.rom, Gen3Constants.efrlgMoveNamesPointer)
      );
      this.romEntryData.entries.set(
        "AbilityNames",
        readPointer(this.rom, Gen3Constants.efrlgAbilityNamesPointer)
      );
      this.romEntryData.entries.set(
        "ItemData",
        readPointer(this.rom, Gen3Constants.efrlgItemDataPointer)
      );
      this.romEntryData.entries.set(
        "MoveData",
        readPointer(this.rom, Gen3Constants.efrlgMoveDataPointer)
      );
      this.romEntryData.entries.set(
        "PokemonStats",
        readPointer(this.rom, Gen3Constants.efrlgPokemonStatsPointer)
      );
      this.romEntryData.entries.set(
        "FrontSprites",
        readPointer(this.rom, Gen3Constants.efrlgFrontSpritesPointer)
      );
      this.romEntryData.entries.set(
        "PokemonPalettes",
        readPointer(this.rom, Gen3Constants.efrlgPokemonPalettesPointer)
      );
      this.romEntryData.entries.set(
        "MoveTutorCompatibility",
        this.romEntryData.getValue("MoveTutorData") +
          this.romEntryData.getValue("MoveTutorMoves") * 2
      );
    }

    this.loadPokemonNames();
    this.loadPokedex();
    this.loadPokemonStats();
    this.constructPokemonList();
    this.populateEvolutions();
    this.loadMoveData();
    this.loadAbilityNames();
    this.loadItemNames();

    // Wild Pokemon offset
    const baseWPOffsets = findMultiple(
      this.rom,
      Gen3Constants.wildPokemonPointerPrefix
    );
    if (baseWPOffsets.length > 0) {
      this.romEntryData.entries.set(
        "WildPokemon",
        readPointer(this.rom, baseWPOffsets[0] + 12)
      );
    }

    // Map banks
    const baseMapsOffsets = findMultiple(
      this.rom,
      Gen3Constants.mapBanksPointerPrefix
    );
    if (baseMapsOffsets.length > 0) {
      this.romEntryData.entries.set(
        "MapHeaders",
        readPointer(this.rom, baseMapsOffsets[0] + 12)
      );
    }

    // Map labels
    if (this.romEntryData.romType === Gen3Constants.RomType_FRLG) {
      const baseMLOffset = find(
        this.rom,
        Gen3Constants.frlgMapLabelsPointerPrefix
      );
      if (baseMLOffset >= 0) {
        this.romEntryData.entries.set(
          "MapLabels",
          readPointer(this.rom, baseMLOffset + 12)
        );
      }
    } else {
      const baseMLOffset = find(
        this.rom,
        Gen3Constants.rseMapLabelsPointerPrefix
      );
      if (baseMLOffset >= 0) {
        this.romEntryData.entries.set(
          "MapLabels",
          readPointer(this.rom, baseMLOffset + 12)
        );
      }
    }

    this.determineMapBankSizes();
    this.mapLoadingDone = false;

    // Setup allowed items
    this.allowedItemsList = Gen3Constants.getAllowedItems().copy();
    this.nonBadItemsList = Gen3Constants.getNonBadItems(this.romEntryData.romType).copy();
  }

  savingRom(): void {
    this.savePokemonStats();
    this.saveMoves();
  }

  // ---- Text table loading ----

  private loadTextTable(): void {
    const tableFile = this.romEntryData.tableFile;
    if (!tableFile || tableFile.length === 0) return;
    try {
      const configDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/com/dabomstew/pkrandom/config');
      let filePath = path.join(configDir, tableFile);
      if (!fs.existsSync(filePath) && !tableFile.endsWith('.tbl')) {
        filePath = path.join(configDir, tableFile + '.tbl');
      }
      if (!fs.existsSync(filePath)) return;
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      for (const line of lines) {
        const q = line.trim();
        if (q === '') continue;
        const eqIdx = q.indexOf('=');
        if (eqIdx < 0) continue;
        const hexStr = q.substring(0, eqIdx);
        let value = q.substring(eqIdx + 1);
        if (value.endsWith('\r')) {
          value = value.substring(0, value.length - 1);
        }
        const hexcode = parseInt(hexStr, 16);
        if (isNaN(hexcode) || hexcode < 0 || hexcode > 255) continue;
        this.tb[hexcode] = value;
        this.d.set(value, hexcode);
      }
    } catch {
      // Silently ignore
    }
  }

  // ---- Pokemon names ----

  private loadPokemonNames(): void {
    const offs = this.romEntryData.getValue("PokemonNames");
    const nameLen = this.romEntryData.getValue("PokemonNameLength");
    const numInternalPokes = this.romEntryData.getValue("PokemonCount");
    this.pokeNames = new Array(numInternalPokes + 1).fill("");
    for (let i = 1; i <= numInternalPokes; i++) {
      this.pokeNames[i] = readFixedLengthString(
        this.rom,
        offs + i * nameLen,
        nameLen,
        this.tb
      );
    }
  }

  // ---- Pokedex ----

  private loadPokedex(): void {
    const pdOffset = this.romEntryData.getValue("PokedexOrder");
    const numInternalPokes = this.romEntryData.getValue("PokemonCount");
    let maxPokedex = 0;
    this.internalToPokedex = new Array(numInternalPokes + 1).fill(0);
    this.pokedexToInternal = new Array(numInternalPokes + 1).fill(0);
    for (let i = 1; i <= numInternalPokes; i++) {
      const dexEntry = readWord(this.rom, pdOffset + (i - 1) * 2);
      if (dexEntry !== 0) {
        this.internalToPokedex[i] = dexEntry;
        if (this.pokedexToInternal[dexEntry] === 0) {
          this.pokedexToInternal[dexEntry] = i;
        }
        maxPokedex = Math.max(maxPokedex, dexEntry);
      }
    }
    if (maxPokedex === Gen3Constants.unhackedMaxPokedex) {
      const offs = this.romEntryData.getValue("PokemonStats");
      let usedSlots = 0;
      for (
        let i = 0;
        i < Gen3Constants.unhackedMaxPokedex - Gen3Constants.unhackedRealPokedex;
        i++
      ) {
        const pokeSlot = Gen3Constants.hoennPokesStart + i;
        const pokeOffs = offs + pokeSlot * Gen3Constants.baseStatsEntrySize;
        const lowerName = this.pokeNames[pokeSlot]?.toLowerCase() ?? "";
        if (
          !matches(this.rom, pokeOffs, emptyPokemonSig) &&
          !lowerName.includes("unused") &&
          lowerName !== "?" &&
          lowerName !== "-"
        ) {
          usedSlots++;
          this.pokedexToInternal[Gen3Constants.unhackedRealPokedex + usedSlots] =
            pokeSlot;
          this.internalToPokedex[pokeSlot] =
            Gen3Constants.unhackedRealPokedex + usedSlots;
        } else {
          this.internalToPokedex[pokeSlot] = 0;
        }
      }
      for (
        let i = usedSlots + 1;
        i <=
        Gen3Constants.unhackedMaxPokedex - Gen3Constants.unhackedRealPokedex;
        i++
      ) {
        this.pokedexToInternal[Gen3Constants.unhackedRealPokedex + i] = 0;
      }
      if (usedSlots > 0) {
        this.isRomHackFlag = true;
      }
      this.pokedexCount = Gen3Constants.unhackedRealPokedex + usedSlots;
    } else {
      this.isRomHackFlag = true;
      this.pokedexCount = maxPokedex;
    }
  }

  // ---- Pokemon stats ----

  private loadPokemonStats(): void {
    this.pokes = new Array(this.pokedexCount + 1).fill(null);
    const numInternalPokes = this.romEntryData.getValue("PokemonCount");
    this.pokesInternal = new Array(numInternalPokes + 1).fill(null);
    const offs = this.romEntryData.getValue("PokemonStats");
    for (let i = 1; i <= numInternalPokes; i++) {
      const pk = new Pokemon();
      pk.name = this.pokeNames[i];
      pk.number = this.internalToPokedex[i];
      if (pk.number !== 0) {
        this.pokes[pk.number] = pk;
      }
      this.pokesInternal[i] = pk;
      const pkoffs = offs + i * Gen3Constants.baseStatsEntrySize;
      loadBasicPokeStats(pk, this.rom, pkoffs);
    }
  }

  // ---- Pokemon list ----

  private constructPokemonList(): void {
    if (!this.isRomHackFlag) {
      this.pokemonList = [...this.pokes];
    } else {
      this.pokemonList = [null];
      for (let i = 1; i < this.pokes.length; i++) {
        const pk = this.pokes[i];
        if (pk != null) {
          const lowerName = pk.name.toLowerCase();
          if (!lowerName.includes("unused") && lowerName !== "?") {
            this.pokemonList.push(pk);
          }
        }
      }
    }
    this.numRealPokemon = this.pokemonList.length - 1;
  }

  // ---- Evolutions ----

  private populateEvolutions(): void {
    for (const pkmn of this.pokes) {
      if (pkmn != null) {
        pkmn.evolutionsFrom = [];
        pkmn.evolutionsTo = [];
      }
    }

    const baseOffset = this.getValue("PokemonEvolutions");
    const numInternalPokes = this.getValue("PokemonCount");
    for (let i = 1; i <= this.numRealPokemon; i++) {
      const pk = this.pokemonList[i]!;
      const idx = this.pokedexToInternal[pk.number];
      const evoOffset = baseOffset + idx * 0x28;
      for (let j = 0; j < 5; j++) {
        const method = readWord(this.rom, evoOffset + j * 8);
        const evolvingTo = readWord(this.rom, evoOffset + j * 8 + 4);
        if (method >= 1 && method <= Gen3Constants.evolutionMethodCount
            && evolvingTo >= 1 && evolvingTo <= numInternalPokes) {
          const extraInfo = readWord(this.rom, evoOffset + j * 8 + 2);
          const et = evolutionTypeFromIndex(3, method);
          if (et == null) continue;
          const toPoke = this.pokesInternal[evolvingTo];
          if (toPoke == null) continue;
          const evo = new Evolution(pk, toPoke, true, et, extraInfo);
          if (!pk.evolutionsFrom.some(e => e.equals(evo))) {
            pk.evolutionsFrom.push(evo);
            toPoke.evolutionsTo.push(evo);
          }
        }
      }
      // Split evos shouldn't carry stats unless the evo is Nincada's
      // In that case, we should have Ninjask carry stats
      if (pk.evolutionsFrom.length > 1) {
        for (const e of pk.evolutionsFrom) {
          if (e.type !== EvolutionType.LEVEL_CREATE_EXTRA) {
            e.carryStats = false;
          }
        }
      }
    }
  }

  private writeEvolutions(): void {
    const baseOffset = this.getValue("PokemonEvolutions");
    for (let i = 1; i <= this.numRealPokemon; i++) {
      const pk = this.pokemonList[i]!;
      const idx = this.pokedexToInternal[pk.number];
      let evoOffset = baseOffset + idx * 0x28;
      let evosWritten = 0;
      for (const evo of pk.evolutionsFrom) {
        writeWord(this.rom, evoOffset, evolutionTypeToIndex(evo.type, 3));
        writeWord(this.rom, evoOffset + 2, evo.extraInfo);
        writeWord(this.rom, evoOffset + 4, this.pokedexToInternal[evo.to.number]);
        writeWord(this.rom, evoOffset + 6, 0);
        evoOffset += 8;
        evosWritten++;
        if (evosWritten === 5) {
          break;
        }
      }
      while (evosWritten < 5) {
        writeWord(this.rom, evoOffset, 0);
        writeWord(this.rom, evoOffset + 2, 0);
        writeWord(this.rom, evoOffset + 4, 0);
        writeWord(this.rom, evoOffset + 6, 0);
        evoOffset += 8;
        evosWritten++;
      }
    }
  }

  // ---- Moves ----

  private loadMoveData(): void {
    const moveCount = this.romEntryData.getValue("MoveCount");
    this.moves = new Array(moveCount + 1).fill(null);
    const offs = this.romEntryData.getValue("MoveData");
    const nameoffs = this.romEntryData.getValue("MoveNames");
    const namelen = this.romEntryData.getValue("MoveNameLength");
    for (let i = 1; i <= moveCount; i++) {
      const move = loadMoveData(this.rom, offs, i);
      move.name = readFixedLengthString(
        this.rom,
        nameoffs + i * namelen,
        namelen,
        this.tb
      );
      this.moves[i] = move;

      if (i === Moves.swift) {
        this.perfectAccuracy = move.hitratio;
      }
    }
  }

  private saveMoves(): void {
    const moveCount = this.romEntryData.getValue("MoveCount");
    const offs = this.romEntryData.getValue("MoveData");
    for (let i = 1; i <= moveCount; i++) {
      if (this.moves[i]) {
        saveMoveData(this.rom, offs, this.moves[i]!);
      }
    }
  }

  private savePokemonStats(): void {
    const offs = this.romEntryData.getValue("PokemonNames");
    const nameLen = this.romEntryData.getValue("PokemonNameLength");
    const offs2 = this.romEntryData.getValue("PokemonStats");
    const numInternalPokes = this.romEntryData.getValue("PokemonCount");
    for (let i = 1; i <= numInternalPokes; i++) {
      const pk = this.pokesInternal[i];
      if (pk) {
        const stringOffset = offs + i * nameLen;
        writeFixedLengthString(
          this.rom,
          pk.name,
          stringOffset,
          nameLen,
          this.d
        );
        saveBasicPokeStats(pk, this.rom, offs2 + i * Gen3Constants.baseStatsEntrySize);
      }
    }
    this.writeEvolutions();
  }

  // ---- Ability names ----

  private loadAbilityNames(): void {
    const nameOffset = this.romEntryData.getValue("AbilityNames");
    const nameLen = this.romEntryData.getValue("AbilityNameLength");
    this.abilityNamesArr = new Array(Gen3Constants.highestAbilityIndex + 1).fill("");
    for (let i = 0; i <= Gen3Constants.highestAbilityIndex; i++) {
      this.abilityNamesArr[i] = readFixedLengthString(
        this.rom,
        nameOffset + i * nameLen,
        nameLen,
        this.tb
      );
    }
  }

  // ---- Item names ----

  private loadItemNames(): void {
    const numItems = this.romEntryData.getValue("ItemCount");
    const itemDataOffset = this.romEntryData.getValue("ItemData");
    const itemEntrySize = this.romEntryData.getValue("ItemEntrySize");
    this.itemNamesArr = new Array(numItems + 1).fill("");
    for (let i = 0; i <= numItems; i++) {
      this.itemNamesArr[i] = readVariableLengthString(
        this.rom,
        itemDataOffset + i * itemEntrySize,
        this.tb
      );
    }
  }

  // ---- Helper for RomEntry values ----

  private getValue(key: string): number {
    return this.romEntryData.getValue(key);
  }

  // ===========================================================================
  // Abstract method implementations from AbstractRomHandler
  // ===========================================================================

  // -- Pokemon data --

  getPokemon(): (Pokemon | null)[] { return this.pokemonList; }
  getPokemonInclFormes(): (Pokemon | null)[] { return this.pokemonList; }
  getAltFormes(): Pokemon[] { return []; }
  getMegaEvolutions(): MegaEvolution[] { return []; }
  getAltFormeOfPokemon(pk: Pokemon, _forme: number): Pokemon { return pk; }
  getIrregularFormes(): Pokemon[] { return []; }
  hasFunctionalFormes(): boolean { return false; }
  removeEvosForPokemonPool(): void {
    const pokemonIncluded = this.mainPokemonList;
    for (const pk of this.pokes) {
      if (pk != null) {
        const keepEvos: Evolution[] = [];
        for (const evol of pk.evolutionsFrom) {
          if (pokemonIncluded.includes(evol.from) && pokemonIncluded.includes(evol.to)) {
            keepEvos.push(evol);
          } else {
            const idx = evol.to.evolutionsTo.indexOf(evol);
            if (idx >= 0) evol.to.evolutionsTo.splice(idx, 1);
          }
        }
        pk.evolutionsFrom = keepEvos;
      }
    }
  }

  // -- Starters --

  getStarters(): Pokemon[] {
    const starters: Pokemon[] = [];
    const baseOffset = this.romEntryData.getValue("StarterPokemon");
    if (this.romEntryData.romType === Gen3Constants.RomType_Ruby ||
        this.romEntryData.romType === Gen3Constants.RomType_Sapp ||
        this.romEntryData.romType === Gen3Constants.RomType_Em) {
      const starter1 = this.pokesInternal[readWord(this.rom, baseOffset)]!;
      const starter2 = this.pokesInternal[readWord(this.rom, baseOffset + Gen3Constants.rseStarter2Offset)]!;
      const starter3 = this.pokesInternal[readWord(this.rom, baseOffset + Gen3Constants.rseStarter3Offset)]!;
      starters.push(starter1, starter2, starter3);
    } else {
      const starter1 = this.pokesInternal[readWord(this.rom, baseOffset)]!;
      const starter2 = this.pokesInternal[readWord(this.rom, baseOffset + Gen3Constants.frlgStarter2Offset)]!;
      const starter3 = this.pokesInternal[readWord(this.rom, baseOffset + Gen3Constants.frlgStarter3Offset)]!;
      starters.push(starter1, starter2, starter3);
    }
    return starters;
  }

  setStarters(newStarters: Pokemon[]): boolean {
    if (newStarters.length !== 3) {
      return false;
    }

    // Support Deoxys/Mew starters in E/FR/LG
    this.attemptObedienceEvolutionPatches();
    const baseOffset = this.romEntryData.getValue("StarterPokemon");

    const starter0 = this.pokedexToInternal[newStarters[0].number];
    const starter1 = this.pokedexToInternal[newStarters[1].number];
    const starter2 = this.pokedexToInternal[newStarters[2].number];

    if (this.romEntryData.romType === Gen3Constants.RomType_Ruby ||
        this.romEntryData.romType === Gen3Constants.RomType_Sapp ||
        this.romEntryData.romType === Gen3Constants.RomType_Em) {
      writeWord(this.rom, baseOffset, starter0);
      writeWord(this.rom, baseOffset + Gen3Constants.rseStarter2Offset, starter1);
      writeWord(this.rom, baseOffset + Gen3Constants.rseStarter3Offset, starter2);
    } else {
      // FRLG: order 0, 1, 2 with repeat offsets
      writeWord(this.rom, baseOffset, starter0);
      writeWord(this.rom, baseOffset + Gen3Constants.frlgStarterRepeatOffset, starter1);

      writeWord(this.rom, baseOffset + Gen3Constants.frlgStarter2Offset, starter1);
      writeWord(this.rom, baseOffset + Gen3Constants.frlgStarter2Offset + Gen3Constants.frlgStarterRepeatOffset, starter2);

      writeWord(this.rom, baseOffset + Gen3Constants.frlgStarter3Offset, starter2);
      writeWord(this.rom, baseOffset + Gen3Constants.frlgStarter3Offset + Gen3Constants.frlgStarterRepeatOffset, starter0);

      if (this.romEntryData.romCode.charAt(3) !== 'J' && this.romEntryData.romCode.charAt(3) !== 'B') {
        // Update PROF. Oak's descriptions for each starter
        const bulbasaurFoundTexts = RomFunctions.search(this.rom, translateString(this.pokes[Gen3Constants.frlgBaseStarter1]!.name.toUpperCase(), this.d));
        const charmanderFoundTexts = RomFunctions.search(this.rom, translateString(this.pokes[Gen3Constants.frlgBaseStarter2]!.name.toUpperCase(), this.d));
        const squirtleFoundTexts = RomFunctions.search(this.rom, translateString(this.pokes[Gen3Constants.frlgBaseStarter3]!.name.toUpperCase(), this.d));
        this.writeFRLGStarterText(bulbasaurFoundTexts, newStarters[0], "you want to go with\\nthe ");
        this.writeFRLGStarterText(charmanderFoundTexts, newStarters[1], "you're claiming the\\n");
        this.writeFRLGStarterText(squirtleFoundTexts, newStarters[2], "you've decided on the\\n");
      }
    }
    return true;
  }

  hasStarterAltFormes(): boolean { return false; }
  starterCount(): number { return 3; }
  supportsStarterHeldItems(): boolean { return true; }

  getStarterHeldItems(): number[] {
    const sHeldItems: number[] = [];
    if (this.romEntryData.romType === Gen3Constants.RomType_FRLG) {
      const baseOffset = this.romEntryData.getValue("StarterPokemon");
      sHeldItems.push(readWord(this.rom, baseOffset + Gen3Constants.frlgStarterItemsOffset));
    } else {
      const baseOffset = this.romEntryData.getValue("StarterItems");
      const i1 = this.rom[baseOffset] & 0xFF;
      const i2 = this.rom[baseOffset + 2] & 0xFF;
      if (i2 === 0) {
        sHeldItems.push(i1);
      } else {
        sHeldItems.push(i2 + 0xFF);
      }
    }
    return sHeldItems;
  }

  setStarterHeldItems(items: number[]): void {
    if (items.length !== 1) {
      return;
    }
    const item = items[0];
    if (this.romEntryData.romType === Gen3Constants.RomType_FRLG) {
      const baseOffset = this.romEntryData.getValue("StarterPokemon");
      writeWord(this.rom, baseOffset + Gen3Constants.frlgStarterItemsOffset, item);
    } else {
      const baseOffset = this.romEntryData.getValue("StarterItems");
      if (item <= 0xFF) {
        this.rom[baseOffset] = item;
        this.rom[baseOffset + 2] = 0;
        this.rom[baseOffset + 3] = Gen3Constants.gbaAddRxOpcode | Gen3Constants.gbaR2;
      } else {
        this.rom[baseOffset] = 0xFF;
        this.rom[baseOffset + 2] = item - 0xFF;
        this.rom[baseOffset + 3] = Gen3Constants.gbaAddRxOpcode | Gen3Constants.gbaR2;
      }
    }
  }
  randomizeStarterHeldItems(_settings: Settings): void {}

  // -- Pokemon stats --

  getUpdatedPokemonStats(generation: number): Map<number, StatChange> {
    return GlobalConstants.getStatChanges(generation);
  }

  // -- Abilities --

  abilitiesPerPokemon(): number { return 2; }
  highestAbilityIndex(): number { return Gen3Constants.highestAbilityIndex; }
  getAbilityVariations(): Map<number, number[]> { return new Map(); }
  hasMegaEvolutions(): boolean { return false; }

  // -- Encounters --

  getEncounters(_useTimeOfDay: boolean): EncounterSet[] {
    if (!this.mapLoadingDone) {
      this.preprocessMaps();
      this.mapLoadingDone = true;
    }
    const startOffs = this.romEntryData.getValue("WildPokemon");
    const encounterAreas: EncounterSet[] = [];
    const seenOffsets = new Set<number>();
    let offs = startOffs;
    while (true) {
      const bank = this.rom[offs] & 0xFF;
      const map = this.rom[offs + 1] & 0xFF;
      if (bank === 0xFF && map === 0xFF) break;
      const mapName = (this.mapNames[bank] && this.mapNames[bank][map]) || `Map [${bank},${map}]`;
      const grassPokes = readPointer(this.rom, offs + 4);
      const waterPokes = readPointer(this.rom, offs + 8);
      const treePokes = readPointer(this.rom, offs + 12);
      const fishPokes = readPointer(this.rom, offs + 16);
      if (grassPokes >= 0 && grassPokes < this.rom.length && this.rom[grassPokes] !== 0
          && !seenOffsets.has(readPointer(this.rom, grassPokes + 4))) {
        encounterAreas.push(this.readWildArea(grassPokes, Gen3Constants.grassSlots, mapName + " Grass/Cave"));
        seenOffsets.add(readPointer(this.rom, grassPokes + 4));
      }
      if (waterPokes >= 0 && waterPokes < this.rom.length && this.rom[waterPokes] !== 0
          && !seenOffsets.has(readPointer(this.rom, waterPokes + 4))) {
        encounterAreas.push(this.readWildArea(waterPokes, Gen3Constants.surfingSlots, mapName + " Surfing"));
        seenOffsets.add(readPointer(this.rom, waterPokes + 4));
      }
      if (treePokes >= 0 && treePokes < this.rom.length && this.rom[treePokes] !== 0
          && !seenOffsets.has(readPointer(this.rom, treePokes + 4))) {
        encounterAreas.push(this.readWildArea(treePokes, Gen3Constants.rockSmashSlots, mapName + " Rock Smash"));
        seenOffsets.add(readPointer(this.rom, treePokes + 4));
      }
      if (fishPokes >= 0 && fishPokes < this.rom.length && this.rom[fishPokes] !== 0
          && !seenOffsets.has(readPointer(this.rom, fishPokes + 4))) {
        encounterAreas.push(this.readWildArea(fishPokes, Gen3Constants.fishingSlots, mapName + " Fishing"));
        seenOffsets.add(readPointer(this.rom, fishPokes + 4));
      }
      offs += 20;
    }
    if (this.romEntryData.arrayEntries.has("BattleTrappersBanned")) {
      const bannedAreas = this.romEntryData.arrayEntries.get("BattleTrappersBanned")!;
      const battleTrappers = new Set<Pokemon>();
      for (const pk of this.getPokemon()) {
        if (this.hasBattleTrappingAbility(pk)) {
          battleTrappers.add(pk!);
        }
      }
      for (const areaIdx of bannedAreas) {
        for (const trapper of battleTrappers) {
          encounterAreas[areaIdx].bannedPokemon.add(trapper);
        }
      }
    }
    return encounterAreas;
  }
  setEncounters(_useTimeOfDay: boolean, encounters: EncounterSet[]): void {
    // Support Deoxys/Mew catches in E/FR/LG
    this.attemptObedienceEvolutionPatches();
    const startOffs = this.romEntryData.getValue("WildPokemon");
    let encounterIdx = 0;
    const seenOffsets = new Set<number>();
    let offs = startOffs;
    while (true) {
      const bank = this.rom[offs] & 0xFF;
      const map = this.rom[offs + 1] & 0xFF;
      if (bank === 0xFF && map === 0xFF) break;
      const grassPokes = readPointer(this.rom, offs + 4);
      const waterPokes = readPointer(this.rom, offs + 8);
      const treePokes = readPointer(this.rom, offs + 12);
      const fishPokes = readPointer(this.rom, offs + 16);
      if (grassPokes >= 0 && grassPokes < this.rom.length && this.rom[grassPokes] !== 0
          && !seenOffsets.has(readPointer(this.rom, grassPokes + 4))) {
        this.writeWildArea(grassPokes, Gen3Constants.grassSlots, encounters[encounterIdx++]);
        seenOffsets.add(readPointer(this.rom, grassPokes + 4));
      }
      if (waterPokes >= 0 && waterPokes < this.rom.length && this.rom[waterPokes] !== 0
          && !seenOffsets.has(readPointer(this.rom, waterPokes + 4))) {
        this.writeWildArea(waterPokes, Gen3Constants.surfingSlots, encounters[encounterIdx++]);
        seenOffsets.add(readPointer(this.rom, waterPokes + 4));
      }
      if (treePokes >= 0 && treePokes < this.rom.length && this.rom[treePokes] !== 0
          && !seenOffsets.has(readPointer(this.rom, treePokes + 4))) {
        this.writeWildArea(treePokes, Gen3Constants.rockSmashSlots, encounters[encounterIdx++]);
        seenOffsets.add(readPointer(this.rom, treePokes + 4));
      }
      if (fishPokes >= 0 && fishPokes < this.rom.length && this.rom[fishPokes] !== 0
          && !seenOffsets.has(readPointer(this.rom, fishPokes + 4))) {
        this.writeWildArea(fishPokes, Gen3Constants.fishingSlots, encounters[encounterIdx++]);
        seenOffsets.add(readPointer(this.rom, fishPokes + 4));
      }
      offs += 20;
    }
  }
  hasTimeBasedEncounters(): boolean { return false; }
  hasWildAltFormes(): boolean { return false; }
  // randomizeWildHeldItems inherited from AbstractRomHandler
  enableGuaranteedPokemonCatching(): void {
    const offset = find(this.rom, Gen3Constants.perfectOddsBranchLocator);
    if (offset > 0) {
      // In Cmd_handleballthrow, nop the comparison + branch so we always
      // act like our catch odds are 255 (guaranteed catch).
      this.rom[offset] = 0x00;
      this.rom[offset + 1] = 0x00;
      this.rom[offset + 2] = 0x00;
      this.rom[offset + 3] = 0x00;
    }
  }
  bannedForWildEncounters(): Pokemon[] {
    if (this.romEntryData.romType === Gen3Constants.RomType_FRLG) {
      // Ban Unown in FRLG because the game crashes if encountered outside Tanoby Ruins.
      const unown = this.pokes[Species.unown];
      if (unown) return [unown];
    }
    return [];
  }

  // -- Trainers --

  getTrainers(): Trainer[] {
    const baseOffset = this.getValue("TrainerData");
    const amount = this.getValue("TrainerCount");
    const entryLen = this.getValue("TrainerEntrySize");
    const theTrainers: Trainer[] = [];
    const tcnames = this.getTrainerClassNames();
    for (let i = 1; i < amount; i++) {
      const trOffset = baseOffset + i * entryLen;
      const tr = new Trainer();
      tr.offset = trOffset;
      tr.index = i;
      const trainerclass = this.rom[trOffset + 1] & 0xFF;
      tr.trainerclass = (this.rom[trOffset + 2] & 0x80) > 0 ? 1 : 0;

      const pokeDataType = this.rom[trOffset] & 0xFF;
      const numPokes = this.rom[trOffset + (entryLen - 8)] & 0xFF;
      const pointerToPokes = readPointer(this.rom, trOffset + (entryLen - 4));
      tr.poketype = pokeDataType;
      tr.name = readVariableLengthString(this.rom, trOffset + 4, this.tb);
      tr.fullDisplayName = tcnames[trainerclass] + " " + tr.name;

      if (pokeDataType === 0) {
        for (let poke = 0; poke < numPokes; poke++) {
          const thisPoke = new TrainerPokemon();
          thisPoke.IVs = Math.floor(((readWord(this.rom, pointerToPokes + poke * 8) & 0xFF) * 31) / 255);
          thisPoke.level = readWord(this.rom, pointerToPokes + poke * 8 + 2);
          thisPoke.pokemon = this.pokesInternal[readWord(this.rom, pointerToPokes + poke * 8 + 4)]!;
          tr.pokemon.push(thisPoke);
        }
      } else if (pokeDataType === 2) {
        for (let poke = 0; poke < numPokes; poke++) {
          const thisPoke = new TrainerPokemon();
          thisPoke.IVs = Math.floor(((readWord(this.rom, pointerToPokes + poke * 8) & 0xFF) * 31) / 255);
          thisPoke.level = readWord(this.rom, pointerToPokes + poke * 8 + 2);
          thisPoke.pokemon = this.pokesInternal[readWord(this.rom, pointerToPokes + poke * 8 + 4)]!;
          thisPoke.heldItem = readWord(this.rom, pointerToPokes + poke * 8 + 6);
          tr.pokemon.push(thisPoke);
        }
      } else if (pokeDataType === 1) {
        for (let poke = 0; poke < numPokes; poke++) {
          const thisPoke = new TrainerPokemon();
          thisPoke.IVs = Math.floor(((readWord(this.rom, pointerToPokes + poke * 16) & 0xFF) * 31) / 255);
          thisPoke.level = readWord(this.rom, pointerToPokes + poke * 16 + 2);
          thisPoke.pokemon = this.pokesInternal[readWord(this.rom, pointerToPokes + poke * 16 + 4)]!;
          for (let move = 0; move < 4; move++) {
            thisPoke.moves[move] = readWord(this.rom, pointerToPokes + poke * 16 + 6 + (move * 2));
          }
          tr.pokemon.push(thisPoke);
        }
      } else if (pokeDataType === 3) {
        for (let poke = 0; poke < numPokes; poke++) {
          const thisPoke = new TrainerPokemon();
          thisPoke.IVs = Math.floor(((readWord(this.rom, pointerToPokes + poke * 16) & 0xFF) * 31) / 255);
          thisPoke.level = readWord(this.rom, pointerToPokes + poke * 16 + 2);
          thisPoke.pokemon = this.pokesInternal[readWord(this.rom, pointerToPokes + poke * 16 + 4)]!;
          thisPoke.heldItem = readWord(this.rom, pointerToPokes + poke * 16 + 6);
          for (let move = 0; move < 4; move++) {
            thisPoke.moves[move] = readWord(this.rom, pointerToPokes + poke * 16 + 8 + (move * 2));
          }
          tr.pokemon.push(thisPoke);
        }
      }
      theTrainers.push(tr);
    }

    if (this.romEntryData.romType === Gen3Constants.RomType_Em) {
      const mossdeepStevenOffset = this.getValue("MossdeepStevenTeamOffset");
      const mossdeepSteven = new Trainer();
      mossdeepSteven.offset = mossdeepStevenOffset;
      mossdeepSteven.index = amount;
      mossdeepSteven.poketype = 1; // Custom moves, but no held items

      const meteorFallsSteven = theTrainers[Gen3Constants.emMeteorFallsStevenIndex - 1];
      mossdeepSteven.trainerclass = meteorFallsSteven.trainerclass;
      mossdeepSteven.name = meteorFallsSteven.name;
      mossdeepSteven.fullDisplayName = meteorFallsSteven.fullDisplayName;

      for (let i = 0; i < 3; i++) {
        const currentOffset = mossdeepStevenOffset + (i * 20);
        const thisPoke = new TrainerPokemon();
        thisPoke.pokemon = this.pokesInternal[readWord(this.rom, currentOffset)]!;
        thisPoke.IVs = this.rom[currentOffset + 2];
        thisPoke.level = this.rom[currentOffset + 3];
        for (let move = 0; move < 4; move++) {
          thisPoke.moves[move] = readWord(this.rom, currentOffset + 12 + (move * 2));
        }
        mossdeepSteven.pokemon.push(thisPoke);
      }

      theTrainers.push(mossdeepSteven);
    }

    if (this.romEntryData.romType === Gen3Constants.RomType_Ruby || this.romEntryData.romType === Gen3Constants.RomType_Sapp) {
      Gen3Constants.trainerTagsRS(theTrainers, this.romEntryData.romType);
    } else if (this.romEntryData.romType === Gen3Constants.RomType_Em) {
      Gen3Constants.trainerTagsE(theTrainers);
      Gen3Constants.setMultiBattleStatusEm(theTrainers);
    } else {
      Gen3Constants.trainerTagsFRLG(theTrainers);
    }
    return theTrainers;
  }

  getMainPlaythroughTrainers(): number[] { return []; }

  getEliteFourTrainers(_isChallengeMode: boolean): number[] {
    const indices = this.romEntryData.arrayEntries.get("EliteFourIndices");
    if (!indices) return [];
    return [...indices];
  }

  setTrainers(trainerData: Trainer[], doubleBattleMode: boolean): void {
    const baseOffset = this.getValue("TrainerData");
    const amount = this.getValue("TrainerCount");
    const entryLen = this.getValue("TrainerEntrySize");
    const fso = this.getValue("FreeSpace");

    // Get current movesets in case we need to reset them for certain trainer mons.
    const movesets = this.getMovesLearnt();

    let trainerIdx = 0;
    for (let i = 1; i < amount; i++) {
      const trOffset = baseOffset + i * entryLen;
      const tr = trainerData[trainerIdx++];
      const oldPokeType = this.rom[trOffset] & 0xFF;
      const oldPokeCount = this.rom[trOffset + (entryLen - 8)] & 0xFF;
      const newPokeCount = tr.pokemon.length;
      const newDataSize = newPokeCount * ((tr.poketype & 1) === 1 ? 16 : 8);
      const oldDataSize = oldPokeCount * ((oldPokeType & 1) === 1 ? 16 : 8);

      // write out new data first...
      this.rom[trOffset] = tr.poketype;
      this.rom[trOffset + (entryLen - 8)] = newPokeCount;
      if (doubleBattleMode) {
        if (!tr.skipImportant()) {
          this.rom[trOffset + (entryLen - 16)] = 0x01;
        }
      }

      // now, do we need to repoint?
      let pointerToPokes: number;
      if (newDataSize > oldDataSize) {
        const writeSpace = RomFunctions.freeSpaceFinder(this.rom, Gen3Constants.freeSpaceByte, newDataSize, fso, true);
        if (writeSpace < fso) {
          throw new Error("ROM is full");
        }
        writePointer(this.rom, trOffset + (entryLen - 4), writeSpace);
        pointerToPokes = writeSpace;
      } else {
        pointerToPokes = readPointer(this.rom, trOffset + (entryLen - 4));
      }

      // Write out Pokemon data!
      if (tr.pokemonHaveCustomMoves()) {
        // custom moves, blocks of 16 bytes
        for (let poke = 0; poke < newPokeCount; poke++) {
          const tp = tr.pokemon[poke];
          writeWord(this.rom, pointerToPokes + poke * 16, Math.min(255, 1 + Math.floor((tp.IVs * 255) / 31)));
          writeWord(this.rom, pointerToPokes + poke * 16 + 2, tp.level);
          writeWord(this.rom, pointerToPokes + poke * 16 + 4, this.pokedexToInternal[tp.pokemon.number]);
          let movesStart: number;
          if (tr.pokemonHaveItems()) {
            writeWord(this.rom, pointerToPokes + poke * 16 + 6, tp.heldItem);
            movesStart = 8;
          } else {
            movesStart = 6;
            writeWord(this.rom, pointerToPokes + poke * 16 + 14, 0);
          }
          if (tp.resetMoves) {
            const pokeMoves = RomFunctions.getMovesAtLevel(tp.pokemon.number, movesets, tp.level);
            for (let m = 0; m < 4; m++) {
              writeWord(this.rom, pointerToPokes + poke * 16 + movesStart + m * 2, pokeMoves[m]);
            }
          } else {
            writeWord(this.rom, pointerToPokes + poke * 16 + movesStart, tp.moves[0]);
            writeWord(this.rom, pointerToPokes + poke * 16 + movesStart + 2, tp.moves[1]);
            writeWord(this.rom, pointerToPokes + poke * 16 + movesStart + 4, tp.moves[2]);
            writeWord(this.rom, pointerToPokes + poke * 16 + movesStart + 6, tp.moves[3]);
          }
        }
      } else {
        // no moves, blocks of 8 bytes
        for (let poke = 0; poke < newPokeCount; poke++) {
          const tp = tr.pokemon[poke];
          writeWord(this.rom, pointerToPokes + poke * 8, Math.min(255, 1 + Math.floor((tp.IVs * 255) / 31)));
          writeWord(this.rom, pointerToPokes + poke * 8 + 2, tp.level);
          writeWord(this.rom, pointerToPokes + poke * 8 + 4, this.pokedexToInternal[tp.pokemon.number]);
          if (tr.pokemonHaveItems()) {
            writeWord(this.rom, pointerToPokes + poke * 8 + 6, tp.heldItem);
          } else {
            writeWord(this.rom, pointerToPokes + poke * 8 + 6, 0);
          }
        }
      }
    }

    if (this.romEntryData.romType === Gen3Constants.RomType_Em) {
      const mossdeepStevenOffset = this.getValue("MossdeepStevenTeamOffset");
      const mossdeepSteven = trainerData[amount - 1];

      for (let i = 0; i < 3; i++) {
        const currentOffset = mossdeepStevenOffset + (i * 20);
        const tp = mossdeepSteven.pokemon[i];
        writeWord(this.rom, currentOffset, this.pokedexToInternal[tp.pokemon.number]);
        this.rom[currentOffset + 2] = tp.IVs;
        this.rom[currentOffset + 3] = tp.level;
        for (let move = 0; move < 4; move++) {
          writeWord(this.rom, currentOffset + 12 + (move * 2), tp.moves[move]);
        }
      }
    }
  }

  // getMoveSelectionPoolAtLevel inherited from AbstractRomHandler

  // -- Moves --

  getMoves(): (Move | null)[] { return this.moves; }

  getMovesLearnt(): Map<number, MoveLearnt[]> {
    const movesets = new Map<number, MoveLearnt[]>();
    const baseOffset = this.romEntryData.getValue("PokemonMovesets");
    for (let i = 1; i <= this.numRealPokemon; i++) {
      const pkmn = this.pokemonList[i]!;
      const offsToPtr = baseOffset + this.pokedexToInternal[pkmn.number] * 4;
      let moveDataLoc = readPointer(this.rom, offsToPtr);
      const moves: MoveLearnt[] = [];
      if (this.jamboMovesetHack) {
        while (
          (this.rom[moveDataLoc] & 0xff) !== 0x00 ||
          (this.rom[moveDataLoc + 1] & 0xff) !== 0x00 ||
          (this.rom[moveDataLoc + 2] & 0xff) !== 0xff
        ) {
          const ml = new MoveLearnt();
          ml.level = this.rom[moveDataLoc + 2] & 0xff;
          ml.move = readWord(this.rom, moveDataLoc);
          moves.push(ml);
          moveDataLoc += 3;
        }
      } else {
        while (
          (this.rom[moveDataLoc] & 0xff) !== 0xff ||
          (this.rom[moveDataLoc + 1] & 0xff) !== 0xff
        ) {
          let move = this.rom[moveDataLoc] & 0xff;
          const level = (this.rom[moveDataLoc + 1] & 0xfe) >> 1;
          if ((this.rom[moveDataLoc + 1] & 0x01) === 0x01) {
            move += 0x100;
          }
          const ml = new MoveLearnt();
          ml.level = level;
          ml.move = move;
          moves.push(ml);
          moveDataLoc += 2;
        }
      }
      movesets.set(pkmn.number, moves);
    }
    return movesets;
  }

  setMovesLearnt(movesets: Map<number, MoveLearnt[]>): void {
    const baseOffset = this.romEntryData.getValue("PokemonMovesets");
    const fso = this.romEntryData.getValue("FreeSpace");
    for (let i = 1; i <= this.numRealPokemon; i++) {
      const pkmn = this.pokemonList[i]!;
      const offsToPtr = baseOffset + this.pokedexToInternal[pkmn.number] * 4;
      let moveDataLoc = readPointer(this.rom, offsToPtr);
      const moves = movesets.get(pkmn.number);
      if (!moves) continue;
      const newMoveCount = moves.length;
      let mloc = moveDataLoc;
      let entrySize: number;
      if (this.jamboMovesetHack) {
        while (
          (this.rom[mloc] & 0xff) !== 0x00 ||
          (this.rom[mloc + 1] & 0xff) !== 0x00 ||
          (this.rom[mloc + 2] & 0xff) !== 0xff
        ) {
          mloc += 3;
        }
        entrySize = 3;
      } else {
        while (
          (this.rom[mloc] & 0xff) !== 0xff ||
          (this.rom[mloc + 1] & 0xff) !== 0xff
        ) {
          mloc += 2;
        }
        entrySize = 2;
      }
      const currentMoveCount = (mloc - moveDataLoc) / entrySize;

      if (newMoveCount > currentMoveCount) {
        // Repoint for more space
        const newBytesNeeded = newMoveCount * entrySize + entrySize * 2;
        const writeSpace = RomFunctions.freeSpaceFinder(
          this.rom, Gen3Constants.freeSpaceByte, newBytesNeeded, fso
        );
        if (writeSpace < fso) {
          throw new RandomizerIOException("ROM is full");
        }
        writePointer(this.rom, offsToPtr, writeSpace);
        moveDataLoc = writeSpace;
      }

      // Write new moveset now that space is ensured.
      for (const ml of moves) {
        moveDataLoc += this.writeMLToOffset(moveDataLoc, ml);
      }

      // If move count changed, new terminator is required
      if (newMoveCount !== currentMoveCount) {
        if (this.jamboMovesetHack) {
          this.rom[moveDataLoc] = 0x00;
          this.rom[moveDataLoc + 1] = 0x00;
          this.rom[moveDataLoc + 2] = 0xff;
          this.rom[moveDataLoc + 3] = 0x00;
          this.rom[moveDataLoc + 4] = 0x00;
          this.rom[moveDataLoc + 5] = 0x00;
        } else {
          this.rom[moveDataLoc] = 0xff;
          this.rom[moveDataLoc + 1] = 0xff;
          this.rom[moveDataLoc + 2] = 0x00;
          this.rom[moveDataLoc + 3] = 0x00;
        }
      }
    }
  }

  private writeMLToOffset(offset: number, ml: MoveLearnt): number {
    if (this.jamboMovesetHack) {
      writeWord(this.rom, offset, ml.move);
      this.rom[offset + 2] = ml.level & 0xff;
      return 3;
    } else {
      this.rom[offset] = ml.move & 0xff;
      let levelPart = (ml.level << 1) & 0xfe;
      if (ml.move > 255) {
        levelPart++;
      }
      this.rom[offset + 1] = levelPart & 0xff;
      return 2;
    }
  }

  getEggMoves(): Map<number, number[]> {
    const eggMoves = new Map<number, number[]>();
    const baseOffset = this.romEntryData.getValue("EggMoves");
    let currentOffset = baseOffset;
    let currentSpecies = 0;
    let currentMoves: number[] = [];
    let val = readWord(this.rom, currentOffset);

    while (val !== 0xffff) {
      if (val > 20000) {
        const species = val - 20000;
        if (currentMoves.length > 0) {
          eggMoves.set(this.internalToPokedex[currentSpecies], currentMoves);
        }
        currentSpecies = species;
        currentMoves = [];
      } else {
        currentMoves.push(val);
      }
      currentOffset += 2;
      val = readWord(this.rom, currentOffset);
    }

    // Need to make sure the last entry gets recorded too
    if (currentMoves.length > 0) {
      eggMoves.set(this.internalToPokedex[currentSpecies], currentMoves);
    }
    return eggMoves;
  }

  setEggMoves(eggMoves: Map<number, number[]>): void {
    const baseOffset = this.romEntryData.getValue("EggMoves");
    let currentOffset = baseOffset;
    for (const [species, moves] of eggMoves) {
      writeWord(this.rom, currentOffset, this.pokedexToInternal[species] + 20000);
      currentOffset += 2;
      for (const move of moves) {
        writeWord(this.rom, currentOffset, move);
        currentOffset += 2;
      }
    }
  }

  // randomizeEggMoves inherited from AbstractRomHandler
  supportsFourStartingMoves(): boolean { return true; }

  // -- Static Pokemon --

  getStaticPokemon(): StaticEncounter[] {
    const statics: StaticEncounter[] = [];
    const staticsHere = this.romEntryData.staticPokemon;
    let eggOffs: number[] = [];
    if (this.romEntryData.arrayEntries.has("StaticEggPokemonOffsets")) {
      eggOffs = this.romEntryData.arrayEntries.get("StaticEggPokemonOffsets")!;
    }
    for (let i = 0; i < staticsHere.length; i++) {
      const se = new StaticEncounter();
      se.pkmn = this.getStaticPokemonSpecies(staticsHere[i]);
      se.level = this.getStaticPokemonLevel(staticsHere[i], 0);
      se.isEgg = eggOffs.includes(i);
      statics.push(se);
    }
    if (this.romEntryData.codeTweaks.get("StaticFirstBattleTweak") != null) {
      const spOff = this.getValue("StaticFirstBattleSpeciesOffset");
      let sp = readWord(this.rom, spOff);
      if (sp === 0xFFFF) { FileFunctions.applyPatch(this.rom, this.romEntryData.codeTweaks.get("StaticFirstBattleTweak")!); sp = readWord(this.rom, spOff); }
      const se = new StaticEncounter();
      se.pkmn = this.pokesInternal[sp]!;
      se.level = this.rom[this.getValue("StaticFirstBattleLevelOffset")];
      statics.push(se);
    } else if (this.romEntryData.codeTweaks.get("GhostMarowakTweak") != null) {
      const gmOffs = this.romEntryData.arrayEntries.get("GhostMarowakSpeciesOffsets")!;
      let sp = readWord(this.rom, gmOffs[0]);
      if (sp === 0xFFFF) { FileFunctions.applyPatch(this.rom, this.romEntryData.codeTweaks.get("GhostMarowakTweak")!); sp = readWord(this.rom, gmOffs[0]); }
      const se = new StaticEncounter();
      se.pkmn = this.pokesInternal[sp]!;
      se.level = this.rom[this.romEntryData.arrayEntries.get("GhostMarowakLevelOffsets")![0]];
      statics.push(se);
    }
    this.getRoamers(statics);
    return statics;
  }
  setStaticPokemon(staticPokemon: StaticEncounter[]): boolean {
    this.attemptObedienceEvolutionPatches();
    const staticsHere = this.romEntryData.staticPokemon;
    let roamerSize = this.romEntryData.roamingPokemon.length;
    if (this.romEntryData.romType === Gen3Constants.RomType_Em) { roamerSize = 0; }
    let hcSize = 0;
    if (this.romEntryData.codeTweaks.get("StaticFirstBattleTweak") != null || this.romEntryData.codeTweaks.get("GhostMarowakTweak") != null) { hcSize = 1; }
    if (staticPokemon.length !== staticsHere.length + hcSize + roamerSize) { return false; }
    for (let i = 0; i < staticsHere.length; i++) {
      this.setStaticPokemonSpecies(staticsHere[i], staticPokemon[i].pkmn);
      this.setStaticPokemonLevel(staticsHere[i], staticPokemon[i].level, 0);
    }
    if (this.romEntryData.codeTweaks.get("StaticFirstBattleTweak") != null) {
      const se = staticPokemon[this.getValue("StaticFirstBattleOffset")];
      writeWord(this.rom, this.getValue("StaticFirstBattleSpeciesOffset"), this.pokedexToInternal[se.pkmn.number]);
      this.rom[this.getValue("StaticFirstBattleLevelOffset")] = se.level & 0xFF;
    } else if (this.romEntryData.codeTweaks.get("GhostMarowakTweak") != null) {
      const gm = staticPokemon[this.getValue("GhostMarowakOffset")];
      for (const off of this.romEntryData.arrayEntries.get("GhostMarowakSpeciesOffsets")!) { writeWord(this.rom, off, this.pokedexToInternal[gm.pkmn.number]); }
      for (const off of this.romEntryData.arrayEntries.get("GhostMarowakLevelOffsets")!) { this.rom[off] = gm.level & 0xFF; }
      const ggo = this.getValue("GhostMarowakGenderOffset");
      if (gm.pkmn.genderRatio === 0 || gm.pkmn.genderRatio === 0xFF) { this.rom[ggo] = gm.pkmn.genderRatio & 0xFF; }
    }
    this.setRoamers(staticPokemon);
    return true;
  }
  canChangeStaticPokemon(): boolean { return this.getValue('StaticPokemonSupport') > 0; }
  hasStaticAltFormes(): boolean { return false; }
  hasMainGameLegendaries(): boolean { return this.romEntryData.arrayEntries.has("MainGameLegendaries"); }
  getMainGameLegendaries(): number[] {
    if (this.hasMainGameLegendaries()) {
      return [...this.romEntryData.arrayEntries.get("MainGameLegendaries")!];
    }
    return [];
  }
  getSpecialMusicStatics(): number[] {
    const arr = this.romEntryData.arrayEntries.get("SpecialMusicStatics");
    return arr ? [...arr] : [];
  }
  applyCorrectStaticMusic(specialMusicStaticChanges: Map<number, number>): void {
    const replaced: number[] = [];
    const tweakName = this.romEntryData.codeTweaks.get("NewIndexToMusicTweak");
    if (tweakName != null) {
      FileFunctions.applyPatch(this.rom, tweakName);
      const po = this.getValue("NewIndexToMusicPoolOffset");
      if (po > 0) {
        for (const [oldS, newS] of specialMusicStaticChanges) {
          let i = po;
          let idx = this.internalToPokedex[readWord(this.rom, i)];
          while (idx !== oldS || replaced.includes(i)) { i += 4; idx = this.internalToPokedex[readWord(this.rom, i)]; }
          writeWord(this.rom, i, this.pokedexToInternal[newS]);
          replaced.push(i);
        }
      }
    }
  }
  hasStaticMusicFix(): boolean { return this.romEntryData.codeTweaks.get("NewIndexToMusicTweak") != null; }

  // -- Static Pokemon helpers --
  private getStaticPokemonSpecies(sp: StaticPokemon): Pokemon { return this.pokesInternal[readWord(this.rom, sp.speciesOffsets[0])]!; }
  private setStaticPokemonSpecies(sp: StaticPokemon, pkmn: Pokemon): void {
    const v = this.pokedexToInternal[pkmn.number];
    for (const off of sp.speciesOffsets) { writeWord(this.rom, off, v); }
  }
  private getStaticPokemonLevel(sp: StaticPokemon, i: number): number { return sp.levelOffsets.length <= i ? 1 : this.rom[sp.levelOffsets[i]]; }
  private setStaticPokemonLevel(sp: StaticPokemon, level: number, i: number): void { if (sp.levelOffsets.length > i) { this.rom[sp.levelOffsets[i]] = level & 0xFF; } }

  private getRoamers(statics: StaticEncounter[]): void {
    const rt = this.romEntryData.romType;
    const rp = this.romEntryData.roamingPokemon;
    if (rt === Gen3Constants.RomType_Ruby) {
      if (readWord(this.rom, rp[0].speciesOffsets[0]) === 0) { this.applyRubyRoamerPatch(); }
      const se = new StaticEncounter(); se.pkmn = this.getStaticPokemonSpecies(rp[0]); se.level = this.getStaticPokemonLevel(rp[0], 0); statics.push(se);
    } else if (rt === Gen3Constants.RomType_Sapp) {
      const se = new StaticEncounter(); se.pkmn = this.getStaticPokemonSpecies(rp[0]); se.level = this.getStaticPokemonLevel(rp[0], 0); statics.push(se);
    } else if (rt === Gen3Constants.RomType_FRLG && this.romEntryData.codeTweaks.get("RoamingPokemonTweak") != null) {
      if (readWord(this.rom, rp[0].speciesOffsets[0]) === 0xFFFF) { FileFunctions.applyPatch(this.rom, this.romEntryData.codeTweaks.get("RoamingPokemonTweak")!); }
      for (let i = 0; i < rp.length; i++) {
        const se = new StaticEncounter(); se.pkmn = this.getStaticPokemonSpecies(rp[i]); se.level = this.getStaticPokemonLevel(rp[i], 0); statics.push(se);
      }
    } else if (rt === Gen3Constants.RomType_Em) {
      if (readWord(this.rom, rp[0].speciesOffsets[0]) >= this.pokesInternal.length) { this.applyEmeraldRoamerPatch(); }
      const siOffs = this.romEntryData.arrayEntries.get("StaticSouthernIslandOffsets")!;
      for (let i = 0; i < rp.length; i++) {
        const se = new StaticEncounter(); se.pkmn = this.getStaticPokemonSpecies(rp[i]); se.level = this.getStaticPokemonLevel(rp[i], 0);
        statics[siOffs[i]].linkedEncounters.push(se);
      }
    }
  }

  private setRoamers(statics: StaticEncounter[]): void {
    const rt = this.romEntryData.romType;
    const rp = this.romEntryData.roamingPokemon;
    if (rt === Gen3Constants.RomType_Ruby || rt === Gen3Constants.RomType_Sapp) {
      const re = statics[statics.length - 1];
      this.setStaticPokemonSpecies(rp[0], re.pkmn);
      for (let i = 0; i < rp[0].levelOffsets.length; i++) { this.setStaticPokemonLevel(rp[0], re.level, i); }
    } else if (rt === Gen3Constants.RomType_FRLG && this.romEntryData.codeTweaks.get("RoamingPokemonTweak") != null) {
      for (let i = 0; i < rp.length; i++) {
        const re = statics[statics.length - 3 + i];
        this.setStaticPokemonSpecies(rp[i], re.pkmn);
        for (let j = 0; j < rp[i].levelOffsets.length; j++) { this.setStaticPokemonLevel(rp[i], re.level, j); }
      }
    } else if (rt === Gen3Constants.RomType_Em) {
      const siOffs = this.romEntryData.arrayEntries.get("StaticSouthernIslandOffsets")!;
      for (let i = 0; i < rp.length; i++) {
        const re = statics[siOffs[i]].linkedEncounters[0];
        this.setStaticPokemonSpecies(rp[i], re.pkmn);
        for (let j = 0; j < rp[i].levelOffsets.length; j++) { this.setStaticPokemonLevel(rp[i], re.level, j); }
      }
    }
  }

  private applyRubyRoamerPatch(): void {
    let off = this.getValue("FindMapsWithMonFunctionStartOffset");
    this.rom[off + 22] = 0x57;
    writeLong(this.rom, off + 128, this.pokedexToInternal[Species.latios]);
    this.rom[off + 12] = 0x00; this.rom[off + 13] = 0x00; this.rom[off + 14] = 0x1C; this.rom[off + 15] = 0x48;
    off = this.getValue("CreateInitialRoamerMonFunctionStartOffset");
    this.rom[off + 182] = 0x00; this.rom[off + 183] = 0xBD;
    writeLong(this.rom, off + 184, this.pokedexToInternal[Species.latios]);
    this.rom[off + 10] = 0x00; this.rom[off + 11] = 0x00; this.rom[off + 12] = 0x2A; this.rom[off + 13] = 0x4E;
  }

  private applyEmeraldRoamerPatch(): void {
    const off = this.getValue("CreateInitialRoamerMonFunctionStartOffset");
    this.rom[off + 14] = 0x41;
    writeLong(this.rom, off + 28, this.pokedexToInternal[Species.latios]);
    this.rom[off + 8] = 0x00; this.rom[off + 9] = 0x28; this.rom[off + 10] = 0x04; this.rom[off + 11] = 0x4B;
    this.rom[off + 48] = 0x1A; this.rom[off + 49] = 0x46; this.rom[off + 50] = 0x00; this.rom[off + 51] = 0x00;
  }

  // -- Totem Pokemon --

  getTotemPokemon(): TotemPokemon[] { return []; }
  setTotemPokemon(_totems: TotemPokemon[]): void {}
  randomizeTotemPokemon(_settings: Settings): void {}

  // -- TMs & HMs --

  private get ssd(): StringSizeDeterminer {
    const d = this.d;
    return { lengthFor: (encodedText: string) => translateString(encodedText, d).length };
  }

  getTMMoves(): number[] {
    const tms: number[] = [];
    const offset = this.getValue("TmMoves");
    for (let i = 1; i <= Gen3Constants.tmCount; i++) {
      tms.push(readWord(this.rom, offset + (i - 1) * 2));
    }
    return tms;
  }

  getHMMoves(): number[] { return Gen3Constants.hmMoves.slice(); }

  setTMMoves(moveIndexes: number[]): void {
    if (!this.mapLoadingDone) {
      this.preprocessMaps();
      this.mapLoadingDone = true;
    }
    const offset = this.getValue("TmMoves");
    for (let i = 1; i <= Gen3Constants.tmCount; i++) {
      writeWord(this.rom, offset + (i - 1) * 2, moveIndexes[i - 1]);
    }
    const otherOffset = this.getValue("TmMovesDuplicate");
    if (otherOffset > 0) {
      this.rom.copyWithin(otherOffset, offset, offset + Gen3Constants.tmCount * 2);
    }

    const iiOffset = this.getValue("ItemImages");
    if (iiOffset > 0) {
      const pals = this.romEntryData.arrayEntries.get("TmPals");
      if (pals) {
        for (let i = 0; i < 50; i++) {
          const mv = this.moves[moveIndexes[i]];
          if (mv) {
            const typeID = Gen3Constants.typeToByte(mv.type as any);
            writePointer(this.rom, iiOffset + (Gen3Constants.tmItemOffset + i) * 8 + 4, pals[typeID]);
          }
        }
      }
    }

    const fsOffset = this.getValue("FreeSpace");

    // Item descriptions
    if (this.getValue("MoveDescriptions") > 0) {
      const idOffset = this.getValue("ItemData");
      const mdOffset = this.getValue("MoveDescriptions");
      const entrySize = this.getValue("ItemEntrySize");
      const limitPerLine = (this.romEntryData.romType === Gen3Constants.RomType_FRLG)
        ? Gen3Constants.frlgItemDescCharsPerLine
        : Gen3Constants.rseItemDescCharsPerLine;
      for (let i = 0; i < Gen3Constants.tmCount; i++) {
        const itemBaseOffset = idOffset + (i + Gen3Constants.tmItemOffset) * entrySize;
        const moveBaseOffset = mdOffset + (moveIndexes[i] - 1) * 4;
        const moveTextPointer = readPointer(this.rom, moveBaseOffset);
        const moveDesc = readVariableLengthString(this.rom, moveTextPointer, this.tb);
        const newItemDesc = RomFunctions.rewriteDescriptionForNewLineSize(moveDesc, "\\n", limitPerLine, this.ssd);
        const fsBytesNeeded = translateString(newItemDesc, this.d).length + 1;
        const newItemDescOffset = RomFunctions.freeSpaceFinder(this.rom, Gen3Constants.freeSpaceByte, fsBytesNeeded, fsOffset);
        if (newItemDescOffset < fsOffset) {
          this.log("Couldn't insert new item description.\n");
          return;
        }
        writeVariableLengthString(this.rom, newItemDesc, newItemDescOffset, this.d);
        writePointer(this.rom, itemBaseOffset + Gen3Constants.itemDataDescriptionOffset, newItemDescOffset);
      }
    }

    // TM Text
    for (const tte of this.romEntryData.tmmtTexts) {
      if (tte.actualOffset > 0 && !tte.isMoveTutor) {
        const oldPointer = readPointer(this.rom, tte.actualOffset);
        if (oldPointer < 0 || oldPointer >= this.rom.length) {
          this.log("Couldn't insert new TM text. Skipping remaining TM text updates.\n");
          return;
        }
        const moveName = this.moves[moveIndexes[tte.number - 1]]?.name ?? "";
        const tmpMoveName = moveName.replace(/ /g, '_');
        const unformatted = tte.template.replace("[move]", tmpMoveName);
        let newText = RomFunctions.formatTextWithReplacements(unformatted, null, "\\n", "\\l", "\\p",
          Gen3Constants.regularTextboxCharsPerLine, this.ssd);
        newText = newText.replace(tmpMoveName, moveName);
        const fsBytesNeeded = translateString(newText, this.d).length + 1;
        const newOffset = RomFunctions.freeSpaceFinder(this.rom, 0xFF, fsBytesNeeded, fsOffset);
        if (newOffset < fsOffset) {
          this.log("Couldn't insert new TM text.\n");
          return;
        }
        writeVariableLengthString(this.rom, newText, newOffset, this.d);
        const searchNeedle = this.rom.slice(tte.actualOffset, tte.actualOffset + 4);
        const minOff = Math.max(0, tte.actualOffset - Gen3Constants.pointerSearchRadius);
        const maxOff = Math.min(this.rom.length, tte.actualOffset + Gen3Constants.pointerSearchRadius);
        const pointerLocs = RomFunctions.search(this.rom, minOff, maxOff, searchNeedle);
        for (const pointerLoc of pointerLocs) {
          writePointer(this.rom, pointerLoc, newOffset);
        }
      }
    }
  }

  getTMCount(): number { return Gen3Constants.tmCount; }
  getHMCount(): number { return Gen3Constants.hmCount; }

  getTMHMCompatibility(): Map<Pokemon, boolean[]> {
    const compat = new Map<Pokemon, boolean[]>();
    const offset = this.getValue("PokemonTMHMCompat");
    for (let i = 1; i <= this.numRealPokemon; i++) {
      const pkmn = this.pokemonList[i];
      if (!pkmn) continue;
      const compatOffset = offset + this.pokedexToInternal[pkmn.number] * 8;
      const flags = new Array<boolean>(Gen3Constants.tmCount + Gen3Constants.hmCount + 1).fill(false);
      for (let j = 0; j < 8; j++) {
        this.readByteIntoFlags(flags, j * 8 + 1, compatOffset + j);
      }
      compat.set(pkmn, flags);
    }
    return compat;
  }

  setTMHMCompatibility(compatData: Map<Pokemon, boolean[]>): void {
    const offset = this.getValue("PokemonTMHMCompat");
    for (const [pkmn, flags] of compatData) {
      const compatOffset = offset + this.pokedexToInternal[pkmn.number] * 8;
      for (let j = 0; j < 8; j++) {
        this.rom[compatOffset + j] = this.getByteFromFlags(flags, j * 8 + 1);
      }
    }
  }

  // -- Move Tutors --

  hasMoveTutors(): boolean {
    return this.romEntryData.romType === Gen3Constants.RomType_Em ||
           this.romEntryData.romType === Gen3Constants.RomType_FRLG;
  }

  getMoveTutorMoves(): number[] {
    if (!this.hasMoveTutors()) {
      return [];
    }
    const mts: number[] = [];
    const moveCount = this.getValue("MoveTutorMoves");
    const offset = this.getValue("MoveTutorData");
    for (let i = 0; i < moveCount; i++) {
      mts.push(readWord(this.rom, offset + i * 2));
    }
    return mts;
  }

  setMoveTutorMoves(moves: number[]): void {
    if (!this.hasMoveTutors()) {
      return;
    }
    const moveCount = this.getValue("MoveTutorMoves");
    const offset = this.getValue("MoveTutorData");
    if (moveCount !== moves.length) {
      return;
    }
    for (let i = 0; i < moveCount; i++) {
      writeWord(this.rom, offset + i * 2, moves[i]);
    }
    const fsOffset = this.getValue("FreeSpace");

    // Move Tutor Text
    for (const tte of this.romEntryData.tmmtTexts) {
      if (tte.actualOffset > 0 && tte.isMoveTutor) {
        const oldPointer = readPointer(this.rom, tte.actualOffset);
        if (oldPointer < 0 || oldPointer >= this.rom.length) {
          throw new Error("Move Tutor Text update failed: couldn't read a move tutor text pointer.");
        }
        const moveName = this.moves[moves[tte.number]]?.name ?? "";
        const tmpMoveName = moveName.replace(/ /g, '_');
        const unformatted = tte.template.replace("[move]", tmpMoveName);
        let newText = RomFunctions.formatTextWithReplacements(unformatted, null, "\\n", "\\l", "\\p",
          Gen3Constants.regularTextboxCharsPerLine, this.ssd);
        newText = newText.replace(tmpMoveName, moveName);
        const fsBytesNeeded = translateString(newText, this.d).length + 1;
        const newOffset = RomFunctions.freeSpaceFinder(this.rom, Gen3Constants.freeSpaceByte, fsBytesNeeded, fsOffset);
        if (newOffset < fsOffset) {
          this.log("Couldn't insert new Move Tutor text.\n");
          return;
        }
        writeVariableLengthString(this.rom, newText, newOffset, this.d);
        const searchNeedle = this.rom.slice(tte.actualOffset, tte.actualOffset + 4);
        const minOff = Math.max(0, tte.actualOffset - Gen3Constants.pointerSearchRadius);
        const maxOff = Math.min(this.rom.length, tte.actualOffset + Gen3Constants.pointerSearchRadius);
        const pointerLocs = RomFunctions.search(this.rom, minOff, maxOff, searchNeedle);
        for (const pointerLoc of pointerLocs) {
          writePointer(this.rom, pointerLoc, newOffset);
        }
      }
    }
  }

  // randomizeMoveTutorMoves inherited from AbstractRomHandler

  getMoveTutorCompatibility(): Map<Pokemon, boolean[]> {
    if (!this.hasMoveTutors()) {
      return new Map();
    }
    const compat = new Map<Pokemon, boolean[]>();
    const moveCount = this.getValue("MoveTutorMoves");
    const offset = this.getValue("MoveTutorCompatibility");
    const bytesRequired = ((moveCount + 7) & ~7) / 8;
    for (let i = 1; i <= this.numRealPokemon; i++) {
      const pkmn = this.pokemonList[i];
      if (!pkmn) continue;
      const compatOffset = offset + this.pokedexToInternal[pkmn.number] * bytesRequired;
      const flags = new Array<boolean>(moveCount + 1).fill(false);
      for (let j = 0; j < bytesRequired; j++) {
        this.readByteIntoFlags(flags, j * 8 + 1, compatOffset + j);
      }
      compat.set(pkmn, flags);
    }
    return compat;
  }

  setMoveTutorCompatibility(compatData: Map<Pokemon, boolean[]>): void {
    if (!this.hasMoveTutors()) {
      return;
    }
    const moveCount = this.getValue("MoveTutorMoves");
    const offset = this.getValue("MoveTutorCompatibility");
    const bytesRequired = ((moveCount + 7) & ~7) / 8;
    for (const [pkmn, flags] of compatData) {
      const compatOffset = offset + this.pokedexToInternal[pkmn.number] * bytesRequired;
      for (let j = 0; j < bytesRequired; j++) {
        this.rom[compatOffset + j] = this.getByteFromFlags(flags, j * 8 + 1);
      }
    }
  }

  // randomizeMoveTutorCompatibility inherited from AbstractRomHandler
  fullMoveTutorCompatibility(): void {}
  ensureMoveTutorCompatSanity(): void {}
  ensureMoveTutorEvolutionSanity(): void {}
  copyMoveTutorCompatibilityToCosmeticFormes(): void {}

  // -- Trainer names --

  canChangeTrainerText(): boolean { return true; }

  getTrainerNames(): string[] {
    const baseOffset = this.getValue("TrainerData");
    const amount = this.getValue("TrainerCount");
    const entryLen = this.getValue("TrainerEntrySize");
    const theTrainers: string[] = [];
    for (let i = 1; i < amount; i++) {
      theTrainers.push(readVariableLengthString(this.rom, baseOffset + i * entryLen + 4, this.tb));
    }
    return theTrainers;
  }

  setTrainerNames(trainerNames: string[]): void {
    const baseOffset = this.getValue("TrainerData");
    const amount = this.getValue("TrainerCount");
    const entryLen = this.getValue("TrainerEntrySize");
    const nameLen = this.getValue("TrainerNameLength");
    let idx = 0;
    for (let i = 1; i < amount; i++) {
      const newName = trainerNames[idx++];
      writeFixedLengthString(this.rom, newName, baseOffset + i * entryLen + 4, nameLen, this.d);
    }
  }

  trainerNameMode(): TrainerNameMode { return TrainerNameMode.MAX_LENGTH; }
  getTCNameLengthsByTrainer(): number[] { return []; }

  maxTrainerNameLength(): number {
    return this.getValue("TrainerNameLength") - 1;
  }

  // -- Trainer class names --

  getTrainerClassNames(): string[] {
    const baseOffset = this.getValue("TrainerClassNames");
    const amount = this.getValue("TrainerClassCount");
    const length = this.getValue("TrainerClassNameLength");
    const trainerClasses: string[] = [];
    for (let i = 0; i < amount; i++) {
      trainerClasses.push(readVariableLengthString(this.rom, baseOffset + i * length, this.tb));
    }
    return trainerClasses;
  }

  setTrainerClassNames(trainerClassNames: string[]): void {
    const baseOffset = this.getValue("TrainerClassNames");
    const amount = this.getValue("TrainerClassCount");
    const length = this.getValue("TrainerClassNameLength");
    for (let i = 0; i < amount; i++) {
      writeFixedLengthString(this.rom, trainerClassNames[i], baseOffset + i * length, length, this.d);
    }
  }

  maxTrainerClassNameLength(): number {
    return this.getValue("TrainerClassNameLength") - 1;
  }

  fixedTrainerClassNamesLength(): boolean { return false; }

  getDoublesTrainerClasses(): number[] {
    const doublesClasses = this.romEntryData.arrayEntries.get("DoublesTrainerClasses");
    if (!doublesClasses) return [];
    return [...doublesClasses];
  }

  // -- Items --

  getAllowedItems(): ItemList { return this.allowedItemsList; }
  getNonBadItems(): ItemList { return this.nonBadItemsList; }
  getEvolutionItems(): number[] { return Gen3Constants.evolutionItems.slice(); }
  getUniqueNoSellItems(): number[] { return []; }
  getRegularShopItems(): number[] { return Gen3Constants.getRegularShopItems(); }
  getOPShopItems(): number[] { return Gen3Constants.getOPShopItems(); }
  getItemNames(): string[] { return this.itemNamesArr; }

  // -- Field items --

  getRequiredFieldTMs(): number[] {
    if (this.romEntryData.romType === Gen3Constants.RomType_FRLG) {
      return Gen3Constants.frlgRequiredFieldTMs.slice();
    } else if (this.romEntryData.romType === Gen3Constants.RomType_Em) {
      return Gen3Constants.eRequiredFieldTMs.slice();
    } else {
      return Gen3Constants.rsRequiredFieldTMs.slice();
    }
  }
  getCurrentFieldTMs(): number[] {
    if (!this.mapLoadingDone) {
      this.preprocessMaps();
      this.mapLoadingDone = true;
    }
    const fieldTMs: number[] = [];
    for (const offset of this.itemOffs) {
      const itemHere = readWord(this.rom, offset);
      if (Gen3Constants.getAllowedItems().isTM(itemHere)) {
        const thisTM = itemHere - Gen3Constants.tmItemOffset + 1;
        if (!fieldTMs.includes(thisTM)) {
          fieldTMs.push(thisTM);
        }
      }
    }
    return fieldTMs;
  }

  setFieldTMs(fieldTMs: number[]): void {
    if (!this.mapLoadingDone) {
      this.preprocessMaps();
      this.mapLoadingDone = true;
    }
    let tmIdx = 0;
    const givenTMs = new Array(512).fill(0);
    for (const offset of this.itemOffs) {
      const itemHere = readWord(this.rom, offset);
      if (Gen3Constants.getAllowedItems().isTM(itemHere)) {
        if (givenTMs[itemHere] !== 0) {
          writeWord(this.rom, offset, givenTMs[itemHere]);
        } else {
          let tm = fieldTMs[tmIdx++];
          tm += Gen3Constants.tmItemOffset - 1;
          givenTMs[itemHere] = tm;
          writeWord(this.rom, offset, tm);
        }
      }
    }
  }

  getRegularFieldItems(): number[] {
    if (!this.mapLoadingDone) {
      this.preprocessMaps();
      this.mapLoadingDone = true;
    }
    const fieldItems: number[] = [];
    for (const offset of this.itemOffs) {
      const itemHere = readWord(this.rom, offset);
      if (Gen3Constants.getAllowedItems().isAllowed(itemHere) && !Gen3Constants.getAllowedItems().isTM(itemHere)) {
        fieldItems.push(itemHere);
      }
    }
    return fieldItems;
  }

  setRegularFieldItems(items: number[]): void {
    if (!this.mapLoadingDone) {
      this.preprocessMaps();
      this.mapLoadingDone = true;
    }
    let itemIdx = 0;
    for (const offset of this.itemOffs) {
      const itemHere = readWord(this.rom, offset);
      if (Gen3Constants.getAllowedItems().isAllowed(itemHere) && !Gen3Constants.getAllowedItems().isTM(itemHere)) {
        writeWord(this.rom, offset, items[itemIdx++]);
      }
    }
  }

  // -- Shops --

  hasShopRandomization(): boolean { return true; }

  getShopItems(): Map<number, Shop> {
    const shopNames = Gen3Constants.getShopNames(this.romEntryData.romType);
    const mainGameShops = this.romEntryData.arrayEntries.get("MainGameShops") || [];
    const skipShops = this.romEntryData.arrayEntries.get("SkipShops") || [];
    const shopItemsMap = new Map<number, Shop>();
    const shopItemOffsets = this.romEntryData.arrayEntries.get("ShopItemOffsets") || [];
    for (let i = 0; i < shopItemOffsets.length; i++) {
      if (!skipShops.includes(i)) {
        let offset = shopItemOffsets[i];
        const items: number[] = [];
        let val = readWord(this.rom, offset);
        while (val !== 0x0000) {
          items.push(val);
          offset += 2;
          val = readWord(this.rom, offset);
        }
        const shop = new Shop();
        shop.items = items;
        shop.name = shopNames[i] || "";
        shop.isMainGame = mainGameShops.includes(i);
        shopItemsMap.set(i, shop);
      }
    }
    return shopItemsMap;
  }

  setShopItems(shopItems: Map<number, Shop>): void {
    const shopItemOffsets = this.romEntryData.arrayEntries.get("ShopItemOffsets") || [];
    for (let i = 0; i < shopItemOffsets.length; i++) {
      const thisShop = shopItems.get(i);
      if (thisShop != null && thisShop.items != null) {
        let offset = shopItemOffsets[i];
        for (const item of thisShop.items) {
          writeWord(this.rom, offset, item);
          offset += 2;
        }
      }
    }
  }

  setShopPrices(): void {
    const itemDataOffset = this.romEntryData.getValue("ItemData");
    const entrySize = this.romEntryData.getValue("ItemEntrySize");
    const itemCount = this.romEntryData.getValue("ItemCount");
    for (let i = 1; i < itemCount; i++) {
      const price = Gen3Constants.balancedItemPrices.get(i);
      if (price != null) {
        const balancedPrice = price * 10;
        const offset = itemDataOffset + (i * entrySize) + 16;
        writeWord(this.rom, offset, balancedPrice);
      }
    }
  }

  // -- In-game trades --

  getIngameTrades(): IngameTrade[] {
    const trades: IngameTrade[] = [];
    const tableOffset = this.romEntryData.getValue("TradeTableOffset");
    const tableSize = this.romEntryData.getValue("TradeTableSize");
    const unused = this.romEntryData.arrayEntries.get("TradesUnused") || [];
    let unusedOffset = 0;
    const entryLength = 60;

    for (let entry = 0; entry < tableSize; entry++) {
      if (unusedOffset < unused.length && unused[unusedOffset] === entry) {
        unusedOffset++;
        continue;
      }
      const trade = new IngameTrade();
      const entryOffset = tableOffset + entry * entryLength;
      trade.nickname = readVariableLengthString(this.rom, entryOffset, this.tb);
      trade.givenPokemon = this.pokesInternal[readWord(this.rom, entryOffset + 12)]!;
      trade.ivs = new Array(6);
      for (let i = 0; i < 6; i++) {
        trade.ivs[i] = this.rom[entryOffset + 14 + i] & 0xFF;
      }
      trade.otId = readWord(this.rom, entryOffset + 24);
      trade.item = readWord(this.rom, entryOffset + 40);
      trade.otName = readVariableLengthString(this.rom, entryOffset + 43, this.tb);
      trade.requestedPokemon = this.pokesInternal[readWord(this.rom, entryOffset + 56)]!;
      trades.push(trade);
    }
    return trades;
  }

  setIngameTrades(trades: IngameTrade[]): void {
    const tableOffset = this.romEntryData.getValue("TradeTableOffset");
    const tableSize = this.romEntryData.getValue("TradeTableSize");
    const unused = this.romEntryData.arrayEntries.get("TradesUnused") || [];
    let unusedOffset = 0;
    const entryLength = 60;
    let tradeOffset = 0;

    for (let entry = 0; entry < tableSize; entry++) {
      if (unusedOffset < unused.length && unused[unusedOffset] === entry) {
        unusedOffset++;
        continue;
      }
      const trade = trades[tradeOffset++];
      const entryOff = tableOffset + entry * entryLength;
      writeFixedLengthString(this.rom, trade.nickname, entryOff, 12, this.d);
      writeWord(this.rom, entryOff + 12, this.pokedexToInternal[trade.givenPokemon.number]);
      for (let i = 0; i < 6; i++) {
        this.rom[entryOff + 14 + i] = trade.ivs[i];
      }
      writeWord(this.rom, entryOff + 24, trade.otId);
      writeWord(this.rom, entryOff + 40, trade.item);
      writeFixedLengthString(this.rom, trade.otName, entryOff + 43, 11, this.d);
      writeWord(this.rom, entryOff + 56, this.pokedexToInternal[trade.requestedPokemon.number]);
    }
  }

  // -- DVs / Evolutions --

  hasDVs(): boolean { return false; }

  removeImpossibleEvolutions(_settings: Settings): void {
    this.attemptObedienceEvolutionPatches();

    // no move evos, so no need to check for those
    for (const pkmn of this.pokes) {
      if (pkmn != null) {
        for (const evo of pkmn.evolutionsFrom) {
          // Not trades, but impossible without trading
          if (evo.type === EvolutionType.HAPPINESS_DAY && this.romEntryData.romType === Gen3Constants.RomType_FRLG) {
            // happiness day change to Sun Stone
            evo.type = EvolutionType.STONE;
            evo.extraInfo = Gen3Items.sunStone;
            this.addEvoUpdateStone(this.impossibleEvolutionUpdates, evo, this.itemNamesArr[Gen3Items.sunStone]);
          }
          if (evo.type === EvolutionType.HAPPINESS_NIGHT && this.romEntryData.romType === Gen3Constants.RomType_FRLG) {
            // happiness night change to Moon Stone
            evo.type = EvolutionType.STONE;
            evo.extraInfo = Gen3Items.moonStone;
            this.addEvoUpdateStone(this.impossibleEvolutionUpdates, evo, this.itemNamesArr[Gen3Items.moonStone]);
          }
          if (evo.type === EvolutionType.LEVEL_HIGH_BEAUTY && this.romEntryData.romType === Gen3Constants.RomType_FRLG) {
            // beauty change to level 35
            evo.type = EvolutionType.LEVEL;
            evo.extraInfo = 35;
            this.addEvoUpdateLevel(this.impossibleEvolutionUpdates, evo);
          }
          // Pure Trade
          if (evo.type === EvolutionType.TRADE) {
            // Haunter, Machoke, Kadabra, Graveler
            // Make it into level 37, we're done.
            evo.type = EvolutionType.LEVEL;
            evo.extraInfo = 37;
            this.addEvoUpdateLevel(this.impossibleEvolutionUpdates, evo);
          }
          // Trade w/ Held Item
          if (evo.type === EvolutionType.TRADE_ITEM) {
            if (evo.from.number === Species.poliwhirl) {
              // Poliwhirl: Lv 37
              evo.type = EvolutionType.LEVEL;
              evo.extraInfo = 37;
              this.addEvoUpdateLevel(this.impossibleEvolutionUpdates, evo);
            } else if (evo.from.number === Species.slowpoke) {
              // Slowpoke: Water Stone
              evo.type = EvolutionType.STONE;
              evo.extraInfo = Gen3Items.waterStone;
              this.addEvoUpdateStone(this.impossibleEvolutionUpdates, evo, this.itemNamesArr[Gen3Items.waterStone]);
            } else if (evo.from.number === Species.seadra) {
              // Seadra: Lv 40
              evo.type = EvolutionType.LEVEL;
              evo.extraInfo = 40;
              this.addEvoUpdateLevel(this.impossibleEvolutionUpdates, evo);
            } else if (evo.from.number === Species.clamperl
                && evo.extraInfo === Gen3Items.deepSeaTooth) {
              // Clamperl -> Huntail: Lv30
              evo.type = EvolutionType.LEVEL;
              evo.extraInfo = 30;
              this.addEvoUpdateLevel(this.impossibleEvolutionUpdates, evo);
            } else if (evo.from.number === Species.clamperl
                && evo.extraInfo === Gen3Items.deepSeaScale) {
              // Clamperl -> Gorebyss: Water Stone
              evo.type = EvolutionType.STONE;
              evo.extraInfo = Gen3Items.waterStone;
              this.addEvoUpdateStone(this.impossibleEvolutionUpdates, evo, this.itemNamesArr[Gen3Items.waterStone]);
            } else {
              // Onix, Scyther or Porygon: Lv30
              evo.type = EvolutionType.LEVEL;
              evo.extraInfo = 30;
              this.addEvoUpdateLevel(this.impossibleEvolutionUpdates, evo);
            }
          }
        }
      }
    }
  }

  makeEvolutionsEasier(_settings: Settings): void {
    // Reduce the amount of happiness required to evolve.
    const offset = find(this.rom, Gen3Constants.friendshipValueForEvoLocator);
    if (offset > 0) {
      // Amount of required happiness for HAPPINESS evolutions.
      if ((this.rom[offset] & 0xFF) === 219) {
        this.rom[offset] = 159;
      }
      // FRLG doesn't have code to handle time-based evolutions.
      if (this.romEntryData.romType !== Gen3Constants.RomType_FRLG) {
        // Amount of required happiness for HAPPINESS_DAY evolutions.
        if ((this.rom[offset + 38] & 0xFF) === 219) {
          this.rom[offset + 38] = 159;
        }
        // Amount of required happiness for HAPPINESS_NIGHT evolutions.
        if ((this.rom[offset + 66] & 0xFF) === 219) {
          this.rom[offset + 66] = 159;
        }
      }
    }
  }

  removeTimeBasedEvolutions(): void {
    for (const pkmn of this.pokes) {
      if (pkmn != null) {
        for (const evol of pkmn.evolutionsFrom) {
          // In Gen 3, only Eevee has a time-based evolution.
          if (evol.type === EvolutionType.HAPPINESS_DAY) {
            // Eevee: Make sun stone => Espeon
            evol.type = EvolutionType.STONE;
            evol.extraInfo = Gen3Items.sunStone;
            this.addEvoUpdateStone(this.timeBasedEvolutionUpdates, evol, this.itemNamesArr[evol.extraInfo]);
          } else if (evol.type === EvolutionType.HAPPINESS_NIGHT) {
            // Eevee: Make moon stone => Umbreon
            evol.type = EvolutionType.STONE;
            evol.extraInfo = Gen3Items.moonStone;
            this.addEvoUpdateStone(this.timeBasedEvolutionUpdates, evol, this.itemNamesArr[evol.extraInfo]);
          }
        }
      }
    }
  }

  // -- Field moves --

  getFieldMoves(): number[] {
    if (this.romEntryData.romType === Gen3Constants.RomType_FRLG) {
      return Gen3Constants.frlgFieldMoves.slice();
    } else {
      return Gen3Constants.rseFieldMoves.slice();
    }
  }
  getEarlyRequiredHMMoves(): number[] {
    if (this.romEntryData.romType === Gen3Constants.RomType_FRLG) {
      return Gen3Constants.frlgEarlyRequiredHMMoves.slice();
    } else {
      return Gen3Constants.rseEarlyRequiredHMMoves.slice();
    }
  }

  // -- Misc --

  getROMName(): string { return this.romEntryData.name; }
  getROMCode(): string { return this.romEntryData.romCode; }
  getSupportLevel(): string {
    return this.getValue('StaticPokemonSupport') > 0
      ? 'Complete'
      : 'No Static Pokemon';
  }
  getDefaultExtension(): string { return 'gba'; }
  generationOfPokemon(): number { return 3; }
  internalStringLength(s: string): number {
    return translateString(s, this.d).length;
  }
  randomizeIntroPokemon(): void {
    if (this.romEntryData.romType === Gen3Constants.RomType_FRLG) {
      // FRLG: intro sprites, first 255 only due to size
      let introPk: Pokemon | null = null;
      for (let attempt = 0; attempt < 100; attempt++) {
        const pk = this.randomPokemon();
        if (pk.number <= 255) { introPk = pk; break; }
      }
      if (introPk == null) return;
      const introPokemon = this.pokedexToInternal[introPk.number];
      const frontSprites = this.romEntryData.getValue("FrontSprites");
      const palettes = this.romEntryData.getValue("PokemonPalettes");

      this.rom[this.romEntryData.getValue("IntroCryOffset")] = introPokemon & 0xFF;
      this.rom[this.romEntryData.getValue("IntroOtherOffset")] = introPokemon & 0xFF;

      const spriteBase = this.romEntryData.getValue("IntroSpriteOffset");
      writePointer(this.rom, spriteBase, frontSprites + introPokemon * 8);
      writePointer(this.rom, spriteBase + 4, palettes + introPokemon * 8);
    } else if (this.romEntryData.romType === Gen3Constants.RomType_Ruby ||
               this.romEntryData.romType === Gen3Constants.RomType_Sapp) {
      // RS: intro sprites, any pokemon in the range 0-510 except bulbasaur
      let introPokemon = this.pokedexToInternal[this.randomPokemon().number];
      while (introPokemon === 1 || introPokemon > 510) {
        introPokemon = this.pokedexToInternal[this.randomPokemon().number];
      }
      const frontSprites = this.romEntryData.getValue("PokemonFrontSprites");
      const palettes = this.romEntryData.getValue("PokemonNormalPalettes");
      const cryCommand = this.romEntryData.getValue("IntroCryOffset");
      const otherCommand = this.romEntryData.getValue("IntroOtherOffset");

      if (introPokemon > 255) {
        this.rom[cryCommand] = 0xFF;
        this.rom[cryCommand + 1] = Gen3Constants.gbaSetRxOpcode | Gen3Constants.gbaR0;
        this.rom[cryCommand + 2] = (introPokemon - 0xFF) & 0xFF;
        this.rom[cryCommand + 3] = Gen3Constants.gbaAddRxOpcode | Gen3Constants.gbaR0;
        this.rom[otherCommand] = 0xFF;
        this.rom[otherCommand + 1] = Gen3Constants.gbaSetRxOpcode | Gen3Constants.gbaR4;
        this.rom[otherCommand + 2] = (introPokemon - 0xFF) & 0xFF;
        this.rom[otherCommand + 3] = Gen3Constants.gbaAddRxOpcode | Gen3Constants.gbaR4;
      } else {
        this.rom[cryCommand] = introPokemon & 0xFF;
        this.rom[cryCommand + 1] = Gen3Constants.gbaSetRxOpcode | Gen3Constants.gbaR0;
        writeWord(this.rom, cryCommand + 2, Gen3Constants.gbaNopOpcode);
        this.rom[otherCommand] = introPokemon & 0xFF;
        this.rom[otherCommand + 1] = Gen3Constants.gbaSetRxOpcode | Gen3Constants.gbaR4;
        writeWord(this.rom, otherCommand + 2, Gen3Constants.gbaNopOpcode);
      }

      writePointer(this.rom, this.romEntryData.getValue("IntroSpriteOffset"), frontSprites + introPokemon * 8);
      writePointer(this.rom, this.romEntryData.getValue("IntroPaletteOffset"), palettes + introPokemon * 8);
    } else {
      // Emerald, intro sprite: any Pokemon
      const introPokemon = this.pokedexToInternal[this.randomPokemon().number];
      writeWord(this.rom, this.romEntryData.getValue("IntroSpriteOffset"), introPokemon);
      writeWord(this.rom, this.romEntryData.getValue("IntroCryOffset"), introPokemon);
    }
  }

  getMascotImage(): Uint8Array | null { return null; }
  isRomValid(): boolean { return true; }
  isEffectivenessUpdated(): boolean { return this.effectivenessUpdated; }

  // -- Misc tweaks --

  miscTweaksAvailable(): number {
    let available = MiscTweak.LOWER_CASE_POKEMON_NAMES.getValue();
    available |= MiscTweak.NATIONAL_DEX_AT_START.getValue();
    available |= MiscTweak.UPDATE_TYPE_EFFECTIVENESS.getValue();
    if (this.getValue("RunIndoorsTweakOffset") > 0) {
      available |= MiscTweak.RUNNING_SHOES_INDOORS.getValue();
    }
    if (this.getValue("TextSpeedValuesOffset") > 0 || this.romEntryData.codeTweaks.get("InstantTextTweak") != null) {
      available |= MiscTweak.FASTEST_TEXT.getValue();
    }
    if (this.getValue("CatchingTutorialOpponentMonOffset") > 0
        || this.getValue("CatchingTutorialPlayerMonOffset") > 0) {
      available |= MiscTweak.RANDOMIZE_CATCHING_TUTORIAL.getValue();
    }
    if (this.getValue("PCPotionOffset") !== 0) {
      available |= MiscTweak.RANDOMIZE_PC_POTION.getValue();
    }
    available |= MiscTweak.BAN_LUCKY_EGG.getValue();
    available |= MiscTweak.RUN_WITHOUT_RUNNING_SHOES.getValue();
    if (this.romEntryData.romType === Gen3Constants.RomType_FRLG) {
      available |= MiscTweak.BALANCE_STATIC_LEVELS.getValue();
    }
    return available;
  }
  applyMiscTweak(tweak: { value: number }): void {
    if (tweak.value === MiscTweak.RUNNING_SHOES_INDOORS.value) { this.applyRunningShoesIndoorsPatch(); }
    else if (tweak.value === MiscTweak.FASTEST_TEXT.value) { this.applyFastestTextPatch(); }
    else if (tweak.value === MiscTweak.LOWER_CASE_POKEMON_NAMES.value) { this.applyCamelCaseNames(); }
    else if (tweak.value === MiscTweak.NATIONAL_DEX_AT_START.value) { this.patchForNationalDex(); }
    else if (tweak.value === MiscTweak.RANDOMIZE_CATCHING_TUTORIAL.value) { this.randomizeCatchingTutorial(); }
    else if (tweak.value === MiscTweak.BAN_LUCKY_EGG.value) { this.allowedItemsList.banSingles(Gen3Items.luckyEgg); this.nonBadItemsList.banSingles(Gen3Items.luckyEgg); }
    else if (tweak.value === MiscTweak.RANDOMIZE_PC_POTION.value) { this.randomizePCPotion(); }
    else if (tweak.value === MiscTweak.RUN_WITHOUT_RUNNING_SHOES.value) { this.applyRunWithoutRunningShoesPatch(); }
    else if (tweak.value === MiscTweak.BALANCE_STATIC_LEVELS.value) { for (const off of (this.romEntryData.arrayEntries.get("FossilLevelOffsets") || [])) { writeWord(this.rom, off, 30); } }
    else if (tweak.value === MiscTweak.UPDATE_TYPE_EFFECTIVENESS.value) { this.updateTypeEffectiveness(); }
  }

  // -- Diagnostics / overrides --

  printRomDiagnostics(logStream: LogStream): void {
    logStream.println('File name: ' + this.loadedFilename());
    logStream.println('ROM name: ' + this.getROMName());
    logStream.println('ROM code: ' + this.getROMCode());
    const romType = this.romEntryData.romType;
    const typeStr = romType === Gen3Constants.RomType_Ruby ? 'Ruby' :
                    romType === Gen3Constants.RomType_Sapp ? 'Sapphire' :
                    romType === Gen3Constants.RomType_FRLG ? 'FireRed/LeafGreen' :
                    romType === Gen3Constants.RomType_Em ? 'Emerald' : 'Unknown';
    logStream.println('ROM type: ' + typeStr);
    logStream.println('Entry: ' + this.romEntryData.name);
  }

  hasPhysicalSpecialSplit(): boolean { return false; }
  hasRivalFinalBattle(): boolean { return this.romEntryData.romType === Gen3Constants.RomType_FRLG; }

  getAbilityNames(): string[] { return this.abilityNamesArr; }

  abilityName(n: number): string {
    if (n >= 0 && n < this.abilityNamesArr.length) {
      return this.abilityNamesArr[n];
    }
    return "";
  }

  // ---- Private helpers for starters ----

  private writeFRLGStarterText(foundTexts: number[], pkmn: Pokemon, oakText: string): void {
    if (foundTexts.length > 0) {
      const offset = foundTexts[0];
      const pokeName = pkmn.name;
      let pokeType = pkmn.primaryType == null ? "???" : Type[pkmn.primaryType];
      if (pokeType === "NORMAL" && pkmn.secondaryType != null) {
        pokeType = Type[pkmn.secondaryType];
      }
      const speech = pokeName + " is your choice.\\pSo, \\v01, " + oakText + pokeType + " POK\u00e9MON " + pokeName + "?";
      const strLen = lengthOfStringAt(this.rom, offset);
      writeFixedLengthString(this.rom, speech, offset, strLen + 1, this.d);
    }
  }

  private readWildArea(offset: number, numOfEntries: number, setName: string): EncounterSet {
    const thisSet = new EncounterSet();
    thisSet.rate = this.rom[offset];
    thisSet.displayName = setName;
    // Grab the *real* pointer to data
    const dataOffset = readPointer(this.rom, offset + 4);
    // Read the entries
    for (let i = 0; i < numOfEntries; i++) {
      // min, max, species, species
      const enc = new Encounter();
      enc.level = this.rom[dataOffset + i * 4];
      enc.maxLevel = this.rom[dataOffset + i * 4 + 1];
      enc.pokemon = this.pokesInternal[readWord(this.rom, dataOffset + i * 4 + 2)]!;
      thisSet.encounters.push(enc);
    }
    return thisSet;
  }

  private writeWildArea(offset: number, numOfEntries: number, encounters: EncounterSet): void {
    // Grab the *real* pointer to data
    const dataOffset = readPointer(this.rom, offset + 4);
    // Write the entries
    for (let i = 0; i < numOfEntries; i++) {
      const enc = encounters.encounters[i];
      // min, max, species, species
      const levels = enc.level | (enc.maxLevel << 8);
      writeWord(this.rom, dataOffset + i * 4, levels);
      writeWord(this.rom, dataOffset + i * 4 + 2, this.pokedexToInternal[enc.pokemon!.number]);
    }
  }

  private hasBattleTrappingAbility(pokemon: Pokemon | null): boolean {
    return pokemon !== null
        && (GlobalConstants.battleTrappingAbilities.includes(pokemon.ability1)
            || GlobalConstants.battleTrappingAbilities.includes(pokemon.ability2));
  }

  private determineMapBankSizes(): void {
    const mbpsOffset = this.romEntryData.getValue("MapHeaders");
    if (mbpsOffset === undefined || mbpsOffset === 0) return;
    const mapBankOffsets: number[] = [];

    let offset = mbpsOffset;

    // Find map banks
    while (true) {
      let valid = true;
      for (const mbOffset of mapBankOffsets) {
        if (mbpsOffset < mbOffset && offset >= mbOffset) {
          valid = false;
          break;
        }
      }
      if (!valid) break;
      const newMBOffset = readPointer(this.rom, offset);
      if (newMBOffset < 0 || newMBOffset >= this.rom.length) break;
      mapBankOffsets.push(newMBOffset);
      offset += 4;
    }

    const bankCount = mapBankOffsets.length;
    const bankMapCounts: number[] = new Array(bankCount);
    for (let bank = 0; bank < bankCount; bank++) {
      const baseBankOffset = mapBankOffsets[bank];
      let count = 0;
      offset = baseBankOffset;
      while (true) {
        let valid = true;
        for (const mbOffset of mapBankOffsets) {
          if (baseBankOffset < mbOffset && offset >= mbOffset) {
            valid = false;
            break;
          }
        }
        if (!valid) break;
        if (baseBankOffset < mbpsOffset && offset >= mbpsOffset) break;
        const newMapOffset = readPointer(this.rom, offset);
        if (newMapOffset < 0 || newMapOffset >= this.rom.length) break;
        count++;
        offset += 4;
      }
      bankMapCounts[bank] = count;
    }

    this.romEntryData.entries.set("MapBankCount", bankCount);
    this.romEntryData.arrayEntries.set("MapBankSizes", bankMapCounts);
  }

  private preprocessMaps(): void {
    this.itemOffs = [];
    const bankCount = this.romEntryData.getValue("MapBankCount");
    const bankMapCounts = this.romEntryData.arrayEntries.get("MapBankSizes")!;
    const itemBall = this.romEntryData.getValue("ItemBallPic");
    const mbpsOffset = this.romEntryData.getValue("MapHeaders");
    const mapLabels = this.romEntryData.getValue("MapLabels");
    const mapLabelsM = new Map<number, string>();
    this.mapNames = new Array(bankCount);
    for (let bank = 0; bank < bankCount; bank++) {
      const bankOffset = readPointer(this.rom, mbpsOffset + bank * 4);
      this.mapNames[bank] = new Array(bankMapCounts[bank]);
      for (let map = 0; map < bankMapCounts[bank]; map++) {
        const mhOffset = readPointer(this.rom, bankOffset + map * 4);

        // map name
        const mapLabel = this.rom[mhOffset + 0x14] & 0xFF;
        if (mapLabelsM.has(mapLabel)) {
          this.mapNames[bank][map] = mapLabelsM.get(mapLabel)!;
        } else {
          if (this.romEntryData.romType === Gen3Constants.RomType_FRLG) {
            this.mapNames[bank][map] = readVariableLengthString(
              this.rom,
              readPointer(this.rom, mapLabels + (mapLabel - Gen3Constants.frlgMapLabelsStart) * 4),
              this.tb
            );
          } else {
            this.mapNames[bank][map] = readVariableLengthString(
              this.rom,
              readPointer(this.rom, mapLabels + mapLabel * 8 + 4),
              this.tb
            );
          }
          mapLabelsM.set(mapLabel, this.mapNames[bank][map]);
        }

        // events - item balls and TM/MT text offsets
        const eventOffset = readPointer(this.rom, mhOffset + 4);
        if (eventOffset >= 0 && eventOffset < this.rom.length) {
          const pCount = this.rom[eventOffset] & 0xFF;
          const spCount = this.rom[eventOffset + 3] & 0xFF;

          if (pCount > 0) {
            const peopleOffset = readPointer(this.rom, eventOffset + 4);
            for (let p = 0; p < pCount; p++) {
              const pSprite = this.rom[peopleOffset + p * 24 + 1];
              if (pSprite === itemBall && readPointer(this.rom, peopleOffset + p * 24 + 16) >= 0) {
                // Get script and look inside
                const scriptOffset = readPointer(this.rom, peopleOffset + p * 24 + 16);
                if (this.rom[scriptOffset] === 0x1A && this.rom[scriptOffset + 1] === 0x00
                    && (this.rom[scriptOffset + 2] & 0xFF) === 0x80 && this.rom[scriptOffset + 5] === 0x1A
                    && this.rom[scriptOffset + 6] === 0x01 && (this.rom[scriptOffset + 7] & 0xFF) === 0x80
                    && this.rom[scriptOffset + 10] === 0x09
                    && (this.rom[scriptOffset + 11] === 0x00 || this.rom[scriptOffset + 11] === 0x01)) {
                  // item ball script
                  this.itemOffs.push(scriptOffset + 3);
                }
              }
            }
            // TM Text?
            for (const tte of this.romEntryData.tmmtTexts) {
              if (tte.mapBank === bank && tte.mapNumber === map) {
                let scriptOffset = readPointer(this.rom, peopleOffset + (tte.personNum - 1) * 24 + 16);
                if (scriptOffset >= 0) {
                  if (this.romEntryData.romType === Gen3Constants.RomType_FRLG && tte.isMoveTutor
                      && (tte.number === 5 || (tte.number >= 8 && tte.number <= 11))) {
                    scriptOffset = readPointer(this.rom, scriptOffset + 1);
                  } else if (this.romEntryData.romType === Gen3Constants.RomType_FRLG && tte.isMoveTutor
                      && tte.number === 7) {
                    scriptOffset = readPointer(this.rom, scriptOffset + 0x1F);
                  }
                  const lookAt = scriptOffset + tte.offsetInScript;
                  // make sure this actually looks like a text pointer
                  if (lookAt >= 0 && lookAt < this.rom.length - 2) {
                    if (this.rom[lookAt + 3] === 0x08 || this.rom[lookAt + 3] === 0x09) {
                      tte.actualOffset = lookAt;
                    }
                  }
                }
              }
            }
          }

          if (spCount > 0) {
            const signpostsOffset = readPointer(this.rom, eventOffset + 16);
            for (let sp = 0; sp < spCount; sp++) {
              const spType = this.rom[signpostsOffset + sp * 12 + 5];
              if (spType >= 5 && spType <= 7) {
                // hidden item
                const itemHere = readWord(this.rom, signpostsOffset + sp * 12 + 8);
                if (itemHere !== 0) {
                  // itemid 0 is coins
                  this.itemOffs.push(signpostsOffset + sp * 12 + 8);
                }
              }
            }
          }
        }
      }
    }
  }

  private randomPokemonLimited(maxValue: number, blockNonMales: boolean): Pokemon | null {
    this.checkPokemonRestrictions();
    const validPokemon: Pokemon[] = [];
    for (const pk of this.mainPokemonList) {
      if (this.pokedexToInternal[pk.number] <= maxValue && (!blockNonMales || pk.genderRatio <= 0xFD)) {
        validPokemon.push(pk);
      }
    }
    if (validPokemon.length === 0) {
      return null;
    }
    return validPokemon[this.random.nextInt(validPokemon.length)];
  }

  private applyCamelCaseNames(): void {
    const pokemonList = this.getPokemon();
    for (const pkmn of pokemonList) {
      if (pkmn == null) continue;
      pkmn.name = this.camelCase(pkmn.name);
    }
  }

  private camelCase(original: string): string {
    const chars = original.split('');
    let afterFirst = false;
    for (let j = 0; j < chars.length; j++) {
      if (chars[j] >= 'A' && chars[j] <= 'Z') {
        if (afterFirst) { chars[j] = chars[j].toLowerCase(); }
        afterFirst = true;
      } else if (chars[j] === ' ' || chars[j] === '-') { afterFirst = false; }
    }
    return chars.join('');
  }

  private applyRunningShoesIndoorsPatch(): void {
    if (this.getValue("RunIndoorsTweakOffset") !== 0) {
      this.rom[this.getValue("RunIndoorsTweakOffset")] = 0x00;
    }
  }

  private applyFastestTextPatch(): void {
    if (this.romEntryData.codeTweaks.get("InstantTextTweak") != null) {
      FileFunctions.applyPatch(this.rom, this.romEntryData.codeTweaks.get("InstantTextTweak")!);
    } else if (this.getValue("TextSpeedValuesOffset") > 0) {
      const tsvOffset = this.getValue("TextSpeedValuesOffset");
      this.rom[tsvOffset] = 4;     // slow = medium
      this.rom[tsvOffset + 1] = 1; // medium = fast
      this.rom[tsvOffset + 2] = 0; // fast = instant
    }
  }

  private randomizePCPotion(): void {
    if (this.getValue("PCPotionOffset") !== 0) {
      writeWord(this.rom, this.getValue("PCPotionOffset"), this.getNonBadItems().randomNonTM(() => this.random.nextDouble()));
    }
  }

  private applyRunWithoutRunningShoesPatch(): void {
    const prefix = Gen3Constants.getRunningShoesCheckPrefix(this.romEntryData.romType);
    const offset = find(this.rom, prefix);
    if (offset > 0) {
      // The prefix starts 0x12 bytes from what we want to patch
      writeWord(this.rom, offset + 0x12, 0);
    }
  }

  private randomizeCatchingTutorial(): void {
    if (this.getValue("CatchingTutorialOpponentMonOffset") > 0) {
      const oppOffset = this.getValue("CatchingTutorialOpponentMonOffset");
      if (this.romEntryData.romType === Gen3Constants.RomType_FRLG) {
        const opponent = this.randomPokemonLimited(255, true);
        if (opponent != null) {
          const oppValue = this.pokedexToInternal[opponent.number];
          this.rom[oppOffset] = oppValue & 0xFF;
          this.rom[oppOffset + 1] = Gen3Constants.gbaSetRxOpcode | Gen3Constants.gbaR1;
        }
      } else {
        const opponent = this.randomPokemonLimited(510, true);
        if (opponent != null) {
          const oppValue = this.pokedexToInternal[opponent.number];
          if (oppValue > 255) {
            this.rom[oppOffset] = 0xFF;
            this.rom[oppOffset + 1] = Gen3Constants.gbaSetRxOpcode | Gen3Constants.gbaR1;
            this.rom[oppOffset + 2] = (oppValue - 0xFF) & 0xFF;
            this.rom[oppOffset + 3] = Gen3Constants.gbaAddRxOpcode | Gen3Constants.gbaR1;
          } else {
            this.rom[oppOffset] = oppValue & 0xFF;
            this.rom[oppOffset + 1] = Gen3Constants.gbaSetRxOpcode | Gen3Constants.gbaR1;
            writeWord(this.rom, oppOffset + 2, Gen3Constants.gbaNopOpcode);
          }
        }
      }
    }

    if (this.getValue("CatchingTutorialPlayerMonOffset") > 0) {
      const playerOffset = this.getValue("CatchingTutorialPlayerMonOffset");
      const playerMon = this.randomPokemonLimited(510, false);
      if (playerMon != null) {
        const plyValue = this.pokedexToInternal[playerMon.number];
        if (plyValue > 255) {
          this.rom[playerOffset] = 0xFF;
          this.rom[playerOffset + 1] = Gen3Constants.gbaSetRxOpcode | Gen3Constants.gbaR1;
          this.rom[playerOffset + 2] = (plyValue - 0xFF) & 0xFF;
          this.rom[playerOffset + 3] = Gen3Constants.gbaAddRxOpcode | Gen3Constants.gbaR1;
        } else {
          this.rom[playerOffset] = plyValue & 0xFF;
          this.rom[playerOffset + 1] = Gen3Constants.gbaSetRxOpcode | Gen3Constants.gbaR1;
          writeWord(this.rom, playerOffset + 2, Gen3Constants.gbaNopOpcode);
        }
      }
    }
  }

  private pointerToHexString(pointer: number): string {
    const hex = ((pointer + 0x08000000) >>> 0).toString(16).toUpperCase().padStart(8, '0');
    return hex.charAt(6) + hex.charAt(7) + hex.charAt(4) + hex.charAt(5) +
           hex.charAt(2) + hex.charAt(3) + hex.charAt(0) + hex.charAt(1);
  }

  private patchForNationalDex(): void {
    this.log("--Patching for National Dex at Start of Game--");
    const fso = this.getValue("FreeSpace");
    if (this.romEntryData.romType === Gen3Constants.RomType_Ruby || this.romEntryData.romType === Gen3Constants.RomType_Sapp) {
      const pkDexOffset = find(this.rom, Gen3Constants.rsPokedexScriptIdentifier);
      if (pkDexOffset < 0) { this.log("Patch unsuccessful."); this.logBlankLine(); return; }
      const textPointer = readPointer(this.rom, pkDexOffset - 4);
      const realScriptLocation = pkDexOffset - 8;
      const pointerLocToScript = find(this.rom, this.pointerToHexString(realScriptLocation));
      if (pointerLocToScript < 0) { this.log("Patch unsuccessful."); this.logBlankLine(); return; }
      const writeSpace = RomFunctions.freeSpaceFinder(this.rom, Gen3Constants.freeSpaceByte, 44, fso);
      if (writeSpace < fso) { this.log("Patch unsuccessful."); this.logBlankLine(); return; }
      writePointer(this.rom, pointerLocToScript, writeSpace);
      writeHexString(this.rom, Gen3Constants.rsNatDexScriptPart1, writeSpace);
      writePointer(this.rom, writeSpace + 4, textPointer);
      writeHexString(this.rom, Gen3Constants.rsNatDexScriptPart2, writeSpace + 8);
    } else if (this.romEntryData.romType === Gen3Constants.RomType_FRLG) {
      const pkDexOffset = find(this.rom, Gen3Constants.frlgPokedexScriptIdentifier);
      if (pkDexOffset < 0) { this.log("Patch unsuccessful."); this.logBlankLine(); return; }
      const writeSpace = RomFunctions.freeSpaceFinder(this.rom, Gen3Constants.freeSpaceByte, 10, fso);
      if (writeSpace < fso) { this.log("Patch unsuccessful."); this.logBlankLine(); return; }
      this.rom[pkDexOffset] = 4;
      writePointer(this.rom, pkDexOffset + 1, writeSpace);
      this.rom[pkDexOffset + 5] = 0; // NOP
      writeHexString(this.rom, Gen3Constants.frlgNatDexScript, writeSpace);
      // Fix people using the national dex flag
      const ndexChecks = findMultiple(this.rom, Gen3Constants.frlgNatDexFlagChecker);
      for (const ndexCheckOffset of ndexChecks) {
        writeHexString(this.rom, Gen3Constants.frlgE4FlagChecker, ndexCheckOffset);
      }
      // Fix oak in his lab
      const oakLabCheckOffs = find(this.rom, Gen3Constants.frlgOaksLabKantoDexChecker);
      if (oakLabCheckOffs > 0) {
        writeHexString(this.rom, Gen3Constants.frlgOaksLabFix, oakLabCheckOffs);
      }
      // Fix oak outside your house
      const oakHouseCheckOffs = find(this.rom, Gen3Constants.frlgOakOutsideHouseCheck);
      if (oakHouseCheckOffs > 0) {
        writeHexString(this.rom, Gen3Constants.frlgOakOutsideHouseFix, oakHouseCheckOffs);
      }
      // Fix Oak's aides
      const oakAideCheckOffs = find(this.rom, Gen3Constants.frlgOakAideCheckPrefix);
      if (oakAideCheckOffs > 0) {
        const aidePrefixLen = Gen3Constants.frlgOakAideCheckPrefix.length / 2;
        this.rom[oakAideCheckOffs + aidePrefixLen + 1] = 0xE0;
      }
    } else {
      // Emerald
      const pkDexOffset = find(this.rom, Gen3Constants.ePokedexScriptIdentifier);
      if (pkDexOffset < 0) { this.log("Patch unsuccessful."); this.logBlankLine(); return; }
      const textPointer = readPointer(this.rom, pkDexOffset - 4);
      const realScriptLocation = pkDexOffset - 8;
      const pointerLocToScript = find(this.rom, this.pointerToHexString(realScriptLocation));
      if (pointerLocToScript < 0) { this.log("Patch unsuccessful."); this.logBlankLine(); return; }
      const writeSpace = RomFunctions.freeSpaceFinder(this.rom, Gen3Constants.freeSpaceByte, 27, fso);
      if (writeSpace < fso) { this.log("Patch unsuccessful."); this.logBlankLine(); return; }
      writePointer(this.rom, pointerLocToScript, writeSpace);
      writeHexString(this.rom, Gen3Constants.eNatDexScriptPart1, writeSpace);
      writePointer(this.rom, writeSpace + 4, textPointer);
      writeHexString(this.rom, Gen3Constants.eNatDexScriptPart2, writeSpace + 8);
    }
    this.log("Patch successful!");
    this.logBlankLine();
  }

  private updateTypeEffectiveness(): void {
    const table = this.readTypeEffectivenessTable();
    this.log("--Updating Type Effectiveness--");
    for (const r of table) {
      if (r.attacker === 'GHOST' && r.defender === 'STEEL') {
        r.effectiveness = Effectiveness.NEUTRAL;
        this.log("Replaced: Ghost not very effective vs Steel => Ghost neutral vs Steel");
      } else if (r.attacker === 'DARK' && r.defender === 'STEEL') {
        r.effectiveness = Effectiveness.NEUTRAL;
        this.log("Replaced: Dark not very effective vs Steel => Dark neutral vs Steel");
      }
    }
    this.logBlankLine();
    this.writeTypeEffectivenessTable(table);
    this.effectivenessUpdated = true;
  }

  private readTypeEffectivenessTable(): { attacker: string; defender: string; effectiveness: Effectiveness }[] {
    const result: { attacker: string; defender: string; effectiveness: Effectiveness }[] = [];
    let off = this.getValue("TypeEffectivenessOffset");
    let at = this.rom[off] & 0xFF;
    while (at !== 0xFE) {
      const dt = this.rom[off + 1] & 0xFF;
      const ei = this.rom[off + 2] & 0xFF;
      const attacking = Gen3Constants.typeTable[at];
      const defending = Gen3Constants.typeTable[dt];
      let eff: Effectiveness | null = null;
      switch (ei) {
        case 20: eff = Effectiveness.DOUBLE; break;
        case 10: eff = Effectiveness.NEUTRAL; break;
        case 5: eff = Effectiveness.HALF; break;
        case 0: eff = Effectiveness.ZERO; break;
      }
      if (eff != null && attacking != null && defending != null) {
        result.push({ attacker: attacking, defender: defending, effectiveness: eff });
      }
      off += 3;
      at = this.rom[off] & 0xFF;
    }
    return result;
  }

  private writeTypeEffectivenessTable(table: { attacker: string; defender: string; effectiveness: Effectiveness }[]): void {
    let off = this.getValue("TypeEffectivenessOffset");
    for (const r of table) {
      this.rom[off] = Gen3Constants.typeToByte(r.attacker);
      this.rom[off + 1] = Gen3Constants.typeToByte(r.defender);
      let ei = 0;
      switch (r.effectiveness) {
        case Effectiveness.DOUBLE: ei = 20; break;
        case Effectiveness.NEUTRAL: ei = 10; break;
        case Effectiveness.HALF: ei = 5; break;
        case Effectiveness.ZERO: ei = 0; break;
      }
      this.rom[off + 2] = ei;
      off += 3;
    }
  }

  private attemptObedienceEvolutionPatches(): void {
    if (this.havePatchedObedience) {
      return;
    }

    this.havePatchedObedience = true;

    // Look for the deoxys obedience check
    const deoxysObOffset = find(this.rom, Gen3Constants.deoxysObeyCode);
    if (deoxysObOffset > 0) {
      // Replace MOVS R1, 0x19A with MOVS R1, 0x0 (twice, as 2-byte instruction)
      this.rom[deoxysObOffset] = 0x00;
      this.rom[deoxysObOffset + 1] = Gen3Constants.gbaSetRxOpcode | Gen3Constants.gbaR1;
      this.rom[deoxysObOffset + 2] = 0x00;
      this.rom[deoxysObOffset + 3] = Gen3Constants.gbaSetRxOpcode | Gen3Constants.gbaR1;

      // Look for the mew check too... it's 0x16 ahead
      if (readWord(this.rom, deoxysObOffset + Gen3Constants.mewObeyOffsetFromDeoxysObey) ===
          (((Gen3Constants.gbaCmpRxOpcode | Gen3Constants.gbaR0) << 8) | Species.mew)) {
        // Change CMP R0, 0x97 to CMP R0, 0x0
        writeWord(this.rom, deoxysObOffset + Gen3Constants.mewObeyOffsetFromDeoxysObey,
          (((Gen3Constants.gbaCmpRxOpcode | Gen3Constants.gbaR0) << 8) | 0));
      }
    }

    // Look for evolution patches in FRLG
    if (this.romEntryData.romType === Gen3Constants.RomType_FRLG) {
      const evoJumpOffset = find(this.rom, Gen3Constants.levelEvoKantoDexCheckCode);
      if (evoJumpOffset > 0) {
        writeWord(this.rom, evoJumpOffset, Gen3Constants.gbaNopOpcode);
        writeWord(this.rom, evoJumpOffset + 2,
          ((Gen3Constants.gbaUnconditionalJumpOpcode << 8) | Gen3Constants.levelEvoKantoDexJumpAmount));
      }

      const stoneJumpOffset = find(this.rom, Gen3Constants.stoneEvoKantoDexCheckCode);
      if (stoneJumpOffset > 0) {
        writeWord(this.rom, stoneJumpOffset, Gen3Constants.gbaNopOpcode);
        writeWord(this.rom, stoneJumpOffset + 2,
          ((Gen3Constants.gbaUnconditionalJumpOpcode << 8) | Gen3Constants.stoneEvoKantoDexJumpAmount));
      }
    }
  }
}
