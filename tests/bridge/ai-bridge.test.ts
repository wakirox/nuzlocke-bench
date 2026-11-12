// AiBridge.dispatch() against scripted screens (tests/harness/fake-bridge.ts): no ROM, no browser.
// Screen text is neutral; the layout (text box rows, keyboard) comes from the Gen 1 adapter.

import { describe, expect, it, vi } from "vitest";

// The bridge's disk-backed store needs IndexedDB; here nothing is stored.
vi.mock("../../src/storage", () => ({
  KEYS: { routes: "routes" },
  kv: { get: async () => undefined, set: async () => undefined },
}));

import { AiBridge } from "../../src/bridge/ai-bridge";
import { gen1Adapter } from "../../src/games/gen1";
import { FakeHost, screenRows, textBoxScreen, type FakeHostOptions, type ScriptScreen } from "../harness/fake-bridge";

const layout = gen1Adapter("yellow").screen;

function bridgeFor(script: ScriptScreen[], opts?: FakeHostOptions, screen = layout) {
  const host = new FakeHost(screen, script, opts);
  const bridge = new AiBridge(host.asHost(), () => {});
  const call = (method: string, params: Record<string, unknown> = {}) =>
    (bridge as unknown as { dispatch(m: string, p: Record<string, unknown>): Promise<Record<string, unknown>> }).dispatch(method, params);
  return { host, call };
}

describe("AiBridge.dispatch", () => {
  it("advance_text presses A through text boxes and stops at a menu", async () => {
    const question = textBoxScreen(layout, ["Do you agree?"]);
    question[5] = "     ┌──────┐       ";
    question[6] = "     │▶YES  │       ";
    question[7] = "     │ NO   │       ";
    const { host, call } = bridgeFor([
      { rows: textBoxScreen(layout, ["First line of talk.", "More to say."], {}, true), on: { a: "next" } },
      { rows: textBoxScreen(layout, ["Second box here.", "The end."], {}, true), on: { a: "next" } },
      { rows: question },
    ]);
    const r = await call("advance_text");
    expect(host.presses).toEqual(["a", "a"]);
    expect(r.stopped).toBe("a menu or choice is waiting for input");
    expect(r.messages).toEqual(["First line of talk.", "More to say.", "Second box here.", "The end.", "Do you agree?"]);
  });

  it("choose moves the cursor to the named option and presses A", async () => {
    const menu = (at: number) => screenRows({ 2: `${at === 0 ? "▶" : " "}ALPHA`, 3: `${at === 1 ? "▶" : " "}BETA`, 4: `${at === 2 ? "▶" : " "}GAMMA` });
    const { host, call } = bridgeFor([
      { rows: menu(0), on: { down: 1 } },
      { rows: menu(1), on: { down: 2, up: 0 } },
      { rows: menu(2), on: { up: 1, a: 3 } },
      { rows: screenRows({ 8: "Chosen." }) },
    ]);
    const r = await call("choose", { option: "GAMMA" });
    // The cursor is already at the top: an up that moves nothing is tried once more (a menu can
    // miss a press), then the up-sweep stops; two downs and A.
    expect(host.presses).toEqual(["up", "up", "down", "down", "a"]);
    expect(r.chose).toBe("GAMMA");
  });

  it("press name:NAME types the letters on the keyboard and confirms with start", async () => {
    const { lettersPerRow, nameRow } = layout.keyboard;
    let row = 0;
    let col = 0;
    let typed = "";
    const draw = (host: FakeHost) => host.show(screenRows({ [nameRow]: typed.padEnd(7, "_") }));
    const { host, call } = bridgeFor([{ rows: screenRows({ [nameRow]: "_______" }) }], {
      onPress(b, h) {
        if (b === "right") col = (col + 1) % lettersPerRow;
        if (b === "left") col = (col + lettersPerRow - 1) % lettersPerRow;
        if (b === "down") row++;
        if (b === "up") row--;
        if (b === "a") typed += String.fromCharCode(65 + row * lettersPerRow + col);
        if (b === "b") typed = typed.slice(0, -1);
        draw(h);
      },
    });
    await call("press", { buttons: "name:kite" });
    expect(typed).toBe("KITE");
    expect(host.presses.at(-1)).toBe("start");
    expect(host.presses.filter((b) => b === "a")).toHaveLength(4);
  });

  it("press holds a direction into a boulder until it moves, then lets it slide", async () => {
    const host = new FakeHost(layout, [{ rows: screenRows() }], { position: { inWorld: true } });
    const bridge = new AiBridge(host.asHost(), () => {});
    // The boulder below you moves once the way has been held for 12 frames, as the game's second try.
    let heldSince: number | null = null;
    const core = (bridge as unknown as { core: { view: () => unknown } }).core;
    core.view = () => {
      if (heldSince === null) heldSince = host.frames;
      const moved = host.frames - heldSince >= 12;
      return { grid: [["."], ["@"], [moved ? "." : "B"]], originX: 0, originY: 0, pc: 0, pr: 1 };
    };
    const call = (m: string, p: Record<string, unknown>) =>
      (bridge as unknown as { dispatch(m: string, p: Record<string, unknown>): Promise<unknown> }).dispatch(m, p);
    await call("press", { buttons: "down" });
    expect(host.presses).toEqual(["down"]);
    // Held until it moved (12 frames), then the slide: not the 6-frame tap that dropped pushes.
    expect(host.frames).toBeGreaterThanOrEqual(12 + 64);
  });

  it("press taps as usual when no boulder is ahead", async () => {
    const host = new FakeHost(layout, [{ rows: screenRows() }], { position: { inWorld: true } });
    const bridge = new AiBridge(host.asHost(), () => {});
    const core = (bridge as unknown as { core: { view: () => unknown } }).core;
    core.view = () => ({ grid: [["."], ["@"], ["."]], originX: 0, originY: 0, pc: 0, pr: 1 });
    await (bridge as unknown as { dispatch(m: string, p: Record<string, unknown>): Promise<unknown> }).dispatch("press", { buttons: "down", hold_frames: 6, wait_frames: 0 });
    expect(host.presses).toEqual(["down"]);
    expect(host.frames).toBeLessThan(12 + 64);
  });

  it("press rejects an unknown button and mentions name:NAME", async () => {
    const { host, call } = bridgeFor([{ rows: screenRows() }]);
    await expect(call("press", { buttons: "a jump" })).rejects.toThrow(/Unknown button "jump".*name:NAME/);
    expect(host.presses).toEqual(["a"]);
  });

  it("pages past an encyclopedia entry by the layout's labels, so another game's labels work too", async () => {
    const entry = (a: string, b: string) => screenRows({ 3: `  ${a}  4'00"`, 4: `  ${b}  20.0lb` });
    const menu = screenRows({ 6: "     │▶YES  │       ", 7: "     │ NO   │       " });
    // The game's own labels: the page is pressed past, then the question stops it.
    const own = bridgeFor([{ rows: entry(...layout.dexEntry.labels), on: { a: "next" } }, { rows: menu }]);
    await own.call("advance_text");
    expect(own.host.presses).toEqual(["a"]);
    // Another layout's labels: only its pages count.
    const other = { ...layout, dexEntry: { labels: ["HGT", "WGT"] as [string, string] } };
    const theirs = bridgeFor([{ rows: entry("HGT", "WGT"), on: { a: "next" } }, { rows: menu }], undefined, other);
    await theirs.call("advance_text");
    expect(theirs.host.presses).toEqual(["a"]);
    const notOurs = bridgeFor([{ rows: entry("HGT", "WGT"), on: { a: "next" } }, { rows: menu }]);
    await notOurs.call("advance_text");
    expect(notOurs.host.presses).toEqual([]);
  });

  it("offers the layout's balls in throw_ball's error", async () => {
    const other = { ...layout, balls: { level: "LEVEL BALL", lure: "LURE BALL", fast: "FAST BALL" } };
    const { call } = bridgeFor([{ rows: screenRows() }], { summary: { battle: "wild", bag: [] } }, other);
    await expect(call("throw_ball", {})).rejects.toThrow(/Say which ball: level, lure or fast/);
  });
});
