// Gen 1 trainer parties from the ROM (pret data/trainers/parties.asm): per class a list of
// parties, each either "level, species…, 0" or "$FF, (level, species)…, 0".

import type { GameVersion } from "../../rom/types";

/** TrainerDataPointers (bank $0E), English ROMs. */
const PARTY_POINTERS: Record<"rb" | "y", number> = { rb: 0x39d3b, y: 0x39dd1 };

/** Gen 1 trainer classes (ids 1..47; OPP_ ids are these + 200). Names come from the ROM (TrackerData.trainerClasses). */
export const TRAINER_CLASS_COUNT = 47;

/** Party of trainer `number` (1-based) of class `cls`, or null if out of range. */
export function trainerParty(rom: Uint8Array, version: GameVersion, cls: number, number: number): { species: number; level: number }[] | null {
  if (cls < 1 || cls > TRAINER_CLASS_COUNT || number < 1) return null;
  const table = PARTY_POINTERS[version === "yellow" ? "y" : "rb"];
  const ptr = rom[table + (cls - 1) * 2] | (rom[table + (cls - 1) * 2 + 1] << 8);
  let off = 0x0e * 0x4000 + (ptr - 0x4000);
  const end = Math.min(rom.length, off + 0x800);
  for (let n = 1; n < number; n++) {
    if (rom[off] === 0xff) {
      off++;
      while (off < end && rom[off] !== 0) off += 2;
    } else {
      off++;
      while (off < end && rom[off] !== 0) off++;
    }
    off++;
    if (off >= end) return null;
  }
  const party: { species: number; level: number }[] = [];
  if (rom[off] === 0xff) {
    for (off++; off < end && rom[off] !== 0 && party.length < 6; off += 2) party.push({ level: rom[off], species: rom[off + 1] });
  } else {
    const level = rom[off];
    for (off++; off < end && rom[off] !== 0 && party.length < 6; off++) party.push({ level, species: rom[off] });
  }
  return party.length ? party : null;
}
