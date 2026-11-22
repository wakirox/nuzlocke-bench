// Tags behavioral failure patterns across recorded run logs (see mcp-server/diagnose.mjs).
//   node scripts/bench-diagnose.mjs                 (every run in runs/)
//   node scripts/bench-diagnose.mjs runs/<id> …     (just these)
//   --details                                       (always include per-run incident timelines)
//   --json                                          (output raw JSON instead of Markdown)

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { diagnoseAttempt, diagnoseReport, joinDiagnosedRuns } from "../mcp-server/diagnose.mjs";
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

const rawLegs = files.flatMap((file) => {
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
  return list.map((a, i) => ({
    attempt: a,
    game,
    transcript: i === list.length - 1 ? transcript : null,
    name: run.name + (list.length > 1 ? `#${i + 1}` : ""),
    model,
    agent,
  }));
});

// Track each leg's final counters so resumed legs don't re-flag deaths/violations carried from their parent save.
const endCounters = new Map();
for (const leg of rawLegs) {
  let deaths = 0, violations = 0, capViolations = 0;
  for (const c of leg.attempt.calls) {
    if (c.deaths != null) deaths = c.deaths;
    if (c.violations != null) violations = c.violations;
    if (c.capViolations != null) capViolations = c.capViolations;
  }
  endCounters.set(leg.name, { deaths, violations, capViolations });
}

const legs = rawLegs.map((leg) => {
  const prev = leg.agent?.resumedFrom ? endCounters.get(leg.agent.resumedFrom) : null;
  return diagnoseAttempt(leg.attempt, {
    game: leg.game,
    transcript: leg.transcript,
    name: leg.name,
    model: leg.model,
    agent: leg.agent,
    initialDeaths: prev?.deaths ?? null,
    initialViolations: prev?.violations ?? null,
    initialCapViolations: prev?.capViolations ?? null,
  });
});

const diagnosed = joinDiagnosedRuns(legs);
console.log(asJson ? JSON.stringify(diagnosed, null, 2) : diagnoseReport(diagnosed, { details }));
