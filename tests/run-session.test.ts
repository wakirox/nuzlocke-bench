// Unit tests for the save codec, declarative run-artifact manifest, and Node-testable RunSession.

import { describe, expect, it } from "vitest";
import type { GameBoy } from "../src/emulator/gameboy";
import { FIELDS } from "../src/emulator/replay";
import {
  KEYS,
  RUN_ARTIFACTS,
  SNAPSHOT_KEPT_FILES,
  THROTTLED_KEYS,
  keysClearedWithRun,
  unpackMilestone,
} from "../src/run-artifacts";
import { RunSession, runScore } from "../src/run-session";
import { decodeSave, encodeSave } from "../src/save-codec";
import { trackerData } from "./games/gen1/fixture";

describe("save-codec", () => {
  it("round-trips typed arrays (including non-zero byteOffset subarrays) onto owned ArrayBuffers", () => {
    const backing = new Uint8Array([99, 1, 2, 3, 4, 88]);
    const sub = backing.subarray(1, 5);
    const floats = new Float64Array([1.5, -42.25]);
    const decoded = decodeSave<{ sub: Uint8Array; floats: Float64Array; label: string }>(
      encodeSave({ sub, floats, label: "ok" }),
    );
    expect(decoded.label).toBe("ok");
    expect([...decoded.sub]).toEqual([1, 2, 3, 4]);
    expect(decoded.sub.byteOffset).toBe(0);
    expect([...decoded.floats]).toEqual([1.5, -42.25]);
  });
});

describe("run-artifacts manifest", () => {
  it("keeps throttling, clearRun keys, and milestone unpacking derived from one table", () => {
    expect(THROTTLED_KEYS).toEqual({ [KEYS.replay]: 120_000 });
    expect(SNAPSHOT_KEPT_FILES).toContain("run.json");
    expect(SNAPSHOT_KEPT_FILES).not.toContain("run.routes.json");

    const cleared = keysClearedWithRun([
      "baseRom",
      "history",
      "run.slotState.manual",
      "run.slotState.ai-1",
      "run.milestone.badge1",
      "bestReplay.nuzlocke",
    ]);
    expect(cleared).toEqual(expect.arrayContaining([
      KEYS.run,
      KEYS.autoState,
      KEYS.battery,
      KEYS.tracker,
      KEYS.seen,
      KEYS.replay,
      KEYS.routes,
      "run.slotState.manual",
      "run.slotState.ai-1",
      "run.milestone.badge1",
    ]));
    expect(cleared).not.toContain("baseRom");
    expect(cleared).not.toContain("history");
    expect(cleared).not.toContain("bestReplay.nuzlocke");
    // Every clearedWithRun artifact in RUN_ARTIFACTS is included.
    for (const a of RUN_ARTIFACTS.filter((x) => x.clearedWithRun)) expect(cleared).toContain(a.key);
  });

  it("unpacks a milestone checkpoint and cuts the replay at milestone ticks", () => {
    const events = new Float64Array([
      100, 0, 0, 1,
      200, 0, 0, 0,
      350, 0, 1, 1,
    ]);
    expect(events.length).toBe(3 * FIELDS);
    const fullReplay = {
      start: new Uint8Array([1, 2]),
      events,
      states: [{ at: 1, state: new Uint8Array([9]) }, { at: 2, state: new Uint8Array([8]) }],
      endTicks: 400,
    };
    const seen = { squares: { 0: { 4: [[0, 9]] as [number, number][] } }, doors: {} };
    const milestone = {
      state: new Uint8Array([7, 7]),
      battery: new Uint8Array([5]),
      tracker: { maxBadges: 2 } as never,
      seen,
      ticks: 250,
    };
    const { files, events: kept } = unpackMilestone(milestone, fullReplay, FIELDS);
    expect(kept).toBe(2);
    expect(files[KEYS.autoState]).toEqual(new Uint8Array([7, 7]));
    expect(files[KEYS.battery]).toEqual(new Uint8Array([5]));
    expect(files[KEYS.seen]).toEqual(seen);
    expect((files[KEYS.replay] as typeof fullReplay).events).toHaveLength(2 * FIELDS);
    expect((files[KEYS.replay] as typeof fullReplay).states).toHaveLength(1);
    expect((files[KEYS.replay] as typeof fullReplay).endTicks).toBe(250);
  });
});

describe("RunSession", () => {
  it("tracks seen dirty flags in autosaves, clones milestone state, and computes attempt scores", () => {
    const ram = new Uint8Array(0x10000);
    let ticks = 120;
    const fakeGb = {
      get ticks() { return ticks; },
      recorder: null,
      read8: (addr: number) => ram[addr] ?? 0,
      read16be: (addr: number) => ((ram[addr] ?? 0) << 8) | (ram[addr + 1] ?? 0),
      readBytes: (addr: number, len: number) => ram.subarray(addr, addr + len),
      write8: (addr: number, val: number) => { ram[addr] = val & 0xff; },
      saveState: () => new Uint8Array([10, 20]),
      intervene: (_kind: number, _arg: number, fn: () => void) => fn(),
      destroy: () => {},
    } as unknown as GameBoy;

    const rom = new Uint8Array(0x20000);
    const run = {
      attempt: 3,
      mode: "nuzlocke" as const,
      rom,
      data: trackerData("red"),
      startedAt: 1_000,
      rareCandies: true,
      hardLevelCaps: false,
    };

    const polls: boolean[] = [];
    const session = new RunSession({
      run,
      rom,
      gb: fakeGb,
      onPoll: ({ justEnded }) => polls.push(justEnded),
    });

    // Clean seen map isn't re-written on autosave until something new is seen.
    expect(session.captureAutosave().seen).toBeUndefined();
    session.seen.sawScreen(1, 5, 5);
    const saved = session.captureAutosave();
    expect(saved.seen).toBeDefined();
    expect(session.captureAutosave().seen).toBeUndefined();

    // Milestone checkpoint clones seen data so later exploration doesn't mutate the saved milestone.
    const ms = session.captureMilestone(new Uint8Array([3]));
    session.seen.sawScreen(2, 1, 1);
    expect(ms.seen?.squares[2]).toBeUndefined();

    ticks = 240;
    session.poll();
    expect(polls).toEqual([false]);
    expect(runScore({ kind: "victory", detail: "Won" }, 8, 55)).toBeGreaterThan(runScore({ kind: "wipe", detail: "Lost" }, 8, 100));
  });
});
