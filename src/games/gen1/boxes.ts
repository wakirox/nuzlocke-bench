// Gen 1 PC boxes. Only the current box is in WRAM; boxes 1-6 live in SRAM bank 2 and 7-12
// in bank 3 (pret/pokered sram.asm). A box: count, species[20]+terminator, mons[20] (the first
// 33 bytes of a party struct), OT names[20], nicknames[20].

import type { PcMon } from "../types";

export const BOX_MON = 33;
export const BOX_CAPACITY = 20;
const NAME = 11;
export const BOX_SIZE = 1 + 21 + BOX_CAPACITY * BOX_MON + BOX_CAPACITY * NAME * 2; // 0x462
export const LAST_BOX = 11;
/** wCurrentBoxNum bit 7: the SRAM boxes were set up (on the first box change). */
export const BOXES_READY = 0x80;

/** File offset of box b (0-11) in the 32 KB cartridge RAM. */
export function boxBase(b: number): number {
  return (2 + Math.floor(b / 6)) * 0x2000 + (b % 6) * BOX_SIZE;
}

/**
 * Every Pokémon in the PC: the current box from WRAM (`boxCount` is its address), the others
 * from cartridge RAM. Before the boxes were set up only the current box holds anything.
 */
export function readPcMons(
  read8: (addr: number) => number,
  readBytes: (addr: number, len: number) => Uint8Array,
  extRam: Uint8Array | null,
  at: { boxCount: number; curBoxNum: number },
): PcMon[] {
  const out: PcMon[] = [];
  const box = (count: number, mons: (i: number) => Uint8Array) => {
    for (let i = 0; i < Math.min(count, BOX_CAPACITY); i++) {
      const b = mons(i);
      if (b[0]) out.push({ species: b[0], uid: [b[12], b[13], b[27], b[28]].map((x) => x.toString(16).padStart(2, "0")).join(""), level: b[3] });
    }
  };
  const boxNum = read8(at.curBoxNum);
  box(read8(at.boxCount), (i) => readBytes(at.boxCount + 22 + i * BOX_MON, BOX_MON));
  if (!extRam || !(boxNum & BOXES_READY)) return out;
  for (let b = 0; b < 12; b++) {
    // The current box's SRAM copy is stale until the next box change.
    if (b === (boxNum & 0x7f)) continue;
    const base = boxBase(b);
    if (base + BOX_SIZE > extRam.length) break;
    box(extRam[base], (i) => extRam.subarray(base + 22 + i * BOX_MON, base + 22 + (i + 1) * BOX_MON));
  }
  return out;
}
