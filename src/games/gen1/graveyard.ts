// Hardcore Nuzlocke: a Pokémon that dies is moved out of the party into the
// last PC box (Box 12), the way depositing it would — so it can't battle again
// by accident, yet stays in the game.
//
// Gen 1 keeps only the current box in WRAM; boxes 1-6 live in SRAM bank 2 and
// 7-12 in bank 3 (pret/pokered sram.asm), each with per-box and per-bank
// checksums. Box 12 is written straight into cartridge RAM.

import type { GameVersion } from "../../rom/types";
import type { BoxRam, MemoryWriter } from "../types";
import { BOX_CAPACITY, BOX_MON, BOX_SIZE, BOXES_READY, LAST_BOX, boxBase } from "./boxes";
import { addressesFor } from "./ram";

const PARTY_MON = 44;
const NAME = 11;

export type BurialResult = "box" | "full";

/** Moves party slot `slot` (not the only Pokémon) into Box 12. */
export function buryInLastBox(gb: MemoryWriter & BoxRam, version: GameVersion, slot: number): BurialResult {
  const A = addressesFor(version);
  const count = gb.read8(A.partyCount);
  if (slot < 0 || slot >= count || count < 2) throw new Error("Nothing to bury");
  const otNames = A.partyMons + 6 * PARTY_MON;
  // Mid-script the game bumps the count and species list before writing the new
  // Pokémon's data: don't act on a slot whose data doesn't match its species yet.
  if (gb.read8(A.partySpecies + slot) !== gb.read8(A.partyMons + slot * PARTY_MON)) throw new Error("Party slot is being rewritten");

  // The Pokémon in box format.
  const mon = Array.from(gb.readBytes(A.partyMons + slot * PARTY_MON, BOX_MON));
  mon[3] = gb.read8(A.partyMons + slot * PARTY_MON + 33); // box level = level
  const ot = Array.from(gb.readBytes(otNames + slot * NAME, NAME));
  const nick = Array.from(gb.readBytes(A.partyNicks + slot * NAME, NAME));
  const species = mon[0];

  let stored = false;
  const boxNum = gb.read8(A.curBoxNum);
  if ((boxNum & 0x7f) === LAST_BOX) {
    // Box 12 is the current box: it lives in WRAM.
    const n = gb.read8(A.boxCount);
    if (n < BOX_CAPACITY) {
      const sp = A.boxCount + 1;
      const mons = sp + 21;
      writeEntry((addr, v) => gb.write8(addr, v), { count: A.boxCount, species: sp, mons, ot: mons + BOX_CAPACITY * BOX_MON,
        nicks: mons + BOX_CAPACITY * BOX_MON + BOX_CAPACITY * NAME }, n, species, mon, ot, nick);
      stored = true;
    }
  } else {
    const sram = gb.getExtRam();
    if (!(boxNum & BOXES_READY)) {
      // Never changed boxes: the game would empty every SRAM box first. Do the same.
      for (let b = 0; b < 12; b++) {
        const base = boxBase(b);
        sram[base] = 0;
        sram[base + 1] = 0xff;
      }
      gb.write8(A.curBoxNum, boxNum | BOXES_READY);
    }
    const base = boxBase(LAST_BOX);
    const n = sram[base];
    if (n < BOX_CAPACITY) {
      const mons = base + 22;
      writeEntry((addr, v) => (sram[addr] = v), { count: base, species: base + 1, mons, ot: mons + BOX_CAPACITY * BOX_MON,
        nicks: mons + BOX_CAPACITY * BOX_MON + BOX_CAPACITY * NAME }, n, species, mon, ot, nick);
      stored = true;
    }
    for (const bank of [2, 3]) fixChecksums(sram, bank);
    gb.loadExtRam(sram);
  }

  removeFromParty(gb, version, slot);
  return stored ? "box" : "full";
}

function writeEntry(
  put: (addr: number, v: number) => void,
  at: { count: number; species: number; mons: number; ot: number; nicks: number },
  n: number, species: number, mon: number[], ot: number[], nick: number[],
): void {
  put(at.count, n + 1);
  put(at.species + n, species);
  put(at.species + n + 1, 0xff);
  mon.forEach((v, i) => put(at.mons + n * BOX_MON + i, v));
  ot.forEach((v, i) => put(at.ot + n * NAME + i, v));
  nick.forEach((v, i) => put(at.nicks + n * NAME + i, v));
}

/** Gen 1 checksum: complement of the byte sum. Per bank: all six boxes, then each box. */
function fixChecksums(sram: Uint8Array, bank: number): void {
  const start = bank * 0x2000;
  const sum = (from: number, len: number) => {
    let s = 0;
    for (let i = 0; i < len; i++) s += sram[from + i];
    return ~s & 0xff;
  };
  sram[start + 6 * BOX_SIZE] = sum(start, 6 * BOX_SIZE);
  for (let b = 0; b < 6; b++) sram[start + 6 * BOX_SIZE + 1 + b] = sum(start + b * BOX_SIZE, BOX_SIZE);
}

/** Deletes a party slot, shifting the rest up (species list, mons, OT names, nicknames). */
function removeFromParty(gb: MemoryWriter, version: GameVersion, slot: number): void {
  const A = addressesFor(version);
  const count = gb.read8(A.partyCount);
  const otNames = A.partyMons + 6 * PARTY_MON;
  const shift = (base: number, size: number) => {
    for (let i = slot; i < count - 1; i++) {
      const next = gb.readBytes(base + (i + 1) * size, size);
      next.forEach((v, j) => gb.write8(base + i * size + j, v));
    }
  };
  shift(A.partySpecies, 1);
  shift(A.partyMons, PARTY_MON);
  shift(otNames, NAME);
  shift(A.partyNicks, NAME);
  gb.write8(A.partySpecies + count - 1, 0xff);
  gb.write8(A.partyCount, count - 1);
  // Wipe the freed last slot so its stale bytes never pass for a Pokémon (e.g. the dead
  // one's, read back while the game is writing a gift into that slot).
  for (let j = 0; j < PARTY_MON; j++) gb.write8(A.partyMons + (count - 1) * PARTY_MON + j, 0);
  for (let j = 0; j < NAME; j++) {
    gb.write8(otNames + (count - 1) * NAME + j, 0x50);
    gb.write8(A.partyNicks + (count - 1) * NAME + j, 0x50);
  }
}
