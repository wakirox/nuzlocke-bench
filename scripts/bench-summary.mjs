// Writes each run's summary.json (mcp-server/run-summary.mjs): the report's rows for it, so the report
// and the dashboard needn't read its transcript again. bench-run writes it as a run ends; this fills
// it in for runs from before, or after a change to what a summary holds.
//   node scripts/bench-summary.mjs                 every run folder in runs/
//   node scripts/bench-summary.mjs runs/<id> …     just these
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { writeSummary } from "../mcp-server/run-summary.mjs";

const args = process.argv.slice(2);
const dirs = args.length ? args : existsSync("runs") ? readdirSync("runs", { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => join("runs", e.name)) : [];
let written = 0, failed = 0;
for (const d of dirs) {
  const log = join(d, "run-log.jsonl");
  if (!existsSync(log)) continue;
  try {
    writeSummary(log);
    written++;
  } catch (e) {
    failed++;
    console.error(`${d}: ${e.message}`);
  }
}
console.log(`summary.json written for ${written} run(s)${failed ? `, ${failed} failed` : ""}`);
