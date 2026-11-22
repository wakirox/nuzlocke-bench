// The published results: a folder per benchmark version (results/<version>/) holding its official runs
// as the dashboard shows them, without game names: index.json (the version's rules and objectives) and a
// file per run (<run id>.json), so a results PR adds a file per new run instead of growing one big file.
// The public page is built from these files alone, so the run folders (runs/, private and local) never
// have to be published.

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { OBJECTIVES } from "./report.mjs";
import { objectivesByGame } from "./games/index.mjs";
import { OFFICIAL } from "./benchmark.mjs";

/**
 * The results' format: bump it when a run's fields change in a way the page can't read. 2: a folder
 * per version with a file per run; 1 was one file per version (results/<version>.json), with the same
 * run fields: readVersion still reads it, and writeVersion replaces it.
 */
export const RESULTS_FORMAT = 2;

/** A version folder's file with everything but the runs. */
const INDEX = "index.json";
const json = (data) => `${JSON.stringify(data, null, 1)}\n`;
const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
/** Writes a file whole or not at all. */
const writeAtomic = (file, text) => {
  writeFileSync(`${file}.tmp`, text);
  renameSync(`${file}.tmp`, file);
};

/** The versions in a results folder: its version folders, and files from before the split. */
export function resultsVersions(dir) {
  if (!existsSync(dir)) return [];
  const names = readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() && existsSync(join(dir, e.name, INDEX)) ? [e.name] : e.isFile() && e.name.endsWith(".json") ? [e.name.replace(/\.json$/, "")] : [],
  );
  return [...new Set(names)].sort();
}

/**
 * A version's results as one object ({ format, version, rules, updated, objectives, runs }), from its
 * folder, or from its one file from before the split (format 1: the same runs, read as this format).
 * Null when there are none.
 */
export function readVersion(dir, version) {
  const folder = join(dir, version);
  if (existsSync(join(folder, INDEX))) {
    const runs = readdirSync(folder).filter((f) => f.endsWith(".json") && f !== INDEX).sort().map((f) => readJson(join(folder, f)));
    return { ...readJson(join(folder, INDEX)), runs };
  }
  const flat = join(dir, `${version}.json`);
  if (!existsSync(flat)) return null;
  const data = readJson(flat);
  return data?.format === 1 ? { ...data, format: RESULTS_FORMAT } : data;
}

/**
 * Writes a version's results (as mergeResults makes them) to its folder: a run's file only when what it
 * says has changed, a file taken out for a run that's no longer there, and the index (with its
 * `updated`) only when something changed, so a results PR shows the runs it adds and nothing else. A
 * file from before the split is replaced. Returns the run files written and removed.
 */
export function writeVersion(dir, data) {
  const { runs, ...index } = data;
  const folder = join(dir, data.version);
  mkdirSync(folder, { recursive: true });
  const written = [];
  const removed = [];
  const ids = new Set();
  for (const run of runs) {
    // A run's id names its file: only the characters run ids are made of.
    if (!/^[\w.-]+$/.test(String(run.id))) throw new Error(`A run id that can't name a file: ${JSON.stringify(run.id)}`);
    ids.add(run.id);
    const file = join(folder, `${run.id}.json`);
    const text = json(run);
    if (existsSync(file) && readFileSync(file, "utf8") === text) continue;
    writeAtomic(file, text);
    written.push(run.id);
  }
  for (const f of readdirSync(folder)) {
    if (!f.endsWith(".json") || f === INDEX || ids.has(f.replace(/\.json$/, ""))) continue;
    rmSync(join(folder, f));
    removed.push(f.replace(/\.json$/, ""));
  }
  const indexFile = join(folder, INDEX);
  const flat = join(dir, `${data.version}.json`);
  const old = existsSync(indexFile) ? readJson(indexFile) : null;
  const same = old && JSON.stringify({ ...old, updated: null }) === JSON.stringify({ ...index, updated: null });
  if (!same || written.length || removed.length || existsSync(flat)) writeAtomic(indexFile, json(index));
  if (existsSync(flat)) rmSync(flat);
  return { written, removed };
}

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
    // Each game's milestones: a run is read against its own game's (`objectives` stays Red's).
    objectivesByGame: objectivesByGame(),
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
