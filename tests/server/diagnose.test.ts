// Behavioral failure-pattern diagnostics over run logs and transcripts (mcp-server/diagnose.mjs).

import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM module without type declarations
import { detectCompactionAmnesia, detectDeathCauses, detectErrorLoops, detectScreenshotBursts, detectSpatialLoops, diagnoseAttempt, diagnoseReport, hpBeforeCall, joinDiagnosedRuns } from "../../mcp-server/diagnose.mjs";

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
  it("flags map ping-pong, returning tile-spin, and long stalls — without flagging stationary interactions", () => {
    // Stationary non-movement calls on one square (healing at a counter / shopping / dialogue): never a tile-spin.
    const atCounter = Array.from({ length: 15 }, (_, i) =>
      call(i + 1, { tool: i % 2 === 0 ? "advance_text" : "choose", pos: [3, 4], where: "CENTER [CENTER_1] x3 y4 | battle: none" }),
    );
    expect(detectSpatialLoops(atCounter)).toEqual([]);

    // Repeated movement calls staying put on the same tile don't count as returning to it either.
    const stayingPut = Array.from({ length: 12 }, (_, i) => call(i + 1, { tool: "walk", pos: [3, 4] }));
    expect(detectSpatialLoops(stayingPut).filter((f: { kind: string }) => f.kind === "tile-spin")).toEqual([]);

    // 25 movement calls genuinely bouncing between MAP_A:(2,3) and MAP_B:(2,3).
    const pingPong = Array.from({ length: 25 }, (_, i) =>
      call(i + 1, {
        tool: "walk",
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

  it("flags blind retries and stuck error storms, ignoring scattered errors with movement between them", () => {
    // 5 errors separated by successful movement to new tiles: normal guidance, not an error storm.
    const scattered = [
      call(1, { tool: "walk_to", error: "No path" }),
      call(2, { pos: [2, 1] }),
      call(3, { tool: "walk_to", error: "No path" }),
      call(4, { pos: [3, 1] }),
      call(5, { tool: "walk_to", error: "No path" }),
      call(6, { pos: [4, 1] }),
      call(7, { tool: "walk_to", error: "No path" }),
      call(8, { pos: [5, 1] }),
      call(9, { tool: "walk_to", error: "No path" }),
    ];
    expect(detectErrorLoops(scattered)).toEqual([]);

    // Stuck on the same tile: 4 identical failing retries + 1 more error within 15 calls = blind-retry + error-storm.
    const stuck = [
      call(1, { tool: "walk_to", args: { x: 4, y: 0 }, error: "No path to (4, 0)" }),
      call(2, { tool: "walk_to", args: { x: 4, y: 0 }, error: "No path to (4, 0)" }),
      call(3, { tool: "walk_to", args: { x: 4, y: 0 }, error: "No path to (4, 0)" }),
      call(4, { tool: "walk_to", args: { x: 4, y: 0 }, error: "No path to (4, 0)" }),
      ...Array.from({ length: 10 }, (_, i) => call(i + 5, { tool: "get_state" })),
      call(15, { tool: "choose", args: { option: "YES" }, error: "No menu cursor" }),
    ];
    const found = detectErrorLoops(stuck);
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
      call(1, { where: "TOWN [MAP_EARLY] x1 y1 | battle: none" }),
      ...Array.from({ length: 199 }, (_, i) => call(i + 2, { where: "TOWN [MAP_LATE] x5 y5 | battle: none" })),
      call(201, { tool: "get_state", where: "TOWN [MAP_LATE] x5 y5 | battle: none" }),
      call(202, { tool: "get_map", where: "TOWN [MAP_LATE] x5 y5 | battle: none" }),
      call(203, { tool: "go_to", where: "TOWN [MAP_EARLY] x1 y1 | battle: none" }),
    ];
    const found = detectCompactionAmnesia(calls, [{ afterCall: 200, tokens: 190_000 }]);
    expect(found).toEqual([
      { kind: "compaction-amnesia", call: 200, reorientCalls: 2, errDelta: 0, backtrackMap: "MAP_EARLY" },
    ]);
  });

  it("classifies combat death causes (including trainer vs wild and transcript low-HP no-switch) and violations", () => {
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
      call(4, { tool: "fight", where: "ROUTE [ROUTE_1] | battle: trainer", fight: { trainerClass: 0x03, team: [{ level: 16 }] }, deaths: 3 }),
      call(5, { tool: "fight", where: "ROUTE [ROUTE_2] | battle: wild", deaths: 4 }),
      call(6, { tool: "rare_candy", where: "TOWN [TOWN_1] | battle: none", deaths: 4, violations: 1, capViolations: 1 }),
      call(7, { tool: "fight", where: "GYM [GYM_3] | battle: trainer", deaths: 7, violations: 1, capViolations: 1 }),
    ];
    const found = detectDeathCauses(calls, game, { hpBefore });
    expect(found.map((f: { kind: string; call: number }) => `${f.call}:${f.kind}`)).toEqual([
      "2:no-switch-death",
      "3:underleveled-boss-death",
      "4:trainer-death",
      "5:wild-death",
      "6:cap-violation",
      "7:cascade-wipe",
    ]);
  });

  it("joins continued runs across resumedFrom legs and prints n/a compactions for agy transcripts", () => {
    const leg1 = diagnoseAttempt(
      {
        session: { benchmark: { id: "hardcore-nuzlocke" } },
        calls: [
          call(1, { tool: "get_screen", images: 1, badges: 4 }),
          call(2, { tool: "get_screen", images: 1, badges: 4 }),
          call(3, { tool: "get_screen", images: 1, badges: 8 }),
        ],
      },
      { name: "2026-11-19T10-00-00", model: "model-b low", agent: { via: "agy" }, transcript: transcriptOf(toolExchange("a1", "get_screen", "ok")) },
    );
    const leg2 = diagnoseAttempt(
      {
        session: { benchmark: { id: "hardcore-nuzlocke" } },
        calls: [
          call(1, { tool: "get_state", badges: 8, deaths: 3, where: "LEAGUE [LOBBY_1] | battle: none" }),
          call(2, { tool: "fight", badges: 8, deaths: 4, where: "LEAGUE [ROOM_1] | battle: trainer" }),
          call(3, { tool: "fight", badges: 8, deaths: 4, outcome: "victory: Champion beaten" }),
        ],
      },
      { name: "2026-11-20T06-20-39", model: "model-b low", agent: { via: "agy", resumedFrom: "2026-11-19T10-00-00" }, initialDeaths: 3 },
    );

    const joined = joinDiagnosedRuns([leg1, leg2]);
    expect(joined).toHaveLength(1);
    expect(joined[0]).toMatchObject({
      name: "2026-11-19T10-00-00",
      legs: 2,
      outcome: "victory",
      victory: true,
      badges: 8,
      calls: 6,
      deaths: 4,
      compactions: null,
    });
    // Leg 2's call 1 carried 3 prior deaths (not flagged); its real death at call 2 is offset by leg 1's 3 calls (2 + 3 = 5).
    expect(joined[0].incidents.map((i: { call: number; kind: string }) => `${i.call}:${i.kind}`)).toEqual([
      "1:screenshot-burst",
      "5:trainer-death",
    ]);

    const md = diagnoseReport(joined, { details: true });
    expect(md).toContain("| model-b low | 1 | 1 |");
    expect(md).toContain("| n/a |");
    expect(md).toContain("compactions n/a, 2 legs");
  });

  it("renders Claude Code compaction counts, amnesia findings, and near-end causes", () => {
    const transcript = transcriptOf([
      { type: "system", subtype: "init" },
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
    const diag = diagnoseAttempt(attempt, { name: "run-1", model: "model-a low", transcript, agent: { gaveUp: true } });
    expect(diag.compactions).toBe(1);
    expect(diag.outcome).toBe("gave up");
    expect(diag.tags).toEqual(["screenshot-burst", "compaction-amnesia"]);

    const md = diagnoseReport([diag], { details: true });
    expect(md).toContain("| model-a low | 1 | 0 |");
    expect(md).toContain("1 compactions");
    expect(md).toContain("compaction-amnesia (reorient 6");
    expect(md).toContain("**Near end:** screenshot-burst, compaction-amnesia");
  });
});
