// SPDX-License-Identifier: GPL-3.0-or-later
// Reads a Gen 1 ROM for the tracker through the vendored UPR-ZX TypeScript port's Gen 1 ROM
// handler (vendor/randomizer): species, moves, learnsets, evolutions, item, map and trainer
// class names, and boss levels. Nothing is changed in the game. Runs in the page's worker
// (worker.ts) and in Node (the run verifier), bundled with the browser shims for fs & co. in both.

import { Buffer } from "buffer";
// ts-src expects Node globals. Install them before any engine module loads
// (engine modules are imported dynamically below for that reason).
const g = globalThis as Record<string, unknown>;
g.Buffer = Buffer;
g.process ??= {
  argv: [],
  env: {},
  platform: "browser",
  cwd: () => "/",
  stdout: { write: () => true },
  stderr: { write: () => true },
};

import { vfs } from "../shims/virtual-fs";
import type { BossTable } from "../games/adapter";
import { BOSSES } from "../games/gen1/data";
import { BOSSES as GEN2_BOSSES } from "../games/gen2/data";
import { detectVersion as gen2Version } from "../games/gen2";
import type { GameVersion, MoveData, ReadRomResult, SpeciesData, TrackerData } from "./types";

/** Reads one of the engine's data files (config/…) — fetched in the page, read from disk in Node. */
export type LoadFile = (path: string) => Promise<Uint8Array>;
export type Progress = (stage: string) => void;

/** What the Gen 1 handler reads: the ROM offsets and the text tables (the base one and the Gen 1 extras). */
const CONFIG_FILES = [
  "gen1_offsets.ini", "gameboy_jpn.tbl", "rby_english.tbl", "rby_espita.tbl", "rby_freger.tbl", "green_translation.tbl",
  // Gen 2 (Crystal): its offsets and English text table.
  "gen2_offsets.ini", "gsc_english.tbl",
];

let bootstrap: Promise<void> | null = null;
function bootstrapConfigs(loadFile: LoadFile): Promise<void> {
  bootstrap ??= (async () => {
    const load = async (path: string) => vfs.register(`/ts-src/${path}`, await loadFile(path));
    await Promise.all(CONFIG_FILES.map((f) => load(`config/${f}`)));
  })();
  return bootstrap;
}

let runCounter = 0;

/** Reads a clean English Red, Blue or Yellow ROM: the game exactly as it shipped, plus the tracker's data from it. */
export async function readRom(romBytes: ArrayBuffer, loadFile: LoadFile, progress: Progress = () => {}): Promise<ReadRomResult> {
  await bootstrapConfigs(loadFile);
  if (gen2Version(new Uint8Array(romBytes))) return readGen2Rom(romBytes, progress);

  const { Gen1RomHandlerFactory } = await import("@randomizer/romhandlers/gen1-rom-handler");
  const { RandomSource } = await import("@randomizer/utils/random-source");

  const key = `/roms/run${++runCounter}/input.gb`;
  const input = new Uint8Array(romBytes);
  vfs.register(key, input);
  try {
    const factory = new Gen1RomHandlerFactory();
    if (!factory.isLoadable(key)) {
      throw new Error("This doesn't look like a Pokémon Red, Blue or Yellow ROM.");
    }
    progress("Reading the game…");
    // The handler takes a random source; reading never draws from it.
    const handler = factory.create(RandomSource.instance());
    handler.loadRom(key);
    const romName = handler.getROMName();
    if (!/\(U\)$/.test(romName)) {
      throw new Error(`${romName} isn't supported — use an English (US/EU) Red, Blue or Yellow ROM.`);
    }
    const data = extractTrackerData(handler as unknown as Gen1Reader, romName);
    data.levelCaps = bossLevels(handler as unknown as Gen1Reader, BOSSES);
    return { rom: input.slice(), data };
  } finally {
    vfs.delete(key);
  }
}

/** The Gen 1 handler's public API and the private tables this reader needs (the shapes it reads). */
interface Gen1Reader {
  getPokemon(): (PokemonView | null)[];
  getMoves(): (MoveView | null)[];
  getMovesLearnt(): Map<number, { move: number; level: number }[]>;
  getTrainers(): { trainerclass: number; pokemon: { level: number }[] }[];
  getItemNames(): string[];
  isYellow(): boolean;
  mapNames?: string[];
  romEntry?: { arrayEntries?: Map<string, number[]> };
  pokeRBYToNumTable: number[];
  moveNumToRomTable: number[];
  readVariableLengthString(offset: number, flag: boolean): string;
  lengthOfStringAt(offset: number, flag: boolean): number;
}

interface PokemonView {
  name: string;
  primaryType: number | string | null;
  secondaryType: number | string | null;
  hp: number;
  attack: number;
  defense: number;
  speed: number;
  special: number;
  growthCurve: number;
  evolutionsFrom: { type: number; extraInfo: number; to: { number: number } }[];
}

interface MoveView {
  name: string;
  type: number | string | null;
  power: number;
  hitratio: number;
  pp: number;
}

// The handler keeps the tables we need in private fields; reach into them
// rather than patching the vendored engine.
function extractTrackerData(handler: Gen1Reader, romName: string): TrackerData {
  const pokes = handler.getPokemon();
  const rbyToNum: number[] = handler.pokeRBYToNumTable;
  const moveNumToRom: number[] = handler.moveNumToRomTable;
  const learnt: Map<number, { move: number; level: number }[]> = handler.getMovesLearnt();
  // Types may surface as enum numbers or as names depending on the code path.
  const typeName = (t: number | string | null | undefined): string | null =>
    t == null ? null : typeof t === "string" ? t.toUpperCase() : TYPE_NAMES[t] ?? null;

  const moves: Record<number, MoveData> = {};
  handler.getMoves().forEach((m, num) => {
    if (!m) return;
    const id = moveNumToRom[num] || num;
    moves[id] = {
      id,
      name: m.name,
      type: typeName(m.type) ?? "NORMAL",
      power: m.power,
      accuracy: Math.round(m.hitratio),
      pp: m.pp,
    };
  });

  const species: Record<number, SpeciesData> = {};
  for (let id = 1; id < rbyToNum.length; id++) {
    const dex = rbyToNum[id];
    const p = dex ? pokes[dex] : null;
    if (!p) continue;
    const types = [typeName(p.primaryType)!];
    const second = typeName(p.secondaryType);
    if (second && second !== types[0]) types.push(second);
    const base = { hp: p.hp, atk: p.attack, def: p.defense, spd: p.speed, spc: p.special };
    species[id] = {
      id,
      dex,
      name: p.name,
      types,
      base,
      bst: base.hp + base.atk + base.def + base.spd + base.spc,
      curve: EXP_CURVES[p.growthCurve] ?? "MEDIUM_FAST",
      learnset: (learnt.get(dex) ?? [])
        .map((ml): [number, number] => [ml.level, moveNumToRom[ml.move] || ml.move])
        .sort((a, b) => a[0] - b[0]),
      evolutions: p.evolutionsFrom.map((e) => {
        const to = rbyToNum.indexOf(e.to.number);
        // EvolutionType: 0 LEVEL, 1 STONE, 2 TRADE
        if (e.type === 0) return { to, method: "level" as const, level: e.extraInfo };
        if (e.type === 1) return { to, method: "stone" as const, item: e.extraInfo };
        if (e.type === 2) return { to, method: "trade" as const };
        return { to, method: "other" as const };
      }),
    };
  }

  const version: GameVersion = handler.isYellow() ? "yellow" : /Blue/.test(romName) ? "blue" : "red";
  return {
    version,
    romName,
    species,
    moves,
    items: handler.getItemNames(),
    mapNames: handler.mapNames ?? [],
    trainerClasses: trainerClassNames(handler),
  };
}

/** Every trainer class's name as the ROM spells it, by class id - 1 (the full 47-name table). */
function trainerClassNames(handler: Gen1Reader): string[] {
  const offsets: number[] = handler.romEntry?.arrayEntries?.get("TrainerClassNamesOffsets") ?? [];
  if (!offsets.length) return [];
  const names: string[] = [];
  let off = offsets[offsets.length - 1];
  for (let i = 0; i < 47; i++) {
    names.push(handler.readVariableLengthString(off, false));
    off += handler.lengthOfStringAt(off, false) + 1;
  }
  return names;
}

/**
 * Each boss's highest level, read from the ROM's trainer table (trainer
 * class, nth party of that class — as tagged in the engine's gen1-constants;
 * which classes are the bosses is the game's: its BossTable).
 * Only levels: nothing about which Pokémon they use.
 */
function bossLevels(handler: Gen1Reader, bosses: BossTable): TrackerData["levelCaps"] {
  const trainers = handler.getTrainers();
  const ofClass = (cls: number) => trainers.filter((t) => t.trainerclass === cls);
  const ace = (t?: { pokemon: { level: number }[] }) => Math.max(0, ...(t?.pokemon ?? []).map((p) => p.level));
  return {
    gyms: bosses.gyms.map(([c, n]) => ace(ofClass(c)[n])),
    elite: bosses.elite.map((c) => ace(ofClass(c)[0])),
    champion: Math.max(0, ...ofClass(bosses.champion).map(ace)),
  };
}

// Mirrors ts-src/pokemon/type.ts and exp-curve.ts enum order.
const TYPE_NAMES = [
  "NORMAL", "FIGHTING", "FLYING", "GRASS", "WATER", "FIRE", "ROCK", "GROUND", "PSYCHIC",
  "BUG", "DRAGON", "ELECTRIC", "GHOST", "POISON", "ICE", "STEEL", "DARK", "FAIRY",
];
const EXP_CURVES = ["SLOW", "MEDIUM_SLOW", "MEDIUM_FAST", "FAST", "ERRATIC", "FLUCTUATING"];

/** Reads a clean English Crystal ROM through the engine's Gen 2 handler, as readRom does Gen 1. */
async function readGen2Rom(romBytes: ArrayBuffer, progress: Progress): Promise<ReadRomResult> {
  const { Gen2RomHandlerFactory } = await import("@randomizer/romhandlers/gen2-rom-handler");
  const { RandomSource } = await import("@randomizer/utils/random-source");

  const key = `/roms/run${++runCounter}/input.gbc`;
  const input = new Uint8Array(romBytes);
  vfs.register(key, input);
  try {
    const factory = new Gen2RomHandlerFactory();
    if (!factory.isLoadable(key)) throw new Error("This doesn't look like a Pokémon Crystal ROM.");
    progress("Reading the game…");
    const handler = factory.create(RandomSource.instance()) as unknown as Gen2Reader;
    handler.loadRom(key);
    const romName = handler.getROMName();
    if (romName !== "Crystal (U)") throw new Error(`${romName} isn't supported — use an English (US/EU) Crystal ROM.`);
    return { rom: input.slice(), data: extractGen2Data(handler, romName) };
  } finally {
    vfs.delete(key);
  }
}

/** The Gen 2 handler's API and the private tables this reader needs. */
interface Gen2Reader {
  loadRom(path: string): void;
  getROMName(): string;
  getPokemon(): (Gen2PokemonView | null)[];
  getMoves(): (MoveView | null)[];
  getMovesLearnt(): Map<number, { move: number; level: number }[]>;
  getTrainers(): { trainerclass: number; pokemon: { level: number }[] }[];
  getTrainerClassNames(): string[];
  getItemNames(): string[];
  mapNames: string[][];
}

interface Gen2PokemonView extends PokemonView {
  number: number;
  spatk: number;
  spdef: number;
}

/** The engine spells Gen 2's "POKé" glyph pair as "[POKé]"; the screen shows POKé. */
const pokeGlyph = (name: string) => name.replace(/\[POKé\]\s?/g, (m) => (m.endsWith(" ") ? "POKé " : "POKé"));

/** Gen 2 stores species and moves by their national numbers, so the ids need no translation. */
function extractGen2Data(handler: Gen2Reader, romName: string): TrackerData {
  const typeName = (t: number | string | null | undefined): string | null =>
    t == null ? null : typeof t === "string" ? t.toUpperCase() : TYPE_NAMES[t] ?? null;

  const moves: Record<number, MoveData> = {};
  handler.getMoves().forEach((m, id) => {
    if (!m) return;
    moves[id] = { id, name: m.name, type: typeName(m.type) ?? "NORMAL", power: m.power, accuracy: Math.round(m.hitratio), pp: m.pp };
  });

  const learnt = handler.getMovesLearnt();
  const species: Record<number, SpeciesData> = {};
  handler.getPokemon().forEach((p, dex) => {
    if (!p || !dex) return;
    const types = [typeName(p.primaryType)!];
    const second = typeName(p.secondaryType);
    if (second && second !== types[0]) types.push(second);
    const base = { hp: p.hp, atk: p.attack, def: p.defense, spd: p.speed, spc: p.spatk, spdef: p.spdef };
    species[dex] = {
      id: dex,
      dex,
      name: p.name,
      types,
      base,
      bst: base.hp + base.atk + base.def + base.spd + base.spc + base.spdef,
      curve: EXP_CURVES[p.growthCurve] ?? "MEDIUM_FAST",
      learnset: (learnt.get(dex) ?? []).map((ml): [number, number] => [ml.level, ml.move]).sort((a, b) => a[0] - b[0]),
      evolutions: p.evolutionsFrom.map((e) => {
        const to = e.to.number;
        if (e.type === 0) return { to, method: "level" as const, level: e.extraInfo };
        if (e.type === 1) return { to, method: "stone" as const, item: e.extraInfo };
        if (e.type === 2) return { to, method: "trade" as const };
        return { to, method: "other" as const };
      }),
    };
  });

  // Map names by map id (group << 8 | number), as the adapter numbers maps.
  const mapNames: string[] = [];
  (handler.mapNames ?? []).forEach((group, g) => group?.forEach((name, n) => {
    if (name) mapNames[(g << 8) | n] = name;
  }));

  const trainers = handler.getTrainers();
  // The handler numbers classes from 0 for the game's class 1.
  const ofClass = (cls: number) => trainers.filter((t) => t.trainerclass === cls - 1);
  const ace = (t?: { pokemon: { level: number }[] }) => Math.max(0, ...(t?.pokemon ?? []).map((p) => p.level));

  return {
    version: "crystal",
    romName,
    species,
    moves,
    items: handler.getItemNames().map(pokeGlyph),
    mapNames: mapNames.map((n) => n && pokeGlyph(n)),
    trainerClasses: handler.getTrainerClassNames().map(pokeGlyph),
    levelCaps: {
      gyms: GEN2_BOSSES.gyms.map(([c, n]) => ace(ofClass(c)[n])),
      elite: GEN2_BOSSES.elite.map((c) => ace(ofClass(c)[0])),
      champion: Math.max(0, ...ofClass(GEN2_BOSSES.champion).map(ace)),
    },
  };
}
