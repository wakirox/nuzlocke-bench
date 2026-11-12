// Summarizes run logs as a Markdown table.
//   node scripts/bench-report.mjs                 (every runs/*.jsonl)
//   node scripts/bench-report.mjs runs/a.jsonl …  (just these)
//   --preset hardcore-nuzlocke                    (only runs under that benchmark preset)
//   --details                                     (also each run's catches, deaths and the model's notes)
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { dashboardRuns, renderDashboard } from "../mcp-server/dashboard.mjs";
import { darkTunnelTable, bigFightsTable, capsTable, details, objectivesTable, playTable, splitsTable, table } from "../mcp-server/report.mjs";
import { findRunLogs, readRows } from "../mcp-server/run-summary.mjs";
import { presetHelp } from "../mcp-server/benchmark.mjs";

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(`Summarizes benchmark runs as Markdown tables: results, badge splits, Rare Candies and level
caps, and how each run was played.

Usage: npm run bench:report -- [runs/<id> …] [options]

  (no runs)          every run in runs/
  --preset <id>      only runs under that preset (with its options: hardcore-nuzlocke+hardcap)
  --details          also each run's catches, deaths and the model's notes
  --dashboard <file> write the runs dashboard instead of the tables
  --no-names         leave the captures and big fights out of it, so it has no game names
  -h, --help         this help

${presetHelp()}`);
  process.exit(0);
}
const pi = args.indexOf("--preset");
const preset = pi >= 0 ? args.splice(pi, 2)[1] : null;
const di = args.indexOf("--dashboard");
const dashboardFile = di >= 0 ? args.splice(di, 2)[1] : null;
const noNames = args.includes("--no-names");
if (noNames) args.splice(args.indexOf("--no-names"), 1);
const showDetails = args.includes("--details");
if (showDetails) args.splice(args.indexOf("--details"), 1);
const found = findRunLogs("runs");
// A run given by its folder (runs/<id>, as the usage says) means its run log.
const files = (args.length ? args.map((f) => (existsSync(join(f, "run-log.jsonl")) ? join(f, "run-log.jsonl") : f)) : found).sort();
// Each run's rows from its summary.json while current, else computed (mcp-server/run-summary.mjs).
const rows = files
  .flatMap((f) => readRows(f))
  .filter((r) => !preset || r.preset === preset);
if (dashboardFile) {
  const template = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../mcp-server/dashboard-page.html"), "utf8");
  const runs = dashboardRuns(rows, { names: !noNames });
  writeFileSync(dashboardFile, renderDashboard(template, runs, new Date().toISOString()));
  console.log(`${dashboardFile}: ${runs.length} runs`);
  process.exit(0);
}
console.log(table(rows));
const splits = splitsTable(rows);
if (splits) console.log(`\nBadge splits (game time):\n\n${splits}`);
const objectives = objectivesTable(rows);
if (objectives) console.log(`\nObjectives reached, by model (runs continued in another folder count once):\n\n${objectives}`);
const dark = darkTunnelTable(rows);
if (dark) console.log(`\nThe dark tunnel (calls counted from the first call inside; "lit tools": run before the tools went dark):\n\n${dark}`);
const caps = capsTable(rows);
if (caps) console.log(`\nRare Candies and level caps:\n\n${caps}`);
const fights = bigFightsTable(rows);
if (fights) console.log(`\nBefore the big fights (rival, gym leaders, Giovanni, Elite Four; recorded from 2026-10-15 on):\n\n${fights}`);
if (rows.length) console.log(`\nHow they played:\n\n${playTable(rows)}`);
if (showDetails && rows.some((r) => r.extras)) console.log(`\n${details(rows)}`);
if (rows.length) {
  const wins = rows.filter((r) => r.victory).length;
  const dq = rows.filter((r) => r.disqualified).length;
  const lost = rows.filter((r) => /^lost/.test(r.outcome)).length;
  console.log(`\n${rows.length} run(s), ${wins} victor${wins === 1 ? "y" : "ies"} without violations, ${dq} disqualified, ${lost} lost with no Pokémon left that may battle.`);
}
