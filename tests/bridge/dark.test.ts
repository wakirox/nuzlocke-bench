// What the tools show in the dark tunnel: only what a player can see there.

import { describe, expect, it } from "vitest";
import { litSquares, renderDarkView, type OverworldView } from "../../src/bridge/overworld";
import { hideCoords } from "../../src/bridge/summary";
import { gameFor } from "../../src/games";
import { findGrid } from "../../src/ui/map-image";

function view(rows: string[], pc: number, pr: number): OverworldView {
  return { grid: rows, pc, pr, originX: 40, originY: 20 } as unknown as OverworldView;
}

const on = (rows: string[]) => rows.map((r) => [...r].map((ch) => ch === "x"));

describe("renderDarkView", () => {
  it("shows a lit square as what it is, black walls next to lit squares as rock, and the rest as black", () => {
    const v = view(["#.T", ".@D", "#D#"], 1, 1);
    // (0,0) and (2,0) are walls beside lit squares: edges a player can tell; the person at (0,2) is a black sprite.
    expect(renderDarkView(v, on(["..x", "xx.", ".xx"])).split("\n").slice(1)).toEqual(["# ? ?", ". @ ?", "# D #"]);
  });

  it("marks a cave's lit lower floor as on the lit map, so a cliff between the levels isn't taken for a way", () => {
    // Two floor squares lit: one on the cave's lower floor (tile 5, as lowerCaveFloor says), one on the upper floor.
    const v = { grid: ["#..", "#@.", "###"], pc: 1, pr: 1, originX: 0, originY: 0, tiles: [[1, 5, 9], [1, 9, 9], [1, 1, 1]], lowerFloor: (t: number) => t === 5 } as unknown as OverworldView;
    const text = renderDarkView(v, on(["xxx", "..x", "..."]));
    expect(text.split("\n").slice(1)).toEqual(["# , .", "# @ .", "? ? #"]);  // walls touching nothing lit stay unknown
    expect(text).toMatch(/, lower floor/);
  });

  it("keeps a black wall deep in the dark unknown", () => {
    const v = view(["###", "#@.", "..."], 1, 1);
    expect(renderDarkView(v, on(["...", "...", "..."])).split("\n").slice(1)).toEqual(["? ? ?", "? @ ?", "? ? ?"]);
  });

  it("doesn't call lit floor rock or a black wall open (the dark tunnel, 1F, where a model walked into a wall)", () => {
    // The real map around the player, and which squares were lit on that screen (rebuilt from a run's call).
    const real = ["##########", "##########", "#..##...#.", "#..######.", "#..#@...#.", "#..#.D..#.", "#..#....#.", "####....##", "#........."];
    const lit = on(["..........", "..........", "xxx.xxxxxx", "xxx.xxxxxx", "xxx.....xx", "xxx..x..xx", "xxx.....xx", "xxxx....xx", "xx........"]);
    const rows = renderDarkView(view(real, 4, 4), lit).split("\n").slice(1);
    expect(rows[4]).toBe("# . . # @ ? ? ? # .");  // (no tiles here: plain floor) floor at x1-2 shows; the black wall left of @ is the cliff's edge
    expect(rows[2]).toBe("# . . # # . . . # .");
    expect(rows.join(" ")).not.toMatch(/T/);
  });

  it("gives no coordinates", () => {
    const text = renderDarkView(view(["##", "#@"], 1, 1), on(["xx", "xx"]));
    expect(text).not.toMatch(/\b(40|41|20|21)\b/);
    expect(text).not.toMatch(/\by\s*\d/);
  });
});

describe("litSquares", () => {
  const screen = (lit: [number, number][]) => {
    const px = new Uint8ClampedArray(160 * 144 * 4);
    for (let i = 0; i < 160 * 144; i++) px[i * 4] = 0x1e;
    for (const [x, y] of lit) px[(y * 160 + x) * 4] = 0x9e;
    return px;
  };

  it("an all-black screen has nothing lit", () => {
    expect(litSquares(screen([])).flat().some(Boolean)).toBe(false);
  });

  it("ignores a floor's stray dots and finds a square with a pattern", () => {
    const dots: [number, number][] = [[0, 0], [5, 5]];
    const pattern: [number, number][] = [...Array(8).keys()].map((i) => [32 + i, 16 + i]);
    const lit = litSquares(screen([...dots, ...pattern]));
    expect(lit[0][0]).toBe(false);
    expect(lit[1][2]).toBe(true);
    expect(lit.flat().filter(Boolean).length).toBe(1);
  });
});

describe("isDark", () => {
  const mem = (addr: number, value: number) => ({ read8: (a: number) => (a === addr ? value : 0) }) as never;

  it("reads wMapPalOffset at each game's own address", () => {
    expect(gameFor("red").isDark(mem(0xd35d, 6))).toBe(true);
    expect(gameFor("yellow").isDark(mem(0xd35c, 6))).toBe(true);
    expect(gameFor("red").isDark(mem(0xd35c, 6))).toBe(false);
    expect(gameFor("yellow").isDark(mem(0xd35d, 6))).toBe(false);
  });
});

describe("hideCoords", () => {
  it("hides them in the dark and in any battle, and shows them otherwise", () => {
    expect(hideCoords({ dark: true, battle: 0 })).toBe(true);
    expect(hideCoords({ dark: false, battle: 1 })).toBe(true);
    expect(hideCoords({ dark: false, battle: 2 })).toBe(true);
    expect(hideCoords({ dark: false, battle: 0 })).toBe(false);
  });
});

describe("the model panel's picture of a dark map", () => {
  it("finds the dark grid, with no coordinates", () => {
    const text = renderDarkView(view(["#.", ".@"], 1, 1), on(["x.", ".x"])).split("\n");
    const lines = ["📍 somewhere", "Map:", ...text, "Screen: no text"];
    const grid = findGrid(lines);
    expect(grid?.dark).toBe(true);
    expect(grid?.cells).toEqual([["#", "?"], ["?", "@"]]);
    expect(lines.slice(grid!.start, grid!.end)).toEqual(text.slice(1));
  });

  it("leaves a normal map as it was", () => {
    const grid = findGrid(["      1 1", "      0 1", "y  5  # .", "y  6  . @"]);
    expect(grid?.dark).toBeUndefined();
    expect(grid?.x0).toBe(10);
    expect(grid?.ys).toEqual([5, 6]);
  });
});
