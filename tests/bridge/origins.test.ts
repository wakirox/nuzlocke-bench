// The model's coordinates (0.3.0): each map's (0,0) is the square the run first stood on there, so
// they say nothing about where the map's edges are. Everything shown is moved into them, and every
// coordinate the model sends is moved back before the bridge acts on it.

import { beforeAll, describe, expect, it, vi } from "vitest";
import { AiBridge } from "../../src/bridge/ai-bridge";
import { BridgeCore } from "../../src/bridge/bridge-core";
import type { OverworldView } from "../../src/bridge/overworld";
import { SeenMaps } from "../../src/bridge/seen";
import { gen1Adapter } from "../../src/games/gen1";
import { FakeHost, screenRows } from "../harness/fake-bridge";

beforeAll(() => vi.stubGlobal("document", { hidden: true }));
// The bridge's disk-backed store needs IndexedDB; here nothing is stored.
vi.mock("../../src/storage", () => ({
  KEYS: { routes: "routes" },
  kv: { get: async () => undefined, set: async () => undefined },
}));

const MAP = 1;
const layout = gen1Adapter("yellow").screen;
// An open room 20×12, walls round it.
const ROOM = Array.from({ length: 12 }, (_, y) => Array.from({ length: 20 }, (_, x) => (x === 0 || y === 0 || x === 19 || y === 11 ? "#" : ".")).join(""));

function room(at: [number, number], seen = new SeenMaps()) {
  const host = new FakeHost(layout, [{ rows: screenRows() }], { position: { inWorld: true, map: MAP, x: at[0], y: at[1] }, world: ROOM, seen });
  const bridge = new AiBridge(host.asHost(), () => {});
  const core = (bridge as unknown as { core: BridgeCore }).core;
  const dispatch = (m: string, p: Record<string, unknown> = {}) =>
    (bridge as unknown as { dispatch(m: string, p: Record<string, unknown>): Promise<Record<string, unknown>> }).dispatch(m, p);
  return { host, core, seen, dispatch };
}

const ruler = (text: string) => text.split("\n").find((l) => /^ {5}(?: *-?\d)+$/.test(l))!.trim().split(/ +/).map(Number);
const ys = (text: string) => text.split("\n").filter((l) => /^y[ \d-]{3} /.test(l)).map((l) => Number(l.slice(1, 4)));

describe("SeenMaps.origins", () => {
  it("sets a map's origin the first time only, and keeps it with the run", () => {
    const s = new SeenMaps();
    expect(s.origin(MAP)).toBeUndefined();
    expect(s.originAt(MAP, 7, 3)).toEqual([7, 3]);
    expect(s.takeChanged()).toBe(true);
    expect(s.originAt(MAP, 9, 9)).toEqual([7, 3]);
    expect(s.takeChanged()).toBe(false);
    expect(new SeenMaps(structuredClone(s.data)).origin(MAP)).toEqual([7, 3]);
  });
});

describe("the model's coordinates on a lit map", () => {
  it("count from the square the run first stood on: the map is drawn from there, left and up negative", async () => {
    const { core } = room([12, 6]);
    core.noteSeen(true);
    const text = core.mapText(true);
    // Seen: the screen around (12,6), x 8..17, y 2..10: in the model's coordinates x -4..5, y -4..4,
    // drawn with the ring of "?" one past each side.
    expect(ruler(text)).toEqual([-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6]);
    expect(ys(text)).toEqual([-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5]);
  });

  it("walk_to takes them, and the origin stays put as the player moves", async () => {
    const { host, core, dispatch } = room([12, 6]);
    core.noteSeen(true);
    await dispatch("walk_to", { x: -3, y: 2 });
    expect(host.asHost().position()).toMatchObject({ x: 9, y: 8 });
    expect(ruler(core.mapText()).slice(0, 2)).toEqual([-7, -6]);
  });

  it("says the walk_to target in them when there's no way", async () => {
    const { core, dispatch } = room([12, 6]);
    core.noteSeen(true);
    // The room's west wall, the map's x 0, is x -12 here.
    await expect(dispatch("walk_to", { x: -12, y: 0 })).rejects.toThrow(/No path to \(-12, 0\)/);
  });

  it("is set by get_state too, for a run resumed from before origins were kept", async () => {
    const { seen, dispatch } = room([12, 6]);
    expect(seen.origin(MAP)).toBeUndefined();
    await dispatch("get_state");
    expect(seen.origin(MAP)).toEqual([12, 6]);
  });

  it("is set on arrival through a warp, once the game has settled there, not before", () => {
    const { host, core, seen } = room([12, 6]);
    core.noteSeen(true);
    host.moveTo({ map: MAP + 1, x: 3, y: 9 });
    core.noteSeen(false); // just warped: the coordinates may not be the new map's yet
    expect(seen.origin(MAP + 1)).toBeUndefined();
    core.noteSeen(true);
    expect(seen.origin(MAP + 1)).toEqual([3, 9]);
    expect(seen.origin(MAP)).toEqual([12, 6]);
  });
});

describe("doors and routes in the model's coordinates", () => {
  it("gives a door's arrival square in its own map's coordinates, once the run has been there", () => {
    const { core, seen } = room([12, 6]);
    core.mapConstants = () => ["ZERO", "HERE", "THERE"];
    seen.originAt(MAP, 12, 6);
    const v = { grid: [["@"]], originX: 12, originY: 6, pc: 0, pr: 0, doors: [{ x: 14, y: 6, to: "THERE", tx: 4, ty: 7 }] } as unknown as OverworldView;
    expect(core.shownView(v).doors).toEqual([{ x: 2, y: 0, to: "THERE", tx: null, ty: null }]);
    seen.originAt(2, 4, 9);
    expect(core.shownView(v).doors).toEqual([{ x: 2, y: 0, to: "THERE", tx: 0, ty: -2 }]);
  });

  it("note_route keeps the map's own square and lists it back in the model's; a map not yet visited is refused", async () => {
    const { core, dispatch } = room([12, 6]);
    core.mapConstants = () => ["ZERO", "HERE", "THERE"];
    core.noteSeen(true);
    const noted = await dispatch("note_route", { from: "HERE", to: "THERE", door: { x: -2, y: 3 } });
    expect(noted.noted).toBe("HERE → THERE: door (-2,3)");
    expect(core.routes.link("HERE", "THERE")).toEqual({ door: [10, 9] });
    expect((await dispatch("routes")).routes).toEqual(["HERE → THERE: door (-2,3)"]);
    await expect(dispatch("note_route", { from: "THERE", to: "HERE", door: { x: 0, y: 0 } })).rejects.toThrow(/haven't been on THERE yet/);
    // go_to's "no noted route" lists the routes in the model's coordinates too.
    await expect(dispatch("go_to", { map: "ZERO" })).rejects.toThrow(/Known: HERE → THERE: door \(-2,3\)\./);
  });
});
