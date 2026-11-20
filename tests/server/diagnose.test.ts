// Behavioral failure-pattern diagnostics over run logs and transcripts (mcp-server/diagnose.mjs).

import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM module without type declarations
import { detectCompactionAmnesia, detectDeathCauses, detectErrorLoops, detectScreenshotBursts, detectSpatialLoops, diagnoseAttempt, diagnoseReport, hpBeforeCall } from "../../mcp-server/diagnose.mjs";

const call = (n: number, extra: Record<string, unknown> = {}) => ({
  n,
  t: new Date(1_700_000_000_000 + n * 1000).toISOString(),
  ms: 100,
  tool: "walk",
  args: {},
  where: "AREA [MAP_A] x1 y1 | battle: none",
  pos: [1, 1],
  ...extra,
});

const transcriptOf = (events: object[]) => events.map((e) => JSON.stringify(e)).join("\n");

const toolExchange = (id: string, name: string, resultText: string) => [
  { type: "assistant", message: { content: [{ type: "tool_use", id, name: `mcp__nuzlocke-bench__${name}`, input: {} }] } },
  { type: "user", message: { content: [{ type: "tool_result", tool_use_id: id, content: [{ type: "text", text: resultText }] }] } },
];

describe("diagnose", () => {
  it("flags map ping-pong, same-tile spin, and long progress stalls", () => {
    // 25 calls bouncing between MAP_A and MAP_B, plus 5 visits to MAP_A:2,3.
    const pingPong = Array.from({ length: 25 }, (_, i) =>
      call(i + 1, {
        where: `AREA [${i % 2 === 0 ? "MAP_A" : "MAP_B"}] x2 y3 | battle: none`,
        pos: [2, 3],
      }),
    );
    const loopFindings = detectSpatialLoops(pingPong);
    expect(loopFindings.some((f: { kind: string }) => f.kind === "ping-pong")).toBe(true);
    expect(loopFindings.some((f: { kind: string }) => f.kind === "tile-spin")).toBe(true);

    // 65 calls stuck on MAP_A with no new map, badge, or won trainer fight.
    const stalled = Array.from({ length: 65 }, (_, i) => call(i + 1, { pos: [i % 4, 1] }));
    const stallFindings = detectSpatialLoops(stalled);
    expect(stallFindings).toContainEqual(expect.objectContaining({ kind: "stall-at-end", span: 64, map: "MAP_A" }));
  });

  it("flags blind retries and error storms without double-counting", () => {
    const calls = [
      call(1, { tool: "walk_to", args: { x: 4, y: 0 }, error: "No path to (4, 0)" }),
      call(2, { tool: "walk_to", args: { x: 4, y: 0 }, error: "No path to (4, 0)" }),
      call(3, { tool: "walk_to", args: { x: 4, y: 0 }, error: "No path to (4, 0)" }),
      call(4, { tool: "walk_to", args: { x: 4, y: 0 }, error: "No path to (4, 0)" }),
      ...Array.from({ length: 10 }, (_, i) => call(i + 5)),
      call(15, { tool: "choose", args: { option: "YES" }, error: "No menu cursor" }),
    ];
    const found = detectErrorLoops(calls);
    expect(found).toContainEqual(expect.objectContaining({ kind: "blind-retry", call: 1, tool: "walk_to", count: 4 }));
    expect(found).toContainEqual(expect.objectContaining({ kind: "error-storm", call: 1, errors: 5 }));
  });

  it("flags screenshot bursts and tags dark/battle/overworld context", () => {
    const calls = [
      call(1, { tool: "get_screen", images: 1, dark: true, where: "CAVE [DARK_1] | battle: none" }),
      call(2, { tool: "walk", dark: true, where: "CAVE [DARK_1] | battle: none" }),
      call(3, { tool: "get_screen", images: 1, dark: true, where: "CAVE [DARK_1] | battle: none" }),
      call(4, { tool: "get_screen", images: 1, dark: true, where: "CAVE [DARK_1] | battle: none" }),
      ...Array.from({ length: 10 }, (_, i) => call(i + 5)),
    ];
    expect(detectScreenshotBursts(calls)).toEqual([
      { kind: "screenshot-burst", call: 1, count: 3, context: "dark", map: "DARK_1" },
    ]);
  });

  it("flags post-compaction amnesia on backtracking or heavy re-orientation", () => {
    const calls = [
      // Early map visited at call 1, then 200 calls spent on MAP_LATE.
      call(1, { where: "TOWN [MAP_EARLY] x1 y1 | battle: none" }),
      ...Array.from({ length: 199 }, (_, i) => call(i + 2, { where: "TOWN [MAP_LATE] x5 y5 | battle: none" })),
      // Compaction right after call 200: model re-orients and backtracks to MAP_EARLY.
      call(201, { tool: "get_state", where: "TOWN [MAP_LATE] x5 y5 | battle: none" }),
      call(202, { tool: "get_map", where: "TOWN [MAP_LATE] x5 y5 | battle: none" }),
      call(203, { tool: "go_to", where: "TOWN [MAP_EARLY] x1 y1 | battle: none" }),
    ];
    const found = detectCompactionAmnesia(calls, [{ afterCall: 200, tokens: 190_000 }]);
    expect(found).toEqual([
      { kind: "compaction-amnesia", call: 200, reorientCalls: 2, errDelta: 0, backtrackMap: "MAP_EARLY" },
    ]);
  });

  it("classifies combat death causes (including transcript low-HP no-switch) and violations", () => {
    const game = { bigFightClasses: new Set([0x22]) };
    const transcript = transcriptOf([
      ...toolExchange("t1", "fight", "🟢 you: MON_A Lv10 4/40HP | moves: HIT 30pp"),
      ...toolExchange("t2", "fight", "🟢 you: MON_A Lv10 0/40HP"),
    ]);
    const hpBefore = hpBeforeCall(transcript);
    expect(hpBefore.get(2)).toEqual({ hp: 4, maxHp: 40, pct: 0.1 });

    const calls = [
      call(1, { tool: "fight", where: "GYM [GYM_1] | battle: trainer", fight: { trainerClass: 0x22, levelCap: 14, team: [{ level: 13 }] } }),
      call(2, { tool: "fight", where: "GYM [GYM_1] | battle: trainer", deaths: 1 }),
      call(3, {
        tool: "fight",
        where: "GYM [GYM_2] | battle: trainer",
        fight: { trainerClass: 0x22, levelCap: 21, team: [{ level: 15 }] },
        deaths: 2,
      }),
      call(4, { tool: "fight", where: "ROUTE [ROUTE_1] | battle: wild", deaths: 3 }),
      call(5, { tool: "rare_candy", where: "TOWN [TOWN_1] | battle: none", deaths: 3, violations: 1, capViolations: 1 }),
      call(6, { tool: "fight", where: "GYM [GYM_3] | battle: trainer", deaths: 6, violations: 1, capViolations: 1 }),
    ];
    const found = detectDeathCauses(calls, game, { hpBefore });
    expect(found.map((f: { kind: string; call: number }) => `${f.call}:${f.kind}`)).toEqual([
      "2:no-switch-death",
      "3:underleveled-boss-death",
      "4:wild-or-trash-death",
      "5:cap-violation",
      "6:cascade-wipe",
    ]);
  });

  it("combines detectors in diagnoseAttempt and renders per-model tables and timelines", () => {
    const transcript = transcriptOf([
      ...toolExchange("t1", "get_screen", "ok"),
      ...toolExchange("t2", "get_screen", "ok"),
      ...toolExchange("t3", "get_screen", "ok"),
      { type: "system", subtype: "compact_boundary", compact_metadata: { pre_tokens: 180_000 } },
      ...Array.from({ length: 6 }, (_, i) => toolExchange(`r${i}`, "get_state", "ok")).flat(),
    ]);
    const attempt = {
      session: { benchmark: { id: "hardcore-nuzlocke" } },
      calls: [
        call(1, { tool: "get_screen", images: 1 }),
        call(2, { tool: "get_screen", images: 1 }),
        call(3, { tool: "get_screen", images: 1 }),
        ...Array.from({ length: 6 }, (_, i) => call(i + 4, { tool: "get_state" })),
        call(10, { outcome: "gave up" }),
      ],
    };
    const diag = diagnoseAttempt(attempt, { name: "run-1", model: "model-a low", transcript });
    expect(diag.compactions).toBe(1);
    expect(diag.tags).toEqual(["screenshot-burst", "compaction-amnesia"]);
    expect(diag.endCause).toEqual(["screenshot-burst", "compaction-amnesia"]);

    const md = diagnoseReport([diag], { details: true });
    expect(md).toContain("| model-a low | 1 | 0 |");
    expect(md).toContain("screenshot-burst (3 shots in overworld, MAP_A)");
    expect(md).toContain("compaction-amnesia (reorient 6");
    expect(md).toContain("**Near end:** screenshot-burst, compaction-amnesia");
  });
});
