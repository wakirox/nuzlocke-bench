// Which people are on the map: a fake RAM laid out as the games lay it out (pret symbols). Off
// screen, a person the game has taken away must not count as standing there.

import { describe, expect, it } from "vitest";
import { closedGateSquares, spriteHidden, spriteRole, trainerSprites } from "../../../src/games/gen1/overworld";
import { addressesFor } from "../../../src/games/gen1/ram";
import type { MemoryReader } from "../../../src/games/types";
import type { GameVersion } from "../../../src/rom/types";

const ram = () => {
  const m = new Uint8Array(0x10000);
  const mem: MemoryReader = {
    read8: (a) => m[a & 0xffff],
    read16be: (a) => (m[a & 0xffff] << 8) | m[(a + 1) & 0xffff],
    readBytes: (a, n) => m.slice(a, a + n),
  };
  return { m, mem };
};

for (const version of ["red", "yellow"] as GameVersion[]) {
  const A = addressesFor(version);

  /** Lists slot 3 under global index 0x1b and slot 5 under 0x02; flag 0x1b is set (taken away). */
  const withList = () => {
    const { m, mem } = ram();
    m.set([3, 0x1b, 5, 0x02, 0xff], A.toggleableList);
    m[A.toggleableFlags + (0x1b >> 3)] = 1 << (0x1b & 7);
    return { m, mem };
  };

  describe(`spriteHidden (${version})`, () => {
    it("reads the flag of a listed person", () => {
      const { mem } = withList();
      expect(spriteHidden(mem, version, 3)).toBe(true);
      expect(spriteHidden(mem, version, 5)).toBe(false);
    });

    it("says no for a person the list doesn't name", () => {
      const { mem } = withList();
      expect(spriteHidden(mem, version, 4)).toBe(false);
    });

    it("stops at the end of the list, not at a stale entry past it", () => {
      const { m, mem } = withList();
      m.set([7, 0x1b], A.toggleableList + 3 * 2);
      expect(spriteHidden(mem, version, 7)).toBe(false);
    });

    it("gives up on a list with no end marker", () => {
      const { m, mem } = ram();
      m.fill(1, A.toggleableList, A.toggleableList + 64);
      expect(spriteHidden(mem, version, 2)).toBe(false);
    });
  });

  describe(`trainerSprites off screen (${version})`, () => {
    const trainer = (m: Uint8Array, slot: number, x: number, y: number) => {
      m[A.spriteData1 + slot * 16] = 1; // has a picture
      m[A.spriteData1 + slot * 16 + 2] = 0xff; // not drawn, as for anyone off screen
      m[A.spriteData2 + slot * 16 + 4] = y + 4;
      m[A.spriteData2 + slot * 16 + 5] = x + 4;
      m[A.mapSpriteExtra + (slot - 1) * 2] = 200 + 3; // a trainer class
    };

    it("keeps a trainer who is only out of view, drops one the game took away", () => {
      const { m, mem } = withList();
      trainer(m, 3, 30, 30);
      trainer(m, 5, 31, 30);
      expect(trainerSprites(mem, version, 0, 0).map((t) => t.index)).toEqual([5]);
    });
  });
}

describe("closedGateSquares", () => {
  const mapAt = 0xc6e8, width = 15, stride = width + 6;
  const mem = (blocks: [number, number, number][]) => {
    const A = addressesFor("red");
    const bytes = new Map<number, number>([[A.curMapWidth, width]]);
    for (let r = 0; r < 20; r++) for (let c = 0; c < 20; c++) bytes.set(mapAt + (r + 3) * stride + c + 3, 0x0e);
    for (const [r, c, b] of blocks) bytes.set(mapAt + (r + 3) * stride + c + 3, b);
    return { read8: (a: number) => bytes.get(a) ?? 0 } as unknown as MemoryReader;
  };

  it("gives a closed gate's four squares, and nothing while it's open", () => {
    expect(closedGateSquares(mem([]), "red", "POKEMON_MANSION_3F")).toEqual([]);
    expect(closedGateSquares(mem([[2, 7, 0x5f]]), "red", "POKEMON_MANSION_3F")).toEqual([[14, 4], [15, 4], [14, 5], [15, 5]]);
  });

  it("knows the hideout's two locked doors, closed until they open into the floor block", () => {
    expect(closedGateSquares(mem([[8, 12, 0x2d]]), "red", "ROCKET_HIDEOUT_B1F")).toEqual([[24, 16], [25, 16], [24, 17], [25, 17]]);
    expect(closedGateSquares(mem([[5, 12, 0x2d]]), "red", "ROCKET_HIDEOUT_B4F")).toEqual([[24, 10], [25, 10], [24, 11], [25, 11]]);
    expect(closedGateSquares(mem([]), "red", "ROCKET_HIDEOUT_B4F")).toEqual([]);
  });

  it("knows Silph Co's card-key doors: closed while the locked block is there", () => {
    expect(closedGateSquares(mem([[2, 2, 0x54], [5, 2, 0x54]]), "red", "SILPH_CO_2F")).toEqual([[4, 4], [5, 4], [4, 5], [5, 5], [4, 10], [5, 10], [4, 11], [5, 11]]);
    expect(closedGateSquares(mem([[2, 2, 0x54]]), "red", "SILPH_CO_2F")).toEqual([[4, 4], [5, 4], [4, 5], [5, 5]]);
    expect(closedGateSquares(mem([]), "red", "SILPH_CO_11F")).toEqual([]);
  });

  it("knows the last gym's gates", () => {
    expect(closedGateSquares(mem([[3, 9, 0x2d]]), "red", "CINNABAR_GYM")).toEqual([[18, 6], [19, 6], [18, 7], [19, 7]]);
  });

  it("knows the last cave's barriers, with their own open block", () => {
    const squares = [[8, 12], [9, 12], [8, 13], [9, 13]];
    expect(closedGateSquares(mem([[6, 4, 0x07]]), "red", "VICTORY_ROAD_1F")).toEqual(squares);
    expect(closedGateSquares(mem([[6, 4, 0x1d]]), "red", "VICTORY_ROAD_1F")).toEqual([]);
  });

  it("ignores other maps", () => {
    expect(closedGateSquares(mem([[2, 7, 0x5f]]), "red", "OTHER_MAP")).toEqual([]);
  });
});

describe("spriteRole", () => {
  // A 4-bank ROM: SwitchToMapRomBank in bank 0 points at MapHeaderBanks (bank 3, 0x4200), which puts
  // map 5 in bank 2. Its text table at 0x4100: text 1 a shop, text 2 the nurse, text 3 talk.
  const rom = new Uint8Array(4 * 0x4000);
  const at = (bank: number, addr: number) => bank * 0x4000 + (addr - 0x4000);
  rom.set([0x3e, 0x03, 0xcd, 0x00, 0x00, 0x21, 0x00, 0x42, 0x09, 0x7e, 0xe0, 0xe8], 0x100);
  rom[at(3, 0x4200) + 5] = 2;
  rom.set([0x00, 0x42, 0x10, 0x42, 0x20, 0x42], at(2, 0x4100));
  rom.set([0xfe, 0x02, 0x13, 0x14, 0xff], at(2, 0x4200)); // script_mart SUPER_POTION, POTION
  rom[at(2, 0x4210)] = 0xff; // the nurse's script
  rom.set([0x00, 0x8f, 0x80, 0x57], at(2, 0x4220)); // ordinary text
  // The same table bytes in bank 1 lead nowhere useful: only the map's own bank counts.
  rom.set([0x10, 0x42], at(1, 0x4100));
  rom[at(1, 0x4210)] = 0xfe;
  const memFor = (version: GameVersion, textIdOfSprite1: number, map = 5) => {
    const A = addressesFor(version);
    const bytes = new Map<number, number>([[A.mapTextPtr, 0x00], [A.mapTextPtr + 1, 0x41], [A.mapSpriteData + 1, textIdOfSprite1], [A.curMap, map]]);
    return { read8: (a: number) => bytes.get(a) ?? 0 } as unknown as MemoryReader;
  };

  it("knows the shop clerk and the nurse by their texts, in the map's own bank", () => {
    expect(spriteRole(memFor("red", 1), rom, "red", 1)).toBe("shop");
    expect(spriteRole(memFor("yellow", 2), rom, "yellow", 1)).toBe("nurse");
  });

  it("leaves people who only talk, sprites with no text and maps in another bank", () => {
    expect(spriteRole(memFor("red", 3), rom, "red", 1)).toBeNull();
    expect(spriteRole(memFor("red", 0), rom, "red", 1)).toBeNull();
    expect(spriteRole(memFor("red", 1, 6), rom, "red", 1)).toBeNull(); // map 6: bank 0, no table there
  });

  it("marks nothing when the game's map-bank lookup isn't found", () => {
    expect(spriteRole(memFor("red", 1), new Uint8Array(4 * 0x4000), "red", 1)).toBeNull();
  });
});
