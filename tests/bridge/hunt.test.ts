// Travel.hunt with a stubbed core: no ROM, no browser. A wild Pokémon that doesn't count can jump
// out on the way to the grass; with flee_uncounted the hunt runs from it and goes on, and never
// returns an empty result (a run's hunt crashed the result formatter that way, 2026-11-12).

import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/bridge/overworld", async (orig) => ({
  ...(await orig<typeof import("../../src/bridge/overworld")>()),
  // One step to the grass, whatever the square.
  findPath: () => ({ dirs: ["up"], sightStop: false }),
}));

import { Travel, huntableIn } from "../../src/bridge/travel";
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

describe("where an area's encounter would count (its note)", () => {
  it("reads land, water, both or neither from the note", () => {
    const one = "first encounter still available (one for this area, in the grass or on the water: whichever comes first)";
    expect(huntableIn("first encounter still available — would count: RATTY, BIRDY")).toEqual({ land: true, water: false });
    expect(huntableIn("first encounter still available — would count while surfing: JELLY")).toEqual({ land: false, water: true });
    expect(huntableIn(`${one} — would count: JELLY while surfing (everything in the grass is a dupe)`)).toEqual({ land: false, water: true });
    expect(huntableIn(`${one} — would count: RATTY in the grass (everything on the water is a dupe)`)).toEqual({ land: true, water: false });
    expect(huntableIn(`${one} — would count: RATTY in the grass, or JELLY while surfing`)).toEqual({ land: true, water: true });
    expect(huntableIn("every Pokémon here is a dupe (RATTY, JELLY) — nothing to catch, skip it")).toEqual({ land: false, water: false });
    expect(huntableIn("first encounter still available (no grass, cave or surfing encounters on this map)")).toEqual({ land: false, water: false });
  });
});

describe("hunt on the water", () => {
  const onRoute = (thisArea: string, grid: string[][], surfing: boolean) => {
    const pos = { x: 0, y: 0, battle: 0 };
    const core = {
      summary: () => ({ run: { ruleset: "nuzlocke" }, nuzlocke: { thisArea } }),
      host: { position: () => pos },
      view: () => ({ grid, originX: 0, originY: 0, pc: 0, pr: 0, surfing }),
      sight: () => ({ avoidSight: false }),
      textBox: () => ({ open: false }),
      screenText: () => [],
      mapText: () => "map",
      result: (r: object) => ({ ...r }),
    } as unknown as BridgeCore;
    return new Travel(core, {} as Menus);
  };
  const mixed = "first encounter still available (one for this area, in the grass or on the water: whichever comes first) — would count: JELLY while surfing (everything in the grass is a dupe)";

  it("hunts a route whose grass is all dupes when the water still counts, pacing the water", async () => {
    const travel = onRoute(mixed, [["~", "~", '"', '"']], true);
    const t = travel as unknown as Record<string, unknown>;
    const steps: string[] = [];
    t.walkStraight = vi.fn(async (dir: string) => { steps.push(dir); return { moved: 1, stopped: steps.length === 3 ? "a battle started" : "arrived" }; });
    const counted = { walk: "first encounter" };
    t.huntBattle = vi.fn(async () => counted);
    expect(await travel.hunt(10)).toBe(counted);
    // Between the two water squares, never onto the grass.
    expect(steps).toEqual(["right", "left", "right"]);
  });

  it("says to surf first when only the water counts and you're on land", async () => {
    await expect(onRoute(mixed, [['"', '"']], false).hunt(10)).rejects.toThrow(/Surf first/);
    await expect(onRoute("first encounter still available — would count while surfing: JELLY", [[".", "."]], false).hunt(10)).rejects.toThrow(/Surf first/);
  });

  it("still refuses an area with nothing that would count", async () => {
    await expect(onRoute("every Pokémon here is a dupe (RATTY) — nothing to catch, skip it", [['"', '"']], false).hunt(10)).rejects.toThrow(/Nothing to hunt here/);
  });
});
