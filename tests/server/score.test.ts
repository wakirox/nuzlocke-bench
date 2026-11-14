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
    expect(scoreRun({ reached: ["badge1"], deaths: 2, outcome: "disqualified" })).toMatchObject({ total: 60 - 30 - 150, progress: 60 });
    // Breaking a rule at a badge scores below a clean wipe a badge earlier.
    expect(scoreRun({ reached: ["badge1", "badge2"], outcome: "disqualified" }).total).toBeLessThan(scoreRun({ reached: ["badge1"], outcome: "wipe" }).total);
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
    expect(scoreRun({ reached, calls: 150, objectiveCalls: { rival1: 40, badge1: 150 } }).speed).toBe(Math.round(29 * (1 - 75 / 300)));
    expect(scoreRun({ reached, calls: 900, objectiveCalls: { rival1: 40, badge1: 150 } }).speed).toBe(0);
    // Every call counts, the ones after the furthest milestone too: stuck there for 600 calls, it's slow.
    expect(scoreRun({ reached, calls: 750, objectiveCalls: { rival1: 40, badge1: 150 } }).speed).toBe(0);
    expect(scoreRun({ reached, calls: 300, objectiveCalls: { rival1: 40, badge1: 150 } }).speed).toBe(Math.round(29 * 0.5));
    expect(scoreRun({ reached: [], calls: 50 }).speed).toBe(0);
    expect(scoreRun({ reached, objectiveCalls: { badge2: 400, cottageDone: 500 } }).cottageSpeed).toBe(Math.round(29 * (1 - 100 / 400)));
    expect(scoreRun({ reached, objectiveCalls: { badge2: 400 } }).cottageSpeed).toBe(0);
    expect(scoreRun({ reached, dark: { result: "crossed in the dark", calls: 750, flashAt: null } }).tunnelSpeed).toBe(Math.round(29 * 0.5));
    expect(scoreRun({ reached, dark: { result: "not crossed", calls: 300, flashAt: null } }).tunnelSpeed).toBe(0);
    expect(Math.max(...[1, 10, 100].map((c) => scoreRun({ reached, calls: c }).speed))).toBeLessThan(30);
  });

  it("gives points for using Flash in the dark tunnel", () => {
    expect(scoreRun({ reached: ["badge3"], dark: { result: "crossed with light", calls: 100, flashAt: 12 } }).flash).toBe(30);
    expect(scoreRun({ reached: ["badge3"], dark: { result: "not crossed, had light", calls: 100, flashAt: 12 } }).flash).toBe(30);
    expect(scoreRun({ reached: ["badge3"], dark: { result: "crossed in the dark", calls: 100, flashAt: null } }).flash).toBe(0);
  });

  it("scores screenshots and failed calls as their own parts", () => {
    expect(Object.keys(scoreRun({ reached: ["badge1"] })).sort()).toEqual(
      ["cottageSpeed", "deaths", "disqualified", "efficiency", "ended", "flash", "progress", "screenshots", "speed", "total", "tunnelSpeed", "winFloor", "wrongCalls"]);
    expect(scoreRun({ reached: ["badge1"], calls: 2910, screenshots: 74, wrongCalls: 291 })).toMatchObject({ total: 60 - 51 - 40, progress: 60 });
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

  it("never scores a win below losing to the Champion with the same run", () => {
    const toChampion = OBJECTIVES.map((o: { id: string }) => o.id).filter((id: string) => id !== "champion");
    const run = { calls: 5850, deaths: 13 };
    const won = scoreRun({ ...run, reached: [...toChampion, "champion"], outcome: "victory" });
    const lost = scoreRun({ ...run, reached: toChampion, outcome: "wipe" });
    expect(won.winFloor).toBeGreaterThan(0);
    expect(won.total).toBeGreaterThan(lost.total);
    // A usual win needs no floor.
    expect(scoreRun({ ...run, calls: 2000, deaths: 6, reached: [...toChampion, "champion"], outcome: "victory" }).winFloor).toBe(0);
  });

  it("never scores a win by losing Pokémon to the Champion below wiping there", () => {
    // 8 deaths on the way, a team of 5: win losing 4 in the fight, or lose all 5 (forgiven as the wipe).
    const toChampion = OBJECTIVES.map((o: { id: string }) => o.id).filter((id: string) => id !== "champion");
    const won = scoreRun({ calls: 5850, deaths: 12, lastBattleDeaths: 4, reached: [...toChampion, "champion"], outcome: "victory" });
    const lost = scoreRun({ calls: 5850, deaths: 13, lastBattleDeaths: 5, reached: toChampion, outcome: "wipe" });
    expect(won.winFloor).toBeGreaterThan(0);
    expect(won.total).toBeGreaterThan(lost.total);
    // The Champion-fight deaths only set the floor: they're still charged at -30 each.
    expect(won.deaths).toBe(12 * -30);
  });

  it("has no maximum beyond what the parts give", () => {
    // Everything, at 1,000 calls: the parts and the pace (1,000 calls over every milestone).
    expect(scoreRun({ reached: ALL, calls: 1000 }).total).toBe(1710 + Math.round(29 * (1 - 1000 / ALL.length / 300)));
  });
});

describe("screenshotsOf", () => {
  it("counts its own calls and the ones in a batch", () => {
    const calls = [{ tool: "get_screen" }, { tool: "walk" }, { tool: "do", args: { steps: [{ tool: "get_screen" }, { tool: "press" }] } }];
    expect(screenshotsOf(calls)).toBe(2);
  });

  it("charges 20 per percentage point of screenshots and 4 per percentage point of failed calls, for every run", () => {
    const base = scoreRun({ reached: ["badge1"], outcome: "wipe", calls: 200 });
    const messy = scoreRun({ reached: ["badge1"], outcome: "wipe", calls: 200, screenshots: 4, wrongCalls: 10 });
    expect(messy.screenshots).toBe(-40);
    expect(messy.wrongCalls).toBe(-20);
    expect(messy.total).toBe(base.total - 60);
    expect(scoreRun({ reached: ["badge1"] }).screenshots).toBe(0);
    // The same share costs the same in a short run and a long one.
    expect(scoreRun({ reached: ["badge1"], calls: 3000, screenshots: 60 }).screenshots).toBe(messy.screenshots);
  });

  it("takes the rejected calls' share out of every call made, logged or rejected", () => {
    // 94 logged calls, 4 of them failed, and 6 rejected before they ran: 10 of 100 calls failed.
    expect(scoreRun({ reached: ["badge1"], calls: 94, wrongCalls: 10, rejected: 6 }).wrongCalls).toBe(-40);
    // Only rejected calls: still a share of all the calls.
    expect(scoreRun({ reached: ["badge1"], calls: 0, wrongCalls: 5, rejected: 5 }).wrongCalls).toBe(-400);
  });

  it("charges failed calls by their share of the calls, not their number", () => {
    // The same 6% failed: a long run pays what a short one does.
    expect(scoreRun({ reached: ["badge1"], calls: 500, wrongCalls: 30 }).wrongCalls).toBe(-24);
    expect(scoreRun({ reached: ["badge1"], calls: 3000, wrongCalls: 180 }).wrongCalls).toBe(-24);
    expect(scoreRun({ reached: ["badge1"], calls: 3000, wrongCalls: 30 }).wrongCalls).toBe(-4);
    // No calls on record: nothing to take a share of. More failures than calls: capped at all of them.
    expect(scoreRun({ reached: ["badge1"], wrongCalls: 30 }).wrongCalls).toBe(0);
    expect(scoreRun({ reached: ["badge1"], calls: 10, wrongCalls: 30 }).wrongCalls).toBe(-400);
    expect(scoreRun({ reached: ["badge1"], calls: 100 }).wrongCalls).toBe(0);
  });

  it("charges a finisher's deaths double", () => {
    expect(scoreRun({ reached: ALL, calls: 6000, deaths: 6 }).deaths).toBe(-180);
    expect(scoreRun({ reached: ALL.filter((id: string) => id !== "champion"), calls: 6000, deaths: 6 }).deaths).toBe(-90);
  });
});
