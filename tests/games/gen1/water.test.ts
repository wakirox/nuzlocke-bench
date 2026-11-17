// Surfing encounters, read from the ROM's wild data table (the game's own copy in memory is
// overwritten by trainer battles). A synthetic ROM always; real ROMs when you have them:
//
//   NUZLOCKE_TEST_ROMS=<folder with the .gb/.gbc files> npm test

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { waterEncounters } from "../../../src/games/gen1/ram";
import { MAP_CONSTANTS_RB, MAP_CONSTANTS_Y } from "../../../src/games/gen1/map-constants";
import { readRom } from "../../../src/rom/reader";

/** A ROM with Red's pointer table at 0xCEEB: map 1 has grass only, map 2 water only, map 3 both, map 4 none. */
function syntheticRom(): Uint8Array {
  const rom = new Uint8Array(0x10000);
  const at = (map: number, bankAddr: number) => { rom[0xceeb + map * 2] = bankAddr & 0xff; rom[0xceeb + map * 2 + 1] = bankAddr >> 8; };
  const slots = (off: number, species: number) => { for (let i = 0; i < 10; i++) { rom[off + i * 2] = 10 + i; rom[off + i * 2 + 1] = species; } };
  // Pointers are bank-3 addresses (0x4000–0x7FFF), stored at file offset 0xC000 + (ptr - 0x4000).
  at(1, 0x5000); rom[0xd000] = 25; slots(0xd001, 0x24); rom[0xd015] = 0;
  at(2, 0x5100); rom[0xd100] = 0; rom[0xd101] = 5; slots(0xd102, 0x18);
  at(3, 0x5200); rom[0xd200] = 15; slots(0xd201, 0x24); rom[0xd215] = 5; slots(0xd216, 0x18);
  at(4, 0x5300); rom[0xd300] = 0; rom[0xd301] = 0;
  return rom;
}

describe("waterEncounters", () => {
  const rom = syntheticRom();

  it("reads a map with only water", () => {
    const w = waterEncounters(rom, "red", 2);
    expect(w.rate).toBe(5);
    expect(w.mons).toHaveLength(10);
    expect(w.mons[0]).toEqual({ level: 10, species: 0x18 });
    expect(w.mons[9]).toEqual({ level: 19, species: 0x18 });
  });

  it("skips the grass table to the water one", () => {
    expect(waterEncounters(rom, "red", 3)).toMatchObject({ rate: 5, mons: expect.arrayContaining([{ level: 10, species: 0x18 }]) });
  });

  it("has nothing for a map with grass only, or no wild Pokémon", () => {
    expect(waterEncounters(rom, "red", 1)).toEqual({ rate: 0, mons: [] });
    expect(waterEncounters(rom, "red", 4)).toEqual({ rate: 0, mons: [] });
  });

  it("has nothing for a game it doesn't know the table of", () => {
    expect(waterEncounters(rom, "crystal", 2)).toEqual({ rate: 0, mons: [] });
  });
});

const DIR = process.env.NUZLOCKE_TEST_ROMS;
const gen1 = DIR ? readdirSync(DIR).filter((f) => /(red|blue|yellow).*\.gbc?$/i.test(f)) : [];
const loadFile = async (p: string) => new Uint8Array(readFileSync(join(process.cwd(), "public", p)));

describe.skipIf(!gen1.length)("surfing tables in real ROMs", () => {
  it.each(gen1)("%s", async (file) => {
    const bytes = readFileSync(join(DIR!, file));
    const { rom, data } = await readRom(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), loadFile);
    const version = data.version;
    const maps = version === "yellow" ? MAP_CONSTANTS_Y : MAP_CONSTANTS_RB;
    const water = (name: string) => {
      const w = waterEncounters(rom, version, maps.indexOf(name));
      return { rate: w.rate, names: new Set(w.mons.map((m) => data.species[m.species]?.name)) };
    };
    // Every sea route has a surfing table of real species, the same sea all along; a land route has none.
    const seas = ["ROUTE_19", "ROUTE_20", "ROUTE_21"].map((sea) => ({ sea, ...water(sea) }));
    for (const w of seas) {
      expect(w.rate, w.sea).toBeGreaterThan(0);
      expect([...w.names].every((n) => typeof n === "string" && n.length > 0), w.sea).toBe(true);
      expect([...w.names].some((n) => seas[0].names.has(n)), w.sea).toBe(true);
    }
    expect(water("ROUTE_1").rate).toBe(0);
  });
});
