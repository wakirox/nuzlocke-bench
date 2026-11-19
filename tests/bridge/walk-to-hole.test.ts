// Travel.walkTo onto a hole, and go_to's hops, with a stubbed core: no ROM, no browser.

import { describe, expect, it, vi } from "vitest";
import { Travel } from "../../src/bridge/travel";
import type { BridgeCore } from "../../src/bridge/bridge-core";
import type { Menus } from "../../src/bridge/menus";

/** A floor with a hole at (2,0); the player at (0,0) on map 1. */
function setup() {
  const pos = { x: 0, y: 0, map: 1, battle: 0 };
  const core = {
    host: { version: () => "red", position: () => ({ ...pos }) },
    alignToVBlank: async () => {},
    view: () => ({ grid: [["@", ".", "O"]], originX: 0, originY: 0, pc: pos.x, pr: 0, exits: [] }),
    sight: () => ({ avoidSight: false }),
    dark: () => false,
    // The map's own coordinates as the model's (an origin at its corner).
    shown: (x: number, y: number) => [x, y],
    shownView: <T>(v: T) => v,
    at: (x: number, y: number) => `(${x}, ${y})`,
    awaitWarp: vi.fn(async () => { pos.map = 2; }),
    mapName: () => (pos.map === 2 ? "FLOOR_BELOW" : "FLOOR"),
    mapText: () => "map",
    tap: vi.fn(async () => {}),
    result: (r: object) => ({ ...r }),
  } as unknown as BridgeCore & { awaitWarp: ReturnType<typeof vi.fn>; tap: ReturnType<typeof vi.fn> };
  const travel = new Travel(core, { advanceText: vi.fn() } as unknown as Menus);
  // The step onto the hole lands there; the fall itself comes later (awaitWarp).
  (travel as unknown as Record<string, unknown>).walkSegments = vi.fn(async () => { pos.x = 2; return "right 2/2 — arrived"; });
  return { core, travel };
}

describe("walk_to a hole", () => {
  it("waits for the fall and reports the floor below, pressing nothing", async () => {
    const { core, travel } = setup();
    const r = (await travel.walkTo(2, 0, true)) as { walk: string; messages?: string[] };
    expect(core.awaitWarp).toHaveBeenCalledTimes(1);
    expect(r.walk).toBe("right 2/2 — arrived, then fell through the hole to FLOOR_BELOW");
    expect(r.messages).toBeUndefined();
    expect(core.tap).not.toHaveBeenCalled();
  });
});

describe("go_to with show_map", () => {
  it("keeps the hops' results from asking for the map, and asks again for the result at the end", async () => {
    const asked: boolean[] = [];
    const core = { mapAsked: true, mapName: () => "A", mapText: () => "map", result: (r: object) => { asked.push(core.mapAsked); return r; } };
    const travel = new Travel(core as unknown as BridgeCore, {} as Menus);
    (travel as unknown as Record<string, unknown>).travelTo = vi.fn(async () => { core.result({ walk: "hop" }); });
    await travel.goTo("B");
    expect(asked).toEqual([false, true]);
  });
});
