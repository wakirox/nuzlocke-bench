// Declarative MCP tool catalog and registration pipeline (mcp-server/tool-catalog.mjs, mcp-server/tools.mjs).

import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM module without type declarations
import { BATCH_TOOLS, FINAL_READ_TOOLS, READ_TOOLS, TOOL_CATALOG, UNCOUNTED, activeToolNames, stepToolError } from "../../mcp-server/tool-catalog.mjs";
// @ts-expect-error plain ESM module without type declarations
import { buildToolSpecs, registerTools } from "../../mcp-server/tools.mjs";
// @ts-expect-error plain ESM module without type declarations
import { benchmarkPreset } from "../../mcp-server/benchmark.mjs";
// @ts-expect-error plain ESM module without type declarations
import { callBudget, outOfCalls } from "../../mcp-server/call-budget.mjs";
// @ts-expect-error plain ESM module without type declarations
import { createToolLogger } from "../../mcp-server/run-log.mjs";
// @ts-expect-error plain ESM module without type declarations
import { createFormatter } from "../../mcp-server/format.mjs";

type Handler = (args: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[]; isError?: boolean }>;

function fakeServer() {
  const tools = new Map<string, Handler>();
  return {
    tools,
    registerTool(name: string, _config: object, handler: Handler) {
      tools.set(name, (args) => handler(args));
    },
  };
}

describe("tool catalog and registry", () => {
  it("derives batch, read and uncounted sets from one catalog without overlap bugs", () => {
    expect(new Set(TOOL_CATALOG.map((t: { name: string }) => t.name)).size).toBe(TOOL_CATALOG.length);
    for (const r of READ_TOOLS) expect(BATCH_TOOLS).not.toContain(r);
    for (const f of FINAL_READ_TOOLS) expect(READ_TOOLS).toContain(f);
    expect([...UNCOUNTED]).toEqual(["report_issue"]);
    expect(stepToolError("hint")).toMatch(/hint can't be a step: reads answer you/);
  });

  it("keeps activeToolNames in exact agreement with buildToolSpecs across presets", () => {
    const cases = [
      { preset: null, reportIssue: true },
      { preset: benchmarkPreset("hardcore-nuzlocke+firstrival+hardcap"), reportIssue: true },
      { preset: benchmarkPreset("hardcore-nuzlocke+firstrival+hardcap+hints"), reportIssue: false },
    ];
    for (const env of cases) {
      expect(buildToolSpecs(env).map((s: { name: string }) => s.name)).toEqual(activeToolNames(env));
    }
  });

  it("wires run logging, call budgets and batch schema checks without monkey-patching registerTool", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tools-reg-"));
    const logFile = join(dir, "run-log.jsonl");
    const budget = callBudget({ max: 2, dir });
    const wrapLog = createToolLogger({ file: logFile });
    const formatter = createFormatter({ mapsOnRequest: true });
    const server = fakeServer();
    const preset = benchmarkPreset("hardcore-nuzlocke+firstrival+hardcap");

    registerTools(server, {
      call: async (cmd: string) => {
        if (cmd === "get_rules") return { rules: "Rule 1" };
        return { status: { location: "PALLET_TOWN", battle: "none" }, screenText: [] };
      },
      link: { waitForReload: async () => {} },
      autoStart: { pending: () => null },
      formatter,
      notes: { read: () => "", write: () => {} },
      budget,
      wrapLog,
      runLogFile: logFile,
      preset,
      reportIssue: true,
    });

    // Preset disables save/load/new_run.
    expect(server.tools.has("save_state")).toBe(false);
    expect(server.tools.has("new_run")).toBe(false);

    // 1st call: report_issue is uncounted.
    await server.tools.get("report_issue")!({ did: "walk", expected: "move", happened: "stuck" });
    expect(budget.used()).toBe(0);

    // Refused `do` batch (strict schema check on step args) refunds its call and logs uncounted.
    const badBatch = await server.tools.get("do")!({ steps: [{ tool: "walk_to", args: { x: "bad" } }] });
    expect(badBatch.isError).toBe(true);
    expect(budget.used()).toBe(0);

    // 2 counted calls exhaust the budget and append the run-ended marker on the last one.
    const r1 = await server.tools.get("get_rules")!({});
    expect(r1.content[0].text).toContain("1 used so far");
    const r2 = await server.tools.get("advance_text")!({});
    expect(r2.content.map((c) => c.text).join("\n")).toContain(outOfCalls(2));

    const entries = readFileSync(logFile, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(entries.map((e) => [e.tool, Boolean(e.uncounted)])).toEqual([
      ["report_issue", false],
      ["do", true],
      ["get_rules", false],
      ["advance_text", false],
    ]);
  });
});
