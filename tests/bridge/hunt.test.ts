// Travel.hunt with a stubbed core: no ROM, no browser. A wild Pokémon that doesn't count can jump
// out on the way to the grass; with flee_uncounted the hunt runs from it and goes on, and never
// returns an empty result (a run's hunt crashed the result formatter that way, 2026-11-12).

import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/bridge/overworld", async (orig) => ({
  ...(await orig<typeof import("../../src/bridge/overworld")>()),
  // One step to the grass, whatever the square.
  findPath: () => ({ dirs: ["up"], sightStop: false }),
}));

import { Travel } from "../../src/bridge/travel";
import type { BridgeCore } from "../../src/bridge/bridge-core";
import type { Menus } from "../../src/bridge/menus";

/** Two grass squares at (0,0) and (1,0); the player starts off the grass at (5,5). */
function setup() {
  const pos = { x: 5, y: 5, battle: 0 };
  const core = {
    summary: () => ({ run: { ruleset: "nuzlocke" }, nuzlocke: { thisArea: null } }),
    host: { position: () => pos },
    view: () => ({ grid: [['"', '"']], originX: 0, originY: 0, pc: 0, pr: 0 }),
    sight: () => ({ avoidSight: false }),
    textBox: () => ({ open: false }),
    screenText: () => [],
    mapText: () => "map",
    result: (r: object) => ({ ...r }),
  } as unknown as BridgeCore;
  const travel = new Travel(core, {} as Menus);
  return { pos, travel };
}

describe("hunt", () => {
  it("runs from one that doesn't count on the way to the grass, then hunts on to one that does", async () => {
    const { pos, travel } = setup();
    const t = travel as unknown as Record<string, unknown>;
    // The walk to the grass starts a battle (the first time), and ends on the grass.
    let walks = 0;
    t.walkSegments = vi.fn(async () => {
      pos.x = 0; pos.y = 0;
      pos.battle = walks++ === 0 ? 1 : 0;
      return "up 1";
    });
    // The first battle is fled (doesn't count); pacing then meets one that counts.
    const counted = { walk: "first encounter" };
    const battles = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(counted);
    t.huntBattle = async (...a: unknown[]) => { pos.battle = 0; return battles(...a); };
    t.walkStraight = vi.fn(async () => ({ moved: 1, stopped: "a battle started" }));

    const r = await travel.hunt(10);
    expect(r).toBe(counted);
    expect(battles).toHaveBeenCalledTimes(2);
  });

  it("returns the battle when the one met on the way counts", async () => {
    const { pos, travel } = setup();
    const t = travel as unknown as Record<string, unknown>;
    t.walkSegments = vi.fn(async () => { pos.battle = 1; return "up 1"; });
    const counted = { walk: "first encounter" };
    t.huntBattle = vi.fn(async () => counted);
    expect(await travel.hunt(10)).toBe(counted);
  });
});
