// Walks on the downhill road, against a scripted fake Game Boy: there the game presses Down by
// itself on every frame with no direction, A or B held (pret's JoypadOverworld), unless a trainer
// is coming. A walk that let go of everything between legs rolled back downhill: "up 2/2" and
// then blocked to the right, back where it started (a run, 2026-11-21).

import { beforeAll, describe, expect, it, vi } from "vitest";
import { Travel } from "../../src/bridge/travel";
import { BridgeCore } from "../../src/bridge/bridge-core";
import type { Menus } from "../../src/bridge/menus";

beforeAll(() => vi.stubGlobal("document", { hidden: true }));

type Pos = { x: number; y: number; map: number; battle: boolean; scripted: boolean };
const STEP: Record<string, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

/**
 * The player at (5, 10) on map `map` with one step a 16-frame move. A wall on the right below
 * y = 9 (the right only opens two squares up, as on the road), and the road's bottom at y = 12.
 * On map 1 (the slope) a frame with no direction, A or B held starts a step down, unless
 * `trainerComing()`.
 */
function setup(opts: { map?: number; trainerComing?: () => boolean; sliding?: boolean; top?: number; box?: (pos: Pos) => boolean; ice?: boolean } = {}) {
  const pos: Pos = { x: 5, y: 10, map: opts.map ?? 1, battle: false, scripted: false };
  const held = new Set<string>();
  const bHeldWhileTrainer: number[] = [];
  let frame = 0;
  // `sliding`: a slide downhill is half done when the walk starts (something let go before it).
  let moving: string | null = opts.sliding ? "down" : null;
  let left = opts.sliding ? 8 : 0;
  const open = (d: string) => {
    const [dx, dy] = STEP[d];
    const x = pos.x + dx, y = pos.y + dy;
    return y <= 12 && y >= (opts.top ?? -Infinity) && !(x > 5 && y > 8);
  };
  // A text box open (a sign, a Pokémon fainting from poison): the game doesn't push then.
  const boxOpen = () => !!opts.box?.(pos);
  const bHeldWithBox: number[] = [];
  const forced = () => pos.map === 1 && !opts.trainerComing?.() && !boxOpen();
  const gb = {
    setButton: (b: string, on: boolean) => { if (on) held.add(b); else held.delete(b); },
    runFrames: async (n: number) => {
      for (let i = 0; i < n; i++) {
        frame++;
        if (opts.trainerComing?.() && held.has("b")) bHeldWhileTrainer.push(frame);
        if (boxOpen() && held.has("b")) bHeldWithBox.push(frame);
        if (!moving) {
          const dir = ["up", "down", "left", "right"].find((d) => held.has(d));
          const want = dir ?? (forced() && !held.has("a") && !held.has("b") ? "down" : null);
          if (want && open(want)) { moving = want; left = 16; }
        }
        if (moving && --left === 0) {
          pos.x += STEP[moving][0];
          pos.y += STEP[moving][1];
          // `ice`: the whole floor is ice, so a step slides on until something stops it (the game's
          // ice step is the fast one: 8 frames a square).
          if (opts.ice && open(moving)) left = 8;
          else moving = null;
        }
      }
    },
  };
  const core = {
    requireGb: () => gb,
    host: { position: () => ({ ...pos }) },
    // As the game's adapter reads it: the map and the trainer flag only, not whether a box is open.
    game: { data: { poisonFaintsWhileWalking: false }, poisonedParty: () => [], forcedDownhill: () => pos.map === 1 && !opts.trainerComing?.() },
    fleeUncounted: false,
    textBox: () => (boxOpen() ? { open: true, lines: ["It's a sign."] } : { open: false, lines: [] }),
    screenText: () => [],
    settledScreen: async () => [],
    mapText: () => "map",
    noteSeen: () => {},
    result: (r: object) => ({ ...r }),
    settleMove: BridgeCore.prototype.settleMove,
    slopeFrames: BridgeCore.prototype.slopeFrames,
    letGoOfSlope: BridgeCore.prototype.letGoOfSlope,
  } as unknown as BridgeCore;
  return { travel: new Travel(core, {} as Menus), pos, held, bHeldWhileTrainer, bHeldWithBox, frames: () => frame, run: gb.runFrames };
}

const walk = async (t: Travel, path: string) => ((await t.walkPath(path)) as { walk: string }).walk;

describe("walk on the downhill road", () => {
  it("goes uphill and then sideways without rolling back between legs", async () => {
    const { travel, pos } = setup();
    expect(await walk(travel, "U2 R3")).toBe("up 2/2, right 3/3 — arrived");
    expect(pos).toMatchObject({ x: 8, y: 8 });
  });

  it("doesn't count a slide already under way as a step uphill", async () => {
    // The slide lands one square down (y 11) as the walk starts, which takes one off: the walk
    // goes on up to two squares above where it started (y 8), not one.
    const { travel, pos } = setup({ sliding: true });
    expect(await walk(travel, "U2")).toBe("up 2/2 — arrived");
    expect(pos).toMatchObject({ x: 5, y: 8 });
  });

  it("says no squares, not fewer, when a slide lands and the way up is blocked", async () => {
    // The slide lands one square down (y 11), and nothing above y 11 can be ridden.
    const { travel, pos } = setup({ sliding: true, top: 11 });
    expect(await walk(travel, "U2")).toBe("up 0/2 — stopped: blocked (wall, person, or a scripted event)");
    expect(pos).toMatchObject({ x: 5, y: 11 });
  });

  it("never holds B over a text box (a held B would skip it)", async () => {
    // A text box opens as the walk's one square up lands and stays open (a Pokémon fainting
    // from poison, or a sign): the walk settles without B.
    const { travel, bHeldWithBox, held } = setup({ box: (p) => p.y <= 9 });
    await walk(travel, "U1");
    expect(bHeldWithBox).toEqual([]);
    expect([...held]).toEqual([]);
  });

  it("stays where a walk ended, and lets go of B then", async () => {
    const { travel, pos, held } = setup();
    expect(await walk(travel, "U1")).toBe("up 1/1 — arrived");
    expect(pos).toMatchObject({ x: 5, y: 9 });
    expect([...held]).toEqual([]);
  });

  it("lets go of B as soon as a trainer is coming (B would skip their text)", async () => {
    // A trainer spots the player 4 frames after the walk's one square up lands, in the middle of a
    // 6-frame stretch of settling with B held (the game stops pushing then).
    const at = { landed: -1, frame: 0 };
    let bFrames = 0;
    const s = setup({ trainerComing: () => at.landed >= 0 && at.frame - at.landed >= 4 });
    const watched = s.run;
    s.travel["core"].requireGb().runFrames = async (n: number) => {
      for (let i = 0; i < n; i++) {
        await watched(1);
        at.frame++;
        if (at.landed < 0 && s.pos.y === 9) at.landed = at.frame;
        if (s.held.has("b")) bFrames++;
      }
    };
    await walk(s.travel, "U1");
    expect(s.pos.y).toBe(9);
    // B was held while settling, and let go within the 6-frame stretch it takes to notice.
    expect(bFrames).toBeGreaterThan(0);
    expect(s.bHeldWhileTrainer.length).toBeLessThanOrEqual(6);
    expect([...s.held]).toEqual([]);
  });

  it("says how far a slide on ice really went, past the squares asked for", async () => {
    // Off the road (map 2), on ice with nothing above until y 5: one square asked, five slid.
    const { travel, pos } = setup({ map: 2, ice: true, top: 5 });
    expect(await walk(travel, "U1")).toBe("up 1/1 (slid on: 5 squares up) — arrived");
    expect(pos).toMatchObject({ x: 5, y: 5 });
  });

  it("presses nothing extra off the downhill road", async () => {
    const { travel, pos, held } = setup({ map: 2 });
    const pressed: string[] = [];
    const before = travel["core"].requireGb().setButton;
    travel["core"].requireGb().setButton = (b: string, on: boolean) => { if (on) pressed.push(b); before(b as never, on); };
    expect(await walk(travel, "U2")).toBe("up 2/2 — arrived");
    expect(pos).toMatchObject({ x: 5, y: 8 });
    expect(pressed).toEqual(["up"]);
    expect([...held]).toEqual([]);
  });
});
