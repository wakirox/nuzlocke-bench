// Fog of war: what the run has seen of each map (SeenMaps), the fogged view the bridge shows and
// walks by (BridgeCore.view), and the renderings and paths that read it.

import { describe, expect, it } from "vitest";
import { findPath, renderView, type Door, type OverworldView } from "../../src/bridge/overworld";
import { BridgeCore } from "../../src/bridge/bridge-core";
import { SeenMaps } from "../../src/bridge/seen";
import { gen1Adapter } from "../../src/games/gen1";
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
});
