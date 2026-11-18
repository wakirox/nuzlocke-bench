// The `do` tool: the model's own actions chained in one call, stopping wherever there's
// something new to decide.

import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM module without type declarations
import { BATCH_TOOLS, normalizeStep, runBatch, stepSummary, stepToolError, stopReason, walkCutShort } from "../../mcp-server/batch.mjs";
// @ts-expect-error plain ESM module without type declarations
import { createFormatter, pickSections } from "../../mcp-server/format.mjs";

const ok = (extra: object = {}, status: object = {}) => ({ status: { location: "ROUTE_1", battle: "none", ...status }, screenText: [], ...extra });

/** An exec that returns canned results in order and records the calls. */
function scripted(results: unknown[]) {
  const calls: { tool: string; args: object }[] = [];
  const exec = async (tool: string, args: object) => {
    calls.push({ tool, args });
    const r = results[calls.length - 1];
    if (r instanceof Error) throw r;
    return r;
  };
  return { calls, exec };
}

describe("do (batched actions)", () => {
  it("runs every step in order when nothing comes up", async () => {
    const { calls, exec } = scripted([ok({ walk: "→ (4,5)" }), ok({ messages: ["Hello!"] }), ok({ chose: "YES" })]);
    const steps = [{ tool: "walk_to", args: { x: 4, y: 5 } }, { tool: "advance_text", args: {} }, { tool: "choose", args: { option: "YES" } }];
    const r = await runBatch(steps, exec);
    expect(calls.map((c) => c.tool)).toEqual(["walk_to", "advance_text", "choose"]);
    expect(r).toMatchObject({ stopped: null, skipped: 0 });
  });

  it("stops when a battle starts, and says what didn't run", async () => {
    const { calls, exec } = scripted([ok({ stopped: "a wild battle started" }, { battle: "wild" }), ok()]);
    const r = await runBatch([{ tool: "walk", args: { path: "U5" } }, { tool: "exit_map", args: { direction: "up" } }], exec);
    expect(calls).toHaveLength(1);
    expect(r.stopped).toMatch(/after step 1 \(walk\): in battle/);
    expect(r.skipped).toBe(1);
  });

  it("never plays a second battle action on its own: a fight that leaves the battle going stops it", async () => {
    const { calls, exec } = scripted([ok({ messages: ["A lucky hit!"] }, { battle: "trainer" }), ok()]);
    await runBatch([{ tool: "fight", args: { move: 1 } }, { tool: "fight", args: { move: 1 } }], exec);
    expect(calls).toHaveLength(1);
  });

  it("goes on after a battle the step itself finished", async () => {
    const { calls, exec } = scripted([ok({ messages: ["Enemy MONA fell!"] }), ok({ walk: "→ (9,9)" })]);
    const r = await runBatch([{ tool: "fight", args: { move: 1 } }, { tool: "walk", args: { path: "R2" } }], exec);
    expect(calls).toHaveLength(2);
    expect(r.stopped).toBeNull();
  });

  it("stops on an error, a tracker warning or the end of the run", async () => {
    const err = scripted([new Error("No path to (40,40)"), ok()]);
    expect((await runBatch([{ tool: "walk_to", args: {} }, { tool: "walk", args: {} }], err.exec)).stopped).toMatch(/at step 1 \(walk_to\): it failed/);
    expect(stopReason(ok({ events: ["[warning] Went back into a cave"] }))).toBe("a rule event");
    expect(stopReason(ok({ events: ["[info] Entered a cave"] }))).toBeNull();
    expect(stopReason(ok({}, { outcome: "victory: won the first badge" }))).toBe("the run ended");
  });

  it("summarizes each step without the screen", () => {
    expect(stepSummary(0, { tool: "advance_text", result: ok({ messages: ["Hi!"], events: ["[info] Got a badge"] }) }))
      .toBe("1. advance_text ✓\n   • Hi!\n   📋 [info] Got a badge");
    expect(stepSummary(1, { tool: "walk_to", error: "Blocked" })).toBe("2. walk_to ✗ Blocked");
    // A step's error that carries the raw screen shows it as plain text, like a single call's.
    const boxed = stepSummary(0, { tool: "choose", error: 'Couldn\'t put the cursor on "RUN". Screen:\n┌──────────────┐\n│ CLAW         │\n│▶STARE        │\n└──────────────┘' });
    expect(boxed).not.toMatch(/[┌└│]/);
    expect(boxed).toContain("STARE");
    expect(stepSummary(2, { tool: "note_route", result: { ok: true } })).toBe('3. note_route: {"ok":true}');
  });

  it("only takes actions, never reads", () => {
    for (const read of ["get_state", "get_map", "get_screen", "read_screen_text", "get_rules", "new_run", "load_state"]) {
      expect(BATCH_TOOLS).not.toContain(read);
    }
  });
});

describe("tracker events in results", () => {
  it("show up in the result that caused them", () => {
    const f = createFormatter();
    const text = f.afterAction(ok({ events: ["[violation] Used a TONIC in battle"] })).content[0].text;
    expect(text).toContain("Tracker:\n  📋 [violation] Used a TONIC in battle");
  });
});

describe("do steps written flat", () => {
  it("takes arguments written next to tool as that tool's arguments", () => {
    expect(normalizeStep({ tool: "walk_to", x: 6, y: 3 })).toEqual({ tool: "walk_to", args: { x: 6, y: 3 } });
    expect(normalizeStep({ tool: "exit_map", args: { direction: "down" } })).toEqual({ tool: "exit_map", args: { direction: "down" } });
    expect(normalizeStep({ tool: "walk_to", x: 6, args: { y: 3 } })).toEqual({ tool: "walk_to", args: { x: 6, y: 3 } });
    expect(normalizeStep({ tool: "advance_text" })).toEqual({ tool: "advance_text", args: {} });
  });

  it("refuses an argument given twice", () => {
    expect(() => normalizeStep({ tool: "walk_to", x: 6, args: { x: 7 } })).toThrow(/x given both/);
  });
});

describe("get_state only=[...]", () => {
  const notStarted = { run: { attempt: 1 }, started: false, note: "No Pokémon in the party yet" };

  it("keeps the not-started note and names sections that aren't there", () => {
    expect(pickSections(notStarted, ["location", "party"])).toEqual({ started: false, note: "No Pokémon in the party yet", unavailable: ["location", "party"] });
    expect(pickSections(notStarted, ["run"])).toEqual({ run: { attempt: 1 }, started: false, note: "No Pokémon in the party yet" });
  });

  it("returns just the sections asked for once the game is going", () => {
    const state = { run: { attempt: 1 }, location: { id: "ROUTE_1" }, party: [], bag: [] };
    expect(pickSections(state, ["location", "party"])).toEqual({ location: { id: "ROUTE_1" }, party: [] });
    expect(pickSections(state, undefined)).toBe(state);
  });

  it("explains a missing state instead of returning null", () => {
    expect(pickSections(null, ["run"])).toMatchObject({ started: false, note: expect.stringMatching(/loading/) });
  });
  it("say what to do when a step is a read or not a tool at all", () => {
    // get_map and get_state may end a batch (server.mjs FINAL_READS); other reads are refused with that said.
    expect(stepToolError("get_screen")).toBe("get_screen can't be a step: reads answer you, so call get_screen on its own (before or after the do). Only get_map or get_state may end a batch.");
    expect(stepToolError("teleport")).toMatch(/^"teleport" isn't a step\. Steps can be: walk, walk_to/);
  });

  it("stops after a walk cut short: the next steps were planned from where it should have ended", async () => {
    const short = [
      "up 2/6 — stopped: blocked (a person is in the way)",
      "right 3 — stopped short: the only way on crosses an unbeaten trainer's sight at (8, 4) (HIKER). walk_to that trainer (interact) to fight it on purpose, or choose another target.",
      "down 1/4 — stopped: NOVA is hurt by poison (20→19/28 HP)",
      "3 legs → stopped: no way further right on this map from where you stand — try another direction or get_map",
    ];
    for (const walk of short) {
      const { calls, exec } = scripted([ok({ walk }), ok()]);
      const r = await runBatch([{ tool: "walk_to", args: { x: 9, y: 4 } }, { tool: "walk_to", args: { x: 9, y: 2, interact: true } }], exec);
      expect(calls).toHaveLength(1);
      expect(r.stopped).toMatch(/after step 1 \(walk_to\): the walk stopped short \(/);
    }
    expect(walkCutShort(short[1])).toBe("the only way on crosses an unbeaten trainer's sight at (8, 4) (HIKER)");
  });

  it("goes on after a walk that got there, crossed into the next map, or ran from a battle on the way", () => {
    for (const walk of [
      "up 3/3 — arrived",
      "left 2/2, up 1/1 — arrived (ran from RATTY), facing up",
      "up 4/4 — arrived; crossing: up 1/3 — stopped: entered a new map",
      "up 2/6 — stopped: blocked | retry: up 4/4 — arrived; crossing: up 1/3 — stopped: entered a new map",
      "2 legs → entered a new map",
      "already there",
    ]) expect(walkCutShort(walk)).toBeNull();
  });

  it("stops after a walk that crossed into the next map with legs of its path left", async () => {
    const { calls, exec } = scripted([ok({ walk: "up 0/1 — stopped: entered a new map" }), ok()]);
    const r = await runBatch([{ tool: "walk", args: { path: "U1 R4" } }, { tool: "walk_to", args: { x: 9, y: 4 } }], exec);
    expect(calls).toHaveLength(1);
    expect(r.stopped).toBe("after step 1 (walk): entered a new map with 1 leg of the path left");
    // On its last leg, crossing is how it was meant to end (a walk off the map can ask for more squares).
    expect(stopReason(ok({ walk: "left 2/2, up 1/5 — stopped: entered a new map" }), { tool: "walk", args: { path: "L2 U5" } })).toBeNull();
  });

  it("stops after a hunt that ended without a battle", () => {
    for (const walk of ["300 steps, nothing that counts yet (ran from RATTY)", "left the map while pacing (4 steps; ran from nothing)"]) {
      expect(stopReason(ok({ walk }), { tool: "hunt", args: {} })).toBe("the hunt ended without a battle");
    }
    expect(stopReason(ok({ walk: "RATTY Lv3 — this area's first encounter (2 steps)" }, { battle: "wild" }), { tool: "hunt", args: {} })).toBe("in battle");
  });

  it("stops when fight_trainer talked to someone but no battle started", () => {
    expect(stopReason(ok({ note: "No battle started: talking to them didn't start a fight (already beaten, a story battle that isn't due yet, or not a trainer)." }))).toBe("no battle started");
  });
});
