/*----------------------------------------------------------------------------*/
/*--  gen5-rom-handler.ts - randomizer handler for B/W/B2/W2.               --*/
/*--                                                                        --*/
/*--  Part of "Universal Pokemon Randomizer ZX" by the UPR-ZX team          --*/
/*--  Originally part of "Universal Pokemon Randomizer" by Dabomstew        --*/
/*--  Pokemon and any associated names and the like are                     --*/
/*--  trademark and (C) Nintendo 1996-2020.                                 --*/
/*--                                                                        --*/
/*--  Ported to TypeScript from Java.                                       --*/
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

import { NARCArchive } from '../nds/narc-archive';
import * as Gen5Constants from '../constants/gen5-constants';
import * as GlobalConstants from '../constants/global-constants';
import * as Moves from '../constants/moves';
import { Pokemon } from '../pokemon/pokemon';
import { Move } from '../pokemon/move';
import { MoveCategory } from '../pokemon/move-category';
import { Type } from '../pokemon/type';
import { ExpCurve, expCurveFromByte, expCurveToByte } from '../pokemon/exp-curve';
import { StatChangeMoveType } from '../pokemon/stat-change-move-type';
import { StatChangeType } from '../pokemon/stat-change-type';
import { StatusType } from '../pokemon/status-type';
import { StatusMoveType } from '../pokemon/status-move-type';
import { CriticalChance } from '../pokemon/critical-chance';
import { FormeInfo } from '../pokemon/forme-info';
import { FileFunctions } from '../utils/file-functions';
import * as PPTxtHandler from '../text/pptxt-handler';

// ---------------------------------------------------------------------------
// Helper: read / write little-endian 16-bit values from a Uint8Array
// ---------------------------------------------------------------------------

function readWord(data: Uint8Array, offset: number): number {
  return (data[offset] & 0xff) | ((data[offset + 1] & 0xff) << 8);
}

function writeWord(data: Uint8Array, offset: number, value: number): void {
  data[offset] = value & 0xff;
  data[offset + 1] = (value >> 8) & 0xff;
}

function readFullInt(data: Uint8Array, offset: number): number {
  return (
    ((data[offset] & 0xff) |
      ((data[offset + 1] & 0xff) << 8) |
      ((data[offset + 2] & 0xff) << 16) |
      ((data[offset + 3] & 0xff) << 24)) >> 0
  );
}

// ---------------------------------------------------------------------------
// Type mapping helpers
// ---------------------------------------------------------------------------

function typeFromTable(index: number): Type | null {
  const name = Gen5Constants.typeTable[index];
  if (name == null) return null;
  return Type[name as keyof typeof Type] ?? null;
}

function typeToInternalByte(type: Type): number {
  return Gen5Constants.typeToByte(Type[type]);
}

// ---------------------------------------------------------------------------
// Move category mapping (Gen5 order: 0=Status, 1=Physical, 2=Special)
// ---------------------------------------------------------------------------

const moveCategoryIndices: MoveCategory[] = [
  MoveCategory.STATUS,
  MoveCategory.PHYSICAL,
  MoveCategory.SPECIAL,
];

// ---------------------------------------------------------------------------
// RomEntry & related helper types (parsed from gen5_offsets.ini)
// ---------------------------------------------------------------------------

interface OffsetWithinEntry {
  entry: number;
  offset: number;
}

interface RomFileEntry {
  path: string;
  expectedCRC32: number;
}

export interface Gen5RomEntry {
  name: string;
  romCode: string;
  version: number;
  romType: number;
  arm9ExpectedCRC32: number;
  staticPokemonSupport: boolean;
  copyStaticPokemon: boolean;
  copyRoamingPokemon: boolean;
  copyTradeScripts: boolean;
  isBlack: boolean;
  strings: Map<string, string>;
  numbers: Map<string, number>;
  tweakFiles: Map<string, string>;
  arrayEntries: Map<string, number[]>;
  offsetArrayEntries: Map<string, OffsetWithinEntry[]>;
  files: Map<string, RomFileEntry>;
  overlayExpectedCRC32s: Map<number, number>;
}

function createDefaultRomEntry(): Gen5RomEntry {
  return {
    name: '',
    romCode: '',
    version: 0,
    romType: Gen5Constants.Type_BW,
    arm9ExpectedCRC32: 0,
    staticPokemonSupport: false,
    copyStaticPokemon: false,
    copyRoamingPokemon: false,
    copyTradeScripts: false,
    isBlack: false,
    strings: new Map(),
    numbers: new Map(),
    tweakFiles: new Map(),
    arrayEntries: new Map(),
    offsetArrayEntries: new Map(),
    files: new Map(),
    overlayExpectedCRC32s: new Map(),
  };
}

function romEntryGetInt(entry: Gen5RomEntry, key: string): number {
  return entry.numbers.get(key) ?? 0;
}

function romEntryGetString(entry: Gen5RomEntry, key: string): string {
  return entry.strings.get(key) ?? '';
}

function romEntryGetFile(entry: Gen5RomEntry, key: string): string {
  const fe = entry.files.get(key);
  return fe?.path ?? '';
}

// ---------------------------------------------------------------------------
// ROM detection (Factory-equivalent)
// ---------------------------------------------------------------------------

/** Known ROM codes for Gen 5 games. */
const KNOWN_ROM_CODES: ReadonlySet<string> = new Set([
  'IRBO', 'IRBJ', 'IRBF', 'IRBD', 'IRBI', 'IRBS', 'IRBK', // Black
  'IRAO', 'IRAJ', 'IRAF', 'IRAD', 'IRAI', 'IRAS', 'IRAK', // White
  'IREO', 'IREJ', 'IREF', 'IRED', 'IREI', 'IRES', 'IREK', // Black 2
  'IRDO', 'IRDJ', 'IRDF', 'IRDD', 'IRDI', 'IRDS', 'IRDK', // White 2
]);

/**
 * Detect whether a ROM code + version pair corresponds to a supported Gen 5 ROM.
 */
export function detectGen5Rom(romCode: string | null, _version?: number): boolean {
  if (romCode == null) return false;
  return KNOWN_ROM_CODES.has(romCode);
}

/**
 * Determine the rom type (BW / BW2) from the ROM code.
 */
export function romTypeFromCode(romCode: string): number {
  if (romCode.startsWith('IRE') || romCode.startsWith('IRD')) {
    return Gen5Constants.Type_BW2;
  }
  return Gen5Constants.Type_BW;
}

// ---------------------------------------------------------------------------
// Main handler class
// ---------------------------------------------------------------------------

export class Gen5RomHandler {
  // --- state ---
  romEntry: Gen5RomEntry;
  arm9: Uint8Array = new Uint8Array(0);
  pokes: (Pokemon | null)[] = [];
  moves: (Move | null)[] = [];
  pokeNarc: NARCArchive | null = null;
  moveNarc: NARCArchive | null = null;
  stringsNarc: NARCArchive | null = null;
  storyTextNarc: NARCArchive | null = null;
  scriptNarc: NARCArchive | null = null;
  formeMappings: Map<number, FormeInfo> = new Map();
  perfectAccuracy = 0;

  constructor(romEntry?: Gen5RomEntry) {
    this.romEntry = romEntry ?? createDefaultRomEntry();
  }

  // -----------------------------------------------------------------------
  // Pokemon loading / saving
  // -----------------------------------------------------------------------

  loadPokemonStats(
    pokeNarc: NARCArchive,
    pokeNames: string[],
    formeMappings?: Map<number, FormeInfo>,
  ): void {
    this.pokeNarc = pokeNarc;
    if (formeMappings) {
      this.formeMappings = formeMappings;
    }
    const formeCount = Gen5Constants.getFormeCount(this.romEntry.romType);
    this.pokes = new Array<Pokemon | null>(
      Gen5Constants.pokemonCount + formeCount + 1,
    ).fill(null);

    for (let i = 1; i <= Gen5Constants.pokemonCount; i++) {
      const pk = new Pokemon();
      pk.number = i;
      this.loadBasicPokeStats(pk, pokeNarc.files[i]);
      pk.name = pokeNames[i] ?? `Pokemon${i}`;
      this.pokes[i] = pk;
    }

    // Load alternate formes
    let idx = Gen5Constants.pokemonCount + 1;
    for (const [k, fi] of this.formeMappings) {
      if (idx >= this.pokes.length) break;
      const pk = new Pokemon();
      pk.number = idx;
      this.loadBasicPokeStats(pk, pokeNarc.files[k]);
      pk.name = pokeNames[fi.baseForme] ?? `Pokemon${fi.baseForme}`;
      pk.baseForme = this.pokes[fi.baseForme] ?? null;
      pk.formeNumber = fi.formeNumber;
      pk.formeSpriteIndex =
        fi.formeSpriteOffset +
        Gen5Constants.pokemonCount +
        Gen5Constants.getNonPokemonBattleSpriteCount(this.romEntry.romType);
      pk.formeSuffix = Gen5Constants.getFormeSuffix(k, this.romEntry.romType);
      this.pokes[idx] = pk;
      idx++;
    }
  }

  loadBasicPokeStats(pkmn: Pokemon, stats: Uint8Array): void {
    pkmn.hp = stats[Gen5Constants.bsHPOffset] & 0xff;
    pkmn.attack = stats[Gen5Constants.bsAttackOffset] & 0xff;
    pkmn.defense = stats[Gen5Constants.bsDefenseOffset] & 0xff;
    pkmn.speed = stats[Gen5Constants.bsSpeedOffset] & 0xff;
    pkmn.spatk = stats[Gen5Constants.bsSpAtkOffset] & 0xff;
    pkmn.spdef = stats[Gen5Constants.bsSpDefOffset] & 0xff;

    // Types
    const pt = typeFromTable(stats[Gen5Constants.bsPrimaryTypeOffset] & 0xff);
    const st = typeFromTable(stats[Gen5Constants.bsSecondaryTypeOffset] & 0xff);
    if (pt != null) pkmn.primaryType = pt;
    pkmn.secondaryType = (st === pkmn.primaryType) ? null : st;

    pkmn.catchRate = stats[Gen5Constants.bsCatchRateOffset] & 0xff;
    const gc = expCurveFromByte(stats[Gen5Constants.bsGrowthCurveOffset]);
    if (gc != null) pkmn.growthCurve = gc;

    // Abilities (Gen5 has 3)
    pkmn.ability1 = stats[Gen5Constants.bsAbility1Offset] & 0xff;
    pkmn.ability2 = stats[Gen5Constants.bsAbility2Offset] & 0xff;
    pkmn.ability3 = stats[Gen5Constants.bsAbility3Offset] & 0xff;

    // Held items
    const item1 = readWord(stats, Gen5Constants.bsCommonHeldItemOffset);
    const item2 = readWord(stats, Gen5Constants.bsRareHeldItemOffset);
    if (item1 === item2) {
      pkmn.guaranteedHeldItem = item1;
      pkmn.commonHeldItem = 0;
      pkmn.rareHeldItem = 0;
      pkmn.darkGrassHeldItem = 0;
    } else {
      pkmn.guaranteedHeldItem = 0;
      pkmn.commonHeldItem = item1;
      pkmn.rareHeldItem = item2;
      pkmn.darkGrassHeldItem = readWord(stats, Gen5Constants.bsDarkGrassHeldItemOffset);
    }

    // Forme data
    const formeCount = stats[Gen5Constants.bsFormeCountOffset] & 0xff;
    if (formeCount > 1) {
      const firstFormeOffset = readWord(stats, Gen5Constants.bsFormeOffset);
      if (firstFormeOffset !== 0) {
        for (let i = 1; i < formeCount; i++) {
          this.formeMappings.set(
            firstFormeOffset + i - 1,
            new FormeInfo(
              pkmn.number,
              i,
              readWord(stats, Gen5Constants.bsFormeSpriteOffset),
            ),
          );
        }
      } else {
        // Cosmetic formes
        pkmn.cosmeticForms = formeCount;
      }
    }
  }

  saveBasicPokeStats(pkmn: Pokemon, stats: Uint8Array): void {
    stats[Gen5Constants.bsHPOffset] = pkmn.hp & 0xff;
    stats[Gen5Constants.bsAttackOffset] = pkmn.attack & 0xff;
    stats[Gen5Constants.bsDefenseOffset] = pkmn.defense & 0xff;
    stats[Gen5Constants.bsSpeedOffset] = pkmn.speed & 0xff;
    stats[Gen5Constants.bsSpAtkOffset] = pkmn.spatk & 0xff;
    stats[Gen5Constants.bsSpDefOffset] = pkmn.spdef & 0xff;

    stats[Gen5Constants.bsPrimaryTypeOffset] = typeToInternalByte(pkmn.primaryType);
    if (pkmn.secondaryType == null) {
      stats[Gen5Constants.bsSecondaryTypeOffset] = stats[Gen5Constants.bsPrimaryTypeOffset];
    } else {
      stats[Gen5Constants.bsSecondaryTypeOffset] = typeToInternalByte(pkmn.secondaryType);
    }

    stats[Gen5Constants.bsCatchRateOffset] = pkmn.catchRate & 0xff;
    stats[Gen5Constants.bsGrowthCurveOffset] = expCurveToByte(pkmn.growthCurve);

    stats[Gen5Constants.bsAbility1Offset] = pkmn.ability1 & 0xff;
    stats[Gen5Constants.bsAbility2Offset] = pkmn.ability2 & 0xff;
    stats[Gen5Constants.bsAbility3Offset] = pkmn.ability3 & 0xff;

    // Held items
    if (pkmn.guaranteedHeldItem > 0) {
      writeWord(stats, Gen5Constants.bsCommonHeldItemOffset, pkmn.guaranteedHeldItem);
      writeWord(stats, Gen5Constants.bsRareHeldItemOffset, pkmn.guaranteedHeldItem);
      writeWord(stats, Gen5Constants.bsDarkGrassHeldItemOffset, 0);
    } else {
      writeWord(stats, Gen5Constants.bsCommonHeldItemOffset, pkmn.commonHeldItem);
      writeWord(stats, Gen5Constants.bsRareHeldItemOffset, pkmn.rareHeldItem);
      writeWord(stats, Gen5Constants.bsDarkGrassHeldItemOffset, pkmn.darkGrassHeldItem);
    }
  }

  // -----------------------------------------------------------------------
  // Moves loading / saving
  // -----------------------------------------------------------------------

  loadMoves(moveNarc: NARCArchive, moveNames: string[]): void {
    this.moveNarc = moveNarc;
    this.moves = new Array<Move | null>(Gen5Constants.moveCount + 1).fill(null);

    for (let i = 1; i <= Gen5Constants.moveCount; i++) {
      const moveData = moveNarc.files[i];
      const m = new Move();
      m.name = moveNames[i] ?? `Move${i}`;
      m.number = i;
      m.internalId = i;
      m.effectIndex = readWord(moveData, 16);
      m.hitratio = moveData[4] & 0xff;
      m.power = moveData[3] & 0xff;
      m.pp = moveData[5] & 0xff;

      const typeIndex = moveData[0] & 0xff;
      const mt = typeFromTable(typeIndex);
      if (mt != null) m.type = mt;

      m.flinchPercentChance = moveData[15] & 0xff;
      m.target = moveData[20] & 0xff;

      const catIndex = moveData[2] & 0xff;
      m.category = catIndex < moveCategoryIndices.length
        ? moveCategoryIndices[catIndex]
        : MoveCategory.STATUS;

      m.priority = moveData[6] << 24 >> 24; // sign-extend

      // Critical stages
      const critStages = moveData[14] & 0xff;
      if (critStages === 6) {
        m.criticalChance = CriticalChance.GUARANTEED;
      } else if (critStages > 0) {
        m.criticalChance = CriticalChance.INCREASED;
      }

      const internalStatusType = readWord(moveData, 8);
      const flags = readFullInt(moveData, 32);
      m.makesContact = (flags & 0x001) !== 0;
      m.isChargeMove = (flags & 0x002) !== 0;
      m.isRechargeMove = (flags & 0x004) !== 0;
      m.isPunchMove = (flags & 0x080) !== 0;
      m.isSoundMove = (flags & 0x100) !== 0;
      m.isTrapMove =
        m.effectIndex === Gen5Constants.trappingEffect ||
        internalStatusType === 8;

      const qualities = moveData[1];
      const recoilOrAbsorbPercent = moveData[18] << 24 >> 24; // sign-extend
      if (qualities === Gen5Constants.damageAbsorbQuality) {
        m.absorbPercent = recoilOrAbsorbPercent;
      } else {
        m.recoilPercent = -recoilOrAbsorbPercent;
      }

      if (i === Moves.swift) {
        this.perfectAccuracy = m.hitratio;
      }

      if (GlobalConstants.normalMultihitMoves.includes(i)) {
        m.hitCount = 19 / 6.0;
      } else if (GlobalConstants.doubleHitMoves.includes(i)) {
        m.hitCount = 2;
      } else if (i === Moves.tripleKick) {
        m.hitCount = 2.71;
      }

      // Stat changes based on qualities
      switch (qualities) {
        case Gen5Constants.noDamageStatChangeQuality:
        case Gen5Constants.noDamageStatusAndStatChangeQuality:
          // All Allies or Self
          if (m.target === 6 || m.target === 7) {
            m.statChangeMoveType = StatChangeMoveType.NO_DAMAGE_USER;
          } else {
            m.statChangeMoveType = StatChangeMoveType.NO_DAMAGE_TARGET;
          }
          break;
        case Gen5Constants.damageTargetDebuffQuality:
          m.statChangeMoveType = StatChangeMoveType.DAMAGE_TARGET;
          break;
        case Gen5Constants.damageUserBuffQuality:
          m.statChangeMoveType = StatChangeMoveType.DAMAGE_USER;
          break;
        default:
          m.statChangeMoveType = StatChangeMoveType.NONE_OR_UNKNOWN;
          break;
      }

      // Stat change details (3 slots, encoded inline in Gen5 move data)
      for (let statChange = 0; statChange < 3; statChange++) {
        const statTypeVal = moveData[21 + statChange] & 0xff;
        const statChangeTypeValues = Object.values(StatChangeType).filter(
          (v) => typeof v === 'number',
        ) as number[];
        if (statTypeVal < statChangeTypeValues.length) {
          m.statChanges[statChange].type = statTypeVal as StatChangeType;
        }
        m.statChanges[statChange].stages = moveData[24 + statChange] << 24 >> 24;
        m.statChanges[statChange].percentChance = moveData[27 + statChange] & 0xff;
      }

      // Status effects
      if (internalStatusType < 7) {
        m.statusType = internalStatusType as StatusType;
        if (
          m.statusType === StatusType.POISON &&
          (i === Moves.toxic || i === Moves.poisonFang)
        ) {
          m.statusType = StatusType.TOXIC_POISON;
        }
        m.statusPercentChance = moveData[10] & 0xff;
        if (i === Moves.chatter) {
          m.statusPercentChance = 1.0;
        }
        switch (qualities) {
          case Gen5Constants.noDamageStatusQuality:
          case Gen5Constants.noDamageStatusAndStatChangeQuality:
            m.statusMoveType = StatusMoveType.NO_DAMAGE;
            break;
          case Gen5Constants.damageStatusQuality:
            m.statusMoveType = StatusMoveType.DAMAGE;
            break;
        }
      }

      this.moves[i] = m;
    }
  }

  saveMoves(): void {
    if (!this.moveNarc) return;
    for (let i = 1; i <= Gen5Constants.moveCount; i++) {
      const m = this.moves[i];
      if (!m) continue;
      const data = this.moveNarc.files[i];
      data[2] = Gen5Constants.moveCategoryToByte(m.category);
      data[3] = m.power & 0xff;
      data[0] = typeToInternalByte(m.type);
      let hitratio = Math.round(m.hitratio);
      if (hitratio < 0) hitratio = 0;
      if (hitratio > 101) hitratio = 100;
      data[4] = hitratio & 0xff;
      data[5] = m.pp & 0xff;
    }
  }

  // -----------------------------------------------------------------------
  // Text helpers (Gen5 uses PPTxtHandler)
  // -----------------------------------------------------------------------

  getStrings(isStoryText: boolean, index: number): string[] {
    const baseNarc = isStoryText ? this.storyTextNarc : this.stringsNarc;
    if (!baseNarc) return [];
    const rawFile = baseNarc.files[index];
    return [...PPTxtHandler.readTexts(rawFile)];
  }

  setStrings(isStoryText: boolean, index: number, strings: string[]): void {
    const baseNarc = isStoryText ? this.storyTextNarc : this.stringsNarc;
    if (!baseNarc) return;
    const oldRawFile = baseNarc.files[index];
    const newRawFile = PPTxtHandler.saveEntry(oldRawFile, strings);
    baseNarc.files[index] = new Uint8Array(newRawFile);
  }

  // -----------------------------------------------------------------------
  // Accessors
  // -----------------------------------------------------------------------

  getPokemon(): (Pokemon | null)[] {
    return this.pokes;
  }

  getMoves(): (Move | null)[] {
    return this.moves;
  }

  getROMName(): string {
    return 'Pokemon ' + this.romEntry.name;
  }

  getROMCode(): string {
    return this.romEntry.romCode;
  }

  getROMType(): number {
    return this.romEntry.romType;
  }
}
