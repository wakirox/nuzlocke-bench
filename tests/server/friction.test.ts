// The friction report: spots in recorded runs where the tools may have let the model down.

import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM module without type declarations
import { callsOf, findingsOf, frictionReport, screenshotsOf, whereOf } from "../../mcp-server/friction.mjs";

/** A transcript from [tool, args, result text] triples, the way stream-json records them. */
const transcript = (calls: [string, object, string][]) => calls.flatMap(([name, input, text], i) => [
  JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", id: `t${i}`, name: `mcp__nuzlocke-bench__${name}`, input }] } }),
  JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: `t${i}`, content: [{ type: "text", text }] }] } }),
]).join("\n");

const GATE = "📍 ROUTE 2 (Building) [FOREST_GATE] x4 y1 | battle: none\nWalk: up 0/1 — stopped: blocked (wall, person, or a scripted event)";

describe("friction", () => {
  it("reads positions and calls from a transcript", () => {
    expect(whereOf(GATE)).toEqual({ map: "FOREST_GATE", x: 4, y: 1 });
    expect(whereOf("📍 A CAVE [DARK_CAVE] | battle: none")).toEqual({ map: "DARK_CAVE", x: null, y: null });
    const calls = callsOf(transcript([["walk_to", { x: 4, y: 0 }, GATE]]));
    expect(calls).toMatchObject([{ i: 1, tool: "walk_to", args: { x: 4, y: 0 } }]);
  });

  it("doesn't count a walk cut short by a trainer walking up to fight", () => {
    const met = "📍 TOWN 2 (Building) [GYM_2] x5 y3 | battle: trainer\nWalk: left 2/4 — stopped: blocked (wall, person, or a scripted event)";
    expect(findingsOf(callsOf(transcript([["fight_trainer", { x: 2, y: 3 }, met]])))).toEqual([]);
  });

  it("labels a walk that a retry finished by where it started, even if it ended on another map", () => {
    const town = "📍 TOWN 1 [TOWN_1] x29 y20 | battle: none";
    const walk = "📍 ROUTE 1 [ROUTE_1] x10 y0 | battle: none\nWalk: left 7/8 — stopped: blocked (wall, person, or a scripted event) | retry: down 1/1 — arrived";
    const found = findingsOf(callsOf(transcript([["get_map", {}, town], ["exit_map", { direction: "down" }, walk]])));
    expect(found).toMatchObject([{ kind: "blocked", key: "TOWN_1 (29,20) going left, then a retry got there", map: "TOWN_1" }]);
  });

  it("finds blocked walks, errors, empty results, screenshots and repeated calls", () => {
    const calls = callsOf(transcript([
      ["walk_to", { x: 4, y: 0 }, GATE],
      ["read_screen_text", {}, ""],
      ["get_screen", {}, "(No text on screen)"],
      ["walk_to", { x: 9, y: 9 }, "No path to (9, 9) on this map."],
      ["press", { buttons: "a" }, "ok"],
      ["press", { buttons: "a" }, "ok"],
      ["press", { buttons: "a" }, "ok"],
      ["fight", { move: 1 }, "ok"],
      ["fight", { move: 1 }, "ok"],
      ["fight", { move: 1 }, "ok"],
    ]));
    calls[3].isError = true;
    const kinds = findingsOf(calls).map((f: { kind: string; key: string }) => `${f.kind}: ${f.key}`);
    expect(kinds).toEqual([
      "blocked: FOREST_GATE (4,1) going up",
      "empty: read_screen_text returned nothing",
      "screenshot: FOREST_GATE",
      "error: walk_to: No path to (#, #) on this map.",
      'repeat: press {"buttons":"a"}',
    ]);
  });

  it("ranks a spot several runs trip on first, and lists playtest reports", () => {
    const run = (name: string, n: number) => ({ name, model: "m", calls: callsOf(transcript(Array.from({ length: n }, () => ["walk_to", { x: 4, y: 0 }, GATE] as [string, object, string]))), issues: [] });
    const report = frictionReport([
      run("2026-10-12T10-00-00-000Z", 1),
      run("2026-10-12T11-00-00-000Z", 1),
      { ...run("2026-10-12T12-00-00-000Z", 0), issues: [{ n: 7, where: "TOWN_2 x3 y4", did: "walk_to (4,0)", expected: "to walk in", happened: "blocked" }] },
    ]);
    expect(report).toMatch(/\| FOREST_GATE \(4,1\) going up \| 2 \| 2 \|/);
    expect(report).toMatch(/Reported by the model \(1; its own words, not checked\)[\s\S]*TOWN_2 x3 y4/);
  });

  it("lists each screenshot with the calls that led to it and what came next", () => {
    const LAB = "📍 TOWN [LAB] x6 y4 facing up | battle: none";
    const lines = [
      JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", id: "a", name: "mcp__nuzlocke-bench__walk_to", input: { x: 6, y: 4 } }] } }),
      JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "a", content: [{ type: "text", text: `1. walk_to\n${LAB}\n(stopped: no text on screen)` }] }] } }),
      JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "Nothing happened; let me look." }, { type: "tool_use", id: "b", name: "mcp__nuzlocke-bench__get_screen", input: {} }] } }),
      JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "b", content: [{ type: "image" }] }] } }),
      JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "A picture: press A." }, { type: "tool_use", id: "c", name: "mcp__nuzlocke-bench__press", input: { buttons: "a" } }] } }),
      JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "c", content: [{ type: "text", text: `${LAB}\nScreen:\n  Text: You'll take it?` }] }] } }),
    ].join("\n");
    const [shot] = screenshotsOf(callsOf(lines));
    expect(shot).toMatchObject({ call: 2, map: "LAB", said: "Nothing happened; let me look." });
    expect(shot.before).toEqual(['walk_to {"x":6,"y":4} → (stopped: no text on screen)']);
    expect(shot.after).toEqual({ said: "A picture: press A.", call: 'press {"buttons":"a"} → Text: You\'ll take it?' });
    expect(frictionReport([{ name: "2026-11-12T00-00-00Z", model: "m", calls: callsOf(lines) }])).toContain("Screenshots, one by one (1)");
  });
});
