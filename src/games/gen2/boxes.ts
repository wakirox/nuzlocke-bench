// Crystal's PC boxes, all in cartridge RAM (pret pokecrystal sram.asm): the current box at sBox
// (bank 1, $AD10), boxes 1-7 at sBox1 (bank 2) and 8-14 at sBox8 (bank 3), $450 apart. A box:
// count, species[20]+terminator, mons[20] (32-byte box structs), OT names, nicknames.

import type { PcMon } from "../types";

const BOX_MON = 32;
const BOX_CAPACITY = 20;
const BOXES = 14;
/** The species list's mark for an egg (EGG in pokecrystal's constants). */
const EGG = 0xfd;
/** Cartridge-RAM offset of the current box (sBox). */
export const CURRENT_BOX = 1 * 0x2000 + (0xad10 - 0xa000);

/** Cartridge-RAM offset of numbered box b (0-13). */
const boxBase = (b: number) => (2 + Math.floor(b / 7)) * 0x2000 + (b % 7) * 0x450;

/** How many Pokémon the current box holds (a catch with a full party goes there). */
export const currentBoxCount = (extRam: Uint8Array | null) => (extRam && wellFormed(extRam, CURRENT_BOX) ? extRam[CURRENT_BOX] : 0);

/** A box that adds up: count 0-20, its species list ended right after, each species its mon's. */
function wellFormed(extRam: Uint8Array, base: number): boolean {
  const n = extRam[base];
  if (n > BOX_CAPACITY || extRam[base + 1 + n] !== 0xff) return false;
  for (let i = 0; i < n; i++) {
    const sp = extRam[base + 1 + i];
    const mon = extRam[base + 22 + i * BOX_MON];
    // An egg is EGG ($FD) in the species list and the species it hatches into in its data.
    if (sp === EGG ? mon < 1 || mon > 251 : sp < 1 || sp > 251 || mon !== sp) return false;
  }
  return true;
}

/**
 * Every Pokémon in the PC: the current box, then the numbered boxes except the current one's
 * stale copy. Box struct: species, item, moves, OT id (6-7), exp, stat exp, DVs (21-22), … level (31).
 */
export function readPcMons(extRam: Uint8Array, currentBox: number): PcMon[] {
  const out: PcMon[] = [];
  const box = (base: number) => {
    for (let i = 0; i < Math.min(extRam[base], BOX_CAPACITY); i++) {
      if (extRam[base + 1 + i] === EGG) continue; // an egg isn't a Pokémon yet
      const b = extRam.subarray(base + 22 + i * BOX_MON, base + 22 + (i + 1) * BOX_MON);
      if (b[0]) out.push({ species: b[0], uid: [b[6], b[7], b[21], b[22]].map((x) => x.toString(16).padStart(2, "0")).join(""), level: b[31] });
    }
  };
  if (wellFormed(extRam, CURRENT_BOX)) box(CURRENT_BOX);
  for (let b = 0; b < BOXES; b++) {
    if (b === currentBox) continue;
    if (boxBase(b) + 22 + BOX_CAPACITY * BOX_MON > extRam.length) break;
    // The numbered boxes are cleared on the first save (EraseBoxes): before it they hold
    // whatever the cartridge RAM held. Only a box that adds up is read.
    if (wellFormed(extRam, boxBase(b))) box(boxBase(b));
  }
  return out;
}
