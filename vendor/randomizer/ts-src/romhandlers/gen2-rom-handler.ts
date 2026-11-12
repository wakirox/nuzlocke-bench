/**
 * Gen2RomHandler.ts - randomizer handler for G/S/C.
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
import * as Gen2Constants from '../constants/gen2-constants';
import * as Gen2Items from '../constants/gen2-items';
import * as GBConstants from '../constants/gb-constants';
import * as GlobalConstants from '../constants/global-constants';
import * as Moves from '../constants/moves';
import { AbstractGBCRomHandler } from './abstract-gbc-rom-handler';
import type { LogStream, RomHandler } from './rom-handler';
import { TrainerNameMode, RomHandlerFactory } from './rom-handler';
import type { RandomInstance } from '../utils/random-source';
import type { Settings } from '../config/settings';
import { Pokemon } from '../pokemon/pokemon';
import { Move } from '../pokemon/move';
import { MoveCategory } from '../pokemon/move-category';
import { ExpCurve, expCurveFromByte, expCurveToByte } from '../pokemon/exp-curve';
import { StatChangeType } from '../pokemon/stat-change-type';
import { StatChangeMoveType } from '../pokemon/stat-change-move-type';
import { StatusMoveType } from '../pokemon/status-move-type';
import { StatusType } from '../pokemon/status-type';
import { CriticalChance } from '../pokemon/critical-chance';
import { ItemList } from '../pokemon/item-list';
import { FileFunctions } from '../utils/file-functions';
import { RomFunctions } from '../utils/rom-functions';
import { MiscTweak } from '../utils/misc-tweak';
import { Effectiveness } from '../pokemon/effectiveness';
import { StatChange } from '../pokemon/stat-change';
import { MoveLearnt } from '../pokemon/move-learnt';
import { Trainer } from '../pokemon/trainer';
import { TrainerPokemon } from '../pokemon/trainer-pokemon';
import { Encounter } from '../pokemon/encounter';
import { EncounterSet } from '../pokemon/encounter-set';
import { StaticEncounter } from '../pokemon/static-encounter';
import * as Species from '../constants/species';
import { Evolution } from '../pokemon/evolution';
import { EvolutionType, evolutionTypeFromIndex, evolutionTypeToIndex } from '../pokemon/evolution-type';
import { EvolutionUpdate } from './evolution-update';
import type { MegaEvolution } from '../pokemon/mega-evolution';
import type { TotemPokemon } from '../pokemon/totem-pokemon';
import { IngameTrade } from '../pokemon/ingame-trade';
import { Shop } from '../pokemon/shop';
import {
  readWord,
  writeWord,
  romCode,
  readStringFromRom,
  lengthOfStringAt,
  translateString,
  TextTables,
  createTextTables,
  readTextTable as readTextTableInto,
} from './gen1-rom-handler';

// ---------------------------------------------------------------------------
// ROM Entry (parsed from gen2_offsets.ini in the Java version)
// ---------------------------------------------------------------------------

export interface RomEntry {
  name: string;
  romCode: string;
  version: number;
  nonJapanese: number;
  extraTableFile: string | null;
  isCrystal: boolean;
  expectedCRC32: number;
  crcInHeader: number;
  codeTweaks: Map<string, string>;
  entries: Map<string, number>;
  arrayEntries: Map<string, number[]>;
  strings: Map<string, string>;
}

export function createDefaultRomEntry(): RomEntry {
  return {
    name: '',
    romCode: '',
    version: 0,
    nonJapanese: 0,
    extraTableFile: null,
    isCrystal: false,
    expectedCRC32: -1,
    crcInHeader: -1,
    codeTweaks: new Map(),
    entries: new Map(),
    arrayEntries: new Map(),
    strings: new Map(),
  };
}

function romEntryGetValue(entry: RomEntry, key: string): number {
  if (!entry.entries.has(key)) {
    entry.entries.set(key, 0);
  }
  return entry.entries.get(key)!;
}

// ---------------------------------------------------------------------------
// ROM detection
// ---------------------------------------------------------------------------

export function checkRomEntry(rom: Uint8Array, romEntries: RomEntry[]): RomEntry | null {
  const version = rom[GBConstants.versionOffset] & 0xFF;
  const nonjap = rom[GBConstants.jpFlagOffset] & 0xFF;
  const crcInHeader = ((rom[GBConstants.crcOffset] & 0xFF) << 8) | (rom[GBConstants.crcOffset + 1] & 0xFF);

  // Check for specific CRC first
  for (const re of romEntries) {
    if (romCode(rom, re.romCode) && re.version === version && re.nonJapanese === nonjap && re.crcInHeader === crcInHeader) {
      return re;
    }
  }
  // Now check for non-specific-CRC entries
  for (const re of romEntries) {
    if (romCode(rom, re.romCode) && re.version === version && re.nonJapanese === nonjap && re.crcInHeader === -1) {
      return re;
    }
  }
  return null;
}

export function detectRomInner(rom: Uint8Array, romSize: number, romEntries: RomEntry[]): boolean {
  return romSize >= GBConstants.minRomSize && romSize <= GBConstants.maxRomSize && checkRomEntry(rom, romEntries) !== null;
}

// ---------------------------------------------------------------------------
// Type effectiveness relationship
// ---------------------------------------------------------------------------

export interface TypeRelationship {
  attacker: string;
  defender: string;
  effectiveness: Effectiveness;
}

// ---------------------------------------------------------------------------
// Pokemon stats loading / saving
// ---------------------------------------------------------------------------

export function loadBasicPokeStats(
  pkmn: Pokemon,
  rom: Uint8Array,
  offset: number,
): void {
  pkmn.hp = rom[offset + Gen2Constants.bsHPOffset] & 0xFF;
  pkmn.attack = rom[offset + Gen2Constants.bsAttackOffset] & 0xFF;
  pkmn.defense = rom[offset + Gen2Constants.bsDefenseOffset] & 0xFF;
  pkmn.speed = rom[offset + Gen2Constants.bsSpeedOffset] & 0xFF;
  pkmn.spatk = rom[offset + Gen2Constants.bsSpAtkOffset] & 0xFF;
  pkmn.spdef = rom[offset + Gen2Constants.bsSpDefOffset] & 0xFF;
  // Type
  pkmn.primaryType = Gen2Constants.typeTable[rom[offset + Gen2Constants.bsPrimaryTypeOffset] & 0xFF] as any;
  pkmn.secondaryType = Gen2Constants.typeTable[rom[offset + Gen2Constants.bsSecondaryTypeOffset] & 0xFF] as any;
  // Only one type?
  if (pkmn.secondaryType === pkmn.primaryType) {
    pkmn.secondaryType = null;
  }
  pkmn.catchRate = rom[offset + Gen2Constants.bsCatchRateOffset] & 0xFF;
  pkmn.guaranteedHeldItem = -1;
  pkmn.commonHeldItem = rom[offset + Gen2Constants.bsCommonHeldItemOffset] & 0xFF;
  pkmn.rareHeldItem = rom[offset + Gen2Constants.bsRareHeldItemOffset] & 0xFF;
  pkmn.darkGrassHeldItem = -1;
  const growthCurve = expCurveFromByte(rom[offset + Gen2Constants.bsGrowthCurveOffset]);
  if (growthCurve != null) {
    pkmn.growthCurve = growthCurve;
  }
  pkmn.picDimensions = rom[offset + Gen2Constants.bsPicDimensionsOffset] & 0xFF;
}

export function saveBasicPokeStats(
  pkmn: Pokemon,
  rom: Uint8Array,
  offset: number,
): void {
  rom[offset + Gen2Constants.bsHPOffset] = pkmn.hp;
  rom[offset + Gen2Constants.bsAttackOffset] = pkmn.attack;
  rom[offset + Gen2Constants.bsDefenseOffset] = pkmn.defense;
  rom[offset + Gen2Constants.bsSpeedOffset] = pkmn.speed;
  rom[offset + Gen2Constants.bsSpAtkOffset] = pkmn.spatk;
  rom[offset + Gen2Constants.bsSpDefOffset] = pkmn.spdef;
  rom[offset + Gen2Constants.bsPrimaryTypeOffset] = Gen2Constants.typeToByte(pkmn.primaryType as any);
  if (pkmn.secondaryType == null) {
    rom[offset + Gen2Constants.bsSecondaryTypeOffset] = rom[offset + Gen2Constants.bsPrimaryTypeOffset];
  } else {
    rom[offset + Gen2Constants.bsSecondaryTypeOffset] = Gen2Constants.typeToByte(pkmn.secondaryType as any);
  }
  rom[offset + Gen2Constants.bsCatchRateOffset] = pkmn.catchRate;
  rom[offset + Gen2Constants.bsCommonHeldItemOffset] = pkmn.commonHeldItem;
  rom[offset + Gen2Constants.bsRareHeldItemOffset] = pkmn.rareHeldItem;
  rom[offset + Gen2Constants.bsGrowthCurveOffset] = expCurveToByte(pkmn.growthCurve);
}

// ---------------------------------------------------------------------------
// Move loading / saving
// ---------------------------------------------------------------------------

export function loadMoveData(
  rom: Uint8Array,
  movesOffset: number,
  moveIndex: number,
  moveName: string,
): Move {
  const i = moveIndex;
  const base = movesOffset + (i - 1) * 7;
  const move = new Move();
  move.name = moveName;
  move.number = i;
  move.internalId = i;
  move.effectIndex = rom[base + 1] & 0xFF;
  move.hitratio = ((rom[base + 4] & 0xFF)) / 255.0 * 100;
  move.power = rom[base + 2] & 0xFF;
  move.pp = rom[base + 5] & 0xFF;
  move.type = Gen2Constants.typeTable[rom[base + 3]] as any;
  move.category = GBConstants.physicalTypes.has(move.type as any) ? MoveCategory.PHYSICAL : MoveCategory.SPECIAL;
  if (move.power === 0 && !GlobalConstants.noPowerNonStatusMoves.includes(i)) {
    move.category = MoveCategory.STATUS;
  }

  if (i === Moves.swift) {
    // perfectAccuracy would be set here on the handler
  }

  if (GlobalConstants.normalMultihitMoves.includes(i)) {
    move.hitCount = 3;
  } else if (GlobalConstants.doubleHitMoves.includes(i)) {
    move.hitCount = 2;
  } else if (i === Moves.tripleKick) {
    move.hitCount = 2.71; // assumes the first hit lands
  }

  // Priority values from effect_priorities.asm from the Gen 2 disassemblies.
  if (move.effectIndex === Gen2Constants.priorityHitEffectIndex) {
    move.priority = 2;
  } else if (
    move.effectIndex === Gen2Constants.protectEffectIndex ||
    move.effectIndex === Gen2Constants.endureEffectIndex
  ) {
    move.priority = 3;
  } else if (
    move.effectIndex === Gen2Constants.forceSwitchEffectIndex ||
    move.effectIndex === Gen2Constants.counterEffectIndex ||
    move.effectIndex === Gen2Constants.mirrorCoatEffectIndex
  ) {
    move.priority = 0;
  } else {
    move.priority = 1;
  }

  const secondaryEffectChance = ((rom[base + 6] & 0xFF)) / 255.0 * 100;
  loadStatChangesFromEffect(move, secondaryEffectChance);
  loadStatusFromEffect(move, secondaryEffectChance);
  loadMiscMoveInfoFromEffect(move, secondaryEffectChance);

  return move;
}

export function saveMoveData(
  rom: Uint8Array,
  movesOffset: number,
  move: Move,
): void {
  const i = move.internalId;
  const base = movesOffset + (i - 1) * 7;
  rom[base + 1] = move.effectIndex;
  rom[base + 2] = move.power;
  rom[base + 3] = Gen2Constants.typeToByte(move.type as any);
  let hitratio = Math.round(move.hitratio * 2.55);
  if (hitratio < 0) hitratio = 0;
  if (hitratio > 255) hitratio = 255;
  rom[base + 4] = hitratio;
  rom[base + 5] = move.pp;
}

// ---------------------------------------------------------------------------
// Move effect helpers
// ---------------------------------------------------------------------------

function loadStatChangesFromEffect(move: Move, secondaryEffectChance: number): void {
  switch (move.effectIndex) {
    case Gen2Constants.noDamageAtkPlusOneEffect:
    case Gen2Constants.damageUserAtkPlusOneEffect:
      move.statChanges[0].type = StatChangeType.ATTACK;
      move.statChanges[0].stages = 1;
      break;
    case Gen2Constants.noDamageDefPlusOneEffect:
    case Gen2Constants.damageUserDefPlusOneEffect:
    case Gen2Constants.defenseCurlEffect:
      move.statChanges[0].type = StatChangeType.DEFENSE;
      move.statChanges[0].stages = 1;
      break;
    case Gen2Constants.noDamageSpAtkPlusOneEffect:
      move.statChanges[0].type = StatChangeType.SPECIAL_ATTACK;
      move.statChanges[0].stages = 1;
      break;
    case Gen2Constants.noDamageEvasionPlusOneEffect:
      move.statChanges[0].type = StatChangeType.EVASION;
      move.statChanges[0].stages = 1;
      break;
    case Gen2Constants.noDamageAtkMinusOneEffect:
    case Gen2Constants.damageAtkMinusOneEffect:
      move.statChanges[0].type = StatChangeType.ATTACK;
      move.statChanges[0].stages = -1;
      break;
    case Gen2Constants.noDamageDefMinusOneEffect:
    case Gen2Constants.damageDefMinusOneEffect:
      move.statChanges[0].type = StatChangeType.DEFENSE;
      move.statChanges[0].stages = -1;
      break;
    case Gen2Constants.noDamageSpeMinusOneEffect:
    case Gen2Constants.damageSpeMinusOneEffect:
      move.statChanges[0].type = StatChangeType.SPEED;
      move.statChanges[0].stages = -1;
      break;
    case Gen2Constants.noDamageAccuracyMinusOneEffect:
    case Gen2Constants.damageAccuracyMinusOneEffect:
      move.statChanges[0].type = StatChangeType.ACCURACY;
      move.statChanges[0].stages = -1;
      break;
    case Gen2Constants.noDamageEvasionMinusOneEffect:
      move.statChanges[0].type = StatChangeType.EVASION;
      move.statChanges[0].stages = -1;
      break;
    case Gen2Constants.noDamageAtkPlusTwoEffect:
    case Gen2Constants.swaggerEffect:
      move.statChanges[0].type = StatChangeType.ATTACK;
      move.statChanges[0].stages = 2;
      break;
    case Gen2Constants.noDamageDefPlusTwoEffect:
      move.statChanges[0].type = StatChangeType.DEFENSE;
      move.statChanges[0].stages = 2;
      break;
    case Gen2Constants.noDamageSpePlusTwoEffect:
      move.statChanges[0].type = StatChangeType.SPEED;
      move.statChanges[0].stages = 2;
      break;
    case Gen2Constants.noDamageSpDefPlusTwoEffect:
      move.statChanges[0].type = StatChangeType.SPECIAL_DEFENSE;
      move.statChanges[0].stages = 2;
      break;
    case Gen2Constants.noDamageAtkMinusTwoEffect:
      move.statChanges[0].type = StatChangeType.ATTACK;
      move.statChanges[0].stages = -2;
      break;
    case Gen2Constants.noDamageDefMinusTwoEffect:
      move.statChanges[0].type = StatChangeType.DEFENSE;
      move.statChanges[0].stages = -2;
      break;
    case Gen2Constants.noDamageSpeMinusTwoEffect:
      move.statChanges[0].type = StatChangeType.SPEED;
      move.statChanges[0].stages = -2;
      break;
    case Gen2Constants.noDamageSpDefMinusTwoEffect:
      move.statChanges[0].type = StatChangeType.SPECIAL_DEFENSE;
      move.statChanges[0].stages = -2;
      break;
    case Gen2Constants.damageSpDefMinusOneEffect:
      move.statChanges[0].type = StatChangeType.SPECIAL_DEFENSE;
      move.statChanges[0].stages = -1;
      break;
    case Gen2Constants.damageUserAllPlusOneEffect:
      move.statChanges[0].type = StatChangeType.ALL;
      move.statChanges[0].stages = 1;
      break;
    default:
      // Move does not have a stat-changing effect
      return;
  }

  switch (move.effectIndex) {
    case Gen2Constants.noDamageAtkPlusOneEffect:
    case Gen2Constants.noDamageDefPlusOneEffect:
    case Gen2Constants.noDamageSpAtkPlusOneEffect:
    case Gen2Constants.noDamageEvasionPlusOneEffect:
    case Gen2Constants.noDamageAtkMinusOneEffect:
    case Gen2Constants.noDamageDefMinusOneEffect:
    case Gen2Constants.noDamageSpeMinusOneEffect:
    case Gen2Constants.noDamageAccuracyMinusOneEffect:
    case Gen2Constants.noDamageEvasionMinusOneEffect:
    case Gen2Constants.noDamageAtkPlusTwoEffect:
    case Gen2Constants.noDamageDefPlusTwoEffect:
    case Gen2Constants.noDamageSpePlusTwoEffect:
    case Gen2Constants.noDamageSpDefPlusTwoEffect:
    case Gen2Constants.noDamageAtkMinusTwoEffect:
    case Gen2Constants.noDamageDefMinusTwoEffect:
    case Gen2Constants.noDamageSpeMinusTwoEffect:
    case Gen2Constants.noDamageSpDefMinusTwoEffect:
    case Gen2Constants.swaggerEffect:
    case Gen2Constants.defenseCurlEffect:
      if (move.statChanges[0].stages < 0 || move.effectIndex === Gen2Constants.swaggerEffect) {
        move.statChangeMoveType = StatChangeMoveType.NO_DAMAGE_TARGET;
      } else {
        move.statChangeMoveType = StatChangeMoveType.NO_DAMAGE_USER;
      }
      break;

    case Gen2Constants.damageAtkMinusOneEffect:
    case Gen2Constants.damageDefMinusOneEffect:
    case Gen2Constants.damageSpeMinusOneEffect:
    case Gen2Constants.damageSpDefMinusOneEffect:
    case Gen2Constants.damageAccuracyMinusOneEffect:
      move.statChangeMoveType = StatChangeMoveType.DAMAGE_TARGET;
      break;

    case Gen2Constants.damageUserDefPlusOneEffect:
    case Gen2Constants.damageUserAtkPlusOneEffect:
    case Gen2Constants.damageUserAllPlusOneEffect:
      move.statChangeMoveType = StatChangeMoveType.DAMAGE_USER;
      break;
  }

  if (
    move.statChangeMoveType === StatChangeMoveType.DAMAGE_TARGET ||
    move.statChangeMoveType === StatChangeMoveType.DAMAGE_USER
  ) {
    for (let j = 0; j < move.statChanges.length; j++) {
      if (move.statChanges[j].type !== StatChangeType.NONE) {
        move.statChanges[j].percentChance = secondaryEffectChance;
        if (move.statChanges[j].percentChance === 0.0) {
          move.statChanges[j].percentChance = 100.0;
        }
      }
    }
  }
}

function loadStatusFromEffect(move: Move, secondaryEffectChance: number): void {
  switch (move.effectIndex) {
    case Gen2Constants.noDamageSleepEffect:
    case Gen2Constants.toxicEffect:
    case Gen2Constants.noDamageConfusionEffect:
    case Gen2Constants.noDamagePoisonEffect:
    case Gen2Constants.noDamageParalyzeEffect:
    case Gen2Constants.swaggerEffect:
      move.statusMoveType = StatusMoveType.NO_DAMAGE;
      break;

    case Gen2Constants.damagePoisonEffect:
    case Gen2Constants.damageBurnEffect:
    case Gen2Constants.damageFreezeEffect:
    case Gen2Constants.damageParalyzeEffect:
    case Gen2Constants.damageConfusionEffect:
    case Gen2Constants.twineedleEffect:
    case Gen2Constants.damageBurnAndThawUserEffect:
    case Gen2Constants.thunderEffect:
      move.statusMoveType = StatusMoveType.DAMAGE;
      break;

    default:
      // Move does not have a status effect
      return;
  }

  switch (move.effectIndex) {
    case Gen2Constants.noDamageSleepEffect:
      move.statusType = StatusType.SLEEP;
      break;
    case Gen2Constants.damagePoisonEffect:
    case Gen2Constants.noDamagePoisonEffect:
    case Gen2Constants.twineedleEffect:
      move.statusType = StatusType.POISON;
      break;
    case Gen2Constants.damageBurnEffect:
    case Gen2Constants.damageBurnAndThawUserEffect:
      move.statusType = StatusType.BURN;
      break;
    case Gen2Constants.damageFreezeEffect:
      move.statusType = StatusType.FREEZE;
      break;
    case Gen2Constants.damageParalyzeEffect:
    case Gen2Constants.noDamageParalyzeEffect:
    case Gen2Constants.thunderEffect:
      move.statusType = StatusType.PARALYZE;
      break;
    case Gen2Constants.toxicEffect:
      move.statusType = StatusType.TOXIC_POISON;
      break;
    case Gen2Constants.noDamageConfusionEffect:
    case Gen2Constants.damageConfusionEffect:
    case Gen2Constants.swaggerEffect:
      move.statusType = StatusType.CONFUSION;
      break;
  }

  if (move.statusMoveType === StatusMoveType.DAMAGE) {
    move.statusPercentChance = secondaryEffectChance;
    if (move.statusPercentChance === 0.0) {
      move.statusPercentChance = 100.0;
    }
  }
}

function loadMiscMoveInfoFromEffect(move: Move, secondaryEffectChance: number): void {
  switch (move.effectIndex) {
    case Gen2Constants.flinchEffect:
    case Gen2Constants.snoreEffect:
    case Gen2Constants.twisterEffect:
    case Gen2Constants.stompEffect:
      move.flinchPercentChance = secondaryEffectChance;
      break;

    case Gen2Constants.damageAbsorbEffect:
    case Gen2Constants.dreamEaterEffect:
      move.absorbPercent = 50;
      break;

    case Gen2Constants.damageRecoilEffect:
      move.recoilPercent = 25;
      break;

    case Gen2Constants.flailAndReversalEffect:
    case Gen2Constants.futureSightEffect:
      move.criticalChance = CriticalChance.NONE;
      break;

    case Gen2Constants.bindingEffect:
    case Gen2Constants.trappingEffect:
      move.isTrapMove = true;
      break;

    case Gen2Constants.razorWindEffect:
    case Gen2Constants.skyAttackEffect:
    case Gen2Constants.skullBashEffect:
    case Gen2Constants.solarbeamEffect:
    case Gen2Constants.semiInvulnerableEffect:
      move.isChargeMove = true;
      break;

    case Gen2Constants.hyperBeamEffect:
      move.isRechargeMove = true;
      break;
  }

  if (Gen2Constants.increasedCritMoves.includes(move.number)) {
    move.criticalChance = CriticalChance.INCREASED;
  }
}

// ---------------------------------------------------------------------------
// Factory (ROM detection without loading)
// ---------------------------------------------------------------------------

export class Gen2Factory {
  /**
   * Determines whether the given ROM data could be a Gen 2 ROM.
   */
  static isLoadable(data: Uint8Array, romEntries: RomEntry[]): boolean {
    if (data.length > 8 * 1024 * 1024) {
      return false;
    }
    if (data.length === 0) {
      return false;
    }
    const partial = data.length > 0x1000 ? data.subarray(0, 0x1000) : data;
    return detectRomInner(partial, data.length, romEntries);
  }
}

// ---------------------------------------------------------------------------
// TMTextEntry
// ---------------------------------------------------------------------------

export interface TMTextEntry {
  number: number;
  offset: number;
  template: string;
}

// ---------------------------------------------------------------------------
// StaticPokemon helper classes
// ---------------------------------------------------------------------------

export class StaticPokemon {
  speciesOffsets: number[] = [];
  levelOffsets: number[] = [];

  getPokemon(rom: Uint8Array, pokes: Pokemon[]): Pokemon {
    return pokes[rom[this.speciesOffsets[0]] & 0xFF];
  }

  setPokemon(rom: Uint8Array, pkmn: Pokemon, _writePaddedName?: (name: string, length: number, offset: number) => void): void {
    for (const offset of this.speciesOffsets) {
      rom[offset] = pkmn.number & 0xFF;
    }
  }

  getLevel(rom: Uint8Array, i: number): number {
    if (this.levelOffsets.length <= i) return 1;
    return rom[this.levelOffsets[i]] & 0xFF;
  }

  setLevel(rom: Uint8Array, level: number, i: number): void {
    if (this.levelOffsets.length > i) {
      rom[this.levelOffsets[i]] = level & 0xFF;
    }
  }
}

export class StaticPokemonGameCorner extends StaticPokemon {
  override setPokemon(rom: Uint8Array, pkmn: Pokemon, writePaddedName?: (name: string, length: number, offset: number) => void): void {
    const offsetSize = this.speciesOffsets.length;
    for (let i = 0; i < offsetSize - 1; i++) {
      rom[this.speciesOffsets[i]] = pkmn.number & 0xFF;
    }
    if (writePaddedName) {
      writePaddedName(pkmn.name, 0, this.speciesOffsets[offsetSize - 1]);
    }
  }
}

// ---------------------------------------------------------------------------
// INI parser for gen2_offsets.ini
// ---------------------------------------------------------------------------

function parseRIInt(off: string): number {
  let radix = 10;
  off = off.trim().toLowerCase();
  if (off.startsWith('0x') || off.startsWith('&h')) {
    radix = 16;
    off = off.substring(2);
  }
  const val = parseInt(off, radix);
  return isNaN(val) ? 0 : val;
}

function parseRILong(off: string): number {
  // In JS, parseInt handles large hex fine
  return parseRIInt(off);
}

function parseStaticPokemonFromString(str: string, isGameCorner: boolean): StaticPokemon {
  const sp = isGameCorner ? new StaticPokemonGameCorner() : new StaticPokemon();
  const pattern = /[A-Za-z]+=\[(0x[0-9a-fA-F]+,?\s?)+\]/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(str)) !== null) {
    const segments = m[0].split('=');
    const offsets = segments[1].substring(1, segments[1].length - 1).split(',').map((s) => parseRIInt(s));
    switch (segments[0]) {
      case 'Species':
        sp.speciesOffsets = offsets;
        break;
      case 'Level':
        sp.levelOffsets = offsets;
        break;
    }
  }
  return sp;
}

export interface Gen2RomEntryFull extends RomEntry {
  tmTexts: TMTextEntry[];
  staticPokemon: StaticPokemon[];
}

function createDefaultGen2RomEntryFull(): Gen2RomEntryFull {
  return {
    ...createDefaultRomEntry(),
    tmTexts: [],
    staticPokemon: [],
  };
}

export function parseGen2OffsetsIni(text: string): Gen2RomEntryFull[] {
  const entries: Gen2RomEntryFull[] = [];
  let current: Gen2RomEntryFull | null = null;

  for (const rawLine of text.split('\n')) {
    let q = rawLine.trim();
    const commentIdx = q.indexOf('//');
    if (commentIdx >= 0) {
      q = q.substring(0, commentIdx).trim();
    }
    if (q === '') continue;

    if (q.startsWith('[') && q.endsWith(']')) {
      current = createDefaultGen2RomEntryFull();
      current.name = q.substring(1, q.length - 1);
      entries.push(current);
    } else if (current != null) {
      const r = q.split('=');
      if (r.length < 2) continue;
      const key = r[0].trim();
      let value = r.slice(1).join('=').trim();
      if (value.endsWith('\r')) {
        value = value.substring(0, value.length - 1);
      }

      if (key === 'StaticPokemon{}') {
        current.staticPokemon.push(parseStaticPokemonFromString(value, false));
      } else if (key === 'StaticPokemonGameCorner{}') {
        current.staticPokemon.push(parseStaticPokemonFromString(value, true));
      } else if (key === 'TMText[]') {
        if (value.startsWith('[') && value.endsWith(']')) {
          const parts = value.substring(1, value.length - 1).split(',', 3);
          if (parts.length >= 3) {
            current.tmTexts.push({
              number: parseRIInt(parts[0]),
              offset: parseRIInt(parts[1]),
              template: parts[2].trim(),
            });
          }
        }
      } else if (key === 'Game') {
        current.romCode = value;
      } else if (key === 'Version') {
        current.version = parseRIInt(value);
      } else if (key === 'NonJapanese') {
        current.nonJapanese = parseRIInt(value);
      } else if (key === 'Type') {
        current.isCrystal = value.toLowerCase() === 'crystal';
      } else if (key === 'ExtraTableFile') {
        current.extraTableFile = value;
      } else if (key === 'CRCInHeader') {
        current.crcInHeader = parseRIInt(value);
      } else if (key === 'CRC32') {
        current.expectedCRC32 = parseRILong('0x' + value);
      } else if (key.endsWith('Tweak')) {
        current.codeTweaks.set(key, value);
      } else if (key === 'CopyFrom') {
        for (const otherEntry of entries) {
          if (value.toLowerCase() === otherEntry.name.toLowerCase()) {
            const cSP = romEntryGetValue(current, 'CopyStaticPokemon') === 1;
            const cTT = romEntryGetValue(current, 'CopyTMText') === 1;
            // Copy entries
            for (const [k, v] of otherEntry.entries) {
              current.entries.set(k, v);
            }
            for (const [k, v] of otherEntry.arrayEntries) {
              current.arrayEntries.set(k, [...v]);
            }
            for (const [k, v] of otherEntry.strings) {
              current.strings.set(k, v);
            }
            if (cSP) {
              current.staticPokemon.push(...otherEntry.staticPokemon);
              current.entries.set('StaticPokemonSupport', 1);
            } else {
              current.entries.set('StaticPokemonSupport', 0);
              current.entries.delete('StaticPokemonOddEggOffset');
              current.entries.delete('StaticPokemonOddEggDataSize');
            }
            if (cTT) {
              current.tmTexts.push(...otherEntry.tmTexts);
            }
            current.extraTableFile = otherEntry.extraTableFile;
          }
        }
      } else if (key.endsWith('Locator') || key.endsWith('Prefix')) {
        current.strings.set(key, value);
      } else {
        if (value.startsWith('[') && value.endsWith(']')) {
          const inner = value.substring(1, value.length - 1);
          if (inner.trim() === '') {
            current.arrayEntries.set(key, []);
          } else {
            current.arrayEntries.set(key, inner.split(',').map((s) => parseRIInt(s)));
          }
        } else {
          current.entries.set(key, parseRIInt(value));
        }
      }
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Gen2RomHandler class
// ---------------------------------------------------------------------------

export class Gen2RomHandler extends AbstractGBCRomHandler {
  private romEntryFull: Gen2RomEntryFull = createDefaultGen2RomEntryFull();
  private pokes: Pokemon[] = [];
  private pokemonList: (Pokemon | null)[] = [];
  private moves: (Move | null)[] = [];
  private havePatchedFleeing: boolean = false;
  private itemNames: string[] = [];
  private itemOffs: number[] = [];
  private mapNames: string[][] = [];
  private landmarkNames: string[] = [];
  private isVietCrystal: boolean = false;
  private allowedItems: ItemList = new ItemList(0);
  private nonBadItems: ItemList = new ItemList(0);
  private actualCRC32: number = 0;
  private effectivenessUpdated: boolean = false;
  private romEntries: Gen2RomEntryFull[] = [];

  constructor(random: RandomInstance, logStream: LogStream | null, romEntries?: Gen2RomEntryFull[]) {
    super(random, logStream);
    if (romEntries) {
      this.romEntries = romEntries;
    } else {
      try {
        const iniPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/com/dabomstew/pkrandom/config/gen2_offsets.ini');
        if (fs.existsSync(iniPath)) {
          const iniText = fs.readFileSync(iniPath, 'utf-8');
          this.romEntries = parseGen2OffsetsIni(iniText);
        }
      } catch {
        // Fall back to empty
        this.romEntries = [];
      }
    }
  }

  // === Core ROM detection/loading ===

  detectRom(rom: Uint8Array): boolean {
    return detectRomInner(rom, rom.length, this.romEntries);
  }

  loadedRom(): void {
    const entry = checkRomEntry(this.rom, this.romEntries);
    if (entry == null) {
      throw new Error('Could not detect ROM entry');
    }
    this.romEntryFull = entry as Gen2RomEntryFull;

    // Load text tables
    this.clearTextTables();
    this.readTextTable('gameboy_jpn');
    if (this.romEntryFull.extraTableFile != null && this.romEntryFull.extraTableFile.toLowerCase() !== 'none') {
      this.readTextTable(this.romEntryFull.extraTableFile);
    }

    // VietCrystal detection
    if (this.romEntryFull.name === 'Crystal (J)'
        && this.rom[Gen2Constants.vietCrystalCheckOffset] === Gen2Constants.vietCrystalCheckValue) {
      this.readTextTable('vietcrystal');
      this.isVietCrystal = true;
    } else {
      this.isVietCrystal = false;
    }

    this.havePatchedFleeing = false;
    this.loadPokemonStats();
    this.pokemonList = [...this.pokes];
    this.loadMoves();
    this.loadLandmarkNames();
    this.preprocessMaps();
    this.loadItemNames();

    this.allowedItems = Gen2Constants.allowedItems.copy();
    this.nonBadItems = Gen2Constants.nonBadItems.copy();
    this.actualCRC32 = FileFunctions.getCRC32(this.rom);

    if (this.isVietCrystal) {
      this.allowedItems.banSingles(Gen2Items.burnHeal, Gen2Items.calcium, Gen2Items.elixer, Gen2Items.twistedSpoon);
    }
  }

  savingRom(): void {
    this.savePokemonStats();
    this.saveMoves();
  }

  // === Pokemon loading/saving ===

  private loadPokemonStats(): void {
    this.pokes = new Array(Gen2Constants.pokemonCount + 1);
    const pokeNames = this.readPokemonNames();
    const offs = this.getValue('PokemonStatsOffset');
    for (let i = 1; i <= Gen2Constants.pokemonCount; i++) {
      this.pokes[i] = new Pokemon();
      this.pokes[i].number = i;
      loadBasicPokeStats(this.pokes[i], this.rom, offs + (i - 1) * Gen2Constants.baseStatsEntrySize);
      this.pokes[i].name = pokeNames[i];
    }
    this.populateEvolutions();
  }

  private savePokemonStats(): void {
    const offs = this.getValue('PokemonNamesOffset');
    const len = this.getValue('PokemonNamesLength');
    for (let i = 1; i <= Gen2Constants.pokemonCount; i++) {
      this.writeFixedLengthString(this.pokes[i].name, offs + (i - 1) * len, len);
    }
    const offs2 = this.getValue('PokemonStatsOffset');
    for (let i = 1; i <= Gen2Constants.pokemonCount; i++) {
      saveBasicPokeStats(this.pokes[i], this.rom, offs2 + (i - 1) * Gen2Constants.baseStatsEntrySize);
    }
    this.writeEvosAndMovesLearnt(true, new Map());
  }

  private readPokemonNames(): string[] {
    const offs = this.getValue('PokemonNamesOffset');
    const len = this.getValue('PokemonNamesLength');
    const names: string[] = new Array(Gen2Constants.pokemonCount + 1);
    for (let i = 1; i <= Gen2Constants.pokemonCount; i++) {
      names[i] = this.readFixedLengthString(offs + (i - 1) * len, len);
    }
    return names;
  }

  // === Move loading/saving ===

  private readMoveNames(): string[] {
    let offset = this.getValue('MoveNamesOffset');
    const moveNames: string[] = new Array(Gen2Constants.moveCount + 1);
    for (let i = 1; i <= Gen2Constants.moveCount; i++) {
      moveNames[i] = this.readVariableLengthString(offset, false);
      offset += this.lengthOfStringAt(offset, false) + 1;
    }
    return moveNames;
  }

  private loadMoves(): void {
    this.moves = new Array(Gen2Constants.moveCount + 1);
    const moveNames = this.readMoveNames();
    const offs = this.getValue('MoveDataOffset');
    for (let i = 1; i <= Gen2Constants.moveCount; i++) {
      this.moves[i] = loadMoveData(this.rom, offs, i, moveNames[i]);
      if (i === Moves.swift) {
        this.perfectAccuracy = Math.round(this.moves[i]!.hitratio);
      }
    }
  }

  private saveMoves(): void {
    const offs = this.getValue('MoveDataOffset');
    for (let i = 1; i <= Gen2Constants.moveCount; i++) {
      if (this.moves[i]) {
        saveMoveData(this.rom, offs, this.moves[i]!);
      }
    }
  }

  // === Landmark names and map preprocessing ===

  private loadLandmarkNames(): void {
    const lmOffset = this.getValue('LandmarkTableOffset');
    const lmBank = this.bankOf(lmOffset);
    const lmCount = this.getValue('LandmarkCount');
    this.landmarkNames = new Array(lmCount);
    for (let i = 0; i < lmCount; i++) {
      const lmNameOffset = this.calculateOffset(lmBank, readWord(this.rom, lmOffset + i * 4 + 2));
      this.landmarkNames[i] = this.readVariableLengthString(lmNameOffset, false).replace(/\\x1F/g, ' ');
    }
  }

  private preprocessMaps(): void {
    this.itemOffs = [];
    const mhOffset = this.getValue('MapHeaders');
    const mapGroupCount = Gen2Constants.mapGroupCount;
    const mapsInLastGroup = Gen2Constants.mapsInLastGroup;
    const mhBank = this.bankOf(mhOffset);
    this.mapNames = new Array(mapGroupCount + 1);
    for (let i = 0; i <= mapGroupCount; i++) {
      this.mapNames[i] = new Array(100).fill('');
    }

    const groupOffsets: number[] = new Array(mapGroupCount);
    for (let i = 0; i < mapGroupCount; i++) {
      groupOffsets[i] = this.calculateOffset(mhBank, readWord(this.rom, mhOffset + i * 2));
    }

    for (let mg = 0; mg < mapGroupCount; mg++) {
      let offset = groupOffsets[mg];
      const maxOffset = (mg === mapGroupCount - 1) ? (mhBank + 1) * GBConstants.bankSize : groupOffsets[mg + 1];
      let map = 0;
      const maxMap = (mg === mapGroupCount - 1) ? mapsInLastGroup : Number.MAX_SAFE_INTEGER;
      while (offset < maxOffset && map < maxMap) {
        this.processMapAt(offset, mg + 1, map + 1);
        offset += 9;
        map++;
      }
    }
  }

  private processMapAt(offset: number, mapBank: number, mapNumber: number): void {
    // Second map header
    const smhBank = this.rom[offset] & 0xFF;
    const smhPointer = readWord(this.rom, offset + 3);
    const smhOffset = this.calculateOffset(smhBank, smhPointer);

    // Map name from landmark
    const mapLandmark = this.rom[offset + 5] & 0xFF;
    if (mapLandmark < this.landmarkNames.length) {
      this.mapNames[mapBank][mapNumber] = this.landmarkNames[mapLandmark];
    }

    // Event header (same bank as script header)
    const ehBank = this.rom[smhOffset + 6] & 0xFF;
    const ehPointer = readWord(this.rom, smhOffset + 9);
    let ehOffset = this.calculateOffset(ehBank, ehPointer);

    // Skip filler
    ehOffset += 2;

    // Warps
    const warpCount = this.rom[ehOffset++] & 0xFF;
    ehOffset += warpCount * 5;

    // XY triggers
    const triggerCount = this.rom[ehOffset++] & 0xFF;
    ehOffset += triggerCount * 8;

    // Signposts
    const signpostCount = this.rom[ehOffset++] & 0xFF;
    for (let sp = 0; sp < signpostCount; sp++) {
      const spType = this.rom[ehOffset + sp * 5 + 2] & 0xFF;
      if (spType === 7) {
        const spPointer = readWord(this.rom, ehOffset + sp * 5 + 3);
        const spOffset = this.calculateOffset(ehBank, spPointer);
        this.itemOffs.push(spOffset + 2);
      }
    }
    ehOffset += signpostCount * 5;

    // Visible objects/people
    const peopleCount = this.rom[ehOffset++] & 0xFF;
    for (let p = 0; p < peopleCount; p++) {
      const pColorFunction = this.rom[ehOffset + p * 13 + 7];
      if ((pColorFunction & 1) === 1) {
        const pPointer = readWord(this.rom, ehOffset + p * 13 + 9);
        const pOffset = this.calculateOffset(ehBank, pPointer);
        this.itemOffs.push(pOffset);
      }
    }
  }

  // === Item names ===

  private loadItemNames(): void {
    this.itemNames = new Array(256).fill('');
    this.itemNames[0] = 'glitch';
    const origOffset = this.getValue('ItemNamesOffset');
    let itemNameOffset = origOffset;
    for (let index = 1; index <= 0x100; index++) {
      if (Math.floor(itemNameOffset / GBConstants.bankSize) > Math.floor(origOffset / GBConstants.bankSize)) {
        break;
      }
      const startOfText = itemNameOffset;
      while ((this.rom[itemNameOffset] & 0xFF) !== GBConstants.stringTerminator) {
        itemNameOffset++;
      }
      itemNameOffset++;
      this.itemNames[index % 256] = this.readFixedLengthString(startOfText, 20);
    }
  }

  // === Convenience helpers ===

  private getValue(key: string): number {
    return romEntryGetValue(this.romEntryFull, key);
  }

  private getString(key: string): string {
    if (!this.romEntryFull.strings.has(key)) {
      this.romEntryFull.strings.set(key, '');
    }
    return this.romEntryFull.strings.get(key)!;
  }

  private patchFleeing(): void {
    this.havePatchedFleeing = true;
    const offset = this.getValue('FleeingDataOffset');
    this.rom[offset] = 0xFF;
    this.rom[offset + Gen2Constants.fleeingSetTwoOffset] = 0xFF;
    this.rom[offset + Gen2Constants.fleeingSetThreeOffset] = 0xFF;
  }

  private findInRom(hexString: string): number {
    if (hexString.length % 2 !== 0) {
      return -3;
    }
    const searchFor = new Uint8Array(hexString.length / 2);
    for (let i = 0; i < searchFor.length; i++) {
      searchFor[i] = parseInt(hexString.substring(i * 2, i * 2 + 2), 16);
    }
    const found = RomFunctions.search(this.rom, searchFor);
    if (found.length === 0) return -1;
    if (found.length > 1) return -2;
    return found[0];
  }

  writePaddedPokemonName(name: string, length: number, offset: number): void {
    const paddedName = name + ' '.repeat(Math.max(0, length - name.length));
    const translated = this.translateString(paddedName);
    this.rom.set(translated.subarray(0, Math.min(translated.length, length)), offset);
  }

  // === Stub methods (to be implemented in parallel work streams) ===

  // -- Pokemon data stubs (Stream 1) --
  getPokemon(): (Pokemon | null)[] { return this.pokemonList; }
  getPokemonInclFormes(): (Pokemon | null)[] { return this.pokemonList; }
  getAltFormes(): Pokemon[] { return []; }
  getMegaEvolutions(): MegaEvolution[] { return []; }
  getAltFormeOfPokemon(pk: Pokemon, _forme: number): Pokemon { return pk; }
  getIrregularFormes(): Pokemon[] { return []; }
  hasFunctionalFormes(): boolean { return false; }

  populateEvolutions(): void {
    for (const pkmn of this.pokes) {
      if (pkmn != null) {
        pkmn.evolutionsFrom = [];
        pkmn.evolutionsTo = [];
      }
    }

    const pointersOffset = this.getValue('PokemonMovesetsTableOffset');
    for (let i = 1; i <= Gen2Constants.pokemonCount; i++) {
      const pointer = readWord(this.rom, pointersOffset + (i - 1) * 2);
      let realPointer = this.calculateOffset(this.bankOf(pointersOffset), pointer);
      const pkmn = this.pokes[i];
      while (this.rom[realPointer] !== 0) {
        const method = this.rom[realPointer] & 0xFF;
        const otherPoke = this.rom[realPointer + 2 + (method === 5 ? 1 : 0)] & 0xFF;
        let type = evolutionTypeFromIndex(2, method);
        let extraInfo = 0;
        if (type === EvolutionType.TRADE) {
          const itemNeeded = this.rom[realPointer + 1] & 0xFF;
          if (itemNeeded !== 0xFF) {
            type = EvolutionType.TRADE_ITEM;
            extraInfo = itemNeeded;
          }
        } else if (type === EvolutionType.LEVEL_ATTACK_HIGHER) {
          const tyrogueCond = this.rom[realPointer + 2] & 0xFF;
          if (tyrogueCond === 2) {
            type = EvolutionType.LEVEL_DEFENSE_HIGHER;
          } else if (tyrogueCond === 3) {
            type = EvolutionType.LEVEL_ATK_DEF_SAME;
          }
          extraInfo = this.rom[realPointer + 1] & 0xFF;
        } else if (type === EvolutionType.HAPPINESS) {
          const happCond = this.rom[realPointer + 1] & 0xFF;
          if (happCond === 2) {
            type = EvolutionType.HAPPINESS_DAY;
          } else if (happCond === 3) {
            type = EvolutionType.HAPPINESS_NIGHT;
          }
        } else {
          extraInfo = this.rom[realPointer + 1] & 0xFF;
        }
        const evo = new Evolution(this.pokes[i], this.pokes[otherPoke], true, type!, extraInfo);
        if (!pkmn.evolutionsFrom.some((e) => e.equals(evo))) {
          pkmn.evolutionsFrom.push(evo);
          this.pokes[otherPoke].evolutionsTo.push(evo);
        }
        realPointer += (method === 5 ? 4 : 3);
      }
      // split evos don't carry stats
      if (pkmn.evolutionsFrom.length > 1) {
        for (const e of pkmn.evolutionsFrom) {
          e.carryStats = false;
        }
      }
    }
  }

  writeEvosAndMovesLearnt(writeEvos: boolean, movesets: Map<number, MoveLearnt[]> | null): void {
    // This assumes that the evo/attack pointers & data are at the end of the bank
    const movesEvosStart = this.getValue('PokemonMovesetsTableOffset');
    const movesEvosBank = this.bankOf(movesEvosStart);
    const pointerTable = new Uint8Array(Gen2Constants.pokemonCount * 2);
    let startOfNextBank: number;
    if (this.isVietCrystal) {
      startOfNextBank = 0x43E00; // fix for pokedex crash
    } else {
      startOfNextBank = (Math.floor(movesEvosStart / GBConstants.bankSize) + 1) * GBConstants.bankSize;
    }
    const dataBlockSize = startOfNextBank - (movesEvosStart + pointerTable.length);
    const dataBlockOffset = movesEvosStart + pointerTable.length;
    const dataBlock = new Uint8Array(dataBlockSize);
    let offsetInData = 0;

    for (let i = 1; i <= Gen2Constants.pokemonCount; i++) {
      const oldDataOffset = this.calculateOffset(movesEvosBank, readWord(this.rom, movesEvosStart + (i - 1) * 2));
      let offsetStart = dataBlockOffset + offsetInData;
      let evoWritten = false;

      if (!writeEvos) {
        let evoOffset = oldDataOffset;
        while (this.rom[evoOffset] !== 0x00) {
          const method = this.rom[evoOffset] & 0xFF;
          const limiter = (method === 5) ? 4 : 3;
          for (let b = 0; b < limiter; b++) {
            dataBlock[offsetInData++] = this.rom[evoOffset++];
          }
          evoWritten = true;
        }
      } else {
        for (const evo of this.pokes[i].evolutionsFrom) {
          dataBlock[offsetInData++] = evolutionTypeToIndex(evo.type, 2) & 0xFF;
          if (evo.type === EvolutionType.LEVEL || evo.type === EvolutionType.STONE
              || evo.type === EvolutionType.TRADE_ITEM) {
            dataBlock[offsetInData++] = evo.extraInfo & 0xFF;
          } else if (evo.type === EvolutionType.TRADE) {
            dataBlock[offsetInData++] = 0xFF;
          } else if (evo.type === EvolutionType.HAPPINESS) {
            dataBlock[offsetInData++] = 0x01;
          } else if (evo.type === EvolutionType.HAPPINESS_DAY) {
            dataBlock[offsetInData++] = 0x02;
          } else if (evo.type === EvolutionType.HAPPINESS_NIGHT) {
            dataBlock[offsetInData++] = 0x03;
          } else if (evo.type === EvolutionType.LEVEL_ATTACK_HIGHER) {
            dataBlock[offsetInData++] = evo.extraInfo & 0xFF;
            dataBlock[offsetInData++] = 0x01;
          } else if (evo.type === EvolutionType.LEVEL_DEFENSE_HIGHER) {
            dataBlock[offsetInData++] = evo.extraInfo & 0xFF;
            dataBlock[offsetInData++] = 0x02;
          } else if (evo.type === EvolutionType.LEVEL_ATK_DEF_SAME) {
            dataBlock[offsetInData++] = evo.extraInfo & 0xFF;
            dataBlock[offsetInData++] = 0x03;
          }
          dataBlock[offsetInData++] = evo.to.number & 0xFF;
          evoWritten = true;
        }
      }

      if (!evoWritten && offsetStart !== dataBlockOffset) {
        offsetStart -= 1;
      } else {
        dataBlock[offsetInData++] = 0x00;
      }

      const pointerNow = this.makeGBPointer(offsetStart);
      writeWord(pointerTable, (i - 1) * 2, pointerNow);

      if (movesets == null || movesets.size === 0) {
        let movesOff = oldDataOffset;
        while (this.rom[movesOff] !== 0x00) {
          const method = this.rom[movesOff] & 0xFF;
          movesOff += (method === 5) ? 4 : 3;
        }
        movesOff++;
        while (this.rom[movesOff] !== 0x00) {
          dataBlock[offsetInData++] = this.rom[movesOff++];
          dataBlock[offsetInData++] = this.rom[movesOff++];
        }
      } else {
        const pokeMoves = movesets.get(this.pokes[i].number);
        if (pokeMoves) {
          for (const ml of pokeMoves) {
            dataBlock[offsetInData++] = ml.level & 0xFF;
            dataBlock[offsetInData++] = ml.move & 0xFF;
          }
        }
      }
      dataBlock[offsetInData++] = 0x00;
    }

    this.rom.set(pointerTable, movesEvosStart);
    this.rom.set(dataBlock, dataBlockOffset);
  }

  // -- Starters (Stream 1) --
  getStarters(): Pokemon[] {
    const starters: Pokemon[] = [];
    const offsets1 = this.romEntryFull.arrayEntries.get('StarterOffsets1');
    const offsets2 = this.romEntryFull.arrayEntries.get('StarterOffsets2');
    const offsets3 = this.romEntryFull.arrayEntries.get('StarterOffsets3');
    if (offsets1 && offsets1.length > 0) starters.push(this.pokes[this.rom[offsets1[0]] & 0xFF]);
    if (offsets2 && offsets2.length > 0) starters.push(this.pokes[this.rom[offsets2[0]] & 0xFF]);
    if (offsets3 && offsets3.length > 0) starters.push(this.pokes[this.rom[offsets3[0]] & 0xFF]);
    return starters;
  }

  setStarters(newStarters: Pokemon[]): boolean {
    if (newStarters.length !== 3) {
      return false;
    }
    for (let i = 0; i < 3; i++) {
      const starter = newStarters[i].number & 0xFF;
      const offsets = this.romEntryFull.arrayEntries.get('StarterOffsets' + (i + 1));
      if (offsets) {
        for (const offset of offsets) {
          this.rom[offset] = starter;
        }
      }
    }
    if (this.getValue('CanChangeStarterText') > 0) {
      const starterTextOffsets = this.romEntryFull.arrayEntries.get('StarterTextOffsets');
      if (starterTextOffsets) {
        for (let i = 0; i < 3 && i < starterTextOffsets.length; i++) {
          this.writeVariableLengthString(`${newStarters[i].name}?\\e`, starterTextOffsets[i], true);
        }
      }
    }
    return true;
  }
  hasStarterAltFormes(): boolean { return false; }
  starterCount(): number { return 3; }
  supportsStarterHeldItems(): boolean { return true; }
  getStarterHeldItems(): number[] {
    const sHeldItems: number[] = [];
    const shiOffsets = this.romEntryFull.arrayEntries.get('StarterHeldItems');
    if (shiOffsets) {
      for (const offset of shiOffsets) {
        sHeldItems.push(this.rom[offset] & 0xFF);
      }
    }
    return sHeldItems;
  }

  setStarterHeldItems(items: number[]): void {
    const shiOffsets = this.romEntryFull.arrayEntries.get('StarterHeldItems');
    if (!shiOffsets || items.length !== shiOffsets.length) {
      return;
    }
    for (let i = 0; i < shiOffsets.length; i++) {
      this.rom[shiOffsets[i]] = items[i] & 0xFF;
    }
  }

  randomizeStarterHeldItems(settings: Settings): void {
    const banBadItems = settings.banBadRandomStarterHeldItems;
    const oldHeldItems = this.getStarterHeldItems();
    const newHeldItems: number[] = [];
    const possibleItems = banBadItems ? this.getNonBadItems() : this.getAllowedItems();
    for (let i = 0; i < oldHeldItems.length; i++) {
      newHeldItems.push(possibleItems.randomItem(() => this.random.nextDouble()));
    }
    this.setStarterHeldItems(newHeldItems);
  }

  // -- Wild encounters (Stream 2) --
  getEncounters(useTimeOfDay: boolean): EncounterSet[] {
    let offset = this.getValue('WildPokemonOffset');
    const areas: EncounterSet[] = [];
    offset = this.readLandEncounters(offset, areas, useTimeOfDay);
    offset = this.readSeaEncounters(offset, areas);
    offset = this.readLandEncounters(offset, areas, useTimeOfDay);
    offset = this.readSeaEncounters(offset, areas);
    offset = this.readLandEncounters(offset, areas, useTimeOfDay);
    offset = this.readSeaEncounters(offset, areas);
    offset = this.getValue('FishingWildsOffset');
    const rootOffset = offset;
    for (let k = 0; k < Gen2Constants.fishingGroupCount; k++) {
      const es = new EncounterSet();
      es.displayName = 'Fishing Group ' + (k + 1);
      for (let i = 0; i < Gen2Constants.pokesPerFishingGroup; i++) {
        offset++;
        const pokeNum = this.rom[offset++] & 0xFF;
        const level = this.rom[offset++] & 0xFF;
        if (pokeNum === 0) {
          if (!useTimeOfDay) {
            const specialOffset = rootOffset + Gen2Constants.fishingGroupEntryLength
                * Gen2Constants.pokesPerFishingGroup * Gen2Constants.fishingGroupCount + level * 4 + 2;
            const enc = new Encounter();
            enc.pokemon = this.pokes[this.rom[specialOffset] & 0xFF];
            enc.level = this.rom[specialOffset + 1] & 0xFF;
            es.encounters.push(enc);
          }
        } else {
          const enc = new Encounter();
          enc.pokemon = this.pokes[pokeNum];
          enc.level = level;
          es.encounters.push(enc);
        }
      }
      areas.push(es);
    }
    if (useTimeOfDay) {
      for (let k = 0; k < Gen2Constants.timeSpecificFishingGroupCount; k++) {
        const es = new EncounterSet();
        es.displayName = 'Time-Specific Fishing ' + (k + 1);
        for (let i = 0; i < Gen2Constants.pokesPerTSFishingGroup; i++) {
          const pokeNum = this.rom[offset++] & 0xFF;
          const level = this.rom[offset++] & 0xFF;
          const enc = new Encounter();
          enc.pokemon = this.pokes[pokeNum];
          enc.level = level;
          es.encounters.push(enc);
        }
        areas.push(es);
      }
    }
    offset = this.getValue('HeadbuttWildsOffset');
    const headbuttLimit = this.getValue('HeadbuttTableSize');
    for (let i = 0; i < headbuttLimit; i++) {
      const es = new EncounterSet();
      es.displayName = 'Headbutt Trees Set ' + (i + 1);
      while ((this.rom[offset] & 0xFF) !== 0xFF) {
        offset++;
        const pokeNum = this.rom[offset++] & 0xFF;
        const level = this.rom[offset++] & 0xFF;
        const enc = new Encounter();
        enc.pokemon = this.pokes[pokeNum];
        enc.level = level;
        es.encounters.push(enc);
      }
      offset++;
      areas.push(es);
    }
    offset = this.getValue('BCCWildsOffset');
    const bccES = new EncounterSet();
    bccES.displayName = 'Bug Catching Contest';
    while ((this.rom[offset] & 0xFF) !== 0xFF) {
      offset++;
      const enc = new Encounter();
      enc.pokemon = this.pokes[this.rom[offset++] & 0xFF];
      enc.level = this.rom[offset++] & 0xFF;
      enc.maxLevel = this.rom[offset++] & 0xFF;
      bccES.encounters.push(enc);
    }
    if (this.pokes[Species.unown]) {
      bccES.bannedPokemon.add(this.pokes[Species.unown]);
    }
    areas.push(bccES);
    return areas;
  }

  setEncounters(useTimeOfDay: boolean, encounters: EncounterSet[]): void {
    if (!this.havePatchedFleeing) { this.patchFleeing(); }
    let offset = this.getValue('WildPokemonOffset');
    let areaIdx = 0;
    const nextArea = (): EncounterSet => encounters[areaIdx++];
    offset = this.writeLandEncounters(offset, nextArea, useTimeOfDay);
    offset = this.writeSeaEncounters(offset, nextArea);
    offset = this.writeLandEncounters(offset, nextArea, useTimeOfDay);
    offset = this.writeSeaEncounters(offset, nextArea);
    offset = this.writeLandEncounters(offset, nextArea, useTimeOfDay);
    offset = this.writeSeaEncounters(offset, nextArea);
    offset = this.getValue('FishingWildsOffset');
    for (let k = 0; k < Gen2Constants.fishingGroupCount; k++) {
      const es = nextArea();
      let encIdx = 0;
      for (let i = 0; i < Gen2Constants.pokesPerFishingGroup; i++) {
        offset++;
        if (this.rom[offset] === 0) {
          if (!useTimeOfDay) {
            const enc = es.encounters[encIdx++];
            this.rom[offset++] = enc.pokemon!.number & 0xFF;
            this.rom[offset++] = enc.level & 0xFF;
          } else { offset += 2; }
        } else {
          const enc = es.encounters[encIdx++];
          this.rom[offset++] = enc.pokemon!.number & 0xFF;
          this.rom[offset++] = enc.level & 0xFF;
        }
      }
    }
    if (useTimeOfDay) {
      for (let k = 0; k < Gen2Constants.timeSpecificFishingGroupCount; k++) {
        const es = nextArea();
        let encIdx = 0;
        for (let i = 0; i < Gen2Constants.pokesPerTSFishingGroup; i++) {
          const enc = es.encounters[encIdx++];
          this.rom[offset++] = enc.pokemon!.number & 0xFF;
          this.rom[offset++] = enc.level & 0xFF;
        }
      }
    }
    offset = this.getValue('HeadbuttWildsOffset');
    const headbuttLimit = this.getValue('HeadbuttTableSize');
    for (let i = 0; i < headbuttLimit; i++) {
      const es = nextArea();
      let encIdx = 0;
      while ((this.rom[offset] & 0xFF) !== 0xFF) {
        const enc = es.encounters[encIdx++];
        offset++;
        this.rom[offset++] = enc.pokemon!.number & 0xFF;
        this.rom[offset++] = enc.level & 0xFF;
      }
      offset++;
    }
    offset = this.getValue('BCCWildsOffset');
    const bccES = nextArea();
    let bccIdx = 0;
    while ((this.rom[offset] & 0xFF) !== 0xFF) {
      offset++;
      const enc = bccES.encounters[bccIdx++];
      this.rom[offset++] = enc.pokemon!.number & 0xFF;
      this.rom[offset++] = enc.level & 0xFF;
      this.rom[offset++] = enc.maxLevel & 0xFF;
    }
  }

  private readLandEncounters(offset: number, areas: EncounterSet[], useTimeOfDay: boolean): number {
    const todNames = ['Morning', 'Day', 'Night'];
    while ((this.rom[offset] & 0xFF) !== 0xFF) {
      const mapBank = this.rom[offset] & 0xFF;
      const mapNumber = this.rom[offset + 1] & 0xFF;
      const mapName = this.mapNames[mapBank]?.[mapNumber] ?? `Map ${mapBank}-${mapNumber}`;
      if (useTimeOfDay) {
        for (let i = 0; i < 3; i++) {
          const encset = new EncounterSet();
          encset.rate = this.rom[offset + 2 + i] & 0xFF;
          encset.displayName = mapName + ' Grass/Cave (' + todNames[i] + ')';
          for (let j = 0; j < Gen2Constants.landEncounterSlots; j++) {
            const enc = new Encounter();
            enc.level = this.rom[offset + 5 + (i * Gen2Constants.landEncounterSlots * 2) + (j * 2)] & 0xFF;
            enc.maxLevel = 0;
            enc.pokemon = this.pokes[this.rom[offset + 5 + (i * Gen2Constants.landEncounterSlots * 2) + (j * 2) + 1] & 0xFF];
            encset.encounters.push(enc);
          }
          areas.push(encset);
        }
      } else {
        const encset = new EncounterSet();
        encset.rate = this.rom[offset + 3] & 0xFF;
        encset.displayName = mapName + ' Grass/Cave';
        for (let j = 0; j < Gen2Constants.landEncounterSlots; j++) {
          const enc = new Encounter();
          enc.level = this.rom[offset + 5 + Gen2Constants.landEncounterSlots * 2 + (j * 2)] & 0xFF;
          enc.maxLevel = 0;
          enc.pokemon = this.pokes[this.rom[offset + 5 + Gen2Constants.landEncounterSlots * 2 + (j * 2) + 1] & 0xFF];
          encset.encounters.push(enc);
        }
        areas.push(encset);
      }
      offset += 5 + 6 * Gen2Constants.landEncounterSlots;
    }
    return offset + 1;
  }

  private readSeaEncounters(offset: number, areas: EncounterSet[]): number {
    while ((this.rom[offset] & 0xFF) !== 0xFF) {
      const mapBank = this.rom[offset] & 0xFF;
      const mapNumber = this.rom[offset + 1] & 0xFF;
      const mapName = this.mapNames[mapBank]?.[mapNumber] ?? `Map ${mapBank}-${mapNumber}`;
      const encset = new EncounterSet();
      encset.rate = this.rom[offset + 2] & 0xFF;
      encset.displayName = mapName + ' Surfing';
      for (let j = 0; j < Gen2Constants.seaEncounterSlots; j++) {
        const enc = new Encounter();
        enc.level = this.rom[offset + 3 + (j * 2)] & 0xFF;
        enc.maxLevel = 0;
        enc.pokemon = this.pokes[this.rom[offset + 3 + (j * 2) + 1] & 0xFF];
        encset.encounters.push(enc);
      }
      areas.push(encset);
      offset += 3 + Gen2Constants.seaEncounterSlots * 2;
    }
    return offset + 1;
  }

  private writeLandEncounters(offset: number, nextArea: () => EncounterSet, useTimeOfDay: boolean): number {
    while ((this.rom[offset] & 0xFF) !== 0xFF) {
      if (useTimeOfDay) {
        for (let i = 0; i < 3; i++) {
          const encset = nextArea();
          let encIdx = 0;
          for (let j = 0; j < Gen2Constants.landEncounterSlots; j++) {
            const enc = encset.encounters[encIdx++];
            this.rom[offset + 5 + (i * Gen2Constants.landEncounterSlots * 2) + (j * 2)] = enc.level & 0xFF;
            this.rom[offset + 5 + (i * Gen2Constants.landEncounterSlots * 2) + (j * 2) + 1] = enc.pokemon!.number & 0xFF;
          }
        }
      } else {
        const encset = nextArea();
        for (let i = 0; i < 3; i++) {
          let encIdx = 0;
          for (let j = 0; j < Gen2Constants.landEncounterSlots; j++) {
            const enc = encset.encounters[encIdx++];
            this.rom[offset + 5 + (i * Gen2Constants.landEncounterSlots * 2) + (j * 2)] = enc.level & 0xFF;
            this.rom[offset + 5 + (i * Gen2Constants.landEncounterSlots * 2) + (j * 2) + 1] = enc.pokemon!.number & 0xFF;
          }
        }
      }
      offset += 5 + 6 * Gen2Constants.landEncounterSlots;
    }
    return offset + 1;
  }

  private writeSeaEncounters(offset: number, nextArea: () => EncounterSet): number {
    while ((this.rom[offset] & 0xFF) !== 0xFF) {
      const encset = nextArea();
      let encIdx = 0;
      for (let j = 0; j < Gen2Constants.seaEncounterSlots; j++) {
        const enc = encset.encounters[encIdx++];
        this.rom[offset + 3 + (j * 2)] = enc.level & 0xFF;
        this.rom[offset + 3 + (j * 2) + 1] = enc.pokemon!.number & 0xFF;
      }
      offset += 3 + Gen2Constants.seaEncounterSlots * 2;
    }
    return offset + 1;
  }

  hasTimeBasedEncounters(): boolean { return true; }
  hasWildAltFormes(): boolean { return false; }

  // randomizeWildHeldItems inherited from AbstractRomHandler

  enableGuaranteedPokemonCatching(): void {
    const prefix = this.getString('GuaranteedCatchPrefix');
    if (!prefix) return;
    const offset = this.findInRom(prefix);
    if (offset > 0) {
      const patchOffset = offset + prefix.length / 2;
      if (this.rom[patchOffset] === 0xCA) { this.rom[patchOffset] = 0xC3; }
    }
  }

  bannedForWildEncounters(): Pokemon[] {
    const banned: Pokemon[] = [];
    if (this.pokes[201]) banned.push(this.pokes[201]);
    return banned;
  }

  // -- Trainers (Stream 3) --

  getTrainers(): Trainer[] {
    const traineroffset = this.getValue('TrainerDataTableOffset');
    const traineramount = this.getValue('TrainerClassAmount');
    const trainerclasslimits = this.romEntryFull.arrayEntries.get('TrainerDataClassCounts')!;

    const pointers: number[] = new Array(traineramount);
    for (let i = 0; i < traineramount; i++) {
      const pointer = readWord(this.rom, traineroffset + i * 2);
      pointers[i] = this.calculateOffset(this.bankOf(traineroffset), pointer);
    }

    const tcnames = this.getTrainerClassNames();

    const allTrainers: Trainer[] = [];
    let index = 0;
    for (let i = 0; i < traineramount; i++) {
      let offs = pointers[i];
      const limit = trainerclasslimits[i];
      for (let trnum = 0; trnum < limit; trnum++) {
        index++;
        const tr = new Trainer();
        tr.offset = offs;
        tr.index = index;
        tr.trainerclass = i;
        const name = this.readVariableLengthString(offs, false);
        tr.name = name;
        tr.fullDisplayName = tcnames[i] + ' ' + name;
        offs += this.lengthOfStringAt(offs, false) + 1;
        const dataType = this.rom[offs] & 0xFF;
        tr.poketype = dataType;
        offs++;
        while ((this.rom[offs] & 0xFF) !== 0xFF) {
          const tp = new TrainerPokemon();
          tp.level = this.rom[offs] & 0xFF;
          tp.pokemon = this.pokes[this.rom[offs + 1] & 0xFF];
          offs += 2;
          if ((dataType & 2) === 2) {
            tp.heldItem = this.rom[offs] & 0xFF;
            offs++;
          }
          if ((dataType & 1) === 1) {
            for (let move = 0; move < 4; move++) {
              tp.moves[move] = this.rom[offs + move] & 0xFF;
            }
            offs += 4;
          }
          tr.pokemon.push(tp);
        }
        allTrainers.push(tr);
        offs++;
      }
    }

    Gen2Constants.universalTrainerTags(allTrainers);
    if (this.romEntryFull.isCrystal) {
      Gen2Constants.crystalTags(allTrainers);
    } else {
      Gen2Constants.goldSilverTags(allTrainers);
    }

    return allTrainers;
  }

  getMainPlaythroughTrainers(): number[] { return []; }

  getEliteFourTrainers(_isChallengeMode: boolean): number[] { return []; }

  setTrainers(trainerData: Trainer[], _doubleBattleMode: boolean): void {
    const traineroffset = this.getValue('TrainerDataTableOffset');
    const traineramount = this.getValue('TrainerClassAmount');
    const trainerclasslimits = this.romEntryFull.arrayEntries.get('TrainerDataClassCounts')!;

    const pointers: number[] = new Array(traineramount);
    for (let i = 0; i < traineramount; i++) {
      const pointer = readWord(this.rom, traineroffset + i * 2);
      pointers[i] = this.calculateOffset(this.bankOf(traineroffset), pointer);
    }

    // Get current movesets in case we need to reset them for certain trainer mons.
    const movesets = this.getMovesLearnt();

    let trainerIdx = 0;
    for (let i = 0; i < traineramount; i++) {
      let offs = pointers[i];
      const limit = trainerclasslimits[i];
      for (let trnum = 0; trnum < limit; trnum++) {
        const tr = trainerData[trainerIdx++];
        // Write their name
        const trnamelen = this.internalStringLength(tr.name!);
        this.writeFixedLengthString(tr.name!, offs, trnamelen + 1);
        offs += trnamelen + 1;
        // Write out new trainer data
        this.rom[offs++] = tr.poketype;
        for (let tpnum = 0; tpnum < tr.pokemon.length; tpnum++) {
          const tp = tr.pokemon[tpnum];
          this.rom[offs] = tp.level;
          this.rom[offs + 1] = tp.pokemon.number;
          offs += 2;
          if (tr.pokemonHaveItems()) {
            this.rom[offs] = tp.heldItem;
            offs++;
          }
          if (tr.pokemonHaveCustomMoves()) {
            if (tp.resetMoves) {
              const pokeMoves = RomFunctions.getMovesAtLevel(tp.pokemon.number, movesets, tp.level);
              for (let m = 0; m < 4; m++) {
                this.rom[offs + m] = pokeMoves[m];
              }
            } else {
              this.rom[offs] = tp.moves[0];
              this.rom[offs + 1] = tp.moves[1];
              this.rom[offs + 2] = tp.moves[2];
              this.rom[offs + 3] = tp.moves[3];
            }
            offs += 4;
          }
        }
        this.rom[offs] = 0xFF;
        offs++;
      }
    }
  }

  getTrainerNames(): string[] {
    const traineroffset = this.getValue('TrainerDataTableOffset');
    const traineramount = this.getValue('TrainerClassAmount');
    const trainerclasslimits = this.romEntryFull.arrayEntries.get('TrainerDataClassCounts')!;

    const pointers: number[] = new Array(traineramount);
    for (let i = 0; i < traineramount; i++) {
      const pointer = readWord(this.rom, traineroffset + i * 2);
      pointers[i] = this.calculateOffset(this.bankOf(traineroffset), pointer);
    }

    const allTrainers: string[] = [];
    for (let i = 0; i < traineramount; i++) {
      let offs = pointers[i];
      const limit = trainerclasslimits[i];
      for (let trnum = 0; trnum < limit; trnum++) {
        const name = this.readVariableLengthString(offs, false);
        allTrainers.push(name);
        offs += this.lengthOfStringAt(offs, false) + 1;
        const dataType = this.rom[offs] & 0xFF;
        offs++;
        while ((this.rom[offs] & 0xFF) !== 0xFF) {
          offs += 2;
          if (dataType === 2 || dataType === 3) {
            offs++;
          }
          if (dataType % 2 === 1) {
            offs += 4;
          }
        }
        offs++;
      }
    }
    return allTrainers;
  }

  setTrainerNames(trainerNames: string[]): void {
    if (this.getValue('CanChangeTrainerText') === 0) return;

    const traineroffset = this.getValue('TrainerDataTableOffset');
    const traineramount = this.getValue('TrainerClassAmount');
    const trainerclasslimits = this.romEntryFull.arrayEntries.get('TrainerDataClassCounts')!;

    const pointers: number[] = new Array(traineramount);
    for (let i = 0; i < traineramount; i++) {
      const pointer = readWord(this.rom, traineroffset + i * 2);
      pointers[i] = this.calculateOffset(this.bankOf(traineroffset), pointer);
    }

    // Build up new trainer data using old as a guideline.
    const offsetsInNew: number[] = new Array(traineramount).fill(0);
    let oInNewCurrent = 0;
    let trainerIdx = 0;
    const newData: number[] = [];

    for (let i = 0; i < traineramount; i++) {
      let offs = pointers[i];
      const limit = trainerclasslimits[i];
      offsetsInNew[i] = oInNewCurrent;
      for (let trnum = 0; trnum < limit; trnum++) {
        let newName = trainerNames[trainerIdx++];

        // The game uses 0xFF as a signifier for the end of the trainer data.
        // It ALSO uses 0xFF to encode the character "9". If a trainer name has
        // "9" in it, this causes strange side effects. Silently strip out
        // "9"s from trainer names to prevent this.
        newName = newName.replace(/9/g, '').trim();

        const newNameStr = this.translateString(newName);
        for (let b = 0; b < newNameStr.length; b++) {
          newData.push(newNameStr[b]);
        }
        newData.push(GBConstants.stringTerminator);
        oInNewCurrent += newNameStr.length + 1;
        offs += this.lengthOfStringAt(offs, false) + 1;
        const dataType = this.rom[offs] & 0xFF;
        offs++;
        newData.push(dataType);
        oInNewCurrent++;
        while ((this.rom[offs] & 0xFF) !== 0xFF) {
          newData.push(this.rom[offs], this.rom[offs + 1]);
          oInNewCurrent += 2;
          offs += 2;
          if (dataType === 2 || dataType === 3) {
            newData.push(this.rom[offs]);
            oInNewCurrent++;
            offs++;
          }
          if (dataType % 2 === 1) {
            newData.push(this.rom[offs], this.rom[offs + 1], this.rom[offs + 2], this.rom[offs + 3]);
            oInNewCurrent += 4;
            offs += 4;
          }
        }
        newData.push(0xFF);
        oInNewCurrent++;
        offs++;
      }
    }

    // Copy new data into ROM
    const tdBase = pointers[0];
    for (let i = 0; i < newData.length; i++) {
      this.rom[tdBase + i] = newData[i];
    }

    // Finally, update the pointers
    for (let i = 1; i < traineramount; i++) {
      const newOffset = tdBase + offsetsInNew[i];
      writeWord(this.rom, traineroffset + i * 2, this.makeGBPointer(newOffset));
    }
  }

  getTrainerClassNames(): string[] {
    const amount = this.getValue('TrainerClassAmount');
    let offset = this.getValue('TrainerClassNamesOffset');
    const trainerClassNames: string[] = [];
    for (let j = 0; j < amount; j++) {
      const name = this.readVariableLengthString(offset, false);
      offset += this.lengthOfStringAt(offset, false) + 1;
      trainerClassNames.push(name);
    }
    return trainerClassNames;
  }

  setTrainerClassNames(trainerClassNames: string[]): void {
    if (this.getValue('CanChangeTrainerText') === 0) return;
    const amount = this.getValue('TrainerClassAmount');
    let offset = this.getValue('TrainerClassNamesOffset');
    for (let j = 0; j < amount; j++) {
      const len = this.lengthOfStringAt(offset, false) + 1;
      const newName = trainerClassNames[j];
      this.writeFixedLengthString(newName, offset, len);
      offset += len;
    }
  }

  getDoublesTrainerClasses(): number[] {
    const doublesClasses = this.romEntryFull.arrayEntries.get('DoublesTrainerClasses');
    return doublesClasses ? [...doublesClasses] : [];
  }

  getTCNameLengthsByTrainer(): number[] {
    const traineramount = this.getValue('TrainerClassAmount');
    const trainerclasslimits = this.romEntryFull.arrayEntries.get('TrainerDataClassCounts')!;
    const tcNames = this.getTrainerClassNames();
    const tcLengthsByT: number[] = [];

    for (let i = 0; i < traineramount; i++) {
      const len = this.internalStringLength(tcNames[i]);
      for (let k = 0; k < trainerclasslimits[i]; k++) {
        tcLengthsByT.push(len);
      }
    }

    return tcLengthsByT;
  }

  fixedTrainerClassNamesLength(): boolean { return true; }

  trainerNameMode(): TrainerNameMode { return TrainerNameMode.MAX_LENGTH_WITH_CLASS; }

  maxTrainerNameLength(): number {
    return Gen2Constants.maxTrainerNameLength;
  }

  maxSumOfTrainerNameLengths(): number {
    return this.getValue('MaxSumOfTrainerNameLengths');
  }

  canChangeTrainerText(): boolean { return this.getValue('CanChangeTrainerText') > 0; }

  // -- TM/Moveset methods (Stream 4) --
  getMoves(): (Move | null)[] { return this.moves; }
  getTMMoves(): number[] {
    const tms: number[] = [];
    const offset = this.getValue('TMMovesOffset');
    for (let i = 1; i <= Gen2Constants.tmCount; i++) {
      tms.push(this.rom[offset + (i - 1)] & 0xff);
    }
    return tms;
  }

  getHMMoves(): number[] {
    const hms: number[] = [];
    const offset = this.getValue('TMMovesOffset');
    for (let i = 1; i <= Gen2Constants.hmCount; i++) {
      hms.push(this.rom[offset + Gen2Constants.tmCount + (i - 1)] & 0xff);
    }
    return hms;
  }

  setTMMoves(moveIndexes: number[]): void {
    const offset = this.getValue('TMMovesOffset');
    for (let i = 1; i <= Gen2Constants.tmCount; i++) {
      this.rom[offset + (i - 1)] = moveIndexes[i - 1] & 0xff;
    }
    // TM Text
    const moveNames = this.readMoveNames();
    for (const tte of this.romEntryFull.tmTexts) {
      const moveName = moveNames[moveIndexes[tte.number - 1]];
      const text = tte.template.replace('%m', moveName);
      this.writeVariableLengthString(text, tte.offset, true);
    }
  }
  getTMCount(): number { return 50; }
  getHMCount(): number { return 7; }
  getTMHMCompatibility(): Map<Pokemon, boolean[]> {
    const compat = new Map<Pokemon, boolean[]>();
    for (let i = 1; i <= Gen2Constants.pokemonCount; i++) {
      const baseStatsOffset =
        this.getValue('PokemonStatsOffset') + (i - 1) * Gen2Constants.baseStatsEntrySize;
      const pkmn = this.pokes[i];
      const flags = new Array<boolean>(
        Gen2Constants.tmCount + Gen2Constants.hmCount + 1,
      ).fill(false);
      for (let j = 0; j < 8; j++) {
        this.readByteIntoFlags(
          flags,
          j * 8 + 1,
          baseStatsOffset + Gen2Constants.bsTMHMCompatOffset + j,
        );
      }
      compat.set(pkmn, flags);
    }
    return compat;
  }

  setTMHMCompatibility(compatData: Map<Pokemon, boolean[]>): void {
    for (const [pkmn, flags] of compatData) {
      const baseStatsOffset =
        this.getValue('PokemonStatsOffset') +
        (pkmn.number - 1) * Gen2Constants.baseStatsEntrySize;
      for (let j = 0; j < 8; j++) {
        if (!this.romEntryFull.isCrystal || j !== 7) {
          this.rom[baseStatsOffset + Gen2Constants.bsTMHMCompatOffset + j] =
            this.getByteFromFlags(flags, j * 8 + 1);
        } else {
          // Move tutor data - preserve bits 1,2,3 of byte 7
          let changedByte = this.getByteFromFlags(flags, j * 8 + 1) & 0xff;
          const currentByte =
            this.rom[baseStatsOffset + Gen2Constants.bsTMHMCompatOffset + j];
          changedByte |= ((currentByte >> 1) & 0x01) << 1;
          changedByte |= ((currentByte >> 2) & 0x01) << 2;
          changedByte |= ((currentByte >> 3) & 0x01) << 3;
          this.rom[baseStatsOffset + Gen2Constants.bsTMHMCompatOffset + j] =
            changedByte & 0xff;
        }
      }
    }
  }
  hasMoveTutors(): boolean { return this.romEntryFull.isCrystal; }
  getMoveTutorMoves(): number[] {
    if (this.romEntryFull.isCrystal) {
      const mtMoves: number[] = [];
      const offsets = this.romEntryFull.arrayEntries.get('MoveTutorMoves');
      if (offsets) {
        for (const offset of offsets) {
          mtMoves.push(this.rom[offset] & 0xff);
        }
      }
      return mtMoves;
    }
    return [];
  }

  setMoveTutorMoves(newMoves: number[]): void {
    if (!this.romEntryFull.isCrystal) return;
    if (newMoves.length !== 3) return;
    const offsets = this.romEntryFull.arrayEntries.get('MoveTutorMoves');
    if (offsets) {
      let idx = 0;
      for (const offset of offsets) {
        this.rom[offset] = newMoves[idx] & 0xff;
        idx++;
      }
    }
    // Construct a new menu
    const menuOffset = this.getValue('MoveTutorMenuOffset');
    const menuNewSpace = this.getValue('MoveTutorMenuNewSpace');
    if (menuOffset > 0 && menuNewSpace > 0) {
      const moveNames = this.readMoveNames();
      const names = [
        moveNames[newMoves[0]], moveNames[newMoves[1]],
        moveNames[newMoves[2]], Gen2Constants.mtMenuCancelString,
      ];
      let wo = menuNewSpace;
      this.rom[wo++] = Gen2Constants.mtMenuInitByte;
      this.rom[wo++] = 0x4;
      for (let i = 0; i < 4; i++) {
        const trans = this.translateString(names[i]);
        this.rom.set(trans, wo);
        wo += trans.length;
        this.rom[wo++] = GBConstants.stringTerminator;
      }
      writeWord(this.rom, menuOffset, this.makeGBPointer(menuNewSpace));
    }
  }
  // randomizeMoveTutorMoves inherited from AbstractRomHandler
  getMoveTutorCompatibility(): Map<Pokemon, boolean[]> {
    if (!this.romEntryFull.isCrystal) return new Map();
    const compat = new Map<Pokemon, boolean[]>();
    for (let i = 1; i <= Gen2Constants.pokemonCount; i++) {
      const baseStatsOffset =
        this.getValue('PokemonStatsOffset') + (i - 1) * Gen2Constants.baseStatsEntrySize;
      const pkmn = this.pokes[i];
      const flags = new Array<boolean>(4).fill(false);
      const mtByte =
        this.rom[baseStatsOffset + Gen2Constants.bsMTCompatOffset] & 0xff;
      for (let j = 1; j <= 3; j++) {
        flags[j] = ((mtByte >> j) & 0x01) > 0;
      }
      compat.set(pkmn, flags);
    }
    return compat;
  }

  setMoveTutorCompatibility(compatData: Map<Pokemon, boolean[]>): void {
    if (!this.romEntryFull.isCrystal) return;
    for (const [pkmn, flags] of compatData) {
      const baseStatsOffset =
        this.getValue('PokemonStatsOffset') +
        (pkmn.number - 1) * Gen2Constants.baseStatsEntrySize;
      const origMtByte =
        this.rom[baseStatsOffset + Gen2Constants.bsMTCompatOffset] & 0xff;
      let mtByte = origMtByte & 0x01;
      for (let j = 1; j <= 3; j++) {
        mtByte |= flags[j] ? 1 << j : 0;
      }
      this.rom[baseStatsOffset + Gen2Constants.bsMTCompatOffset] = mtByte & 0xff;
    }
  }
  // randomizeMoveTutorCompatibility inherited from AbstractRomHandler
  fullMoveTutorCompatibility(): void {}
  ensureMoveTutorCompatSanity(): void {}
  ensureMoveTutorEvolutionSanity(): void {}
  copyMoveTutorCompatibilityToCosmeticFormes(): void {}
  getMovesLearnt(): Map<number, MoveLearnt[]> {
    const movesets = new Map<number, MoveLearnt[]>();
    const pointersOffset = this.getValue('PokemonMovesetsTableOffset');
    for (let i = 1; i <= Gen2Constants.pokemonCount; i++) {
      const pointer = readWord(this.rom, pointersOffset + (i - 1) * 2);
      let realPointer = this.calculateOffset(this.bankOf(pointersOffset), pointer);
      // Skip over evolution data
      while (this.rom[realPointer] !== 0) {
        if ((this.rom[realPointer] & 0xFF) === 5) {
          realPointer += 4;
        } else {
          realPointer += 3;
        }
      }
      const ourMoves: MoveLearnt[] = [];
      realPointer++;
      while (this.rom[realPointer] !== 0) {
        const learnt = new MoveLearnt();
        learnt.level = this.rom[realPointer] & 0xFF;
        learnt.move = this.rom[realPointer + 1] & 0xFF;
        ourMoves.push(learnt);
        realPointer += 2;
      }
      movesets.set(this.pokes[i].number, ourMoves);
    }
    return movesets;
  }

  setMovesLearnt(movesets: Map<number, MoveLearnt[]>): void {
    this.writeEvosAndMovesLearnt(false, movesets);
  }
  getEggMoves(): Map<number, number[]> {
    const eggMoves = new Map<number, number[]>();
    const pointersOffset = this.getValue('EggMovesTableOffset');
    const baseOffset = Math.floor(pointersOffset / 0x1000) * 0x1000;
    for (let i = 1; i <= Gen2Constants.pokemonCount; i++) {
      const eggMovePointer = readWord(this.rom, pointersOffset + (i - 1) * 2);
      let eggMoveOffset = baseOffset + (eggMovePointer % 0x1000);
      const moves: number[] = [];
      let val = this.rom[eggMoveOffset] & 0xff;
      while (val !== 0xff) {
        moves.push(val);
        eggMoveOffset++;
        val = this.rom[eggMoveOffset] & 0xff;
      }
      if (moves.length > 0) {
        eggMoves.set(i, moves);
      }
    }
    return eggMoves;
  }

  setEggMoves(eggMoves: Map<number, number[]>): void {
    const pointersOffset = this.getValue('EggMovesTableOffset');
    const baseOffset = Math.floor(pointersOffset / 0x1000) * 0x1000;
    for (let i = 1; i <= Gen2Constants.pokemonCount; i++) {
      const eggMovePointer = readWord(this.rom, pointersOffset + (i - 1) * 2);
      let eggMoveOffset = baseOffset + (eggMovePointer % 0x1000);
      if (eggMoves.has(i)) {
        const moves = eggMoves.get(i)!;
        for (const move of moves) {
          this.rom[eggMoveOffset] = move & 0xff;
          eggMoveOffset++;
        }
      }
    }
  }
  // randomizeEggMoves inherited from AbstractRomHandler
  // getMoveSelectionPoolAtLevel inherited from AbstractRomHandler

  // -- Items/Trades (Stream 5) --
  getItemNames(): string[] { return this.itemNames; }
  getAllowedItems(): ItemList { return this.allowedItems; }
  getNonBadItems(): ItemList { return this.nonBadItems; }
  getEvolutionItems(): number[] { return []; }
  getUniqueNoSellItems(): number[] { return []; }
  getRegularShopItems(): number[] { return []; }
  getOPShopItems(): number[] { return []; }
  hasShopRandomization(): boolean { return false; }
  getShopItems(): Map<number, Shop> { return new Map(); }
  setShopItems(_items: Map<number, Shop>): void {}
  setShopPrices(): void {}
  getRequiredFieldTMs(): number[] { return Gen2Constants.requiredFieldTMs as number[]; }

  getCurrentFieldTMs(): number[] {
    const fieldTMs: number[] = [];
    for (const offset of this.itemOffs) {
      const itemHere = this.rom[offset] & 0xFF;
      if (Gen2Constants.allowedItems.isTM(itemHere)) {
        let thisTM: number;
        if (itemHere >= Gen2Constants.tmBlockOneIndex
            && itemHere < Gen2Constants.tmBlockOneIndex + Gen2Constants.tmBlockOneSize) {
          thisTM = itemHere - Gen2Constants.tmBlockOneIndex + 1;
        } else if (itemHere >= Gen2Constants.tmBlockTwoIndex
            && itemHere < Gen2Constants.tmBlockTwoIndex + Gen2Constants.tmBlockTwoSize) {
          thisTM = itemHere - Gen2Constants.tmBlockTwoIndex + 1 + Gen2Constants.tmBlockOneSize;
        } else {
          thisTM = itemHere - Gen2Constants.tmBlockThreeIndex + 1 + Gen2Constants.tmBlockOneSize
              + Gen2Constants.tmBlockTwoSize;
        }
        if (!fieldTMs.includes(thisTM)) {
          fieldTMs.push(thisTM);
        }
      }
    }
    return fieldTMs;
  }

  setFieldTMs(fieldTMs: number[]): void {
    const iterTMs = fieldTMs[Symbol.iterator]();
    const givenTMs = new Array<number>(256).fill(0);
    for (const offset of this.itemOffs) {
      const itemHere = this.rom[offset] & 0xFF;
      if (Gen2Constants.allowedItems.isTM(itemHere)) {
        if (givenTMs[itemHere] !== 0) {
          this.rom[offset] = givenTMs[itemHere] & 0xFF;
        } else {
          const next = iterTMs.next();
          if (next.done) break;
          let tm = next.value;
          if (tm >= 1 && tm <= Gen2Constants.tmBlockOneSize) {
            tm += Gen2Constants.tmBlockOneIndex - 1;
          } else if (tm >= Gen2Constants.tmBlockOneSize + 1
              && tm <= Gen2Constants.tmBlockOneSize + Gen2Constants.tmBlockTwoSize) {
            tm += Gen2Constants.tmBlockTwoIndex - 1 - Gen2Constants.tmBlockOneSize;
          } else {
            tm += Gen2Constants.tmBlockThreeIndex - 1 - Gen2Constants.tmBlockOneSize
                - Gen2Constants.tmBlockTwoSize;
          }
          givenTMs[itemHere] = tm;
          this.rom[offset] = tm & 0xFF;
        }
      }
    }
  }

  getRegularFieldItems(): number[] {
    const fieldItems: number[] = [];
    for (const offset of this.itemOffs) {
      const itemHere = this.rom[offset] & 0xFF;
      if (Gen2Constants.allowedItems.isAllowed(itemHere) && !Gen2Constants.allowedItems.isTM(itemHere)) {
        fieldItems.push(itemHere);
      }
    }
    return fieldItems;
  }

  setRegularFieldItems(items: number[]): void {
    const iterItems = items[Symbol.iterator]();
    for (const offset of this.itemOffs) {
      const itemHere = this.rom[offset] & 0xFF;
      if (Gen2Constants.allowedItems.isAllowed(itemHere) && !Gen2Constants.allowedItems.isTM(itemHere)) {
        const next = iterItems.next();
        if (next.done) break;
        this.rom[offset] = next.value & 0xFF;
      }
    }
  }

  getIngameTrades(): IngameTrade[] {
    const trades: IngameTrade[] = [];
    const tableOffset = this.getValue('TradeTableOffset');
    const tableSize = this.getValue('TradeTableSize');
    const nicknameLength = this.getValue('TradeNameLength');
    const otLength = this.getValue('TradeOTLength');
    const unused = this.romEntryFull.arrayEntries.get('TradesUnused') || [];
    let unusedOffset = 0;
    let entryLength = nicknameLength + otLength + 9;
    if (entryLength % 2 !== 0) {
      entryLength++;
    }
    for (let entry = 0; entry < tableSize; entry++) {
      if (unusedOffset < unused.length && unused[unusedOffset] === entry) {
        unusedOffset++;
        continue;
      }
      const trade = new IngameTrade();
      const entryOffset = tableOffset + entry * entryLength;
      trade.requestedPokemon = this.pokes[this.rom[entryOffset + 1] & 0xFF];
      trade.givenPokemon = this.pokes[this.rom[entryOffset + 2] & 0xFF];
      trade.nickname = this.readFixedLengthString(entryOffset + 3, nicknameLength);
      const atkdef = this.rom[entryOffset + 3 + nicknameLength] & 0xFF;
      const spdspc = this.rom[entryOffset + 4 + nicknameLength] & 0xFF;
      trade.ivs = [(atkdef >> 4) & 0xF, atkdef & 0xF, (spdspc >> 4) & 0xF, spdspc & 0xF];
      trade.item = this.rom[entryOffset + 5 + nicknameLength] & 0xFF;
      trade.otId = readWord(this.rom, entryOffset + 6 + nicknameLength);
      trade.otName = this.readFixedLengthString(entryOffset + 8 + nicknameLength, otLength);
      trades.push(trade);
    }
    return trades;
  }

  setIngameTrades(trades: IngameTrade[]): void {
    const tableOffset = this.getValue('TradeTableOffset');
    const tableSize = this.getValue('TradeTableSize');
    const nicknameLength = this.getValue('TradeNameLength');
    const otLength = this.getValue('TradeOTLength');
    const unused = this.romEntryFull.arrayEntries.get('TradesUnused') || [];
    let unusedOffset = 0;
    let entryLength = nicknameLength + otLength + 9;
    if (entryLength % 2 !== 0) {
      entryLength++;
    }
    let tradeOffset = 0;
    for (let entry = 0; entry < tableSize; entry++) {
      if (unusedOffset < unused.length && unused[unusedOffset] === entry) {
        unusedOffset++;
        continue;
      }
      const trade = trades[tradeOffset++];
      const entryOff = tableOffset + entry * entryLength;
      this.rom[entryOff + 1] = trade.requestedPokemon.number & 0xFF;
      this.rom[entryOff + 2] = trade.givenPokemon.number & 0xFF;
      if (this.getValue('CanChangeTrainerText') > 0) {
        this.writeFixedLengthString(trade.nickname, entryOff + 3, nicknameLength);
      }
      this.rom[entryOff + 3 + nicknameLength] = ((trade.ivs[0] << 4) | trade.ivs[1]) & 0xFF;
      this.rom[entryOff + 4 + nicknameLength] = ((trade.ivs[2] << 4) | trade.ivs[3]) & 0xFF;
      this.rom[entryOff + 5 + nicknameLength] = trade.item & 0xFF;
      writeWord(this.rom, entryOff + 6 + nicknameLength, trade.otId);
      if (this.getValue('CanChangeTrainerText') > 0) {
        this.writeFixedLengthString(trade.otName, entryOff + 8 + nicknameLength, otLength);
      }
      this.rom[entryOff + 8 + nicknameLength + otLength] = 0;
    }
  }

  // -- Static Pokemon (Stream 1) --
  getStaticPokemon(): StaticEncounter[] {
    const statics: StaticEncounter[] = [];
    let staticEggOffsets: number[] = [];
    if (this.romEntryFull.arrayEntries.has('StaticEggPokemonOffsets')) {
      staticEggOffsets = this.romEntryFull.arrayEntries.get('StaticEggPokemonOffsets')!;
    }
    if (this.getValue('StaticPokemonSupport') > 0) {
      for (let i = 0; i < this.romEntryFull.staticPokemon.length; i++) {
        const currentOffset = i;
        const sp = this.romEntryFull.staticPokemon[i];
        const se = new StaticEncounter();
        se.pkmn = sp.getPokemon(this.rom, this.pokes);
        se.level = sp.getLevel(this.rom, 0);
        se.isEgg = staticEggOffsets.includes(currentOffset);
        statics.push(se);
      }
    }
    if (this.getValue('StaticPokemonOddEggOffset') > 0) {
      const oeOffset = this.getValue('StaticPokemonOddEggOffset');
      const oeSize = this.getValue('StaticPokemonOddEggDataSize');
      for (let i = 0; i < Gen2Constants.oddEggPokemonCount; i++) {
        const se = new StaticEncounter();
        se.pkmn = this.pokes[this.rom[oeOffset + i * oeSize] & 0xFF];
        se.isEgg = true;
        statics.push(se);
      }
    }
    return statics;
  }

  setStaticPokemon(staticPokemon: StaticEncounter[]): boolean {
    if (this.getValue('StaticPokemonSupport') === 0) {
      return false;
    }
    if (!this.havePatchedFleeing) {
      this.patchFleeing();
    }

    let desiredSize = this.romEntryFull.staticPokemon.length;
    if (this.getValue('StaticPokemonOddEggOffset') > 0) {
      desiredSize += Gen2Constants.oddEggPokemonCount;
    }

    if (staticPokemon.length !== desiredSize) {
      return false;
    }

    let idx = 0;
    for (let i = 0; i < this.romEntryFull.staticPokemon.length; i++) {
      const currentStatic = staticPokemon[idx++];
      const sp = this.romEntryFull.staticPokemon[i];
      const gcNameLength = this.getValue('GameCornerPokemonNameLength');
      sp.setPokemon(this.rom, currentStatic.pkmn, (name, _length, offset) => this.writePaddedPokemonName(name, gcNameLength, offset));
      sp.setLevel(this.rom, currentStatic.level, 0);
    }

    if (this.getValue('StaticPokemonOddEggOffset') > 0) {
      const oeOffset = this.getValue('StaticPokemonOddEggOffset');
      const oeSize = this.getValue('StaticPokemonOddEggDataSize');
      for (let i = 0; i < Gen2Constants.oddEggPokemonCount; i++) {
        const oddEggPokemonNumber = staticPokemon[idx++].pkmn.number;
        this.rom[oeOffset + i * oeSize] = oddEggPokemonNumber & 0xFF;
        this.setMovesForOddEggPokemon(oddEggPokemonNumber, oeOffset + i * oeSize);
      }
    }

    return true;
  }

  private setMovesForOddEggPokemon(oddEggPokemonNumber: number, oddEggPokemonOffset: number): void {
    // Determine the level 5 moveset, minus Dizzy Punch
    const movesets = this.getMovesLearnt();
    const allMoves = this.getMoves();
    const moveset = movesets.get(oddEggPokemonNumber) || [];
    const level5Moveset: number[] = [];
    let currentMoveIndex = 0;
    while (moveset.length > currentMoveIndex && moveset[currentMoveIndex].level <= 5) {
      if (level5Moveset.length === 4) {
        level5Moveset.shift();
      }
      level5Moveset.push(moveset[currentMoveIndex].move);
      currentMoveIndex++;
    }

    // Now add Dizzy Punch and write the moveset and PP
    if (level5Moveset.length === 4) {
      level5Moveset.shift();
    }
    level5Moveset.push(Moves.dizzyPunch);
    for (let i = 0; i < 4; i++) {
      let move = 0;
      let pp = 0;
      if (level5Moveset.length > 0) {
        move = level5Moveset.shift()!;
        if (allMoves[move]) {
          pp = allMoves[move]!.pp;
        }
      }
      this.rom[oddEggPokemonOffset + 2 + i] = move & 0xFF;
      this.rom[oddEggPokemonOffset + 23 + i] = pp & 0xFF;
    }
  }
  canChangeStaticPokemon(): boolean { return this.getValue('StaticPokemonSupport') > 0; }
  hasStaticAltFormes(): boolean { return false; }
  bannedForStaticPokemon(): Pokemon[] {
    const banned: Pokemon[] = [];
    if (this.pokes[201]) banned.push(this.pokes[201]);
    return banned;
  }
  hasMainGameLegendaries(): boolean { return false; }
  getMainGameLegendaries(): number[] { return []; }
  getSpecialMusicStatics(): number[] { return []; }
  applyCorrectStaticMusic(_specialMusicStaticChanges: Map<number, number>): void {}
  hasStaticMusicFix(): boolean { return false; }
  getTotemPokemon(): TotemPokemon[] { return []; }
  setTotemPokemon(_totems: TotemPokemon[]): void {}
  randomizeTotemPokemon(_settings: Settings): void {}

  // -- Misc methods (Stream 6) --
  getROMName(): string {
    if (this.isVietCrystal) return Gen2Constants.vietCrystalROMName;
    return this.romEntryFull.name;
  }
  getROMCode(): string { return this.romEntryFull.romCode; }
  getSupportLevel(): string { return 'Complete'; }
  getDefaultExtension(): string { return 'gbc'; }
  generationOfPokemon(): number { return 2; }
  abilitiesPerPokemon(): number { return 0; }
  highestAbilityIndex(): number { return 0; }
  getAbilityVariations(): Map<number, number[]> { return new Map(); }
  hasMegaEvolutions(): boolean { return false; }
  hasDVs(): boolean { return true; }
  supportsFourStartingMoves(): boolean { return this.getValue('SupportsFourStartingMoves') > 0; }
  isRomValid(): boolean { return this.romEntryFull.expectedCRC32 === -1 || this.actualCRC32 === this.romEntryFull.expectedCRC32; }
  isEffectivenessUpdated(): boolean { return this.effectivenessUpdated; }
  hasPhysicalSpecialSplit(): boolean { return false; }
  getUpdatedPokemonStats(generation: number): Map<number, StatChange> {
    return GlobalConstants.getStatChanges(generation);
  }
  internalStringLength(s: string): number { return this.translateString(s).length; }
  randomizeIntroPokemon(): void {
    let pokemon = this.random.nextInt(Gen2Constants.pokemonCount) + 1;
    while (pokemon === Species.unown) {
      pokemon = this.random.nextInt(Gen2Constants.pokemonCount) + 1;
    }
    this.rom[this.getValue('IntroSpriteOffset')] = pokemon & 0xFF;
    this.rom[this.getValue('IntroCryOffset')] = pokemon & 0xFF;
  }
  getMascotImage(): Uint8Array | null { return null; }

  // File/update stubs (not applicable for GBC)
  hasGameUpdateLoaded(): boolean { return false; }
  loadGameUpdate(_filename: string): boolean { return false; }
  removeGameUpdate(): void {}
  getGameUpdateVersion(): string | null { return null; }
  printRomDiagnostics(logStream: LogStream): void {
    logStream.println('File name: ' + this.loadedFilename());
    logStream.println('ROM name: ' + this.getROMName());
    logStream.println('ROM code: ' + this.getROMCode());
    logStream.println('Type: ' + (this.romEntryFull.isCrystal ? 'Crystal' : 'Gold/Silver'));
  }
  // saveRomFile and saveRomDirectory are provided by AbstractGBRomHandler

  miscTweaksAvailable(): number {
    let available = MiscTweak.LOWER_CASE_POKEMON_NAMES.getValue();
    available |= MiscTweak.UPDATE_TYPE_EFFECTIVENESS.getValue();
    if (this.romEntryFull.codeTweaks.get('BWXPTweak') != null) {
      available |= MiscTweak.BW_EXP_PATCH.getValue();
    }
    if (this.getValue('TextDelayFunctionOffset') !== 0) {
      available |= MiscTweak.FASTEST_TEXT.getValue();
    }
    if (this.romEntryFull.arrayEntries.has('CatchingTutorialOffsets')) {
      available |= MiscTweak.RANDOMIZE_CATCHING_TUTORIAL.getValue();
    }
    available |= MiscTweak.BAN_LUCKY_EGG.getValue();
    return available;
  }
  applyMiscTweak(tweak: { value: number }): void {
    if (tweak.value === MiscTweak.BW_EXP_PATCH.value) {
      this.applyBWEXPPatch();
    } else if (tweak.value === MiscTweak.FASTEST_TEXT.value) {
      this.applyFastestTextPatch();
    } else if (tweak.value === MiscTweak.LOWER_CASE_POKEMON_NAMES.value) {
      this.applyCamelCaseNames();
    } else if (tweak.value === MiscTweak.RANDOMIZE_CATCHING_TUTORIAL.value) {
      this.randomizeCatchingTutorial();
    } else if (tweak.value === MiscTweak.BAN_LUCKY_EGG.value) {
      this.allowedItems.banSingles(Gen2Items.luckyEgg);
      this.nonBadItems.banSingles(Gen2Items.luckyEgg);
    } else if (tweak.value === MiscTweak.UPDATE_TYPE_EFFECTIVENESS.value) {
      this.updateTypeEffectiveness();
    }
  }
  private randomizeCatchingTutorial(): void {
    if (this.romEntryFull.arrayEntries.has('CatchingTutorialOffsets')) {
      let pokemon = this.random.nextInt(Gen2Constants.pokemonCount) + 1;
      while (pokemon === Species.unown) {
        pokemon = this.random.nextInt(Gen2Constants.pokemonCount) + 1;
      }
      const offsets = this.romEntryFull.arrayEntries.get('CatchingTutorialOffsets')!;
      for (const offset of offsets) {
        this.rom[offset] = pokemon & 0xFF;
      }
    }
  }
  private applyBWEXPPatch(): void {
    const patchName = this.romEntryFull.codeTweaks.get('BWXPTweak');
    if (patchName == null) return;
    FileFunctions.applyPatch(this.rom, patchName);
  }
  private applyFastestTextPatch(): void {
    if (this.getValue('TextDelayFunctionOffset') !== 0) {
      this.rom[this.getValue('TextDelayFunctionOffset')] = GBConstants.gbZ80Ret;
    }
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
  private updateTypeEffectiveness(): void {
    const table = this.readTypeEffectivenessTable();
    this.log('--Updating Type Effectiveness--');
    for (const r of table) {
      if (r.attacker === 'GHOST' && r.defender === 'STEEL') {
        r.effectiveness = Effectiveness.NEUTRAL;
        this.log('Replaced: Ghost not very effective vs Steel => Ghost neutral vs Steel');
      } else if (r.attacker === 'DARK' && r.defender === 'STEEL') {
        r.effectiveness = Effectiveness.NEUTRAL;
        this.log('Replaced: Dark not very effective vs Steel => Dark neutral vs Steel');
      }
    }
    this.logBlankLine();
    this.writeTypeEffectivenessTable(table);
    this.effectivenessUpdated = true;
  }
  private readTypeEffectivenessTable(): TypeRelationship[] {
    const result: TypeRelationship[] = [];
    let off = this.getValue('TypeEffectivenessOffset');
    let at = this.rom[off] & 0xFF;
    while (at !== 0xFE) {
      const dt = this.rom[off + 1] & 0xFF;
      const ei = this.rom[off + 2] & 0xFF;
      const attacking = Gen2Constants.typeTable[at];
      const defending = Gen2Constants.typeTable[dt];
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
  private writeTypeEffectivenessTable(table: TypeRelationship[]): void {
    let off = this.getValue('TypeEffectivenessOffset');
    for (const r of table) {
      this.rom[off] = Gen2Constants.typeToByte(r.attacker);
      this.rom[off + 1] = Gen2Constants.typeToByte(r.defender);
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

  removeImpossibleEvolutions(_settings: Settings): void {
    // no move evos in gen 2, so no need to check for those
    for (const pkmn of this.pokes) {
      if (pkmn != null) {
        for (const evol of pkmn.evolutionsFrom) {
          if (evol.type === EvolutionType.TRADE || evol.type === EvolutionType.TRADE_ITEM) {
            if (evol.from.number === Species.slowpoke) {
              // Slowpoke: Make water stone => Slowking
              evol.type = EvolutionType.STONE;
              evol.extraInfo = Gen2Items.waterStone;
              this.impossibleEvolutionUpdates.add(
                new EvolutionUpdate(evol.from, evol.to, EvolutionType.STONE, this.itemNames[Gen2Items.waterStone], false, false));
            } else if (evol.from.number === Species.seadra) {
              // Seadra: level 40
              evol.type = EvolutionType.LEVEL;
              evol.extraInfo = 40;
              this.addEvoUpdateLevel(this.impossibleEvolutionUpdates, evol);
            } else if (evol.from.number === Species.poliwhirl || evol.type === EvolutionType.TRADE) {
              // Poliwhirl or any of the original 4 trade evos: Level 37
              evol.type = EvolutionType.LEVEL;
              evol.extraInfo = 37;
              this.addEvoUpdateLevel(this.impossibleEvolutionUpdates, evol);
            } else {
              // A new trade evo of a single stage Pokemon: level 30
              evol.type = EvolutionType.LEVEL;
              evol.extraInfo = 30;
              this.addEvoUpdateLevel(this.impossibleEvolutionUpdates, evol);
            }
          }
        }
      }
    }
  }

  makeEvolutionsEasier(_settings: Settings): void {
    // Reduce the amount of happiness required to evolve.
    const offset = this.findInRom(Gen2Constants.friendshipValueForEvoLocator);
    if (offset > 0) {
      // The thing we're looking at is actually one byte before what we want to change
      const adjustedOffset = offset + 1;
      if ((this.rom[adjustedOffset] & 0xFF) === 220) {
        this.rom[adjustedOffset] = 160;
      }
    }
  }

  removeTimeBasedEvolutions(): void {
    for (const pkmn of this.pokes) {
      if (pkmn != null) {
        for (const evol of pkmn.evolutionsFrom) {
          // In Gen 2, only Eevee has a time-based evolution.
          if (evol.type === EvolutionType.HAPPINESS_DAY) {
            // Eevee: Make sun stone => Espeon
            evol.type = EvolutionType.STONE;
            evol.extraInfo = Gen2Items.sunStone;
            this.timeBasedEvolutionUpdates.add(
              new EvolutionUpdate(evol.from, evol.to, EvolutionType.STONE, this.itemNames[Gen2Items.sunStone], false, false));
          } else if (evol.type === EvolutionType.HAPPINESS_NIGHT) {
            // Eevee: Make moon stone => Umbreon
            evol.type = EvolutionType.STONE;
            evol.extraInfo = Gen2Items.moonStone;
            this.timeBasedEvolutionUpdates.add(
              new EvolutionUpdate(evol.from, evol.to, EvolutionType.STONE, this.itemNames[Gen2Items.moonStone], false, false));
          }
        }
      }
    }
  }
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

  getGameBreakingMoves(): number[] { return Gen2Constants.brokenMoves as number[]; }
  getIllegalMoves(): number[] { return this.isVietCrystal ? Gen2Constants.illegalVietCrystalMoves as number[] : []; }
  getFieldMoves(): number[] { return Gen2Constants.fieldMoves as number[]; }
  getEarlyRequiredHMMoves(): number[] { return Gen2Constants.earlyRequiredHMMoves as number[]; }
}

// ---------------------------------------------------------------------------
// Gen2RomHandlerFactory
// ---------------------------------------------------------------------------

export class Gen2RomHandlerFactory extends RomHandlerFactory {
  private romEntries: Gen2RomEntryFull[];

  constructor(romEntries?: Gen2RomEntryFull[]) {
    super();
    if (romEntries) {
      this.romEntries = romEntries;
    } else {
      try {
        const iniPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/com/dabomstew/pkrandom/config/gen2_offsets.ini');
        if (fs.existsSync(iniPath)) {
          const iniText = fs.readFileSync(iniPath, 'utf-8');
          this.romEntries = parseGen2OffsetsIni(iniText);
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
    return new Gen2RomHandler(random, log, this.romEntries) as unknown as RomHandler;
  }
}
