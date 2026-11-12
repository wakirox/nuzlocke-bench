/*----------------------------------------------------------------------------*/
/*--  gen4-rom-handler.ts - randomizer handler for D/P/Pt/HG/SS.            --*/
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

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { NARCArchive } from '../nds/narc-archive';
import { AbstractDSRomHandler } from './abstract-ds-rom-handler';
import { RomHandlerFactory } from './rom-handler';
import type { RomHandler, LogStream } from './rom-handler';
import type { RandomInstance } from '../utils/random-source';
import * as Gen4Constants from '../constants/gen4-constants';
import * as GlobalConstants from '../constants/global-constants';
import * as Moves from '../constants/moves';
import * as Species from '../constants/species';
import { RomFunctions, StringLengthSD } from '../utils/rom-functions';
import { Pokemon } from '../pokemon/pokemon';
import { Move } from '../pokemon/move';
import { MoveCategory } from '../pokemon/move-category';
import { Type, typeCamelCase } from '../pokemon/type';
import { ExpCurve, expCurveFromByte, expCurveToByte } from '../pokemon/exp-curve';
import { Evolution } from '../pokemon/evolution';
import { EvolutionType, evolutionTypeFromIndex, evolutionTypeToIndex } from '../pokemon/evolution-type';
import type { MegaEvolution } from '../pokemon/mega-evolution';
import { MoveLearnt } from '../pokemon/move-learnt';
import { Trainer } from '../pokemon/trainer';
import { TrainerPokemon } from '../pokemon/trainer-pokemon';
import { EncounterSet } from '../pokemon/encounter-set';
import { Encounter } from '../pokemon/encounter';
import { StaticEncounter } from '../pokemon/static-encounter';
import type { TotemPokemon } from '../pokemon/totem-pokemon';
import { IngameTrade } from '../pokemon/ingame-trade';
import { PickupItem } from '../pokemon/pickup-item';
import { Shop } from '../pokemon/shop';
import type { StatChange } from '../pokemon/stat-change';
import { type Settings, MovesetsMod, WildPokemonMod } from '../config/settings';
import * as Items from '../constants/items';
import { TrainerNameMode } from './rom-handler';
import { StatChangeMoveType } from '../pokemon/stat-change-move-type';
import { StatChangeType } from '../pokemon/stat-change-type';
import { StatusType } from '../pokemon/status-type';
import { StatusMoveType } from '../pokemon/status-move-type';
import { CriticalChance } from '../pokemon/critical-chance';
import { Effectiveness } from '../pokemon/effectiveness';
import { MiscTweak } from '../utils/misc-tweak';
import { FileFunctions } from '../utils/file-functions';
import { ItemList } from '../pokemon/item-list';
import { PokeTextData } from '../text/poke-text-data';
import { makeFile as textToPokeFile } from '../text/text-to-poke';

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

function readLong(data: Uint8Array, offset: number): number {
  return ((data[offset] & 0xff)
    | ((data[offset + 1] & 0xff) << 8)
    | ((data[offset + 2] & 0xff) << 16)
    | ((data[offset + 3] & 0xff) << 24)) >>> 0; // unsigned
}

function writeLong(data: Uint8Array, offset: number, value: number): void {
  data[offset] = value & 0xff;
  data[offset + 1] = (value >> 8) & 0xff;
  data[offset + 2] = (value >> 16) & 0xff;
  data[offset + 3] = (value >> 24) & 0xff;
}

// ---------------------------------------------------------------------------
// Binary search helper
// ---------------------------------------------------------------------------

function hexStringToBytes(hexString: string): Uint8Array {
  const bytes = new Uint8Array(hexString.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hexString.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function find(haystack: Uint8Array, hexString: string): number {
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

/** Default string size determiner (uses string length). */
const ssd = new StringLengthSD();

// ---------------------------------------------------------------------------
// Type mapping helpers
// ---------------------------------------------------------------------------

function typeFromTable(index: number): Type | null {
  const name = Gen4Constants.typeTable[index];
  if (name == null) return null;
  return Type[name as keyof typeof Type] ?? null;
}

function typeToInternalByte(type: Type): number {
  return Gen4Constants.typeToByte(Type[type]);
}

// ---------------------------------------------------------------------------
// Move category mapping (Gen4 order: 0=Physical, 1=Special, 2=Status)
// ---------------------------------------------------------------------------

const moveCategoryIndices: MoveCategory[] = [
  MoveCategory.PHYSICAL,
  MoveCategory.SPECIAL,
  MoveCategory.STATUS,
];

// ---------------------------------------------------------------------------
// RomEntry & related helper types (parsed from gen4_offsets.ini)
// ---------------------------------------------------------------------------

interface RomFileEntry {
  path: string;
  expectedCRC32: number;
}

interface ScriptEntry {
  file: number;
  offset: number;
}

interface TextEntry {
  textIndex: number;
  stringNumber: number;
}

interface StaticPokemonEntry {
  speciesEntries: ScriptEntry[];
  levelEntries: ScriptEntry[];
  formeEntries: ScriptEntry[];
}

interface StaticPokemonGameCornerEntry extends StaticPokemonEntry {
  textEntries: TextEntry[];
}

interface RoamingPokemonEntry {
  speciesCodeOffsets: number[];
  levelCodeOffsets: number[];
  speciesScriptOffsets: ScriptEntry[];
  genderOffsets: ScriptEntry[];
}

export interface Gen4RomEntry {
  name: string;
  romCode: string;
  version: number;
  romType: number;
  arm9ExpectedCRC32: number;
  staticPokemonSupport: boolean;
  copyStaticPokemon: boolean;
  copyRoamingPokemon: boolean;
  ignoreGameCornerStatics: boolean;
  copyText: boolean;
  strings: Map<string, string>;
  tweakFiles: Map<string, string>;
  numbers: Map<string, number>;
  arrayEntries: Map<string, number[]>;
  files: Map<string, RomFileEntry>;
  overlayExpectedCRC32s: Map<number, number>;
  staticPokemon: StaticPokemonEntry[];
  roamingPokemon: RoamingPokemonEntry[];
  marillCryScriptEntries: ScriptEntry[];
  tmTexts: Map<number, TextEntry[]>;
  tmTextsGameCorner: Map<number, TextEntry>;
  tmScriptOffsetsFrontier: Map<number, number>;
  tmTextsFrontier: Map<number, number>;
}

function createDefaultRomEntry(): Gen4RomEntry {
  return {
    name: '',
    romCode: '',
    version: 0,
    romType: Gen4Constants.Type_DP,
    arm9ExpectedCRC32: 0,
    staticPokemonSupport: false,
    copyStaticPokemon: false,
    copyRoamingPokemon: false,
    ignoreGameCornerStatics: false,
    copyText: false,
    strings: new Map(),
    tweakFiles: new Map(),
    numbers: new Map(),
    arrayEntries: new Map(),
    files: new Map(),
    overlayExpectedCRC32s: new Map(),
    staticPokemon: [],
    roamingPokemon: [],
    marillCryScriptEntries: [],
    tmTexts: new Map(),
    tmTextsGameCorner: new Map(),
    tmScriptOffsetsFrontier: new Map(),
    tmTextsFrontier: new Map(),
  };
}

function romEntryGetInt(entry: Gen4RomEntry, key: string): number {
  return entry.numbers.get(key) ?? 0;
}

function romEntryGetString(entry: Gen4RomEntry, key: string): string {
  return entry.strings.get(key) ?? '';
}

function romEntryGetFile(entry: Gen4RomEntry, key: string): string {
  const fe = entry.files.get(key);
  return fe?.path ?? '';
}

// ---------------------------------------------------------------------------
// INI parser
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
  // JS numbers can handle 32-bit unsigned values
  let radix = 10;
  off = off.trim().toLowerCase();
  if (off.startsWith('0x') || off.startsWith('&h')) {
    radix = 16;
    off = off.substring(2);
  }
  const val = parseInt(off, radix);
  return isNaN(val) ? 0 : val;
}

function parseStaticPokemonFromString(str: string): StaticPokemonEntry {
  const sp: StaticPokemonEntry = {
    speciesEntries: [],
    levelEntries: [],
    formeEntries: [],
  };
  const pattern = /([A-Za-z]+)=\[([^\]]+)\]/g;
  let match;
  while ((match = pattern.exec(str)) !== null) {
    const key = match[1];
    const offsets = match[2].split(',').map(s => s.trim());
    const entries: ScriptEntry[] = offsets.map(o => {
      const parts = o.split(':');
      return { file: parseRIInt(parts[0]), offset: parseRIInt(parts[1]) };
    });
    switch (key) {
      case 'Species': sp.speciesEntries = entries; break;
      case 'Level': sp.levelEntries = entries; break;
      case 'Forme': sp.formeEntries = entries; break;
    }
  }
  return sp;
}

function parseStaticPokemonGameCornerFromString(str: string): StaticPokemonGameCornerEntry {
  const sp: StaticPokemonGameCornerEntry = {
    speciesEntries: [],
    levelEntries: [],
    formeEntries: [],
    textEntries: [],
  };
  const pattern = /([A-Za-z]+)=\[([^\]]+)\]/g;
  let match;
  while ((match = pattern.exec(str)) !== null) {
    const key = match[1];
    const offsets = match[2].split(',').map(s => s.trim());
    switch (key) {
      case 'Species':
        sp.speciesEntries = offsets.map(o => {
          const parts = o.split(':');
          return { file: parseRIInt(parts[0]), offset: parseRIInt(parts[1]) };
        });
        break;
      case 'Level':
        sp.levelEntries = offsets.map(o => {
          const parts = o.split(':');
          return { file: parseRIInt(parts[0]), offset: parseRIInt(parts[1]) };
        });
        break;
      case 'Text':
        sp.textEntries = offsets.map(o => {
          const parts = o.split(':');
          return { textIndex: parseRIInt(parts[0]), stringNumber: parseRIInt(parts[1]) };
        });
        break;
    }
  }
  return sp;
}

function parseRoamingPokemonFromString(str: string): RoamingPokemonEntry {
  const rp: RoamingPokemonEntry = {
    speciesCodeOffsets: [],
    levelCodeOffsets: [],
    speciesScriptOffsets: [],
    genderOffsets: [],
  };
  // Matches both plain offsets like [0x60580] and script entries like [344:0x1A, 344:0x24]
  const pattern = /([A-Za-z]+)=\[([^\]]+)\]/g;
  let match;
  while ((match = pattern.exec(str)) !== null) {
    const key = match[1];
    const offsets = match[2].split(',').map(s => s.trim());
    switch (key) {
      case 'Species':
        if (offsets[0].includes(':')) {
          rp.speciesScriptOffsets = offsets.map(o => {
            const parts = o.split(':');
            return { file: parseRIInt(parts[0]), offset: parseRIInt(parts[1]) };
          });
        } else {
          rp.speciesCodeOffsets = offsets.map(o => parseRIInt(o));
        }
        break;
      case 'Level':
        rp.levelCodeOffsets = offsets.map(o => parseRIInt(o));
        break;
      case 'Script':
        rp.speciesScriptOffsets = offsets.map(o => {
          const parts = o.split(':');
          return { file: parseRIInt(parts[0]), offset: parseRIInt(parts[1]) };
        });
        break;
      case 'Gender':
        rp.genderOffsets = offsets.map(o => {
          const parts = o.split(':');
          return { file: parseRIInt(parts[0]), offset: parseRIInt(parts[1]) };
        });
        break;
    }
  }
  return rp;
}

function parseTMTextFromString(str: string, tmTexts: Map<number, TextEntry[]>): void {
  const pattern = /(\d+)=\[([^\]]+)\]/g;
  let match;
  while ((match = pattern.exec(str)) !== null) {
    const tmNum = parseRIInt(match[1]);
    const entries = match[2].split(',').map(s => s.trim());
    const textEntries: TextEntry[] = entries.map(e => {
      const parts = e.split(':');
      return { textIndex: parseRIInt(parts[0]), stringNumber: parseRIInt(parts[1]) };
    });
    tmTexts.set(tmNum, textEntries);
  }
}

function parseTMTextGameCornerFromString(str: string, tmTextGameCorner: Map<number, TextEntry>): void {
  // format: {90=[603:14], 75=[603:15], ...}
  const inner = str.startsWith('{') ? str.substring(1, str.length - 1) : str;
  const entries = inner.split(',').map(s => s.trim());
  for (const entry of entries) {
    const eqParts = entry.split('=');
    if (eqParts.length !== 2) continue;
    const tmNum = parseRIInt(eqParts[0]);
    const textEntry = eqParts[1].replace('[', '').replace(']', '');
    const parts = textEntry.split(':');
    tmTextGameCorner.set(tmNum, { textIndex: parseRIInt(parts[0]), stringNumber: parseRIInt(parts[1]) });
  }
}

export function parseGen4RomEntries(iniText: string): Gen4RomEntry[] {
  const roms: Gen4RomEntry[] = [];
  let current: Gen4RomEntry | null = null;

  for (let line of iniText.split(/\r?\n/)) {
    // Strip comments
    const commentIdx = line.indexOf('//');
    if (commentIdx >= 0) {
      line = line.substring(0, commentIdx);
    }
    line = line.trim();
    if (!line) continue;

    if (line.startsWith('[') && line.endsWith(']')) {
      current = createDefaultRomEntry();
      current.name = line.substring(1, line.length - 1);
      roms.push(current);
      continue;
    }

    if (!current) continue;

    const eqIdx = line.indexOf('=');
    if (eqIdx < 0) continue;
    const key = line.substring(0, eqIdx).trim();
    let val = line.substring(eqIdx + 1).trim();

    if (key === 'Game') {
      current.romCode = val;
    } else if (key === 'Version') {
      current.version = parseInt(val, 10);
    } else if (key === 'Type') {
      if (val.toLowerCase() === 'dp') current.romType = Gen4Constants.Type_DP;
      else if (val.toLowerCase() === 'plat') current.romType = Gen4Constants.Type_Plat;
      else if (val.toLowerCase() === 'hgss') current.romType = Gen4Constants.Type_HGSS;
    } else if (key === 'CopyFrom') {
      for (const other of roms) {
        if (val.toLowerCase() === other.name.toLowerCase()) {
          // Copy maps
          for (const [k, v] of other.arrayEntries) current.arrayEntries.set(k, v);
          for (const [k, v] of other.numbers) current.numbers.set(k, v);
          for (const [k, v] of other.strings) current.strings.set(k, v);
          for (const [k, v] of other.files) current.files.set(k, v);
          if (current.copyStaticPokemon) {
            current.staticPokemon.push(...other.staticPokemon.filter(sp => {
              if (current!.ignoreGameCornerStatics && 'textEntries' in sp) return false;
              return true;
            }));
            current.staticPokemonSupport = true;
          } else {
            current.staticPokemonSupport = false;
          }
          if (current.copyRoamingPokemon) {
            current.roamingPokemon.push(...other.roamingPokemon);
          }
          if (current.copyText) {
            for (const [k, v] of other.tmTexts) current.tmTexts.set(k, v);
            for (const [k, v] of other.tmTextsGameCorner) current.tmTextsGameCorner.set(k, v);
            for (const [k, v] of other.tmScriptOffsetsFrontier) current.tmScriptOffsetsFrontier.set(k, v);
            for (const [k, v] of other.tmTextsFrontier) current.tmTextsFrontier.set(k, v);
          }
          current.marillCryScriptEntries.push(...other.marillCryScriptEntries);
          break;
        }
      }
    } else if (key.startsWith('File<')) {
      const fileKey = key.split('<')[1].split('>')[0];
      const inner = val.substring(1, val.length - 1);
      const parts = inner.split(',');
      const fe: RomFileEntry = {
        path: parts[0].trim(),
        expectedCRC32: parseRILong('0x' + parts[1].trim()),
      };
      current.files.set(fileKey, fe);
    } else if (key === 'Arm9CRC32') {
      current.arm9ExpectedCRC32 = parseRILong('0x' + val);
    } else if (key.startsWith('OverlayCRC32<')) {
      const ovlKey = parseInt(key.split('<')[1].split('>')[0], 10);
      current.overlayExpectedCRC32s.set(ovlKey, parseRILong('0x' + val));
    } else if (key === 'StaticPokemon{}') {
      current.staticPokemon.push(parseStaticPokemonFromString(val));
    } else if (key === 'RoamingPokemon{}') {
      current.roamingPokemon.push(parseRoamingPokemonFromString(val));
    } else if (key === 'StaticPokemonGameCorner{}') {
      current.staticPokemon.push(parseStaticPokemonGameCornerFromString(val));
    } else if (key === 'TMText{}') {
      parseTMTextFromString(val, current.tmTexts);
    } else if (key === 'TMTextGameCorner{}') {
      parseTMTextGameCornerFromString(val, current.tmTextsGameCorner);
    } else if (key === 'FrontierScriptTMOffsets{}') {
      const inner = val.substring(1, val.length - 1);
      for (const entry of inner.split(',')) {
        const parts = entry.trim().split('=');
        if (parts.length === 2) {
          current.tmScriptOffsetsFrontier.set(parseRIInt(parts[0]), parseRIInt(parts[1]));
        }
      }
    } else if (key === 'FrontierTMText{}') {
      const inner = val.substring(1, val.length - 1);
      for (const entry of inner.split(',')) {
        const parts = entry.trim().split('=');
        if (parts.length === 2) {
          current.tmTextsFrontier.set(parseRIInt(parts[0]), parseRIInt(parts[1]));
        }
      }
    } else if (key === 'StaticPokemonSupport') {
      current.staticPokemonSupport = parseRIInt(val) > 0;
    } else if (key === 'CopyStaticPokemon') {
      current.copyStaticPokemon = parseRIInt(val) > 0;
    } else if (key === 'CopyRoamingPokemon') {
      current.copyRoamingPokemon = parseRIInt(val) > 0;
    } else if (key === 'CopyText') {
      current.copyText = parseRIInt(val) > 0;
    } else if (key === 'IgnoreGameCornerStatics') {
      current.ignoreGameCornerStatics = parseRIInt(val) > 0;
    } else if (key.endsWith('Tweak')) {
      current.tweakFiles.set(key, val);
    } else if (key.endsWith('MarillCryScripts')) {
      current.marillCryScriptEntries = [];
      const inner = val.substring(1, val.length - 1);
      for (const entry of inner.split(',')) {
        const parts = entry.trim().split(':');
        if (parts.length === 2) {
          current.marillCryScriptEntries.push({ file: parseRIInt(parts[0]), offset: parseRIInt(parts[1]) });
        }
      }
    } else {
      // Array entries or number entries or string entries
      if (val.startsWith('[') && val.endsWith(']')) {
        const inner = val.substring(1, val.length - 1);
        if (inner.trim() === '') {
          current.arrayEntries.set(key, []);
        } else {
          current.arrayEntries.set(key, inner.split(',').map(s => parseRIInt(s)));
        }
      } else if (
        key.endsWith('Offset') || key.endsWith('Count') || key.endsWith('Number') ||
        key.endsWith('Size') || key.endsWith('Index')
      ) {
        current.numbers.set(key, parseRIInt(val));
      } else {
        current.strings.set(key, val);
      }
    }
  }

  return roms;
}

// ---------------------------------------------------------------------------
// ROM detection
// ---------------------------------------------------------------------------

let loadedRomEntries: Gen4RomEntry[] | null = null;

function getDefaultRomEntries(): Gen4RomEntry[] {
  if (loadedRomEntries) return loadedRomEntries;
  try {
    const iniPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/com/dabomstew/pkrandom/config/gen4_offsets.ini');
    if (fs.existsSync(iniPath)) {
      loadedRomEntries = parseGen4RomEntries(fs.readFileSync(iniPath, 'utf-8'));
      return loadedRomEntries;
    }
  } catch {
    // ignore
  }
  return [];
}

function entryFor(romCode: string, version: number, romEntries: Gen4RomEntry[]): Gen4RomEntry | null {
  for (const re of romEntries) {
    if (romCode === re.romCode && version === re.version) {
      return re;
    }
  }
  return null;
}

export function detectGen4Rom(romCode: string | null, version: number, romEntries?: Gen4RomEntry[]): boolean {
  if (romCode == null) return false;
  const entries = romEntries ?? getDefaultRomEntries();
  return entryFor(romCode, version, entries) !== null;
}

/**
 * Determine the rom type (DP / Plat / HGSS) from the ROM code.
 */
export function romTypeFromCode(romCode: string): number {
  if (romCode.startsWith('ADA') || romCode.startsWith('APA')) {
    return Gen4Constants.Type_DP;
  }
  if (romCode.startsWith('CPU')) {
    return Gen4Constants.Type_Plat;
  }
  if (romCode.startsWith('IPK') || romCode.startsWith('IPG')) {
    return Gen4Constants.Type_HGSS;
  }
  return Gen4Constants.Type_DP;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export class Gen4RomHandlerFactory extends RomHandlerFactory {
  private romEntries: Gen4RomEntry[];

  constructor(romEntries?: Gen4RomEntry[]) {
    super();
    this.romEntries = romEntries ?? getDefaultRomEntries();
  }

  isLoadable(filename: string): boolean {
    try {
      const stats = fs.statSync(filename);
      // NDS ROMs are typically 32-512 MB
      if (stats.size < 1024 * 1024 || stats.size > 512 * 1024 * 1024) {
        return false;
      }
      const code = AbstractDSRomHandler.getROMCodeFromFile(filename);
      const version = AbstractDSRomHandler.getVersionFromFile(filename);
      return detectGen4Rom(code, version, this.romEntries);
    } catch {
      return false;
    }
  }

  createWithLog(random: RandomInstance, log: LogStream | null): RomHandler {
    return new Gen4RomHandler(random, log, this.romEntries) as unknown as RomHandler;
  }
}

// ---------------------------------------------------------------------------
// Main handler class
// ---------------------------------------------------------------------------

export class Gen4RomHandler extends AbstractDSRomHandler {
  // --- state ---
  romEntry: Gen4RomEntry;
  arm9: Uint8Array = new Uint8Array(0);
  pokes: (Pokemon | null)[] = [];
  private pokemonListInclFormes: (Pokemon | null)[] = [];
  private pokemonList: (Pokemon | null)[] = [];
  moves: (Move | null)[] = [];
  pokeNarc: NARCArchive | null = null;
  moveNarc: NARCArchive | null = null;
  msgNarc: NARCArchive | null = null;
  scriptNarc: NARCArchive | null = null;
  eventNarc: NARCArchive | null = null;
  perfectAccuracy = 0;
  private roamerRandomizationEnabled = false;
  private abilityNames: string[] = [];
  private itemNames: string[] = [];
  private loadedWildMapNames = false;
  private wildMapNames: Map<number, string> = new Map();
  private headbuttMapNames: Map<number, string> = new Map();
  private allowedItemsList: ItemList = new ItemList(0);
  private nonBadItemsList: ItemList = new ItemList(0);
  private lastStringsCompressed = false;
  private romEntries: Gen4RomEntry[];
  private pickupItemsTableOffset = 0;
  private rarePickupItemsTableOffset = 0;
  private effectivenessUpdated = false;

  constructor(random: RandomInstance, logStream: LogStream | null, romEntries?: Gen4RomEntry[]) {
    super(random, logStream);
    this.romEntries = romEntries ?? getDefaultRomEntries();
    this.romEntry = createDefaultRomEntry();
  }

  // -----------------------------------------------------------------------
  // ROM detection & loading lifecycle
  // -----------------------------------------------------------------------

  protected detectNDSRom(ndsCode: string, version: number): boolean {
    return entryFor(ndsCode, version, this.romEntries) !== null;
  }

  protected loadedROM(romCode: string, version: number): void {
    const entry = entryFor(romCode, version, this.romEntries);
    if (!entry) throw new Error('No ROM entry found for ' + romCode + ' v' + version);
    this.romEntry = entry;

    this.arm9 = this.readARM9();
    this.msgNarc = this.readNARC(romEntryGetFile(this.romEntry, 'Text'));
    this.scriptNarc = this.readNARC(romEntryGetFile(this.romEntry, 'Scripts'));
    this.eventNarc = this.readNARC(romEntryGetFile(this.romEntry, 'Events'));

    this.loadPokemonStatsInternal();
    this.pokemonListInclFormes = [...this.pokes];
    this.pokemonList = this.pokes.slice(0, Gen4Constants.pokemonCount + 1);
    this.loadMovesInternal();

    this.abilityNames = this.getStringsLocal(romEntryGetInt(this.romEntry, 'AbilityNamesTextOffset'));
    this.itemNames = this.getStringsLocal(romEntryGetInt(this.romEntry, 'ItemNamesTextOffset'));
    this.loadedWildMapNames = false;

    this.allowedItemsList = Gen4Constants.getAllowedItems().copy();
    this.nonBadItemsList = Gen4Constants.getNonBadItems().copy();

    this.roamerRandomizationEnabled =
      (this.romEntry.romType === Gen4Constants.Type_DP && this.romEntry.roamingPokemon.length > 0) ||
      (this.romEntry.romType === Gen4Constants.Type_Plat && this.romEntry.tweakFiles.has('NewRoamerSubroutineTweak')) ||
      (this.romEntry.romType === Gen4Constants.Type_HGSS && this.romEntry.tweakFiles.has('NewRoamerSubroutineTweak'));

    // For HGSS with the catching-tutorial tweak available, pre-extend the ARM9
    // and apply the tweak during load. Mirrors upstream Java Gen4RomHandler
    // (loadedROM block for NewCatchingTutorialSubroutineTweak): both the
    // catching-tutorial patch and the later roamer patch need the ARM9
    // extension, but either can be requested independently. Extending now
    // avoids ordering issues with misc tweaks (e.g. randomizeCatchingTutorial)
    // and lets extendARM9 run exactly once (arm9Extended flag) regardless of
    // which subsequent step first needs the extension.
    if (
      this.romEntry.romType === Gen4Constants.Type_HGSS &&
      this.romEntry.tweakFiles.has('NewCatchingTutorialSubroutineTweak')
    ) {
      const extendBy = romEntryGetInt(this.romEntry, 'Arm9ExtensionSize');
      this.arm9 = this.extendARM9(
        this.arm9,
        extendBy,
        romEntryGetString(this.romEntry, 'TCMCopyingPrefix'),
        Gen4Constants.arm9Offset,
      );
      this.applyIPSPatch(this.arm9, 'NewCatchingTutorialSubroutineTweak');
    }
  }

  protected savingROM(): void {
    this.savePokemonStatsInternal();
    this.saveMovesInternal();
    this.writeARM9(this.arm9);
    this.writeNARC(romEntryGetFile(this.romEntry, 'Text'), this.msgNarc!);
    this.writeNARC(romEntryGetFile(this.romEntry, 'Scripts'), this.scriptNarc!);
    this.writeNARC(romEntryGetFile(this.romEntry, 'Events'), this.eventNarc!);
  }

  // -----------------------------------------------------------------------
  // String helpers (wraps the AbstractDSRomHandler text methods)
  // -----------------------------------------------------------------------

  private getStringsLocal(index: number): string[] {
    const pt = new PokeTextData(this.msgNarc!.files[index]);
    pt.decrypt();
    this.lastStringsCompressed = pt.compressFlag;
    return [...pt.strlist];
  }

  private setStringsLocal(index: number, newStrings: string[], compressed = false): void {
    const rawUnencrypted = textToPokeFile(newStrings, compressed);
    const encrypt = new PokeTextData(rawUnencrypted);
    encrypt.setKey(0xD00E);
    encrypt.encrypt();
    this.msgNarc!.files[index] = new Uint8Array(encrypt.get());
  }

  // -----------------------------------------------------------------------
  // Pokemon loading / saving
  // -----------------------------------------------------------------------

  private loadPokemonStatsInternal(): void {
    const pstatsnarc = romEntryGetFile(this.romEntry, 'PokemonStats');
    this.pokeNarc = this.readNARC(pstatsnarc);
    const pokeNames = this.readPokemonNames();
    const formeCount = Gen4Constants.getFormeCount(this.romEntry.romType);
    this.pokes = new Array<Pokemon | null>(Gen4Constants.pokemonCount + formeCount + 1).fill(null);

    for (let i = 1; i <= Gen4Constants.pokemonCount; i++) {
      const pk = new Pokemon();
      pk.number = i;
      this.loadBasicPokeStats(pk, this.pokeNarc.files[i]);
      pk.name = pokeNames[i] ?? `Pokemon${i}`;
      this.pokes[i] = pk;
    }

    // Load alternate formes
    let idx = Gen4Constants.pokemonCount + 1;
    for (const [k, formeInfo] of Gen4Constants.formeMappings) {
      if (idx >= this.pokes.length) break;
      const pk = new Pokemon();
      pk.number = idx;
      this.loadBasicPokeStats(pk, this.pokeNarc.files[k]);
      pk.name = pokeNames[formeInfo.baseForme] ?? `Pokemon${formeInfo.baseForme}`;
      pk.baseForme = this.pokes[formeInfo.baseForme];
      pk.formeNumber = formeInfo.formeNumber;
      pk.formeSuffix = Gen4Constants.formeSuffixes.get(k) ?? '';
      this.pokes[idx] = pk;
      idx++;
    }

    this.populateEvolutions();
  }

  private readPokemonNames(): string[] {
    const nameList = this.getStringsLocal(romEntryGetInt(this.romEntry, 'PokemonNamesTextOffset'));
    const pokeNames: string[] = new Array(Gen4Constants.pokemonCount + 1).fill('');
    for (let i = 1; i <= Gen4Constants.pokemonCount && i < nameList.length; i++) {
      pokeNames[i] = nameList[i];
    }
    return pokeNames;
  }

  loadBasicPokeStats(pkmn: Pokemon, stats: Uint8Array): void {
    pkmn.hp = stats[Gen4Constants.bsHPOffset] & 0xff;
    pkmn.attack = stats[Gen4Constants.bsAttackOffset] & 0xff;
    pkmn.defense = stats[Gen4Constants.bsDefenseOffset] & 0xff;
    pkmn.speed = stats[Gen4Constants.bsSpeedOffset] & 0xff;
    pkmn.spatk = stats[Gen4Constants.bsSpAtkOffset] & 0xff;
    pkmn.spdef = stats[Gen4Constants.bsSpDefOffset] & 0xff;

    const pt = typeFromTable(stats[Gen4Constants.bsPrimaryTypeOffset] & 0xff);
    const st = typeFromTable(stats[Gen4Constants.bsSecondaryTypeOffset] & 0xff);
    if (pt != null) pkmn.primaryType = pt;
    pkmn.secondaryType = (st === pkmn.primaryType) ? null : st;

    pkmn.catchRate = stats[Gen4Constants.bsCatchRateOffset] & 0xff;
    const gc = expCurveFromByte(stats[Gen4Constants.bsGrowthCurveOffset]);
    if (gc != null) pkmn.growthCurve = gc;

    pkmn.ability1 = stats[Gen4Constants.bsAbility1Offset] & 0xff;
    pkmn.ability2 = stats[Gen4Constants.bsAbility2Offset] & 0xff;

    const item1 = readWord(stats, Gen4Constants.bsCommonHeldItemOffset);
    const item2 = readWord(stats, Gen4Constants.bsRareHeldItemOffset);
    if (item1 === item2) {
      pkmn.guaranteedHeldItem = item1;
      pkmn.commonHeldItem = 0;
      pkmn.rareHeldItem = 0;
    } else {
      pkmn.guaranteedHeldItem = 0;
      pkmn.commonHeldItem = item1;
      pkmn.rareHeldItem = item2;
    }
    pkmn.darkGrassHeldItem = -1;

    pkmn.genderRatio = stats[Gen4Constants.bsGenderRatioOffset] & 0xff;

    const cosmeticFormsCount = Gen4Constants.cosmeticForms.get(pkmn.number) ?? 0;
    if (cosmeticFormsCount > 0 && this.romEntry.romType !== Gen4Constants.Type_DP) {
      pkmn.cosmeticForms = cosmeticFormsCount;
    }
  }

  saveBasicPokeStats(pkmn: Pokemon, stats: Uint8Array): void {
    stats[Gen4Constants.bsHPOffset] = pkmn.hp & 0xff;
    stats[Gen4Constants.bsAttackOffset] = pkmn.attack & 0xff;
    stats[Gen4Constants.bsDefenseOffset] = pkmn.defense & 0xff;
    stats[Gen4Constants.bsSpeedOffset] = pkmn.speed & 0xff;
    stats[Gen4Constants.bsSpAtkOffset] = pkmn.spatk & 0xff;
    stats[Gen4Constants.bsSpDefOffset] = pkmn.spdef & 0xff;

    stats[Gen4Constants.bsPrimaryTypeOffset] = typeToInternalByte(pkmn.primaryType);
    if (pkmn.secondaryType == null) {
      stats[Gen4Constants.bsSecondaryTypeOffset] = stats[Gen4Constants.bsPrimaryTypeOffset];
    } else {
      stats[Gen4Constants.bsSecondaryTypeOffset] = typeToInternalByte(pkmn.secondaryType);
    }

    stats[Gen4Constants.bsCatchRateOffset] = pkmn.catchRate & 0xff;
    stats[Gen4Constants.bsGrowthCurveOffset] = expCurveToByte(pkmn.growthCurve);

    stats[Gen4Constants.bsAbility1Offset] = pkmn.ability1 & 0xff;
    stats[Gen4Constants.bsAbility2Offset] = pkmn.ability2 & 0xff;

    if (pkmn.guaranteedHeldItem > 0) {
      writeWord(stats, Gen4Constants.bsCommonHeldItemOffset, pkmn.guaranteedHeldItem);
      writeWord(stats, Gen4Constants.bsRareHeldItemOffset, pkmn.guaranteedHeldItem);
    } else {
      writeWord(stats, Gen4Constants.bsCommonHeldItemOffset, pkmn.commonHeldItem);
      writeWord(stats, Gen4Constants.bsRareHeldItemOffset, pkmn.rareHeldItem);
    }
    stats[Gen4Constants.bsGenderRatioOffset] = pkmn.genderRatio & 0xff;
  }

  private savePokemonStatsInternal(): void {
    if (!this.pokeNarc) return;
    const namesList = this.getStringsLocal(romEntryGetInt(this.romEntry, 'PokemonNamesTextOffset'));
    const formeCount = Gen4Constants.getFormeCount(this.romEntry.romType);

    if (romEntryGetString(this.romEntry, 'HasExtraPokemonNames').toLowerCase() === 'yes') {
      const namesList2 = this.getStringsLocal(romEntryGetInt(this.romEntry, 'PokemonNamesTextOffset') + 1);
      for (let i = 1; i <= Gen4Constants.pokemonCount + formeCount; i++) {
        if (i > Gen4Constants.pokemonCount) {
          const pk = this.pokes[i];
          if (pk) this.saveBasicPokeStats(pk, this.pokeNarc.files[i + Gen4Constants.formeOffset]);
          continue;
        }
        const pk = this.pokes[i];
        if (pk) {
          this.saveBasicPokeStats(pk, this.pokeNarc.files[i]);
          const oldName = namesList[i];
          namesList[i] = pk.name;
          if (namesList2[i]) {
            namesList2[i] = namesList2[i].replace(oldName, pk.name);
          }
        }
      }
      this.setStringsLocal(romEntryGetInt(this.romEntry, 'PokemonNamesTextOffset') + 1, namesList2, false);
    } else {
      for (let i = 1; i <= Gen4Constants.pokemonCount + formeCount; i++) {
        if (i > Gen4Constants.pokemonCount) {
          const pk = this.pokes[i];
          if (pk) this.saveBasicPokeStats(pk, this.pokeNarc.files[i + Gen4Constants.formeOffset]);
          continue;
        }
        const pk = this.pokes[i];
        if (pk) {
          this.saveBasicPokeStats(pk, this.pokeNarc.files[i]);
          namesList[i] = pk.name;
        }
      }
    }
    this.setStringsLocal(romEntryGetInt(this.romEntry, 'PokemonNamesTextOffset'), namesList, false);

    this.writeNARC(romEntryGetFile(this.romEntry, 'PokemonStats'), this.pokeNarc);

    this.writeEvolutions();
  }

  private writeEvolutions(): void {
    try {
      const evoNarc = this.readNARC(romEntryGetFile(this.romEntry, 'PokemonEvolutions'));
      for (let i = 1; i <= Gen4Constants.pokemonCount; i++) {
        const evoEntry = evoNarc.files[i];
        const pk = this.pokes[i];
        if (!pk) continue;
        if (pk.number === Species.nincada) {
          this.writeShedinjaEvolution();
        }
        let evosWritten = 0;
        for (const evo of pk.evolutionsFrom) {
          writeWord(evoEntry, evosWritten * 6, evolutionTypeToIndex(evo.type, 4));
          writeWord(evoEntry, evosWritten * 6 + 2, evo.extraInfo);
          writeWord(evoEntry, evosWritten * 6 + 4, evo.to.number);
          evosWritten++;
          if (evosWritten === 7) break;
        }
        while (evosWritten < 7) {
          writeWord(evoEntry, evosWritten * 6, 0);
          writeWord(evoEntry, evosWritten * 6 + 2, 0);
          writeWord(evoEntry, evosWritten * 6 + 4, 0);
          evosWritten++;
        }
      }
      this.writeNARC(romEntryGetFile(this.romEntry, 'PokemonEvolutions'), evoNarc);
    } catch (_e) {
      // ignore IO errors
    }
  }

  private writeShedinjaEvolution(): void {
    const nincada = this.pokes[Species.nincada];
    if (!nincada) return;

    // When "Limit Pokemon" or "Random Every Level" evolutions are selected,
    // Nincada's vanilla evolutions may be cleared. If less than 2, skip.
    if (nincada.evolutionsFrom.length < 2) return;

    const extraEvolution = nincada.evolutionsFrom[1].to;
    // In Gen 4, the game checks for LEVEL_IS_EXTRA evolution method and
    // hardcodes Shedinja generation. We tweak the ARM9 instruction to load
    // the new species ID.
    const offset = find(this.arm9, Gen4Constants.shedinjaSpeciesLocator);
    if (offset > 0) {
      let lowByte: number;
      let highByte: number;
      if (extraEvolution.number < 256) {
        lowByte = extraEvolution.number;
        highByte = 0;
      } else {
        lowByte = 255;
        highByte = extraEvolution.number - 255;
      }
      // mov r0, lowByte
      // add r0, r0, highByte
      this.arm9[offset] = lowByte & 0xff;
      this.arm9[offset + 1] = 0x20;
      this.arm9[offset + 2] = highByte & 0xff;
      this.arm9[offset + 3] = 0x30;
    }
  }

  // -----------------------------------------------------------------------
  // Evolution loading
  // -----------------------------------------------------------------------

  private populateEvolutions(): void {
    for (const pkmn of this.pokes) {
      if (pkmn != null) {
        pkmn.evolutionsFrom = [];
        pkmn.evolutionsTo = [];
      }
    }

    try {
      const evoNarc = this.readNARC(romEntryGetFile(this.romEntry, 'PokemonEvolutions'));
      for (let i = 1; i <= Gen4Constants.pokemonCount; i++) {
        const pk = this.pokes[i];
        if (!pk) continue;
        const evoData = evoNarc.files[i];
        for (let evo = 0; evo < 7; evo++) {
          const method = readWord(evoData, evo * 6);
          const species = readWord(evoData, evo * 6 + 4);
          if (method >= 1 && method <= Gen4Constants.evolutionMethodCount && species >= 1) {
            const et = evolutionTypeFromIndex(4, method);
            if (!et) continue;
            const extraInfo = readWord(evoData, evo * 6 + 2);
            const target = this.pokes[species];
            if (!target) continue;

            const ev = new Evolution(pk, target, false, et, extraInfo);
            if (!pk.evolutionsFrom.some(e =>
              e.to.number === ev.to.number && e.type === ev.type)) {
              pk.evolutionsFrom.push(ev);
              target.evolutionsTo.push(ev);
            }
          }
        }
        // Split evos: mark carryStats = true for Pokemon with multiple evo paths
        if (pk.evolutionsFrom.length > 1) {
          for (const ev of pk.evolutionsFrom) {
            ev.carryStats = true;
          }
        }
      }
    } catch {
      // evolution loading is not fatal for wiring
    }
  }

  // -----------------------------------------------------------------------
  // Moves loading / saving
  // -----------------------------------------------------------------------

  private loadMovesInternal(): void {
    this.moveNarc = this.readNARC(romEntryGetFile(this.romEntry, 'MoveData'));
    const moveNames = this.getStringsLocal(romEntryGetInt(this.romEntry, 'MoveNamesTextOffset'));
    this.moves = new Array<Move | null>(Gen4Constants.moveCount + 1).fill(null);

    for (let i = 1; i <= Gen4Constants.moveCount; i++) {
      const moveData = this.moveNarc.files[i];
      const m = new Move();
      m.name = moveNames[i] ?? `Move${i}`;
      m.number = i;
      m.internalId = i;
      m.effectIndex = readWord(moveData, 0);
      m.hitratio = moveData[5] & 0xff;
      m.power = moveData[3] & 0xff;
      m.pp = moveData[6] & 0xff;

      const typeIndex = moveData[4] & 0xff;
      const mt = typeFromTable(typeIndex);
      if (mt != null) m.type = mt;

      m.target = readWord(moveData, 8);

      const catIndex = moveData[2] & 0xff;
      m.category = catIndex < moveCategoryIndices.length
        ? moveCategoryIndices[catIndex]
        : MoveCategory.STATUS;

      m.priority = moveData[10] << 24 >> 24; // sign-extend
      const flags = moveData[11] & 0xff;
      m.makesContact = (flags & 1) !== 0;
      m.isPunchMove = Gen4Constants.punchMoves.includes(i);
      m.isSoundMove = Gen4Constants.soundMoves.includes(i);

      if (i === Moves.swift) {
        this.perfectAccuracy = m.hitratio;
      }

      if (GlobalConstants.normalMultihitMoves.includes(i)) {
        m.hitCount = 3;
      } else if (GlobalConstants.doubleHitMoves.includes(i)) {
        m.hitCount = 2;
      } else if (i === Moves.tripleKick) {
        m.hitCount = 2.71;
      }

      const secondaryEffectChance = moveData[7] & 0xff;
      this.loadStatChangesFromEffect(m, secondaryEffectChance);
      this.loadStatusFromEffect(m, secondaryEffectChance);
      this.loadMiscMoveInfoFromEffect(m, secondaryEffectChance);

      this.moves[i] = m;
    }
  }

  private saveMovesInternal(): void {
    if (!this.moveNarc) return;
    for (let i = 1; i <= Gen4Constants.moveCount; i++) {
      const m = this.moves[i];
      if (!m) continue;
      const data = this.moveNarc.files[i];
      writeWord(data, 0, m.effectIndex);
      data[2] = Gen4Constants.moveCategoryToByte(m.category);
      data[3] = m.power & 0xff;
      data[4] = typeToInternalByte(m.type);
      let hitratio = Math.round(m.hitratio);
      if (hitratio < 0) hitratio = 0;
      if (hitratio > 100) hitratio = 100;
      data[5] = hitratio & 0xff;
      data[6] = m.pp & 0xff;
    }
    this.writeNARC(romEntryGetFile(this.romEntry, 'MoveData'), this.moveNarc);
  }

  // -----------------------------------------------------------------------
  // Stat-change / status / misc effect parsing helpers
  // -----------------------------------------------------------------------

  private loadStatChangesFromEffect(move: Move, secondaryEffectChance: number): void {
    switch (move.effectIndex) {
      case Gen4Constants.noDamageAtkPlusOneEffect:
      case Gen4Constants.noDamageDefPlusOneEffect:
      case Gen4Constants.noDamageSpAtkPlusOneEffect:
      case Gen4Constants.noDamageEvasionPlusOneEffect:
      case Gen4Constants.noDamageAtkMinusOneEffect:
      case Gen4Constants.noDamageDefMinusOneEffect:
      case Gen4Constants.noDamageSpeMinusOneEffect:
      case Gen4Constants.noDamageAccuracyMinusOneEffect:
      case Gen4Constants.noDamageEvasionMinusOneEffect:
      case Gen4Constants.noDamageAtkPlusTwoEffect:
      case Gen4Constants.noDamageDefPlusTwoEffect:
      case Gen4Constants.noDamageSpePlusTwoEffect:
      case Gen4Constants.noDamageSpAtkPlusTwoEffect:
      case Gen4Constants.noDamageSpDefPlusTwoEffect:
      case Gen4Constants.noDamageAtkMinusTwoEffect:
      case Gen4Constants.noDamageDefMinusTwoEffect:
      case Gen4Constants.noDamageSpeMinusTwoEffect:
      case Gen4Constants.noDamageSpDefMinusTwoEffect:
      case Gen4Constants.minimizeEffect:
      case Gen4Constants.swaggerEffect:
      case Gen4Constants.defenseCurlEffect:
      case Gen4Constants.flatterEffect:
      case Gen4Constants.chargeEffect:
      case Gen4Constants.noDamageAtkAndDefMinusOneEffect:
      case Gen4Constants.noDamageDefAndSpDefPlusOneEffect:
      case Gen4Constants.noDamageAtkAndDefPlusOneEffect:
      case Gen4Constants.noDamageSpAtkAndSpDefPlusOneEffect:
      case Gen4Constants.noDamageAtkAndSpePlusOneEffect:
      case Gen4Constants.noDamageSpAtkMinusTwoEffect:
        if (move.target === 16) {
          move.statChangeMoveType = StatChangeMoveType.NO_DAMAGE_USER;
        } else {
          move.statChangeMoveType = StatChangeMoveType.NO_DAMAGE_TARGET;
        }
        break;

      case Gen4Constants.damageAtkMinusOneEffect:
      case Gen4Constants.damageDefMinusOneEffect:
      case Gen4Constants.damageSpeMinusOneEffect:
      case Gen4Constants.damageSpAtkMinusOneEffect:
      case Gen4Constants.damageSpDefMinusOneEffect:
      case Gen4Constants.damageAccuracyMinusOneEffect:
      case Gen4Constants.damageSpDefMinusTwoEffect:
        move.statChangeMoveType = StatChangeMoveType.DAMAGE_TARGET;
        break;

      case Gen4Constants.damageUserDefPlusOneEffect:
      case Gen4Constants.damageUserAtkPlusOneEffect:
      case Gen4Constants.damageUserAllPlusOneEffect:
      case Gen4Constants.damageUserAtkAndDefMinusOneEffect:
      case Gen4Constants.damageUserSpAtkMinusTwoEffect:
      case Gen4Constants.damageUserSpeMinusOneEffect:
      case Gen4Constants.damageUserDefAndSpDefMinusOneEffect:
      case Gen4Constants.damageUserSpAtkPlusOneEffect:
        move.statChangeMoveType = StatChangeMoveType.DAMAGE_USER;
        break;

      default:
        return;
    }

    switch (move.effectIndex) {
      case Gen4Constants.noDamageAtkPlusOneEffect:
      case Gen4Constants.damageUserAtkPlusOneEffect:
        move.statChanges[0].type = StatChangeType.ATTACK;
        move.statChanges[0].stages = 1;
        break;
      case Gen4Constants.noDamageDefPlusOneEffect:
      case Gen4Constants.damageUserDefPlusOneEffect:
      case Gen4Constants.defenseCurlEffect:
        move.statChanges[0].type = StatChangeType.DEFENSE;
        move.statChanges[0].stages = 1;
        break;
      case Gen4Constants.noDamageSpAtkPlusOneEffect:
      case Gen4Constants.flatterEffect:
      case Gen4Constants.damageUserSpAtkPlusOneEffect:
        move.statChanges[0].type = StatChangeType.SPECIAL_ATTACK;
        move.statChanges[0].stages = 1;
        break;
      case Gen4Constants.noDamageEvasionPlusOneEffect:
      case Gen4Constants.minimizeEffect:
        move.statChanges[0].type = StatChangeType.EVASION;
        move.statChanges[0].stages = 1;
        break;
      case Gen4Constants.noDamageAtkMinusOneEffect:
      case Gen4Constants.damageAtkMinusOneEffect:
        move.statChanges[0].type = StatChangeType.ATTACK;
        move.statChanges[0].stages = -1;
        break;
      case Gen4Constants.noDamageDefMinusOneEffect:
      case Gen4Constants.damageDefMinusOneEffect:
        move.statChanges[0].type = StatChangeType.DEFENSE;
        move.statChanges[0].stages = -1;
        break;
      case Gen4Constants.noDamageSpeMinusOneEffect:
      case Gen4Constants.damageSpeMinusOneEffect:
      case Gen4Constants.damageUserSpeMinusOneEffect:
        move.statChanges[0].type = StatChangeType.SPEED;
        move.statChanges[0].stages = -1;
        break;
      case Gen4Constants.noDamageAccuracyMinusOneEffect:
      case Gen4Constants.damageAccuracyMinusOneEffect:
        move.statChanges[0].type = StatChangeType.ACCURACY;
        move.statChanges[0].stages = -1;
        break;
      case Gen4Constants.noDamageEvasionMinusOneEffect:
        move.statChanges[0].type = StatChangeType.EVASION;
        move.statChanges[0].stages = -1;
        break;
      case Gen4Constants.noDamageAtkPlusTwoEffect:
        move.statChanges[0].type = StatChangeType.ATTACK;
        move.statChanges[0].stages = 2;
        break;
      case Gen4Constants.noDamageDefPlusTwoEffect:
        move.statChanges[0].type = StatChangeType.DEFENSE;
        move.statChanges[0].stages = 2;
        break;
      case Gen4Constants.noDamageSpePlusTwoEffect:
        move.statChanges[0].type = StatChangeType.SPEED;
        move.statChanges[0].stages = 2;
        break;
      case Gen4Constants.noDamageSpAtkPlusTwoEffect:
        move.statChanges[0].type = StatChangeType.SPECIAL_ATTACK;
        move.statChanges[0].stages = 2;
        break;
      case Gen4Constants.noDamageSpDefPlusTwoEffect:
        move.statChanges[0].type = StatChangeType.SPECIAL_DEFENSE;
        move.statChanges[0].stages = 2;
        break;
      case Gen4Constants.noDamageAtkMinusTwoEffect:
        move.statChanges[0].type = StatChangeType.ATTACK;
        move.statChanges[0].stages = -2;
        break;
      case Gen4Constants.noDamageDefMinusTwoEffect:
        move.statChanges[0].type = StatChangeType.DEFENSE;
        move.statChanges[0].stages = -2;
        break;
      case Gen4Constants.noDamageSpeMinusTwoEffect:
        move.statChanges[0].type = StatChangeType.SPEED;
        move.statChanges[0].stages = -2;
        break;
      case Gen4Constants.noDamageSpDefMinusTwoEffect:
        move.statChanges[0].type = StatChangeType.SPECIAL_DEFENSE;
        move.statChanges[0].stages = -2;
        break;
      case Gen4Constants.noDamageSpAtkMinusTwoEffect:
      case Gen4Constants.damageUserSpAtkMinusTwoEffect:
        move.statChanges[0].type = StatChangeType.SPECIAL_ATTACK;
        move.statChanges[0].stages = -2;
        break;
      case Gen4Constants.damageSpDefMinusTwoEffect:
        move.statChanges[0].type = StatChangeType.SPECIAL_DEFENSE;
        move.statChanges[0].stages = -2;
        break;
      case Gen4Constants.damageSpAtkMinusOneEffect:
        move.statChanges[0].type = StatChangeType.SPECIAL_ATTACK;
        move.statChanges[0].stages = -1;
        break;
      case Gen4Constants.damageSpDefMinusOneEffect:
        move.statChanges[0].type = StatChangeType.SPECIAL_DEFENSE;
        move.statChanges[0].stages = -1;
        break;
      case Gen4Constants.swaggerEffect:
        move.statChanges[0].type = StatChangeType.ATTACK;
        move.statChanges[0].stages = 2;
        break;
      case Gen4Constants.chargeEffect:
        move.statChanges[0].type = StatChangeType.SPECIAL_DEFENSE;
        move.statChanges[0].stages = 1;
        break;
      case Gen4Constants.damageUserAllPlusOneEffect:
        move.statChanges[0].type = StatChangeType.ALL;
        move.statChanges[0].stages = 1;
        break;
      case Gen4Constants.damageUserAtkAndDefMinusOneEffect:
        move.statChanges[0].type = StatChangeType.ATTACK;
        move.statChanges[0].stages = -1;
        move.statChanges[1].type = StatChangeType.DEFENSE;
        move.statChanges[1].stages = -1;
        break;
      case Gen4Constants.damageUserDefAndSpDefMinusOneEffect:
        move.statChanges[0].type = StatChangeType.DEFENSE;
        move.statChanges[0].stages = -1;
        move.statChanges[1].type = StatChangeType.SPECIAL_DEFENSE;
        move.statChanges[1].stages = -1;
        break;
      case Gen4Constants.noDamageAtkAndDefMinusOneEffect:
        move.statChanges[0].type = StatChangeType.ATTACK;
        move.statChanges[0].stages = -1;
        move.statChanges[1].type = StatChangeType.DEFENSE;
        move.statChanges[1].stages = -1;
        break;
      case Gen4Constants.noDamageDefAndSpDefPlusOneEffect:
        move.statChanges[0].type = StatChangeType.DEFENSE;
        move.statChanges[0].stages = 1;
        move.statChanges[1].type = StatChangeType.SPECIAL_DEFENSE;
        move.statChanges[1].stages = 1;
        break;
      case Gen4Constants.noDamageAtkAndDefPlusOneEffect:
        move.statChanges[0].type = StatChangeType.ATTACK;
        move.statChanges[0].stages = 1;
        move.statChanges[1].type = StatChangeType.DEFENSE;
        move.statChanges[1].stages = 1;
        break;
      case Gen4Constants.noDamageSpAtkAndSpDefPlusOneEffect:
        move.statChanges[0].type = StatChangeType.SPECIAL_ATTACK;
        move.statChanges[0].stages = 1;
        move.statChanges[1].type = StatChangeType.SPECIAL_DEFENSE;
        move.statChanges[1].stages = 1;
        break;
      case Gen4Constants.noDamageAtkAndSpePlusOneEffect:
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
      for (const sc of move.statChanges) {
        if (sc.type !== StatChangeType.NONE) {
          sc.percentChance = secondaryEffectChance === 0 ? 100.0 : secondaryEffectChance;
        }
      }
    }
  }

  private loadStatusFromEffect(move: Move, secondaryEffectChance: number): void {
    switch (move.effectIndex) {
      case Gen4Constants.noDamageSleepEffect:
        move.statusType = StatusType.SLEEP;
        move.statusMoveType = StatusMoveType.NO_DAMAGE;
        move.statusPercentChance = 100.0;
        break;
      case Gen4Constants.noDamagePoisonEffect:
        move.statusType = StatusType.POISON;
        move.statusMoveType = StatusMoveType.NO_DAMAGE;
        move.statusPercentChance = 100.0;
        break;
      case Gen4Constants.noDamageParalyzeEffect:
        move.statusType = StatusType.PARALYZE;
        move.statusMoveType = StatusMoveType.NO_DAMAGE;
        move.statusPercentChance = 100.0;
        break;
      case Gen4Constants.noDamageBurnEffect:
        move.statusType = StatusType.BURN;
        move.statusMoveType = StatusMoveType.NO_DAMAGE;
        move.statusPercentChance = 100.0;
        break;
      case Gen4Constants.noDamageConfusionEffect:
      case Gen4Constants.swaggerEffect:
      case Gen4Constants.flatterEffect:
      case Gen4Constants.teeterDanceEffect:
        move.statusType = StatusType.CONFUSION;
        move.statusMoveType = StatusMoveType.NO_DAMAGE;
        move.statusPercentChance = 100.0;
        break;
      case Gen4Constants.toxicEffect:
        move.statusType = StatusType.TOXIC_POISON;
        move.statusMoveType = StatusMoveType.NO_DAMAGE;
        move.statusPercentChance = 100.0;
        break;
      case Gen4Constants.damagePoisonEffect:
      case Gen4Constants.twineedleEffect:
      case Gen4Constants.damagePoisonWithIncreasedCritEffect:
        move.statusType = StatusType.POISON;
        move.statusMoveType = StatusMoveType.DAMAGE;
        move.statusPercentChance = secondaryEffectChance;
        break;
      case Gen4Constants.damageBurnEffect:
      case Gen4Constants.damageBurnAndThawUserEffect:
      case Gen4Constants.blazeKickEffect:
        move.statusType = StatusType.BURN;
        move.statusMoveType = StatusMoveType.DAMAGE;
        move.statusPercentChance = secondaryEffectChance;
        break;
      case Gen4Constants.damageFreezeEffect:
      case Gen4Constants.blizzardEffect:
        move.statusType = StatusType.FREEZE;
        move.statusMoveType = StatusMoveType.DAMAGE;
        move.statusPercentChance = secondaryEffectChance;
        break;
      case Gen4Constants.damageParalyzeEffect:
      case Gen4Constants.thunderEffect:
      case Gen4Constants.bounceEffect:
        move.statusType = StatusType.PARALYZE;
        move.statusMoveType = StatusMoveType.DAMAGE;
        move.statusPercentChance = secondaryEffectChance;
        break;
      case Gen4Constants.damageConfusionEffect:
      case Gen4Constants.twisterEffect:
      case Gen4Constants.chatterEffect:
        move.statusType = StatusType.CONFUSION;
        move.statusMoveType = StatusMoveType.DAMAGE;
        move.statusPercentChance = secondaryEffectChance;
        break;
      case Gen4Constants.poisonFangEffect:
        move.statusType = StatusType.TOXIC_POISON;
        move.statusMoveType = StatusMoveType.DAMAGE;
        move.statusPercentChance = secondaryEffectChance;
        break;
      case Gen4Constants.dreamEaterEffect:
        move.statusType = StatusType.SLEEP;
        move.statusMoveType = StatusMoveType.DAMAGE;
        break;
      case Gen4Constants.fireFangEffect:
        move.statusType = StatusType.BURN;
        move.statusMoveType = StatusMoveType.DAMAGE;
        move.statusPercentChance = secondaryEffectChance;
        break;
    }
  }

  private loadMiscMoveInfoFromEffect(move: Move, secondaryEffectChance: number): void {
    switch (move.effectIndex) {
      case Gen4Constants.flinchEffect:
      case Gen4Constants.snoreEffect:
      case Gen4Constants.twisterEffect:
      case Gen4Constants.stompEffect:
      case Gen4Constants.fakeOutEffect:
      case Gen4Constants.fireFangEffect:
        move.flinchPercentChance = secondaryEffectChance;
        break;
      case Gen4Constants.increasedCritEffect:
      case Gen4Constants.blazeKickEffect:
      case Gen4Constants.damagePoisonWithIncreasedCritEffect:
        move.criticalChance = CriticalChance.INCREASED;
        break;
      case Gen4Constants.trappingEffect:
      case Gen4Constants.bindingEffect:
        move.isTrapMove = true;
        break;
      case Gen4Constants.damageAbsorbEffect:
      case Gen4Constants.dreamEaterEffect:
        move.absorbPercent = 50;
        break;
      case Gen4Constants.damageRecoil25PercentEffect:
        move.recoilPercent = -25;
        break;
      case Gen4Constants.damageRecoil33PercentEffect:
        move.recoilPercent = -33;
        break;
      case Gen4Constants.damageRecoil50PercentEffect:
        move.recoilPercent = -50;
        break;
      case Gen4Constants.flareBlitzEffect:
      case Gen4Constants.voltTackleEffect:
        move.recoilPercent = -33;
        break;
      case Gen4Constants.rechargeEffect:
        move.isRechargeMove = true;
        break;
      case Gen4Constants.razorWindEffect:
      case Gen4Constants.skullBashEffect:
      case Gen4Constants.skyAttackEffect:
      case Gen4Constants.solarbeamEffect:
      case Gen4Constants.flyEffect:
      case Gen4Constants.diveEffect:
      case Gen4Constants.digEffect:
      case Gen4Constants.bounceEffect:
      case Gen4Constants.shadowForceEffect:
        move.isChargeMove = true;
        break;
    }
  }

  // -----------------------------------------------------------------------
  // RomHandler interface implementations (stubs for now, real impl later)
  // -----------------------------------------------------------------------

  getPokemon(): (Pokemon | null)[] {
    return this.pokes;
  }

  getPokemonInclFormes(): (Pokemon | null)[] {
    return this.pokemonListInclFormes;
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

  getAllowedItems(): ItemList {
    return this.allowedItemsList;
  }

  getNonBadItems(): ItemList {
    return this.nonBadItemsList;
  }

  isRomValid(): boolean {
    return this.romEntry.romCode !== '';
  }

  generationOfPokemon(): number {
    return 4;
  }

  getSupportLevel(): string {
    return this.romEntry.staticPokemonSupport ? 'Complete' : 'No Static Pokemon';
  }

  getAbilityNames(): string[] {
    return this.abilityNames;
  }

  abilityName(number: number): string {
    return this.abilityNames[number] ?? '';
  }

  getAbilityForTrainerPokemon(tp: TrainerPokemon): number {
    let pkmn = tp.pokemon;
    while (pkmn.baseForme != null) {
      pkmn = pkmn.baseForme;
    }
    if (this.romEntry.romType === Gen4Constants.Type_DP || this.romEntry.romType === Gen4Constants.Type_Plat) {
      return pkmn.ability1;
    } else {
      return tp.abilitySlot === 2 ? pkmn.ability2 : pkmn.ability1;
    }
  }

  getItemNames(): string[] {
    return this.itemNames;
  }

  // -----------------------------------------------------------------------
  // Stub implementations for abstract methods (to be ported later)
  // -----------------------------------------------------------------------

  getAltFormes(): Pokemon[] { return []; }
  getMegaEvolutions(): MegaEvolution[] { return []; }
  getAltFormeOfPokemon(pk: Pokemon, forme: number): Pokemon {
    const pokeNum = Gen4Constants.getAbsolutePokeNumByBaseForme(pk.number, forme);
    return (pokeNum !== 0 && this.pokes[pokeNum]) ? this.pokes[pokeNum]! : pk;
  }
  getIrregularFormes(): Pokemon[] { return []; }
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

    try {
      const babyPokes = this.readFile(romEntryGetFile(this.romEntry, 'BabyPokemon'));
      if (babyPokes) {
        for (let i = 1; i <= Gen4Constants.pokemonCount; i++) {
          let baby = this.pokes[i];
          while (baby != null && baby.evolutionsTo.length > 0) {
            baby = baby.evolutionsTo[0].from;
          }
          if (baby != null) {
            writeWord(babyPokes, i * 2, baby.number);
          }
        }
        this.writeFile(romEntryGetFile(this.romEntry, 'BabyPokemon'), babyPokes);
      }
    } catch (_e) {
      // ignore IO errors
    }
  }
  getStarters(): Pokemon[] {
    if (this.romEntry.romType === Gen4Constants.Type_HGSS) {
      const tailOffsets = RomFunctions.search(this.arm9, Gen4Constants.hgssStarterCodeSuffix);
      if (tailOffsets.length === 1) {
        const starterOffset = tailOffsets[0] - 13;
        const poke1 = readWord(this.arm9, starterOffset);
        const poke2 = readWord(this.arm9, starterOffset + 4);
        const poke3 = readWord(this.arm9, starterOffset + 8);
        return [this.pokes[poke1]!, this.pokes[poke2]!, this.pokes[poke3]!];
      } else {
        return [this.pokes[Species.chikorita]!, this.pokes[Species.cyndaquil]!, this.pokes[Species.totodile]!];
      }
    } else {
      const starterData = this.readOverlay(romEntryGetInt(this.romEntry, 'StarterPokemonOvlNumber'));
      if (!starterData) return [];
      const off = romEntryGetInt(this.romEntry, 'StarterPokemonOffset');
      return [this.pokes[readWord(starterData, off)]!, this.pokes[readWord(starterData, off + 4)]!, this.pokes[readWord(starterData, off + 8)]!];
    }
  }
  setStarters(newStarters: Pokemon[]): boolean {
    if (newStarters.length !== 3) return false;
    return this.romEntry.romType === Gen4Constants.Type_HGSS ? this.setStartersHGSS(newStarters) : this.setStartersDPPt(newStarters);
  }
  private setStartersHGSS(newStarters: Pokemon[]): boolean {
    const tailOffsets = RomFunctions.search(this.arm9, Gen4Constants.hgssStarterCodeSuffix);
    if (tailOffsets.length !== 1) return false;
    const so = tailOffsets[0] - 13;
    writeWord(this.arm9, so, newStarters[0].number);
    writeWord(this.arm9, so + 4, newStarters[1].number);
    writeWord(this.arm9, so + 8, newStarters[2].number);
    const sN = this.scriptNarc!;
    const mg = Gen4Constants.hgssRivalScriptMagic;
    for (const fc of Gen4Constants.hgssFilesWithRivalScript) {
      const f = sN.files[fc];
      const ro = RomFunctions.search(f, mg);
      if (ro.length === 1) {
        const bo = ro[0];
        writeWord(f, bo + 8, newStarters[0].number);
        const ja = this.readLong(f, bo + 13);
        const sb = ja + bo + 17;
        if (f[sb] === 0x11 && (f[sb + 4] & 0xFF) === Species.cyndaquil) writeWord(f, sb + 4, newStarters[1].number);
      }
    }
    const sp = this.getStringsLocal(romEntryGetInt(this.romEntry, 'StarterScreenTextOffset'));
    const intros = ['So, you like', "You'll take", 'Do you want'];
    for (let i = 0; i < 3; i++) {
      const ns = newStarters[i]; const c = (i === 0) ? 3 : i;
      sp[i + 1] = 'Professor Elm: ' + intros[i] + ' \\vFF00\\z000' + c + ns.name + '\\vFF00\\z0000,\\nthe ' + typeCamelCase(ns.primaryType) + '-type Pok\u00e9mon?';
      sp[i + 4] = '\\vFF00\\z000' + c + ns.name + '\\vFF00\\z0000, the ' + typeCamelCase(ns.primaryType) + '-type Pok\u00e9mon, is\\nin this Pok\u00e9 Ball!';
    }
    this.setStringsLocal(romEntryGetInt(this.romEntry, 'StarterScreenTextOffset'), sp);
    const spo = this.readOverlay(romEntryGetInt(this.romEntry, 'StarterPokemonOvlNumber'));
    if (spo) {
      let off = this.findInData(spo, Gen4Constants.starterCriesPrefix);
      if (off > 0) { off += Gen4Constants.starterCriesPrefix.length / 2; for (const ns of newStarters) { this.writeLong(spo, off, ns.number); off += 4; } }
      this.writeOverlay(romEntryGetInt(this.romEntry, 'StarterPokemonOvlNumber'), spo);
    }
    return true;
  }
  private setStartersDPPt(newStarters: Pokemon[]): boolean {
    const sd = this.readOverlay(romEntryGetInt(this.romEntry, 'StarterPokemonOvlNumber'));
    if (!sd) return false;
    const off = romEntryGetInt(this.romEntry, 'StarterPokemonOffset');
    writeWord(sd, off, newStarters[0].number); writeWord(sd, off + 4, newStarters[1].number); writeWord(sd, off + 8, newStarters[2].number);
    if (this.romEntry.romType === Gen4Constants.Type_DP || this.romEntry.romType === Gen4Constants.Type_Plat) this.patchStarterGraphicsDPPt(sd, newStarters);
    this.writeOverlay(romEntryGetInt(this.romEntry, 'StarterPokemonOvlNumber'), sd);
    const fwr = (this.romEntry.romType === Gen4Constants.Type_Plat) ? Gen4Constants.ptFilesWithRivalScript : Gen4Constants.dpFilesWithRivalScript;
    const mg = Gen4Constants.dpptRivalScriptMagic; const sN = this.scriptNarc!;
    for (const fc of fwr) { const f = sN.files[fc]; const ro = RomFunctions.search(f, mg); for (const bo of ro) { const jl = bo + mg.length; const jt = this.readLong(f, jl) + jl + 4; if (readWord(f, jt) !== 0xE5 && readWord(f, jt) !== 0x28F && (readWord(f, jt) !== 0x125 || this.romEntry.romType !== Gen4Constants.Type_Plat)) continue; writeWord(f, bo + 0x8, newStarters[0].number); writeWord(f, bo + 0x15, newStarters[1].number); } }
    const tb1 = Gen4Constants.dpptTagBattleScriptMagic1; const tb2 = Gen4Constants.dpptTagBattleScriptMagic2;
    const ftb = (this.romEntry.romType === Gen4Constants.Type_Plat) ? Gen4Constants.ptFilesWithTagScript : Gen4Constants.dpFilesWithTagScript;
    for (const fc of ftb) { const f = sN.files[fc]; const tbo = RomFunctions.search(f, tb1); for (const bo of tbo) { const sps = bo + tb1.length + 2; if (sps + tb2.length > f.length) continue; let v = true; for (let s = 0; s < tb2.length; s++) { if (f[sps + s] !== tb2[s]) { v = false; break; } } if (!v) continue; const jl2 = sps + tb2.length; const jt2 = this.readLong(f, jl2) + jl2 + 4; if (readWord(f, jt2) !== 0x1B) continue; if (readWord(f, bo + 0x21) === Species.turtwig) { writeWord(f, bo + 0x21, newStarters[0].number); } else { writeWord(f, bo + 0x21, newStarters[2].number); } writeWord(f, bo + 0xE, newStarters[1].number); } }
    const sp = this.getStringsLocal(romEntryGetInt(this.romEntry, 'StarterScreenTextOffset'));
    const pds = this.getStringsLocal(romEntryGetInt(this.romEntry, 'PokedexSpeciesTextOffset'));
    for (let i = 0; i < 3; i++) { const ns = newStarters[i]; const c = (i === 0) ? 3 : i; sp[i + 1] = '\\vFF00\\z000' + c + pds[ns.number] + ' ' + ns.name + '\\vFF00\\z0000!\\nWill you take this Pok\u00e9mon?'; }
    this.setStringsLocal(romEntryGetInt(this.romEntry, 'StarterScreenTextOffset'), sp);
    if (this.romEntry.romType === Gen4Constants.Type_DP) { const ls = this.getStringsLocal(romEntryGetInt(this.romEntry, 'StarterLocationTextOffset')); ls[Gen4Constants.dpStarterStringIndex] = "\\v0103\\z0000: Fwaaah!\\nYour Pok\u00e9mon totally rocked!\\pBut mine was way tougher\\nthan yours!\\p...They were other people's\\nPok\u00e9mon, though...\\pBut we had to use them...\\nThey won't mind, will they?\\p"; this.setStringsLocal(romEntryGetInt(this.romEntry, 'StarterLocationTextOffset'), ls); }
    else { const rs = this.getStringsLocal(romEntryGetInt(this.romEntry, 'StarterLocationTextOffset')); rs[Gen4Constants.ptStarterStringIndex] = "\\v0103\\z0000\\z0000: Then, I choose you!\\nI'm picking this one!\\p"; this.setStringsLocal(romEntryGetInt(this.romEntry, 'StarterLocationTextOffset'), rs); }
    return true;
  }
  private patchStarterGraphicsDPPt(sd: Uint8Array, ns: Pokemon[]): void {
    const gp = romEntryGetString(this.romEntry, 'StarterPokemonGraphicsPrefix');
    let o = this.findInData(sd, gp); if (o <= 0) return; o += gp.length / 2;
    writeWord(sd, o + 0xC, readWord(sd, o + 0xA)); if (o % 4 === 0) sd[o + 0xC] = (sd[o + 0xC] - 1) & 0xFF;
    writeWord(sd, o + 0xA, readWord(sd, o + 0x8)); sd[o + 0xA] = (sd[o + 0xA] - 1) & 0xFF;
    writeWord(sd, o + 0x8, readWord(sd, o + 0x6)); writeWord(sd, o + 0x6, readWord(sd, o + 0x4));
    writeWord(sd, o + 0x4, readWord(sd, o + 0x2)); writeWord(sd, o + 0x2, 0x6828); writeWord(sd, o, 0x182D);
    o += 0x16; writeWord(sd, o, 0x6828); o += 0xA;
    for (let i = 0; i < 3; i++) { let d = ns[i].number - (4 * (i + 1)); let i1 = 0x3200; let i2 = 0x3200; if (d < 0) { i1 |= 0x800; d = Math.abs(d); } else if (d > 255) { i2 |= 0xFF; d -= 255; } i1 |= (d & 0xFF); sd[o] = (4 * (i + 1)) & 0xFF; writeWord(sd, o + 2, readWord(sd, o + 4)); writeWord(sd, o + 4, i1); writeWord(sd, o + 8, i2); o += 0xE; }
    sd[o] = 1;
    const ip = romEntryGetString(this.romEntry, 'StarterPokemonGraphicsPrefixInner');
    const io2 = this.findInData(sd, ip); if (io2 > 0) sd[io2 + ip.length / 2 + 1] = 0x68;
  }
  hasStarterAltFormes(): boolean { return false; }
  starterCount(): number { return 3; }
  supportsStarterHeldItems(): boolean { return this.romEntry.romType === Gen4Constants.Type_DP || this.romEntry.romType === Gen4Constants.Type_Plat; }
  getStarterHeldItems(): number[] {
    const ssn = romEntryGetInt(this.romEntry, 'StarterPokemonScriptOffset');
    const sho = romEntryGetInt(this.romEntry, 'StarterPokemonHeldItemOffset');
    return [readWord(this.scriptNarc!.files[ssn], sho)];
  }
  setStarterHeldItems(items: number[]): void {
    const ssn = romEntryGetInt(this.romEntry, 'StarterPokemonScriptOffset');
    const sho = romEntryGetInt(this.romEntry, 'StarterPokemonHeldItemOffset');
    writeWord(this.scriptNarc!.files[ssn], sho, items[0]);
  }
  randomizeStarterHeldItems(_settings: Settings): void { /* stub - base class handles this */ }
  getUpdatedPokemonStats(generation: number): Map<number, StatChange> {
    return GlobalConstants.getStatChanges(generation);
  }
  abilitiesPerPokemon(): number { return 2; }
  highestAbilityIndex(): number { return Gen4Constants.highestAbilityIndex; }
  getAbilityVariations(): Map<number, number[]> { return new Map(); }
  hasMegaEvolutions(): boolean { return false; }
  getEncounters(useTimeOfDay: boolean): EncounterSet[] {
    if (!this.loadedWildMapNames) {
      this.loadWildMapNames();
    }
    if (this.romEntry.romType === Gen4Constants.Type_HGSS) {
      return this.getEncountersHGSS(useTimeOfDay);
    } else {
      return this.getEncountersDPPt(useTimeOfDay);
    }
  }

  setEncounters(useTimeOfDay: boolean, encounters: EncounterSet[]): void {
    if (this.romEntry.romType === Gen4Constants.Type_HGSS) {
      this.setEncountersHGSS(useTimeOfDay, encounters);
      this.updatePokedexAreaDataHGSS(encounters);
    } else {
      this.setEncountersDPPt(useTimeOfDay, encounters);
      this.updatePokedexAreaDataDPPt(encounters);
    }
  }

  hasTimeBasedEncounters(): boolean { return true; }

  bannedForWildEncounters(): Pokemon[] {
    // Ban Unown because certain letters can't appear outside special areas
    const unown = this.pokes[Species.unown];
    return unown ? [unown] : [];
  }

  // -----------------------------------------------------------------------
  // Wild Encounters - DPPt
  // -----------------------------------------------------------------------

  private getEncountersDPPt(useTimeOfDay: boolean): EncounterSet[] {
    const encountersFile = romEntryGetFile(this.romEntry, 'WildPokemon');
    const encounterData = this.readNARC(encountersFile);
    const encounters: EncounterSet[] = [];

    let c = -1;
    for (const b of encounterData.files) {
      c++;
      if (!this.wildMapNames.has(c)) {
        this.wildMapNames.set(c, '? Unknown ?');
      }
      const mapName = this.wildMapNames.get(c)!;
      const grassRate = readLong(b, 0);
      if (grassRate !== 0) {
        const grassEncounters = this.readEncountersDPPt(b, 4, 12);
        const grass = new EncounterSet();
        grass.displayName = mapName + ' Grass/Cave';
        grass.encounters = grassEncounters;
        grass.rate = grassRate;
        grass.offset = c;
        encounters.push(grass);

        // Time of day replacements
        if (useTimeOfDay) {
          for (let i = 0; i < 4; i++) {
            const pknum = readLong(b, 108 + 4 * i);
            if (pknum >= 1 && pknum <= Gen4Constants.pokemonCount) {
              const pk = this.pokes[pknum]!;
              const enc = new Encounter();
              enc.level = grassEncounters[Gen4Constants.dpptAlternateSlots[i + 2]].level;
              enc.pokemon = pk;
              grassEncounters.push(enc);
            }
          }
        }

        // Other conditional replacements (swarm, radar, GBA)
        const conds = new EncounterSet();
        conds.displayName = mapName + ' Swarm/Radar/GBA';
        conds.rate = grassRate;
        conds.offset = c;
        for (let i = 0; i < 20; i++) {
          if (i >= 2 && i <= 5) {
            continue;
          }
          const offs = 100 + i * 4 + (i >= 10 ? 24 : 0);
          const pknum = readLong(b, offs);
          if (pknum >= 1 && pknum <= Gen4Constants.pokemonCount) {
            const pk = this.pokes[pknum]!;
            const enc = new Encounter();
            enc.level = grassEncounters[Gen4Constants.dpptAlternateSlots[i]].level;
            enc.pokemon = pk;
            conds.encounters.push(enc);
          }
        }
        if (conds.encounters.length > 0) {
          encounters.push(conds);
        }
      }

      // up to 204, 5 sets of "sea" encounters
      let offset = 204;
      for (let i = 0; i < 5; i++) {
        const rate = readLong(b, offset);
        offset += 4;
        const encountersHere = this.readSeaEncountersDPPt(b, offset, 5);
        offset += 40;
        if (rate === 0 || i === 1) {
          continue;
        }
        const other = new EncounterSet();
        other.displayName = mapName + ' ' + Gen4Constants.dpptWaterSlotSetNames[i];
        other.offset = c;
        other.encounters = encountersHere;
        other.rate = rate;
        encounters.push(other);
      }
    }

    // Extra encounters
    const extraEncountersFile = romEntryGetFile(this.romEntry, 'ExtraEncounters');
    const extraEncounterData = this.readNARC(extraEncountersFile);

    // Feebas tiles
    const feebasData = extraEncounterData.files[0];
    const feebasEncounters = this.readExtraEncountersDPPt(feebasData, 0, 1);
    const encounterOverlay = this.readOverlay(romEntryGetInt(this.romEntry, 'EncounterOvlNumber'));
    if (encounterOverlay) {
      let fOffset = find(encounterOverlay, Gen4Constants.feebasLevelPrefixDPPt);
      if (fOffset > 0) {
        fOffset += Gen4Constants.feebasLevelPrefixDPPt.length / 2;
        for (const enc of feebasEncounters.encounters) {
          enc.maxLevel = encounterOverlay[fOffset];
          enc.level = encounterOverlay[fOffset + 4];
        }
      }
    }
    feebasEncounters.displayName = 'Mt. Coronet Feebas Tiles';
    encounters.push(feebasEncounters);

    // Honey trees
    const honeyTreeOffsets = this.romEntry.arrayEntries.get('HoneyTreeOffsets') ?? [];
    for (let i = 0; i < honeyTreeOffsets.length; i++) {
      const honeyTreeData = extraEncounterData.files[honeyTreeOffsets[i]];
      const honeyTreeEncounters = this.readExtraEncountersDPPt(honeyTreeData, 0, 6);
      if (encounterOverlay) {
        let hOffset = find(encounterOverlay, Gen4Constants.honeyTreeLevelPrefixDPPt);
        if (hOffset > 0) {
          hOffset += Gen4Constants.honeyTreeLevelPrefixDPPt.length / 2;
          let level: number;
          if (encounterOverlay[hOffset + 46] === 0x0B && encounterOverlay[hOffset + 47] === 0x2E) {
            level = 5;
          } else {
            level = encounterOverlay[hOffset + 46];
          }
          for (const enc of honeyTreeEncounters.encounters) {
            enc.maxLevel = encounterOverlay[hOffset + 102];
            enc.level = level;
          }
        }
      }
      honeyTreeEncounters.displayName = 'Honey Tree Group ' + (i + 1);
      encounters.push(honeyTreeEncounters);
    }

    // Trophy Garden rotating Pokemon (Mr. Backlot)
    const trophyGardenData = extraEncounterData.files[8];
    const trophyGardenEncounters = this.readExtraEncountersDPPt(trophyGardenData, 0, 16);
    const trophyGardenGrassEncounterIndex = Gen4Constants.getTrophyGardenGrassEncounterIndex(this.romEntry.romType);
    const trophyGardenGrassEncounterSet = encounters[trophyGardenGrassEncounterIndex];
    const tgLevel1 = trophyGardenGrassEncounterSet.encounters[6].level;
    const tgLevel2 = trophyGardenGrassEncounterSet.encounters[7].level;
    for (const enc of trophyGardenEncounters.encounters) {
      enc.level = Math.min(tgLevel1, tgLevel2);
      if (tgLevel1 !== tgLevel2) {
        enc.maxLevel = Math.max(tgLevel1, tgLevel2);
      }
    }
    trophyGardenEncounters.displayName = 'Trophy Garden Rotating Pokemon (via Mr. Backlot)';
    encounters.push(trophyGardenEncounters);

    // Great Marsh rotating Pokemon
    const greatMarshFileOffsets = [9, 10];
    for (let i = 0; i < greatMarshFileOffsets.length; i++) {
      const greatMarshData = extraEncounterData.files[greatMarshFileOffsets[i]];
      const greatMarshEncounters = this.readExtraEncountersDPPt(greatMarshData, 0, 32);
      let gmLevel = 100;
      let gmMaxLevel = 0;
      const marshGrassEncounterIndices = Gen4Constants.getMarshGrassEncounterIndices(this.romEntry.romType);
      for (let j = 0; j < marshGrassEncounterIndices.length; j++) {
        const marshGrassEncounterSet = encounters[marshGrassEncounterIndices[j]];
        let currentLevel = marshGrassEncounterSet.encounters[6].level;
        if (currentLevel < gmLevel) gmLevel = currentLevel;
        if (currentLevel > gmMaxLevel) gmMaxLevel = currentLevel;
        currentLevel = marshGrassEncounterSet.encounters[7].level;
        if (currentLevel < gmLevel) gmLevel = currentLevel;
        if (currentLevel > gmMaxLevel) gmMaxLevel = currentLevel;
      }
      for (const enc of greatMarshEncounters.encounters) {
        enc.level = gmLevel;
        enc.maxLevel = gmMaxLevel;
      }
      const pokedexStatus = i === 0 ? '(Post-National Dex)' : '(Pre-National Dex)';
      greatMarshEncounters.displayName = 'Great Marsh Rotating Pokemon ' + pokedexStatus;
      encounters.push(greatMarshEncounters);
    }
    return encounters;
  }

  private readEncountersDPPt(data: Uint8Array, offset: number, amount: number): Encounter[] {
    const encounters: Encounter[] = [];
    for (let i = 0; i < amount; i++) {
      const level = readLong(data, offset + i * 8);
      const pokemon = readLong(data, offset + 4 + i * 8);
      const enc = new Encounter();
      enc.level = level;
      enc.pokemon = this.pokes[pokemon] ?? null;
      encounters.push(enc);
    }
    return encounters;
  }

  private readSeaEncountersDPPt(data: Uint8Array, offset: number, amount: number): Encounter[] {
    const encounters: Encounter[] = [];
    for (let i = 0; i < amount; i++) {
      const level = readLong(data, offset + i * 8);
      const pokemon = readLong(data, offset + 4 + i * 8);
      const enc = new Encounter();
      enc.level = level >> 8;
      enc.maxLevel = level & 0xFF;
      enc.pokemon = this.pokes[pokemon] ?? null;
      encounters.push(enc);
    }
    return encounters;
  }

  private readExtraEncountersDPPt(data: Uint8Array, offset: number, amount: number): EncounterSet {
    const es = new EncounterSet();
    es.rate = 1;
    for (let i = 0; i < amount; i++) {
      const pokemon = readLong(data, offset + i * 4);
      const e = new Encounter();
      e.level = 1;
      e.pokemon = this.pokes[pokemon] ?? null;
      es.encounters.push(e);
    }
    return es;
  }

  private setEncountersDPPt(useTimeOfDay: boolean, encounterList: EncounterSet[]): void {
    const encountersFile = romEntryGetFile(this.romEntry, 'WildPokemon');
    const encounterData = this.readNARC(encountersFile);
    let idx = 0;
    const nextSet = (): EncounterSet => encounterList[idx++];

    for (const b of encounterData.files) {
      const grassRate = readLong(b, 0);
      if (grassRate !== 0) {
        const grass = nextSet();
        this.writeEncountersDPPt(b, 4, grass.encounters, 12);

        // Time of day encounters
        let todEncounterSlot = 12;
        for (let i = 0; i < 4; i++) {
          const pknum = readLong(b, 108 + 4 * i);
          if (pknum >= 1 && pknum <= Gen4Constants.pokemonCount) {
            if (useTimeOfDay) {
              const pk = grass.encounters[todEncounterSlot++].pokemon!;
              writeLong(b, 108 + 4 * i, pk.number);
            } else {
              const pk = grass.encounters[Gen4Constants.dpptAlternateSlots[i + 2]].pokemon!;
              writeLong(b, 108 + 4 * i, pk.number);
            }
          }
        }

        // Other conditional encounters
        let condIter: Encounter[] | null = null;
        let condIdx = 0;
        for (let i = 0; i < 20; i++) {
          if (i >= 2 && i <= 5) continue;
          const offs = 100 + i * 4 + (i >= 10 ? 24 : 0);
          const pknum = readLong(b, offs);
          if (pknum >= 1 && pknum <= Gen4Constants.pokemonCount) {
            if (condIter === null) {
              condIter = nextSet().encounters;
              condIdx = 0;
            }
            const pk = condIter[condIdx++].pokemon!;
            writeLong(b, offs, pk.number);
          }
        }
      }

      // 5 water encounter sets
      let offset = 204;
      for (let i = 0; i < 5; i++) {
        const rate = readLong(b, offset);
        offset += 4;
        if (rate === 0 || i === 1) {
          offset += 40;
          continue;
        }
        const other = nextSet();
        this.writeSeaEncountersDPPt(b, offset, other.encounters);
        offset += 40;
      }
    }

    this.writeNARC(encountersFile, encounterData);

    // Extra encounters
    const extraEncountersFile = romEntryGetFile(this.romEntry, 'ExtraEncounters');
    const extraEncounterData = this.readNARC(extraEncountersFile);

    // Feebas tiles
    const feebasData = extraEncounterData.files[0];
    const feebasEncounters = nextSet();
    const encounterOverlay = this.readOverlay(romEntryGetInt(this.romEntry, 'EncounterOvlNumber'));
    if (encounterOverlay) {
      let fOffset = find(encounterOverlay, Gen4Constants.feebasLevelPrefixDPPt);
      if (fOffset > 0) {
        fOffset += Gen4Constants.feebasLevelPrefixDPPt.length / 2;
        encounterOverlay[fOffset] = feebasEncounters.encounters[0].maxLevel & 0xff;
        encounterOverlay[fOffset + 4] = feebasEncounters.encounters[0].level & 0xff;
      }
    }
    this.writeExtraEncountersDPPt(feebasData, 0, feebasEncounters.encounters);

    // Honey trees
    const honeyTreeOffsets = this.romEntry.arrayEntries.get('HoneyTreeOffsets') ?? [];
    for (let i = 0; i < honeyTreeOffsets.length; i++) {
      const honeyTreeData = extraEncounterData.files[honeyTreeOffsets[i]];
      const honeyTreeEncounters = nextSet();
      if (encounterOverlay) {
        let hOffset = find(encounterOverlay, Gen4Constants.honeyTreeLevelPrefixDPPt);
        if (hOffset > 0) {
          hOffset += Gen4Constants.honeyTreeLevelPrefixDPPt.length / 2;
          const htLevel = honeyTreeEncounters.encounters[0].level;
          const htMaxLevel = honeyTreeEncounters.encounters[0].maxLevel;

          // Rewrite assembly to support different min levels
          encounterOverlay[hOffset + 46] = htLevel & 0xff;
          encounterOverlay[hOffset + 47] = 0x20;
          encounterOverlay[hOffset + 48] = 0x00;
          encounterOverlay[hOffset + 49] = 0x00;
          encounterOverlay[hOffset + 50] = 0x00;
          encounterOverlay[hOffset + 51] = 0x00;
          encounterOverlay[hOffset + 52] = 0x00;
          encounterOverlay[hOffset + 53] = 0x00;
          encounterOverlay[hOffset + 54] = 0x80;
          encounterOverlay[hOffset + 55] = 0x19;

          encounterOverlay[hOffset + 102] = htMaxLevel & 0xff;

          const newRange = htMaxLevel - htLevel;
          const divisor = Math.floor(0xFFFF / (newRange + 1)) + 1;
          FileFunctions.writeFullInt(encounterOverlay, hOffset + 148, divisor);
        }
      }
      this.writeExtraEncountersDPPt(honeyTreeData, 0, honeyTreeEncounters.encounters);
    }

    // Trophy Garden rotating Pokemon
    const trophyGardenData = extraEncounterData.files[8];
    const trophyGardenEncounters = nextSet();

    // Softlock prevention: ensure not all same species
    const distinctSpecies = new Set(trophyGardenEncounters.encounters.map(e => e.pokemon?.number));
    if (distinctSpecies.size === 1) {
      trophyGardenEncounters.encounters[0].pokemon = this.randomPokemon();
    }
    this.writeExtraEncountersDPPt(trophyGardenData, 0, trophyGardenEncounters.encounters);

    // Great Marsh rotating Pokemon
    const greatMarshOffs = [9, 10];
    for (let i = 0; i < greatMarshOffs.length; i++) {
      const greatMarshData = extraEncounterData.files[greatMarshOffs[i]];
      const greatMarshEncounters = nextSet();
      this.writeExtraEncountersDPPt(greatMarshData, 0, greatMarshEncounters.encounters);
    }

    // Save
    if (encounterOverlay) {
      this.writeOverlay(romEntryGetInt(this.romEntry, 'EncounterOvlNumber'), encounterOverlay);
    }
    this.writeNARC(extraEncountersFile, extraEncounterData);
  }

  private writeEncountersDPPt(data: Uint8Array, offset: number, encounters: Encounter[], enclength: number): void {
    for (let i = 0; i < enclength; i++) {
      const enc = encounters[i];
      writeLong(data, offset + i * 8, enc.level);
      writeLong(data, offset + i * 8 + 4, enc.pokemon!.number);
    }
  }

  private writeSeaEncountersDPPt(data: Uint8Array, offset: number, encounters: Encounter[]): void {
    for (let i = 0; i < encounters.length; i++) {
      const enc = encounters[i];
      writeLong(data, offset + i * 8, (enc.level << 8) + enc.maxLevel);
      writeLong(data, offset + i * 8 + 4, enc.pokemon!.number);
    }
  }

  private writeExtraEncountersDPPt(data: Uint8Array, offset: number, encounters: Encounter[]): void {
    for (let i = 0; i < encounters.length; i++) {
      writeLong(data, offset + i * 4, encounters[i].pokemon!.number);
    }
  }

  // -----------------------------------------------------------------------
  // Wild Encounters - HGSS
  // -----------------------------------------------------------------------

  private getEncountersHGSS(useTimeOfDay: boolean): EncounterSet[] {
    const encountersFile = romEntryGetFile(this.romEntry, 'WildPokemon');
    const encounterData = this.readNARC(encountersFile);
    const encounters: EncounterSet[] = [];
    const amounts = [0, 5, 2, 5, 5, 5];

    let c = -1;
    for (const b of encounterData.files) {
      c++;
      if (!this.wildMapNames.has(c)) {
        this.wildMapNames.set(c, '? Unknown ?');
      }
      const mapName = this.wildMapNames.get(c)!;
      const rates: number[] = [];
      for (let i = 0; i < 6; i++) {
        rates.push(b[i] & 0xFF);
      }

      const grassLevels: number[] = [];
      for (let i = 0; i < 12; i++) {
        grassLevels.push(b[8 + i] & 0xFF);
      }

      const grassPokes: (Pokemon | null)[][] = [
        this.readPokemonHGSS(b, 20, 12),
        this.readPokemonHGSS(b, 44, 12),
        this.readPokemonHGSS(b, 68, 12),
      ];

      if (rates[0] !== 0) {
        if (!useTimeOfDay) {
          const grassEncounters = this.stitchEncsToLevels(grassPokes[1], grassLevels);
          const grass = new EncounterSet();
          grass.encounters = grassEncounters;
          grass.rate = rates[0];
          grass.displayName = mapName + ' Grass/Cave';
          encounters.push(grass);
        } else {
          for (let i = 0; i < 3; i++) {
            const grass = new EncounterSet();
            grass.encounters = this.stitchEncsToLevels(grassPokes[i], grassLevels);
            grass.rate = rates[0];
            grass.displayName = mapName + ' ' + Gen4Constants.hgssTimeOfDayNames[i] + ' Grass/Cave';
            encounters.push(grass);
          }
        }
      }

      // Hoenn/Sinnoh Radio
      const radio = this.readOptionalEncountersHGSS(b, 92, 4);
      radio.displayName = mapName + ' Hoenn/Sinnoh Radio';
      if (radio.encounters.length > 0) {
        encounters.push(radio);
      }

      // Surfing, Rock Smash, Rods
      let offset = 100;
      for (let i = 1; i < 6; i++) {
        const encountersHere = this.readSeaEncountersHGSS(b, offset, amounts[i]);
        offset += 4 * amounts[i];
        if (rates[i] !== 0) {
          const other = new EncounterSet();
          other.encounters = encountersHere;
          other.displayName = mapName + ' ' + Gen4Constants.hgssNonGrassSetNames[i];
          other.rate = rates[i];
          encounters.push(other);
        }
      }

      // Swarms
      const swarms = this.readOptionalEncountersHGSS(b, offset, 2);
      swarms.displayName = mapName + ' Swarms';
      if (swarms.encounters.length > 0) {
        encounters.push(swarms);
      }
      const nightFishingReplacement = this.readOptionalEncountersHGSS(b, offset + 4, 1);
      nightFishingReplacement.displayName = mapName + ' Night Fishing Replacement';
      if (nightFishingReplacement.encounters.length > 0) {
        encounters.push(nightFishingReplacement);
      }
      const fishingSwarms = this.readOptionalEncountersHGSS(b, offset + 6, 1);
      fishingSwarms.displayName = mapName + ' Fishing Swarm';
      if (fishingSwarms.encounters.length > 0) {
        encounters.push(fishingSwarms);
      }
    }

    // Headbutt Encounters
    const headbuttEncountersFile = romEntryGetFile(this.romEntry, 'HeadbuttPokemon');
    const headbuttEncounterData = this.readNARC(headbuttEncountersFile);
    c = -1;
    for (const b of headbuttEncounterData.files) {
      c++;
      if (b.length === 4) {
        continue;
      }
      const mapName = this.headbuttMapNames.get(c) ?? '? Unknown ?';
      const headbuttEncounters = this.readHeadbuttEncountersHGSS(b, 4, 18);
      headbuttEncounters.displayName = mapName + ' Headbutt';
      if (headbuttEncounters.encounters.length > 0 && c !== 24) {
        encounters.push(headbuttEncounters);
      }
    }

    // Bug Catching Contest Encounters
    const bccEncountersFile = romEntryGetFile(this.romEntry, 'BCCWilds');
    const bccEncountersData = this.readFile(bccEncountersFile);
    if (bccEncountersData) {
      const bccPre = this.readBCCEncountersHGSS(bccEncountersData, 0, 10);
      bccPre.displayName = 'Bug Catching Contest (Pre-National Dex)';
      if (bccPre.encounters.length > 0) encounters.push(bccPre);

      const bccPostTues = this.readBCCEncountersHGSS(bccEncountersData, 80, 10);
      bccPostTues.displayName = 'Bug Catching Contest (Post-National Dex, Tuesdays)';
      if (bccPostTues.encounters.length > 0) encounters.push(bccPostTues);

      const bccPostThurs = this.readBCCEncountersHGSS(bccEncountersData, 160, 10);
      bccPostThurs.displayName = 'Bug Catching Contest (Post-National Dex, Thursdays)';
      if (bccPostThurs.encounters.length > 0) encounters.push(bccPostThurs);

      const bccPostSat = this.readBCCEncountersHGSS(bccEncountersData, 240, 10);
      bccPostSat.displayName = 'Bug Catching Contest (Post-National Dex, Saturdays)';
      if (bccPostSat.encounters.length > 0) encounters.push(bccPostSat);
    }
    return encounters;
  }

  private readOptionalEncountersHGSS(data: Uint8Array, offset: number, amount: number): EncounterSet {
    const es = new EncounterSet();
    es.rate = 1;
    for (let i = 0; i < amount; i++) {
      const pokemon = readWord(data, offset + i * 2);
      if (pokemon !== 0) {
        const e = new Encounter();
        e.level = 1;
        e.pokemon = this.pokes[pokemon] ?? null;
        es.encounters.push(e);
      }
    }
    return es;
  }

  private readPokemonHGSS(data: Uint8Array, offset: number, amount: number): (Pokemon | null)[] {
    const pokesHere: (Pokemon | null)[] = [];
    for (let i = 0; i < amount; i++) {
      pokesHere.push(this.pokes[readWord(data, offset + i * 2)] ?? null);
    }
    return pokesHere;
  }

  private readSeaEncountersHGSS(data: Uint8Array, offset: number, amount: number): Encounter[] {
    const encounters: Encounter[] = [];
    for (let i = 0; i < amount; i++) {
      const level = readWord(data, offset + i * 4);
      const pokemon = readWord(data, offset + 2 + i * 4);
      const enc = new Encounter();
      enc.level = level & 0xFF;
      enc.maxLevel = level >> 8;
      enc.pokemon = this.pokes[pokemon] ?? null;
      encounters.push(enc);
    }
    return encounters;
  }

  private readHeadbuttEncountersHGSS(data: Uint8Array, offset: number, amount: number): EncounterSet {
    const es = new EncounterSet();
    es.rate = 1;
    for (let i = 0; i < amount; i++) {
      const pokemon = readWord(data, offset + i * 4);
      if (pokemon !== 0) {
        const enc = new Encounter();
        enc.level = data[offset + 2 + i * 4];
        enc.maxLevel = data[offset + 3 + i * 4];
        enc.pokemon = this.pokes[pokemon] ?? null;
        es.encounters.push(enc);
      }
    }
    return es;
  }

  private readBCCEncountersHGSS(data: Uint8Array, offset: number, amount: number): EncounterSet {
    const es = new EncounterSet();
    es.rate = 1;
    for (let i = 0; i < amount; i++) {
      const pokemon = readWord(data, offset + i * 8);
      if (pokemon !== 0) {
        const enc = new Encounter();
        enc.level = data[offset + 2 + i * 8];
        enc.maxLevel = data[offset + 3 + i * 8];
        enc.pokemon = this.pokes[pokemon] ?? null;
        es.encounters.push(enc);
      }
    }
    return es;
  }

  private stitchEncsToLevels(pokemon: (Pokemon | null)[], levels: number[]): Encounter[] {
    const encounters: Encounter[] = [];
    for (let i = 0; i < pokemon.length; i++) {
      const enc = new Encounter();
      enc.level = levels[i];
      enc.pokemon = pokemon[i];
      encounters.push(enc);
    }
    return encounters;
  }

  private setEncountersHGSS(useTimeOfDay: boolean, encounterList: EncounterSet[]): void {
    const encountersFile = romEntryGetFile(this.romEntry, 'WildPokemon');
    const encounterData = this.readNARC(encountersFile);
    let idx = 0;
    const nextSet = (): EncounterSet => encounterList[idx++];
    const amounts = [0, 5, 2, 5, 5, 5];

    for (const b of encounterData.files) {
      const rates: number[] = [];
      for (let i = 0; i < 6; i++) {
        rates.push(b[i] & 0xFF);
      }

      if (rates[0] !== 0) {
        if (!useTimeOfDay) {
          const grass = nextSet();
          this.writeGrassEncounterLevelsHGSS(b, 8, grass.encounters);
          this.writePokemonHGSS(b, 20, grass.encounters);
          this.writePokemonHGSS(b, 44, grass.encounters);
          this.writePokemonHGSS(b, 68, grass.encounters);
        } else {
          let grass = nextSet();
          this.writeGrassEncounterLevelsHGSS(b, 8, grass.encounters);
          this.writePokemonHGSS(b, 20, grass.encounters);
          for (let i = 1; i < 3; i++) {
            grass = nextSet();
            this.writePokemonHGSS(b, 20 + i * 24, grass.encounters);
          }
        }
      }

      // Write radio pokemon
      this.writeOptionalEncountersHGSS(b, 92, 4, encounterList, idx);
      idx = this.lastOptionalIdx;

      // Surf, rock smash, rods
      let offset = 100;
      for (let i = 1; i < 6; i++) {
        if (rates[i] !== 0) {
          const other = nextSet();
          this.writeSeaEncountersHGSS(b, offset, other.encounters);
        }
        offset += 4 * amounts[i];
      }

      // Swarms
      this.writeOptionalEncountersHGSS(b, offset, 2, encounterList, idx);
      idx = this.lastOptionalIdx;
      this.writeOptionalEncountersHGSS(b, offset + 4, 1, encounterList, idx);
      idx = this.lastOptionalIdx;
      this.writeOptionalEncountersHGSS(b, offset + 6, 1, encounterList, idx);
      idx = this.lastOptionalIdx;
    }

    this.writeNARC(encountersFile, encounterData);

    // Write Headbutt encounters
    const headbuttEncountersFile = romEntryGetFile(this.romEntry, 'HeadbuttPokemon');
    const headbuttEncounterData = this.readNARC(headbuttEncountersFile);
    let c = -1;
    for (const b of headbuttEncounterData.files) {
      c++;
      if (b.length === 4 || c === 24) {
        continue;
      }
      const headbutt = nextSet();
      this.writeHeadbuttEncountersHGSS(b, 4, headbutt.encounters);
    }
    this.writeNARC(headbuttEncountersFile, headbuttEncounterData);

    // Write Bug Catching Contest encounters
    const bccEncountersFile = romEntryGetFile(this.romEntry, 'BCCWilds');
    const bccEncountersData = this.readFile(bccEncountersFile);
    if (bccEncountersData) {
      const bccPre = nextSet();
      this.writeBCCEncountersHGSS(bccEncountersData, 0, bccPre.encounters);
      const bccPostTues = nextSet();
      this.writeBCCEncountersHGSS(bccEncountersData, 80, bccPostTues.encounters);
      const bccPostThurs = nextSet();
      this.writeBCCEncountersHGSS(bccEncountersData, 160, bccPostThurs.encounters);
      const bccPostSat = nextSet();
      this.writeBCCEncountersHGSS(bccEncountersData, 240, bccPostSat.encounters);
      this.writeFile(bccEncountersFile, bccEncountersData);
    }
  }

  // Used by writeOptionalEncountersHGSS to track the encounter list index
  private lastOptionalIdx = 0;

  private writeOptionalEncountersHGSS(
    data: Uint8Array,
    offset: number,
    amount: number,
    encounterList: EncounterSet[],
    startIdx: number
  ): void {
    let eIter: Encounter[] | null = null;
    let eIdx = 0;
    let currentIdx = startIdx;
    for (let i = 0; i < amount; i++) {
      const origPokemon = readWord(data, offset + i * 2);
      if (origPokemon !== 0) {
        if (eIter === null) {
          eIter = encounterList[currentIdx++].encounters;
          eIdx = 0;
        }
        const here = eIter[eIdx++];
        writeWord(data, offset + i * 2, here.pokemon!.number);
      }
    }
    this.lastOptionalIdx = currentIdx;
  }

  private writeGrassEncounterLevelsHGSS(data: Uint8Array, offset: number, encounters: Encounter[]): void {
    for (let i = 0; i < encounters.length; i++) {
      data[offset + i] = encounters[i].level & 0xff;
    }
  }

  private writePokemonHGSS(data: Uint8Array, offset: number, encounters: Encounter[]): void {
    for (let i = 0; i < encounters.length; i++) {
      writeWord(data, offset + i * 2, encounters[i].pokemon!.number);
    }
  }

  private writeSeaEncountersHGSS(data: Uint8Array, offset: number, encounters: Encounter[]): void {
    for (let i = 0; i < encounters.length; i++) {
      const enc = encounters[i];
      data[offset + i * 4] = enc.level & 0xff;
      data[offset + i * 4 + 1] = enc.maxLevel & 0xff;
      writeWord(data, offset + i * 4 + 2, enc.pokemon!.number);
    }
  }

  private writeHeadbuttEncountersHGSS(data: Uint8Array, offset: number, encounters: Encounter[]): void {
    for (let i = 0; i < encounters.length; i++) {
      const enc = encounters[i];
      writeWord(data, offset + i * 4, enc.pokemon!.number);
      data[offset + 2 + i * 4] = enc.level & 0xff;
      data[offset + 3 + i * 4] = enc.maxLevel & 0xff;
    }
  }

  private writeBCCEncountersHGSS(data: Uint8Array, offset: number, encounters: Encounter[]): void {
    for (let i = 0; i < encounters.length; i++) {
      const enc = encounters[i];
      writeWord(data, offset + i * 8, enc.pokemon!.number);
      data[offset + 2 + i * 8] = enc.level & 0xff;
      data[offset + 3 + i * 8] = enc.maxLevel & 0xff;
    }
  }

  // -----------------------------------------------------------------------
  // Wild Map Names
  // -----------------------------------------------------------------------

  private loadWildMapNames(): void {
    this.wildMapNames = new Map();
    this.headbuttMapNames = new Map();
    const internalNames = this.readFile(romEntryGetFile(this.romEntry, 'MapTableFile'));
    if (!internalNames) return;
    const numMapHeaders = Math.floor(internalNames.length / 16);
    const baseMHOffset = romEntryGetInt(this.romEntry, 'MapTableARM9Offset');
    const allMapNames = this.getStringsLocal(romEntryGetInt(this.romEntry, 'MapNamesTextOffset'));
    const mapNameIndexSize = romEntryGetInt(this.romEntry, 'MapTableNameIndexSize');
    for (let map = 0; map < numMapHeaders; map++) {
      const baseOffset = baseMHOffset + map * 24;
      const mapNameIndex = (mapNameIndexSize === 2)
        ? readWord(this.arm9, baseOffset + 18)
        : (this.arm9[baseOffset + 18] & 0xFF);
      const mapName = allMapNames[mapNameIndex] ?? '? Unknown ?';
      if (this.romEntry.romType === Gen4Constants.Type_HGSS) {
        const wildSet = this.arm9[baseOffset] & 0xFF;
        if (wildSet !== 255) {
          this.wildMapNames.set(wildSet, mapName);
        }
        this.headbuttMapNames.set(map, mapName);
      } else {
        const wildSet = readWord(this.arm9, baseOffset + 14);
        if (wildSet !== 65535) {
          this.wildMapNames.set(wildSet, mapName);
        }
      }
    }
    this.loadedWildMapNames = true;
  }

  // -----------------------------------------------------------------------
  // Pokedex Area Data (no-op stubs)
  // -----------------------------------------------------------------------

  // TODO: Implement full pokedex area data updating for DPPt
  private updatePokedexAreaDataDPPt(_encounters: EncounterSet[]): void {
    // No-op: pokedex area data updating is very complex and not essential for randomization
  }

  // TODO: Implement full pokedex area data updating for HGSS
  private updatePokedexAreaDataHGSS(_encounters: EncounterSet[]): void {
    // No-op: pokedex area data updating is very complex and not essential for randomization
  }

  hasWildAltFormes(): boolean { return false; }
  // randomizeWildHeldItems inherited from AbstractRomHandler
  enableGuaranteedPokemonCatching(): void {
    const battleOverlay = this.readOverlay(romEntryGetInt(this.romEntry, 'BattleOvlNumber'));
    if (!battleOverlay) return;
    const offset = find(battleOverlay, Gen4Constants.perfectOddsBranchLocator);
    if (offset > 0) {
      // Nop out the cmp + bcc instructions so Pokemon are always caught
      battleOverlay[offset] = 0x00;
      battleOverlay[offset + 1] = 0x00;
      battleOverlay[offset + 2] = 0x00;
      battleOverlay[offset + 3] = 0x00;
      this.writeOverlay(romEntryGetInt(this.romEntry, 'BattleOvlNumber'), battleOverlay);
    }
  }
  getTrainers(): Trainer[] {
    const allTrainers: Trainer[] = [];
    const trainers = this.readNARC(romEntryGetFile(this.romEntry, 'TrainerData'));
    const trpokes = this.readNARC(romEntryGetFile(this.romEntry, 'TrainerPokemon'));
    const tclasses = this.getTrainerClassNames();
    const tnames = this.getTrainerNames();
    const trainernum = trainers.files.length;
    for (let i = 1; i < trainernum; i++) {
      const trainer = trainers.files[i];
      const trpoke = trpokes.files[i];
      const tr = new Trainer();
      tr.poketype = trainer[0] & 0xFF;
      tr.trainerclass = trainer[1] & 0xFF;
      tr.index = i;
      const numPokes = trainer[3] & 0xFF;
      let pokeOffs = 0;
      tr.fullDisplayName = tclasses[tr.trainerclass] + ' ' + tnames[i - 1];
      for (let poke = 0; poke < numPokes; poke++) {
        const difficulty = trpoke[pokeOffs] & 0xFF;
        const level = trpoke[pokeOffs + 2] & 0xFF;
        const species = (trpoke[pokeOffs + 4] & 0xFF) + ((trpoke[pokeOffs + 5] & 0x01) << 8);
        const formnum = (trpoke[pokeOffs + 5] >> 2);
        const tpk = new TrainerPokemon();
        tpk.level = level;
        tpk.pokemon = this.pokes[species]!;
        tpk.IVs = Math.floor((difficulty * 31) / 255);
        let abilitySlot = (trpoke[pokeOffs + 1] >>> 4) & 0xF;
        if (abilitySlot === 0) {
          abilitySlot = 1;
        }
        tpk.abilitySlot = abilitySlot;
        tpk.forme = formnum;
        tpk.formeSuffix = Gen4Constants.getFormeSuffixByBaseForme(species, formnum);
        pokeOffs += 6;
        if (tr.pokemonHaveItems()) {
          tpk.heldItem = readWord(trpoke, pokeOffs);
          pokeOffs += 2;
        }
        if (tr.pokemonHaveCustomMoves()) {
          for (let move = 0; move < 4; move++) {
            tpk.moves[move] = readWord(trpoke, pokeOffs + (move * 2));
          }
          pokeOffs += 8;
        }
        if (this.romEntry.romType !== Gen4Constants.Type_DP) {
          pokeOffs += 2;
        }
        tr.pokemon.push(tpk);
      }
      allTrainers.push(tr);
    }
    if (this.romEntry.romType === Gen4Constants.Type_DP) {
      Gen4Constants.tagTrainersDP(allTrainers);
      Gen4Constants.setMultiBattleStatusDP(allTrainers);
    } else if (this.romEntry.romType === Gen4Constants.Type_Plat) {
      Gen4Constants.tagTrainersPt(allTrainers);
      Gen4Constants.setMultiBattleStatusPt(allTrainers);
    } else {
      Gen4Constants.tagTrainersHGSS(allTrainers);
      Gen4Constants.setMultiBattleStatusHGSS(allTrainers);
    }
    return allTrainers;
  }

  getMainPlaythroughTrainers(): number[] { return []; }

  getEliteFourTrainers(_isChallengeMode: boolean): number[] {
    return this.romEntry.arrayEntries.get('EliteFourIndices') ?? [];
  }

  setTrainers(trainerData: Trainer[], doubleBattleMode: boolean): void {
    if (this.romEntry.romType === Gen4Constants.Type_HGSS) {
      this.fixAbilitySlotValuesForHGSS(trainerData);
    }
    const trainerIter = trainerData[Symbol.iterator]();
    const trainers = this.readNARC(romEntryGetFile(this.romEntry, 'TrainerData'));
    const trpokes = new NARCArchive();

    const movesets = this.getMovesLearnt();

    trpokes.files.push(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]));
    const trainernum = trainers.files.length;
    for (let i = 1; i < trainernum; i++) {
      const trainer = trainers.files[i];
      const tr = trainerIter.next().value as Trainer;
      trainer[0] = tr.poketype & 0xFF;
      const numPokes = tr.pokemon.length;
      trainer[3] = numPokes & 0xFF;

      if (doubleBattleMode) {
        if (!tr.skipImportant()) {
          const excludedPartnerTrainer = this.romEntry.romType !== Gen4Constants.Type_HGSS &&
            Gen4Constants.partnerTrainerIndices.includes(tr.index);
          if (trainer[16] === 0 && !excludedPartnerTrainer) {
            trainer[16] |= 3;
          }
        }
      }

      let bytesNeeded = 6 * numPokes;
      if (this.romEntry.romType !== Gen4Constants.Type_DP) {
        bytesNeeded += 2 * numPokes;
      }
      if (tr.pokemonHaveCustomMoves()) {
        bytesNeeded += 8 * numPokes;
      }
      if (tr.pokemonHaveItems()) {
        bytesNeeded += 2 * numPokes;
      }
      const trpoke = new Uint8Array(bytesNeeded);
      let pokeOffs = 0;
      for (let poke = 0; poke < numPokes; poke++) {
        const tp = tr.pokemon[poke];
        let ability = tp.abilitySlot << 4;
        if (tp.abilitySlot === 1) {
          ability = 0;
        }
        const difficulty = Math.min(255, 1 + Math.floor((tp.IVs * 255) / 31));
        writeWord(trpoke, pokeOffs, (difficulty & 0xFF) | ((ability & 0xFF) << 8));
        writeWord(trpoke, pokeOffs + 2, tp.level);
        writeWord(trpoke, pokeOffs + 4, tp.pokemon.number);
        trpoke[pokeOffs + 5] |= (tp.forme << 2);
        pokeOffs += 6;
        if (tr.pokemonHaveItems()) {
          writeWord(trpoke, pokeOffs, tp.heldItem);
          pokeOffs += 2;
        }
        if (tr.pokemonHaveCustomMoves()) {
          if (tp.resetMoves) {
            const pokeMoves = RomFunctions.getMovesAtLevel(this.getAltFormeOfPokemon(tp.pokemon, tp.forme).number, movesets, tp.level);
            for (let m = 0; m < 4; m++) {
              writeWord(trpoke, pokeOffs + m * 2, pokeMoves[m]);
            }
          } else {
            writeWord(trpoke, pokeOffs, tp.moves[0]);
            writeWord(trpoke, pokeOffs + 2, tp.moves[1]);
            writeWord(trpoke, pokeOffs + 4, tp.moves[2]);
            writeWord(trpoke, pokeOffs + 6, tp.moves[3]);
          }
          pokeOffs += 8;
        }
        if (this.romEntry.romType !== Gen4Constants.Type_DP) {
          pokeOffs += 2;
        }
      }
      trpokes.files.push(trpoke);
    }
    this.writeNARC(romEntryGetFile(this.romEntry, 'TrainerData'), trainers);
    this.writeNARC(romEntryGetFile(this.romEntry, 'TrainerPokemon'), trpokes);

    if (doubleBattleMode) {
      const doubleBattleFixPrefix = Gen4Constants.getDoubleBattleFixPrefix(this.romEntry.romType);
      let offset = this.findInData(this.arm9, doubleBattleFixPrefix);
      if (offset > 0) {
        offset += doubleBattleFixPrefix.length / 2;
        this.arm9[offset] = 0xE0;
      } else {
        throw new Error('Double Battle Mode not supported for this game');
      }

      const doubleBattleFlagReturnPrefix = romEntryGetString(this.romEntry, 'DoubleBattleFlagReturnPrefix');
      const doubleBattleWalkingPrefix1 = romEntryGetString(this.romEntry, 'DoubleBattleWalkingPrefix1');
      const doubleBattleWalkingPrefix2 = romEntryGetString(this.romEntry, 'DoubleBattleWalkingPrefix2');
      const doubleBattleTextBoxPrefix = romEntryGetString(this.romEntry, 'DoubleBattleTextBoxPrefix');

      offset = this.findInData(this.arm9, doubleBattleFlagReturnPrefix);
      if (offset > 0) {
        offset += doubleBattleFlagReturnPrefix.length / 2;
        writeWord(this.arm9, offset, 0xBD08);
      } else {
        throw new Error('Double Battle Mode not supported for this game');
      }

      offset = this.findInData(this.arm9, doubleBattleWalkingPrefix1);
      if (offset > 0) {
        offset += doubleBattleWalkingPrefix1.length / 2;
        this.arm9[offset] = 0x2;
        this.arm9[offset + 3] = 0xD0;
      } else {
        throw new Error('Double Battle Mode not supported for this game');
      }

      offset = this.findInData(this.arm9, doubleBattleWalkingPrefix2);
      if (offset > 0) {
        offset += doubleBattleWalkingPrefix2.length / 2;
        this.arm9[offset] = 0x2;
      } else {
        throw new Error('Double Battle Mode not supported for this game');
      }

      offset = this.findInData(this.arm9, doubleBattleTextBoxPrefix);
      if (offset > 0) {
        offset += doubleBattleTextBoxPrefix.length / 2;
        writeWord(this.arm9, offset, 0x46C0);
        writeWord(this.arm9, offset + 2, 0x2802);
        this.arm9[offset + 5] = 0xD0;
      } else {
        throw new Error('Double Battle Mode not supported for this game');
      }

      const battleSkillSubSeq = this.readNARC(romEntryGetFile(this.romEntry, 'BattleSkillSubSeq'));
      const trainerEndFile = battleSkillSubSeq.files[romEntryGetInt(this.romEntry, 'TrainerEndFileNumber')];
      trainerEndFile[romEntryGetInt(this.romEntry, 'TrainerEndTextBoxOffset')] = 0;
      this.writeNARC(romEntryGetFile(this.romEntry, 'BattleSkillSubSeq'), battleSkillSubSeq);
    }
  }

  private fixAbilitySlotValuesForHGSS(trainers: Trainer[]): void {
    for (const tr of trainers) {
      if (tr.pokemon.length > 0) {
        const lastPokemon = tr.pokemon[tr.pokemon.length - 1];
        const lastAbilitySlot = lastPokemon.abilitySlot;
        for (let i = 0; i < tr.pokemon.length; i++) {
          tr.pokemon[i].abilitySlot = lastAbilitySlot;
        }
      }
    }
  }

  // getMoveSelectionPoolAtLevel inherited from AbstractRomHandler
  getMovesLearnt(): Map<number, MoveLearnt[]> {
    const movesets = new Map<number, MoveLearnt[]>();
    const movesLearntNarc = this.readNARC(romEntryGetFile(this.romEntry, 'PokemonMovesets'));
    const formeCount = Gen4Constants.getFormeCount(this.romEntry.romType);
    for (let i = 1; i <= Gen4Constants.pokemonCount + formeCount; i++) {
      const pkmn = this.pokes[i];
      let fileIndex: number;
      if (i > Gen4Constants.pokemonCount) {
        fileIndex = i + Gen4Constants.formeOffset;
      } else {
        fileIndex = i;
      }
      if (!pkmn) continue;
      const rom = movesLearntNarc.files[fileIndex];
      let moveDataLoc = 0;
      const learnt: MoveLearnt[] = [];
      while ((rom[moveDataLoc] & 0xFF) !== 0xFF || (rom[moveDataLoc + 1] & 0xFF) !== 0xFF) {
        const moveLow = rom[moveDataLoc] & 0xFF;
        const secondByte = rom[moveDataLoc + 1] & 0xFF;
        const level = (secondByte & 0xFE) >> 1;
        let move = moveLow;
        if ((secondByte & 0x01) === 0x01) {
          move += 256;
        }
        const ml = new MoveLearnt();
        ml.level = level;
        ml.move = move;
        learnt.push(ml);
        moveDataLoc += 2;
      }
      movesets.set(pkmn.number, learnt);
    }
    return movesets;
  }

  setMovesLearnt(movesets: Map<number, MoveLearnt[]>): void {
    const movesLearntNarc = new NARCArchive();
    const blankSet = new Uint8Array([0xFF, 0xFF, 0, 0]);
    movesLearntNarc.files.push(blankSet);
    const formeCount = Gen4Constants.getFormeCount(this.romEntry.romType);
    for (let i = 1; i <= Gen4Constants.pokemonCount + formeCount; i++) {
      if (i === Gen4Constants.pokemonCount + 1) {
        for (let j = 0; j < Gen4Constants.formeOffset; j++) {
          movesLearntNarc.files.push(blankSet);
        }
      }
      const pkmn = this.pokes[i];
      if (!pkmn) continue;
      const learnt = movesets.get(pkmn.number)!;
      let sizeNeeded = learnt.length * 2 + 2;
      if ((sizeNeeded % 4) !== 0) {
        sizeNeeded += 2;
      }
      const moveset = new Uint8Array(sizeNeeded);
      let j = 0;
      for (; j < learnt.length; j++) {
        const ml = learnt[j];
        moveset[j * 2] = ml.move & 0xFF;
        let levelPart = (ml.level << 1) & 0xFE;
        if (ml.move > 255) {
          levelPart++;
        }
        moveset[j * 2 + 1] = levelPart;
      }
      moveset[j * 2] = 0xFF;
      moveset[j * 2 + 1] = 0xFF;
      movesLearntNarc.files.push(moveset);
    }
    this.writeNARC(romEntryGetFile(this.romEntry, 'PokemonMovesets'), movesLearntNarc);
  }

  getEggMoves(): Map<number, number[]> {
    let eggMoves = new Map<number, number[]>();
    if (this.romEntry.romType === Gen4Constants.Type_HGSS) {
      const eggMoveNARC = this.readNARC(romEntryGetFile(this.romEntry, 'EggMoves'));
      const eggMoveData = eggMoveNARC.files[0];
      eggMoves = this.readEggMovesData(eggMoveData, 0);
    } else {
      const fieldOvl = this.readOverlay(romEntryGetInt(this.romEntry, 'FieldOvlNumber'));
      if (fieldOvl) {
        const offset = this.findInData(fieldOvl, Gen4Constants.dpptEggMoveTablePrefix);
        if (offset > 0) {
          const realOffset = offset + Gen4Constants.dpptEggMoveTablePrefix.length / 2;
          eggMoves = this.readEggMovesData(fieldOvl, realOffset);
        }
      }
    }
    return eggMoves;
  }

  setEggMoves(eggMoves: Map<number, number[]>): void {
    if (this.romEntry.romType === Gen4Constants.Type_HGSS) {
      const eggMoveNARC = this.readNARC(romEntryGetFile(this.romEntry, 'EggMoves'));
      const eggMoveData = eggMoveNARC.files[0];
      this.writeEggMovesData(eggMoves, eggMoveData, 0);
      eggMoveNARC.files[0] = eggMoveData;
      this.writeNARC(romEntryGetFile(this.romEntry, 'EggMoves'), eggMoveNARC);
    } else {
      const fieldOvl = this.readOverlay(romEntryGetInt(this.romEntry, 'FieldOvlNumber'));
      if (fieldOvl) {
        const offset = this.findInData(fieldOvl, Gen4Constants.dpptEggMoveTablePrefix);
        if (offset > 0) {
          const realOffset = offset + Gen4Constants.dpptEggMoveTablePrefix.length / 2;
          this.writeEggMovesData(eggMoves, fieldOvl, realOffset);
          this.writeOverlay(romEntryGetInt(this.romEntry, 'FieldOvlNumber'), fieldOvl);
        }
      }
    }
  }

  private readEggMovesData(data: Uint8Array, startingOffset: number): Map<number, number[]> {
    const eggMoves = new Map<number, number[]>();
    let currentOffset = startingOffset;
    let currentSpecies = 0;
    let currentMoves: number[] = [];
    let val = readWord(data, currentOffset);
    while (val !== 0xFFFF) {
      if (val > 20000) {
        const species = val - 20000;
        if (currentMoves.length > 0) {
          eggMoves.set(currentSpecies, currentMoves);
        }
        currentSpecies = species;
        currentMoves = [];
      } else {
        currentMoves.push(val);
      }
      currentOffset += 2;
      val = readWord(data, currentOffset);
    }
    if (currentMoves.length > 0) {
      eggMoves.set(currentSpecies, currentMoves);
    }
    return eggMoves;
  }

  private writeEggMovesData(eggMoves: Map<number, number[]>, data: Uint8Array, startingOffset: number): void {
    let currentOffset = startingOffset;
    for (const [species, moves] of eggMoves) {
      writeWord(data, currentOffset, species + 20000);
      currentOffset += 2;
      for (const move of moves) {
        writeWord(data, currentOffset, move);
        currentOffset += 2;
      }
    }
  }

  // randomizeEggMoves inherited from AbstractRomHandler
  supportsFourStartingMoves(): boolean { return true; }
  canChangeStaticPokemon(): boolean { return this.romEntry.staticPokemonSupport; }
  getStaticPokemon(): StaticEncounter[] { return this.getStaticPokemonImpl(); }
  setStaticPokemon(staticPokemon: StaticEncounter[]): boolean { return this.setStaticPokemonImpl(staticPokemon); }
  hasStaticAltFormes(): boolean { return false; }
  hasMainGameLegendaries(): boolean {
    return this.romEntry.arrayEntries.has('MainGameLegendaries');
  }
  getMainGameLegendaries(): number[] {
    return this.romEntry.arrayEntries.get('MainGameLegendaries') ?? [];
  }
  getSpecialMusicStatics(): number[] {
    return this.romEntry.arrayEntries.get('SpecialMusicStatics') ?? [];
  }
  applyCorrectStaticMusic(specialMusicStaticChanges: Map<number, number>): void { this.applyCorrectStaticMusicImpl(specialMusicStaticChanges); }
  hasStaticMusicFix(): boolean { return this.romEntry.tweakFiles.get('NewIndexToMusicTweak') != null || this.romEntry.romType === Gen4Constants.Type_HGSS; }
  getTotemPokemon(): TotemPokemon[] { return []; }
  setTotemPokemon(_totemPokemon: TotemPokemon[]): void { /* stub */ }
  randomizeTotemPokemon(_settings: Settings): void { /* stub */ }
  getTMMoves(): number[] {
    const pfx = (this.romEntry.romType === Gen4Constants.Type_DP || this.romEntry.romType === Gen4Constants.Type_Plat) ? Gen4Constants.dpptTMDataPrefix : Gen4Constants.hgssTMDataPrefix;
    let offset = find(this.arm9, pfx);
    if (offset > 0) {
      offset += pfx.length / 2;
      const tms: number[] = [];
      for (let i = 0; i < Gen4Constants.tmCount; i++) { tms.push(readWord(this.arm9, offset + i * 2)); }
      return tms;
    }
    return [];
  }
  getHMMoves(): number[] {
    const pfx = (this.romEntry.romType === Gen4Constants.Type_DP || this.romEntry.romType === Gen4Constants.Type_Plat) ? Gen4Constants.dpptTMDataPrefix : Gen4Constants.hgssTMDataPrefix;
    let offset = find(this.arm9, pfx);
    if (offset > 0) {
      offset += pfx.length / 2;
      offset += Gen4Constants.tmCount * 2;
      const hms: number[] = [];
      for (let i = 0; i < Gen4Constants.hmCount; i++) { hms.push(readWord(this.arm9, offset + i * 2)); }
      return hms;
    }
    return [];
  }
  setTMMoves(moveIndexes: number[]): void {
    const oldMoveIndexes = this.getTMMoves();
    const pfx = (this.romEntry.romType === Gen4Constants.Type_DP || this.romEntry.romType === Gen4Constants.Type_Plat) ? Gen4Constants.dpptTMDataPrefix : Gen4Constants.hgssTMDataPrefix;
    let offset = find(this.arm9, pfx);
    if (offset > 0) {
      offset += pfx.length / 2;
      for (let i = 0; i < Gen4Constants.tmCount; i++) { writeWord(this.arm9, offset + i * 2, moveIndexes[i]); }
      const itemDescriptions = this.getStringsLocal(romEntryGetInt(this.romEntry, 'ItemDescriptionsTextOffset'));
      const moveDescriptions = this.getStringsLocal(romEntryGetInt(this.romEntry, 'MoveDescriptionsTextOffset'));
      const textCharsPerLine = Gen4Constants.getTextCharsPerLine(this.romEntry.romType);
      for (let i = 0; i < Gen4Constants.tmCount; i++) {
        itemDescriptions[i + Gen4Constants.tmItemOffset] = RomFunctions.rewriteDescriptionForNewLineSize(moveDescriptions[moveIndexes[i]], '\\n', textCharsPerLine, ssd);
      }
      this.setStringsLocal(romEntryGetInt(this.romEntry, 'ItemDescriptionsTextOffset'), itemDescriptions);
      const baseOfPalettes = (this.romEntry.romType === Gen4Constants.Type_DP) ? Gen4Constants.dpItemPalettesPrefix : Gen4Constants.pthgssItemPalettesPrefix;
      const offsPals = find(this.arm9, baseOfPalettes);
      if (offsPals > 0) {
        for (let i = 0; i < Gen4Constants.tmCount; i++) {
          const m = this.moves[moveIndexes[i]];
          const pal = this.typeTMPaletteNumber(m ? m.type : null);
          writeWord(this.arm9, offsPals + i * 8 + 2, pal);
        }
      }
      for (let i = 0; i < Gen4Constants.tmCount; i++) {
        const oldMoveIndex = oldMoveIndexes[i];
        const newMoveIndex = moveIndexes[i];
        const tmNumber = i + 1;
        if (this.romEntry.tmTexts.has(tmNumber)) {
          const textEntries = this.romEntry.tmTexts.get(tmNumber)!;
          const textFiles = new Set<number>();
          for (const te of textEntries) { textFiles.add(te.textIndex); }
          let oldMoveName = this.moves[oldMoveIndex]?.name ?? '';
          let newMoveName = this.moves[newMoveIndex]?.name ?? '';
          if (this.romEntry.romType === Gen4Constants.Type_HGSS && oldMoveIndex === Moves.roar) {
            oldMoveName = oldMoveName.toUpperCase();
            newMoveName = newMoveName.toUpperCase();
          }
          const replacements = new Map<string, string>();
          replacements.set(oldMoveName, newMoveName);
          for (const textFile of textFiles) { this.replaceAllStringsInEntry(textFile, replacements); }
        }
        if (this.romEntry.tmTextsGameCorner.has(tmNumber)) {
          const te = this.romEntry.tmTextsGameCorner.get(tmNumber)!;
          this.setBottomScreenTMText(te.textIndex, te.stringNumber, newMoveIndex);
        }
        if (this.romEntry.tmScriptOffsetsFrontier.has(tmNumber)) {
          const scriptFile = romEntryGetInt(this.romEntry, 'FrontierScriptNumber');
          const frontierScript = this.scriptNarc!.files[scriptFile];
          const scriptOffset = this.romEntry.tmScriptOffsetsFrontier.get(tmNumber)!;
          writeWord(frontierScript, scriptOffset, newMoveIndex);
        }
        if (this.romEntry.tmTextsFrontier.has(tmNumber)) {
          const textOffset = romEntryGetInt(this.romEntry, 'MiscUITextOffset');
          const stringNumber = this.romEntry.tmTextsFrontier.get(tmNumber)!;
          this.setBottomScreenTMText(textOffset, stringNumber, newMoveIndex);
        }
      }
    }
  }
  private setBottomScreenTMText(textOffset: number, stringNumber: number, newMoveIndex: number): void {
    const strings = this.getStringsLocal(textOffset);
    const originalString = strings[stringNumber];
    const postNameIndex = originalString.indexOf('\\');
    const originalName = originalString.substring(0, postNameIndex);
    const isAllCaps = originalName === originalName.toUpperCase();
    let newName = this.moves[newMoveIndex]?.name ?? '';
    if (isAllCaps) { newName = newName.toUpperCase(); }
    strings[stringNumber] = newName + originalString.substring(postNameIndex);
    this.setStringsLocal(textOffset, strings);
  }
  replaceAllStringsInEntry(entry: number, replacements: Map<string, string>): void {
    const adjusted = new Map<string, string>();
    for (const [key, value] of replacements) { adjusted.set(key, value.replace(/ /g, '_')); }
    const lineLength = Gen4Constants.getTextCharsPerLine(this.romEntry.romType);
    const strings = this.getStringsLocal(entry);
    for (let strNum = 0; strNum < strings.length; strNum++) {
      const oldString = strings[strNum];
      let needsReplacement = false;
      for (const [key] of adjusted) { if (oldString.includes(key)) { needsReplacement = true; break; } }
      if (needsReplacement) {
        let newString = RomFunctions.formatTextWithReplacements(oldString, adjusted, '\\n', '\\l', '\\p', lineLength, ssd);
        newString = newString.replace(/_/g, ' ');
        strings[strNum] = newString;
      }
    }
    this.setStringsLocal(entry, strings);
  }
  getTMCount(): number { return Gen4Constants.tmCount; }
  getHMCount(): number { return Gen4Constants.hmCount; }
  getTMHMCompatibility(): Map<Pokemon, boolean[]> {
    const compat = new Map<Pokemon, boolean[]>();
    const formeCount = Gen4Constants.getFormeCount(this.romEntry.romType);
    for (let i = 1; i <= Gen4Constants.pokemonCount + formeCount; i++) {
      const data = (i > Gen4Constants.pokemonCount) ? this.pokeNarc!.files[i + Gen4Constants.formeOffset] : this.pokeNarc!.files[i];
      const pkmn = this.pokes[i];
      if (!pkmn) continue;
      const flags = new Array<boolean>(Gen4Constants.tmCount + Gen4Constants.hmCount + 1).fill(false);
      for (let j = 0; j < 13; j++) { this.readByteIntoFlags(data, flags, j * 8 + 1, Gen4Constants.bsTMHMCompatOffset + j); }
      compat.set(pkmn, flags);
    }
    return compat;
  }
  setTMHMCompatibility(compatData: Map<Pokemon, boolean[]>): void {
    for (const [pkmn, flags] of compatData) {
      const data = this.pokeNarc!.files[pkmn.number];
      for (let j = 0; j < 13; j++) { data[Gen4Constants.bsTMHMCompatOffset + j] = this.getByteFromFlags(flags, j * 8 + 1); }
    }
  }
  hasMoveTutors(): boolean {
    return this.romEntry.romType !== Gen4Constants.Type_DP;
  }
  getMoveTutorMoves(): number[] {
    if (!this.hasMoveTutors()) return [];
    const baseOffset = romEntryGetInt(this.romEntry, 'MoveTutorMovesOffset');
    const amount = romEntryGetInt(this.romEntry, 'MoveTutorCount');
    const bytesPer = romEntryGetInt(this.romEntry, 'MoveTutorBytesCount');
    const mtFile = this.readOverlay(romEntryGetInt(this.romEntry, 'FieldOvlNumber'));
    if (!mtFile) return [];
    const mtMoves: number[] = [];
    for (let i = 0; i < amount; i++) { mtMoves.push(readWord(mtFile, baseOffset + i * bytesPer)); }
    return mtMoves;
  }
  setMoveTutorMoves(moves: number[]): void {
    if (!this.hasMoveTutors()) return;
    const baseOffset = romEntryGetInt(this.romEntry, 'MoveTutorMovesOffset');
    const amount = romEntryGetInt(this.romEntry, 'MoveTutorCount');
    const bytesPer = romEntryGetInt(this.romEntry, 'MoveTutorBytesCount');
    if (moves.length !== amount) return;
    const mtFile = this.readOverlay(romEntryGetInt(this.romEntry, 'FieldOvlNumber'));
    if (!mtFile) return;
    for (let i = 0; i < amount; i++) { writeWord(mtFile, baseOffset + i * bytesPer, moves[i]); }
    this.writeOverlay(romEntryGetInt(this.romEntry, 'FieldOvlNumber'), mtFile);
    if (this.romEntry.romType === Gen4Constants.Type_HGSS) {
      this.setHGSSHeadbuttTutor(moves[moves.length - 1]);
    }
  }
  private setHGSSHeadbuttTutor(headbuttReplacement: number): void {
    const ilexScripts = this.scriptNarc!.files[Gen4Constants.ilexForestScriptFile];
    for (const off of Gen4Constants.headbuttTutorScriptOffsets) { writeWord(ilexScripts, off, headbuttReplacement); }
    const replacementName = this.moves[headbuttReplacement]?.name ?? '';
    const replacements = new Map<string, string>();
    replacements.set(this.moves[Moves.headbutt]?.name ?? '', replacementName);
    this.replaceAllStringsInEntry(Gen4Constants.ilexForestStringsFile, replacements);
  }
  // randomizeMoveTutorMoves inherited from AbstractRomHandler
  getMoveTutorCompatibility(): Map<Pokemon, boolean[]> {
    if (!this.hasMoveTutors()) return new Map();
    const compat = new Map<Pokemon, boolean[]>();
    const amount = romEntryGetInt(this.romEntry, 'MoveTutorCount');
    const baseOffset = romEntryGetInt(this.romEntry, 'MoveTutorCompatOffset');
    const bytesPer = romEntryGetInt(this.romEntry, 'MoveTutorCompatBytesCount');
    let mtcFile: Uint8Array | null;
    if (this.romEntry.romType === Gen4Constants.Type_HGSS) {
      mtcFile = this.readFile(romEntryGetFile(this.romEntry, 'MoveTutorCompat'));
    } else {
      mtcFile = this.readOverlay(romEntryGetInt(this.romEntry, 'MoveTutorCompatOvlNumber'));
    }
    if (!mtcFile) return compat;
    const formeCount = Gen4Constants.getFormeCount(this.romEntry.romType);
    for (let i = 1; i <= Gen4Constants.pokemonCount + formeCount; i++) {
      const pkmn = this.pokes[i];
      if (!pkmn) continue;
      const flags = new Array<boolean>(amount + 1).fill(false);
      for (let j = 0; j < bytesPer; j++) { this.readByteIntoFlags(mtcFile, flags, j * 8 + 1, baseOffset + (i - 1) * bytesPer + j); }
      compat.set(pkmn, flags);
    }
    return compat;
  }
  setMoveTutorCompatibility(compatData: Map<Pokemon, boolean[]>): void {
    if (!this.hasMoveTutors()) return;
    const amount = romEntryGetInt(this.romEntry, 'MoveTutorCount');
    const baseOffset = romEntryGetInt(this.romEntry, 'MoveTutorCompatOffset');
    const bytesPer = romEntryGetInt(this.romEntry, 'MoveTutorCompatBytesCount');
    let mtcFile: Uint8Array | null;
    if (this.romEntry.romType === Gen4Constants.Type_HGSS) {
      mtcFile = this.readFile(romEntryGetFile(this.romEntry, 'MoveTutorCompat'));
    } else {
      mtcFile = this.readOverlay(romEntryGetInt(this.romEntry, 'MoveTutorCompatOvlNumber'));
    }
    if (!mtcFile) return;
    for (const [pkmn, flags] of compatData) {
      for (let j = 0; j < bytesPer; j++) {
        const offsHere = baseOffset + (pkmn.number - 1) * bytesPer + j;
        if (j * 8 + 8 <= amount) {
          mtcFile[offsHere] = this.getByteFromFlags(flags, j * 8 + 1);
        } else if (j * 8 < amount) {
          const newByte = this.getByteFromFlags(flags, j * 8 + 1) & 0xFF;
          const oldByteParts = (mtcFile[offsHere] >>> (8 - amount + j * 8)) << (8 - amount + j * 8);
          mtcFile[offsHere] = (newByte | oldByteParts) & 0xFF;
        }
      }
    }
    if (this.romEntry.romType === Gen4Constants.Type_HGSS) {
      this.writeFile(romEntryGetFile(this.romEntry, 'MoveTutorCompat'), mtcFile);
    } else {
      this.writeOverlay(romEntryGetInt(this.romEntry, 'MoveTutorCompatOvlNumber'), mtcFile);
    }
  }
  // randomizeMoveTutorCompatibility inherited from AbstractRomHandler
  fullMoveTutorCompatibility(): void {
    if (!this.hasMoveTutors()) return;
    const compat = this.getMoveTutorCompatibility();
    for (const [, flags] of compat) { for (let i = 1; i < flags.length; i++) { flags[i] = true; } }
    this.setMoveTutorCompatibility(compat);
  }
  ensureMoveTutorCompatSanity(): void {
    if (!this.hasMoveTutors()) return;
    const compat = this.getMoveTutorCompatibility();
    const movesets = this.getMovesLearnt();
    const mtMoves = this.getMoveTutorMoves();
    for (const [pkmn, pkmnCompat] of compat) {
      const moveset = movesets.get(pkmn.number);
      if (!moveset) continue;
      for (const ml of moveset) {
        const mtIndex = mtMoves.indexOf(ml.move);
        if (mtIndex >= 0) { pkmnCompat[mtIndex + 1] = true; }
      }
    }
    this.setMoveTutorCompatibility(compat);
  }
  ensureMoveTutorEvolutionSanity(): void {
    if (!this.hasMoveTutors()) return;
    const compat = this.getMoveTutorCompatibility();
    this.copyUpEvolutionsHelper4(
      (_pk: Pokemon) => { /* no base action */ },
      (evFrom: Pokemon, evTo: Pokemon, _toMonIsFinalEvo: boolean) => {
        const fromCompat = compat.get(evFrom);
        const toCompat = compat.get(evTo);
        if (fromCompat && toCompat) {
          for (let i = 1; i < toCompat.length; i++) { toCompat[i] = toCompat[i] || fromCompat[i]; }
        }
      },
      null,
      true
    );
    this.setMoveTutorCompatibility(compat);
  }
  copyMoveTutorCompatibilityToCosmeticFormes(): void {
    const compat = this.getMoveTutorCompatibility();
    for (const [pkmn, flags] of compat) {
      if (pkmn.actuallyCosmetic) {
        const baseFlags = pkmn.baseForme ? compat.get(pkmn.baseForme) : null;
        if (baseFlags) { for (let i = 1; i < flags.length; i++) { flags[i] = baseFlags[i]; } }
      }
    }
    this.setMoveTutorCompatibility(compat);
  }
  canChangeTrainerText(): boolean { return true; }
  getTrainerNames(): string[] {
    const tnames = [...this.getStringsLocal(romEntryGetInt(this.romEntry, 'TrainerNamesTextOffset'))];
    tnames.splice(0, 1); // blank one
    for (let i = 0; i < tnames.length; i++) {
      if (tnames[i].includes('\\and')) {
        tnames[i] = tnames[i].replace(/\\and/g, '&');
      }
    }
    return tnames;
  }

  setTrainerNames(trainerNames: string[]): void {
    const oldTNames = this.getStringsLocal(romEntryGetInt(this.romEntry, 'TrainerNamesTextOffset'));
    const newTNames = [...trainerNames];
    for (let i = 0; i < newTNames.length; i++) {
      if (newTNames[i].includes('&')) {
        newTNames[i] = newTNames[i].replace(/&/g, '\\and');
      }
    }
    newTNames.unshift(oldTNames[0]); // the 0-entry, preserve it
    this.setStringsLocal(romEntryGetInt(this.romEntry, 'TrainerNamesTextOffset'), newTNames, this.lastStringsCompressed);
  }

  maxTrainerNameLength(): number {
    return 10;
  }

  trainerNameMode(): TrainerNameMode { return TrainerNameMode.MAX_LENGTH; }

  getTCNameLengthsByTrainer(): number[] {
    return [];
  }

  getTrainerClassNames(): string[] {
    return this.getStringsLocal(romEntryGetInt(this.romEntry, 'TrainerClassesTextOffset'));
  }

  setTrainerClassNames(trainerClassNames: string[]): void {
    this.setStringsLocal(romEntryGetInt(this.romEntry, 'TrainerClassesTextOffset'), trainerClassNames);
  }

  maxTrainerClassNameLength(): number {
    return 12;
  }
  fixedTrainerClassNamesLength(): boolean { return false; }
  getDoublesTrainerClasses(): number[] {
    return this.romEntry.arrayEntries.get('DoublesTrainerClasses') ?? [];
  }
  getEvolutionItems(): number[] { return Gen4Constants.evolutionItems; }
  getUniqueNoSellItems(): number[] { return []; }
  getRegularShopItems(): number[] { return Gen4Constants.getRegularShopItems(); }
  getOPShopItems(): number[] { return Gen4Constants.getOpShopItems(); }
  getRequiredFieldTMs(): number[] {
    if (this.romEntry.romType === Gen4Constants.Type_DP) {
      return Gen4Constants.dpRequiredFieldTMs;
    } else if (this.romEntry.romType === Gen4Constants.Type_Plat) {
      return Gen4Constants.ptRequiredFieldTMs;
    }
    return [];
  }

  getCurrentFieldTMs(): number[] {
    const fieldItems = this.getFieldItems();
    const fieldTMs: number[] = [];
    for (const item of fieldItems) {
      if (Gen4Constants.getAllowedItems().isTM(item)) {
        fieldTMs.push(item - Gen4Constants.tmItemOffset + 1);
      }
    }
    return fieldTMs;
  }

  setFieldTMs(fieldTMs: number[]): void {
    const fieldItems = this.getFieldItems();
    let tmIdx = 0;
    for (let i = 0; i < fieldItems.length; i++) {
      if (Gen4Constants.getAllowedItems().isTM(fieldItems[i])) {
        fieldItems[i] = fieldTMs[tmIdx++] + Gen4Constants.tmItemOffset - 1;
      }
    }
    this.setFieldItemsInternal(fieldItems);
  }

  getRegularFieldItems(): number[] {
    const fieldItems = this.getFieldItems();
    const fieldRegItems: number[] = [];
    for (const item of fieldItems) {
      if (Gen4Constants.getAllowedItems().isAllowed(item) && !Gen4Constants.getAllowedItems().isTM(item)) {
        fieldRegItems.push(item);
      }
    }
    return fieldRegItems;
  }

  setRegularFieldItems(items: number[]): void {
    const fieldItems = this.getFieldItems();
    let itemIdx = 0;
    for (let i = 0; i < fieldItems.length; i++) {
      if (!Gen4Constants.getAllowedItems().isTM(fieldItems[i]) && Gen4Constants.getAllowedItems().isAllowed(fieldItems[i])) {
        fieldItems[i] = items[itemIdx++];
      }
    }
    this.setFieldItemsInternal(fieldItems);
  }

  hasShopRandomization(): boolean { return true; }

  getShopItems(): Map<number, Shop> {
    const shopNames = Gen4Constants.getShopNames(this.romEntry.romType);
    const mainGameShops = this.romEntry.arrayEntries.get('MainGameShops') ?? [];
    const skipShops = this.romEntry.arrayEntries.get('SkipShops') ?? [];
    const shopCount = romEntryGetInt(this.romEntry, 'ShopCount');
    const shopItemsMap = new Map<number, Shop>();
    const shopDataPrefix = romEntryGetString(this.romEntry, 'ShopDataPrefix');
    let offset = find(this.arm9, shopDataPrefix);
    offset += shopDataPrefix.length / 2;

    for (let i = 0; i < shopCount; i++) {
      if (!skipShops.includes(i)) {
        const items: number[] = [];
        let val = readWord(this.arm9, offset);
        while ((val & 0xFFFF) !== 0xFFFF) {
          if (val !== 0) {
            items.push(val);
          }
          offset += 2;
          val = readWord(this.arm9, offset);
        }
        offset += 2;
        const shop = new Shop();
        shop.items = items;
        shop.name = shopNames[i];
        shop.isMainGame = mainGameShops.includes(i);
        shopItemsMap.set(i, shop);
      } else {
        while ((readWord(this.arm9, offset) & 0xFFFF) !== 0xFFFF) {
          offset += 2;
        }
        offset += 2;
      }
    }
    return shopItemsMap;
  }

  setShopItems(shopItems: Map<number, Shop>): void {
    const shopCount = romEntryGetInt(this.romEntry, 'ShopCount');
    const shopDataPrefix = romEntryGetString(this.romEntry, 'ShopDataPrefix');
    let offset = find(this.arm9, shopDataPrefix);
    offset += shopDataPrefix.length / 2;

    for (let i = 0; i < shopCount; i++) {
      const thisShop = shopItems.get(i);
      if (!thisShop || !thisShop.items) {
        while ((readWord(this.arm9, offset) & 0xFFFF) !== 0xFFFF) {
          offset += 2;
        }
        offset += 2;
        continue;
      }
      let itemIdx = 0;
      let val = readWord(this.arm9, offset);
      while ((val & 0xFFFF) !== 0xFFFF) {
        if (val !== 0) {
          writeWord(this.arm9, offset, thisShop.items[itemIdx++]);
        }
        offset += 2;
        val = readWord(this.arm9, offset);
      }
      offset += 2;
    }
  }

  setShopPrices(): void {
    const startOfUnusedIDs = this.romEntry.romType === Gen4Constants.Type_DP ? 112 : 113;
    const itemPriceNarc = this.readNARC(romEntryGetFile(this.romEntry, 'ItemData'));
    let itemID = 1;
    for (let i = 1; i < itemPriceNarc.files.length; i++) {
      const price = Gen4Constants.balancedItemPrices.get(itemID) ?? 0;
      writeWord(itemPriceNarc.files[i], 0, price * 10);
      itemID++;
      if (itemID === startOfUnusedIDs) {
        itemID = 135;
      }
    }
    this.writeNARC(romEntryGetFile(this.romEntry, 'ItemData'), itemPriceNarc);
  }
  getIngameTrades(): IngameTrade[] { return this.getIngameTradesImpl(); }
  setIngameTrades(trades: IngameTrade[]): void { this.setIngameTradesImpl(trades); }
  hasDVs(): boolean { return false; }
  removeImpossibleEvolutions(settings: Settings): void {
    const changeMoveEvos = settings.movesetsMod !== MovesetsMod.UNCHANGED;
    const movesets = this.getMovesLearnt();
    for (const pkmn of this.pokes) {
      if (pkmn != null) {
        const extraEvolutions: Evolution[] = [];
        for (const evo of pkmn.evolutionsFrom) {
          if (this.romEntry.romType === Gen4Constants.Type_HGSS) {
            if (evo.type === EvolutionType.LEVEL_HIGH_BEAUTY) {
              evo.type = EvolutionType.LEVEL;
              evo.extraInfo = 35;
              this.addEvoUpdateLevel(this.impossibleEvolutionUpdates, evo);
            }
            if (evo.type === EvolutionType.LEVEL_ELECTRIFIED_AREA) {
              evo.type = EvolutionType.LEVEL;
              evo.extraInfo = 40;
              this.addEvoUpdateLevel(this.impossibleEvolutionUpdates, evo);
            }
            if (evo.type === EvolutionType.LEVEL_MOSS_ROCK) {
              evo.type = EvolutionType.STONE;
              evo.extraInfo = Items.leafStone;
              this.addEvoUpdateStone(this.impossibleEvolutionUpdates, evo, this.itemNames[evo.extraInfo] ?? '');
            }
            if (evo.type === EvolutionType.LEVEL_ICY_ROCK) {
              evo.type = EvolutionType.STONE;
              evo.extraInfo = Items.dawnStone;
              this.addEvoUpdateStone(this.impossibleEvolutionUpdates, evo, this.itemNames[evo.extraInfo] ?? '');
            }
          }
          if (changeMoveEvos && evo.type === EvolutionType.LEVEL_WITH_MOVE) {
            const move = evo.extraInfo;
            let levelLearntAt = 1;
            const pkmMovesets = movesets.get(evo.from.number);
            if (pkmMovesets) {
              for (const ml of pkmMovesets) {
                if (ml.move === move) {
                  levelLearntAt = ml.level;
                  break;
                }
              }
            }
            if (levelLearntAt === 1) {
              levelLearntAt = 45;
            }
            evo.type = EvolutionType.LEVEL;
            evo.extraInfo = levelLearntAt;
            this.addEvoUpdateLevel(this.impossibleEvolutionUpdates, evo);
          }
          if (evo.type === EvolutionType.TRADE) {
            evo.type = EvolutionType.LEVEL;
            evo.extraInfo = 37;
            this.addEvoUpdateLevel(this.impossibleEvolutionUpdates, evo);
          }
          if (evo.type === EvolutionType.TRADE_ITEM) {
            const item = evo.extraInfo;
            if (evo.from.number === Species.slowpoke) {
              evo.type = EvolutionType.STONE;
              evo.extraInfo = Items.waterStone;
              this.addEvoUpdateStone(this.impossibleEvolutionUpdates, evo, this.itemNames[evo.extraInfo] ?? '');
            } else {
              this.addEvoUpdateHeldItem(this.impossibleEvolutionUpdates, evo, this.itemNames[item] ?? '');
              evo.type = EvolutionType.LEVEL_ITEM_DAY;
              extraEvolutions.push(new Evolution(evo.from, evo.to, true, EvolutionType.LEVEL_ITEM_NIGHT, item));
            }
          }
        }
        for (const ev of extraEvolutions) {
          pkmn.evolutionsFrom.push(ev);
          ev.to.evolutionsTo.push(ev);
        }
      }
    }
  }
  makeEvolutionsEasier(settings: Settings): void {
    const wildsRandomized = settings.wildPokemonMod !== WildPokemonMod.UNCHANGED;
    const offset = find(this.arm9, Gen4Constants.friendshipValueForEvoLocator);
    if (offset > 0) {
      if ((this.arm9[offset] & 0xff) === 220) {
        this.arm9[offset] = 160;
      }
      if ((this.arm9[offset + 22] & 0xff) === 220) {
        this.arm9[offset + 22] = 160;
      }
      if ((this.arm9[offset + 44] & 0xff) === 220) {
        this.arm9[offset + 44] = 160;
      }
    }
    if (wildsRandomized) {
      for (const pkmn of this.pokes) {
        if (pkmn != null) {
          for (const evo of pkmn.evolutionsFrom) {
            if (evo.type === EvolutionType.LEVEL_WITH_OTHER) {
              evo.type = EvolutionType.LEVEL;
              evo.extraInfo = 35;
              this.addEvoUpdateCondensed(this.easierEvolutionUpdates, evo, false);
            }
          }
        }
      }
    }
  }
  removeTimeBasedEvolutions(): void {
    for (const pkmn of this.pokes) {
      if (pkmn != null) {
        const extraEvolutions: Evolution[] = [];
        for (const evo of pkmn.evolutionsFrom) {
          if (evo.type === EvolutionType.HAPPINESS_DAY) {
            if (evo.from.number === Species.eevee) {
              evo.type = EvolutionType.STONE;
              evo.extraInfo = Items.sunStone;
              this.addEvoUpdateStone(this.timeBasedEvolutionUpdates, evo, this.itemNames[evo.extraInfo] ?? '');
            } else {
              this.addEvoUpdateHappiness(this.timeBasedEvolutionUpdates, evo);
              extraEvolutions.push(new Evolution(evo.from, evo.to, true, EvolutionType.HAPPINESS_NIGHT, 0));
            }
          } else if (evo.type === EvolutionType.HAPPINESS_NIGHT) {
            if (evo.from.number === Species.eevee) {
              evo.type = EvolutionType.STONE;
              evo.extraInfo = Items.moonStone;
              this.addEvoUpdateStone(this.timeBasedEvolutionUpdates, evo, this.itemNames[evo.extraInfo] ?? '');
            } else {
              this.addEvoUpdateHappiness(this.timeBasedEvolutionUpdates, evo);
              extraEvolutions.push(new Evolution(evo.from, evo.to, true, EvolutionType.HAPPINESS_DAY, 0));
            }
          } else if (evo.type === EvolutionType.LEVEL_ITEM_DAY) {
            const item = evo.extraInfo;
            if (!evo.from.evolutionsFrom.some(e => e.type === EvolutionType.LEVEL_ITEM_NIGHT && e.extraInfo === item)) {
              this.addEvoUpdateHeldItem(this.timeBasedEvolutionUpdates, evo, this.itemNames[item] ?? '');
              extraEvolutions.push(new Evolution(evo.from, evo.to, true, EvolutionType.LEVEL_ITEM_NIGHT, item));
            }
          } else if (evo.type === EvolutionType.LEVEL_ITEM_NIGHT) {
            const item = evo.extraInfo;
            if (!evo.from.evolutionsFrom.some(e => e.type === EvolutionType.LEVEL_ITEM_DAY && e.extraInfo === item)) {
              this.addEvoUpdateHeldItem(this.timeBasedEvolutionUpdates, evo, this.itemNames[item] ?? '');
              extraEvolutions.push(new Evolution(evo.from, evo.to, true, EvolutionType.LEVEL_ITEM_DAY, item));
            }
          }
        }
        for (const ev of extraEvolutions) {
          pkmn.evolutionsFrom.push(ev);
          ev.to.evolutionsTo.push(ev);
        }
      }
    }
  }
  getFieldMoves(): number[] {
    if (this.romEntry.romType === Gen4Constants.Type_HGSS) {
      return Gen4Constants.hgssFieldMoves;
    } else {
      return Gen4Constants.dpptFieldMoves;
    }
  }

  getEarlyRequiredHMMoves(): number[] {
    if (this.romEntry.romType === Gen4Constants.Type_HGSS) {
      return Gen4Constants.hgssEarlyRequiredHMMoves;
    } else {
      return Gen4Constants.dpptEarlyRequiredHMMoves;
    }
  }

  getDefaultExtension(): string { return 'nds'; }
  internalStringLength(s: string): number { return s.length; }
  randomizeIntroPokemon(): void { this.randomizeIntroPokemonImpl(); }
  getMascotImage(): Uint8Array | null { return null; }
  isEffectivenessUpdated(): boolean { return this.effectivenessUpdated; }
  hasFunctionalFormes(): boolean { return this.romEntry.romType !== Gen4Constants.Type_DP; }

  // -----------------------------------------------------------------------
  // Pickup Items
  // -----------------------------------------------------------------------

  getPickupItems(): PickupItem[] {
    const pickupItems: PickupItem[] = [];
    const battleOverlay = this.readOverlay(romEntryGetInt(this.romEntry, 'BattleOvlNumber'));
    if (!battleOverlay) return pickupItems;
    if (this.pickupItemsTableOffset === 0) {
      const off = find(battleOverlay, Gen4Constants.pickupTableLocator);
      if (off > 0) this.pickupItemsTableOffset = off;
    }
    if (this.rarePickupItemsTableOffset === 0) {
      const off = find(battleOverlay, Gen4Constants.rarePickupTableLocator);
      if (off > 0) this.rarePickupItemsTableOffset = off;
    }
    if (this.pickupItemsTableOffset > 0 && this.rarePickupItemsTableOffset > 0) {
      for (let i = 0; i < Gen4Constants.numberOfCommonPickupItems; i++) {
        pickupItems.push(new PickupItem(readWord(battleOverlay, this.pickupItemsTableOffset + 2 * i)));
      }
      for (let i = 0; i < Gen4Constants.numberOfRarePickupItems; i++) {
        pickupItems.push(new PickupItem(readWord(battleOverlay, this.rarePickupItemsTableOffset + 2 * i)));
      }
    }
    if (pickupItems.length > 0) {
      for (let lr = 0; lr < 10; lr++) {
        pickupItems[lr].probabilities[lr] = 30;
        for (let i = 1; i < 7; i++) pickupItems[lr + i].probabilities[lr] = 10;
        pickupItems[lr + 7].probabilities[lr] = 4;
        pickupItems[lr + 8].probabilities[lr] = 4;
        pickupItems[18 + lr].probabilities[lr] = 1;
        pickupItems[18 + lr + 1].probabilities[lr] = 1;
      }
    }
    return pickupItems;
  }

  setPickupItems(pickupItems: PickupItem[]): void {
    if (this.pickupItemsTableOffset > 0 && this.rarePickupItemsTableOffset > 0) {
      const battleOverlay = this.readOverlay(romEntryGetInt(this.romEntry, 'BattleOvlNumber'));
      if (!battleOverlay) return;
      let idx = 0;
      for (let i = 0; i < Gen4Constants.numberOfCommonPickupItems; i++) {
        writeWord(battleOverlay, this.pickupItemsTableOffset + 2 * i, pickupItems[idx++].item);
      }
      for (let i = 0; i < Gen4Constants.numberOfRarePickupItems; i++) {
        writeWord(battleOverlay, this.rarePickupItemsTableOffset + 2 * i, pickupItems[idx++].item);
      }
      this.writeOverlay(romEntryGetInt(this.romEntry, 'BattleOvlNumber'), battleOverlay);
    }
  }

  // -----------------------------------------------------------------------
  // Misc Tweaks
  // -----------------------------------------------------------------------

  miscTweaksAvailable(): number {
    let available = MiscTweak.LOWER_CASE_POKEMON_NAMES.getValue();
    available |= MiscTweak.RANDOMIZE_CATCHING_TUTORIAL.getValue();
    available |= MiscTweak.UPDATE_TYPE_EFFECTIVENESS.getValue();
    if (this.romEntry.tweakFiles.get('FastestTextTweak') != null) available |= MiscTweak.FASTEST_TEXT.getValue();
    available |= MiscTweak.BAN_LUCKY_EGG.getValue();
    if (this.romEntry.tweakFiles.get('NationalDexAtStartTweak') != null) available |= MiscTweak.NATIONAL_DEX_AT_START.getValue();
    available |= MiscTweak.RUN_WITHOUT_RUNNING_SHOES.getValue();
    available |= MiscTweak.FASTER_HP_AND_EXP_BARS.getValue();
    if (this.romEntry.tweakFiles.get('FastDistortionWorldTweak') != null) available |= MiscTweak.FAST_DISTORTION_WORLD.getValue();
    if (this.romEntry.romType === Gen4Constants.Type_Plat || this.romEntry.romType === Gen4Constants.Type_HGSS) {
      available |= MiscTweak.UPDATE_ROTOM_FORME_TYPING.getValue();
    }
    return available;
  }

  applyMiscTweak(tweak: { value: number }): void {
    if (tweak.value === MiscTweak.LOWER_CASE_POKEMON_NAMES.value) this.applyCamelCaseNames();
    else if (tweak.value === MiscTweak.RANDOMIZE_CATCHING_TUTORIAL.value) this.randomizeCatchingTutorial();
    else if (tweak.value === MiscTweak.FASTEST_TEXT.value) this.applyFastestText();
    else if (tweak.value === MiscTweak.BAN_LUCKY_EGG.value) { this.allowedItemsList.banSingles(Items.luckyEgg); this.nonBadItemsList.banSingles(Items.luckyEgg); }
    else if (tweak.value === MiscTweak.NATIONAL_DEX_AT_START.value) this.patchForNationalDex();
    else if (tweak.value === MiscTweak.RUN_WITHOUT_RUNNING_SHOES.value) this.applyRunWithoutRunningShoesPatch();
    else if (tweak.value === MiscTweak.FASTER_HP_AND_EXP_BARS.value) this.patchFasterBars();
    else if (tweak.value === MiscTweak.UPDATE_TYPE_EFFECTIVENESS.value) this.updateTypeEffectiveness();
    else if (tweak.value === MiscTweak.FAST_DISTORTION_WORLD.value) this.applyFastDistortionWorld();
    else if (tweak.value === MiscTweak.UPDATE_ROTOM_FORME_TYPING.value) this.updateRotomFormeTyping();
  }

  // -----------------------------------------------------------------------
  // Private helpers: field items, misc tweaks, type effectiveness
  // -----------------------------------------------------------------------

  private getFieldItems(): number[] {
    const fieldItems: number[] = [];
    const scriptFile = romEntryGetInt(this.romEntry, 'ItemBallsScriptOffset');
    const itemScripts = this.scriptNarc!.files[scriptFile];
    let offset = 0;
    let skipIdx = 0;
    const skipTable = this.romEntry.arrayEntries.get('ItemBallsSkip') ?? [];
    const setVar = this.romEntry.romType === Gen4Constants.Type_HGSS ? Gen4Constants.hgssSetVarScript : Gen4Constants.dpptSetVarScript;
    while (true) {
      const part1 = readWord(itemScripts, offset);
      if (part1 === Gen4Constants.scriptListTerminator) break;
      const offsetInFile = this.readRelativePointer(itemScripts, offset);
      offset += 4;
      if (skipIdx < skipTable.length && skipTable[skipIdx] === (offset / 4) - 1) { skipIdx++; continue; }
      const command = readWord(itemScripts, offsetInFile);
      const variable = readWord(itemScripts, offsetInFile + 2);
      if (command === setVar && variable === Gen4Constants.itemScriptVariable) {
        fieldItems.push(readWord(itemScripts, offsetInFile + 4));
      }
    }
    const hiTableOffset = romEntryGetInt(this.romEntry, 'HiddenItemTableOffset');
    const hiTableLimit = romEntryGetInt(this.romEntry, 'HiddenItemCount');
    for (let i = 0; i < hiTableLimit; i++) {
      fieldItems.push(readWord(this.arm9, hiTableOffset + i * 8));
    }
    return fieldItems;
  }

  private setFieldItemsInternal(fieldItems: number[]): void {
    let itemIdx = 0;
    const scriptFile = romEntryGetInt(this.romEntry, 'ItemBallsScriptOffset');
    const itemScripts = this.scriptNarc!.files[scriptFile];
    let offset = 0;
    let skipIdx = 0;
    const skipTable = this.romEntry.arrayEntries.get('ItemBallsSkip') ?? [];
    const setVar = this.romEntry.romType === Gen4Constants.Type_HGSS ? Gen4Constants.hgssSetVarScript : Gen4Constants.dpptSetVarScript;
    while (true) {
      const part1 = readWord(itemScripts, offset);
      if (part1 === Gen4Constants.scriptListTerminator) break;
      const offsetInFile = this.readRelativePointer(itemScripts, offset);
      offset += 4;
      if (skipIdx < skipTable.length && skipTable[skipIdx] === (offset / 4) - 1) { skipIdx++; continue; }
      const command = readWord(itemScripts, offsetInFile);
      const variable = readWord(itemScripts, offsetInFile + 2);
      if (command === setVar && variable === Gen4Constants.itemScriptVariable) {
        writeWord(itemScripts, offsetInFile + 4, fieldItems[itemIdx++]);
      }
    }
    const hiTableOffset = romEntryGetInt(this.romEntry, 'HiddenItemTableOffset');
    const hiTableLimit = romEntryGetInt(this.romEntry, 'HiddenItemCount');
    for (let i = 0; i < hiTableLimit; i++) {
      writeWord(this.arm9, hiTableOffset + i * 8, fieldItems[itemIdx++]);
    }
  }

  private applyFastestText(): void { this.genericIPSPatch(this.arm9, 'FastestTextTweak'); }

  private patchForNationalDex(): void {
    let pokedexScript = this.scriptNarc!.files[romEntryGetInt(this.romEntry, 'NationalDexScriptOffset')];
    if (this.romEntry.romType === Gen4Constants.Type_HGSS) {
      const expanded = new Uint8Array(pokedexScript.length + 4);
      expanded.set(pokedexScript);
      pokedexScript = expanded;
    }
    this.genericIPSPatch(pokedexScript, 'NationalDexAtStartTweak');
    this.scriptNarc!.files[romEntryGetInt(this.romEntry, 'NationalDexScriptOffset')] = pokedexScript;
  }

  private applyRunWithoutRunningShoesPatch(): void {
    const prefix = Gen4Constants.getRunWithoutRunningShoesPrefix(this.romEntry.romType);
    const offset = find(this.arm9, prefix);
    if (offset !== 0) writeWord(this.arm9, offset + 0xE, 0);
  }

  private patchFasterBars(): void {
    const ov = this.readOverlay(romEntryGetInt(this.romEntry, 'BattleOvlNumber'));
    if (!ov) return;
    let off = find(ov, Gen4Constants.hpBarSpeedPrefix);
    if (off > 0) { off += Gen4Constants.hpBarSpeedPrefix.length / 2; ov[off] = 0x02; }
    off = find(ov, Gen4Constants.expBarSpeedPrefix);
    if (off > 0) { off += Gen4Constants.expBarSpeedPrefix.length / 2; ov[off] = 0xB0; ov[off + 1] = 0x19; }
    off = find(ov, Gen4Constants.bothBarsSpeedPrefix);
    if (off > 0) { off += Gen4Constants.bothBarsSpeedPrefix.length / 2; ov[off] = 0x40; }
    this.writeOverlay(romEntryGetInt(this.romEntry, 'BattleOvlNumber'), ov);
  }

  private updateTypeEffectiveness(): void {
    const ov = this.readOverlay(romEntryGetInt(this.romEntry, 'BattleOvlNumber'));
    if (!ov) return;
    const tableOff = find(ov, Gen4Constants.typeEffectivenessTableLocator);
    if (tableOff > 0) {
      const table = this.readTypeEffectivenessTable(ov, tableOff);
      this.log('--Updating Type Effectiveness--');
      for (const r of table) {
        if (r.attacker === 'GHOST' && r.defender === 'STEEL') { r.effectiveness = Effectiveness.NEUTRAL; this.log('Replaced: Ghost not very effective vs Steel => Ghost neutral vs Steel'); }
        else if (r.attacker === 'DARK' && r.defender === 'STEEL') { r.effectiveness = Effectiveness.NEUTRAL; this.log('Replaced: Dark not very effective vs Steel => Dark neutral vs Steel'); }
      }
      this.logBlankLine();
      this.writeTypeEffectivenessTable(table, ov, tableOff);
      this.writeOverlay(romEntryGetInt(this.romEntry, 'BattleOvlNumber'), ov);
      this.effectivenessUpdated = true;
    }
  }

  private readTypeEffectivenessTable(data: Uint8Array, tableOff: number): { attacker: string; defender: string; effectiveness: Effectiveness }[] {
    const table: { attacker: string; defender: string; effectiveness: Effectiveness }[] = [];
    let off = tableOff;
    let atk = data[off];
    while (atk !== 0xFE) {
      const def = data[off + 1];
      const ei = data[off + 2];
      const attacking = Gen4Constants.typeTable[atk];
      const defending = Gen4Constants.typeTable[def];
      let eff: Effectiveness | null = null;
      switch (ei) { case 20: eff = Effectiveness.DOUBLE; break; case 10: eff = Effectiveness.NEUTRAL; break; case 5: eff = Effectiveness.HALF; break; case 0: eff = Effectiveness.ZERO; break; }
      if (eff !== null && attacking && defending) table.push({ attacker: attacking, defender: defending, effectiveness: eff });
      off += 3;
      atk = data[off];
    }
    return table;
  }

  private writeTypeEffectivenessTable(table: { attacker: string; defender: string; effectiveness: Effectiveness }[], data: Uint8Array, tableOff: number): void {
    let off = tableOff;
    for (const r of table) {
      data[off] = Gen4Constants.typeToByte(r.attacker);
      data[off + 1] = Gen4Constants.typeToByte(r.defender);
      let ei = 0;
      switch (r.effectiveness) { case Effectiveness.DOUBLE: ei = 20; break; case Effectiveness.NEUTRAL: ei = 10; break; case Effectiveness.HALF: ei = 5; break; case Effectiveness.ZERO: ei = 0; break; }
      data[off + 2] = ei;
      off += 3;
    }
  }

  private applyFastDistortionWorld(): void {
    let script = this.scriptNarc!.files[Gen4Constants.ptSpearPillarPortalScriptFile];
    const expanded = new Uint8Array(script.length + 12);
    expanded.set(script);
    script = expanded;
    this.genericIPSPatch(script, 'FastDistortionWorldTweak');
    this.scriptNarc!.files[Gen4Constants.ptSpearPillarPortalScriptFile] = script;
  }

  private updateRotomFormeTyping(): void {
    this.pokes[Species.Gen4Formes.rotomH]!.secondaryType = Type.FIRE;
    this.pokes[Species.Gen4Formes.rotomW]!.secondaryType = Type.WATER;
    this.pokes[Species.Gen4Formes.rotomFr]!.secondaryType = Type.ICE;
    this.pokes[Species.Gen4Formes.rotomFa]!.secondaryType = Type.FLYING;
    this.pokes[Species.Gen4Formes.rotomM]!.secondaryType = Type.GRASS;
  }

  private applyCamelCaseNames(): void {
    const names = this.getStringsLocal(romEntryGetInt(this.romEntry, 'PokemonNamesTextOffset'));
    for (let i = 0; i < names.length; i++) names[i] = RomFunctions.camelCase(names[i]);
    this.setStringsLocal(romEntryGetInt(this.romEntry, 'PokemonNamesTextOffset'), names);
    for (let i = 1; i < this.pokes.length; i++) {
      if (this.pokes[i]) this.pokes[i]!.name = RomFunctions.camelCase(this.pokes[i]!.name);
    }
  }

  private randomizeCatchingTutorial(): void {
    const opponentOffset = romEntryGetInt(this.romEntry, 'CatchingTutorialOpponentMonOffset');
    if (this.romEntry.tweakFiles.has('NewCatchingTutorialSubroutineTweak')) {
      const prefix = romEntryGetString(this.romEntry, 'CatchingTutorialMonTablePrefix');
      const off = find(this.arm9, prefix);
      if (off > 0) {
        const realOff = off + prefix.length / 2;
        const opponent = this.randomPokemonLimited(0x7FFFFFFF, false);
        if (opponent) writeWord(this.arm9, realOff + 4, opponent.number);
      }
    } else if (this.romEntry.romType === Gen4Constants.Type_HGSS) {
      const playerOff = romEntryGetInt(this.romEntry, 'CatchingTutorialPlayerMonOffset');
      const levelOff = romEntryGetInt(this.romEntry, 'CatchingTutorialPlayerLevelOffset');
      const opponent = this.randomPokemonLimited(255, false);
      const player = this.randomPokemonLimited(255, false);
      if (opponent && player) { this.arm9[opponentOffset] = opponent.number & 0xFF; this.arm9[playerOff] = player.number & 0xFF; this.arm9[levelOff] = 10; }
    } else {
      const opponent = this.randomPokemonLimited(0x7FFFFFFF, false);
      if (opponent) this.writeLong(this.arm9, opponentOffset, opponent.number);
    }
  }

  private randomPokemonLimited(maxValue: number, blockNonMales: boolean): Pokemon | null {
    this.checkPokemonRestrictions();
    const valid: Pokemon[] = [];
    for (const pk of this.mainPokemonList) {
      if (pk.number <= maxValue && (!blockNonMales || pk.genderRatio <= 0xFD)) valid.push(pk);
    }
    return valid.length === 0 ? null : valid[this.random.nextInt(valid.length)];
  }

  private genericIPSPatch(data: Uint8Array, ctName: string): boolean {
    const patchName = this.romEntry.tweakFiles.get(ctName);
    if (patchName == null) return false;
    FileFunctions.applyPatch(data, patchName);
    return true;
  }

  // -----------------------------------------------------------------------
  // Test helpers: allow unit tests to load data from synthetic NARCs
  // -----------------------------------------------------------------------

  /** @internal - for unit tests only */
  loadPokemonStatsForTest(pokeNarc: NARCArchive, pokeNames: string[]): void {
    this.pokeNarc = pokeNarc;
    const formeCount = Gen4Constants.getFormeCount(this.romEntry.romType);
    this.pokes = new Array<Pokemon | null>(
      Gen4Constants.pokemonCount + formeCount + 1,
    ).fill(null);

    for (let i = 1; i <= Gen4Constants.pokemonCount; i++) {
      const pk = new Pokemon();
      pk.number = i;
      this.loadBasicPokeStats(pk, pokeNarc.files[i]);
      pk.name = pokeNames[i] ?? `Pokemon${i}`;
      this.pokes[i] = pk;
    }
  }

  /** @internal - for unit tests only */
  loadMovesForTest(moveNarc: NARCArchive, moveNames: string[]): void {
    this.moveNarc = moveNarc;
    this.moves = new Array<Move | null>(Gen4Constants.moveCount + 1).fill(null);

    for (let i = 1; i <= Gen4Constants.moveCount; i++) {
      const moveData = moveNarc.files[i];
      const m = new Move();
      m.name = moveNames[i] ?? `Move${i}`;
      m.number = i;
      m.internalId = i;
      m.effectIndex = readWord(moveData, 0);
      m.hitratio = moveData[5] & 0xff;
      m.power = moveData[3] & 0xff;
      m.pp = moveData[6] & 0xff;

      const typeIndex = moveData[4] & 0xff;
      const mt = typeFromTable(typeIndex);
      if (mt != null) m.type = mt;

      m.target = readWord(moveData, 8);

      const catIndex = moveData[2] & 0xff;
      m.category = catIndex < moveCategoryIndices.length
        ? moveCategoryIndices[catIndex]
        : MoveCategory.STATUS;

      m.priority = moveData[10] << 24 >> 24;
      const flags = moveData[11] & 0xff;
      m.makesContact = (flags & 1) !== 0;
      m.isPunchMove = Gen4Constants.punchMoves.includes(i);
      m.isSoundMove = Gen4Constants.soundMoves.includes(i);

      if (i === Moves.swift) {
        this.perfectAccuracy = m.hitratio;
      }

      if (GlobalConstants.normalMultihitMoves.includes(i)) {
        m.hitCount = 3;
      } else if (GlobalConstants.doubleHitMoves.includes(i)) {
        m.hitCount = 2;
      } else if (i === Moves.tripleKick) {
        m.hitCount = 2.71;
      }

      const secondaryEffectChance = moveData[7] & 0xff;
      this.loadStatChangesFromEffect(m, secondaryEffectChance);
      this.loadStatusFromEffect(m, secondaryEffectChance);
      this.loadMiscMoveInfoFromEffect(m, secondaryEffectChance);

      this.moves[i] = m;
    }
  }

  /** @internal - for unit tests only */
  saveMovesForTest(): void {
    if (!this.moveNarc) return;
    for (let i = 1; i <= Gen4Constants.moveCount; i++) {
      const m = this.moves[i];
      if (!m) continue;
      const data = this.moveNarc.files[i];
      writeWord(data, 0, m.effectIndex);
      data[2] = Gen4Constants.moveCategoryToByte(m.category);
      data[3] = m.power & 0xff;
      data[4] = typeToInternalByte(m.type);
      let hitratio = Math.round(m.hitratio);
      if (hitratio < 0) hitratio = 0;
      if (hitratio > 100) hitratio = 100;
      data[5] = hitratio & 0xff;
      data[6] = m.pp & 0xff;
    }
  }

  // -----------------------------------------------------------------------
  // Static Pokemon & In-Game Trades implementation
  // -----------------------------------------------------------------------
  private getStaticPokemonImpl(): StaticEncounter[] {
    const sp: StaticEncounter[] = [];
    if (!this.romEntry.staticPokemonSupport) { return sp; }
    const eggOffs = this.romEntry.arrayEntries.get('StaticEggPokemonOffsets') ?? [];
    const sN = this.scriptNarc!;
    for (let i = 0; i < this.romEntry.staticPokemon.length; i++) {
      const statP = this.romEntry.staticPokemon[i];
      const se = new StaticEncounter();
      const spEntry = statP.speciesEntries[0];
      const speciesId = readWord(sN.files[spEntry.file], spEntry.offset);
      let newPK = this.pokes[speciesId];
      if (newPK == null) {
        throw new Error(
          `Static Pokemon #${i}: script file ${spEntry.file} @0x${spEntry.offset.toString(16)} ` +
          `returned species ${speciesId}, but this.pokes[${speciesId}] is null.`,
        );
      }
      const forme = statP.formeEntries.length > 0 ? sN.files[statP.formeEntries[0].file][statP.formeEntries[0].offset] : 0;
      newPK = this.getAltFormeOfPokemon(newPK, forme);
      se.pkmn = newPK;
      se.level = statP.levelEntries.length > 0 ? sN.files[statP.levelEntries[0].file][statP.levelEntries[0].offset] : 1;
      se.isEgg = eggOffs.includes(i);
      for (let le = 1; le < statP.levelEntries.length; le++) {
        const linked = new StaticEncounter();
        linked.pkmn = newPK;
        linked.level = sN.files[statP.levelEntries[le].file][statP.levelEntries[le].offset];
        se.linkedEncounters.push(linked);
      }
      sp.push(se);
    }
    if (this.romEntry.arrayEntries.has('StaticPokemonTrades')) {
      const tNARC = this.readNARC(romEntryGetFile(this.romEntry, 'InGameTrades'));
      const tr = this.romEntry.arrayEntries.get('StaticPokemonTrades')!;
      const sc = this.romEntry.arrayEntries.get('StaticPokemonTradeScripts')!;
      const so = this.romEntry.arrayEntries.get('StaticPokemonTradeLevelOffsets')!;
      for (let i = 0; i < tr.length; i++) {
        const speciesId = this.readLong(tNARC.files[tr[i]], 0);
        const pk = this.pokes[speciesId];
        if (pk == null) {
          throw new Error(
            `Static Pokemon (trade #${i}): trade NARC entry ${tr[i]} returned ` +
            `species ${speciesId}, but this.pokes[${speciesId}] is null.`,
          );
        }
        const se = new StaticEncounter(pk);
        se.level = sN.files[sc[i]][so[i]];
        sp.push(se);
      }
    }
    if (romEntryGetInt(this.romEntry, 'MysteryEggOffset') > 0) {
      const ov = this.readOverlay(romEntryGetInt(this.romEntry, 'FieldOvlNumber'));
      if (ov) {
        const mysteryEggOffset = romEntryGetInt(this.romEntry, 'MysteryEggOffset');
        const speciesId = ov[mysteryEggOffset] & 0xFF;
        const pk = this.pokes[speciesId];
        if (pk == null) {
          throw new Error(
            `Static Pokemon (mystery egg): FieldOvl @0x${mysteryEggOffset.toString(16)} ` +
            `returned species ${speciesId}, but this.pokes[${speciesId}] is null.`,
          );
        }
        const se = new StaticEncounter(pk);
        se.isEgg = true;
        sp.push(se);
      }
    }
    if (romEntryGetInt(this.romEntry, 'FossilTableOffset') > 0) {
      let ftD: Uint8Array = this.arm9;
      const bo = romEntryGetInt(this.romEntry, 'FossilTableOffset');
      const fls = sN.files[romEntryGetInt(this.romEntry, 'FossilLevelScriptNumber')];
      const lv = fls[romEntryGetInt(this.romEntry, 'FossilLevelOffset')];
      if (this.romEntry.romType === Gen4Constants.Type_HGSS) { const ov = this.readOverlay(romEntryGetInt(this.romEntry, 'FossilTableOvlNumber')); if (ov) ftD = ov; }
      for (let f = 0; f < Gen4Constants.fossilCount; f++) {
        const offset = bo + 2 + f * 4;
        const speciesId = readWord(ftD, offset);
        const pk = this.pokes[speciesId];
        if (pk == null) {
          throw new Error(
            `Static Pokemon (fossil #${f}): @0x${offset.toString(16)} returned species ` +
            `${speciesId}, but this.pokes[${speciesId}] is null. (ftD len=${ftD.length})`,
          );
        }
        const se = new StaticEncounter(pk);
        se.level = lv;
        sp.push(se);
      }
    }
    if (this.roamerRandomizationEnabled) { this.getRoamersHelper(sp); }
    return sp;
  }
  private setStaticPokemonImpl(stPk: StaticEncounter[]): boolean {
    if (!this.romEntry.staticPokemonSupport) { return false; }
    const sptSz = this.romEntry.arrayEntries.has('StaticPokemonTrades') ? this.romEntry.arrayEntries.get('StaticPokemonTrades')!.length : 0;
    const meggSz = romEntryGetInt(this.romEntry, 'MysteryEggOffset') > 0 ? 1 : 0;
    const fossilSz = romEntryGetInt(this.romEntry, 'FossilTableOffset') > 0 ? Gen4Constants.fossilCount : 0;
    if (stPk.length !== this.romEntry.staticPokemon.length + sptSz + meggSz + fossilSz + this.romEntry.roamingPokemon.length) { return false; }
    let si = 0;
    const sN = this.scriptNarc!;
    for (const statP of this.romEntry.staticPokemon) {
      const se = stPk[si++];
      for (const e of statP.speciesEntries) { writeWord(sN.files[e.file], e.offset, se.pkmn.number); }
      for (const e of statP.formeEntries) { sN.files[e.file][e.offset] = se.pkmn.formeNumber & 0xFF; }
      if (statP.levelEntries.length > 0) { sN.files[statP.levelEntries[0].file][statP.levelEntries[0].offset] = se.level & 0xFF; }
      for (let i = 0; i < se.linkedEncounters.length; i++) { if (statP.levelEntries.length > i + 1) { sN.files[statP.levelEntries[i + 1].file][statP.levelEntries[i + 1].offset] = se.linkedEncounters[i].level & 0xFF; } }
      const gc = statP as StaticPokemonGameCornerEntry;
      if (gc.textEntries && gc.textEntries.length > 0) {
        for (const te of gc.textEntries) {
          const strs = this.getStringsLocal(te.textIndex);
          const orig = strs[te.stringNumber];
          const pni = orig.indexOf('\\');
          if (pni >= 0) { strs[te.stringNumber] = se.pkmn.name.toUpperCase() + orig.substring(pni); this.setStringsLocal(te.textIndex, strs); }
        }
      }
    }
    if (this.romEntry.arrayEntries.has('StaticPokemonTrades')) {
      const tNARC = this.readNARC(romEntryGetFile(this.romEntry, 'InGameTrades'));
      const tr = this.romEntry.arrayEntries.get('StaticPokemonTrades')!;
      const sc = this.romEntry.arrayEntries.get('StaticPokemonTradeScripts')!;
      const so = this.romEntry.arrayEntries.get('StaticPokemonTradeLevelOffsets')!;
      for (let i = 0; i < tr.length; i++) {
        const se = stPk[si++]; const pk = se.pkmn;
        const ab: number[] = [];
        if (pk.ability1 > 0) ab.push(pk.ability1); if (pk.ability2 > 0) ab.push(pk.ability2); if (pk.ability3 > 0) ab.push(pk.ability3);
        if (ab.length === 0) ab.push(0);
        this.writeLong(tNARC.files[tr[i]], 0, pk.number);
        this.writeLong(tNARC.files[tr[i]], 0x1C, ab[this.random.nextInt(ab.length)]);
        sN.files[sc[i]][so[i]] = se.level & 0xFF;
        if (i === 1) { const rp = new Map<string, string>(); rp.set(this.pokes[Species.spearow]!.name.toUpperCase(), se.pkmn.name); this.replaceAllStringsInEntry(romEntryGetInt(this.romEntry, 'KenyaTextOffset'), rp); }
      }
      this.writeNARC(romEntryGetFile(this.romEntry, 'InGameTrades'), tNARC);
    }
    if (romEntryGetInt(this.romEntry, 'MysteryEggOffset') > 0) {
      let pn = stPk[si++].pkmn.number; if (pn > 255) { pn = this.random.nextInt(255) + 1; }
      const ov = this.readOverlay(romEntryGetInt(this.romEntry, 'FieldOvlNumber'));
      if (ov) { ov[romEntryGetInt(this.romEntry, 'MysteryEggOffset')] = pn & 0xFF; this.writeOverlay(romEntryGetInt(this.romEntry, 'FieldOvlNumber'), ov); }
    }
    if (romEntryGetInt(this.romEntry, 'FossilTableOffset') > 0) {
      const bo = romEntryGetInt(this.romEntry, 'FossilTableOffset');
      const fls = sN.files[romEntryGetInt(this.romEntry, 'FossilLevelScriptNumber')];
      if (this.romEntry.romType === Gen4Constants.Type_HGSS) {
        const ftD = this.readOverlay(romEntryGetInt(this.romEntry, 'FossilTableOvlNumber'));
        if (ftD) { for (let f = 0; f < Gen4Constants.fossilCount; f++) { const se = stPk[si++]; writeWord(ftD, bo + 2 + f * 4, se.pkmn.number); fls[romEntryGetInt(this.romEntry, 'FossilLevelOffset')] = se.level & 0xFF; } this.writeOverlay(romEntryGetInt(this.romEntry, 'FossilTableOvlNumber'), ftD); }
      } else { for (let f = 0; f < Gen4Constants.fossilCount; f++) { const se = stPk[si++]; writeWord(this.arm9, bo + 2 + f * 4, se.pkmn.number); fls[romEntryGetInt(this.romEntry, 'FossilLevelOffset')] = se.level & 0xFF; } }
    }
    if (this.roamerRandomizationEnabled) { this.setRoamersHelper(stPk, si); }
    if (this.romEntry.romType === Gen4Constants.Type_Plat) { this.patchDistortionWorldGroundCheckHelper(); }
    return true;
  }
  private getRoamersHelper(statics: StaticEncounter[]): void {
    if (this.romEntry.romType === Gen4Constants.Type_DP) {
      const off = romEntryGetInt(this.romEntry, 'RoamingPokemonFunctionStartOffset');
      if (readWord(this.arm9, off + 44) !== 0) { this.applyDPRoamerPatch(); }
    } else if (this.romEntry.romType === Gen4Constants.Type_Plat || this.romEntry.romType === Gen4Constants.Type_HGSS) {
      const fso = this.romEntry.roamingPokemon[0].speciesCodeOffsets[0];
      if (this.arm9.length < fso || readWord(this.arm9, fso) === 0) {
        const lengthBefore = this.arm9.length;
        this.arm9 = this.extendARM9(this.arm9, romEntryGetInt(this.romEntry, 'Arm9ExtensionSize'), romEntryGetString(this.romEntry, 'TCMCopyingPrefix'), Gen4Constants.arm9Offset);
        this.applyIPSPatch(this.arm9, 'NewRoamerSubroutineTweak');
        if (this.arm9.length < fso + 2) {
          throw new Error(
            `getRoamersHelper: ARM9 too short after extend+patch for roamer species lookup ` +
            `(lenBefore=${lengthBefore}, lenAfter=${this.arm9.length}, neededAtLeast=${fso + 2}). ` +
            `This usually means BLZ decompression produced a shorter ARM9 than expected — ` +
            `check nds-rom.ts decodePub output size against the Java reference.`,
          );
        }
      }
    }
    for (const r of this.romEntry.roamingPokemon) {
      const se = new StaticEncounter();
      const speciesId = readWord(this.arm9, r.speciesCodeOffsets[0]);
      const pk = this.pokes[speciesId];
      if (pk == null) {
        throw new Error(
          `getRoamersHelper: roamer species offset 0x${r.speciesCodeOffsets[0].toString(16)} ` +
          `returned species ${speciesId}, but this.pokes[${speciesId}] is null. ` +
          `ARM9 length=${this.arm9.length}. The NewRoamerSubroutineTweak IPS patch may not ` +
          `have populated the species bytes (check that the patch offsets fit inside the ` +
          `extended ARM9).`,
        );
      }
      se.pkmn = pk;
      se.level = r.levelCodeOffsets.length > 0 ? this.arm9[r.levelCodeOffsets[0]] : 1;
      statics.push(se);
    }
  }
  private setRoamersHelper(stPk: StaticEncounter[], startIdx: number): void {
    let si = startIdx;
    for (const r of this.romEntry.roamingPokemon) {
      const se = stPk[si++]; const v = se.pkmn.number;
      for (const o of r.speciesCodeOffsets) { writeWord(this.arm9, o, v); }
      for (const s of r.speciesScriptOffsets) { writeWord(this.scriptNarc!.files[s.file], s.offset, v); }
      const g = se.pkmn.genderRatio === 0xFE ? 1 : 0;
      for (const go of r.genderOffsets) { writeWord(this.scriptNarc!.files[go.file], go.offset, g); }
      for (const lo of r.levelCodeOffsets) { this.arm9[lo] = se.level & 0xFF; }
    }
  }
  private applyDPRoamerPatch(): void {
    const off = romEntryGetInt(this.romEntry, 'RoamingPokemonFunctionStartOffset');
    FileFunctions.writeFullInt(this.arm9, off + 244, Species.cresselia);
    this.arm9[off + 42] = 0x32; this.arm9[off + 43] = 0x4F; this.arm9[off + 44] = 0x00; this.arm9[off + 45] = 0x00;
  }
  private patchDistortionWorldGroundCheckHelper(): void {
    const fov = this.readOverlay(romEntryGetInt(this.romEntry, 'FieldOvlNumber'));
    if (!fov) return;
    const off = this.findInData(fov, Gen4Constants.distortionWorldGroundCheckPrefix);
    if (off > 0) { fov[off + Gen4Constants.distortionWorldGroundCheckPrefix.length / 2 + (2 * 23)] = 0x30; this.writeOverlay(romEntryGetInt(this.romEntry, 'FieldOvlNumber'), fov); }
  }
  private applyIPSPatch(data: Uint8Array, ctName: string): boolean {
    const pn = this.romEntry.tweakFiles.get(ctName); if (pn == null) { return false; } FileFunctions.applyPatch(data, pn); return true;
  }
  private applyCorrectStaticMusicImpl(changes: Map<number, number>): void {
    const replaced: number[] = [];
    switch (this.romEntry.romType) {
      case Gen4Constants.Type_DP: case Gen4Constants.Type_Plat: {
        this.arm9 = this.extendARM9(this.arm9, romEntryGetInt(this.romEntry, 'Arm9ExtensionSize'), romEntryGetString(this.romEntry, 'TCMCopyingPrefix'), Gen4Constants.arm9Offset);
        this.applyIPSPatch(this.arm9, 'NewIndexToMusicTweak');
        const pfx = romEntryGetString(this.romEntry, 'NewIndexToMusicPrefix');
        let base = this.findInData(this.arm9, pfx) + pfx.length / 2;
        for (const [oldS, newS] of changes) { let i = base; let x = readWord(this.arm9, i); while (x !== oldS || replaced.includes(i)) { i += 4; x = readWord(this.arm9, i); } writeWord(this.arm9, i, newS); replaced.push(i); }
        break;
      }
      case Gen4Constants.Type_HGSS: {
        const pfx = romEntryGetString(this.romEntry, 'IndexToMusicPrefix');
        let base = this.findInData(this.arm9, pfx);
        if (base > 0) { base += pfx.length / 2; for (const [oldS, newS] of changes) { let i = base; let ie = readWord(this.arm9, i); let x = ie & 0x3FF; while (x !== oldS || replaced.includes(i)) { i += 2; ie = readWord(this.arm9, i); x = ie & 0x3FF; } writeWord(this.arm9, i, newS | (ie & 0xFC00)); replaced.push(i); } }
        break;
      }
    }
  }
  private getIngameTradesImpl(): IngameTrade[] {
    const trades: IngameTrade[] = [];
    const tNARC = this.readNARC(romEntryGetFile(this.romEntry, 'InGameTrades'));
    const spTr = this.romEntry.arrayEntries.has('StaticPokemonTrades') ? this.romEntry.arrayEntries.get('StaticPokemonTrades')! : [];
    const tStr = this.getStringsLocal(romEntryGetInt(this.romEntry, 'IngameTradesTextOffset'));
    const tc = tNARC.files.length;
    for (let i = 0; i < tc; i++) {
      if (spTr.includes(i)) { continue; }
      const tf = tNARC.files[i]; const t = new IngameTrade();
      t.nickname = tStr[i]; t.givenPokemon = this.pokes[this.readLong(tf, 0)]!;
      t.ivs = new Array(6); for (let iv = 0; iv < 6; iv++) { t.ivs[iv] = this.readLong(tf, 4 + iv * 4); }
      t.otId = readWord(tf, 0x20); t.otName = tStr[i + tc]; t.item = this.readLong(tf, 0x3C);
      t.requestedPokemon = this.pokes[this.readLong(tf, 0x4C)]!; trades.push(t);
    }
    return trades;
  }
  private setIngameTradesImpl(trades: IngameTrade[]): void {
    let tOff = 0; const oldTr = this.getIngameTradesImpl();
    const tNARC = this.readNARC(romEntryGetFile(this.romEntry, 'InGameTrades'));
    const spTr = this.romEntry.arrayEntries.has('StaticPokemonTrades') ? this.romEntry.arrayEntries.get('StaticPokemonTrades')! : [];
    const tStr = this.getStringsLocal(romEntryGetInt(this.romEntry, 'IngameTradesTextOffset'));
    const tc = tNARC.files.length;
    for (let i = 0; i < tc; i++) {
      if (spTr.includes(i)) { continue; }
      const tf = tNARC.files[i]; const t = trades[tOff++];
      tStr[i] = t.nickname; tStr[i + tc] = t.otName;
      this.writeLong(tf, 0, t.givenPokemon.number);
      for (let iv = 0; iv < 6; iv++) { this.writeLong(tf, 4 + iv * 4, t.ivs[iv]); }
      writeWord(tf, 0x20, t.otId); this.writeLong(tf, 0x3C, t.item);
      this.writeLong(tf, 0x4C, t.requestedPokemon.number);
      if (tf.length > 0x50) { this.writeLong(tf, 0x50, 0); }
    }
    this.writeNARC(romEntryGetFile(this.romEntry, 'InGameTrades'), tNARC);
    this.setStringsLocal(romEntryGetInt(this.romEntry, 'IngameTradesTextOffset'), tStr);
    if (this.romEntry.arrayEntries.has('IngameTradePersonTextOffsets')) {
      const txo = this.romEntry.arrayEntries.get('IngameTradePersonTextOffsets')!;
      for (let j = 0; j < txo.length; j++) {
        if (txo[j] > 0 && j < oldTr.length && j < trades.length) {
          const rep = new Map<string, string>();
          rep.set(oldTr[j].givenPokemon.name.toUpperCase(), trades[j].givenPokemon.name);
          if (oldTr[j].requestedPokemon !== trades[j].requestedPokemon) { rep.set(oldTr[j].requestedPokemon.name.toUpperCase(), trades[j].requestedPokemon.name); }
          this.replaceAllStringsInEntry(txo[j], rep);
          if (this.romEntry.romType === Gen4Constants.Type_HGSS && j === 6) { this.replaceAllStringsInEntry(txo[j] + 1, rep); }
        }
      }
    }
  }
  private randomizeIntroPokemonImpl(): void {
    if (this.romEntry.romType === Gen4Constants.Type_DP || this.romEntry.romType === Gen4Constants.Type_Plat) {
      let ip = this.randomPokemon(); while (ip.genderRatio === 0xFE) { ip = this.randomPokemon(); }
      const iov = this.readOverlay(romEntryGetInt(this.romEntry, 'IntroOvlNumber'));
      if (iov) { for (const pfx of Gen4Constants.dpptIntroPrefixes) { const o = this.findInData(iov, pfx); if (o > 0) { writeWord(iov, o + pfx.length / 2, ip.number); } } this.writeOverlay(romEntryGetInt(this.romEntry, 'IntroOvlNumber'), iov); }
    } else if (this.romEntry.romType === Gen4Constants.Type_HGSS) {
      let mr = this.random.nextInt(548) + 297; while (Gen4Constants.hgssBannedOverworldPokemon.includes(mr)) { mr = this.random.nextInt(548) + 297; }
      const fov = this.readOverlay(romEntryGetInt(this.romEntry, 'FieldOvlNumber'));
      if (fov) {
        const pfx = Gen4Constants.lyraEthanMarillSpritePrefix; const o = this.findInData(fov, pfx);
        if (o > 0) { const wo = o + pfx.length / 2; writeWord(fov, wo, mr); writeWord(fov, wo + 2, Gen4Constants.hgssBigOverworldPokemon.includes(mr) ? 0x5208 : 0x4E27); }
        this.writeOverlay(romEntryGetInt(this.romEntry, 'FieldOvlNumber'), fov);
      }
      const mid = Gen4Constants.convertOverworldSpriteToSpecies(mr);
      for (const e of this.romEntry.marillCryScriptEntries) { writeWord(this.scriptNarc!.files[e.file], e.offset, mid); }
      const txo = this.romEntry.arrayEntries.get('MarillTextFiles');
      if (txo) { const os = this.pokes[Species.marill]!.name.toUpperCase(); const ns = this.pokes[mid]!.name; const rp = new Map<string, string>(); rp.set(os, ns); for (const to of txo) { this.replaceAllStringsInEntry(to, rp); } }
      if (this.romEntry.tweakFiles.has('NewCatchingTutorialSubroutineTweak')) { const cp = romEntryGetString(this.romEntry, 'CatchingTutorialMonTablePrefix'); const o = this.findInData(this.arm9, cp); if (o > 0) { writeWord(this.arm9, o + cp.length / 2, mid); } }
    }
  }
  private randomPokemonLimitedHelper(maxValue: number, blockNonMales: boolean): Pokemon | null {
    this.checkPokemonRestrictions();
    const vp: Pokemon[] = []; for (const pk of this.mainPokemonList) { if (pk.number <= maxValue && (!blockNonMales || pk.genderRatio <= 0xFD)) { vp.push(pk); } }
    return vp.length === 0 ? null : vp[this.random.nextInt(vp.length)];
  }
}

