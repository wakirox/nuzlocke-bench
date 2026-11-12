// The benchmark runner: when a session stops, and what it says to the model (only "keep playing").

import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM module without type declarations
import { NUDGE, TokenMeter, PROMPT, loggedPreset, claudeArgs, mcpConfig, nextStep, runEnded, runnerEnv, userTurn } from "../../mcp-server/bench-runner.mjs";
// @ts-expect-error plain ESM module without type declarations
import { table } from "../../mcp-server/report.mjs";

const turn = (cost = 1, subtype = "success") => ({ subtype, total_cost_usd: cost });

describe("bench runner", () => {
  it("sees the end of the run in a tool result", () => {
    expect(runEnded("📍 ROUTE_1 | battle: none\n🏁 RUN ENDED — victory: Won the first badge")).toBe(true);
    expect(runEnded("📍 ROUTE_1 | battle: none")).toBe(false);
  });

  it("sees the end of the run in get_state too, so it doesn't nudge after it", () => {
    expect(runEnded(JSON.stringify({ run: { outcome: { kind: "disqualified", detail: "A rule" } }, started: true }))).toBe(true);
    expect(runEnded(JSON.stringify({ run: { outcome: null }, started: true }))).toBe(false);
    expect(runEnded(JSON.stringify({ party: [] }))).toBe(false);
  });

  it("nudges a model that stops before the run is over", () => {
    expect(nextStep({ ended: false, result: turn(), nudges: 0, maxNudges: 10 })).toEqual({ nudge: true });
  });

  it("stops when the run is over, the budget is used, the nudges run out or the session failed", () => {
    expect(nextStep({ ended: true, result: turn(), nudges: 0, maxNudges: 10 }).stop).toMatch(/run is over/);
    expect(nextStep({ ended: false, result: turn(), nudges: 0, maxNudges: 10, maxTokens: 500e6, tokens: 500e6 }).stop).toMatch(/token limit/);
    expect(nextStep({ ended: false, result: turn(), nudges: 10, maxNudges: 10 }).stop).toMatch(/10 nudges/);
    expect(nextStep({ ended: false, result: turn(), nudges: 2, maxNudges: 3 })).toEqual({ nudge: true });
    expect(nextStep({ ended: false, result: turn(), nudges: 3, maxNudges: 3 })).toMatchObject({ gaveUp: true, stop: expect.stringMatching(/gave up.*3 nudges/) });
    expect(nextStep({ ended: false, result: turn(1, "error_max_budget_usd"), nudges: 0, maxNudges: 10 }).stop).toMatch(/error_max_budget_usd/);
  });

  it("stops on a failed turn (a usage limit) instead of nudging it, and doesn't call it giving up", () => {
    const limit = { subtype: "success", is_error: true, result: "You've hit your session limit · resets 7:10pm", total_cost_usd: 1 };
    const step = nextStep({ ended: false, result: limit, nudges: 0, maxNudges: 10, idleNudges: 2 });
    expect(step.stop).toMatch(/session ended: You've hit your session limit/);
    expect(step.gaveUp).toBeUndefined();
  });

  it("ends the run as given up after 3 nudges in a row answered without playing", () => {
    expect(nextStep({ ended: false, result: turn(), nudges: 2, maxNudges: 10, idleNudges: 2 })).toEqual({ nudge: true });
    expect(nextStep({ ended: false, result: turn(), nudges: 3, maxNudges: 10, idleNudges: 3 })).toMatchObject({ gaveUp: true, stop: expect.stringMatching(/gave up/) });
  });

  it("never gives the model hints: the prompt and nudge say what to do, not how", () => {
    expect(NUDGE).toBe("The run isn't over. Keep playing.");
    expect(PROMPT).toMatch(/get_rules/);
    expect(JSON.parse(userTurn(NUDGE))).toEqual({ type: "user", message: { role: "user", content: [{ type: "text", text: NUDGE }] } });
  });

  it("gives the model only the game's tools, and the server its own port, saves and log", () => {
    const args = claudeArgs({ model: "m", effort: "medium", configFile: "c.json" });
    expect(args).toEqual(expect.arrayContaining(["--strict-mcp-config", "--allowedTools", "mcp__nuzlocke-bench", "--effort", "medium"]));
    expect(args).not.toContain("--max-budget-usd"); // Claude Code would tell the model its dollar budget
    expect(args[args.indexOf("--tools") + 1]).toBe("");
    expect(args).toContain("--no-session-persistence"); // nothing kept for a later run to find
    expect(runnerEnv({ PATH: "/bin" })).toEqual({ PATH: "/bin", CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1", CLAUDE_CODE_AUTO_COMPACT_WINDOW: "200000" });
    expect(runnerEnv({ PATH: "/bin" }, 0)).toEqual({ PATH: "/bin", CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1" }); // the model's own window
    const env = mcpConfig({ node: "node", server: "s.mjs", rom: "r.gb", preset: "p", port: 7890, savesDir: "sv", runLog: "l.jsonl" }).mcpServers["nuzlocke-bench"].env;
    expect(env).toEqual({ NUZLOCKE_HEADLESS: "1", NUZLOCKE_BENCHMARK: "p", NUZLOCKE_ROM: "r.gb", NUZLOCKE_BRIDGE_PORT: "7890", NUZLOCKE_SAVES_DIR: "sv", NUZLOCKE_RUN_LOG: "l.jsonl" });
  });

  it("shows who played, the nudges and the tokens in the report", () => {
    const row = { name: "r1", preset: "p", outcome: "unfinished", victory: false, badges: 0, deaths: 0, violations: 0, playTime: null, splits: [], calls: 3, errors: 0, wallMs: 0, chars: 0, charsPerCall: 0, topTools: "" };
    const t = table([{ ...row, agent: { model: "m", effort: "low", nudges: 2, tokens: { total: 12_340_000, turns: 321 } } }, { ...row, name: "r2", agent: null }]);
    expect(t).toContain("| r1 | m (low) | p |");
    expect(t).toContain("| 2 | 12.3M (321) |");
    expect(t).toContain("| r2 | — | p |");
    expect(table([{ ...row, agent: { model: "m", gaveUp: true, nudges: 3 } }])).toContain("gave up");
    expect(table([{ ...row, agent: { model: "m", resumedFrom: "run-a" } }])).toContain("m · continued from run-a"); // not a clean result
    expect(table([{ ...row, agent: { model: "m", narrated: true } }])).toContain("m · narrated");
  });
});

describe("run folders", () => {
  // @ts-expect-error plain ESM module without type declarations
  const load = () => import("../../mcp-server/run-folder.mjs");

  it("keeps everything about a run in runs/<id>/", async () => {
    const { runFiles } = await load();
    const r = runFiles("/x/runs/2026-10-12T19-00-00-000Z");
    expect(r).toMatchObject({
      name: "2026-10-12T19-00-00-000Z",
      runLog: "/x/runs/2026-10-12T19-00-00-000Z/run-log.jsonl",
      transcript: "/x/runs/2026-10-12T19-00-00-000Z/transcript.jsonl",
      agent: "/x/runs/2026-10-12T19-00-00-000Z/agent.json",
      saves: "/x/runs/2026-10-12T19-00-00-000Z/saves",
    });
  });

  it("still finds runs saved as loose files before folders", async () => {
    const { locateRun } = await load();
    for (const p of ["/x/runs/old-run-saves", "/x/runs/old-run.jsonl"]) {
      expect(locateRun(p)).toMatchObject({ name: "old-run", runLog: "/x/runs/old-run.jsonl", agent: "/x/runs/old-run.agent.json", saves: "/x/runs/old-run-saves" });
    }
  });
});

describe("objectives", () => {
  it("are reached by badges or by first standing on a map, and runs are grouped by model and preset", async () => {
    // @ts-expect-error plain ESM module without type declarations
    const { objectivesOf, objectivesTable } = await import("../../mcp-server/report.mjs");
    const calls = [
      { badges: 1, where: "TOWN 2 [TOWN_2] x1 y1", playTime: "0:30:00" },
      { badges: 2, where: "TOWN 3 [CERULEAN_CITY] x1 y1", playTime: "1:00:00" },
    ];
    const reached = objectivesOf(calls);
    expect(reached).toEqual({ badge1: "0:30:00", cave1: "1:00:00", badge2: "1:00:00", rival1: "0:30:00" }); // no fights recorded: the rival behind it is assumed
    const agent = { model: "claude-haiku-5-5", effort: "medium" };
    const table = objectivesTable([
      { name: "a", preset: "p", agent, objectives: reached },
      { name: "b", preset: "p", agent, objectives: { badge1: "0:40:00" } },
      { name: "c", preset: "p", agent: { ...agent, resumedFrom: "a" }, objectives: { cottage: "2:00:00" } },
    ]);
    expect(table).toMatch(/\| Badge 2 \| 1\/2 \(50%\) \|/);
    expect(table).toMatch(/\| Cottage past the bridge \| 1\/2 \(50%\) \|/); // "c" continues "a": one run
    expect(table).toMatch(/haiku-5-5 medium · p\*\* stopped before: (Through the first cave 1, Cottage step done.* 1|Cottage step done.* 1, Through the first cave 1)/);
  });
});

describe("the runner's tokens", () => {
  it("counts each API call once: its tokens and the turns", () => {
    const m = new TokenMeter();
    const msg = (id: string, usage: object) => ({ type: "assistant", message: { id, usage } });
    m.add(msg("a", { input_tokens: 10, cache_read_input_tokens: 1000, output_tokens: 5 }));
    m.add(msg("a", { input_tokens: 10, cache_read_input_tokens: 1000, output_tokens: 5 })); // the same message's next content event
    m.add(msg("b", { cache_creation_input_tokens: 200, output_tokens: 50 }));
    expect(m.totals()).toEqual({ input: 10, output: 55, cacheWrite: 200, cacheRead: 1000, total: 1265, turns: 2 });
  });

  it("takes the session's own token figures at each turn's end: they add up over the session", () => {
    const m = new TokenMeter();
    const msg = (id: string, usage: object) => ({ type: "assistant", message: { id, usage } });
    const result = (num_turns: number, used: object) => ({ type: "result", num_turns, modelUsage: { "some-model": used } });
    m.add(msg("a", { input_tokens: 10, cache_read_input_tokens: 1000, output_tokens: 5 })); // an early output figure
    m.add(result(3, { inputTokens: 30, outputTokens: 500, cacheReadInputTokens: 1200, cacheCreationInputTokens: 70 }));
    expect(m.totals()).toEqual({ input: 30, output: 500, cacheWrite: 70, cacheRead: 1200, total: 1800, turns: 3 });
    // The next turn: its messages count on top until its own result replaces them.
    m.add(msg("b", { input_tokens: 1, cache_read_input_tokens: 100, output_tokens: 2 }));
    expect(m.totals()).toEqual({ input: 31, output: 502, cacheWrite: 70, cacheRead: 1300, total: 1903, turns: 4 });
    m.add(result(2, { inputTokens: 40, outputTokens: 900, cacheReadInputTokens: 1500, cacheCreationInputTokens: 70 }));
    expect(m.totals()).toEqual({ input: 40, output: 900, cacheWrite: 70, cacheRead: 1500, total: 2510, turns: 5 });
  });

  it("adds each turn's usage when the result has no session figures, and keeps the messages' count when it has neither", () => {
    const msg = (id: string, usage: object) => ({ type: "assistant", message: { id, usage } });
    const m = new TokenMeter();
    m.add(msg("a", { output_tokens: 5 }));
    m.add({ type: "result", num_turns: 2, usage: { input_tokens: 4, output_tokens: 50, cache_read_input_tokens: 6 } });
    m.add(msg("b", { output_tokens: 1 }));
    m.add({ type: "result", num_turns: 1, usage: { output_tokens: 20 } });
    expect(m.totals()).toEqual({ input: 4, output: 70, cacheWrite: 0, cacheRead: 6, total: 80, turns: 3 });
    const direct = new TokenMeter();
    direct.add(msg("a", { input_tokens: 7, output_tokens: 5 }));
    direct.add({ type: "result", subtype: "success", num_turns: 1 });
    direct.add(msg("b", { input_tokens: 8, output_tokens: 5 }));
    expect(direct.totals()).toEqual({ input: 15, output: 10, cacheWrite: 0, cacheRead: 0, total: 25, turns: 2 });
  });

  it("reads a run's preset from its run log, for a run to continue that left no agent.json", () => {
    const session = (id: string) => JSON.stringify({ type: "session", benchmark: { id } });
    expect(loggedPreset(`${session("full+hardcap")}\n{"n":1,"tool":"get_rules"}\n`)).toBe("full+hardcap");
    expect(loggedPreset(`${session("a")}\n${session("b")}\n{"type":"session","benchm`)).toBe("b");
    expect(loggedPreset("")).toBeNull();
    expect(loggedPreset(null)).toBeNull();
  });
});
