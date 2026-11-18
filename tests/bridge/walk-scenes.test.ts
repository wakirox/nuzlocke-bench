// Travel.walk against a scripted fake Game Boy: no ROM, no browser. What a walk reports when the
// player stops moving: a wall, a scene that has taken the controls (the ship leaving the dock), a
// trainer who walks over, and a warp that starts only after the last step.

import { beforeAll, describe, expect, it, vi } from "vitest";
import { Travel } from "../../src/bridge/travel";
import type { BridgeCore } from "../../src/bridge/bridge-core";
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
    // The fog of war's memory is not what these walks are about: nothing to remember here.
    noteSeen: () => {},
    result: (r: object) => ({ ...r }),
  } as unknown as BridgeCore;
  return { travel: new Travel(core, {} as Menus), pos, frames: () => frame };
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

  it("reports a warp that starts after the last step, once the new map is in", async () => {
    // The last step lands on a door; the game switches maps a few frames later.
    let arrivedAt = -1;
    const { travel, pos, frames } = setup({ wallAt: 0, tick: (f, p) => { if (p.y === 8 && arrivedAt < 0) arrivedAt = f; if (arrivedAt > 0 && f === arrivedAt + 3) p.map = 2; } });
    expect(await walk(travel, "up 2")).toBe("up 2/2 — stopped: entered a new map");
    expect(pos.map).toBe(2);
    expect(frames() - arrivedAt).toBeGreaterThanOrEqual(120);
  });

  it("gives up waiting on a scene after 30 s and says it's still going", async () => {
    const { travel } = setup({ wallAt: 0, tick: (f, p) => { p.scripted = f >= 20; } });
    expect(await walk(travel, "up 3")).toMatch(/^up 1\/3 — stopped: a scene has the controls \(still going after 30 s\) — wait, then walk again$/);
  });
});
