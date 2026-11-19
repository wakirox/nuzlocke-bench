// Crystal's text map: squares by collision type, and trainer parties from the ROM's trainer groups.

import { describe, expect, it } from "vitest";
import { trainerFacing } from "../../../src/bridge/overworld";
import { carpetPush, classify, classifyAt, hideUnloadedOnScreen, isDoorCollision, mapDoors, OW, sideWallBlocks, onAtThisTime, trainerParty, trainerSprites } from "../../../src/games/gen2/overworld";
import { A } from "../../../src/games/gen2/ram";

/** A ROM with CollisionPermissionTable (bank $13) saying water for $29 and wall for $07, land otherwise. */
function romWithPermissions(): Uint8Array {
  const rom = new Uint8Array(0x80000);
  const table = 0x13 * 0x4000 + (0x4e1f - 0x4000);
  rom[table + 0x29] = 0x01;
  rom[table + 0x07] = 0x0f;
  return rom;
}

describe("Crystal squares", () => {
  const rom = romWithPermissions();
  it.each([
    [0x00, "."], [0x07, "#"], [0x29, "~"], [0x18, '"'], [0x14, '"'], [0x12, "C"],
    [0xa0, "."], [0xa3, "."], [0x90, "="], [0x93, "P"], [0x91, "S"], [0x60, "O"], [0x71, "."],
  ])("collision $%s is %s", (coll, ch) => {
    expect(classify(rom, coll)).toBe(ch);
  });
  it("reads outside the loaded blocks as a wall", () => {
    expect(classify(rom, null)).toBe("#");
  });
});

describe("Crystal trainer parties", () => {
  // TrainerGroups (bank $0E) → class 1's parties: a plain one, then one with items and moves.
  const rom = new Uint8Array(0x80000);
  const groups = 0x0e * 0x4000 + (0x5999 - 0x4000);
  const parties = 0x0e * 0x4000 + 0x2000;
  rom[groups] = 0x00; rom[groups + 1] = 0x60; // → $6000 in bank $0E
  rom.set([
    0x80, 0x50, 0x00, 7, 16, 9, 17, 0xff, // "A", plain: Lv7 #16, Lv9 #17
    0x81, 0x50, 0x03, 12, 25, 0x20, 1, 2, 3, 4, 0xff, // "B", item + moves: Lv12 #25
  ], parties);
  it("finds a class's nth party, whatever each holds", () => {
    expect(trainerParty(rom, 1, 1)).toEqual([{ level: 7, species: 16 }, { level: 9, species: 17 }]);
    expect(trainerParty(rom, 1, 2)).toEqual([{ level: 12, species: 25 }]);
  });
  it("has no party for class or number 0", () => {
    expect(trainerParty(rom, 0, 1)).toBeNull();
    expect(trainerParty(rom, 1, 0)).toBeNull();
  });
});

describe("Crystal warps back to a shared map's door", () => {
  it("takes the way back (warp -1) from the backup warp in RAM, not the ROM", () => {
    // A door at (2,3) (collision $72) numbered -1 in the map's warp events; RAM holds where it goes:
    // warp 2 of map group 3, number 7. That map's second warp event is at (8,9).
    const rom = new Uint8Array(0x100000);
    const ram = new Uint8Array(0x10000);
    const mem = { read8: (a: number) => ram[a], read16be: () => 0, readBytes: (a: number, n: number) => ram.slice(a, a + n) };
    ram[OW.warpCount] = 1;
    ram[OW.warpsPointer] = 0x00; ram[OW.warpsPointer + 1] = 0x41;  // $4100 in bank 3
    ram[OW.mapScriptsBank] = 3;
    ram[OW.tilesetCollisionBank] = 2; ram[OW.tilesetCollisionAddress] = 0x00; ram[OW.tilesetCollisionAddress + 1] = 0x40;
    ram[A.mapWidth] = 1; ram[A.mapHeight] = 1;
    ram[OW.backupWarp] = 2; ram[OW.backupWarp + 1] = 3; ram[OW.backupWarp + 2] = 7;
    ram[0xc800 + 4 * 7 + 4] = 5;  // wOverworldMap: the block holding (2,3), tileset block 5
    rom.set([3, 2, 0xff, 0, 0], 3 * 0x4000 + 0x100);  // the warp event: y 3, x 2, warp -1
    rom[0x8000 + 5 * 4 + 2] = 0x72;  // block 5's collision at (2,3): a door
    // Map group 3's pointer → number 7's header → attributes → events (two warps: (1,1) and (8,9)).
    rom.set([0x00, 0x42], 0x94004);
    rom[0x94236] = 4; rom.set([0x00, 0x43], 0x94239);
    rom[0x10306] = 5; rom.set([0x00, 0x44], 0x10309);
    rom[0x14402] = 2;
    rom.set([1, 1], 0x14403); rom.set([9, 8], 0x14408);
    expect(mapDoors(mem, rom)).toMatchObject([{ x: 2, y: 3, tx: 8, ty: 9 }]);
  });
});

describe("Crystal warp mats", () => {
  it("says which way to press on each mat, and nothing for a plain door", () => {
    expect([0x70, 0x76, 0x78, 0x7e].map(carpetPush)).toEqual(["down", "left", "up", "right"]);
    expect(carpetPush(0x71)).toBeUndefined();
    expect(carpetPush(null)).toBeUndefined();
  });
});

describe("Crystal people by the clock", () => {
  const at = (timeOfDay: number, hour: number) => {
    const m = new Uint8Array(0x10000);
    m[A.timeOfDay] = timeOfDay;
    m[0xff94] = hour;
    return { read8: (a: number) => m[a], read16be: () => 0, readBytes: () => new Uint8Array() };
  };
  it("is always out with no time set", () => {
    expect(onAtThisTime(at(2, 3), 0xff, 0xff)).toBe(true);
  });
  it("follows a time-of-day mask (morning 1, day 2, night 4)", () => {
    expect(onAtThisTime(at(2, 22), 0xff, 4)).toBe(true);
    expect(onAtThisTime(at(1, 12), 0xff, 4)).toBe(false);
  });
  it("follows an hour range, also across midnight", () => {
    expect(onAtThisTime(at(1, 10), 9, 17)).toBe(true);
    expect(onAtThisTime(at(1, 18), 9, 17)).toBe(false);
    expect(onAtThisTime(at(2, 23), 22, 4)).toBe(true);
    expect(onAtThisTime(at(1, 12), 22, 4)).toBe(false);
  });
});

describe("Crystal crash check", () => {
  it("takes the RST vectors Crystal calls as normal, and $00, $38 and RAM as a crash", async () => {
    const { gen2Adapter } = await import("../../../src/games/gen2");
    const { gen1Adapter } = await import("../../../src/games/gen1");
    const crystal = gen2Adapter();
    expect([0x08, 0x10, 0x28, 0x4000].map((pc) => crystal.crashedAt(pc))).toEqual([false, false, false, false]);
    expect([0x00, 0x38, 0xc100, 0xd000].map((pc) => crystal.crashedAt(pc))).toEqual([true, true, true, true]);
    expect(gen1Adapter("red").crashedAt(0x08)).toBe(true);
  });
});

describe("Crystal ledges", () => {
  it("marks the face a hop square jumps over, and leaves the hop square walkable", () => {
    const rom = romWithPermissions();
    // A column: floor, hop-down square, the ledge face (wall), floor below.
    const column = [0x00, 0xa3, 0x07, 0x00];
    const coll = (x: number, y: number) => (x === 0 && y >= 0 && y < 4 ? column[y] : 0x07);
    expect([0, 1, 2, 3].map((y) => classifyAt(rom, coll, 0, y))).toEqual([".", ".", "v", "."]);
    // A hop-right square marks the wall to its right.
    const row = (x: number, y: number) => (y === 0 ? [0xa0, 0x07, 0x00][x] ?? 0x07 : 0x07);
    expect([0, 1, 2].map((x) => classifyAt(rom, row, x, 0))).toEqual([".", ">", "."]);
  });
});

describe("Crystal one-sided walls", () => {
  it("blocks only the step across the wall's side, either way", () => {
    const UP = 0xb2;
    expect(sideWallBlocks(0x00, UP, 0, 1)).toBe(true); // down into its top side
    expect(sideWallBlocks(UP, 0x00, 0, -1)).toBe(true); // up out of it
    expect(sideWallBlocks(0x00, UP, 1, 0)).toBe(false); // in from the side
    expect(sideWallBlocks(UP, 0x00, 0, 1)).toBe(false); // down out of it
    expect(sideWallBlocks(0xb0, 0x00, 1, 0)).toBe(true); // right wall, going right
    expect(sideWallBlocks(0x00, 0xb1, 1, 0)).toBe(true); // into a left wall from the left
  });
});

describe("Crystal fixed-damage moves", () => {
  it("counts Seismic Toss as fixed damage, Magnitude (power 1, variable) as typed", async () => {
    const { gen2Adapter } = await import("../../../src/games/gen2");
    const { gen1Adapter } = await import("../../../src/games/gen1");
    const crystal = gen2Adapter().data;
    expect(crystal.fixedDamage(0x45, 1)).toBe(true); // Seismic Toss
    expect(crystal.fixedDamage(222, 1)).toBe(false); // Magnitude
    expect(crystal.fixedDamage(216, 1)).toBe(false); // Return
    expect(gen1Adapter("red").data.fixedDamage(0x45, 1)).toBe(true);
  });
});

describe("Crystal warps", () => {
  it("are doors only on door-type squares: not holes, not plain floor", () => {
    expect([0x71, 0x72, 0x7a, 0x7b, 0x70].every(isDoorCollision)).toBe(true);
    expect(isDoorCollision(0x60)).toBe(false); // a hole (Morty's gym): shown as O
    expect(isDoorCollision(0x00)).toBe(false); // a warp over floor never fires
  });
});

describe("Poison while walking", () => {
  it("stops a walk in Gen 1 (it can make a Pokémon faint), not in Crystal (it stops at 1 HP)", async () => {
    const { gen2Adapter } = await import("../../../src/games/gen2");
    const { gen1Adapter } = await import("../../../src/games/gen1");
    expect(gen1Adapter("red").data.poisonFaintsWhileWalking).toBe(true);
    expect(gen2Adapter().data.poisonFaintsWhileWalking).toBe(false);
  });
});

describe("Crystal PC box list", () => {
  it("gets a ▶ on the highlighted row (its own cursor is a sprite)", async () => {
    const { gen2Adapter } = await import("../../../src/games/gen2");
    const screen = Array.from({ length: 18 }, () => " ".repeat(20));
    screen[0] = "        ┌──────────┐";
    screen[1] = "        │ BOX1     │";
    screen[4] = " ·······│SMOGGY    │";
    screen[6] = " ·······│NIBBLES   │";
    screen[16] = "│Choose a PKMN.    │";
    const m = new Uint8Array(0x10000);
    m[0xcb2b] = 1; // the second row
    const mem = { read8: (a: number) => m[a], read16be: () => 0, readBytes: () => new Uint8Array() };
    // The adapter reads the screen from VRAM; here only the cursor marking is under test.
    const { withPcCursorForTest } = await import("../../../src/games/gen2/index");
    expect(gen2Adapter().game).toBe("gen2");
    const out = withPcCursorForTest(mem, screen);
    expect(out[6]).toBe(" ·······▶NIBBLES   │");
    expect(out[4]).toBe(screen[4]);
    expect(withPcCursorForTest(mem, screen.map((l, i) => (i === 16 ? " ".repeat(20) : l)))).toEqual(screen.map((l, i) => (i === 16 ? " ".repeat(20) : l)));
  });
});

describe("Crystal people on screen", () => {
  const clerk = { x: 1, y: 3, hidden: false, loaded: false };
  it("keep showing right after a door, when the game hasn't loaded anyone yet", () => {
    expect(hideUnloadedOnScreen([clerk, { ...clerk, x: 7 }], 3, 7).map((o) => o.hidden)).toEqual([false, false]);
  });
  it("are gone when others are loaded and they aren't (a phantom on the stairs)", () => {
    const loaded = { x: 5, y: 5, hidden: false, loaded: true };
    expect(hideUnloadedOnScreen([loaded, { ...clerk, x: 12, y: 0 }], 12, 2).map((o) => o.hidden)).toEqual([false, true]);
  });
  it("off screen keep their flag's word", () => {
    const loaded = { x: 5, y: 5, hidden: false, loaded: true };
    expect(hideUnloadedOnScreen([loaded, { ...clerk, x: 40, y: 0 }], 5, 5).map((o) => o.hidden)).toEqual([false, false]);
  });

  it("trainerFacing checks the real 10×9 screen window (not just whether a struct is loaded)", () => {
    const ram = new Uint8Array(0x10000);
    ram[A.xCoord] = 10;
    ram[A.yCoord] = 10;
    ram[OW.objectEventCount] = 3;
    const putTrainer = (idx: number, structId: number, x: number, y: number, facingByte?: number) => {
      const m = OW.mapObjects + idx * 16;
      ram[m] = structId;
      ram[m + 1] = 1; // sprite
      ram[m + 2] = y + 4;
      ram[m + 3] = x + 4;
      ram[m + 6] = 0xff; ram[m + 7] = 0xff; // always on
      ram[m + 8] = 2; // OBJECTTYPE.TRAINER
      ram[m + 9] = 3; // sightRange
      ram[m + 12] = 0xff; ram[m + 13] = 0xff; // no hide flag
      if (structId !== 0xff) {
        const s = OW.objectStructs + structId * 40;
        ram[s] = 1; // sprite loaded
        ram[s + 0x08] = facingByte ?? 0;
        ram[s + 0x10] = x + 4;
        ram[s + 0x11] = y + 4;
      }
    };
    // Player at (10, 10): 10×9 screen covers x 6..15 (-4..+5) and y 6..14 (-4..+4).
    putTrainer(1, 1, 15, 10, 0x0c); // rightmost screen column (+5), loaded, facing right
    putTrainer(2, 2, 16, 10, 0x0c); // just past right screen edge (+6), still loaded in wObjectStructs
    putTrainer(3, 0xff, 30, 10); // unloaded far off screen
    const mem = { read8: (a: number) => ram[a], read16be: () => 0, readBytes: () => new Uint8Array() };
    const sprites = trainerSprites(mem, 10, 10);
    expect(sprites.map((s) => ({ x: s.x, onScreen: s.onScreen, facing: trainerFacing(s) }))).toEqual([
      { x: 15, onScreen: true, facing: "right" },
      { x: 16, onScreen: false, facing: undefined },
      { x: 30, onScreen: false, facing: undefined },
    ]);
  });
});
