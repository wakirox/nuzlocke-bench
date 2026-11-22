// The dark (0.3.0): what the dark view showed stays on that map, as a player remembers the corridor
// they just walked through, in the same coordinates as a lit map (counted from where the run
// arrived); walks go over those squares only, never guessing through the dark.

import { beforeAll, describe, expect, it, vi } from "vitest";
import { AiBridge } from "../../src/bridge/ai-bridge";
import { BridgeCore } from "../../src/bridge/bridge-core";
import { DARK_HEADER, type OverworldView } from "../../src/bridge/overworld";
import { SeenMaps } from "../../src/bridge/seen";
import { Travel } from "../../src/bridge/travel";
import type { Menus } from "../../src/bridge/menus";
import { gen1Adapter } from "../../src/games/gen1";
import { FakeHost, screenRows } from "../harness/fake-bridge";

// walkStraight reads document.hidden to decide whether to yield to rendering: no document here.
beforeAll(() => vi.stubGlobal("document", { hidden: true }));
// The bridge's disk-backed store needs IndexedDB; here nothing is stored.
vi.mock("../../src/storage", () => ({
  KEYS: { routes: "routes" },
  kv: { get: async () => undefined, set: async () => undefined },
}));

const MAP = 1;
const layout = gen1Adapter("yellow").screen;

// A dark corridor 2..27 wide along row 4, a ladder at its far end (26,4); rock all around.
const WORLD = Array.from({ length: 9 }, (_, y) => Array.from({ length: 30 }, (_, x) => (y === 4 && x >= 2 && x <= 27 ? "." : "#")).join(""));

/** The screen's pixels in a dark cave: a floor square's pattern shows, rock is black (see litSquares). */
function pixels(host: FakeHost): Uint8ClampedArray {
  const p = host.asHost().position();
  const out = new Uint8ClampedArray(160 * 144 * 4);
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 10; c++) {
      if (WORLD[p.y - 4 + r]?.[p.x - 4 + c] !== ".") continue;
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) out.fill(255, ((r * 16 + y) * 160 + c * 16 + x) * 4, ((r * 16 + y) * 160 + c * 16 + x) * 4 + 3);
    }
  }
  return out;
}

/** The dark corridor, the player arriving at (5,4): that's (0,0) for the model. */
function darkCave(seen = new SeenMaps()) {
  const host = new FakeHost(layout, [{ rows: screenRows() }], {
    position: { inWorld: true, map: MAP, x: 5, y: 4 },
    world: WORLD,
    doors: [{ x: 26, y: 4, to: "?", tx: null, ty: null }],
    seen,
  });
  const core = new BridgeCore(host.asHost());
  core.dark = () => true;
  core.screenPixels = () => pixels(host);
  core.screenText = () => []; // no text box over the cave (the fake's screen has one)
  return { host, core, seen, travel: new Travel(core, {} as Menus) };
}

/** The map text's rows, keyed by y, each a string of its squares; and the first column's x. */
function grid(text: string): { x0: number; rows: Record<number, string> } {
  const lines = text.split("\n");
  const head = lines.find((l) => /^ {5}(?: *-?\d)+$/.test(l)) ?? "";
  const rows: Record<number, string> = {};
  for (const l of lines.filter((l) => /^y[ \d-]{3} /.test(l))) rows[Number(l.slice(1, 4))] = l.slice(5).trim().split(/ +/).join("");
  return { x0: Number(head.trim().split(/ +/)[0]), rows };
}

describe("SeenMaps: the dark", () => {
  it("remembers every square the dark view showed but the dark and the player", () => {
    const s = new SeenMaps();
    s.sawDark(MAP, [["#", "?"], [".", "@"]], 10, 20);
    expect(s.data.dark).toEqual({ [MAP]: { "10,20": "#", "10,21": "." } });
    expect(s.takeChanged()).toBe(true);
    s.sawDark(MAP, [["#", "?"], [".", "@"]], 10, 20);
    expect(s.takeChanged()).toBe(false);
  });

  it("fogs a dark map down to what it showed, as it showed then (a person since is a black sprite)", () => {
    const s = new SeenMaps();
    s.sawDark(MAP, [["#", ".", ","]], 0, 0);
    const v = { grid: [["#", "N", ".", "D"], [".", "@", ".", "."]], originX: 0, originY: 0, pc: 1, pr: 1 } as unknown as OverworldView;
    // (1,0) was floor when seen and has a person on it now: still floor. A lower floor is "." on the grid (renderView draws it ",").
    expect(s.fogDark(v, MAP).grid).toEqual([["#", ".", ".", "?"], ["?", "@", "?", "?"]]);
  });

  it("shows no trainer's sight in the dark, even from one standing on a square remembered as floor", () => {
    const s = new SeenMaps();
    s.sawDark(MAP, [[".", ".", "."]], 0, 0);
    const v = {
      grid: [[".", "T", "."], ["#", "@", "#"]], originX: 0, originY: 0, pc: 1, pr: 1,
      watched: new Set([0, 2]), watchers: new Map([[0, [[1, 0]]], [2, [[1, 0]]]]),
    } as unknown as OverworldView;
    const fogged = s.fogDark(v, MAP);
    expect(fogged.watched).toBeUndefined();
    expect(fogged.watchers).toBeUndefined();
    expect(fogged.grid[0]).toEqual([".", ".", "."]);
  });

  it("is kept with the run's seen data; runs that never were in the dark save no dark field", () => {
    const s = new SeenMaps();
    s.sawDark(MAP, [["."]], 3, 3);
    expect(new SeenMaps(structuredClone(s.data)).data.dark).toEqual({ [MAP]: { "3,3": "." } });
    expect(new SeenMaps().data).not.toHaveProperty("dark");
  });
});

describe("BridgeCore: the dark map", () => {
  it("shows the corridor walked through, in coordinates counted from where the run arrived", () => {
    const { host, core, seen } = darkCave();
    expect(core.mapText().startsWith(`${DARK_HEADER}\n`)).toBe(true); // the end of a move at (5,4): the screen x 1..10
    host.moveTo({ x: 15 });
    // The screen at (15,4): x 11..20, as 6..15 in the model's coordinates.
    const screen = grid(core.mapText());
    expect(screen.x0).toBe(6);
    expect(screen.rows[0]).toBe("....@.....");
    // The whole map: every square seen in the dark, the first stop (0,0) remembered as floor, in a ring of "?".
    const whole = grid(core.mapText(true));
    expect(whole.x0).toBe(-5);
    expect(whole.rows[0]).toBe("?#.............@.....?");
    expect(whole.rows[-1]).toBe("??###################?");
    expect(whole.rows[-2]).toBe("?".repeat(22));
    expect(Object.keys(whole.rows).map(Number).sort((a, b) => a - b)).toEqual([-2, -1, 0, 1, 2]);
    // Nothing went into the lit memory: a map lit later (Flash) shows what it always did.
    expect(seen.data.squares).toEqual({});
  });

  it("notes the ladder just come down when the move's map is read in the dark, and sets the map's origin there", () => {
    const { host, core, seen } = darkCave();
    host.moveTo({ map: MAP + 1, x: 20, y: 4 });
    core.noteSeen(); // on the floor above: where the ladder down is
    host.moveTo({ map: MAP, x: 26, y: 4 });
    core.noteSeen(); // just warped: not settled yet
    core.mapText(); // the move's result reads the map: settled now
    expect(seen.data.doors[MAP]).toEqual([[26, 4]]);
    expect(seen.data.doors[MAP + 1]).toEqual([[20, 4]]);
    expect(seen.origin(MAP)).toEqual([26, 4]);
  });

  it("doesn't take a flight picked on the town map, landing a call later, for a door", () => {
    const { host, core, seen } = darkCave();
    host.moveTo({ map: MAP + 1, x: 20, y: 4 });
    core.noteSeen();
    core.flightCalls = 2; // FLY left the town map open; a press picks the place
    host.moveTo({ map: MAP, x: 26, y: 4 });
    core.noteSeen(true);
    expect(seen.data.doors[MAP] ?? []).toEqual([]);
    expect(seen.data.doors[MAP + 1] ?? []).toEqual([]);
    expect(core.flightCalls).toBe(0); // landed: the next map change is a door again
    expect(seen.origin(MAP)).toEqual([26, 4]);
  });

  it("remembers the door the player came in by, forgets it after a flight, keeps it through a battle (review of #106)", () => {
    const { host, core } = darkCave();
    host.moveTo({ map: MAP + 1, x: 20, y: 4 });
    core.noteSeen();
    host.moveTo({ map: MAP, x: 26, y: 4 });
    core.noteSeen(true); // through a ladder
    expect(core.arrivedBy).toEqual({ map: MAP, x: 26, y: 4 });
    host.moveTo({ battle: true });
    core.noteSeen(true); // a wild battle in the cave
    host.moveTo({ battle: false, x: 27 });
    core.noteSeen(true);
    expect(core.arrivedBy).toEqual({ map: MAP, x: 26, y: 4 });
    core.flightCalls = 1; // then a flight
    host.moveTo({ map: MAP + 2, x: 5, y: 5 });
    core.noteSeen(true);
    expect(core.arrivedBy).toBeNull();
  });

  it("remembers the squares walked over mid-walk as floor, though the screen is read only at the end", () => {
    const { host, core, seen } = darkCave();
    core.mapText(); // the first look, at (5,4)
    for (let x = 6; x <= 15; x++) {
      host.moveTo({ x });
      core.noteSeen(); // each step of the walk
    }
    // Nothing was read off the screen mid-walk, but every square walked on is known floor.
    for (let x = 6; x <= 14; x++) expect(seen.sawInDark(MAP, x, 4)).toBe(true);
    expect(seen.data.dark?.[MAP]["12,4"]).toBe(".");
    // A square already known keeps what it showed (a ladder stays a ladder).
    seen.sawDark(MAP, [["D"]], 30, 30);
    seen.walkedInDark(MAP, 30, 30);
    expect(seen.data.dark?.[MAP]["30,30"]).toBe("D");
  });

  it("remembers a ladder the player stands on as a ladder", () => {
    const { host, core } = darkCave();
    host.moveTo({ x: 26 });
    core.mapText();
    host.moveTo({ x: 15 });
    // x 11..28 as 6..23: the screen now, nothing seen at 21 (16), the ladder at 26 (21), the rock lit floor touches at 28 (23).
    const whole = grid(core.mapText(true));
    expect(whole.rows[0].slice(-19)).toBe("....@.....?....D.#?"); // the last "?" is the ring
  });
});

describe("walking in the dark", () => {
  it("walk_to goes over squares seen in the dark", async () => {
    const { host, core, travel } = darkCave();
    core.mapText();
    host.moveTo({ x: 15 });
    core.mapText();
    await travel.walkTo(5, 4, false);
    expect(host.asHost().position().x).toBe(5);
  });

  it("never guesses through the dark: a target past squares not seen there is refused", async () => {
    const { host, core, travel } = darkCave();
    core.mapText(); // seen x 1..10
    host.moveTo({ x: 26 });
    core.mapText(); // seen x 22..28; 11..21 never lit on a screen read
    await expect(travel.walkTo(5, 4, false)).rejects.toThrow(/No path to \(0, 0\)/);
    expect(host.asHost().position().x).toBe(26);
  });

  it("refuses fight_trainer there (trainers are black sprites), and lets the walks through", async () => {
    const host = new FakeHost(layout, [{ rows: screenRows() }], { position: { inWorld: true, map: MAP, x: 5, y: 4 }, world: WORLD, seen: new SeenMaps() });
    const bridge = new AiBridge(host.asHost(), () => {});
    const core = (bridge as unknown as { core: BridgeCore }).core;
    core.dark = () => true;
    core.screenPixels = () => pixels(host);
    core.screenText = () => [];
    const dispatch = (m: string, p: Record<string, unknown>) =>
      (bridge as unknown as { dispatch(m: string, p: Record<string, unknown>): Promise<unknown> }).dispatch(m, p);
    await expect(dispatch("fight_trainer", { x: 1, y: 0 })).rejects.toThrow(/too dark to see a trainer/);
    await expect(dispatch("walk", { path: "@fight 1 0" })).rejects.toThrow(/too dark to see a trainer/);
    // walk_to (2,0) in the model's coordinates is (7,4): seen from where the run arrived.
    await dispatch("walk_to", { x: 2, y: 0 });
    expect(host.asHost().position().x).toBe(7);
  });
});
