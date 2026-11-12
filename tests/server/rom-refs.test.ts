// ROMs in saves by reference (mcp-server/rom-refs.mjs): stored once as a file, not in every record.

import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-expect-error plain ESM module without type declarations
import { knownRoms, restoreRoms, stripRoms } from "../../mcp-server/rom-refs.mjs";

const bytes = (n: number, seed: number) => Buffer.from(Array.from({ length: n }, (_, i) => (i * seed) & 0xff));
const typed = (b: Buffer) => ({ $ta: "Uint8Array", b64: b.toString("base64") });

describe("ROM references in saves", () => {
  const dir = mkdtempSync(join(tmpdir(), "roms-"));
  const red = bytes(512 * 1024, 7);
  const yellow = bytes(1024 * 1024, 13);
  writeFileSync(join(dir, "red.gb"), red);
  writeFileSync(join(dir, "yellow.gbc"), yellow);
  writeFileSync(join(dir, "notes.txt"), "not a rom");
  const roms = knownRoms({ rom: join(dir, "red.gb") });

  it("knows the run's ROM and the others in its folder, and nothing else", () => {
    expect(roms.size).toBe(2);
  });

  it("keeps a known ROM as a reference anywhere in a record, and puts it back when read", () => {
    const record = { rom: typed(red), replay: { start: typed(bytes(1000, 3)), rom: typed(yellow) }, list: [typed(red)], name: "x" };
    const stored = stripRoms(record, roms);
    expect(stored.rom).toEqual({ $romRef: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(stored.replay.rom.$romRef).not.toBe(stored.rom.$romRef);
    expect(stored.list[0]).toEqual(stored.rom);
    expect(stored.replay.start).toEqual(record.replay.start); // small: stays as it is
    expect(JSON.stringify(stored).length).toBeLessThan(5000);
    expect(restoreRoms(stored, roms)).toEqual(record);
  });

  it("leaves a ROM no file matches (a patched one) as it is", () => {
    const patched = Buffer.from(red);
    patched[100] ^= 1;
    expect(stripRoms({ rom: typed(patched) }, roms)).toEqual({ rom: typed(patched) });
  });

  it("says which ROM is missing when a reference can't be put back", () => {
    const stored = stripRoms({ rom: typed(red) }, roms);
    expect(() => restoreRoms(stored, new Map())).toThrow(/SHA-256 [0-9a-f]{64}.*--roms/);
  });
});
