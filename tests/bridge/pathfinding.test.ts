// Overworld pathfinding on hand-drawn maps (the same characters get_map shows the model).

import { describe, expect, it } from "vitest";
import { cropView, findPath, markWatched, pathFurthest, pathToEdge, renderView, sightCrossings, toSegments, wayBlockedBy, wayBlocker, type Dir, type OverworldView } from "../../src/bridge/overworld";
import { tilePairBlocked } from "../../src/games/gen1/overworld";

const OX = 10;
const OY = 20;
const STEP: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

/** Builds a view from rows of map characters; `@` is the player. Map coords start at (OX, OY). */
function view(rows: string[], watched: [number, number][] = []): OverworldView {
  const grid = rows.map((r) => [...r]);
  const pr = grid.findIndex((r) => r.includes("@"));
  const pc = grid[pr].indexOf("@");
  const W = grid[0].length;
  return { grid, originX: OX, originY: OY, pc, pr, watched: new Set(watched.map(([c, r]) => r * W + c)) };
}

/** Follows a path square by square (ledges hop two); returns the squares visited, start excluded. */
function follow(v: OverworldView, dirs: Dir[]): [number, number][] {
  let c = v.pc;
  let r = v.pr;
  const out: [number, number][] = [];
  for (const d of dirs) {
    const [dx, dy] = STEP[d];
    const ledge = { v: "down", "<": "left", ">": "right" }[v.grid[r + dy][c + dx]] === d;
    c += dx * (ledge ? 2 : 1);
    r += dy * (ledge ? 2 : 1);
    out.push([c, r]);
  }
  return out;
}

describe("findPath", () => {
  it("finds a shortest way around walls, in map coordinates", () => {
    const v = view([
      "#######",
      "#@..#.#",
      "#.#.#.#",
      "#.....#",
      "#######",
    ]);
    const p = findPath(v, OX + 5, OY + 1)!;
    expect(p.dirs).toHaveLength(8);
    expect(p.face).toBeNull();
    const visited = follow(v, p.dirs);
    expect(visited.at(-1)).toEqual([5, 1]);
    for (const [c, r] of visited) expect(v.grid[r][c]).not.toBe("#");
  });

  it("stops next to a person and says which way to face", () => {
    const v = view([
      "#####",
      "#@.N#",
      "#####",
    ]);
    expect(findPath(v, OX + 3, OY + 1)).toEqual({ dirs: ["right"], face: "right" });
  });

  it("hops ledges one way only", () => {
    const down = view([
      "#####",
      "#.@.#",
      "#vvv#",
      "#...#",
      "#####",
    ]);
    expect(findPath(down, OX + 2, OY + 3)!.dirs).toEqual(["down"]);
    const up = view([
      "#####",
      "#...#",
      "#vvv#",
      "#.@.#",
      "#####",
    ]);
    expect(findPath(up, OX + 2, OY + 1)).toBeNull();
  });

  it("never walks through a door on the way somewhere else", () => {
    const v = view([
      "#####",
      "#@D.#",
      "#...#",
      "#####",
    ]);
    const p = findPath(v, OX + 3, OY + 1)!;
    expect(p.dirs).toHaveLength(4);
    expect(follow(v, p.dirs)).not.toContainEqual([2, 1]);
  });

  it("goes around a trainer's line of sight when it can", () => {
    const v = view([
      "#######",
      "#@....#",
      "#.....#",
      "#######",
    ], [[3, 1]]);
    const p = findPath(v, OX + 5, OY + 1)!;
    expect(p.sightStop).toBeUndefined();
    expect(follow(v, p.dirs)).not.toContainEqual([3, 1]);
    expect(p.dirs).toHaveLength(6);
  });

  it("stops at the edge of a trainer's sight when that's the only way, and says where", () => {
    const v = view([
      "#######",
      "#@....#",
      "#######",
    ], [[3, 1]]);
    expect(findPath(v, OX + 5, OY + 1)).toEqual({ dirs: ["right"], face: null, sightStop: [OX + 3, OY + 1] });
  });

  it("returns null for a target off the view or unreachable", () => {
    const v = view([
      "#####",
      "#@#.#",
      "#####",
    ]);
    expect(findPath(v, OX + 3, OY + 1)).toBeNull();
    expect(findPath(v, OX + 40, OY + 1)).toBeNull();
  });
});

describe("trainers' sight is the player's call", () => {
  // A trainer at map (OX+3, OY+0) looking down the column x = OX+3.
  const field = () => {
    const v = view([
      "###T###",
      "#@....#",
      "#.....#",
      "#.....#",
      "#######",
    ]);
    markWatched(v, [{ index: 1, x: OX + 3, y: OY, dx: 0, dy: 1, onScreen: true, sight: true }], [], 5);
    return v;
  };
  const ignore = { avoidSight: false };

  it("by default (ignore), takes the shortest path and reports whose sight it crosses", () => {
    const p = findPath(field(), OX + 5, OY + 1, ignore)!;
    expect(p.dirs).toEqual(["right", "right", "right", "right"]);
    expect(p.crosses).toEqual([[OX + 3, OY]]);
    expect(p.sightStop).toBeUndefined();
  });

  it("reports nothing when the path stays out of sight", () => {
    const p = findPath(field(), OX + 2, OY + 3, ignore)!;
    expect(p.crosses).toBeUndefined();
  });

  it("with avoid, can't get round a trainer watching the whole width: stops short instead", () => {
    const p = findPath(field(), OX + 5, OY + 1, { avoidSight: true })!;
    expect(p.sightStop).toEqual([OX + 3, OY + 1]);
    expect(p.dirs).toEqual(["right"]);
  });

  it("names the trainer once even if the path walks along its line of sight", () => {
    const v = field();
    expect(sightCrossings(v, ["right", "right", "down", "down"])).toEqual([[OX + 3, OY]]);
  });

  it("applies to edges and travel too", () => {
    const v = view([
      "####.#",
      "#....#",
      "#.@..#",
      "######",
    ]);
    markWatched(v, [{ index: 2, x: OX, y: OY + 1, dx: 1, dy: 0, onScreen: true, sight: true }], [], 5); // looks along row 1
    const edge = pathToEdge(v, "up", ignore)!;
    expect(edge.dirs).toHaveLength(4); // a shortest way to the gap at the top
    expect(follow(v, edge.dirs).at(-1)).toEqual([4, 0]);
    expect(edge.crosses).toEqual([[OX, OY + 1]]);
    expect(pathToEdge(v, "up", { avoidSight: true })?.sightStop).toBeDefined();
    expect(pathFurthest(v, "up", ignore)).not.toBeNull();
  });

  it("ignores beaten trainers either way", () => {
    const v = view([
      "###T###",
      "#@....#",
      "#######",
    ]);
    markWatched(v, [{ index: 1, x: OX + 3, y: OY, dx: 0, dy: 1, onScreen: true, sight: true }], [1], 5);
    expect(findPath(v, OX + 5, OY + 1, { avoidSight: true })).toEqual({ dirs: ["right", "right", "right", "right"], face: null });
  });

  it("gives the rival, gym leaders and the Elite Four no sight: their battles start from the story or a talk", () => {
    const v = view([".T.", "...", ".@."]);
    markWatched(v, [{ index: 1, x: OX + 1, y: OY, dx: 0, dy: 1, onScreen: true, sight: false }], [], 5);
    expect(v.watched?.size ?? 0).toBe(0);
  });
});

describe("pathToEdge", () => {
  it("walks to the open square on the map's edge", () => {
    const v = view([
      "##.##",
      "#...#",
      "#.@.#",
      "#####",
    ]);
    expect(pathToEdge(v, "up")).toEqual({ dirs: ["up", "up"] });
  });
});

describe("toSegments", () => {
  it("collapses repeated steps", () => {
    expect(toSegments(["up", "up", "left", "up"])).toEqual([["up", 2], ["left", 1], ["up", 1]]);
  });
});

describe("renderView", () => {
  it("doesn't say which doors can be walked to from here (a player works that out)", () => {
    const v = view([
      "#D###",
      "#.#D#",
      "#@#.#",
      "#####",
    ]);
    v.exits = [];
    v.doors = [
      { x: OX + 1, y: OY, to: "HOUSE", tx: 2, ty: 7 },
      { x: OX + 3, y: OY + 1, to: "HOUSE", tx: 3, ty: 0 },
    ];
    expect(renderView(v)).toContain("Doors (D): (11,20) → HOUSE (2,7); (13,21) → HOUSE (3,0).");
    expect(renderView(v)).not.toMatch(/reach/);
  });

  it("lists a wide door (squares in a row to the same place) once", () => {
    const v = view([
      "#DDD#",
      "#.@.#",
      "#####",
    ]);
    v.doors = [1, 2, 3].map((dx) => ({ x: OX + dx, y: OY, to: "GATE", tx: 4, ty: 7 }));
    expect(renderView(v)).toContain("Doors (D): (11,20)–(13,20) → GATE (4,7).");
  });
  it("counts the doors in the exits line, a wide door once", () => {
    const v = view([
      "#DDD#",
      "#.@.#",
      "#D###",
    ]);
    v.exits = ["left"];
    v.doors = [
      ...[1, 2, 3].map((dx) => ({ x: OX + dx, y: OY, to: "GATE", tx: 4, ty: 7 })),
      { x: OX + 1, y: OY + 2, to: "HOUSE", tx: 2, ty: 7 },
    ];
    expect(renderView(v)).toMatch(/^Map exits: left, plus 2 doors \(D\)\./);
    v.doors = v.doors.slice(3);
    expect(renderView(v)).toMatch(/^Map exits: left, plus 1 door \(D\)\./);
    v.exits = [];
    expect(renderView(v)).toMatch(/^Map exits: none \(only 1 door \(D\)\)\./);
    v.doors = [];
    v.exits = ["up"];
    expect(renderView(v)).toMatch(/^Map exits: up\.\n/);
  });
});

describe("reachability", () => {
  it("isn't told on the map: no list of what walking can't get to (the user's rule: what a human sees)", () => {
    const v = view([
      '#####.#',
      '#@.N#I#',
      '#vvvv"#',
      '#..T#.#',
      '#######',
    ]);
    v.exits = ["up"];
    expect(renderView(v)).not.toMatch(/reach/);
  });
});

describe("cliff edges", () => {
  it("lists the tile-pair edges the map can't show, in runs", () => {
    const v = view([
      "....",
      ".@..",
      "....",
    ]);
    // Cave tileset: tile 0x05 below tile 0x20 can't be stepped between (pret TilePairCollisionsLand).
    v.stepBlocked = tilePairBlocked(0x11);
    v.tiles = [
      [0x20, 0x20, 0x20, 0x20],
      [0x20, 0x20, 0x20, 0x05],
      [0x05, 0x05, 0x05, 0x05],
    ];
    const out = renderView(v);
    expect(out).toContain("Cliff edges (both sides look walkable, but you can't step across): y20|y21 at x13; y21|y22 at x10–12; x12|x13 at y21.");
    expect(findPath(v, OX + 1, OY + 2)).toBeNull();
  });

  it("draws a cave's two floor levels apart, without changing the paths", () => {
    const v = view(["@.", ".."]);
    v.tiles = [[0x20, 0x20], [0x05, 0x20]];
    v.lowerFloor = (tile) => tile === 0x05;
    const out = renderView(v);
    expect(out).toMatch(/y 21\s+,\s+\./);
    expect(findPath(v, OX, OY + 1)).not.toBeNull();
  });

  it("shows a cliff edge beside a boulder: it's what stops the push", () => {
    const v = view(["@.", "B.", ".."]);
    v.stepBlocked = tilePairBlocked(0x11);
    v.tiles = [[0x20, 0x20], [0x20, 0x20], [0x05, 0x20]];
    expect(renderView(v)).toContain("y21|y22 at x10");
  });

  it("says nothing where there are none", () => {
    const v = view([".@."]);
    v.stepBlocked = tilePairBlocked(0x11);
    v.tiles = [[0x05, 0x05, 0x05]];
    expect(renderView(v)).not.toContain("Cliff edges");
  });
});

describe("counters", () => {
  it("talks to a clerk across the counter, as the game allows", () => {
    // The second town's shop: the clerk (N) behind the counter (=), you come in at the bottom.
    const v = view([
      "########",
      "N=......",
      "#=......",
      "#.......",
      "...@....",
    ]);
    const r = findPath(v, OX, OY + 1);
    expect(r?.face).toBe("left");
    const end = follow(v, r!.dirs).at(-1);
    expect(end).toEqual([2, 1]); // across the counter from the clerk, facing it
  });

  it("still walks right up to people with no counter between", () => {
    const v = view([
      "N...",
      "..@.",
    ]);
    const r = findPath(v, OX, OY);
    expect(r?.face).toBeDefined();
    const end = follow(v, r!.dirs).at(-1) ?? [v.pc, v.pr];
    expect(Math.abs(end[0] - 0) + Math.abs(end[1] - 0)).toBe(1);
  });
});

describe("surfing", () => {
  // Water "~", land "."; the player starts on the water at the left.
  const sea = () => view([
    "~~~~~..~~~..",
    "@~~~~..~~~..",
    "~~~~~..~~~..",
  ]);

  it("crosses water and steps off onto land", () => {
    const v = { ...sea(), surfing: true };
    const r = findPath(v, OX + 5, OY + 1);
    expect(r).not.toBeNull();
    expect(follow(v, r!.dirs).at(-1)).toEqual([5, 1]);
  });

  it("doesn't go back into the water once ashore (that would take SURF again)", () => {
    const v = { ...sea(), surfing: true };
    // Beyond the island the land at x10 is only reachable by water after landing on x5/x6.
    expect(findPath(v, OX + 10, OY + 1)).toBeNull();
    // Water squares are fine targets while surfing.
    expect(findPath(v, OX + 3, OY + 2)).not.toBeNull();
  });

  it("treats water as blocked when not surfing", () => {
    const v = view([
      "..~~..",
      ".@~~..",
    ]);
    expect(findPath(v, OX + 4, OY + 1)).toBeNull();
  });
});

describe("walking to a ledge", () => {
  it("says it's a one-way ledge, which way it hops and where to aim instead", async () => {
    const { ledgeTarget } = await import("../../src/bridge/overworld");
    const v = view([
      "....",
      "#vv.",
      ".@..",
    ]);
    const msg = ledgeTarget(v, OX + 1, OY + 1);
    expect(msg).toMatch(/one-way ledge \(v\): you hop over it going down/);
    expect(msg).toContain(`(${OX + 1}, ${OY + 2})`);
    expect(ledgeTarget(v, OX + 3, OY + 1)).toBeNull(); // the gap
    expect(ledgeTarget(v, OX, OY + 1)).toBeNull(); // a wall: findPath says why
  });
});

describe("map sprites", () => {
  it("draws papers, desk encyclopedias and clipboards as things to read, not people", async () => {
    const { spriteSymbol } = await import("../../src/games/gen1/overworld");
    // The first lab, read from a saved game: two encyclopedias (0x41) on a desk, a person (0x03), a ball (0x3d).
    expect([0x40, 0x41, 0x42].map((p) => spriteSymbol("red", p, 0))).toEqual(["S", "S", "S"]);
    expect([spriteSymbol("red", 0x03, 0), spriteSymbol("red", 0x3d, 0), spriteSymbol("red", 0x3f, 0), spriteSymbol("red", 0x0d, 201)]).toEqual(["N", "I", "B", "T"]);
    // Yellow's ids are shifted: its ball is 0x47, and these three follow its boulder.
    expect([0x4a, 0x4b, 0x4c].map((p) => spriteSymbol("yellow", p, 0))).toEqual(["S", "S", "S"]);
    expect(spriteSymbol("yellow", 0x47, 0)).toBe("I");
  });
});

describe("spinner arrows", () => {
  it("shows which way each spinner points, from its square's top tiles", async () => {
    const { spinnerArrow } = await import("../../src/games/gen1/overworld");
    // The hideout's facility tileset ($16), checked against a screenshot of its floor.
    expect([spinnerArrow(0x16, 0x21, 0x31), spinnerArrow(0x16, 0x20, 0x30), spinnerArrow(0x16, 0x21, 0x21), spinnerArrow(0x16, 0x31, 0x31)]).toEqual(["↑", "↓", "←", "→"]);
    // The last gym's tileset ($07), read from the tiles' own graphics.
    expect([spinnerArrow(0x07, 0x3c, 0x3d), spinnerArrow(0x07, 0x4c, 0x4d), spinnerArrow(0x07, 0x3c, 0x3c), spinnerArrow(0x07, 0x3d, 0x3d)]).toEqual(["↑", "↓", "←", "→"]);
    expect(spinnerArrow(0x16, 0x01, 0x01)).toBe("+"); // not known: stays "+"
  });

  it("are walls to the pathfinder, like the old '+'", () => {
    const v = view([
      ".@→.",
      "....",
    ]);
    const r = findPath(v, OX + 3, OY);
    expect(r).not.toBeNull();
    expect(follow(v, r!.dirs).some(([c, row]) => c === 2 && row === 0)).toBe(false);
  });
});

describe("boulders and floor switches", () => {
  it("walks over a floor switch, around a boulder, and stops facing one", () => {
    const v = view([
      "#######",
      "#@.B.o#",
      "#.....#",
      "#######",
    ]);
    const p = findPath(v, OX + 5, OY + 1)!;
    for (const [c, r] of follow(v, p.dirs)) expect(v.grid[r][c]).not.toBe("B");
    expect(follow(v, p.dirs).at(-1)).toEqual([5, 1]);
    expect(findPath(v, OX + 3, OY + 1)).toEqual({ dirs: ["right"], face: "right" });
  });

  it("a boulder blocks a trainer's sight", () => {
    const v = view([
      "#######",
      "#T.B..#",
      "#@....#",
      "#######",
    ]);
    const W = v.grid[0].length;
    markWatched(v, [{ index: 1, x: OX + 1, y: OY + 1, dx: 1, dy: 0, onScreen: true, sight: true }], [], 5);
    expect(v.watched!.has(1 * W + 2)).toBe(true);
    expect(v.watched!.has(1 * W + 4)).toBe(false);
  });
});

describe("holes in the floor", () => {
  it("are told apart from floor and switches by their tiles, in caves only", async () => {
    const { floorMark } = await import("../../src/games/gen1/overworld");
    expect(floorMark(0x11, 0x2b, 0x2c, 0x2d)).toBe("o");
    expect(floorMark(0x11, 0x2f, 0x2f, 0x22)).toBe("O");
    expect(floorMark(0x11, 0x20, 0x20, 0x20)).toBeNull();
    expect(floorMark(0x00, 0x2f, 0x2f, 0x22)).toBeNull();
  });

  it("paths go around a hole", () => {
    const v = view([
      "#####",
      "#@O.#",
      "#...#",
      "#####",
    ]);
    const p = findPath(v, OX + 3, OY + 1)!;
    for (const [c, r] of follow(v, p.dirs)) expect(v.grid[r][c]).not.toBe("O");
    expect(p.dirs).toHaveLength(4);
  });
});

describe("travel on a whole map (the route past the bridge, as a run saw it)", () => {
  // The route past the bridge, from a real run: the player in the pocket at (15,9). On the screen alone there's no way
  // right; on the whole map the way on goes up and round, through trainers' sight.
  const ROUTE_25 = [
      "############################################....<###########",
      "##########vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv####vvvvvvvvvvvv",
      "##########.#..T#.....#I....#.........#......####........~~~~",
      "vvvvvvvvvv.#...#.....#....C#....T....######S#D##########~~~~",
      "..\".....T............###T#.....#.....T.................#~~~~",
      "..\"\"\"\"\"\"....#.#.#.T..#...#.....#.......................#~~~~",
      "..........##....#.##.#.................................#~~~~",
      "vvvvvvvv#...#T..#....#......##.........................#~~~~",
      "..........#.##..#.T.........#.........~~~~~~....~~~~~~.#~~~~",
      "..........#....@#.#....T....#.........~~~~~~....~~~~~~.#~~~~",
      "######################################~~~~~~....~~~~~~.#~~~~",
      "......................................~~~~~~....~~~~~~.#~~~~",
      "####################################...................#~~~~",
      "########################################################~~~~",
      "####################################~~~~~~~~~~~~~~~~~~~~~~~~",
      "####################################~~~~~~~~~~~~~~~~~~~~~~~~",
      "####################################~~~~~~~~~~~~~~~~~~~~~~~~",
      "####################################~~~~~~~~~~~~~~~~~~~~~~~~"
  ];
  const SIGHT: [number, number][] = [[12, 2], [13, 2], [18, 2], [24, 2], [32, 2], [14, 3], [18, 3], [24, 3], [28, 3], [29, 3], [30, 3], [31, 3], [33, 3], [34, 3], [35, 3], [36, 3], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [9, 4], [10, 4], [11, 4], [12, 4], [13, 4], [14, 4], [18, 4], [32, 4], [33, 4], [34, 4], [35, 4], [36, 4], [38, 4], [39, 4], [40, 4], [41, 4], [42, 4], [8, 5], [23, 5], [24, 5], [32, 5], [37, 5], [8, 6], [23, 6], [24, 6], [32, 6], [37, 6], [14, 7], [15, 7], [23, 7], [24, 7], [32, 7], [37, 7], [19, 8], [20, 8], [21, 8], [22, 8], [23, 8], [24, 8], [32, 8], [37, 8], [19, 9], [20, 9], [21, 9], [22, 9], [24, 9], [25, 9], [26, 9], [27, 9], [37, 9]];

  it("finds the way right out of the pocket when sight is ignored", () => {
    const v = view(ROUTE_25, SIGHT);
    const dirs = pathFurthest(v, "right", { avoidSight: false })!;
    expect(dirs).not.toBeNull();
    expect(follow(v, dirs).at(-1)![0]).toBeGreaterThan(40);
  });

  it("avoiding sight there's no way right, and the way that crosses it says whose sight", () => {
    const v = view(ROUTE_25, SIGHT);
    v.watchers = new Map(SIGHT.map(([c, r]) => [r * ROUTE_25[0].length + c, [[OX + 13, OY + 7]] as [number, number][]]));
    expect(pathFurthest(v, "right", { avoidSight: true })).toBeNull();
    expect(sightCrossings(v, pathFurthest(v, "right", { avoidSight: false })!).length).toBeGreaterThan(0);
  });
});

describe("what blocks an unreachable square (the second town before the cottage visit, as a run saw it)", () => {
  // The player at the second town's west entrance (0,19); map coordinates start at (OX, OY).
  const TOWN_2 = [
      "##############~~~~~#..#...#~~~~~~~~~~~~~",
      "##############~~~~~#..#...#~~~~~~~~~~~~~",
      "##############~~~~~#N.#...#~~~~~~~~~~~~~",
      "######vvvvvvvv~~~~~#..##vv#~~~~~~~~~~~~~",
      "######~~~~~~~~~~~~~#..#...#~~~~~~~~~~~~~",
      "######~~~~~~~~~~~~~#..#...#~~~~~~~~~~~~~",
      "######~#############..#..##############.",
      "######~#...........#..#..#........#####.",
      "######~#...........#..#..#....T...#####.",
      "######~#.D.........#..#..#.D......#####.",
      "######~#############......######..######",
      "vvvvDv~##D##########......#D####..######",
      "....N.~#...................NN...#.....#.",
      "......~#........................#.....#.",
      "~~~~~~~#....##########..........#.....#.",
      "~~~~~~~#.vvv#D########..........#.....##",
      "~~~~~~~#..........####..########........",
      "########..........#DS#vv########........",
      "...............N........########......##",
      "@......................S######D#vvv..v#.",
      "#####..........................N...#..#.",
      "....#....N.................S.......#..#.",
      "....#.......####........####.......#..#.",
      "....#.......####........####.......#..#.",
      "....#.......####..################.#..#.",
      "....#.....#S#D##..#######DS#######.#..#.",
      "....#.......................IN.....#..#.",
      "....#....N.........................#..#.",
      "....############..#C################..#.",
      "....#..........##S#...................#.",
      "....#.................................#.",
      "....#.................................#.",
      "....#.....#....#........#....#........#.",
      "....#######....#vvvvvvvv#....##########.",
      "..........#....#........#....#..........",
      "..........#....#........#....#.........."
  ];

  it("names the person in front of the house door, but not the tree on the way south", () => {
    const v = view(TOWN_2);
    expect(findPath(v, OX + 27, OY + 11, { avoidSight: false })).toBeNull();
    expect(wayBlockedBy(v, OX + 27, OY + 11)).toMatch(/person standing at \(\d+,\d+\)/);
    expect(findPath(v, OX + 20, OY + 31, { avoidSight: false })).toBeNull();
    expect(wayBlockedBy(v, OX + 20, OY + 31)).toBeNull();
  });
});

describe("cropView", () => {
  it("keeps a part of the map with its coordinates, sight lines and doors, and the blocker in it", () => {
    const v = view([
      "#####",
      "#@..#",
      "#.!.#",
      "#B###",
      "#..D#",
      "#####",
    ], [[2, 2]]);
    v.exits = ["up"];
    v.doors = [{ x: OX + 3, y: OY + 4, to: "HOUSE", tx: 1, ty: 1 }, { x: OX + 9, y: OY + 9, to: "AWAY", tx: 0, ty: 0 }];
    const by = wayBlocker(v, OX + 2, OY + 4);
    expect(by).toMatchObject({ x: OX + 1, y: OY + 3, what: `the boulder at (${OX + 1},${OY + 3})` });
    const part = cropView(v, OX + 1, OY + 1, OX + 3, OY + 4);
    expect(part).toMatchObject({ originX: OX + 1, originY: OY + 1, pc: 0, pr: 0, exits: undefined });
    expect(part.grid.map((r) => r.join(""))).toEqual(["@..", ".!.", "B##", "..D"]);
    expect([...part.watched!]).toEqual([1 * 3 + 1]);
    expect(renderView(part)).toContain("Doors (D): (13,24) → HOUSE (1,1).");
    expect(renderView(part)).not.toMatch(/Map exits|AWAY/);
  });

  it("stops at the map's edge", () => {
    const v = view(["@.", ".."]);
    const part = cropView(v, OX - 5, OY - 5, OX + 5, OY + 5);
    expect(part.grid.map((r) => r.join(""))).toEqual(["@.", ".."]);
    expect(part).toMatchObject({ originX: OX, originY: OY });
  });
});

describe("PCs are used from below, facing up (as the game requires)", () => {
  it("walks to the square under the PC and faces up, even when its side is closer", () => {
    // The cottage: the PC at column 3, row 3; the player right of it, as a run stood.
    const v = view([
      "##########",
      "##.#....#.",
      "##........",
      "##.P@.....",
      "##........",
      "##..DD....",
      "##########",
    ]);
    const route = findPath(v, OX + 3, OY + 3, { avoidSight: false })!;
    expect(follow(v, route.dirs).at(-1)).toEqual([3, 4]);
    expect(route.face).toBe("up");
  });
});
