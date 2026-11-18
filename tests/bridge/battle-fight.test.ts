// Battle.fight with a stubbed screen: the turns where no move is picked from the list (Struggle,
// a turn the game plays by itself) and a move the game refuses (disabled).

import { describe, expect, it, vi } from "vitest";
import { Battle } from "../../src/bridge/battle";
import type { BridgeCore, MoveInfo } from "../../src/bridge/bridge-core";
import type { Menus } from "../../src/bridge/menus";

const MENU = ["", "┌────┐┌─────────┐", "│    ││▶FIGHT PKMN│", "│    ││ ITEM  RUN │", "└────┘└─────────┘"];
/** The move list: the marker row, then one move a row (rows 13–16, as Gen 1's layout says). */
const moveList = (moves: MoveInfo[], cursor: number) => [
  ...Array<string>(12).fill(""), "TYPE/",
  ...moves.map((m, i) => `│${i === cursor ? "▶" : " "}${m.name}`),
];

function setup(moves: MoveInfo[], opts: { listOpens: boolean; afterPick?: (screen: { lines: string[] }) => string[] }) {
  const screen = { lines: MENU };
  const taps: string[] = [];
  const core = {
    requireGb: () => ({ runFrames: async () => {} }),
    host: { position: () => ({ battle: true }), battleMoves: () => moves },
    screenText: () => screen.lines,
    layout: { battleMenu: { fight: { label: "FIGHT" } }, moveList: { rows: [12, 18], moves: [13, 17], marker: "TYPE/" } },
    tap: vi.fn(async (b: string) => {
      taps.push(b);
      const onMenu = screen.lines === MENU;
      if (b === "a" && onMenu) screen.lines = opts.listOpens ? moveList(moves, 0) : ["┌──┐", "│..│", "└──┘"];
      else if (b === "a" && opts.afterPick) screen.lines = opts.afterPick(screen);
      else if (b === "b") screen.lines = MENU;
    }),
    result: (r: object) => r,
  } as unknown as BridgeCore;
  const advance = vi.fn(async () => ({ messages: ["NOVA used a move!"], stopped: "a menu or choice is waiting for input" }));
  const menus = {
    advanceText: advance,
    battleMenuCursor: () => (screen.lines === MENU ? "fight" : null),
    battleMenuTo: async () => true,
  } as unknown as Menus;
  return { battle: new Battle(core, menus), taps, advance, screen };
}

const m = (slot: number, name: string, pp: number): MoveInfo => ({ slot, name, pp });

describe("fight", () => {
  it("uses Struggle when no move has PP left (the game picks it: no move list)", async () => {
    const { battle } = setup([m(1, "TACKLE", 0), m(2, "GROWL", 0)], { listOpens: false });
    const r = (await battle.fight("STRUGGLE")) as { used: string; note: string };
    expect(r.used).toBe("STRUGGLE");
    expect(r.note).toMatch(/No PP left in any move/);
    // Any move named does the same.
    expect(((await setup([m(1, "TACKLE", 0)], { listOpens: false }).battle.fight("TACKLE")) as { used: string }).used).toBe("STRUGGLE");
  });

  it("plays a turn the game plays by itself (recharging after the last PP of a move) instead of refusing it for no PP", async () => {
    const { battle } = setup([m(1, "HYPER BEAM", 0), m(2, "TACKLE", 20)], { listOpens: false });
    const r = (await battle.fight("HYPER BEAM")) as { used: null; note: string };
    expect(r.used).toBeNull();
    expect(r.note).toMatch(/No move to pick this turn/);
  });

  it("still refuses a move with no PP when the list lets you pick, and backs out", async () => {
    const { battle, screen } = setup([m(1, "TACKLE", 0), m(2, "GROWL", 20)], { listOpens: true });
    await expect(battle.fight("TACKLE")).rejects.toThrow(/TACKLE has no PP left\. Backed out/);
    expect(screen.lines).toBe(MENU);
  });

  it("says a refused move (disabled) wasn't used, and closes the list", async () => {
    const moves = [m(1, "TACKLE", 20), m(2, "GROWL", 20)];
    // A goes nowhere: the game prints its refusal and the list stays open on the same move.
    const { battle, screen, taps } = setup(moves, { listOpens: true, afterPick: (s) => s.lines });
    const r = (await battle.fight("TACKLE")) as { used: null; note: string };
    expect(r.used).toBeNull();
    expect(r.note).toMatch(/TACKLE wasn't used/);
    expect(taps.at(-1)).toBe("b");
    expect(screen.lines).toBe(MENU);
  });

  it("reports a move used when the list closes for the turn", async () => {
    const { battle } = setup([m(1, "TACKLE", 20)], { listOpens: true, afterPick: () => MENU });
    expect(((await battle.fight("TACKLE")) as { used: string }).used).toBe("TACKLE");
  });
});
