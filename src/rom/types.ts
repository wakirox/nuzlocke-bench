// Data shared between the ROM-reading worker and the tracker. Everything the tracker needs
// about the game (species, moves, learnsets, names, boss levels) is read from the player's ROM
// once, when a run starts, and stored with the run, so the tracker never has to parse the ROM.

export type GameVersion = "red" | "blue" | "yellow" | "crystal";

export interface SpeciesData {
  /** Species index as stored in RAM (Gen 1's internal order; Gen 2's is the dex number). */
  id: number;
  /** National dex number. */
  dex: number;
  name: string;
  types: string[];
  /** spc is Special (Gen 1) or Special Attack (Gen 2, which adds spdef). */
  base: { hp: number; atk: number; def: number; spd: number; spc: number; spdef?: number };
  bst: number;
  /** Growth curve name (e.g. "SLOW"). */
  curve: string;
  /** [level, moveId] pairs, sorted by level. */
  learnset: [number, number][];
  evolutions: { to: number; method: "level" | "stone" | "trade" | "other"; level?: number; item?: number }[];
}

export interface MoveData {
  /** Move id as stored in RAM. */
  id: number;
  name: string;
  type: string;
  power: number;
  accuracy: number;
  pp: number;
}

export interface TrackerData {
  version: GameVersion;
  romName: string;
  /** Keyed by internal species index. */
  species: Record<number, SpeciesData>;
  /** Keyed by RAM move id. */
  moves: Record<number, MoveData>;
  /** Indexed by item id. */
  items: string[];
  /** Town-map names from the ROM, indexed by map id. */
  mapNames: string[];
  /** Highest level in each boss's party (Nuzlocke level caps): gyms in badge order, Elite Four, Champion. */
  levelCaps?: { gyms: number[]; elite: number[]; champion: number };
  /** Trainer class names from the ROM, by class id - 1. Missing on runs made before this existed. */
  trainerClasses?: string[];
}

/** A ROM read for a run: the game exactly as given, and the tracker's data from it. */
export interface ReadRomResult {
  rom: Uint8Array;
  data: TrackerData;
}
