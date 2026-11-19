// Fog of war: what the run has seen of each map (SeenMaps), the fogged view the bridge shows and
// walks by (BridgeCore.view), and the renderings and paths that read it.

import { describe, expect, it } from "vitest";
import { findPath, renderView, type Door, type OverworldView } from "../../src/bridge/overworld";
import { BridgeCore } from "../../src/bridge/bridge-core";
import { SeenMaps } from "../../src/bridge/seen";
import { gen1Adapter } from "../../src/games/gen1";
import type { Position } from "../../src/games/types";
import { FakeHost, screenRows, type FakeHostOptions } from "../harness/fake-bridge";

const MAP = 1;
const OX = 10;
const OY = 20;
const layout = gen1Adapter("yellow").screen;

/** Builds a view from rows of map characters; `@` is the player. Map coords start at (OX, OY). */
function view(rows: string[]): OverworldView {
  const grid = rows.map((r) => [...r]);
  const pr = grid.findIndex((r) => r.includes("@"));
  return { grid, originX: OX, originY: OY, pc: grid[pr].indexOf("@"), pr };
}

const door = (x: number, y: number, to: string, tx: number | null = 1, ty: number | null = 1): Door => ({ x, y, to, tx, ty });

describe("SeenMaps: the screen", () => {
  it("marks the 10×9 screen around the player seen, and nothing just outside it", () => {
    // The screen is 4 squares left, 5 right, 4 up and 4 down of the player.
    const s = new SeenMaps();
    s.sawScreen(MAP, 10, 10);
    for (const [x, y] of [[6, 6], [15, 6], [6, 14], [15, 14]]) expect(s.has(MAP, x, y)).toBe(true);
    for (const [x, y] of [[5, 10], [16, 10], [10, 5], [10, 15]]) expect(s.has(MAP, x, y)).toBe(false);
  });

  it("merges overlapping screens into one run on each row", () => {
    const s = new SeenMaps();
    s.sawScreen(MAP, 10, 10);
    s.sawScreen(MAP, 14, 10);
    expect(s.data.squares[MAP][10]).toEqual([[6, 19]]);
  });

  it("reports a change once, and not for a screen already seen", () => {
    // The page saves only when something new was seen, so a repeat must not count.
    const s = new SeenMaps();
    s.sawScreen(MAP, 10, 10);
    expect(s.takeChanged()).toBe(true);
    expect(s.takeChanged()).toBe(false);
    s.sawScreen(MAP, 10, 10);
    expect(s.takeChanged()).toBe(false);
  });

  it("answers the same once rebuilt from its saved data", () => {
    // What the autosave stores is SeenMaps.data; a reload must not forget the map.
    const old = new SeenMaps();
    old.sawScreen(MAP, 10, 10);
    const again = new SeenMaps(old.data);
    expect(again.has(MAP, 6, 6)).toBe(true);
    expect(again.has(MAP, 5, 10)).toBe(false);
  });
});

describe("SeenMaps: doors", () => {
  it("knows a door once it has gone through it, and a door next to it", () => {
    // A step away still counts: the poll can catch the player a step before the warp.
    const s = new SeenMaps();
    s.wentThrough(MAP, 10, 10, 2, 1, 1);
    expect(s.knowsDoor(MAP, door(10, 10, "HOUSE"))).toBe(true);
    expect(s.knowsDoor(MAP, door(11, 10, "HOUSE"))).toBe(true);
    expect(s.knowsDoor(MAP, door(12, 10, "HOUSE"))).toBe(false);
  });

  it("knows the arrival door on the map it leads to", () => {
    const s = new SeenMaps();
    s.wentThrough(MAP, 10, 10, 2, 1, 1);
    expect(s.knowsDoor(2, door(1, 1, "OUTSIDE"))).toBe(true);
  });

  it("knows a Pokémon Center, Mart, Gym or department store from outside, before going in", () => {
    // Their roofs and signs say what they are, so their doors are named at once.
    const s = new SeenMaps();
    for (const to of ["VIRIDIAN_POKECENTER", "VIRIDIAN_MART", "PEWTER_GYM", "CELADON_MART_1F", "GOLDENROD_DEPT_STORE_1F", "VIOLET_POKECENTER_1F"]) {
      expect(s.knowsDoor(MAP, door(3, 3, to))).toBe(true);
    }
  });

  it("doesn't know other doors until it has been through them", () => {
    const s = new SeenMaps();
    expect(s.knowsDoor(MAP, door(3, 3, "REDS_HOUSE_1F"))).toBe(false);
    expect(s.knowsDoor(MAP, door(3, 3, "MT_MOON_B1F"))).toBe(false);
  });
});

describe("SeenMaps: a building's bottom-row doormat", () => {
  it("knows a bottom-row door that leads outdoors, without going through it", () => {
    // The doormat on a building's bottom row is the way out: the player sees where it leads.
    const s = new SeenMaps();
    for (const to of ["ROUTE_1", "PALLET_TOWN", "CERULEAN_CITY", "CINNABAR_ISLAND", "INDIGO_PLATEAU"]) {
      expect(s.knowsDoor(MAP, door(3, 8, to), 8)).toBe(true);
    }
  });

  it("doesn't know one a row higher, or one on the bottom row that leads indoors", () => {
    const s = new SeenMaps();
    expect(s.knowsDoor(MAP, door(3, 7, "ROUTE_1"), 8)).toBe(false);
    expect(s.knowsDoor(MAP, door(3, 8, "REDS_HOUSE_2F"), 8)).toBe(false);
    expect(s.knowsDoor(MAP, door(3, 8, "MT_MOON_1F"), 8)).toBe(false);
  });

  it("knows the outdoor doormats of the routes, parks and forests the game names so", () => {
    const s = new SeenMaps();
    for (const to of ["ROUTE_10_NORTH", "SAFARI_ZONE_EAST", "LAKE_OF_RAGE", "VIRIDIAN_FOREST"]) {
      expect(s.knowsDoor(MAP, door(3, 8, to), 8)).toBe(true);
    }
  });

  it("doesn't know a route's gate or a safari rest house as outdoors", () => {
    // Gates and houses are indoors: the doormat leads into a building, not out into the open.
    const s = new SeenMaps();
    expect(s.knowsDoor(MAP, door(3, 8, "ROUTE_2_GATE"), 8)).toBe(false);
    expect(s.knowsDoor(MAP, door(3, 8, "SAFARI_ZONE_EAST_REST_HOUSE"), 8)).toBe(false);
  });

  it("doesn't know it without being told where the bottom row is", () => {
    expect(new SeenMaps().knowsDoor(MAP, door(3, 8, "ROUTE_1"))).toBe(false);
  });
});

describe("SeenMaps.fog", () => {
  // The seen screen is around (10, 10): x 6–15, y 6–14. The view is x 4–7, y 10–12, so x 4 and 5 are unseen.
  // Doors: (5,11) is unseen; (7,12) is seen but not known; (7,10) is known (gone through).
  const fogged = (doors: Door[]) => {
    const s = new SeenMaps();
    s.sawScreen(MAP, 10, 10);
    s.wentThrough(MAP, 7, 10, 9, 0, 0);
    const v: OverworldView = {
      grid: [["#", "~", "#", "."], ["~", "~", "B", "."], ["#", ".", "@", "."]],
      originX: 4,
      originY: 10,
      pc: 2,
      pr: 2,
      doors,
    };
    return s.fog(v, MAP);
  };

  it("shows unseen squares as ? and keeps the symbols of seen ones", () => {
    expect(fogged([]).grid.map((r) => r.join(""))).toEqual(["??#.", "??B.", "??@."]);
  });

  it("drops doors on unseen squares", () => {
    expect(fogged([door(5, 11, "HIDDEN")]).doors).toEqual([]);
  });

  it("shows a seen door the run doesn't know as ?, and keeps the destination of one it does", () => {
    const f = fogged([door(7, 12, "SECRET", 3, 4), door(7, 10, "CAVE", 1, 1)]);
    expect(f.doors).toEqual([{ x: 7, y: 12, to: "?", tx: null, ty: null }, { x: 7, y: 10, to: "CAVE", tx: 1, ty: 1 }]);
  });

  it("lists a door shown as ? in the map text as → ?", () => {
    // A door the run hasn't been through reads as "→ ?" to the model, not as a place.
    expect(renderView(fogged([door(7, 12, "SECRET", 3, 4)]))).toContain("Doors (D): (7,12) → ?.");
  });
});

describe("SeenMaps.fog: the bottom row", () => {
  it("keeps a bottom-row door that leads outdoors when given the bottom row, and shows ? without it", () => {
    // The door is on the map's bottom row (y 10) and seen; the view is one row, so it is that row.
    const s = new SeenMaps();
    s.sawScreen(MAP, 10, 10);
    const v: OverworldView = { grid: [["@", "."]], originX: 6, originY: 10, pc: 0, pr: 0, doors: [door(7, 10, "ROUTE_1")] };
    expect(s.fog(v, MAP, 10).doors).toEqual([door(7, 10, "ROUTE_1")]);
    expect(s.fog(v, MAP).doors).toEqual([{ x: 7, y: 10, to: "?", tx: null, ty: null }]);
  });
});

describe("SeenMaps.fog: a wide door and trainers' sight", () => {
  it("shows both squares of a 2-wide door as known once one of them is", () => {
    // The run came through the door at (7,12) from (7,11); (8,12) is the same door's other square.
    const s = new SeenMaps();
    s.sawScreen(MAP, 10, 10);
    s.wentThrough(MAP, 7, 11, 9, 0, 0);
    const v: OverworldView = { grid: [[".", ".", "."]], originX: 6, originY: 12, pc: 0, pr: 0, doors: [door(7, 12, "SECRET", 3, 4), door(8, 12, "SECRET", 3, 4)] };
    expect(s.fog(v, MAP).doors).toEqual(v.doors);
  });

  it("keeps a seen trainer's sight, and drops sight onto unseen squares and from unseen trainers", () => {
    // Seen: the screen around (10,10), x 6–15, y 6–14. The view is x 4–7, y 10–12: keys are row*4 + column.
    const s = new SeenMaps();
    s.sawScreen(MAP, 10, 10);
    const v: OverworldView = {
      grid: [[".", ".", ".", "."], [".", ".", ".", "."], [".", ".", ".", "."]],
      originX: 4,
      originY: 10,
      pc: 0,
      pr: 0,
      watched: new Set([1, 2, 3]),
      watchers: new Map([
        [1, [[6, 11]]], // (5,10) is unseen: its sight is dropped
        [2, [[6, 11], [4, 12]]], // (6,10) is seen: the seen trainer's sight stays, the unseen one's goes
        [3, [[4, 12]]], // (7,10) is seen, but its only trainer stands on an unseen square
      ]),
    };
    const f = s.fog(v, MAP);
    expect([...f.watched!]).toEqual([2]);
    expect([...f.watchers!]).toEqual([[2, [[6, 11]]]]);
  });
});

describe("walks on a fogged view", () => {
  // A row of twelve squares from the player at the left; the screen around (OX+1) is seen (columns 0–6)
  // and so is the one around (OX+13) (columns 9–11): columns 7 and 8 are unseen.
  const row = () => {
    const s = new SeenMaps();
    s.sawScreen(MAP, OX + 1, OY);
    s.sawScreen(MAP, OX + 13, OY);
    return s.fog(view(["@..........."]), MAP);
  };

  it("walks to squares the run has seen", () => {
    expect(findPath(row(), OX + 6, OY)!.dirs).toHaveLength(6);
  });

  it("finds no path to an unseen square", () => {
    const s = new SeenMaps();
    s.sawScreen(MAP, OX + 1, OY);
    expect(findPath(s.fog(view(["@........."]), MAP), OX + 9, OY)).toBeNull();
  });

  it("doesn't walk up to an unseen square next to the seen ones as if it were a sign", () => {
    // Column 7 is the first "?": walking there would stop at 6 and say "arrived".
    expect(findPath(row(), OX + 7, OY)).toBeNull();
  });

  it("finds no path through unseen squares, even to a seen square beyond them", () => {
    // The way on is through columns 7 and 8, which are "?": a walk never crosses them.
    expect(findPath(row(), OX + 11, OY)).toBeNull();
  });
});

describe("BridgeCore.view: what the player is shown and walks by", () => {
  // A 12×10 view (x 5–16, y 6–15) around the player at (10,10) on MAP. The screen the run has seen
  // is x 6–15, y 6–14, so the view's first column and its last row are unseen.
  const wide = (): OverworldView => {
    const grid = Array.from({ length: 10 }, () => Array<string>(12).fill("."));
    grid[4][5] = "@";
    return { grid, originX: 5, originY: 6, pc: 5, pr: 4 };
  };

  function coreFor(seen: SeenMaps | null, trainers: FakeHostOptions["trainers"] = [], absent = false): BridgeCore {
    const host = new FakeHost(layout, [{ rows: screenRows() }], { position: { inWorld: true, map: MAP, x: 10, y: 10 }, view: wide(), seen, trainers });
    const h = host.asHost();
    if (absent) delete h.seen;
    return new BridgeCore(h);
  }

  it("marks the current screen seen and shows the rest of the view as ?", () => {
    const seen = new SeenMaps();
    const v = coreFor(seen).view(false);
    expect(seen.has(MAP, 6, 6)).toBe(true);
    expect(v.grid[0][0]).toBe("?");
    expect(v.grid[4][5]).toBe("@");
  });

  it("fogs the whole map the same way", () => {
    const v = coreFor(new SeenMaps()).view(true);
    expect(v.grid[0][0]).toBe("?");
    expect(v.grid[4][5]).toBe("@");
  });

  it("leaves the view unchanged when the host has no seen()", () => {
    expect(coreFor(null, [], true).view(false).grid.flat()).not.toContain("?");
  });

  it("leaves the view unchanged when seen() returns null", () => {
    expect(coreFor(null).view(false).grid.flat()).not.toContain("?");
  });

  it("rawView never fogs, and doesn't mark the screen seen", () => {
    const seen = new SeenMaps();
    expect(coreFor(seen).rawView(false).grid.flat()).not.toContain("?");
    expect(seen.has(MAP, 6, 6)).toBe(false);
  });

  it("leaves trainers on unseen squares out of the Trainers line", () => {
    // (8,8) is on the seen screen; (5,7) is in the unseen first column.
    const text = coreFor(new SeenMaps(), [
      { x: 8, y: 8, name: "BUG CATCHER", beaten: false },
      { x: 5, y: 7, name: "LASS", beaten: false },
    ]).mapText(true);
    expect(text).toContain("Trainers (T): (8,8) BUG CATCHER.");
    expect(text).not.toContain("LASS");
  });

  it("compactGrids keeps unseen squares as ? (untrimmed) and omits unseen targets from Points", async () => {
    // @ts-expect-error plain ESM module without type declarations
    const { compactGrids } = await import("../../mcp-server/format.mjs");
    // Player at (10,10): x 6–15, y 6–14 are seen; column 0 (x=5) and row 9 (y=15) are unseen.
    const grid = Array.from({ length: 10 }, () => Array<string>(12).fill("."));
    grid[4][5] = "@";
    grid[2][3] = "I"; // (8,8): seen item
    grid[0][0] = "C"; // (5,6): unseen Cut tree
    grid[9][2] = "P"; // (7,15): unseen PC
    grid[9][3] = "B"; // (8,15): unseen boulder
    grid[9][4] = "o"; // (9,15): unseen floor switch
    grid[9][5] = "S"; // (10,15): unseen sign/switch
    const host = new FakeHost(layout, [{ rows: screenRows() }], {
      position: { inWorld: true, map: MAP, x: 10, y: 10 },
      view: { grid, originX: 5, originY: 6, pc: 5, pr: 4 },
      seen: new SeenMaps(),
    });
    const compact = compactGrids(new BridgeCore(host.asHost()).mapText(true));
    expect(compact).toContain("Points: I (8,8).");
    expect(compact).not.toMatch(/\(5,6\)|\(7,15\)|\(8,15\)|\(9,15\)|\(10,15\)/);
    // Unseen row y=15 and unseen column x=5 stay as ? (not trimmed like rock #).
    expect(compact).toContain("y 15   ?????");
  });

  it("lists only seen items, Cut trees, PCs, boulders and switches under the map, hiding unseen ones", () => {
    // Player at (10,10): seen screen is x 6–15, y 6–14; column 0 (x=5) and row 9 (y=15) are unseen.
    const grid = Array.from({ length: 10 }, () => Array<string>(12).fill("."));
    grid[4][5] = "@";
    // Seen squares: I at (8,8), S at (12,9).
    grid[2][3] = "I";
    grid[3][7] = "S";
    // Unseen squares: I at (5,6), C at (5,8), P at (7,15), B at (8,15), o at (9,15), S at (10,15).
    grid[0][0] = "I";
    grid[2][0] = "C";
    grid[9][2] = "P";
    grid[9][3] = "B";
    grid[9][4] = "o";
    grid[9][5] = "S";
    const host = new FakeHost(layout, [{ rows: screenRows() }], {
      position: { inWorld: true, map: MAP, x: 10, y: 10 },
      view: { grid, originX: 5, originY: 6, pc: 5, pr: 4 },
      seen: new SeenMaps(),
    });
    const core = new BridgeCore(host.asHost());
    // Default (mapPoints off): never produces coordinate lines.
    expect(core.mapText(true)).not.toMatch(/Items \(I\)|Things to read/);
    // Enabled: lists only seen targets, hiding unseen ones.
    core.mapPoints = true;
    const text = core.mapText(true);
    expect(text).toContain("Items (I): (8,8).");
    expect(text).toContain("Things to read or use (S): (12,9).");
    expect(text).not.toContain("(5,6)");
    expect(text).not.toContain("(10,15)");
    expect(text).not.toMatch(/Cut trees|PCs|Boulders|Floor switches/);
  });

  it("emits no coordinate list in a dark cave even when mapPoints is enabled", () => {
    const grid = Array.from({ length: 9 }, () => Array<string>(10).fill("."));
    grid[4][4] = "@";
    grid[4][5] = "I";
    grid[3][4] = "S";
    const host = new FakeHost(layout, [{ rows: screenRows() }], {
      position: { inWorld: true, map: MAP, x: 10, y: 10 },
      view: { grid, originX: 6, originY: 6, pc: 4, pr: 4 },
      seen: new SeenMaps(),
    });
    const core = new BridgeCore(host.asHost());
    core.mapPoints = true;
    core.dark = () => true;
    core.screenPixels = () => new Uint8ClampedArray(160 * 144 * 4);
    const text = core.mapText(true);
    expect(text).toMatch(/^It.s dark/);
    expect(text).not.toMatch(/Items \(I\)|Things to read/);
  });
});

describe("BridgeCore.noteSeen: the run's memory as the player moves", () => {
  // The player starts on MAP at (7,1), in the world; the position is changed with moveTo.
  function movable(seen: SeenMaps, position: Partial<Position> = {}) {
    const host = new FakeHost(layout, [{ rows: screenRows() }], { position: { inWorld: true, map: MAP, x: 7, y: 1, ...position }, seen });
    return { host, core: new BridgeCore(host.asHost()) };
  }

  it("marks the screen seen at each new position", () => {
    const seen = new SeenMaps();
    const { host, core } = movable(seen);
    core.noteSeen();
    host.moveTo({ x: 9 });
    core.noteSeen();
    // The screen around (9,1) reaches x 14; the one around (7,1) stopped at x 12.
    expect(seen.has(MAP, 14, 1)).toBe(true);
    expect(seen.has(MAP, 15, 1)).toBe(false);
  });

  it("records a warp's door on the next look on the new map, once the arrival has settled", () => {
    // The first look after a warp may read the arrival before it's settled, so the door waits for the next.
    const seen = new SeenMaps();
    const { host, core } = movable(seen);
    core.noteSeen();
    host.moveTo({ map: 2, x: 3, y: 3 });
    core.noteSeen();
    expect(seen.knowsDoor(2, door(3, 3, "MT_MOON_B1F"))).toBe(false);
    core.noteSeen();
    expect(seen.knowsDoor(2, door(3, 3, "MT_MOON_B1F"))).toBe(true);
    expect(seen.knowsDoor(MAP, door(7, 1, "MT_MOON_B1F"))).toBe(true);
  });

  it("marks nothing in a battle", () => {
    const seen = new SeenMaps();
    const { host, core } = movable(seen, { battle: true });
    core.noteSeen();
    host.moveTo({ x: 9 });
    core.noteSeen();
    expect(seen.has(MAP, 7, 1)).toBe(false);
  });

  it("marks nothing when the player isn't in the world (a menu or title screen)", () => {
    const seen = new SeenMaps();
    const { host, core } = movable(seen);
    host.moveTo({ inWorld: false });
    core.noteSeen();
    expect(seen.has(MAP, 7, 1)).toBe(false);
  });

  it("is called by tap, so a press that moves the player marks where it went", async () => {
    const seen = new SeenMaps();
    const { host, core } = movable(seen);
    host.moveTo({ x: 20, y: 5 });
    expect(seen.has(MAP, 20, 5)).toBe(false);
    await core.tap("right");
    expect(seen.has(MAP, 20, 5)).toBe(true);
  });

  it("forgets where the player stood after a battle, so the next map change records no door", () => {
    // A whiteout's trip to a Pokémon Center isn't a door walked through.
    const seen = new SeenMaps();
    const { host, core } = movable(seen);
    core.noteSeen();
    host.moveTo({ battle: true });
    core.noteSeen();
    host.moveTo({ battle: false, map: 2, x: 3, y: 3 });
    core.noteSeen();
    core.noteSeen();
    expect(seen.knowsDoor(MAP, door(7, 1, "MT_MOON_B1F"))).toBe(false);
  });

  it("records no door for a map change made by a field move or an item", () => {
    // Dig, Teleport, Fly and an Escape Rope change maps without a door.
    const seen = new SeenMaps();
    const { host, core } = movable(seen);
    core.noteSeen();
    core.mapChangeIsNoDoor = true;
    host.moveTo({ map: 2, x: 3, y: 3 });
    core.noteSeen();
    core.noteSeen();
    expect(seen.knowsDoor(MAP, door(7, 1, "MT_MOON_B1F"))).toBe(false);
    expect(seen.knowsDoor(2, door(3, 3, "MT_MOON_B1F"))).toBe(false);
  });

  it("records the door at once on a settled look right after the map changed", () => {
    // The caller knows the game has settled on the new map, so no second look is needed.
    const seen = new SeenMaps();
    const { host, core } = movable(seen);
    core.noteSeen();
    host.moveTo({ map: 2, x: 3, y: 3 });
    core.noteSeen(true);
    expect(seen.knowsDoor(2, door(3, 3, "MT_MOON_B1F"))).toBe(true);
    expect(seen.knowsDoor(MAP, door(7, 1, "MT_MOON_B1F"))).toBe(true);
  });
});
