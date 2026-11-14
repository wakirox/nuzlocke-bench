// A run's summary.json (mcp-server/run-summary.mjs): the report's rows, kept so readers needn't parse the transcript.

import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-expect-error plain ESM module without type declarations
import { SUMMARY_VERSION, computeRows, readRows, summaryFile, writeSummary } from "../../mcp-server/run-summary.mjs";

/** A run folder as bench-run.mjs leaves it: a run log with two calls, agent.json and a saves folder. */
function runFolder(): string {
  const dir = join(mkdtempSync(join(tmpdir(), "runs-")), "2026-11-07T18-00-00-000Z");
  mkdirSync(join(dir, "saves"), { recursive: true });
  const session = { type: "session", t: "2026-11-07T18:00:00.000Z", benchmark: { id: "hardcore-nuzlocke" }, harness: { name: "nuzlocke-bench", version: "0.1.0", commit: "abc" } };
  const calls = [
    { n: 1, t: "2026-11-07T18:00:01.000Z", ms: 5, tool: "get_rules", args: {}, chars: 100 },
    { n: 2, t: "2026-11-07T18:00:02.000Z", ms: 5, tool: "walk", args: {}, chars: 50, where: "TOWN [PALLET_TOWN] x1 y1", badges: 0, error: "blocked" },
  ];
  writeFileSync(join(dir, "run-log.jsonl"), [session, ...calls].map((l) => JSON.stringify(l)).join("\n") + "\n");
  writeFileSync(join(dir, "agent.json"), JSON.stringify({ model: "m", effort: "low", preset: "hardcore-nuzlocke", tokens: { total: 5, turns: 2 } }));
  return dir;
}

describe("run summaries", () => {
  it("keeps the report's rows for the run, with a version", () => {
    const dir = runFolder();
    const log = join(dir, "run-log.jsonl");
    const rows = writeSummary(log);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "2026-11-07T18-00-00-000Z", calls: 2, errors: 1, agent: { model: "m" } });
    const saved = JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"));
    expect(saved).toMatchObject({ version: SUMMARY_VERSION, rows: JSON.parse(JSON.stringify(rows)) });
  });

  it("is read while current, and computed again when the run log is newer or the format changed", () => {
    const dir = runFolder();
    const log = join(dir, "run-log.jsonl");
    writeSummary(log);
    const file = join(dir, "summary.json");
    const s = JSON.parse(readFileSync(file, "utf8"));
    s.rows[0].calls = 999; // what the summary says, to tell where the rows came from
    writeFileSync(file, JSON.stringify(s));
    expect(readRows(log)[0].calls).toBe(999);
    const later = new Date(Date.now() + 60_000);
    utimesSync(log, later, later); // the run went on after its summary
    expect(readRows(log)[0].calls).toBe(2);
    utimesSync(log, new Date(0), new Date(0));
    writeFileSync(file, JSON.stringify({ ...s, version: SUMMARY_VERSION + 1 }));
    expect(readRows(log)[0].calls).toBe(2);
  });

  it("leaves report_issue out of the run's calls: it's free, as the prompt says", () => {
    const dir = runFolder();
    const log = join(dir, "run-log.jsonl");
    const report = { n: 3, t: "2026-11-07T18:00:03.000Z", ms: 5, tool: "report_issue", args: { text: "map looks off" }, chars: 20, error: "x" };
    const pallet = { n: 4, t: "2026-11-07T18:00:04.000Z", ms: 5, tool: "walk", args: {}, chars: 50, where: "ROUTE 1 [ROUTE_1] x1 y1 | battle: none", badges: 0 };
    writeFileSync(log, readFileSync(log, "utf8") + [report, pallet].map((l) => JSON.stringify(l)).join("\n") + "\n");
    const [row] = computeRows(log);
    expect(row).toMatchObject({ calls: 3, errors: 1 });
    expect(row.topTools).not.toMatch(/report_issue/);
  });

  it("has no file for a loose run log from before run folders, and computes its rows", () => {
    const dir = mkdtempSync(join(tmpdir(), "runs-"));
    const log = join(dir, "2026-10-01T00-00-00-000Z.jsonl");
    writeFileSync(log, readFileSync(join(runFolder(), "run-log.jsonl")));
    expect(summaryFile(log)).toBeNull();
    expect(computeRows(log)[0].calls).toBe(2);
  });
});
