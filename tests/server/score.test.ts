// The score (docs/scoring.md).

import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM module without type declarations
import { scoreRun } from "../../mcp-server/score.mjs";
// @ts-expect-error plain ESM module without type declarations
import { OBJECTIVES, rejectedCalls, screenshotsOf } from "../../mcp-server/report.mjs";

const ALL = OBJECTIVES.map((o: { id: string }) => o.id);

describe("scoreRun", () => {
  it("gives 1210 for all the progress", () => {
    expect(scoreRun({ reached: ALL, calls: 6000 }).progress).toBe(1210);
  });

  it("takes deaths and a disqualification off, with no floor", () => {
    expect(scoreRun({ reached: ["badge1"], deaths: 2, outcome: "disqualified" })).toMatchObject({ total: 60 - 30 - 100, progress: 60 });
  });

  it("charges any early end once, and a wipe's last battle as that end, not per Pokémon", () => {
    expect(scoreRun({ reached: ["badge1"], outcome: "gave up" }).ended).toBe(-45);
    expect(scoreRun({ reached: ["badge1"], outcome: "disqualified" }).ended).toBe(0);
    // Two deaths before, four in the battle that wiped: only the two cost points, plus the end.
    expect(scoreRun({ reached: ["badge1"], outcome: "wipe", deaths: 6, lastBattleDeaths: 4 })).toMatchObject({ deaths: -30, ended: -45 });
    expect(scoreRun({ reached: ["badge1"], outcome: "wipe", deaths: 1, lastBattleDeaths: 1 }).deaths).toBe(0);
  });

  it("gives speed points under a milestone's worth: calls per milestone, the cottage step and the dark tunnel", () => {
    const reached = ["rival1", "badge1"];
    expect(scoreRun({ reached, objectiveCalls: { rival1: 40, badge1: 150 } }).speed).toBe(Math.round(29 * (1 - 75 / 300)));
    expect(scoreRun({ reached, objectiveCalls: { rival1: 40, badge1: 900 } }).speed).toBe(0);
    expect(scoreRun({ reached, objectiveCalls: { badge2: 400, cottageDone: 500 } }).cottageSpeed).toBe(Math.round(29 * (1 - 100 / 400)));
    expect(scoreRun({ reached, objectiveCalls: { badge2: 400 } }).cottageSpeed).toBe(0);
    expect(scoreRun({ reached, dark: { result: "crossed in the dark", calls: 750, flashAt: null } }).tunnelSpeed).toBe(Math.round(29 * 0.5));
    expect(scoreRun({ reached, dark: { result: "not crossed", calls: 300, flashAt: null } }).tunnelSpeed).toBe(0);
    expect(Math.max(...[1, 10, 100].map((c) => scoreRun({ reached, objectiveCalls: { badge1: c } }).speed))).toBeLessThan(30);
  });

  it("gives points for using Flash in the dark tunnel", () => {
    expect(scoreRun({ reached: ["badge3"], dark: { result: "crossed with light", calls: 100, flashAt: 12 } }).flash).toBe(30);
    expect(scoreRun({ reached: ["badge3"], dark: { result: "not crossed, had light", calls: 100, flashAt: 12 } }).flash).toBe(30);
    expect(scoreRun({ reached: ["badge3"], dark: { result: "crossed in the dark", calls: 100, flashAt: null } }).flash).toBe(0);
  });

  it("scores screenshots and failed calls as their own parts", () => {
    expect(Object.keys(scoreRun({ reached: ["badge1"] })).sort()).toEqual(
      ["cottageSpeed", "deaths", "disqualified", "efficiency", "ended", "flash", "progress", "screenshots", "speed", "total", "tunnelSpeed", "wrongCalls"]);
    expect(scoreRun({ reached: ["badge1"], screenshots: 74, wrongCalls: 291 })).toMatchObject({ total: 60 - 222 - 291, progress: 60 });
  });

  it("counts the calls the server rejected from the transcript's error results", () => {
    const result = (text: string, isError = true) =>
      JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", is_error: isError, content: [{ type: "text", text }] }] } });
    const transcript = [
      result("MCP error -32602: Input validation error: Invalid arguments for tool start_game"),
      result("MCP error -32602: Input validation error: Invalid arguments for tool walk_to"),
      result("No noted route from PALLET_TOWN to OAKS_LAB."), // a tool error: the run log counts it
      result("Input validation error mentioned in a normal result", false),
      "not json Input validation error",
    ].join("\n");
    expect(rejectedCalls(transcript)).toBe(2);
    expect(rejectedCalls(null)).toBe(0);
  });

  it("gives efficiency points only to finishers, whole points only", () => {
    expect(scoreRun({ reached: ALL, calls: 3494 }).efficiency).toBe(250);
    expect(scoreRun({ reached: ["badge1"], calls: 100 }).efficiency).toBe(0);
    expect(scoreRun({ reached: ALL, calls: 7000 }).efficiency).toBe(0);
  });

  it("has no maximum beyond what the parts give", () => {
    expect(scoreRun({ reached: ALL, calls: 1000 }).total).toBe(1710);
  });
});

describe("screenshotsOf", () => {
  it("counts its own calls and the ones in a batch", () => {
    const calls = [{ tool: "get_screen" }, { tool: "walk" }, { tool: "do", args: { steps: [{ tool: "get_screen" }, { tool: "press" }] } }];
    expect(screenshotsOf(calls)).toBe(2);
  });

  it("charges 3 per screenshot and 1 per failed call, for every run", () => {
    const base = scoreRun({ reached: ["badge1"], outcome: "wipe" });
    const messy = scoreRun({ reached: ["badge1"], outcome: "wipe", screenshots: 4, wrongCalls: 10 });
    expect(messy.screenshots).toBe(-12);
    expect(messy.wrongCalls).toBe(-10);
    expect(messy.total).toBe(base.total - 22);
    expect(scoreRun({ reached: ["badge1"] }).screenshots).toBe(0);
  });
});
