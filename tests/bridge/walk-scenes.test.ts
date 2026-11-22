// Travel.walk against a scripted fake Game Boy: no ROM, no browser. What a walk reports when the
// player stops moving: a wall, a scene that has taken the controls (the ship leaving the dock), a
// trainer who walks over, and a warp that starts only after the last step.

import { beforeAll, describe, expect, it, vi } from "vitest";
import { Travel } from "../../src/bridge/travel";
import { BridgeCore } from "../../src/bridge/bridge-core";
import type { Menus } from "../../src/bridge/menus";

beforeAll(() => vi.stubGlobal("document", { hidden: true }));

type Pos = { x: number; y: number; map: number; battle: boolean; scripted: boolean };

/**
 * A world ticked once per frame: the player moves one square up every 16 frames while "up" is held,
 * up to `wallAt` (y); `tick` can change anything after that (a scene, a text box, a warp).
 */
function setup(opts: { wallAt: number; tick?: (frame: number, pos: Pos, held: boolean) => void; box?: () => string[] }) {
  const pos: Pos = { x: 5, y: 10, map: 1, battle: false, scripted: false };
  let frame = 0;
  let held = false;
  let walking = 0;
  const gb = {
    setButton: (_d: string, on: boolean) => { held = on; },
    runFrames: async (n: number) => {
      for (let i = 0; i < n; i++) {
        frame++;
        if (held && !pos.scripted && pos.y > opts.wallAt && ++walking % 16 === 0) pos.y--;
        opts.tick?.(frame, pos, held);
      }
    },
  };
  const box = () => {
    const lines = opts.box?.() ?? [];
    return { open: lines.length > 0, lines };
  };
  const core = {
    requireGb: () => gb,
    host: { position: () => ({ ...pos }) },
    game: { data: { poisonFaintsWhileWalking: false }, poisonedParty: () => [] },
    fleeUncounted: false,
    textBox: box,
    screenText: () => [],
    settledScreen: async () => [],
    mapText: () => "map",
    // The map's mechanics: no doors (or ice) in this world.
    rawView: () => ({ grid: [[]], doors: [] }),
    // The fog of war's memory is not what these walks are about: nothing to remember here.
    noteSeen: () => {},
    result: (r: object) => ({ ...r }),
    // The real wait for a move to end (and a warp to load), on this world's frames.
    settleMove: BridgeCore.prototype.settleMove,
    // No slope in this world (the game has no forcedDownhill): plain frames.
    slopeFrames: BridgeCore.prototype.slopeFrames,
    letGoOfSlope: BridgeCore.prototype.letGoOfSlope,
  } as unknown as BridgeCore;
  return { travel: new Travel(core, {} as Menus), core, pos, frames: () => frame };
}

const walk = async (t: Travel, path: string) => ((await t.walkPath(path)) as { walk: string }).walk;

describe("walk: when the player stops moving", () => {
  it("says blocked at a wall", async () => {
    const { travel } = setup({ wallAt: 8 });
    expect(await walk(travel, "up 5")).toBe("up 2/5 — stopped: blocked (wall, person, or a scripted event)");
  });

  it("waits out a scene that has taken the controls, and says it's over", async () => {
    // From frame 40 a scene holds the controls for ~10 s (600 frames), then gives them back.
    const { travel } = setup({ wallAt: 0, tick: (f, p) => { p.scripted = f >= 40 && f < 640; } });
    expect(await walk(travel, "up 5")).toMatch(/^up 2\/5 — stopped: a scene had the controls for \d+ s; it's over — walk again$/);
  });

  it("follows a scene that walks you through a door", async () => {
    // The scene holds the controls, walks the player up three squares and onto a door to map 2.
    const { travel, pos } = setup({
      wallAt: 0,
      tick: (f, p) => {
        p.scripted = f >= 20 && f < 900;
        if (f === 500 || f === 520 || f === 540) p.y--;
        if (f === 560) { p.map = 2; p.x = 18; p.y = 31; }
      },
    });
    expect(await walk(travel, "up 5")).toBe("up 1/5 — stopped: entered a new map");
    expect(pos.map).toBe(2);
  });

  it("says when a trainer who walked over opens a text box", async () => {
    // Spotted at frame 30: the controls are taken while the trainer walks over (~150 frames), then it talks.
    let talking = false;
    const { travel } = setup({ wallAt: 0, tick: (f, p) => { p.scripted = f >= 30; if (f === 180) talking = true; }, box: () => (talking ? ["You saw me!"] : []) });
    expect(await walk(travel, "up 5")).toMatch(/^up 1\/5 — stopped: stopped by a scripted event: a text box opened \("You saw me!"\)/);
  });

  it("says when a trainer who saw the last step walks over and talks, instead of arrived", async () => {
    // The walk's last step lands at frame 32 (two squares); the trainer's script takes the controls
    // a few frames later and talks once it has walked over.
    let talking = false;
    const { travel } = setup({ wallAt: 0, tick: (f, p) => { if (p.y === 8 && f >= 36) p.scripted = true; if (f === 160) talking = true; }, box: () => (talking ? ["Open one shutter,", "another closes."] : []) });
    expect(await walk(travel, "up 2")).toBe('up 2/2 — stopped: stopped by a scripted event: a text box opened ("Open one shutter, another closes.") (a trainer who saw you, or a scene) — advance_text reads it');
  });

  it("reports a warp that starts after the last step, once the new map is in", async () => {
    // The last step lands on a door; the game switches maps a few frames later.
    let arrivedAt = -1;
    const { travel, pos, frames } = setup({ wallAt: 0, tick: (f, p) => { if (p.y === 8 && arrivedAt < 0) arrivedAt = f; if (arrivedAt > 0 && f === arrivedAt + 3) p.map = 2; } });
    expect(await walk(travel, "up 2")).toBe("up 2/2 — stopped: entered a new map");
    expect(pos.map).toBe(2);
    expect(frames() - arrivedAt).toBeGreaterThanOrEqual(120);
  });

  it("waits for a warp's new coordinates, which come in after its map id (press through a door)", async () => {
    // As a gym's exit: the city's map id at once, the city's square 60 frames later (the fade).
    const { core, pos } = setup({ wallAt: 0, tick: (f, p) => { if (f === 2) p.map = 2; if (f === 60) [p.x, p.y] = [12, 28]; } });
    expect(await core.settleMove(1)).toBe(true);
    expect([pos.map, pos.x, pos.y]).toEqual([2, 12, 28]);
    // Nothing changed: it only waits for the player to stand still.
    expect(await core.settleMove(2)).toBe(false);
  });

  it("stops on each poison hit until the model acks that Pokémon's poison, and again once it's cured", async () => {
    // Gen 1: WINGS loses 1 HP every 4 squares walked while poisoned.
    const { travel, core, pos } = setup({ wallAt: -40 });
    let cured = false;
    const poisoned = () => new Map(cured ? [] : [["w1", { slot: 0, hp: 30 - Math.floor((10 - pos.y) / 4), maxHp: 40 }]]);
    Object.assign(core, {
      game: { data: { poisonFaintsWhileWalking: true }, poisonedParty: poisoned },
      summary: () => ({ party: [{ nickname: "WINGS", species: "MONA" }] }),
    });
    expect(await walk(travel, "up 8")).toMatch(/^up 4\/8 — stopped: WINGS is hurt by poison \(30→29\/40 HP; ack_poison/);
    expect(() => travel.ackPoison("PIP")).toThrow(/No party Pokémon "PIP"/);
    travel.ackPoison("wings");
    expect(await walk(travel, "up 8")).toBe("up 8/8 — arrived"); // two hits on the way, no stop
    cured = true;
    expect(() => travel.ackPoison("1")).toThrow(/WINGS isn't poisoned/);
    expect(await walk(travel, "up 1")).toBe("up 1/1 — arrived"); // the ack lapses: it was cured
    cured = false;
    expect(await walk(travel, "up 8")).toMatch(/stopped: WINGS is hurt by poison/);
  });

  it("gives up waiting on a scene after 30 s and says it's still going", async () => {
    const { travel } = setup({ wallAt: 0, tick: (f, p) => { p.scripted = f >= 20; } });
    expect(await walk(travel, "up 3")).toMatch(/^up 1\/3 — stopped: a scene has the controls \(still going after 30 s\) — wait, then walk again$/);
  });
});
