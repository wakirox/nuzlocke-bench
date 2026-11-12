// The `do` tool: the model's own actions chained in one call, stopping wherever there's
// something new to decide.

import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM module without type declarations
import { BATCH_TOOLS, normalizeStep, runBatch, stepSummary, stepToolError, stopReason } from "../../mcp-server/batch.mjs";
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
});
