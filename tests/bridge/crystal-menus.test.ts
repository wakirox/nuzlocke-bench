// The bridge on Crystal's screens (scripted, no ROM): a bag of pockets shown one at a time,
// USE before a ball is thrown, its catch message, and a naming keyboard confirmed with START then A.

import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/storage", () => ({
  KEYS: { routes: "routes" },
  kv: { get: async () => undefined, set: async () => undefined },
}));

import { AiBridge } from "../../src/bridge/ai-bridge";
import { gen2Adapter } from "../../src/games/gen2";
import { FakeHost, screenRows, textBoxScreen, type FakeHostOptions, type ScriptScreen } from "../harness/fake-bridge";

const layout = gen2Adapter().screen;

function bridgeFor(script: ScriptScreen[], opts?: FakeHostOptions) {
  const host = new FakeHost(layout, script, opts);
  const bridge = new AiBridge(host.asHost(), () => {});
  const call = (method: string, params: Record<string, unknown> = {}) =>
    (bridge as unknown as { dispatch(m: string, p: Record<string, unknown>): Promise<Record<string, unknown>> }).dispatch(method, params);
  return { host, call };
}

const battleMenu = (at: "FIGHT" | "PACK") => textBoxScreen(layout, ["", `${at === "FIGHT" ? "▶" : " "}FIGHT PKMN`, "", `${at === "PACK" ? "▶" : " "}PACK  RUN`]);
const pocket = (item: string) => screenRows({ 2: `       ▶${item}`, 4: "        CANCEL" });

describe("Crystal menus", () => {
  it("throw_ball searches the pockets for the ball, then answers USE", async () => {
    const { host, call } = bridgeFor([
      { rows: battleMenu("FIGHT"), on: { down: 1 } }, // 0
      { rows: battleMenu("PACK"), on: { a: 2, up: 0 } }, // 1
      { rows: pocket("POTION"), on: { right: 3 } }, // 2: the items pocket
      { rows: pocket("POKé BALL"), on: { a: 4 } }, // 3: the balls pocket
      { rows: screenRows({ 2: "       ▷POKé BALL", 8: "             │▶USE │", 10: "             │ QUIT│" }), on: { a: 5 } }, // 4
      { rows: textBoxScreen(layout, ["Gotcha! SENTRET", "was caught!"]), on: { a: 6 } }, // 5
      { rows: screenRows() },
    ], { summary: { battle: "wild", bag: [{ item: "POTION", qty: 1 }, { item: "POKé BALL", qty: 5 }] } });
    const r = await call("throw_ball", { ball: "poke" });
    expect(host.presses.filter((b) => b === "right")).toEqual(["right"]);
    expect(r.threw).toBe("POKé BALL");
    expect(r.caught).toBe(true);
  });

  it("a name is confirmed with START (to END) and then A", async () => {
    const { lettersPerRow, nameRow } = layout.keyboard;
    let row = 0;
    let col = 0;
    let typed = "";
    const { host, call } = bridgeFor([{ rows: screenRows({ [nameRow]: "_______" }) }], {
      onPress(b, h) {
        if (b === "right") col = (col + 1) % lettersPerRow;
        if (b === "left") col = (col + lettersPerRow - 1) % lettersPerRow;
        if (b === "down") row++;
        if (b === "up") row--;
        if (b === "b") typed = typed.slice(0, -1);
        if (b === "a" && host.presses.at(-2) !== "start") typed += String.fromCharCode(65 + row * lettersPerRow + col);
        h.show(screenRows({ [nameRow]: typed.padEnd(7, "_") }));
      },
    });
    await call("press", { buttons: "name:fuzz" });
    expect(typed).toBe("FUZZ");
    expect(host.presses.slice(-2)).toEqual(["start", "a"]);
  });

  it("advance_text presses A once past a picture that waits for a button (the starter balls)", async () => {
    const { host, call } = bridgeFor([
      { rows: screenRows(), on: { a: 1 } }, // the Pokémon's picture: no text, the scene holds the controls
      { rows: textBoxScreen(layout, ["ELM: You'll take", "CYNDAQUIL?"], { 8: "              │▶YES│" }) },
    ], { position: { inWorld: true, scripted: true } });
    const r = await call("advance_text");
    expect(host.presses).toEqual(["a"]);
    expect(r.messages).toEqual(["ELM: You'll take", "CYNDAQUIL?"]);
  });

  it("advance_text doesn't press A on the naming keyboard (it would type a letter)", async () => {
    const { host, call } = bridgeFor([
      { rows: screenRows({ 4: "    NICKNAME?", 6: "    __________", 8: " A B C D E F G H I" }), on: { a: 0 } },
    ], { position: { inWorld: true, scripted: true } });
    const r = await call("advance_text");
    expect(host.presses).toEqual([]);
    expect(r.stopped).toBe("no text on screen");
  });

  it("switch_pokemon picks from Crystal's forced-switch screen (Which PKMN?)", async () => {
    const party = (at: number) => screenRows({
      1: `${at === 0 ? "▶" : " "}  WING   10/ 28`, 3: `${at === 1 ? "▶" : " "}  CROC    5/ 28`, 5: `${at === 2 ? "▶" : " "}  WORM    0/ 29`,
      14: "┌──────────────────┐", 16: "│Which PKMN?       │", 17: "└──────────────────┘",
    });
    const { host, call } = bridgeFor([
      { rows: party(2), on: { up: 1 } },
      { rows: party(1), on: { up: 2, down: 0 } },
      { rows: party(0), on: { a: 3, down: 1 } },
      { rows: textBoxScreen(layout, ["Do it! WING!"]), on: { a: 4 } },
      { rows: battleMenu("FIGHT") },
    ], {
      position: { inWorld: true, battle: true },
      summary: { battle: "trainer", party: [
        { slot: 1, species: "PIDGEY", nickname: "WING", level: 9, hp: 10 },
        { slot: 2, species: "TOTODILE", nickname: "CROC", level: 9, hp: 5 },
        { slot: 3, species: "METAPOD", nickname: "WORM", level: 9, hp: 0 },
      ] },
    });
    const r = await call("switch_pokemon", { pokemon: "WING" });
    expect(r.switchedTo).toBe("WING");
    expect(host.presses.slice(0, 3)).toEqual(["up", "up", "a"]);
  });
});

describe("go_to's view of a stopped walk", () => {
  it("names what stopped it, and leaves 'blocked' (maybe a wrong route) to the route message", async () => {
    const { walkStopReason } = await import("../../src/bridge/travel");
    expect(walkStopReason("right 4/6 — stopped: ROCKY is hurt by poison (35→34/38 HP)")).toBe("ROCKY is hurt by poison (35→34/38 HP)");
    expect(walkStopReason("up 7/8 — stopped: stopped by a scripted event: a text box opened — advance_text reads it")).toMatch(/^stopped by a scripted event/);
    expect(walkStopReason("down 3/3 — stopped short: the only way on crosses an unbeaten trainer's sight at (5, 6)")).toMatch(/trainer's sight/);
    expect(walkStopReason("left 2/2, down 4/6 — stopped: blocked (wall, person, or a scripted event)")).toBeNull();
    expect(walkStopReason("right 3/3 — arrived")).toBeNull();
  });
});

describe("Each game's wording", () => {
  it("recognises Crystal's own prompts, and Gen 1's stay Gen 1's", async () => {
    const { gen1Adapter } = await import("../../src/games/gen1");
    const crystal = layout.texts;
    const red = gen1Adapter("red").screen.texts;
    expect(crystal.moveQuestion.test("Stop learning RAGE?")).toBe(true);
    expect(red.moveQuestion.test("Abandon learning RAGE?")).toBe(true);
    expect(crystal.choosePokemon.test("Which PKMN?")).toBe(true);
    expect(red.choosePokemon.test("Bring out which POKéMON?")).toBe(true);
    expect(crystal.caught.test("was caught!")).toBe(true);
    expect(red.caught.test("SENTRET was")).toBe(false);
    expect(crystal.teachQuestion.test("to a POKéMON?")).toBe(true);
  });
});
