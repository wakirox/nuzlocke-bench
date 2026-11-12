// The emulator core in Node for tests: src/emulator/node-gameboy.ts, with binjgb read from
// public/binjgb (tests run from the project root, vitest's default).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NodeGameBoy as Core, TICKS_PER_FRAME, type CoreFiles } from "../../src/emulator/node-gameboy";

export { TICKS_PER_FRAME };

let files: CoreFiles | null = null;
export function coreFiles(): CoreFiles {
  const dir = join(process.cwd(), "public", "binjgb");
  return (files ??= { js: readFileSync(join(dir, "binjgb.js"), "utf8"), wasm: readFileSync(join(dir, "binjgb.wasm")) });
}

export type NodeGameBoy = Core;
export const NodeGameBoy = {
  create: (rom: Uint8Array, core: CoreFiles = coreFiles()): Promise<Core> => Core.create(rom, core),
};

/**
 * A tiny homebrew Game Boy ROM (no game data) for emulator tests. Its loop reads the
 * d-pad into $C001 and counts loops in $C000.
 */
export function testRom(): Uint8Array {
  const rom = new Uint8Array(0x8000);
  rom.set([0x00, 0xc3, 0x50, 0x01], 0x100); // nop; jp $0150
  rom.set([
    0x3e, 0x20, // ld a, $20       select the d-pad
    0xe0, 0x00, // ldh [$ff00], a
    0xf0, 0x00, // ldh a, [$ff00]  read it (pressed = 0 bits)
    0xea, 0x01, 0xc0, // ld [$c001], a
    0x21, 0x00, 0xc0, // ld hl, $c000
    0x34, // inc [hl]
    0x18, 0xf1, // jr $0150
  ], 0x150);
  let chk = 0;
  for (let i = 0x134; i <= 0x14c; i++) chk = (chk - rom[i] - 1) & 0xff;
  rom[0x14d] = chk;
  return rom;
}
