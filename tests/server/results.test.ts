// The published results files: official runs only, kept per benchmark version, the record outliving the run folders.

import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM module without type declarations
import { mergeResults, officialRuns, readVersion, resultsRuns, resultsVersions, RESULTS_FORMAT, versionOf, writeVersion } from "../../mcp-server/results.mjs";
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

describe("results folders (a file per run)", () => {
  const fresh = () => mkdtempSync(join(tmpdir(), "results-"));
  const version = (runs: unknown[], updated = "t1") => mergeResults(null, "0.1.0", runs, [], updated);
  const files = (dir: string) => readdirSync(join(dir, "0.1.0")).sort();

  it("writes an index and a file per run, and reads them back as one version", () => {
    const dir = fresh();
    expect(writeVersion(dir, version([run("2026-11-08T01"), run("2026-11-08T02")]))).toEqual({ written: ["2026-11-08T02", "2026-11-08T01"], removed: [] });
    expect(files(dir)).toEqual(["2026-11-08T01.json", "2026-11-08T02.json", "index.json"]);
    expect(JSON.parse(readFileSync(join(dir, "0.1.0", "index.json"), "utf8")).runs).toBeUndefined();
    const back = readVersion(dir, "0.1.0");
    expect(back).toMatchObject({ format: RESULTS_FORMAT, version: "0.1.0", updated: "t1" });
    expect(resultsRuns([{ name: "0.1.0", data: back }]).map((r: { id: string }) => r.id)).toEqual(["2026-11-08T02", "2026-11-08T01"]);
    expect(resultsVersions(dir)).toEqual(["0.1.0"]);
  });

  it("writes nothing, not even the index's date, when no run changed", () => {
    const dir = fresh();
    writeVersion(dir, version([run("2026-11-08T01")], "t1"));
    expect(writeVersion(dir, version([run("2026-11-08T01")], "t2"))).toEqual({ written: [], removed: [] });
    expect(readVersion(dir, "0.1.0").updated).toBe("t1");
  });

  it("writes only the run that changed, takes out one that's gone, and dates the index then", () => {
    const dir = fresh();
    writeVersion(dir, version([run("2026-11-08T01"), run("2026-11-08T02")], "t1"));
    expect(writeVersion(dir, version([run("2026-11-08T01", { score: 7 })], "t2"))).toEqual({ written: ["2026-11-08T01"], removed: ["2026-11-08T02"] });
    expect(files(dir)).toEqual(["2026-11-08T01.json", "index.json"]);
    expect(readVersion(dir, "0.1.0")).toMatchObject({ updated: "t2", runs: [{ id: "2026-11-08T01", score: 7 }] });
  });

  it("reads a version's one file from before the split, and replaces it with the folder", () => {
    const dir = fresh();
    writeFileSync(join(dir, "0.1.0.json"), JSON.stringify({ format: 1, version: "0.1.0", updated: "t0", runs: [run("2026-11-08T01")] }));
    expect(resultsVersions(dir)).toEqual(["0.1.0"]);
    const old = readVersion(dir, "0.1.0");
    expect(old).toMatchObject({ format: RESULTS_FORMAT, updated: "t0", runs: [{ id: "2026-11-08T01" }] });
    writeVersion(dir, old);
    expect(readdirSync(dir)).toEqual(["0.1.0"]);
    expect(readVersion(dir, "0.1.0")).toMatchObject({ updated: "t0", runs: [{ id: "2026-11-08T01" }] });
  });

  it("refuses a run id that can't name a file", () => {
    expect(() => writeVersion(fresh(), version([run("../x")]))).toThrow(/can't name a file/);
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
