// Walks through the fog of war: walk_to and exit_map guess a way through the squares the run hasn't
// seen. The walks run on a fake world (FakeHost's `world`: the truth, walls and floor), so the walk
// text is the one the bridge produces, not a stub's.

import { beforeAll, describe, expect, it, vi } from "vitest";
import { Travel } from "../../src/bridge/travel";
import { BridgeCore } from "../../src/bridge/bridge-core";
import { SeenMaps } from "../../src/bridge/seen";
import type { Menus } from "../../src/bridge/menus";
import { gen1Adapter } from "../../src/games/gen1";
import { FakeHost, screenRows, type FakeHostOptions } from "../harness/fake-bridge";

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
    const seen = new SeenMaps();
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

  it("refuses a ? target, which the guess never walks to", async () => {
    const { travel } = fakeWorld(corridor, [2, 1], seenWithGap());
    await expect(travel.walkTo(9, 1, false)).rejects.toThrow(/you haven't seen that square yet/);
  });

  it("with no fog, a target no walk reaches is refused as before, with no guess", async () => {
    // Every square is seen (the screen around (4,1) covers 0–9), so no guess is made.
    const seen = new SeenMaps();
    seen.sawScreen(MAP, 4, 1);
    const wall = ["##########", "....#.....", "##########"];
    const { travel } = fakeWorld(wall, [1, 1], seen);
    await expect(travel.walkTo(7, 1, false)).rejects.toThrow(/no walk from where you stand reaches it/);
  });
});

describe("exit_map through the fog", () => {
  it("walks a guessed way up to an edge the run hasn't seen, and says so first", async () => {
    // The top of the tower is unseen (the screen around (5,8) covers rows 4–12 only), so no seen way
    // reaches the top edge; the shaft through the unseen rows is the guess.
    const seen = new SeenMaps();
    seen.sawScreen(MAP, 5, 8);
    const { core, travel } = fakeWorld(TOWER, [5, 8], seen, { exits: ["up"] });
    const r = (await travel.exitMap("up")) as { walk: string };
    expect(r.walk.startsWith("(no seen way to the up edge: trying one through squares you hadn't seen)")).toBe(true);
    // The guessed way is the shaft: the walk really went up it to the top.
    expect(core.host.position()).toMatchObject({ x: 5, y: 0 });
  });

  it("still throws when there's no way to the edge and no fog to guess through", async () => {
    // Fully seen (the screens around (4,2) and (4,8) cover all of the tower), with the top walled off.
    const seen = new SeenMaps();
    seen.sawScreen(MAP, 4, 2);
    seen.sawScreen(MAP, 4, 8);
    const walled = ["##########", "##########", "##########", "##########", ...TOWER.slice(4)];
    const { travel } = fakeWorld(walled, [5, 8], seen, { exits: ["up"] });
    await expect(travel.exitMap("up")).rejects.toThrow(/Can't reach the up edge from here/);
  });

  it("with no edge exits and no door in sight, heads down and says so", async () => {
    // The map has no edge exits and no door seen while the view has "?": the way out of a building is down.
    const seen = new SeenMaps();
    seen.sawScreen(MAP, 5, 8);
    const { core, travel } = fakeWorld(TOWER, [5, 8], seen, { exits: [], doors: [] });
    const r = (await travel.exitMap("up")) as { walk: string };
    expect(r.walk.startsWith("no door in sight yet, so heading down")).toBe(true);
    // Down, not up: the walk went to the bottom of the room.
    expect(core.host.position().y).toBeGreaterThan(8);
  });
});
