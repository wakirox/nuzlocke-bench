// Reads real ROMs through the vendored engine on the browser shims (vitest.config.ts routes the
// engine's Node built-ins to src/shims, as the page's worker does). ROMs aren't in the repo, so this
// only runs on your machine:
//
//   NUZLOCKE_TEST_ROMS=<folder with the .gb/.gbc files> npm test

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readRom } from "../../src/rom/reader";

const DIR = process.env.NUZLOCKE_TEST_ROMS;
const roms = DIR ? readdirSync(DIR).filter((f) => /\.gbc?$/i.test(f)) : [];
const loadFile = async (p: string) => new Uint8Array(readFileSync(join(process.cwd(), "public", p)));

describe.skipIf(!roms.length)("reading a ROM through the engine on the browser shims", () => {
  it.each(roms)("%s", async (file) => {
    const bytes = readFileSync(join(DIR!, file));
    const { rom, data } = await readRom(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), loadFile);
    // The game is handed back exactly as given.
    expect(Buffer.from(rom).equals(bytes)).toBe(true);
    expect(data.romName).toMatch(/\S/);
    const species = Object.values(data.species).map((s) => s.name);
    expect(species).toEqual(expect.arrayContaining(["PIKACHU", "MEWTWO"]));
    expect(Object.values(data.moves).map((m) => m.name)).toEqual(expect.arrayContaining(["TACKLE", "THUNDERBOLT"]));
    expect(data.items).toContain("POTION");
    expect(data.mapNames.some((n) => /PALLET|NEW BARK/i.test(n))).toBe(true);
    expect(data.levelCaps?.gyms).toHaveLength(8);
  }, 60_000);
});
