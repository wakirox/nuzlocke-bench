// Walks through the fog of war: walk_to and exit_map guess a way through the squares the run hasn't
// seen. The walks run on a fake world (FakeHost's `world`: the truth, walls and floor), so the walk
// text is the one the bridge produces, not a stub's.

import { beforeAll, describe, expect, it, vi } from "vitest";
import { Travel } from "../../src/bridge/travel";
import { BridgeCore } from "../../src/bridge/bridge-core";
import { SeenMaps } from "../../src/bridge/seen";
import type { Menus } from "../../src/bridge/menus";
import { gen1Adapter } from "../../src/games/gen1";
import { FakeHost, screenRows, seenFrom0, type FakeHostOptions } from "../harness/fake-bridge";

// walkStraight reads document.hidden to decide whether to yield to rendering: no document here.
beforeAll(() => vi.stubGlobal("document", { hidden: true }));

const MAP = 1;
const layout = gen1Adapter("yellow").screen;

/** The bridge and Travel over a fake world, the player at `at`, with what the run has seen as `seen`. */
function fakeWorld(rows: string[], at: [number, number], seen: SeenMaps, extra: Partial<FakeHostOptions> = {}) {
  const host = new FakeHost(layout, [{ rows: screenRows() }], { position: { inWorld: true, map: MAP, x: at[0], y: at[1] }, world: rows, seen, ...extra });
  const core = new BridgeCore(host.asHost());
  return { host, core, travel: new Travel(core, {} as Menus) };
}

// A tower: a shaft up (column 5) through walls, to a room of floor below it. The player stands in the room.
const TOWER = [
  "#####.####", "#####.####", "#####.####", "#####.####",
  "#####.####", "#####.####", "#####.####", "#####.####",
  "..........", "..........", "..........", "..........",
];

describe("walk_to through the fog", () => {
  // A corridor of 16 squares: the run has seen columns 0–7 and 10–15, so columns 8 and 9 are "?".
  const corridor = ["################", "................", "################"];
  const seenWithGap = () => {
    const seen = seenFrom0();
    seen.sawScreen(MAP, 2, 1);
    seen.sawScreen(MAP, 14, 1);
    return seen;
  };

  it("walks a guessed way through unseen squares to a seen target, and says so", async () => {
    // No seen way reaches (13,1), but the unseen floor between does: the walk goes through it.
    const { core, travel } = fakeWorld(corridor, [2, 1], seenWithGap());
    const r = (await travel.walkTo(13, 1, false)) as { walk: string };
    expect(core.host.position().x).toBe(13);
    expect(r.walk).toMatch(/\(no seen way there, so it tried a way through squares you hadn't seen\)$/);
  });

  it("goes on with a guessed way after a leg that ran from a wild battle, and says every leg", async () => {
    // With encounters: flee_uncounted a leg ends "— arrived (ran from MONA)": it still got where it was
    // going. It used to end the walk there, a leg short, and say "arrived" (2026-11-19).
    const { core, travel } = fakeWorld(corridor, [2, 1], seenWithGap());
    const walkSegments = (travel as unknown as { walkSegments: (s: unknown) => Promise<string> }).walkSegments.bind(travel);
    let first = true;
    vi.spyOn(travel as unknown as { walkSegments: (s: unknown) => Promise<string> }, "walkSegments").mockImplementation(async (s) => {
      const out = await walkSegments(s);
      if (!first) return out;
      first = false;
      return `${out} (ran from MONA)`;
    });
    const r = (await travel.walkTo(13, 1, false)) as { walk: string };
    expect(core.host.position().x).toBe(13);
    expect(r.walk).toMatch(/^right \d+\/\d+ \(ran from MONA\); then right \d+\/\d+ — arrived \(no seen way there/);
  });

  it("says where a guessed way stopped, short of the target, instead of arrived", async () => {
    // The unseen gap is a wall: the walk reaches what it has seen, sees the wall, and has no way on.
    const walled = ["################", ".........#......", "################"];
    const { core, travel } = fakeWorld(walled, [2, 1], seenWithGap());
    const r = (await travel.walkTo(13, 1, false)) as { walk: string };
    expect(core.host.position().x).toBe(7);
    expect(r.walk).toMatch(/^right 5\/5 — stopped at \(7, 1\), short of \(13, 1\): no way on there through squares you've seen/);
    expect(r.walk).not.toMatch(/arrived/);
  });

  it("refuses a ? target, which the guess never walks to", async () => {
    const { travel } = fakeWorld(corridor, [2, 1], seenWithGap());
    await expect(travel.walkTo(9, 1, false)).rejects.toThrow(/you haven't seen that square yet/);
  });

  it("says a square past the map's edge it never saw is unseen, not outside the map (that would measure the map)", async () => {
    // The corridor is 16 wide; the run has seen x -2..7 and 10..19 (screens around 2 and 14).
    const { travel } = fakeWorld(corridor, [2, 1], seenWithGap());
    // (30,1): past the edge and never on screen.
    const unseen = await travel.walkTo(30, 1, false).then(() => "", (e: Error) => e.message);
    expect(unseen).toMatch(/you haven't seen that square yet/);
    expect(unseen).not.toMatch(/outside this map/);
    // (17,1): past the edge too, but on the screen around (14,1): the player saw the map end there.
    await expect(travel.walkTo(17, 1, false)).rejects.toThrow(/it's outside this map/);
  });

  it("draws the same error map whether the map ends where the run has seen or goes on (no size given away)", async () => {
    // A wall at x 12 cuts the corridor; seen: x -2..7 and 10..19. One map ends at 19, the other goes on unseen to 29.
    const look = () => {
      const seen = new SeenMaps();
      seen.sawScreen(MAP, 2, 1);
      seen.sawScreen(MAP, 14, 1);
      return seen;
    };
    const errorOf = async (width: number, tx: number) => {
      const row = Array.from({ length: width }, (_, x) => (x === 12 ? "#" : ".")).join("");
      const { travel } = fakeWorld(["#".repeat(width), row, "#".repeat(width)], [2, 1], look());
      return travel.walkTo(tx, 1, false).then(() => "", (e: Error) => e.message.split("\n").slice(1).join("\n"));
    };
    // A seen square past the wall: the map grown to take it in stops at what's been seen, not one past it.
    expect(await errorOf(30, 19)).toBe(await errorOf(20, 19));
    // A square never seen, inside the map or past its edge: the screen either way.
    expect(await errorOf(30, 25)).toBe(await errorOf(20, 25));
  });

  it("with no fog, a target no walk reaches is refused as before, with no guess", async () => {
    // Every square is seen (the screen around (4,1) covers 0–9), so no guess is made.
    const seen = seenFrom0();
    seen.sawScreen(MAP, 4, 1);
    const wall = ["##########", "....#.....", "##########"];
    const { travel } = fakeWorld(wall, [1, 1], seen);
    await expect(travel.walkTo(7, 1, false)).rejects.toThrow(/no walk from where you stand reaches it/);
  });

  it("never leaks '#' over unseen '?' squares inside a sealed lower-floor patch on an off-screen error map", async () => {
    // Columns 5..9 of row 1 are a closed lower-floor patch (tile 1, cliff-edged from floor tile 0):
    // sealedLowerFloor seals all 5 squares to '#' on the raw map before fogging.
    // Screens seen around (1,1) (x <= 6) and (18,1) (x >= 14) leave x = 7..13 unseen ('?').
    const cave = ["################", "....#.....#....#", "################"];
    const seen = seenFrom0();
    seen.sawScreen(MAP, 1, 1);
    seen.sawScreen(MAP, 18, 1);
    const { host, travel } = fakeWorld(cave, [1, 1], seen);
    const baseFull = host.adapter.readFullMap.bind(host.adapter);
    host.adapter.readFullMap = (...args) => {
      const v = baseFull(...args);
      return {
        ...v,
        tiles: cave.map((row, r) => [...row].map((_, c) => (r === 1 && c >= 5 && c <= 9 ? 1 : 0))),
        lowerFloor: (t: number) => t === 1,
        stepBlocked: (a: number, b: number) => a !== b,
      };
    };

    let errText = "";
    try {
      await travel.walkTo(14, 1, false);
    } catch (e) {
      errText = (e as Error).message;
    }
    expect(errText).toMatch(/No path to \(14, 1\)/);
    const row1 = errText.split("\n").find((l) => l.trimStart().startsWith("y  1")) ?? "";
    const cells = row1.trim().replace(/^y\s+\d+\s+/, "").split(/\s+/);
    // Seen part of the sealed patch (x=5, 6) shows as '#'; unseen part (x=7, 8, 9) must stay '?'.
    // The first cell is the ring of '?' at x=-1 (seenPart).
    expect(cells[0]).toBe("?");
    expect(cells[6]).toBe("#");
    expect(cells[7]).toBe("#");
    expect(cells.slice(8, 11)).toEqual(["?", "?", "?"]);
  });
});

describe("exit_map through the fog", () => {
  it("walks a guessed way up to an edge the run hasn't seen, and says so first", async () => {
    // The top of the tower is unseen (the screen around (5,8) covers rows 4–12 only), so no seen way
    // reaches the top edge; the shaft through the unseen rows is the guess.
    const seen = seenFrom0();
    seen.sawScreen(MAP, 5, 8);
    const { core, travel } = fakeWorld(TOWER, [5, 8], seen, { exits: ["up"] });
    const r = (await travel.exitMap("up")) as { walk: string };
    expect(r.walk.startsWith("(no seen way to the up edge: trying one through squares you hadn't seen)")).toBe(true);
    // The guessed way is the shaft: the walk really went up it to the top.
    expect(core.host.position()).toMatchObject({ x: 5, y: 0 });
  });

  it("still throws when there's no way to the edge and no fog to guess through", async () => {
    // Fully seen (the screens around (4,2) and (4,8) cover all of the tower), with the top walled off.
    const seen = seenFrom0();
    seen.sawScreen(MAP, 4, 2);
    seen.sawScreen(MAP, 4, 8);
    const walled = ["##########", "##########", "##########", "##########", ...TOWER.slice(4)];
    const { travel } = fakeWorld(walled, [5, 8], seen, { exits: ["up"] });
    await expect(travel.exitMap("up")).rejects.toThrow(/Can't reach the up edge from here/);
  });

  it("with no edge exits and no door in sight, heads the way asked and says so", async () => {
    // The map has no edge exits and no door seen while the view has "?": look for a way out the way
    // asked (a cave's exit_map up goes up, not down).
    const seen = seenFrom0();
    seen.sawScreen(MAP, 5, 8);
    const { core, travel } = fakeWorld(TOWER, [5, 8], seen, { exits: [], doors: [] });
    const r = (await travel.exitMap("down")) as { walk: string };
    expect(r.walk.startsWith("no door in sight yet down of you, so heading down")).toBe(true);
    expect(core.host.position().y).toBeGreaterThan(8);
  });
});

describe("a guessed way is walked in legs, re-planned as it's seen", () => {
  // A floor corridor 40 squares long; the run has seen only the screen around its start.
  const LONG = ["#".repeat(40), ".".repeat(40), "#".repeat(40)];
  const legsOf = (travel: Travel) => vi.spyOn(travel as unknown as { walkSegments: (s: unknown) => Promise<string> }, "walkSegments");

  it("walk_to reaches a far seen target over an unseen corridor in several legs", async () => {
    // The screen around (36,1) is seen too (x 32–41), so (34,1) is a seen target; x 8–31 is unseen.
    const seen = seenFrom0();
    seen.sawScreen(MAP, 2, 1);
    seen.sawScreen(MAP, 36, 1);
    const { core, travel } = fakeWorld(LONG, [2, 1], seen);
    const legs = legsOf(travel);
    await travel.walkTo(34, 1, false);
    expect(core.host.position().x).toBe(34);
    expect(legs.mock.calls.length).toBeGreaterThan(1);
  });

  it("exit_map walks an unseen corridor to its far edge in several legs", async () => {
    const seen = seenFrom0();
    seen.sawScreen(MAP, 2, 1);
    const { core, travel } = fakeWorld(LONG, [2, 1], seen, { exits: ["right"] });
    const legs = legsOf(travel);
    await travel.exitMap("right");
    expect(core.host.position().x).toBe(39);
    expect(legs.mock.calls.length).toBeGreaterThan(1);
  });
});

describe("exit_map looks for a way out first, then takes one that came into sight", () => {
  // A room of floor, 12 wide and 10 high. Its door (5,8) leads to a Pokémon Center, out of sight at first.
  const ROOM = [
    "............", "............", "............", "............",
    "............", "............", "............", "............",
    ".....D......", "............",
  ];
  const DOORS = [{ x: 5, y: 8, to: "VIRIDIAN_POKECENTER", tx: 3, ty: 7 }];

  it("heads the way asked, then goes through the door that came into sight", async () => {
    const seen = seenFrom0();
    seen.sawScreen(MAP, 5, 2);
    const { core, travel } = fakeWorld(ROOM, [5, 2], seen, { exits: [], doors: DOORS });
    const r = (await travel.exitMap("down")) as { walk: string };
    expect(r.walk).toContain("no door in sight yet down of you, so heading down");
    expect(r.walk).toContain("; then no edge exits here, so out through the door at (5, 8) to VIRIDIAN_POKECENTER");
    expect(core.host.position()).toMatchObject({ x: 5, y: 8 });
  });

  it("doesn't go back out the door behind you when asked the other way (a forest came into from the south)", async () => {
    // The door the player came in by is right below; above is unseen. exit_map up used to take that door.
    const seen = seenFrom0();
    seen.sawScreen(MAP, 5, 7);
    const { core, travel } = fakeWorld(ROOM, [5, 7], seen, { exits: [], doors: DOORS });
    const r = (await travel.exitMap("up")) as { walk: string };
    expect(r.walk).toMatch(/^no door in sight yet up of you, so heading up/);
    expect(core.host.position().y).toBeLessThan(7);
  });

  it("goes out through the doormat you stand on when the way asked is the map's edge (a Crystal room)", async () => {
    // Arrived on the doormat on the bottom row; the rest of the room unseen. Down from it is off the map.
    const MAT = [...ROOM.slice(0, 8), "............", ".....D......"];
    const doors = [{ x: 5, y: 9, to: "VIOLET_CITY", tx: 3, ty: 7 }];
    const seen = seenFrom0();
    seen.sawScreen(MAP, 5, 9);
    const { core, travel } = fakeWorld(MAT, [5, 9], seen, { exits: [], doors });
    const r = (await travel.exitMap("down")) as { walk: string };
    expect(r.walk).toContain("no edge exits here, so out through the door at (5, 9) to VIOLET_CITY");
    expect(core.host.position()).toMatchObject({ x: 5, y: 9 });
    // Up from the same doormat is open floor: that's not the way out, so it heads up instead.
    const up = fakeWorld(MAT, [5, 9], (() => { const s = seenFrom0(); s.sawScreen(MAP, 5, 9); return s; })(), { exits: [], doors });
    expect(((await up.travel.exitMap("up")) as { walk: string }).walk).toMatch(/^no door in sight yet up of you, so heading up/);
  });

  it("out of a building with stairs up beside its exit, takes the door that leads outdoors", async () => {
    // A Crystal Pokémon Center: the exit (two squares) to the town, the stairs up to 2F, both below.
    const CENTER = [...ROOM.slice(0, 9), "..S..DD....."];
    const doors = [
      { x: 2, y: 9, to: "POKECENTER_2F", tx: 0, ty: 7 },
      { x: 5, y: 9, to: "VIOLET_CITY", tx: 31, ty: 25, outside: true },
      { x: 6, y: 9, to: "VIOLET_CITY", tx: 31, ty: 25, outside: true },
    ];
    const seen = seenFrom0();
    seen.sawScreen(MAP, 5, 5);
    const { core, travel } = fakeWorld(CENTER.map((r) => r.replace("S", "D")), [5, 5], seen, { exits: [], doors });
    const r = (await travel.exitMap("down")) as { walk: string };
    expect(r.walk).toContain("out through the door at (5, 9) to VIOLET_CITY");
    expect(core.host.position()).toMatchObject({ x: 5, y: 9 });
    // Doors that all lead outdoors to different places, all of them the way asked: still the player's call.
    const gate = doors.map((d) => ({ ...d, outside: true }));
    const g = fakeWorld(CENTER.map((r) => r.replace("S", "D")), [5, 5], (() => { const s = seenFrom0(); s.sawScreen(MAP, 5, 5); return s; })(), { exits: [], doors: gate });
    await expect(g.travel.exitMap("down")).rejects.toThrow(/This map has no exit down/);
  });

  it("in a gate seen whole, takes the side asked (a town one way, a route the other)", async () => {
    const GATE = ["##########", "D........D", "##########"];
    const doors = [
      { x: 0, y: 1, to: "VIOLET_CITY", tx: 39, ty: 24, outside: true },
      { x: 9, y: 1, to: "ROUTE_31", tx: 4, ty: 7, outside: true },
    ];
    const seen = seenFrom0();
    seen.sawScreen(MAP, 4, 1); // the screen around (4,1) is the whole gate
    // Came through it from the route's side, and been out to the town before: both doors known.
    seen.wentThrough(MAP, 0, 1, MAP + 1, 39, 24);
    seen.wentThrough(MAP, 9, 1, MAP + 2, 4, 7);
    const { core, travel } = fakeWorld(GATE, [4, 1], seen, { exits: [], doors });
    const r = (await travel.exitMap("left")) as { walk: string };
    expect(r.walk).toContain("out through the door at (0, 1) to VIOLET_CITY");
    expect(core.host.position()).toMatchObject({ x: 0, y: 1 });
  });

  it("names that door in the coordinates of the map it's on, not the one it leads to", async () => {
    // This map's (0,0) at its corner; the next map's elsewhere: the door's square is said before going through.
    const seen = new SeenMaps({ squares: {}, doors: {}, origins: { [MAP]: [0, 0], [MAP + 1]: [3, 3] } });
    seen.sawScreen(MAP, 5, 2);
    const { host, travel } = fakeWorld(ROOM, [5, 2], seen, { exits: [], doors: DOORS });
    const walkTo = travel.walkTo.bind(travel);
    vi.spyOn(travel, "walkTo").mockImplementation(async (x, y, interact) => {
      const out = await walkTo(x, y, interact);
      host.moveTo({ map: MAP + 1, x: 4, y: 4 }); // through the door
      return out;
    });
    const r = (await travel.exitMap("down")) as { walk: string };
    expect(r.walk).toContain("out through the door at (5, 8) to VIRIDIAN_POKECENTER");
  });

  it("with no door in sight after heading that way, says so and doesn't look again", async () => {
    const seen = seenFrom0();
    seen.sawScreen(MAP, 5, 2);
    const { travel } = fakeWorld(ROOM, [5, 2], seen, { exits: [], doors: [] });
    const r = (await travel.exitMap("down")) as { walk: string };
    expect(r.walk.startsWith("no door in sight yet down of you, so heading down")).toBe(true);
    expect(r.walk).not.toContain("; then");
  });

  it("with explored set and still no door in sight, throws rather than heading off again", async () => {
    const seen = seenFrom0();
    seen.sawScreen(MAP, 5, 2);
    const { travel } = fakeWorld(ROOM, [5, 2], seen, { exits: [], doors: DOORS });
    await expect(travel.exitMap("down", true)).rejects.toThrow(/No door in sight yet that way/);
  });
});

describe("walks that ran from a wild battle, and ledges", () => {
  type Walker = { walkSegments: (s: [string, number][]) => Promise<string> };
  /** Adds " (ran from MONA)" to every leg that arrived, as encounters: flee_uncounted does on grass. */
  const fleeing = (travel: Travel) => {
    const walker = travel as unknown as Walker;
    const walkSegments = walker.walkSegments.bind(travel);
    const legs: [string, number][][] = [];
    vi.spyOn(walker, "walkSegments").mockImplementation(async (s) => {
      legs.push(s);
      const out = await walkSegments(s);
      return / — arrived$/.test(out) ? `${out} (ran from MONA)` : out;
    });
    return legs;
  };

  it("travel goes on after a leg that ran from a wild battle", async () => {
    const seen = seenFrom0();
    for (let x = 2; x <= 30; x += 4) seen.sawScreen(MAP, x, 1);
    const { travel } = fakeWorld(["#".repeat(30), ".".repeat(30), "#".repeat(30)], [1, 1], seen);
    fleeing(travel);
    const r = (await travel.travel("right", 12, 1)) as { walk: string };
    expect(r.walk).not.toMatch(/stopped: \?/);
  });

  it("exit_map still steps across the edge after running from a wild battle on the way", async () => {
    const seen = seenFrom0();
    seen.sawScreen(MAP, 5, 1);
    const { travel } = fakeWorld(["##########", "..........", "##########"], [1, 1], seen, { exits: ["right"] });
    const legs = fleeing(travel);
    await travel.exitMap("right");
    expect(legs).toContainEqual([["right", 3]]);
  });

  it("says arrived across a counter from a nurse: the way was planned to end there", async () => {
    // The nurse at (2,1) behind the counter at (2,2): talked to from (2,3), two squares away.
    const seen = seenFrom0();
    seen.sawScreen(MAP, 2, 4);
    const { travel } = fakeWorld(["#####", "##H##", "##=##", "#...#", "#...#"], [2, 4], seen);
    const r = (await travel.walkTo(2, 1, false)) as { walk: string };
    expect(r.walk).toMatch(/^up 1\/1 — arrived, facing up/);
  });

  it("counts a ledge hop as the two squares the player moves (a walk counts squares)", async () => {
    const { toSegments } = await import("../../src/bridge/overworld");
    // The player above a ledge (v): down, down (the hop: two squares), down.
    const v = { grid: [["@"], ["."], ["v"], ["."], ["."]], originX: 0, originY: 0, pc: 0, pr: 0 } as never;
    expect(toSegments(["down", "down", "down"], v)).toEqual([["down", 4]]);
    // Without the view: steps, as before.
    expect(toSegments(["down", "down", "down"])).toEqual([["down", 3]]);
  });
});
