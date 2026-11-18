// A benchmark run's tool-call budget (mcp-server/call-budget.mjs) and where a run's harness came
// from (mcp-server/provenance.mjs).

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM module without type declarations
import { UNCOUNTED, UNCOUNTED_RESULT, callBudget, endRun, outOfCalls, withCallBudget } from "../../mcp-server/call-budget.mjs";
// @ts-expect-error plain ESM module without type declarations
import { createToolLogger } from "../../mcp-server/run-log.mjs";
// @ts-expect-error plain ESM module without type declarations
import { PRESETS, benchmarkPreset } from "../../mcp-server/benchmark.mjs";
// @ts-expect-error plain ESM module without type declarations
import { BUILD_INFO, gitState, harnessLabel, harnessVersion, hashDir, pageInfo } from "../../mcp-server/provenance.mjs";
// @ts-expect-error plain ESM module without type declarations
import { runEnded } from "../../mcp-server/bench-runner.mjs";

type Handler = (...a: unknown[]) => Promise<{ content: { type: string; text: string }[]; [k: string]: unknown }>;

/** Composes `createToolLogger` and `withCallBudget` in the exact order `registerTools` uses. */
function wrapHandler(name: string, cb: Handler, opts: { budget?: unknown; logOpts?: Record<string, unknown> } = {}): Handler {
  let h = withCallBudget(opts.budget ?? null, cb, { counted: !UNCOUNTED.has(name) });
  if (opts.logOpts) h = createToolLogger(opts.logOpts)(name, true, h);
  return (args) => h(args, {});
}

const text = (t: string) => ({ content: [{ type: "text", text: t }] });
const textOf = (r: { content: { type: string; text: string }[] }) => r.content.map((c) => c.text).join("\n");

describe("tool-call budget", () => {
  it("is part of every preset, options included", () => {
    expect(PRESETS["hardcore-nuzlocke"].max_calls).toBe(6000);
    expect(PRESETS["hardcore-nuzlocke-badge1"].max_calls).toBe(600);
    expect(benchmarkPreset("hardcore-nuzlocke-badge1+hardcap").max_calls).toBe(600);
  });

  it("ends the run on the last call, and calls after it don't reach the game", async () => {
    const budget = callBudget({ max: 3, dir: mkdtempSync(join(tmpdir(), "budget-")) });
    let played = 0;
    const press = wrapHandler("press", async () => text(`pressed ${++played}`), { budget });
    expect(textOf(await press({}))).toBe("pressed 1");
    expect(textOf(await press({}))).toBe("pressed 2");
    const last = textOf(await press({}));
    expect(last).toBe(`pressed 3\n${outOfCalls(3)}`);
    expect(runEnded(last)).toBe(true);
    expect(textOf(await press({}))).toBe(outOfCalls(3));
    expect(played).toBe(3);
  });

  it("gives back a call refused before the game ran (a batch's bad arguments), even the last one", async () => {
    const dir = mkdtempSync(join(tmpdir(), "budget-"));
    const budget = callBudget({ max: 2, dir });
    const file = join(dir, "run-log.jsonl");
    const wrapLog = createToolLogger({ file });
    const runDo = wrapLog("do", true, withCallBudget(budget, async () => ({ ...text("Step 1 (walk_to): x: expected number"), isError: true, [UNCOUNTED_RESULT]: true })));
    const press = wrapLog("press", true, withCallBudget(budget, async () => text("pressed")));
    await press({});
    const refused = await runDo({});
    expect(textOf(refused)).not.toContain("RUN ENDED");
    expect(refused).not.toHaveProperty(UNCOUNTED_RESULT);
    expect(budget.used()).toBe(1);
    expect(readFileSync(join(dir, "tool-calls.txt"), "utf8")).toBe("1");
    expect(textOf(await press({}))).toBe(`pressed\n${outOfCalls(2)}`);
    // The run log has the refused call, marked so the run's call count leaves it out too.
    const logged: { tool?: string; uncounted?: boolean }[] = readFileSync(file, "utf8").trim().split("\n").map((l: string) => JSON.parse(l)).filter((e: { tool?: string }) => e.tool);
    expect(logged.map((e) => [e.tool, e.uncounted ?? false])).toEqual([["press", false], ["do", true], ["press", false]]);
  });

  it("never passes the mark on to the client, with no budget either", async () => {
    const runDo = wrapHandler("do", async () => ({ ...text("Step 1 (walk_to): x: expected number"), isError: true, [UNCOUNTED_RESULT]: true }), { logOpts: { file: null } });
    expect(await runDo({})).not.toHaveProperty(UNCOUNTED_RESULT);
  });

  it("doesn't add a second end to a run that ended on its last call", () => {
    const won = text("🏁 RUN ENDED — victory: Won the first badge");
    expect(endRun(won, 600)).toBe(won);
  });

  it("doesn't count a playtest's reports", async () => {
    const budget = callBudget({ max: 1, dir: mkdtempSync(join(tmpdir(), "budget-")) });
    const report = wrapHandler("report_issue", async () => text("Reported"), { budget });
    await report({});
    expect(budget.used()).toBe(0);
  });

  it("goes on counting in a run continued from its saves", () => {
    const dir = mkdtempSync(join(tmpdir(), "budget-"));
    const first = callBudget({ max: 10, dir });
    first.take();
    first.take();
    expect(callBudget({ max: 10, dir }).used()).toBe(2);
  });

  it("logs the call that ended the run with its outcome", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "budget-")), "run.jsonl");
    const budget = callBudget({ max: 1, dir: mkdtempSync(join(tmpdir(), "budget-")) });
    const press = wrapHandler("press", async () => text("📍 ROUTE_1 | battle: none"), { budget, logOpts: { file } });
    await press({});
    const entry = JSON.parse(readFileSync(file, "utf8").trim().split("\n")[0]);
    expect(entry.outcome).toBe("out of calls: all 1 tool calls of this run are used");
  });
});

describe("harness provenance", () => {
  const repo = () => {
    const root = mkdtempSync(join(tmpdir(), "harness-"));
    const git = (...a: string[]) => execFileSync("git", a, { cwd: root, stdio: "ignore" });
    git("init", "-q");
    git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "x");
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "nb", version: "1.2.3" }));
    return { root, git };
  };

  it("records the commit and tracked files changed since", () => {
    const { root, git } = repo();
    git("add", "package.json");
    git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "y");
    expect(gitState(root).dirty).toEqual([]);
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "nb", version: "1.2.4" }));
    const s = gitState(root);
    expect(s.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(s.dirty).toEqual(["package.json"]);
  });

  it("has no commit outside a git checkout", () => {
    expect(gitState(mkdtempSync(join(tmpdir(), "nogit-")))).toEqual({ commit: null, dirty: null });
  });

  it("hashes the served page without its build info, and reads what it was built from", () => {
    const dist = mkdtempSync(join(tmpdir(), "dist-"));
    mkdirSync(join(dist, "assets"));
    writeFileSync(join(dist, "index.html"), "<html>");
    writeFileSync(join(dist, "assets", "a.js"), "1");
    const before = hashDir(dist);
    writeFileSync(join(dist, BUILD_INFO), JSON.stringify({ commit: "abc", dirty: [] }));
    expect(hashDir(dist)).toBe(before);
    expect(pageInfo(dist)).toEqual({ builtFrom: { commit: "abc", dirty: [] }, hash: before });
    writeFileSync(join(dist, "assets", "a.js"), "2");
    expect(hashDir(dist)).not.toBe(before);
    expect(pageInfo(join(dist, "missing"))).toBeNull();
  });

  it("puts it together for the run log", () => {
    const { root } = repo();
    const h = harnessVersion(root, null);
    expect(h).toMatchObject({ name: "nb", version: "1.2.3", page: null });
    expect(h.commit).toMatch(/^[0-9a-f]{40}$/);
  });

  it("shows in the report what makes a run differ from its commit", () => {
    const at = { version: "0.1.0", commit: "abcdef1234" };
    expect(harnessLabel(at)).toBe("0.1.0@abcdef1"); // logged before the page was recorded
    expect(harnessLabel({ ...at, page: { builtFrom: { commit: "abcdef1234", dirty: [] } } })).toBe("0.1.0@abcdef1");
    expect(harnessLabel({ ...at, dirty: ["README.md"], page: { builtFrom: { commit: "abcdef1234" } } })).toBe("0.1.0@abcdef1");
    expect(harnessLabel({ ...at, dirty: ["mcp-server/format.mjs"], page: { builtFrom: { commit: "abcdef1234" } } })).toBe("0.1.0@abcdef1 +uncommitted changes");
    expect(harnessLabel({ ...at, page: { builtFrom: { commit: "1234567890" } } })).toBe("0.1.0@abcdef1 (page built from 1234567)");
    expect(harnessLabel({ ...at, page: { builtFrom: { commit: "abcdef1234", dirty: ["src/a.ts"] } } })).toBe("0.1.0@abcdef1 (page built from abcdef1 +changes)");
    expect(harnessLabel({ ...at, page: { builtFrom: null } })).toBe("0.1.0@abcdef1 (page build unknown)");
    expect(harnessLabel({ ...at, page: null })).toBe("0.1.0@abcdef1 (page build unknown)");
    expect(harnessLabel(undefined)).toBeNull();
  });
});
