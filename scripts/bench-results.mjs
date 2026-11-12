// Keeps the published results (mcp-server/results.mjs): one file per benchmark version with its
// official runs, no game names, and builds the public page from those files alone.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { dashboardRuns, renderDashboard } from "../mcp-server/dashboard.mjs";
import { findRunLogs, readRows } from "../mcp-server/run-summary.mjs";
import { mergeResults, officialRuns, resultsRuns, versionOf } from "../mcp-server/results.mjs";

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(`Keeps the published results: results/<version>.json, one file per benchmark version, with its
official runs as the dashboard shows them and no game names. Runs already on file stay when their
folder is gone; a run whose folder is here is updated, or taken out when it's no longer a result.

Usage: npm run bench:results -- [options]

  (no options)       update the results files from the runs in runs/
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
const resultsFiles = () => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")).sort() : []);

if (dashboardFile) {
  const files = resultsFiles().map((f) => ({ name: join(dir, f), data: JSON.parse(readFileSync(join(dir, f), "utf8")) }));
  if (!files.length) {
    console.error(`No results files in ${dir}/: run npm run bench:results first.`);
    process.exit(1);
  }
  const runs = resultsRuns(files);
  const template = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../mcp-server/dashboard-page.html"), "utf8");
  const updated = files.map((f) => f.data.updated).sort().at(-1);
  writeFileSync(dashboardFile, renderDashboard(template, runs, updated));
  console.log(`${dashboardFile}: ${runs.length} runs from ${files.length} results file(s)`);
  process.exit(0);
}

const all = dashboardRuns(findRunLogs("runs").flatMap((f) => readRows(f)), { names: false });
const official = officialRuns(all);
const localIds = all.map((r) => r.id);
const versions = new Set([...official.map((r) => versionOf(r.harness)), ...resultsFiles().map((f) => f.replace(/\.json$/, ""))]);
mkdirSync(dir, { recursive: true });
const updated = new Date().toISOString();
for (const version of [...versions].sort()) {
  const file = join(dir, `${version}.json`);
  const existing = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
  const data = mergeResults(existing, version, official, localIds, updated);
  writeFileSync(`${file}.tmp`, `${JSON.stringify(data, null, 1)}\n`);
  renameSync(`${file}.tmp`, file);
  console.log(`${file}: ${data.runs.length} official run(s)`);
}
if (!versions.size) console.log("No official runs yet.");
