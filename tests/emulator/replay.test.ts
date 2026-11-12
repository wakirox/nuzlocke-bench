// Replays are what make a run checkable after the fact: a recording played back on the same
// ROM must land on exactly the same machine. Uses a tiny homebrew ROM, so it runs anywhere.

import { describe, expect, it } from "vitest";
import { Recorder, ReplayPlayer } from "../../src/emulator/replay";
import { NodeGameBoy, TICKS_PER_FRAME, testRom } from "../harness/node-gameboy";

const WRAM = [0xc000, 0x2000] as const;

describe("emulator core in Node", () => {
  it("runs the ROM and reads the d-pad", async () => {
    const gb = await NodeGameBoy.create(testRom());
    for (let i = 0; i < 10; i++) gb.stepFrame();
    expect(gb.read8(0xc000)).toBeGreaterThan(0);
    expect(gb.read8(0xc001) & 0x08).toBe(0x08); // down not pressed
    gb.setButton("down", true);
    gb.stepFrame();
    expect(gb.read8(0xc001) & 0x08).toBe(0); // pressed reads as 0
    gb.destroy();
  });

  it("saves and loads state exactly", async () => {
    const gb = await NodeGameBoy.create(testRom());
    for (let i = 0; i < 5; i++) gb.stepFrame();
    const state = gb.saveState();
    const ticks = gb.ticks;
    const ram = gb.readBytes(...WRAM);
    for (let i = 0; i < 5; i++) gb.stepFrame();
    expect(gb.loadState(state)).toBe(true);
    expect(gb.ticks).toBe(ticks);
    expect(gb.readBytes(...WRAM)).toEqual(ram);
    gb.destroy();
  });
});

describe("replays", () => {
  it("play back buttons, RAM pokes and loaded states to the same machine", async () => {
    // Record: drive a game with inputs and pokes, the way the app's recorder sees them.
    const live = await NodeGameBoy.create(testRom());
    for (let i = 0; i < 3; i++) live.stepFrame();
    const rec = new Recorder({ start: live.saveState() });
    const press = (b: "down" | "a", on: boolean) => {
      rec.button(live.ticks, b, on);
      live.setButton(b, on);
    };
    const poke = (addr: number, v: number) => {
      rec.write(live.ticks, addr, v);
      live.write8(addr, v);
    };
    live.stepFrame();
    press("down", true);
    for (let i = 0; i < 4; i++) live.stepFrame();
    poke(0xc010, 7);
    const checkpoint = live.saveState();
    live.runTo(live.ticks + 12345); // mid-frame
    press("down", false);
    for (let i = 0; i < 3; i++) live.stepFrame();
    // A state load mid-run (save_state/load_state): playback must follow it too.
    rec.state(checkpoint);
    live.loadState(checkpoint);
    poke(0xc011, 9);
    for (let i = 0; i < 6; i++) live.stepFrame();
    const log = rec.log(live.ticks);
    const expected = live.readBytes(...WRAM);

    // Play back on a fresh emulator.
    const gb = await NodeGameBoy.create(testRom());
    const player = new ReplayPlayer(gb.asGameBoy(), log);
    for (let guard = 0; !player.done && guard < 10_000; guard++) player.step(TICKS_PER_FRAME);
    expect(player.done).toBe(true);
    expect(gb.ticks).toBe(log.endTicks);
    expect(gb.read8(0xc010)).toBe(7);
    expect(gb.read8(0xc011)).toBe(9);
    expect(gb.readBytes(...WRAM)).toEqual(expected);
    live.destroy();
    gb.destroy();
  });
});
