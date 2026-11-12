// The published results: one file per benchmark version (results/<version>.json) holding its official
// runs as the dashboard shows them, without game names. The public page is built from these files
// alone, so the run folders (runs/, private and local) never have to be published.

import { OBJECTIVES } from "./report.mjs";
import { OFFICIAL } from "./benchmark.mjs";

/** The file's format: bump it when a run's fields change in a way the page can't read. */
export const RESULTS_FORMAT = 1;

/** A run's benchmark version: the harness version without its commit ("0.1.0@abc1234" → "0.1.0"). */
export function versionOf(harness) {
  const v = /^[^@\s(]+/.exec(String(harness ?? ""))?.[0];
  return v || null;
}

/** The dashboard's runs (dashboardRuns, names: false) that are results: official, and not a stray start. */
export function officialRuns(runs) {
  return runs.filter((r) => !r.notOfficial && !r.short && versionOf(r.harness));
}

/**
 * A version's results file, updated from the run folders here. A run that's on file but whose folder is
 * gone stays: the file is the record. One whose folder is here is replaced by what it says now, or
 * taken out when it's no longer a result (marked no result, or continued into a longer run).
 * `localIds` are all the runs here, results or not.
 */
export function mergeResults(existing, version, runs, localIds, updated) {
  const local = new Set(localIds);
  const kept = (existing?.runs ?? []).filter((r) => !local.has(r.id));
  const mine = runs.filter((r) => versionOf(r.harness) === version);
  return {
    format: RESULTS_FORMAT,
    version,
    rules: OFFICIAL,
    updated,
    objectives: OBJECTIVES.map((o) => ({ id: o.id, label: o.label })),
    runs: [...kept, ...mine].sort((a, b) => (a.id < b.id ? 1 : -1)),
  };
}

/** The runs of several results files, for one page; refuses a file in a format it doesn't know. */
export function resultsRuns(files) {
  return files.flatMap(({ name, data }) => {
    if (data?.format !== RESULTS_FORMAT || !Array.isArray(data.runs)) throw new Error(`${name}: not a results file of format ${RESULTS_FORMAT}`);
    return data.runs;
  }).sort((a, b) => (a.id < b.id ? 1 : -1));
}
