// Fog-of-war planning and hunting, without walks: seenSteps counts the seen part of a path, a guess
// through unseen sea stays on water, and hunt won't pace grass the run hasn't seen.

import { describe, expect, it, vi } from "vitest";
import { seenSteps, Travel } from "../../src/bridge/travel";
import type { BridgeCore } from "../../src/bridge/bridge-core";
import type { Menus } from "../../src/bridge/menus";
import type { Dir, OverworldView } from "../../src/bridge/overworld";

const OX = 10;
const OY = 20;

/** A view from rows of map characters; `@` is the player (the first one found). */
function view(rows: string[], extra: Partial<OverworldView> = {}): OverworldView {
  const grid = rows.map((r) => [...r]);
  const pr = grid.findIndex((r) => r.includes("@"));
  return { grid, originX: OX, originY: OY, pc: grid[pr].indexOf("@"), pr, ...extra };
}

describe("seenSteps", () => {
  it("counts the steps before the first unseen square", () => {
    expect(seenSteps(view(["@.?"]), ["right", "right"])).toBe(1);
  });

  it("counts a ledge hop as two squares, so a ? it lands on is the first step", () => {
    // The hop over the ledge (v) lands on the ? two squares down: step 0, not step 1.
    expect(seenSteps(view(["@", "v", "?", "."]), ["down", "down"])).toBe(0);
  });

  it("is every step when all the squares are seen", () => {
    expect(seenSteps(view(["@.."]), ["right", "right"])).toBe(2);
  });
});

describe("a guess through unseen squares", () => {
  // Travel's planTo reads only the trainers' sight from the core, and whether it's dark (no guessing then).
  const travel = (dark = false) => new Travel({ sight: () => ({ avoidSight: false }), dark: () => dark } as unknown as BridgeCore, {} as Menus);
  const planTo = (t: Travel, v: OverworldView, x: number, y: number) =>
    (t as unknown as { planTo(v: OverworldView, x: number, y: number): { dirs: Dir[] } | null }).planTo(v, x, y);

  it("takes unseen squares as water while surfing, so the guess swims across the sea", () => {
    // The player surfs at the left; (1,0) is unseen, (2,0) is seen water, (3,0) is seen land.
    const r = planTo(travel(), view(["@?~."], { surfing: true }), OX + 3, OY);
    expect(r?.dirs).toEqual(["right", "right", "right"]);
  });

  it("takes unseen squares as land when not surfing, so no way crosses the water beyond", () => {
    // Land then water: a surfer can't get back onto water from land, but a walker can't cross water at all.
    expect(planTo(travel(), view(["@?~."]), OX + 3, OY)).toBeNull();
  });

  it("never guesses in the dark: a player can't see where an unseen way would go", () => {
    expect(planTo(travel(), view(["@?."]), OX + 2, OY)?.dirs).toEqual(["right", "right"]);
    expect(planTo(travel(true), view(["@?."]), OX + 2, OY)).toBeNull();
    // A way over squares seen in the dark is walked as anywhere else.
    expect(planTo(travel(true), view(["@.."]), OX + 2, OY)?.dirs).toEqual(["right", "right"]);
  });
});

describe("hunt on a fogged map", () => {
  /** A player on floor at (0,0); `raw` is the whole map, `seen` what the run has seen of it. */
  function onMap(raw: string[][], seen: string[][]) {
    const pos = { x: 0, y: 0, battle: 0 };
    const core = {
      summary: () => ({ run: { ruleset: "nuzlocke" }, nuzlocke: { thisArea: null } }),
      host: { position: () => pos },
      view: () => ({ grid: seen, originX: 0, originY: 0, pc: 0, pr: 0, beyond: () => "." }),
      rawView: () => ({ grid: raw, originX: 0, originY: 0, pc: 0, pr: 0 }),
      sight: () => ({ avoidSight: false }),
      dark: () => false,
      textBox: () => ({ open: false }),
      screenText: () => [],
      mapText: () => "map",
      result: (r: object) => ({ ...r }),
    } as unknown as BridgeCore;
    return new Travel(core, {} as Menus);
  }

  it("says no tall grass is seen yet when the map has grass the run hasn't seen", async () => {
    // The grass at (1,0) is on the whole map, but not in what's been seen: nothing to pace yet.
    const travel = onMap([["@", '"']], [["@", "?"]]);
    await expect(travel.hunt(10)).rejects.toThrow(/No tall grass seen yet/);
  });

  it("says walls or ledges are in the way, not a trainer's sight, when the grass can't be walked to", async () => {
    // Grass behind a wall, no trainer anywhere (it used to blame a trainer's sight, 2026-11-19).
    const grid = [["@", "#", '"', '"']];
    await expect(onMap(grid, grid).hunt(10)).rejects.toThrow(/can be walked to from here: walls or one-way ledges are in the way/);
  });

  it("walks to seen grass through unseen squares when no seen way gets there, as walk_to does", async () => {
    // The grass at (3,0) and (4,0) is seen; the only way there is through the unseen (1,0) and (2,0).
    const travel = onMap([["@", ".", ".", '"', '"']], [["@", "?", "?", '"', '"']]);
    const t = travel as unknown as Record<string, unknown>;
    const to: [number, number][] = [];
    t.walkTo = vi.fn(async (x: number, y: number) => { to.push([x, y]); throw new Error("walked"); });
    await expect(travel.hunt(10)).rejects.toThrow("walked");
    expect(to).toEqual([[3, 0]]);
  });

  it("goes on past the nearest grass it can't reach to grass it can", async () => {
    // Fourteen pairs of grass shut in behind a wall are nearer than the two it can reach along the top.
    const grid = [
      ["@", ...Array<string>(20).fill("."), '"', '"'],
      Array<string>(23).fill("#"),
      ["#", ...Array<string>(14).fill('"'), ...Array<string>(8).fill("#")],
    ];
    const travel = onMap(grid, grid);
    const t = travel as unknown as Record<string, unknown>;
    const walked: unknown[] = [];
    t.walkSegments = vi.fn(async (s: unknown) => { walked.push(s); throw new Error("walked"); });
    await expect(travel.hunt(10)).rejects.toThrow("walked");
    expect(walked).toEqual([[["right", 21]]]);
  });

  it("never paces on a door: standing on a cave's entrance mat, it walks to floor first", async () => {
    // The player on the mat at (0,0) of a cave: pacing there would step back out through it.
    const grid = [["@", ".", "."]];
    const travel = onMap(grid, grid);
    const t = travel as unknown as Record<string, unknown>;
    (t.core as Record<string, unknown>).rawView = () => ({ grid, originX: 0, originY: 0, pc: 0, pr: 0, doors: [{ x: 0, y: 0, to: "OUTSIDE", tx: 1, ty: 1 }] });
    const walked: unknown[] = [];
    t.walkSegments = vi.fn(async (s: unknown) => { walked.push(s); throw new Error("walked"); });
    await expect(travel.hunt(10)).rejects.toThrow("walked");
    expect(walked).toEqual([[["right", 1]]]); // off the mat to (1,0), paced with (2,0)
  });

  it("paces floor on a map with no grass at all", async () => {
    // No grass anywhere, so the floor is what to pace: the walk right and back, then the encounter.
    const travel = onMap([["@", ".", "."]], [["@", ".", "."]]);
    const t = travel as unknown as Record<string, unknown>;
    const steps: string[] = [];
    t.walkStraight = vi.fn(async (dir: string) => { steps.push(dir); return { moved: 1, stopped: steps.length === 2 ? "a battle started" : "arrived" }; });
    t.walkSegments = vi.fn(async () => "walked");
    const counted = { walk: "first encounter" };
    t.huntBattle = vi.fn(async () => counted);
    expect(await travel.hunt(10)).toBe(counted);
    expect(steps).toEqual(["right", "left"]);
  });
});
