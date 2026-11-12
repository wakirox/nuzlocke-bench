// The published results files: official runs only, kept per benchmark version, the record outliving the run folders.

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM module without type declarations
import { mergeResults, officialRuns, resultsRuns, RESULTS_FORMAT, versionOf } from "../../mcp-server/results.mjs";
// @ts-expect-error plain ESM module without type declarations
import { findRunLogs } from "../../mcp-server/run-summary.mjs";
// @ts-expect-error plain ESM module without type declarations
import { OFFICIAL } from "../../mcp-server/benchmark.mjs";

const run = (id: string, extra: Record<string, unknown> = {}) => ({
  id, model: "sonnet-5-5", effort: "low", harness: "0.1.0@abc1234", notOfficial: null, short: false, score: 100, ...extra,
});

describe("versionOf", () => {
  it("drops the commit and what the label adds after it", () => {
    expect(versionOf("0.1.0@abc1234")).toBe("0.1.0");
    expect(versionOf("0.2.0@abc1234 +uncommitted changes")).toBe("0.2.0");
    expect(versionOf("0.2.0 (page build unknown)")).toBe("0.2.0");
  });

  it("has none for a run that didn't record its harness", () => {
    expect(versionOf(null)).toBeNull();
    expect(versionOf("")).toBeNull();
  });
});

describe("officialRuns", () => {
  it("keeps official runs and leaves out test runs, stray starts and runs with no version", () => {
    const runs = [run("a"), run("b", { notOfficial: "playtest" }), run("c", { short: true }), run("d", { harness: null })];
    expect(officialRuns(runs).map((r: { id: string }) => r.id)).toEqual(["a"]);
  });
});

describe("mergeResults", () => {
  const existing = { format: RESULTS_FORMAT, version: "0.1.0", runs: [run("2026-11-08T01", { score: 10 }), run("2026-11-08T02", { score: 20 })] };

  it("keeps a run whose folder is gone, newest first", () => {
    const data = mergeResults(existing, "0.1.0", [run("2026-11-09T01")], ["2026-11-09T01"], "now");
    expect(data.runs.map((r: { id: string }) => r.id)).toEqual(["2026-11-09T01", "2026-11-08T02", "2026-11-08T01"]);
    expect(data).toMatchObject({ format: RESULTS_FORMAT, version: "0.1.0", rules: OFFICIAL, updated: "now" });
    expect(data.objectives.length).toBeGreaterThan(0);
  });

  it("updates a run whose folder is here", () => {
    const data = mergeResults(existing, "0.1.0", [run("2026-11-08T01", { score: 99 })], ["2026-11-08T01"], "now");
    expect(data.runs.find((r: { id: string }) => r.id === "2026-11-08T01").score).toBe(99);
    expect(data.runs).toHaveLength(2);
  });

  it("takes out a run that's here but no longer a result", () => {
    const data = mergeResults(existing, "0.1.0", [], ["2026-11-08T02"], "now");
    expect(data.runs.map((r: { id: string }) => r.id)).toEqual(["2026-11-08T01"]);
  });

  it("holds only its own version's runs", () => {
    const data = mergeResults(null, "0.2.0", [run("x"), run("y", { harness: "0.2.0@def5678" })], ["x", "y"], "now");
    expect(data.runs.map((r: { id: string }) => r.id)).toEqual(["y"]);
  });
});

describe("resultsRuns", () => {
  it("joins the files' runs, newest first", () => {
    const runs = resultsRuns([
      { name: "0.1.0.json", data: { format: RESULTS_FORMAT, runs: [run("2026-11-08T01")] } },
      { name: "0.2.0.json", data: { format: RESULTS_FORMAT, runs: [run("2026-11-10T01")] } },
    ]);
    expect(runs.map((r: { id: string }) => r.id)).toEqual(["2026-11-10T01", "2026-11-08T01"]);
  });

  it("refuses a file in another format", () => {
    expect(() => resultsRuns([{ name: "old.json", data: { format: 0, runs: [] } }])).toThrow(/old\.json/);
  });
});

describe("findRunLogs", () => {
  it("finds run folders and loose logs, not transcripts", () => {
    const dir = mkdtempSync(join(tmpdir(), "runs-"));
    mkdirSync(join(dir, "2026-11-08T01"));
    writeFileSync(join(dir, "2026-11-08T01", "run-log.jsonl"), "");
    mkdirSync(join(dir, "empty"));
    writeFileSync(join(dir, "2026-10-01.jsonl"), "");
    writeFileSync(join(dir, "2026-10-01.transcript.jsonl"), "");
    expect(findRunLogs(dir)).toEqual([join(dir, "2026-10-01.jsonl"), join(dir, "2026-11-08T01", "run-log.jsonl")]);
    expect(findRunLogs(join(dir, "missing"))).toEqual([]);
  });
});
