// Static Gen 2 (Crystal) knowledge the tracker needs: type chart, items, badges, bosses, rules.
// Ids and names from pret/pokecrystal (constants/*.asm).

import type { SpeciesData } from "../../rom/types";

/** Gen 2's special types: Dark joins them (Steel is physical). */
export const SPECIAL_TYPES = new Set(["FIRE", "WATER", "GRASS", "ELECTRIC", "ICE", "PSYCHIC", "DRAGON", "DARK"]);

// Gen 2 chart (data/types/type_matchups.asm): Ghost hits Psychic, Bug/Poison and Ice/Fire fixed.
const CHART: Record<string, Record<string, number>> = {
  NORMAL: { ROCK: 0.5, GHOST: 0, STEEL: 0.5 },
  FIRE: { FIRE: 0.5, WATER: 0.5, GRASS: 2, ICE: 2, BUG: 2, ROCK: 0.5, DRAGON: 0.5, STEEL: 2 },
  WATER: { FIRE: 2, WATER: 0.5, GRASS: 0.5, GROUND: 2, ROCK: 2, DRAGON: 0.5 },
  ELECTRIC: { WATER: 2, ELECTRIC: 0.5, GRASS: 0.5, GROUND: 0, FLYING: 2, DRAGON: 0.5 },
  GRASS: { FIRE: 0.5, WATER: 2, GRASS: 0.5, POISON: 0.5, GROUND: 2, FLYING: 0.5, BUG: 0.5, ROCK: 2, DRAGON: 0.5, STEEL: 0.5 },
  ICE: { FIRE: 0.5, WATER: 0.5, GRASS: 2, ICE: 0.5, GROUND: 2, FLYING: 2, DRAGON: 2, STEEL: 0.5 },
  FIGHTING: { NORMAL: 2, ICE: 2, POISON: 0.5, FLYING: 0.5, PSYCHIC: 0.5, BUG: 0.5, ROCK: 2, GHOST: 0, DARK: 2, STEEL: 2 },
  POISON: { GRASS: 2, POISON: 0.5, GROUND: 0.5, ROCK: 0.5, GHOST: 0.5, STEEL: 0 },
  GROUND: { FIRE: 2, ELECTRIC: 2, GRASS: 0.5, POISON: 2, FLYING: 0, BUG: 0.5, ROCK: 2, STEEL: 2 },
  FLYING: { ELECTRIC: 0.5, GRASS: 2, FIGHTING: 2, BUG: 2, ROCK: 0.5, STEEL: 0.5 },
  PSYCHIC: { FIGHTING: 2, POISON: 2, PSYCHIC: 0.5, DARK: 0, STEEL: 0.5 },
  BUG: { FIRE: 0.5, GRASS: 2, FIGHTING: 0.5, POISON: 0.5, FLYING: 0.5, PSYCHIC: 2, GHOST: 0.5, DARK: 2, STEEL: 0.5 },
  ROCK: { FIRE: 2, ICE: 2, FIGHTING: 0.5, GROUND: 0.5, FLYING: 2, BUG: 2, STEEL: 0.5 },
  GHOST: { NORMAL: 0, PSYCHIC: 2, GHOST: 2, DARK: 0.5, STEEL: 0.5 },
  DRAGON: { DRAGON: 2, STEEL: 0.5 },
  DARK: { FIGHTING: 0.5, PSYCHIC: 2, GHOST: 2, DARK: 0.5, STEEL: 0.5 },
  STEEL: { FIRE: 0.5, WATER: 0.5, ELECTRIC: 0.5, ICE: 2, ROCK: 2, STEEL: 0.5 },
};

export function effectiveness(moveType: string, defenderTypes: string[]): number {
  return defenderTypes.reduce((m, t) => m * (CHART[moveType]?.[t] ?? 1), 1);
}

/**
 * Fixed-damage moves (constants/move_constants.asm): Sonic Boom, Counter, Seismic Toss, Dragon Rage,
 * Night Shade, Bide, Psywave, Super Fang, Mirror Coat. Other power-1 moves vary their power and use
 * the type chart.
 */
export const FIXED_DAMAGE_MOVES = new Set([0x31, 0x44, 0x45, 0x52, 0x65, 0x75, 0x95, 0xa2, 0xf3]);

/** Item ids (constants/item_constants.asm). */
export const ITEM = {
  MASTER_BALL: 1, ULTRA_BALL: 2, GREAT_BALL: 4, POKE_BALL: 5,
  ANTIDOTE: 9, BURN_HEAL: 10, ICE_HEAL: 11, AWAKENING: 12, PARLYZ_HEAL: 13,
  FULL_RESTORE: 14, MAX_POTION: 15, HYPER_POTION: 16, SUPER_POTION: 17, POTION: 18,
  MAX_ELIXER: 21, RARE_CANDY: 32, FULL_HEAL: 38, REVIVE: 39, MAX_REVIVE: 40,
  FRESH_WATER: 46, SODA_POP: 47, LEMONADE: 48, ETHER: 63, MAX_ETHER: 64, ELIXER: 65,
  MOOMOO_MILK: 72, PSNCUREBERRY: 74, PRZCUREBERRY: 78, BURNT_BERRY: 79, ICE_BERRY: 80,
  BITTER_BERRY: 83, MINT_BERRY: 84, MIRACLEBERRY: 109, RAGECANDYBAR: 114,
  ENERGYPOWDER: 121, ENERGY_ROOT: 122, HEAL_POWDER: 123, BERRY_JUICE: 139, MYSTERYBERRY: 150,
  SACRED_ASH: 156, HEAVY_BALL: 157, LEVEL_BALL: 159, LURE_BALL: 160, FAST_BALL: 161,
  FRIEND_BALL: 164, MOON_BALL: 165, LOVE_BALL: 166, BERRY: 173, GOLD_BERRY: 174, PARK_BALL: 177,
} as const;

/** HP restored by each healing item; Infinity = full heal. */
export const HEAL_AMOUNTS: Record<number, number> = {
  [ITEM.POTION]: 20, [ITEM.SUPER_POTION]: 50, [ITEM.HYPER_POTION]: 200,
  [ITEM.MAX_POTION]: Infinity, [ITEM.FULL_RESTORE]: Infinity,
  [ITEM.FRESH_WATER]: 50, [ITEM.SODA_POP]: 60, [ITEM.LEMONADE]: 80, [ITEM.MOOMOO_MILK]: 100,
  [ITEM.RAGECANDYBAR]: 20, [ITEM.ENERGYPOWDER]: 50, [ITEM.ENERGY_ROOT]: 200,
  [ITEM.BERRY]: 10, [ITEM.GOLD_BERRY]: 30, [ITEM.BERRY_JUICE]: 20,
};
export const STATUS_HEALS = new Set<number>([
  ITEM.ANTIDOTE, ITEM.BURN_HEAL, ITEM.ICE_HEAL, ITEM.AWAKENING, ITEM.PARLYZ_HEAL, ITEM.FULL_HEAL,
  ITEM.HEAL_POWDER, ITEM.PSNCUREBERRY, ITEM.PRZCUREBERRY, ITEM.BURNT_BERRY, ITEM.ICE_BERRY,
  ITEM.BITTER_BERRY, ITEM.MINT_BERRY, ITEM.MIRACLEBERRY,
]);
export const PP_RESTORES = new Set<number>([ITEM.ETHER, ITEM.MAX_ETHER, ITEM.ELIXER, ITEM.MAX_ELIXER, ITEM.MYSTERYBERRY]);
export const REVIVES = new Set<number>([ITEM.REVIVE, ITEM.MAX_REVIVE, ITEM.SACRED_ASH]);
export const BALLS = new Set<number>([
  ITEM.MASTER_BALL, ITEM.ULTRA_BALL, ITEM.GREAT_BALL, ITEM.POKE_BALL, ITEM.HEAVY_BALL, ITEM.LEVEL_BALL,
  ITEM.LURE_BALL, ITEM.FAST_BALL, ITEM.FRIEND_BALL, ITEM.MOON_BALL, ITEM.LOVE_BALL, ITEM.PARK_BALL,
]);

/**
 * The run's badges: Johto's eight (wJohtoBadges, bit order). The run ends at the Hall of Fame,
 * before Kanto, so Kanto's badges aren't part of it.
 */
export const BADGES = ["Badge 1", "Badge 2", "Badge 3", "Badge 4", "Badge 5", "Badge 6", "Badge 7", "Badge 8"];

/** Status byte, as Gen 1: sleep counter in bits 0-2, then PSN, BRN, FRZ, PAR. */
export const STATUS_POISON = 0x08;
export const statusName = (status: number): string | null => {
  if (status & 0x07) return "SLP";
  if (status & 0x08) return "PSN";
  if (status & 0x10) return "BRN";
  if (status & 0x20) return "FRZ";
  if (status & 0x40) return "PAR";
  return null;
};

export const isPokecenter = (c: string) => /_POKECENTER_1F$/.test(c);

/** The rooms past the first Elite Four member (Will): once there, the League's battles have begun. */
export const LEAGUE_UNDERWAY_MAPS = ["KOGAS_ROOM", "BRUNOS_ROOM", "KARENS_ROOM", "LANCES_ROOM"];

/**
 * The bosses whose top levels set the level caps (trainer classes, constants/trainer_constants.asm).
 * Gym leaders in badge order (Zephyr … Rising): Falkner, Bugsy, Whitney, Morty, Chuck, Jasmine,
 * Pryce, Clair; the Elite Four: Will, Koga, Bruno, Karen; the Champion: Lance.
 */
export const BOSSES = {
  gyms: [[1, 0], [3, 0], [2, 0], [4, 0], [7, 0], [6, 0], [5, 0], [8, 0]] as [number, number][],
  elite: [11, 15, 13, 14],
  champion: 16,
};

/** Base data in ROM (BaseData, bank $14): 32 bytes a species, its TM/HM bit field at +$18. */
const BASE_DATA = 0x14 * 0x4000 + (0x5424 - 0x4000);
const HM_NAMES = ["CUT", "FLY", "SURF", "STRENGTH", "FLASH", "WHIRLPOOL", "WATERFALL"];
/** TMs 1-50 come first in the bit field, then the HMs. */
const FIRST_HM_BIT = 50;

/** HMs a species can learn, from its base data's TM/HM bits. */
export function hmsLearnable(rom: Uint8Array, sp: SpeciesData | undefined): string[] {
  if (!sp) return [];
  const base = BASE_DATA + (sp.dex - 1) * 32;
  if (rom[base] !== sp.dex) return [];
  return HM_NAMES.filter((_, i) => (rom[base + 0x18 + ((FIRST_HM_BIT + i) >> 3)] >> ((FIRST_HM_BIT + i) & 7)) & 1);
}
