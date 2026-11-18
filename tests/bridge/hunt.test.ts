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

  it("turns back after running from a battle, instead of stepping off the water", async () => {
    // Two water squares at x 0-1, land beyond; the player starts on (0,0).
    const pos = { x: 0, y: 0, battle: 0 };
    const core = {
      summary: () => ({ run: { ruleset: "nuzlocke" }, nuzlocke: { thisArea: mixed } }),
      host: { position: () => pos },
      view: () => ({ grid: [["@", "~", ".", "."]], originX: 0, originY: 0, pc: pos.x, pr: 0, surfing: true }),
      sight: () => ({ avoidSight: false }),
      textBox: () => ({ open: false }),
      screenText: () => [],
      mapText: () => "map",
      result: (r: object) => ({ ...r }),
    } as unknown as BridgeCore;
    const travel = new Travel(core, {} as Menus);
    const t = travel as unknown as Record<string, unknown>;
    const xs: number[] = [];
    // Every step arrives and starts a battle (the battle starts on the square stepped onto).
    t.walkStraight = vi.fn(async (dir: string) => {
      pos.x += dir === "right" ? 1 : -1;
      xs.push(pos.x);
      return { moved: 1, stopped: "a battle started" };
    });
    const counted = { walk: "first encounter" };
    t.huntBattle = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce(counted);
    expect(await travel.hunt(10)).toBe(counted);
    expect(xs).toEqual([1, 0, 1]);
  });
});

describe("hunt's pair of squares", () => {
  const onFloor = (grid: string[][], extra: object = {}, under = '"') => {
    const pos = { x: 0, y: 0, battle: 0 };
    const core = {
      summary: () => ({ run: { ruleset: "nuzlocke" }, nuzlocke: { thisArea: null } }),
      host: { position: () => pos },
      view: () => ({ grid, originX: 0, originY: 0, pc: 0, pr: 0, beyond: () => under, ...extra }),
      sight: () => ({ avoidSight: false }),
      textBox: () => ({ open: false }),
      screenText: () => [],
      mapText: () => "map",
      result: (r: object) => ({ ...r }),
    } as unknown as BridgeCore;
    const travel = new Travel(core, {} as Menus);
    const t = travel as unknown as Record<string, unknown>;
    const steps: string[] = [];
    t.walkStraight = vi.fn(async (dir: string) => { steps.push(dir); return { moved: 1, stopped: steps.length === 2 ? "a battle started" : "arrived" }; });
    // The walk to a pair ends on the nearest square that has one (x 1 in these maps).
    t.walkSegments = vi.fn(async () => { pos.x = 1; return "walked"; });
    t.huntBattle = vi.fn(async () => ({ walk: "first encounter" }));
    return { travel, steps, walkSegments: t.walkSegments as ReturnType<typeof vi.fn> };
  };

  it("paces from the grass square you stand on (drawn as @)", async () => {
    const { travel, steps, walkSegments } = onFloor([["@", '"', "."]]);
    await travel.hunt(10);
    expect(walkSegments).not.toHaveBeenCalled();
    expect(steps).toEqual(["right", "left"]);
  });

  it("doesn't pace across a cliff edge between two cave floor squares", async () => {
    // Cave floor at x 0-2 (no grass): a cliff edge between x 0 and x 1, so the pair is x 1-2.
    const tiles = [[1, 2, 2]];
    const stepBlocked = (a: number, b: number) => a !== b;
    const { travel, steps, walkSegments } = onFloor([["@", ".", "."]], { tiles, stepBlocked }, ".");
    await travel.hunt(10);
    // The square you're on has no pair across the edge: it walks to x 1 and paces x 1-2.
    expect(walkSegments).toHaveBeenCalledTimes(1);
    expect(steps).toEqual(["right", "left"]);
  });
});

describe("hunt refusals", () => {
  it("still refuses an area with nothing that would count", async () => {
    const core = {
      summary: () => ({ run: { ruleset: "nuzlocke" }, nuzlocke: { thisArea: "every Pokémon here is a dupe (RATTY) — nothing to catch, skip it" } }),
      host: { position: () => ({ x: 0, y: 0, battle: 0 }) },
    } as unknown as BridgeCore;
    await expect(new Travel(core, {} as Menus).hunt(10)).rejects.toThrow(/Nothing to hunt here/);
  });
});
