// Crystal's PC boxes in cartridge RAM: the current box counts catches; junk boxes are ignored.

import { describe, expect, it } from "vitest";
import { CURRENT_BOX, currentBoxCount, readPcMons } from "../../../src/games/gen2/boxes";

/** A box at `base`: these species, each mon with an OT id, DVs and level. */
function putBox(ram: Uint8Array, base: number, species: number[]) {
  ram[base] = species.length;
  species.forEach((sp, i) => {
    ram[base + 1 + i] = sp;
    const m = base + 22 + i * 32;
    ram[m] = sp;
    ram.set([0xee, 0xc5], m + 6);
    ram.set([0x97, i], m + 21);
    ram[m + 31] = 5 + i;
  });
  ram[base + 1 + species.length] = 0xff;
}

describe("Crystal PC boxes", () => {
  it("counts the current box and reads every box that adds up", () => {
    const ram = new Uint8Array(0x8000);
    putBox(ram, CURRENT_BOX, [161]);
    putBox(ram, 2 * 0x2000 + 0x450, [16, 19]); // box 2
    expect(currentBoxCount(ram)).toBe(1);
    expect(readPcMons(ram, 0)).toEqual([
      { species: 161, uid: "eec59700", level: 5 },
      { species: 16, uid: "eec59700", level: 5 },
      { species: 19, uid: "eec59701", level: 6 },
    ]);
  });

  it("ignores boxes that don't add up (before the first save they hold junk)", () => {
    const ram = new Uint8Array(0x8000).fill(0x07); // a count of 7 with no species list behind it
    expect(currentBoxCount(ram)).toBe(0);
    expect(readPcMons(ram, 0)).toEqual([]);
  });

  it("skips the current box's stale numbered copy", () => {
    const ram = new Uint8Array(0x8000);
    putBox(ram, CURRENT_BOX, [161]);
    putBox(ram, 2 * 0x2000, [161]); // box 1, the current one's old copy
    expect(readPcMons(ram, 0)).toHaveLength(1);
  });

  it("reads a box holding an egg (EGG in the list, the species in its data) and leaves the egg out", () => {
    const ram = new Uint8Array(0x8000);
    putBox(ram, CURRENT_BOX, [79, 175]);
    ram[CURRENT_BOX + 2] = 0xfd; // the second is an egg
    expect(currentBoxCount(ram)).toBe(2);
    expect(readPcMons(ram, 0).map((m) => m.species)).toEqual([79]);
  });
});
