// Static Gen 1 knowledge the tracker needs (type chart, charset, items, rules).

import type { GameVersion, SpeciesData } from "../../rom/types";

export const SPECIAL_TYPES = new Set(["FIRE", "WATER", "GRASS", "ELECTRIC", "ICE", "PSYCHIC", "DRAGON"]);

// Gen 1 chart, including its quirks (Ghost can't hit Psychic, Bug/Poison 2x each other, Ice→Fire neutral).
const CHART: Record<string, Record<string, number>> = {
  NORMAL: { ROCK: 0.5, GHOST: 0 },
  FIRE: { FIRE: 0.5, WATER: 0.5, GRASS: 2, ICE: 2, BUG: 2, ROCK: 0.5, DRAGON: 0.5 },
  WATER: { FIRE: 2, WATER: 0.5, GRASS: 0.5, GROUND: 2, ROCK: 2, DRAGON: 0.5 },
  ELECTRIC: { WATER: 2, ELECTRIC: 0.5, GRASS: 0.5, GROUND: 0, FLYING: 2, DRAGON: 0.5 },
  GRASS: { FIRE: 0.5, WATER: 2, GRASS: 0.5, POISON: 0.5, GROUND: 2, FLYING: 0.5, BUG: 0.5, ROCK: 2, DRAGON: 0.5 },
  ICE: { WATER: 0.5, GRASS: 2, ICE: 0.5, GROUND: 2, FLYING: 2, DRAGON: 2 },
  FIGHTING: { NORMAL: 2, ICE: 2, POISON: 0.5, FLYING: 0.5, PSYCHIC: 0.5, BUG: 0.5, ROCK: 2, GHOST: 0 },
  POISON: { GRASS: 2, POISON: 0.5, GROUND: 0.5, BUG: 2, ROCK: 0.5, GHOST: 0.5 },
  GROUND: { FIRE: 2, ELECTRIC: 2, GRASS: 0.5, POISON: 2, FLYING: 0, BUG: 0.5, ROCK: 2 },
  FLYING: { ELECTRIC: 0.5, GRASS: 2, FIGHTING: 2, BUG: 2, ROCK: 0.5 },
  PSYCHIC: { FIGHTING: 2, POISON: 2, PSYCHIC: 0.5 },
  BUG: { FIRE: 0.5, GRASS: 2, FIGHTING: 0.5, POISON: 2, FLYING: 0.5, PSYCHIC: 2, GHOST: 0.5 },
  ROCK: { FIRE: 2, ICE: 2, FIGHTING: 0.5, GROUND: 0.5, FLYING: 2, BUG: 2 },
  GHOST: { NORMAL: 0, PSYCHIC: 0, GHOST: 2 },
  DRAGON: { DRAGON: 2 },
};

export function effectiveness(moveType: string, defenderTypes: string[]): number {
  return defenderTypes.reduce((m, t) => m * (CHART[moveType]?.[t] ?? 1), 1);
}

// Gen 1 text encoding → string. 0x50 terminates.
export function decodeText(bytes: ArrayLike<number>): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i];
    if (c === 0x50) break;
    s += charFor(c);
  }
  return s;
}

export function charFor(c: number): string {
  if (c >= 0x80 && c <= 0x99) return String.fromCharCode(65 + c - 0x80);
  if (c >= 0xa0 && c <= 0xb9) return String.fromCharCode(97 + c - 0xa0);
  if (c >= 0xf6) return String.fromCharCode(48 + c - 0xf6);
  return CHARSET_MISC[c] ?? "";
}

const CHARSET_MISC: Record<number, string> = {
  0x7f: " ", 0x9a: "(", 0x9b: ")", 0x9c: ":", 0x9d: ";", 0x9e: "[", 0x9f: "]",
  0xba: "é", 0xbb: "'d", 0xbc: "'l", 0xbd: "'s", 0xbe: "'t", 0xbf: "'v",
  0xe0: "'", 0xe1: "PK", 0xe2: "MN", 0xe3: "-", 0xe4: "'r", 0xe5: "'m", 0xe6: "?", 0xe7: "!",
  0xe8: ".", 0xec: "▷", 0xed: "▶", 0xee: "▼", 0xef: "♂", 0xf0: "¥", 0xf1: "×", 0xf2: ".",
  0xf3: "/", 0xf4: ",", 0xf5: "♀",
  // Text-box borders
  0x79: "┌", 0x7a: "─", 0x7b: "┐", 0x7c: "│", 0x7d: "└", 0x7e: "┘",
};

// Experience needed to reach `level` on each growth curve.
export function expForLevel(curve: string, level: number): number {
  const n = level;
  switch (curve) {
    case "FAST": return Math.floor((4 * n ** 3) / 5);
    case "MEDIUM_SLOW":
      return Math.max(0, Math.floor((6 * n ** 3) / 5 - 15 * n ** 2 + 100 * n - 140));
    case "SLOW": return Math.floor((5 * n ** 3) / 4);
    default: return n ** 3;
  }
}

// Item ids (pret/pokered constants/item_constants.asm)
export const ITEM = {
  POKE_BALL: 0x04, GREAT_BALL: 0x03, ULTRA_BALL: 0x02, MASTER_BALL: 0x01,
  FULL_RESTORE: 0x10, MAX_POTION: 0x11, HYPER_POTION: 0x12, SUPER_POTION: 0x13, POTION: 0x14,
  REPEL: 0x1e, SUPER_REPEL: 0x38, MAX_REPEL: 0x39,
  FULL_HEAL: 0x34, REVIVE: 0x35, MAX_REVIVE: 0x36,
  FRESH_WATER: 0x3c, SODA_POP: 0x3d, LEMONADE: 0x3e,
  ETHER: 0x50, MAX_ETHER: 0x51, ELIXER: 0x52, MAX_ELIXER: 0x53,
  RARE_CANDY: 0x28,
  SILPH_SCOPE: 0x48,
} as const;

/** HP restored by each healing item; Infinity = full heal. */
export const HEAL_AMOUNTS: Record<number, number> = {
  [ITEM.POTION]: 20, [ITEM.SUPER_POTION]: 50, [ITEM.HYPER_POTION]: 200,
  [ITEM.MAX_POTION]: Infinity, [ITEM.FULL_RESTORE]: Infinity,
  [ITEM.FRESH_WATER]: 50, [ITEM.SODA_POP]: 60, [ITEM.LEMONADE]: 80,
};
export const STATUS_HEALS = new Set<number>([0x0b, 0x0c, 0x0d, 0x0e, 0x0f, ITEM.FULL_HEAL]);
export const PP_RESTORES = new Set<number>([ITEM.ETHER, ITEM.MAX_ETHER, ITEM.ELIXER, ITEM.MAX_ELIXER]);

/** The eight badges, by number (in the order the game stores them). */
export const BADGES = ["Badge 1", "Badge 2", "Badge 3", "Badge 4", "Badge 5", "Badge 6", "Badge 7", "Badge 8"];

/** Gen 1 status byte: poisoned (pret PSN). */
export const STATUS_POISON = 0x08;

export const STATUS_NAMES = (status: number): string | null => {
  if (status & 0x07) return "SLP";
  if (status & 0x08) return "PSN";
  if (status & 0x10) return "BRN";
  if (status & 0x20) return "FRZ";
  if (status & 0x40) return "PAR";
  return null;
};

// Map classification by pret constant name.
const DUNGEON_PATTERNS = [
  /^MT_MOON_(1F|B1F|B2F)$/, /^DIGLETTS_CAVE/, /^SS_ANNE_/, /^ROCK_TUNNEL_(1F|B1F)$/,
  /^GAME_CORNER$/, /^ROCKET_HIDEOUT_/, /^POKEMON_TOWER_/, /^SILPH_CO_/, /^SEAFOAM_ISLANDS_/,
  /^VICTORY_ROAD_/,
];
export const isDungeon = (c: string) => DUNGEON_PATTERNS.some((r) => r.test(c));
export const isPokecenter = (c: string) => /_POKECENTER$/.test(c) || c === "INDIGO_PLATEAU_LOBBY";

/** The rooms past the first Elite Four member: once there, the League's battles have begun. */
export const LEAGUE_UNDERWAY_MAPS = ["BRUNOS_ROOM", "AGATHAS_ROOM", "LANCES_ROOM", "CHAMPIONS_ROOM"];

/** The catching demo early in the game swaps the player's name for the demonstrator's. */
export const DEMO_PLAYER_NAME = "OLD MAN";

/**
 * The bosses whose top levels set the level caps (trainer class ids, pret trainer_constants;
 * the ROM reader reads their levels). Leader classes in badge order: the last leader's third
 * party is the gym one.
 */
export const BOSSES = {
  gyms: [[34, 0], [35, 0], [36, 0], [37, 0], [38, 0], [40, 0], [39, 0], [29, 2]] as [number, number][],
  elite: [44, 33, 46, 47],
  champion: 43,
};

const HM_NAMES = ["CUT", "FLY", "SURF", "STRENGTH", "FLASH"];

/** HMs a species can learn: bits 50–54 of the TM/HM field (+0x14) in its 28-byte base-stats entry. */
export function hmsLearnable(rom: Uint8Array, version: GameVersion, sp: SpeciesData | undefined): string[] {
  if (!sp) return [];
  const base = sp.dex === 151 && version !== "yellow" ? 0x425b : 0x383de + (sp.dex - 1) * 28;
  if (rom[base] !== sp.dex) return [];
  return HM_NAMES.filter((_, i) => (rom[base + 0x14 + ((50 + i) >> 3)] >> ((50 + i) & 7)) & 1);
}
