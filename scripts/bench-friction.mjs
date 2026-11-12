// Finds spots in recorded runs where the tools may have let the model down (see mcp-server/friction.mjs).
//   node scripts/bench-friction.mjs                 (every run in runs/)
//   node scripts/bench-friction.mjs runs/<id> …     (just these)
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { callsOf, frictionReport } from "../mcp-server/friction.mjs";
import { locateRun, readTranscript } from "../mcp-server/run-folder.mjs";

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(`Lists the spots in recorded runs where the tools may have let the model down: walks stopped by
something in the way, errors, empty results, screenshots (each with the calls that led to it,
what the model wrote, and what it did next), the same call over and over, and maps
where one run spent far longer than the others. The same spot across several runs points at the
tools; one run alone, at the model. Playtest runs (bench-run --playtest) add the model's own reports.

Usage: npm run bench:friction -- [runs/<id> …] [--top <n>]

  (no runs)    every run in runs/ that has a transcript
  --top <n>    rows per section (default 15)
  -h, --help   this help`);
  process.exit(0);
}
const ti = args.indexOf("--top");
const top = ti >= 0 ? Number(args.splice(ti, 2)[1]) : 15;
const dirs = args.length ? args : existsSync("runs") ? readdirSync("runs", { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => join("runs", e.name)) : [];
const readIf = (f) => (existsSync(f) ? readFileSync(f, "utf8") : null);

const runs = dirs.sort().flatMap((d) => {
  const run = locateRun(d);
  const transcript = readTranscript(run.transcript);
  if (!transcript) return [];
  const agent = JSON.parse(readIf(run.agent) ?? "{}");
  const issues = (readIf(run.runLog) ?? "").split("\n").flatMap((l) => {
    try {
      const e = JSON.parse(l);
      return e.tool === "report_issue" ? [{ n: e.n, where: e.where, ...e.args }] : [];
    } catch { return []; }
  });
  const model = agent.model ? `${String(agent.model).replace(/^claude-/, "").replace(/\[1m\]$/, "")}${agent.effort ? ` ${agent.effort}` : ""}${agent.playtest ? " playtest" : ""}` : null;
  return [{ name: run.name, model, calls: callsOf(transcript), issues }];
});
console.log(frictionReport(runs, { top }));
