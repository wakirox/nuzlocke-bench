// Hard level caps for Crystal, as Gen 1's (src/games/gen1/hard-caps.ts): the harness rewrites the
// level in two of the game's own checks, in the emulator's loaded copy of the ROM only.
//
//   pokecrystal engine/battle/core.asm, GainExperience: `push bc` / `ld d, MAX_LEVEL` / `callfar CalcExpAtLevel`
//     — experience above that level's is cut back to it, so the level can't pass it.
//   pokecrystal engine/items/item_effects.asm, RareCandyEffect: `ld a, [hl]` / `cp MAX_LEVEL` / `jp nc, NoEffectMessage`
//     (already "at or above", so in the League a Pokémon over the cap gets no candies either).
//
// A Pokémon can be above the cap in Crystal (a gift or trade, a cap lower than before). Its
// experience is cut back to the cap's, its level from experience comes out below its level, and
// the level-up loop, which runs until the two are equal (`cp d` / `jp z`), counts up past 255 and
// back round: every move on the way is offered (run 7's Geodude was offered Selfdestruct up to
// Explosion). Two one-byte changes make the loops stop at "not higher" instead (`jp nc` / `jr nc`),
// in GainExperience and in the experience bar's animation: a Pokémon never levels down, and grows
// normally again once its experience passes its level.

import { findUnique } from "../gen1/hard-caps";
import type { RomAccess } from "../types";

export const MAX_LEVEL = 100;

const PATTERNS = {
  // ld [wCurSpecies], a / call GetBaseData / push bc / ld d, <level> / ld hl, CalcExpAtLevel / ld a, BANK / rst FarCall
  exp: { bytes: [0xea, null, null, 0xcd, null, null, 0xc5, 0x16, null, 0x21, null, null, 0x3e, null, 0xcf], at: 8 },
  // ld a, [hl] / cp <level> / jp nc, NoEffectMessage / inc a / ld [hl], a / ld [wCurPartyLevel], a
  // (without the last, the party-count check of the pack's add-item code matches too)
  candy: { bytes: [0x7e, 0xfe, null, 0xd2, null, null, 0x3c, 0x77, 0xea], at: 2 },
  // GainExperience: ld a, [hl] / cp MAX_LEVEL / jp nc, .next_mon / cp d / jp z (→ jp nc), .next_mon
  levelUp: { bytes: [0x7e, 0xfe, null, 0xd2, null, null, 0xba, null], at: 7 },
  // AnimateExpBar .LoopLevels: ld a, e / cp MAX_LEVEL / jr nc / cp d / jr z (→ jr nc), .FinishExpBar
  barLoop: { bytes: [0x7b, 0xfe, null, 0x30, null, 0xba, null], at: 6 },
};
const JP_NC = 0xd2;
const JR_NC = 0x30;

interface CapOffsets { exp: number; candy: number; levelUp: number; barLoop: number }

/** Where the patched bytes are in this ROM, or null if any can't be found exactly once. */
export function capOffsets(rom: Uint8Array): CapOffsets | null {
  const at = (k: keyof typeof PATTERNS) => {
    const i = findUnique(rom, PATTERNS[k].bytes);
    return i === null ? null : i + PATTERNS[k].at;
  };
  const [exp, candy, levelUp, barLoop] = [at("exp"), at("candy"), at("levelUp"), at("barLoop")];
  return exp === null || candy === null || levelUp === null || barLoop === null ? null : { exp, candy, levelUp, barLoop };
}

const known = new WeakMap<object, CapOffsets | null>();
function offsetsOf(gb: RomAccess): CapOffsets {
  if (!known.has(gb)) known.set(gb, capOffsets(gb.romBytes()));
  const o = known.get(gb);
  if (!o) throw new Error("Hard level caps: this Crystal ROM's experience routine wasn't found.");
  return o;
}

export const levelCapInRom = (gb: RomAccess) => gb.romBytes()[offsetsOf(gb).exp];
export const candyCapInRom = (gb: RomAccess) => gb.romBytes()[offsetsOf(gb).candy];

/** Makes `level` the highest level Rare Candies can reach. */
export function setCandyCapInRom(gb: RomAccess, level: number): void {
  gb.writeRom(offsetsOf(gb).candy, level);
}

/** Makes `level` the highest level experience and Rare Candies can reach (MAX_LEVEL: no cap). */
export function setLevelCapInRom(gb: RomAccess, level: number): void {
  const o = offsetsOf(gb);
  gb.writeRom(o.exp, level);
  gb.writeRom(o.candy, level);
  // No levelling down through the wrap (see above), whatever the cap.
  if (gb.romBytes()[o.levelUp] !== JP_NC) gb.writeRom(o.levelUp, JP_NC);
  if (gb.romBytes()[o.barLoop] !== JR_NC) gb.writeRom(o.barLoop, JR_NC);
}
