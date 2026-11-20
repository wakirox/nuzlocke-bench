// Tags behavioral failure patterns across recorded run logs (see mcp-server/diagnose.mjs).
//   node scripts/bench-diagnose.mjs                 (every run in runs/)
//   node scripts/bench-diagnose.mjs runs/<id> …     (just these)
//   --details                                       (always include per-run incident timelines)
//   --json                                          (output raw JSON instead of Markdown)

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { diagnoseAttempt, diagnoseReport } from "../mcp-server/diagnose.mjs";
import { gameData } from "../mcp-server/games/index.mjs";
import { attempts, parseLog } from "../mcp-server/report.mjs";
import { locateRun, readTranscript } from "../mcp-server/run-folder.mjs";
import { findRunLogs } from "../mcp-server/run-summary.mjs";

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(`Diagnoses behavioral failure patterns across recorded runs from their run logs and
(when present) transcripts: spatial loops, stalls, error storms, screenshot bursts,
post-compaction amnesia, combat death causes, and rule violations.

Usage: npm run bench:diagnose -- [runs/<id> …] [options]

  (no runs)    every run log in runs/
  --details    include per-run incident timelines even with >10 runs
  --json       print structured JSON instead of Markdown
  -h, --help   this help`);
  process.exit(0);
}

const takeFlag = (flag) => {
  const i = args.indexOf(flag);
  if (i < 0) return false;
  args.splice(i, 1);
  return true;
};
const details = takeFlag("--details");
const asJson = takeFlag("--json");

const readJson = (file) => (existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null);
const files = (args.length
  ? args.map((f) => (existsSync(join(f, "run-log.jsonl")) ? join(f, "run-log.jsonl") : f))
  : findRunLogs("runs")).sort();

const diagnosed = files.flatMap((file) => {
  if (!existsSync(file)) return [];
  const run = locateRun(file);
  const agent = readJson(run.agent) ?? readJson(join(run.dir, "player.json"));
  const saved = readJson(join(run.saves, "run.json"));
  const game = gameData(saved?.data?.version);
  const transcript = readTranscript(run.transcript);
  const model = agent?.model
    ? `${String(agent.model).replace(/^claude-/, "").replace(/\[1m\]$/, "")}${agent.effort ? ` ${agent.effort}` : ""}`
    : "unknown";
  const list = attempts(parseLog(readFileSync(file, "utf8")));
  return list.map((a, i) => diagnoseAttempt(a, {
    game,
    transcript: i === list.length - 1 ? transcript : null,
    name: run.name + (list.length > 1 ? `#${i + 1}` : ""),
    model,
  }));
});

console.log(asJson ? JSON.stringify(diagnosed, null, 2) : diagnoseReport(diagnosed, { details }));
