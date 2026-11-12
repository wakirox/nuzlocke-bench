// Hard level caps: finding the game's two max-level values and changing them in the loaded ROM.
// (Checked on Red in a real battle: a Lv24 Pokémon one point short of Lv25 stays Lv24 with the cap at 24.)

import { describe, expect, it } from "vitest";
import { intervene, KIND_CANDY_CAP, KIND_LEVEL_CAP, Recorder, ReplayPlayer } from "../../src/emulator/replay";
import { candyCapInRom, capOffsets, levelCapInRom, MAX_LEVEL, setCandyCapInRom, setLevelCapInRom } from "../../src/games/gen1/hard-caps";
import { NodeGameBoy, TICKS_PER_FRAME, testRom } from "../harness/node-gameboy";

// The game's code around the two values (pokered GainExperience; ItemUseVitamin's Rare Candy).
const EXP = [0xea, 0xb5, 0xd0, 0xcd, 0x37, 0x15, 0x16, MAX_LEVEL, 0x21, 0x6a, 0x4f, 0x06, 0x16, 0xcd, 0xd6, 0x35, 0xf0];
const CANDY = [0x09, 0x7e, 0xfe, MAX_LEVEL, 0x28, 0x10, 0x3c, 0x77];

function romWith(...parts: [number, number[]][]): Uint8Array {
  const rom = testRom();
  for (const [at, bytes] of parts) rom.set(bytes, at);
  return rom;
}

describe("hard level caps", () => {
  it("finds each value once, whatever it's set to", () => {
    expect(capOffsets(romWith([0x1000, EXP], [0x2000, CANDY]))).toEqual({ exp: 0x1007, candy: 0x2003 });
    const set = romWith([0x1000, EXP], [0x2000, CANDY]);
    set[0x1007] = 21;
    set[0x2003] = 21;
    expect(capOffsets(set)).toEqual({ exp: 0x1007, candy: 0x2003 });
  });

  it("doesn't guess when a pattern is missing or appears twice", () => {
    expect(capOffsets(romWith([0x1000, EXP]))).toBeNull();
    expect(capOffsets(romWith([0x1000, EXP], [0x1800, EXP], [0x2000, CANDY]))).toBeNull();
  });

  it("changes the loaded ROM the emulator runs, and playback does the same", async () => {
    const gb = await NodeGameBoy.create(romWith([0x1000, EXP], [0x2000, CANDY]));
    expect(levelCapInRom(gb)).toBe(MAX_LEVEL);
    setLevelCapInRom(gb, 14);
    expect([gb.read8(0x1007), gb.read8(0x2003)]).toEqual([14, 14]); // what the CPU reads
    intervene(gb.asGameBoy(), "red", KIND_LEVEL_CAP, 21); // a recording's event, re-done
    expect(levelCapInRom(gb)).toBe(21);
  });

  it("can stop Rare Candies alone, also for a Pokémon already over the level (at or above, not only at)", async () => {
    const gb = await NodeGameBoy.create(romWith([0x1000, EXP], [0x2000, CANDY]));
    setLevelCapInRom(gb, MAX_LEVEL);
    setCandyCapInRom(gb, 62);
    expect([gb.read8(0x1007), gb.read8(0x2003)]).toEqual([MAX_LEVEL, 62]);
    expect([levelCapInRom(gb), candyCapInRom(gb)]).toEqual([MAX_LEVEL, 62]);
    expect(gb.read8(0x2004)).toBe(0x30); // jr nc, was jr z
    intervene(gb.asGameBoy(), "red", KIND_CANDY_CAP, 50); // a recording's event, re-done
    expect([levelCapInRom(gb), candyCapInRom(gb)]).toEqual([MAX_LEVEL, 50]);
  });
});

// A save state holds no ROM, so jumping in a recording has to put the cap back: without it the game
// gives experience the run never got, and the playback drifts away from the recording.
describe("jumping in a recording with hard level caps", () => {
  const rom = () => romWith([0x1000, EXP], [0x2000, CANDY]);

  async function recording() {
    const gb = await NodeGameBoy.create(rom());
    const rec = new Recorder({ start: gb.saveState() });
    rec.intervention(gb.ticks + 100, KIND_LEVEL_CAP, 14);
    rec.intervention(gb.ticks + 2 * TICKS_PER_FRAME, KIND_LEVEL_CAP, 21);
    return { gb, log: rec.log(gb.ticks + 4 * TICKS_PER_FRAME) };
  }

  it("puts back the cap in force at the keyframe, backwards and forwards", async () => {
    const { gb, log } = await recording();
    const player = new ReplayPlayer(gb.asGameBoy(), log, { version: "red" });
    const beforeAny = player.snapshot();
    player.step(TICKS_PER_FRAME);
    const at14 = player.snapshot();
    player.step(2 * TICKS_PER_FRAME);
    const at21 = player.snapshot();
    expect(levelCapInRom(gb)).toBe(21);

    player.restore(at14);
    expect(levelCapInRom(gb)).toBe(14);
    player.restore(at21);
    expect(levelCapInRom(gb)).toBe(21);
    player.restore(beforeAny);
    expect(levelCapInRom(gb)).toBe(MAX_LEVEL);
    gb.destroy();
  });

  it("puts back the Rare Candy cap too, on its own", async () => {
    const gb = await NodeGameBoy.create(rom());
    const rec = new Recorder({ start: gb.saveState() });
    rec.intervention(gb.ticks + 100, KIND_CANDY_CAP, 50);
    const player = new ReplayPlayer(gb.asGameBoy(), rec.log(gb.ticks + 2 * TICKS_PER_FRAME), { version: "red" });
    const beforeAny = player.snapshot();
    player.step(TICKS_PER_FRAME);
    const at50 = player.snapshot();
    expect(candyCapInRom(gb)).toBe(50);
    player.restore(beforeAny);
    expect(candyCapInRom(gb)).toBe(MAX_LEVEL);
    player.restore(at50);
    expect(candyCapInRom(gb)).toBe(50);
    gb.destroy();
  });

  it("puts it back on another machine that never played that far", async () => {
    const { gb, log } = await recording();
    const player = new ReplayPlayer(gb.asGameBoy(), log, { version: "red" });
    player.step(TICKS_PER_FRAME);
    const at14 = player.snapshot();

    const other = await NodeGameBoy.create(rom());
    const fresh = new ReplayPlayer(other.asGameBoy(), log, { version: "red" });
    expect(levelCapInRom(other)).toBe(MAX_LEVEL);
    fresh.restore(at14);
    expect(levelCapInRom(other)).toBe(14);
    gb.destroy();
    other.destroy();
  });

  it("leaves the ROM alone when the recording has no caps", async () => {
    const gb = await NodeGameBoy.create(rom());
    const log = new Recorder({ start: gb.saveState() }).log(gb.ticks + TICKS_PER_FRAME);
    const player = new ReplayPlayer(gb.asGameBoy(), log, { version: "red" });
    const start = player.snapshot();
    setLevelCapInRom(gb, 30);
    player.restore(start);
    expect(levelCapInRom(gb)).toBe(30);
    gb.destroy();
  });
});
