// Keeps the published results (mcp-server/results.mjs): a folder per benchmark version with a file
// per official run, no game names, and builds the public page from those files alone.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { dashboardRuns, renderDashboard } from "../mcp-server/dashboard.mjs";
import { findRunLogs, readRows } from "../mcp-server/run-summary.mjs";
import { mergeResults, officialRuns, readVersion, resultsRuns, resultsVersions, runVersionOf, writeVersion } from "../mcp-server/results.mjs";

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(`Keeps the published results: results/<version>/, a folder per benchmark version with an
index.json and a file per official run (<run id>.json), as the dashboard shows them and no game names.
Runs already on file stay when their folder is gone; a run whose folder is here is updated, or taken
out when it's no longer a result. A run's file is written only when it changes. An old
results/<version>.json (one file per version) is turned into its folder.

Usage: npm run bench:results -- [options]

  (no options)       update the results from the run folders in $NUZLOCKE_RUNS_DIR, else runs/
  --dir <dir>        the results folder (default results)
  --dashboard <file> write the public dashboard from the results files only (runs/ isn't read)
  -h, --help         this help`);
  process.exit(0);
}
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const dir = opt("--dir", "results");
const dashboardFile = opt("--dashboard", null);
// The run folders: the runner's (NUZLOCKE_RUNS_DIR), else runs/ here. Reading runs/ here alone found
// none of a day's runs when they're kept elsewhere, and said nothing (2026-11-21).
const runsDir = process.env.NUZLOCKE_RUNS_DIR || "runs";

if (dashboardFile) {
  const files = resultsVersions(dir).map((v) => ({ name: join(dir, v), data: readVersion(dir, v) }));
  if (!files.length) {
    console.error(`No results in ${dir}/: run npm run bench:results first.`);
    process.exit(1);
  }
  const runs = resultsRuns(files);
  const template = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../mcp-server/dashboard-page.html"), "utf8");
  const updated = files.map((f) => f.data.updated).sort().at(-1);
  const current = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../package.json"), "utf8")).version;
  writeFileSync(dashboardFile, renderDashboard(template, runs, updated, current));
  console.log(`${dashboardFile}: ${runs.length} runs from ${files.length} results file(s)`);
  process.exit(0);
}

const all = dashboardRuns(findRunLogs(runsDir).flatMap((f) => readRows(f)), { names: false });
const official = officialRuns(all);
const localIds = all.map((r) => r.id);
// Each run's own benchmark version: Red's the harness's, Crystal's its own ("crystal-0.1.0").
const versions = new Set([...official.map((r) => runVersionOf(r)), ...resultsVersions(dir)]);
mkdirSync(dir, { recursive: true });
const updated = new Date().toISOString();
for (const version of [...versions].sort()) {
  const data = mergeResults(readVersion(dir, version), version, official, localIds, updated);
  const { written, removed } = writeVersion(dir, data);
  const changes = [written.length && `${written.length} written`, removed.length && `${removed.length} removed`].filter(Boolean).join(", ");
  console.log(`${join(dir, version)}/: ${data.runs.length} official run(s)${changes ? ` (${changes})` : ""}`);
}
if (!versions.size) console.log("No official runs yet.");
