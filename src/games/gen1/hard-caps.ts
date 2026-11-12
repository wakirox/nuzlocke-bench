// Hard level caps (a Hardcore Nuzlocke option): a Pokémon at the level cap gains no more levels,
// by the game's own code. Gen 1 already stops experience at MAX_LEVEL (100); the harness rewrites
// that one value in the loaded ROM to the current cap, and the in-game Rare Candy's own check too.
//
//   pokered engine/battle/experience.asm, GainExperience: `ld d, MAX_LEVEL` / `callfar CalcExperience`
//     — experience above that level's is cut back to it, so the level can't pass it.
//   pokered engine/items/item_effects.asm, ItemUseVitamin .useRareCandy: `cp MAX_LEVEL` / `jr z, .vitaminNoEffect`.
//
// The ROM file and the recording's ROM stay as they were: only the emulator's loaded copy changes,
// recorded as a named intervention (KIND_LEVEL_CAP in replay.ts) so playback does the same.

import type { RomAccess } from "../types";

export const MAX_LEVEL = 100;
const JR_NC = 0x30;

/** Byte patterns (null = any byte); `at` is where the level value sits from the match's start. */
const PATTERNS = {
  // ld [wCurSpecies], a / call GetMonHeader / ld d, <level> / ld hl, CalcExperience / ld b, BANK / call Bankswitch / ldh a, [hExperience]
  exp: { bytes: [0xea, null, null, 0xcd, null, null, 0x16, null, 0x21, null, null, 0x06, null, 0xcd, null, null, 0xf0], at: 7 },
  // add hl, bc / ld a, [hl] / cp <level> / jr z, .vitaminNoEffect / inc a / ld [hl], a
  candy: { bytes: [0x09, 0x7e, 0xfe, null, 0x28, null, 0x3c, 0x77], at: 3 },
};

export function findUnique(rom: Uint8Array, bytes: (number | null)[]): number | null {
  let found: number | null = null;
  outer: for (let i = 0; i + bytes.length <= rom.length; i++) {
    for (let k = 0; k < bytes.length; k++) if (bytes[k] !== null && rom[i + k] !== bytes[k]) continue outer;
    if (found !== null) return null; // not unique: don't guess
    found = i;
  }
  return found;
}

export interface CapOffsets {
  exp: number;
  candy: number;
}

/** Where the two level values are in this ROM, or null if they can't be found exactly once each. */
export function capOffsets(rom: Uint8Array): CapOffsets | null {
  const exp = findUnique(rom, PATTERNS.exp.bytes);
  const candy = findUnique(rom, PATTERNS.candy.bytes);
  return exp === null || candy === null ? null : { exp: exp + PATTERNS.exp.at, candy: candy + PATTERNS.candy.at };
}

const known = new WeakMap<object, CapOffsets | null>();
function offsetsOf(gb: RomAccess): CapOffsets {
  if (!known.has(gb)) known.set(gb, capOffsets(gb.romBytes()));
  const o = known.get(gb);
  if (!o) throw new Error("Hard level caps: this ROM's experience routine wasn't found (only Red, Blue and Yellow are supported).");
  return o;
}

/** The level experience and Rare Candies currently stop at (MAX_LEVEL when no cap is set). */
export function levelCapInRom(gb: RomAccess): number {
  return gb.romBytes()[offsetsOf(gb).exp];
}

/** The level Rare Candies currently stop at. */
export function candyCapInRom(gb: RomAccess): number {
  return gb.romBytes()[offsetsOf(gb).candy];
}

/**
 * Makes `level` the highest level Rare Candies can reach, whatever experience does (in the League
 * experience may pass the cap, so a Pokémon can be over it: `jr z` becomes `jr nc`, at or above).
 */
export function setCandyCapInRom(gb: RomAccess, level: number): void {
  const o = offsetsOf(gb);
  gb.writeRom(o.candy, level);
  gb.writeRom(o.candy + 1, JR_NC);
}

/** Makes `level` the highest level experience and Rare Candies can reach (MAX_LEVEL: no cap). */
export function setLevelCapInRom(gb: RomAccess, level: number): void {
  const o = offsetsOf(gb);
  gb.writeRom(o.exp, level);
  gb.writeRom(o.candy, level);
}
