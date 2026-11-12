// Gzips the transcripts of finished runs (bench-run does it as a run ends): each run folder whose
// agent.json is written. Readers take either form (run-folder.mjs readTranscript). A run's summary
// is written first when it has none, so the dashboard never has to open the compressed file.
//   node scripts/compress-transcripts.mjs [runs/<id> …]          (default: every run folder in runs/)
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { compressTranscript, runFiles } from "../mcp-server/run-folder.mjs";
import { summaryFile, writeSummary } from "../mcp-server/run-summary.mjs";

const args = process.argv.slice(2);
const dirs = args.length ? args : existsSync("runs") ? readdirSync("runs", { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => join("runs", e.name)) : [];
let before = 0, after = 0, done = 0, live = 0;
for (const d of dirs) {
  const run = runFiles(d);
  if (!existsSync(run.transcript)) continue;
  if (!existsSync(run.agent)) {
    live++; // still playing (or stopped without its runner's ending): left as it is
    continue;
  }
  const summary = summaryFile(run.runLog);
  if (summary && !existsSync(summary) && existsSync(run.runLog)) writeSummary(run.runLog);
  const sizes = compressTranscript(run.transcript);
  if (!sizes) continue;
  before += sizes.before;
  after += sizes.after;
  done++;
}
const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;
console.log(`compressed ${done} transcript(s): ${mb(before)} → ${mb(after)}${live ? `; ${live} without agent.json left as they are` : ""}`);
