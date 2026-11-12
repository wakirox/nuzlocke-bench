/**
 * Gen7RomHandler.ts - randomizer handler for Su/Mo/US/UM.
 *
 * Part of "Universal Pokemon Randomizer ZX" by the UPR-ZX team
 * Pokemon and any associated names and the like are
 * trademark and (C) Nintendo 1996-2020.
 *
 * The custom code written here is licensed under the terms of the GPL:
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import * as Gen7Constants from "../constants/gen7-constants";
import * as GlobalConstants from "../constants/global-constants";
import * as Moves from "../constants/moves";
import * as Species from "../constants/species";
import { GARCArchive } from "../ctr/garc-archive";
import { Mini } from "../ctr/mini";
import { FormeInfo } from "../pokemon/forme-info";
import { Pokemon } from "../pokemon/pokemon";
import { Move } from "../pokemon/move";
import { MegaEvolution } from "../pokemon/mega-evolution";
import { Evolution } from "../pokemon/evolution";
import {
  EvolutionType,
  evolutionTypeFromIndex,
  usesLevel,
  skipSplitEvo,
} from "../pokemon/evolution-type";
import { expCurveFromByte } from "../pokemon/exp-curve";
import { Type } from "../pokemon/type";
import { CriticalChance } from "../pokemon/critical-chance";
import { StatChangeMoveType } from "../pokemon/stat-change-move-type";
import { StatChangeType } from "../pokemon/stat-change-type";
import { StatusMoveType } from "../pokemon/status-move-type";
import { StatusType } from "../pokemon/status-type";
import { ItemList } from "../pokemon/item-list";
import { Aura } from "../pokemon/aura";
import { TotemPokemon } from "../pokemon/totem-pokemon";
import { StaticEncounter } from "../pokemon/static-encounter";
import { readN3DSTexts, saveN3DSEntry } from "../text";
import { Abstract3DSRomHandler } from "./abstract-3ds-rom-handler";
import { FileFunctions } from "../utils/file-functions";
import type { RandomInstance } from "../utils/random-source";
import type { LogStream } from "./rom-handler";

/**
 * Convert a type string (from the typeTable) to a Type enum value.
 * Falls back to Type.NORMAL if unrecognized.
 */
function typeFromString(s: string | null): Type {
  if (s === null) return Type.NORMAL;
  return Type[s as keyof typeof Type] ?? Type.NORMAL;
}

// ---------------------------------------------------------------------------
// Inner helper types (mirrors Java inner classes)
// ---------------------------------------------------------------------------

interface OffsetWithinEntry {
  entry: number;
  offset: number;
}

interface RomFileEntry {
  path: string;
  expectedCRC32s: number[];
}

interface RomEntry {
  name: string;
  romCode: string;
  titleId: string;
  acronym: string;
  romType: number;
  expectedCodeCRC32s: number[];
  files: Map<string, RomFileEntry>;
  linkedStaticOffsets: Map<number, number>;
  strings: Map<string, string>;
  numbers: Map<string, number>;
  arrayEntries: Map<string, number[]>;
  offsetArrayEntries: Map<string, OffsetWithinEntry[]>;
}

function createRomEntry(): RomEntry {
  return {
    name: "",
    romCode: "",
    titleId: "",
    acronym: "",
    romType: Gen7Constants.Type_SM,
    expectedCodeCRC32s: [0, 0],
    files: new Map(),
    linkedStaticOffsets: new Map(),
    strings: new Map(),
    numbers: new Map(),
    arrayEntries: new Map(),
    offsetArrayEntries: new Map(),
  };
}

function getInt(entry: RomEntry, key: string): number {
  if (!entry.numbers.has(key)) {
    entry.numbers.set(key, 0);
  }
  return entry.numbers.get(key)!;
}

function getString(entry: RomEntry, key: string): string {
  if (!entry.strings.has(key)) {
    entry.strings.set(key, "");
  }
  return entry.strings.get(key)!;
}

function getFile(entry: RomEntry, key: string): string {
  if (!entry.files.has(key)) {
    entry.files.set(key, { path: "", expectedCRC32s: [] });
  }
  return entry.files.get(key)!.path;
}

// ---------------------------------------------------------------------------
// INI parser helpers
// ---------------------------------------------------------------------------

function parseRIInt(off: string): number {
  let radix = 10;
  off = off.trim().toLowerCase();
  if (off.startsWith("0x") || off.startsWith("&h")) {
    radix = 16;
    off = off.substring(2);
  }
  const val = parseInt(off, radix);
  return isNaN(val) ? 0 : val;
}

function parseRILong(off: string): number {
  return parseRIInt(off);
}

// ---------------------------------------------------------------------------
// ROM detection
// ---------------------------------------------------------------------------

let roms: RomEntry[] | null = null;

function ensureRomsLoaded(): RomEntry[] {
  if (roms === null) {
    roms = [];
  }
  return roms;
}

/** Inject ROM entries (normally parsed from gen7_offsets.ini). */
export function registerRomEntries(entries: RomEntry[]): void {
  roms = entries;
}

export function detect3DSRomInner(
  productCode: string | null,
  titleId: string | null
): boolean {
  return entryFor(productCode, titleId) !== null;
}

function entryFor(
  productCode: string | null,
  titleId: string | null
): RomEntry | null {
  if (productCode === null || titleId === null) {
    return null;
  }
  for (const re of ensureRomsLoaded()) {
    if (productCode === re.romCode && titleId === re.titleId) {
      return re;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// ROM entry parser (port of Java loadROMInfo)
// ---------------------------------------------------------------------------

export function loadROMInfoFromString(iniContent: string): RomEntry[] {
  const result: RomEntry[] = [];
  let current: RomEntry | null = null;

  for (let line of iniContent.split(/\r?\n/)) {
    line = line.trim();
    if (line.includes("//")) {
      line = line.substring(0, line.indexOf("//")).trim();
    }
    if (line.length === 0) continue;

    if (line.startsWith("[") && line.endsWith("]")) {
      current = createRomEntry();
      current.name = line.substring(1, line.length - 1);
      result.push(current);
    } else if (current) {
      const r = line.split("=", 2);
      if (r.length === 1) continue;
      r[1] = r[1].trim();

      if (r[0] === "Game") {
        current.romCode = r[1];
      } else if (r[0] === "Type") {
        current.romType = r[1].toUpperCase() === "USUM"
          ? Gen7Constants.Type_USUM
          : Gen7Constants.Type_SM;
      } else if (r[0] === "TitleId") {
        current.titleId = r[1];
      } else if (r[0] === "Acronym") {
        current.acronym = r[1];
      } else if (r[0].startsWith("File<")) {
        const key = r[0].split("<")[1].split(">")[0];
        const values = r[1].substring(1, r[1].length - 1).split(",");
        const path = values[0].trim();
        const crcString = values[1].trim() + ", " + values[2].trim();
        const crcs = crcString.substring(1, crcString.length - 1).split(",");
        const entry: RomFileEntry = {
          path,
          expectedCRC32s: [
            parseRILong("0x" + crcs[0].trim()),
            parseRILong("0x" + crcs[1].trim()),
          ],
        };
        current.files.set(key, entry);
      } else if (r[0] === "CodeCRC32") {
        const values = r[1].substring(1, r[1].length - 1).split(",");
        current.expectedCodeCRC32s[0] = parseRILong("0x" + values[0].trim());
        current.expectedCodeCRC32s[1] = parseRILong("0x" + values[1].trim());
      } else if (r[0] === "LinkedStaticEncounterOffsets") {
        const offsets = r[1].substring(1, r[1].length - 1).split(",");
        for (const off of offsets) {
          const parts = off.split(":");
          current.linkedStaticOffsets.set(
            parseInt(parts[0].trim()),
            parseInt(parts[1].trim())
          );
        }
      } else if (
        r[0].endsWith("Offset") ||
        r[0].endsWith("Count") ||
        r[0].endsWith("Number")
      ) {
        current.numbers.set(r[0], parseRIInt(r[1]));
      } else if (r[1].startsWith("[") && r[1].endsWith("]")) {
        const content = r[1].substring(1, r[1].length - 1);
        const offsets = content.split(",");
        if (offsets.length === 1 && offsets[0].trim() === "") {
          current.arrayEntries.set(r[0], []);
        } else {
          current.arrayEntries.set(
            r[0],
            offsets.map((o) => parseRIInt(o))
          );
        }
      } else if (r[0] === "CopyFrom") {
        for (const other of result) {
          if (r[1].toLowerCase() === other.romCode.toLowerCase()) {
            for (const [k, v] of other.linkedStaticOffsets) current.linkedStaticOffsets.set(k, v);
            for (const [k, v] of other.arrayEntries) current.arrayEntries.set(k, v);
            for (const [k, v] of other.numbers) current.numbers.set(k, v);
            for (const [k, v] of other.strings) current.strings.set(k, v);
            for (const [k, v] of other.offsetArrayEntries) current.offsetArrayEntries.set(k, v);
            for (const [k, v] of other.files) current.files.set(k, v);
          }
        }
      } else {
        current.strings.set(r[0], r[1]);
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// AreaData inner class (mirrors Java inner class)
// ---------------------------------------------------------------------------

interface AreaData {
  fileNumber: number;
  hasTables: boolean;
  encounterTables: Uint8Array[];
}

// ---------------------------------------------------------------------------
// Gen7RomHandler class
// ---------------------------------------------------------------------------

export abstract class Gen7RomHandler extends Abstract3DSRomHandler {
  // State
  private pokes: (Pokemon | null)[] = [];
  private formeMappings: Map<number, FormeInfo> = new Map();
  private absolutePokeNumByBaseForme: Map<number, Map<number, number>> =
    new Map();
  private dummyAbsolutePokeNums: Map<number, number> = new Map();
  private pokemonList: Pokemon[] = [];
  private pokemonListInclFormes: (Pokemon | null)[] = [];
  private megaEvolutions: MegaEvolution[] = [];
  private areaDataList: AreaData[] = [];
  private moves: (Move | null)[] = [];
  private romEntry!: RomEntry;
  private code: Uint8Array = new Uint8Array(0);
  private itemNames: string[] = [];
  private shopNames: string[] = [];
  private abilityNames: string[] = [];
  private allowedItems!: ItemList;
  private nonBadItems!: ItemList;

  private pokeGarc!: GARCArchive;
  private moveGarc!: GARCArchive;
  private encounterGarc!: GARCArchive;
  private stringsGarc!: GARCArchive;
  private storyTextGarc!: GARCArchive;

  public isSM = false;
  public perfectAccuracy = 100;

  // ---- Factory for ROM detection ----
  static Factory = class {
    isLoadable(productCode: string, titleId: string): boolean {
      return detect3DSRomInner(productCode, titleId);
    }
  };

  constructor(random: RandomInstance, logStream: LogStream | null = null) {
    super(random, logStream);
  }

  // ---- 3DS ROM detection ----
  protected detect3DSRom(
    productCode: string,
    titleId: string
  ): boolean {
    return detect3DSRomInner(productCode, titleId);
  }

  // ---- ROM loading ----
  protected loadedROM(productCode: string, titleId: string): void {
    const entry = entryFor(productCode, titleId);
    if (!entry) throw new Error("Unknown ROM");
    this.romEntry = entry;

    this.code = this.readCode();

    this.stringsGarc = this.readGARC(getFile(this.romEntry, "TextStrings"), true);
    this.storyTextGarc = this.readGARC(getFile(this.romEntry, "StoryText"), true);

    this.loadPokemonStats();
    this.loadMoves();

    const pokemonCount = Gen7Constants.getPokemonCount(this.romEntry.romType);
    this.pokemonListInclFormes = [...this.pokes];
    this.pokemonList = this.pokes.slice(0, pokemonCount + 1).filter(
      (p): p is Pokemon => p !== null
    );

    this.itemNames = this.getStrings(
      false,
      getInt(this.romEntry, "ItemNamesTextOffset")
    );
    this.abilityNames = this.getStrings(
      false,
      getInt(this.romEntry, "AbilityNamesTextOffset")
    );
    this.shopNames = Gen7Constants.getShopNames(this.romEntry.romType);

    this.allowedItems = Gen7Constants.getAllowedItems(this.romEntry.romType).copy();
    this.nonBadItems = Gen7Constants.nonBadItems.copy();

    if (this.romEntry.romType === Gen7Constants.Type_SM) {
      this.isSM = true;
    }
  }

  // ---- Pokemon Stats ----
  private loadPokemonStats(): void {
    this.pokeGarc = this.readGARC(
      getFile(this.romEntry, "PokemonStats"),
      true
    );
    const pokeNames = this.readPokemonNames();
    const pokemonCount = Gen7Constants.getPokemonCount(this.romEntry.romType);
    const formeCount = Gen7Constants.getFormeCount(this.romEntry.romType);
    this.pokes = new Array<Pokemon | null>(
      pokemonCount + formeCount + 1
    ).fill(null);

    for (let i = 1; i <= pokemonCount; i++) {
      this.pokes[i] = new Pokemon();
      this.pokes[i]!.number = i;
      this.loadBasicPokeStats(
        this.pokes[i]!,
        this.getGarcFileData(this.pokeGarc, i),
        this.formeMappings
      );
      this.pokes[i]!.name = pokeNames[i];
    }

    this.absolutePokeNumByBaseForme = new Map();
    this.dummyAbsolutePokeNums = new Map();
    this.dummyAbsolutePokeNums.set(255, 0);

    let idx = pokemonCount + 1;
    let formNum = 1;
    let prevSpecies = 0;
    let currentMap = new Map<number, number>();

    const sortedKeys = [...this.formeMappings.keys()].sort((a, b) => a - b);
    for (const k of sortedKeys) {
      this.pokes[idx] = new Pokemon();
      this.pokes[idx]!.number = idx;
      this.loadBasicPokeStats(
        this.pokes[idx]!,
        this.getGarcFileData(this.pokeGarc, k),
        this.formeMappings
      );
      const fi = this.formeMappings.get(k)!;
      const realBaseForme =
        this.pokes[fi.baseForme]!.baseForme === null
          ? fi.baseForme
          : this.pokes[fi.baseForme]!.baseForme!.number;
      this.pokes[idx]!.name = pokeNames[realBaseForme];
      this.pokes[idx]!.baseForme = this.pokes[fi.baseForme]!;
      this.pokes[idx]!.formeNumber = fi.formeNumber;

      if (this.pokes[idx]!.actuallyCosmetic) {
        this.pokes[idx]!.formeSuffix =
          this.pokes[idx]!.baseForme!.formeSuffix;
      } else {
        this.pokes[idx]!.formeSuffix =
          Gen7Constants.getFormeSuffixByBaseForme(fi.baseForme, fi.formeNumber);
      }

      if (realBaseForme === prevSpecies) {
        formNum++;
        currentMap.set(formNum, idx);
      } else {
        if (prevSpecies !== 0) {
          this.absolutePokeNumByBaseForme.set(prevSpecies, currentMap);
        }
        prevSpecies = realBaseForme;
        formNum = 1;
        currentMap = new Map();
        currentMap.set(formNum, idx);
      }
      idx++;
    }
    if (prevSpecies !== 0) {
      this.absolutePokeNumByBaseForme.set(prevSpecies, currentMap);
    }

    this.populateEvolutions();
    this.populateMegaEvolutions();
  }

  /** Load basic stats from a raw byte buffer into the given Pokemon. */
  loadBasicPokeStats(
    pkmn: Pokemon,
    stats: Uint8Array,
    altFormes: Map<number, FormeInfo>
  ): void {
    pkmn.hp = stats[Gen7Constants.bsHPOffset] & 0xff;
    pkmn.attack = stats[Gen7Constants.bsAttackOffset] & 0xff;
    pkmn.defense = stats[Gen7Constants.bsDefenseOffset] & 0xff;
    pkmn.speed = stats[Gen7Constants.bsSpeedOffset] & 0xff;
    pkmn.spatk = stats[Gen7Constants.bsSpAtkOffset] & 0xff;
    pkmn.spdef = stats[Gen7Constants.bsSpDefOffset] & 0xff;

    // Type
    pkmn.primaryType =
      typeFromString(Gen7Constants.typeTable[stats[Gen7Constants.bsPrimaryTypeOffset] & 0xff]);
    pkmn.secondaryType =
      typeFromString(Gen7Constants.typeTable[stats[Gen7Constants.bsSecondaryTypeOffset] & 0xff]);
    if (pkmn.secondaryType === pkmn.primaryType) {
      pkmn.secondaryType = null;
    }

    pkmn.catchRate = stats[Gen7Constants.bsCatchRateOffset] & 0xff;
    pkmn.growthCurve = expCurveFromByte(stats[Gen7Constants.bsGrowthCurveOffset])!;

    pkmn.ability1 = stats[Gen7Constants.bsAbility1Offset] & 0xff;
    pkmn.ability2 = stats[Gen7Constants.bsAbility2Offset] & 0xff;
    pkmn.ability3 = stats[Gen7Constants.bsAbility3Offset] & 0xff;
    if (pkmn.ability1 === pkmn.ability2) {
      pkmn.ability2 = 0;
    }

    pkmn.callRate = stats[Gen7Constants.bsCallRateOffset] & 0xff;

    // Held items
    const item1 = FileFunctions.read2ByteInt(
      stats,
      Gen7Constants.bsCommonHeldItemOffset
    );
    const item2 = FileFunctions.read2ByteInt(
      stats,
      Gen7Constants.bsRareHeldItemOffset
    );

    if (item1 === item2) {
      pkmn.guaranteedHeldItem = item1;
      pkmn.commonHeldItem = 0;
      pkmn.rareHeldItem = 0;
      pkmn.darkGrassHeldItem = -1;
    } else {
      pkmn.guaranteedHeldItem = 0;
      pkmn.commonHeldItem = item1;
      pkmn.rareHeldItem = item2;
      pkmn.darkGrassHeldItem = -1;
    }

    const formeCount = stats[Gen7Constants.bsFormeCountOffset] & 0xff;
    if (formeCount > 1) {
      if (!altFormes.has(pkmn.number)) {
        const firstFormeOffset = FileFunctions.read2ByteInt(
          stats,
          Gen7Constants.bsFormeOffset
        );
        if (firstFormeOffset !== 0) {
          let j = 0;
          let jMax = 0;
          let theAltForme = 0;
          const altFormesWithCosmeticFormsKeys = new Set(
            Gen7Constants.getAltFormesWithCosmeticForms(
              this.romEntry.romType
            ).keys()
          );
          for (let i = 1; i < formeCount; i++) {
            if (j === 0 || j > jMax) {
              altFormes.set(
                firstFormeOffset + i - 1,
                new FormeInfo(
                  pkmn.number,
                  i,
                  FileFunctions.read2ByteInt(
                    stats,
                    Gen7Constants.bsFormeSpriteOffset
                  )
                )
              );
              if (
                Gen7Constants.getActuallyCosmeticForms(
                  this.romEntry.romType
                ).includes(firstFormeOffset + i - 1)
              ) {
                if (
                  !Gen7Constants.getIgnoreForms(this.romEntry.romType).includes(
                    firstFormeOffset + i - 1
                  )
                ) {
                  pkmn.cosmeticForms += 1;
                  pkmn.realCosmeticFormNumbers.push(i);
                }
              }
            } else {
              altFormes.set(
                firstFormeOffset + i - 1,
                new FormeInfo(
                  theAltForme,
                  j,
                  FileFunctions.read2ByteInt(
                    stats,
                    Gen7Constants.bsFormeSpriteOffset
                  )
                )
              );
              j++;
            }
            if (altFormesWithCosmeticFormsKeys.has(firstFormeOffset + i - 1)) {
              j = 1;
              jMax =
                Gen7Constants.getAltFormesWithCosmeticForms(
                  this.romEntry.romType
                ).get(firstFormeOffset + i - 1) ?? 0;
              theAltForme = firstFormeOffset + i - 1;
            }
          }
        } else {
          if (
            pkmn.number !== Species.arceus &&
            pkmn.number !== Species.genesect &&
            pkmn.number !== Species.xerneas &&
            pkmn.number !== Species.silvally
          ) {
            pkmn.cosmeticForms = formeCount;
          }
        }
      } else {
        if (
          !Gen7Constants.getIgnoreForms(this.romEntry.romType).includes(
            pkmn.number
          )
        ) {
          pkmn.cosmeticForms =
            Gen7Constants.getAltFormesWithCosmeticForms(
              this.romEntry.romType
            ).get(pkmn.number) ?? 0;
        }
        if (
          Gen7Constants.getActuallyCosmeticForms(
            this.romEntry.romType
          ).includes(pkmn.number)
        ) {
          pkmn.actuallyCosmetic = true;
        }
      }
    }

    // Add base form to realCosmeticFormNumbers if it was populated above.
    if (pkmn.realCosmeticFormNumbers.length > 0) {
      pkmn.realCosmeticFormNumbers.push(0);
      pkmn.cosmeticForms += 1;
    }
  }

  private readPokemonNames(): string[] {
    const pokemonCount = Gen7Constants.getPokemonCount(this.romEntry.romType);
    const pokeNames: string[] = new Array(pokemonCount + 1).fill("");
    const nameList = this.getStrings(
      false,
      getInt(this.romEntry, "PokemonNamesTextOffset")
    );
    for (let i = 1; i <= pokemonCount; i++) {
      pokeNames[i] = nameList[i];
    }
    return pokeNames;
  }

  // ---- Evolutions ----
  private populateEvolutions(): void {
    for (const pkmn of this.pokes) {
      if (pkmn) {
        pkmn.evolutionsFrom = [];
        pkmn.evolutionsTo = [];
      }
    }

    const evoGARC = this.readGARC(
      getFile(this.romEntry, "PokemonEvolutions"),
      true
    );
    const pokemonCount = Gen7Constants.getPokemonCount(this.romEntry.romType);
    const formeCount = Gen7Constants.getFormeCount(this.romEntry.romType);

    for (let i = 1; i <= pokemonCount + formeCount; i++) {
      const pk = this.pokes[i]!;
      const evoEntry = this.getGarcFileData(evoGARC, i);
      let skipNext = false;

      for (let evo = 0; evo < 8; evo++) {
        const method = this.readWord(evoEntry, evo * 8);
        let species = this.readWord(evoEntry, evo * 8 + 4);
        if (
          method >= 1 &&
          method <= Gen7Constants.evolutionMethodCount &&
          species >= 1
        ) {
          const etRaw = evolutionTypeFromIndex(7, method);
          if (etRaw === null) continue;
          let et: EvolutionType = etRaw;
          if (skipSplitEvo(et)) continue;
          if (skipNext) {
            skipNext = false;
            continue;
          }
          if (et === EvolutionType.LEVEL_GAME) {
            skipNext = true;
          }

          const extraInfo = this.readWord(evoEntry, evo * 8 + 2);
          const forme = evoEntry[evo * 8 + 6];
          const level = evoEntry[evo * 8 + 7];

          const evol = new Evolution(
            pk,
            this.getPokemonForEncounter(species, forme),
            true,
            et,
            extraInfo
          );
          evol.forme = forme;
          evol.level = level;
          if (usesLevel(et)) {
            evol.extraInfo = level;
          }

          switch (et) {
            case EvolutionType.LEVEL_GAME:
              evol.type = EvolutionType.LEVEL;
              evol.to = this.pokes[getInt(this.romEntry, "CosmoemEvolutionNumber")]!;
              break;
            case EvolutionType.LEVEL_DAY_GAME:
              evol.type = EvolutionType.LEVEL_DAY;
              break;
            case EvolutionType.LEVEL_NIGHT_GAME:
              evol.type = EvolutionType.LEVEL_NIGHT;
              break;
            default:
              break;
          }

          // Own Tempo Rockruff -> Dusk Lycanroc
          if (
            pk.baseForme !== null &&
            pk.baseForme.number === Species.rockruff &&
            pk.formeNumber > 0
          ) {
            evol.from = pk.baseForme;
            pk.baseForme.evolutionsFrom.push(evol);
            const formeMap = this.absolutePokeNumByBaseForme.get(species);
            if (formeMap) {
              const absSpecies = formeMap.get(evol.forme);
              if (absSpecies !== undefined) {
                this.pokes[absSpecies]!.evolutionsTo.push(evol);
              }
            }
          }

          if (!pk.evolutionsFrom.some((e) => e.equals(evol))) {
            pk.evolutionsFrom.push(evol);
            if (!pk.actuallyCosmetic) {
              if (evol.forme > 0) {
                const absolutePokeNumByBaseFormeMap =
                  this.absolutePokeNumByBaseForme.get(species);
                if (absolutePokeNumByBaseFormeMap) {
                  const mapped = absolutePokeNumByBaseFormeMap.get(evol.forme);
                  if (mapped !== undefined) {
                    species = mapped;
                  }
                }
              }
              this.pokes[species]!.evolutionsTo.push(evol);
            }
          }
        }
      }

      // Nincada -> Shedinja hardcoded
      if (pk.number === Species.nincada) {
        const shedinja = this.pokes[Species.shedinja]!;
        const evol = new Evolution(
          pk,
          shedinja,
          false,
          EvolutionType.LEVEL_IS_EXTRA,
          20
        );
        evol.forme = -1;
        evol.level = 20;
        pk.evolutionsFrom.push(evol);
        shedinja.evolutionsTo.push(evol);
      }

      // Split evos
      if (pk.evolutionsFrom.length > 1) {
        for (const e of pk.evolutionsFrom) {
          if (e.type !== EvolutionType.LEVEL_CREATE_EXTRA) {
            e.carryStats = false;
          }
        }
      }
    }
  }

  /** Resolve a Pokemon for an encounter given species + forme. */
  getPokemonForEncounter(species: number, forme: number): Pokemon {
    const pokemon = this.pokes[species]!;

    if (forme <= pokemon.cosmeticForms || forme === 30 || forme === 31) {
      return pokemon;
    } else {
      const baseMap =
        this.absolutePokeNumByBaseForme.get(species) ??
        this.dummyAbsolutePokeNums;
      const speciesWithForme = baseMap.get(forme) ?? 0;
      return this.pokes[speciesWithForme]!;
    }
  }

  // ---- Mega Evolutions ----
  private populateMegaEvolutions(): void {
    for (const pkmn of this.pokes) {
      if (pkmn) {
        pkmn.megaEvolutionsFrom = [];
        pkmn.megaEvolutionsTo = [];
      }
    }

    this.megaEvolutions = [];
    const megaEvoGARC = this.readGARC(
      getFile(this.romEntry, "MegaEvolutions"),
      true
    );
    const pokemonCount = Gen7Constants.getPokemonCount(this.romEntry.romType);

    for (let i = 1; i <= pokemonCount; i++) {
      const pk = this.pokes[i]!;
      const megaEvoEntry = this.getGarcFileData(megaEvoGARC, i);
      for (let evo = 0; evo < 2; evo++) {
        const formNum = this.readWord(megaEvoEntry, evo * 8);
        const method = this.readWord(megaEvoEntry, evo * 8 + 2);
        if (method >= 1) {
          const argument = this.readWord(megaEvoEntry, evo * 8 + 4);
          const baseMap =
            this.absolutePokeNumByBaseForme.get(pk.number) ??
            this.dummyAbsolutePokeNums;
          const megaSpecies = baseMap.get(formNum) ?? 0;
          const megaEvo = new MegaEvolution(
            pk,
            this.pokes[megaSpecies]!,
            method,
            argument
          );
          if (
            !pk.megaEvolutionsFrom.some(
              (e) =>
                e.from === megaEvo.from &&
                e.to === megaEvo.to &&
                e.method === megaEvo.method
            )
          ) {
            pk.megaEvolutionsFrom.push(megaEvo);
            this.pokes[megaSpecies]!.megaEvolutionsTo.push(megaEvo);
          }
          this.megaEvolutions.push(megaEvo);
        }
      }
      if (pk.megaEvolutionsFrom.length > 1) {
        for (const e of pk.megaEvolutionsFrom) {
          e.carryStats = false;
        }
      }
    }
  }

  // ---- Text ----
  getStrings(isStoryText: boolean, index: number): string[] {
    const baseGARC = isStoryText ? this.storyTextGarc : this.stringsGarc;
    return this.getStringsFromGARC(baseGARC, index);
  }

  private getStringsFromGARC(textGARC: GARCArchive, index: number): string[] {
    const rawFile = this.getGarcFileData(textGARC, index);
    return [...readN3DSTexts(rawFile, true, this.romEntry.romType)];
  }

  setStrings(isStoryText: boolean, index: number, strings: string[]): void {
    const baseGARC = isStoryText ? this.storyTextGarc : this.stringsGarc;
    this.setStringsInGARC(baseGARC, index, strings);
  }

  private setStringsInGARC(
    textGARC: GARCArchive,
    index: number,
    strings: string[]
  ): void {
    const oldRawFile = this.getGarcFileData(textGARC, index);
    const newRawFile = saveN3DSEntry(oldRawFile, strings, this.romEntry.romType);
    textGARC.setFile(index, newRawFile);
  }

  // ---- Moves ----
  private loadMoves(): void {
    this.moveGarc = this.readGARC(
      getFile(this.romEntry, "MoveData"),
      true
    );
    const moveCount = Gen7Constants.getMoveCount(this.romEntry.romType);
    this.moves = new Array<Move | null>(moveCount + 1).fill(null);
    const moveNames = this.getStrings(
      false,
      getInt(this.romEntry, "MoveNamesTextOffset")
    );
    const movesData = Mini.unpackMini(
      this.getGarcFileData(this.moveGarc, 0),
      "WD"
    )!;

    for (let i = 1; i <= moveCount; i++) {
      const moveData = movesData[i];
      const move = new Move();
      move.name = moveNames[i];
      move.number = i;
      move.internalId = i;
      move.effectIndex = this.readWord(moveData, 16);
      move.hitratio = moveData[4] & 0xff;
      move.power = moveData[3] & 0xff;
      move.pp = moveData[5] & 0xff;
      move.type = typeFromString(Gen7Constants.typeTable[moveData[0] & 0xff]);
      move.flinchPercentChance = moveData[15] & 0xff;
      move.target = moveData[20] & 0xff;
      move.category = Gen7Constants.moveCategoryIndices[moveData[2] & 0xff];
      move.priority = moveData[6];

      const critStages = moveData[14] & 0xff;
      if (critStages === 6) {
        move.criticalChance = CriticalChance.GUARANTEED;
      } else if (critStages > 0) {
        move.criticalChance = CriticalChance.INCREASED;
      }

      const internalStatusType = this.readWord(moveData, 8);
      const flags = FileFunctions.readFullInt(moveData, 36);
      move.makesContact = (flags & 0x001) !== 0;
      move.isChargeMove = (flags & 0x002) !== 0;
      move.isRechargeMove = (flags & 0x004) !== 0;
      move.isPunchMove = (flags & 0x080) !== 0;
      move.isSoundMove = (flags & 0x100) !== 0;
      move.isTrapMove = internalStatusType === 8;

      if (
        move.effectIndex === Gen7Constants.noDamageTargetTrappingEffect ||
        move.effectIndex === Gen7Constants.noDamageFieldTrappingEffect ||
        move.effectIndex === Gen7Constants.damageAdjacentFoesTrappingEffect ||
        move.effectIndex === Gen7Constants.damageTargetTrappingEffect
      ) {
        move.isTrapMove = true;
      }

      const qualities = moveData[1];
      const recoilOrAbsorbPercent = moveData[18];
      if (qualities === Gen7Constants.damageAbsorbQuality) {
        move.absorbPercent = recoilOrAbsorbPercent;
      } else {
        move.recoilPercent = -recoilOrAbsorbPercent;
      }

      if (i === Moves.swift) {
        this.perfectAccuracy = move.hitratio;
      }

      if (GlobalConstants.normalMultihitMoves.includes(i)) {
        move.hitCount = 19 / 6.0;
      } else if (GlobalConstants.doubleHitMoves.includes(i)) {
        move.hitCount = 2;
      } else if (i === Moves.tripleKick) {
        move.hitCount = 2.71;
      }

      switch (qualities) {
        case Gen7Constants.noDamageStatChangeQuality:
        case Gen7Constants.noDamageStatusAndStatChangeQuality:
          if (move.target === 6 || move.target === 7) {
            move.statChangeMoveType = StatChangeMoveType.NO_DAMAGE_USER;
          } else if (move.target === 2) {
            move.statChangeMoveType = StatChangeMoveType.NO_DAMAGE_ALLY;
          } else if (move.target === 8) {
            move.statChangeMoveType = StatChangeMoveType.NO_DAMAGE_ALL;
          } else {
            move.statChangeMoveType = StatChangeMoveType.NO_DAMAGE_TARGET;
          }
          break;
        case Gen7Constants.damageTargetDebuffQuality:
          move.statChangeMoveType = StatChangeMoveType.DAMAGE_TARGET;
          break;
        case Gen7Constants.damageUserBuffQuality:
          move.statChangeMoveType = StatChangeMoveType.DAMAGE_USER;
          break;
        default:
          move.statChangeMoveType = StatChangeMoveType.NONE_OR_UNKNOWN;
          break;
      }

      for (let sc = 0; sc < 3; sc++) {
        move.statChanges[sc].type =
          Object.values(StatChangeType)[moveData[21 + sc]] as StatChangeType;
        move.statChanges[sc].stages = moveData[24 + sc];
        move.statChanges[sc].percentChance = moveData[27 + sc];
      }

      if (internalStatusType < 7) {
        move.statusType =
          Object.values(StatusType)[internalStatusType] as StatusType;
        if (
          move.statusType === StatusType.POISON &&
          (i === Moves.toxic || i === Moves.poisonFang)
        ) {
          move.statusType = StatusType.TOXIC_POISON;
        }
        move.statusPercentChance = moveData[10] & 0xff;
        switch (qualities) {
          case Gen7Constants.noDamageStatusQuality:
          case Gen7Constants.noDamageStatusAndStatChangeQuality:
            move.statusMoveType = StatusMoveType.NO_DAMAGE;
            break;
          case Gen7Constants.damageStatusQuality:
            move.statusMoveType = StatusMoveType.DAMAGE;
            break;
        }
      }

      this.moves[i] = move;
    }
  }

  // ---- Totem Pokemon ----
  /** Parse totem encounter data from raw bytes. */
  parseTotemPokemon(data: Uint8Array, offset: number): TotemPokemon {
    const totem = new TotemPokemon();
    const species = this.readWord(data, offset);
    const forme = data[offset + 2] & 0xff;
    const level = data[offset + 3] & 0xff;
    const heldItem = this.readWord(data, offset + 4);
    const auraByte = data[offset + 6] & 0xff;

    totem.pkmn = this.getPokemonForEncounter(species, forme);
    totem.forme = forme;
    totem.level = level;
    totem.heldItem = heldItem;
    totem.aura = new Aura(auraByte);

    // Ally offsets
    totem.ally1Offset = this.readWord(data, offset + 0xE);
    totem.ally2Offset = this.readWord(data, offset + 0x10);

    return totem;
  }

  /** Parse a totem ally encounter from raw bytes. */
  parseTotemAlly(data: Uint8Array, offset: number): StaticEncounter {
    const ally = new StaticEncounter();
    const species = this.readWord(data, offset);
    const forme = data[offset + 2] & 0xff;
    const level = data[offset + 3] & 0xff;

    ally.pkmn = this.getPokemonForEncounter(species, forme);
    ally.forme = forme;
    ally.level = level;

    return ally;
  }

  // ---- Saving ----
  protected savingROM(): void {
    this.savePokemonStats();
    this.saveMoves();
    this.writeCode(this.code);
    if (this.encounterGarc) {
      this.writeGARC(getFile(this.romEntry, "WildPokemon"), this.encounterGarc);
    }
    this.writeGARC(getFile(this.romEntry, "TextStrings"), this.stringsGarc);
    this.writeGARC(getFile(this.romEntry, "StoryText"), this.storyTextGarc);
  }

  private savePokemonStats(): void {
    const pokemonCount = Gen7Constants.getPokemonCount(this.romEntry.romType);
    const formeCount = Gen7Constants.getFormeCount(this.romEntry.romType);
    let k = Gen7Constants.bsSize;
    const duplicateData = this.getGarcFileData(
      this.pokeGarc,
      pokemonCount + formeCount + 1
    );

    for (let i = 1; i <= pokemonCount + formeCount; i++) {
      const pokeData = this.getGarcFileData(this.pokeGarc, i);
      this.saveBasicPokeStats(this.pokes[i]!, pokeData);
      for (const byte of pokeData) {
        if (k < duplicateData.length) {
          duplicateData[k] = byte;
        }
        k++;
      }
    }

    this.writeGARC(getFile(this.romEntry, "PokemonStats"), this.pokeGarc);
    this.writeEvolutions();
  }

  private saveBasicPokeStats(pkmn: Pokemon, stats: Uint8Array): void {
    stats[Gen7Constants.bsHPOffset] = pkmn.hp & 0xff;
    stats[Gen7Constants.bsAttackOffset] = pkmn.attack & 0xff;
    stats[Gen7Constants.bsDefenseOffset] = pkmn.defense & 0xff;
    stats[Gen7Constants.bsSpeedOffset] = pkmn.speed & 0xff;
    stats[Gen7Constants.bsSpAtkOffset] = pkmn.spatk & 0xff;
    stats[Gen7Constants.bsSpDefOffset] = pkmn.spdef & 0xff;
    stats[Gen7Constants.bsPrimaryTypeOffset] = Gen7Constants.typeToByte(
      Type[pkmn.primaryType] as string
    );
    if (pkmn.secondaryType === null) {
      stats[Gen7Constants.bsSecondaryTypeOffset] =
        stats[Gen7Constants.bsPrimaryTypeOffset];
    } else {
      stats[Gen7Constants.bsSecondaryTypeOffset] = Gen7Constants.typeToByte(
        Type[pkmn.secondaryType] as string
      );
    }
    stats[Gen7Constants.bsCatchRateOffset] = pkmn.catchRate & 0xff;

    stats[Gen7Constants.bsAbility1Offset] = pkmn.ability1 & 0xff;
    stats[Gen7Constants.bsAbility2Offset] =
      pkmn.ability2 !== 0 ? pkmn.ability2 & 0xff : pkmn.ability1 & 0xff;
    stats[Gen7Constants.bsAbility3Offset] = pkmn.ability3 & 0xff;

    stats[Gen7Constants.bsCallRateOffset] = pkmn.callRate & 0xff;

    // Held items
    if (pkmn.guaranteedHeldItem > 0) {
      FileFunctions.write2ByteInt(
        stats,
        Gen7Constants.bsCommonHeldItemOffset,
        pkmn.guaranteedHeldItem
      );
      FileFunctions.write2ByteInt(
        stats,
        Gen7Constants.bsRareHeldItemOffset,
        pkmn.guaranteedHeldItem
      );
      FileFunctions.write2ByteInt(
        stats,
        Gen7Constants.bsDarkGrassHeldItemOffset,
        0
      );
    } else {
      FileFunctions.write2ByteInt(
        stats,
        Gen7Constants.bsCommonHeldItemOffset,
        pkmn.commonHeldItem
      );
      FileFunctions.write2ByteInt(
        stats,
        Gen7Constants.bsRareHeldItemOffset,
        pkmn.rareHeldItem
      );
      FileFunctions.write2ByteInt(
        stats,
        Gen7Constants.bsDarkGrassHeldItemOffset,
        0
      );
    }

    if (pkmn.fullName() === "Meowstic") {
      stats[Gen7Constants.bsGenderOffset] = 0;
    } else if (pkmn.fullName() === "Meowstic-F") {
      stats[Gen7Constants.bsGenderOffset] = 0xfe;
    }
  }

  private saveMoves(): void {
    // Would write move data back; mirrors loadMoves in reverse.
  }

  private writeEvolutions(): void {
    // Would write evolution data back to GARC.
  }

  protected getGameAcronym(): string {
    return this.romEntry.acronym;
  }

  protected isGameUpdateSupported(_version: number): boolean {
    return false;
  }

  protected getGameVersion(): string {
    return "";
  }

  // ---- Accessors ----
  getPokes(): (Pokemon | null)[] {
    return this.pokes;
  }
  getPokemonList(): Pokemon[] {
    return this.pokemonList;
  }
  getPokemonListInclFormes(): (Pokemon | null)[] {
    return this.pokemonListInclFormes;
  }
  getMoves(): (Move | null)[] {
    return this.moves;
  }
  getMegaEvolutions(): MegaEvolution[] {
    return this.megaEvolutions;
  }
  getAbilityNames(): string[] {
    return this.abilityNames;
  }
  getItemNames(): string[] {
    return this.itemNames;
  }
  getRomEntry(): RomEntry {
    return this.romEntry;
  }
  getFormeMappings(): Map<number, FormeInfo> {
    return this.formeMappings;
  }
  getAbsolutePokeNumByBaseForme(): Map<number, Map<number, number>> {
    return this.absolutePokeNumByBaseForme;
  }

  // ---- Utility wrappers ----
  readWord(data: Uint8Array, offset: number): number {
    return (data[offset] & 0xff) | ((data[offset + 1] & 0xff) << 8);
  }

  writeWord(data: Uint8Array, offset: number, value: number): void {
    data[offset] = value & 0xff;
    data[offset + 1] = (value >> 8) & 0xff;
  }

  /** Retrieve the first sub-file from a GARC at the given index. */
  getGarcFileData(garc: GARCArchive, index: number): Uint8Array {
    const fileMap = garc.files[index];
    if (!fileMap) {
      return new Uint8Array(0);
    }
    return fileMap.get(0) ?? new Uint8Array(0);
  }
}

export type { RomEntry as Gen7RomEntry, RomFileEntry as Gen7RomFileEntry };
