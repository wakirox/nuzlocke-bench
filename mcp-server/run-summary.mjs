// A run's summary: the report's rows for it (one per attempt), everything the report and the
// dashboard show, computed once from the run's folder (run log, agent.json, saves, transcript) and
// kept as runs/<id>/summary.json. Readers use it while it's newer than the run log, so the
// transcript is needed only to write it.

import { existsSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { throwsOf } from "./dashboard.mjs";
import { attempts, capsFromTranscript, darkTunnelOf, fightsFromCalls, hardAreasOf, lastBattleDeathsOf, objectiveCallsOf, objectivesOf, parseLog, runExtras, screenshotsOf, summarize } from "./report.mjs";
import { locateRun, readTranscript } from "./run-folder.mjs";
import { gameData } from "./games/index.mjs";
import { UNCOUNTED } from "./call-budget.mjs";

/** The summary's format: a reader that finds another one computes the rows again. */
export const SUMMARY_VERSION = 3;

const readIf = (f) => (existsSync(f) ? readFileSync(f, "utf8") : null);

/** The rows of one run log (a run's folder, or a loose log from before folders), as bench-report shows them. */
export function computeRows(runLogFile) {
  const run = locateRun(runLogFile);
  const agentText = readIf(run.agent);
  const agent = agentText ? JSON.parse(agentText) : null;
  const trackerText = readIf(join(run.saves, "run.tracker.json"));
  const transcript = readTranscript(run.transcript);
  const savedText = readIf(join(run.saves, "run.json"));
  const saved = savedText ? JSON.parse(savedText) : null;
  // The game's story data (milestones, fight classes…) by the version the run played.
  /** @type {any} */
  const game = gameData(saved?.data?.version);
  // What the run's folder adds: starter, catches, deaths, heals and the model's notes (runs from bench-run.mjs).
  const extras = trackerText || transcript
    ? runExtras({ tracker: trackerText ? JSON.parse(trackerText) : null, transcript, notes: readIf(join(run.saves, "model-notes.txt")), game })
    : null;
  // A continued run's first lead isn't its starter: that was chosen in the run it continues.
  if (extras && agent?.resumedFrom) extras.starter = null;
  // report_issue is free (call-budget.mjs, and the prompt says so): it isn't one of the run's calls
  // for the totals, the speed, the dark tunnel or the failed-call rate.
  const runs = attempts(parseLog(readFileSync(runLogFile, "utf8"))).map((a) => ({ ...a, calls: a.calls.filter((c) => !UNCOUNTED.has(c.tool)) }));
  return runs.map((a, i) => {
    const last = i === runs.length - 1;
    /** @type {any} */
    const row = {
      name: run.name + (runs.length > 1 ? `#${i + 1}` : ""), ...summarize(a, game), objectives: objectivesOf(a.calls, game), objectiveCalls: objectiveCallsOf(a.calls, game),
      lastBattleDeaths: lastBattleDeathsOf(a.calls), darkTunnel: darkTunnelOf(a.calls, game),
      screenshots: screenshotsOf(a.calls), hardAreas: hardAreasOf(a.calls, game), agent, extras: last ? extras : null,
    };
    // The big fights from the tracker's save, or else from the run log.
    if (!row.extras?.fights?.length) {
      const logged = fightsFromCalls(a.calls, row.outcome, game);
      if (logged.length) row.extras = { ...(row.extras ?? {}), fights: logged };
    }
    // The transcript (one per run folder, so the last attempt's) gives each candy use's room below
    // the cap, and the whole caps row for runs logged before the page counted it.
    const lastTranscript = last ? transcript : null;
    // Runs from before the page logged it: an excused loss shows in the tracker's own message.
    if (lastTranscript && row.firstRival !== "lost-free" && /The first rival battle was lost/.test(lastTranscript)) row.firstRival = "lost-free";
    if (lastTranscript && saved) {
      const back = capsFromTranscript({ transcript: lastTranscript, calls: a.calls, levelCaps: saved.data?.levelCaps });
      row.caps = row.caps?.candies != null ? { ...row.caps, roomLeft: back.roomLeft } : back;
    }
    if (saved) row.game = saved.data?.version ?? null;
    // For the dashboard: balls thrown, the starter, and the captures with their species' data.
    row.throws = throwsOf(a.calls);
    row.starter = row.extras?.starter ?? null;
    if (last && trackerText && saved) row.captureData = { tracker: JSON.parse(trackerText), species: saved.data?.species };
    const player = join(dirname(run.agent), "player.json");
    if (!agent && existsSync(player)) row.player = JSON.parse(readFileSync(player, "utf8"));
    return row;
  });
}

/** Where a run's summary goes: its folder (none for a loose log from before folders). */
export function summaryFile(runLogFile) {
  const run = locateRun(runLogFile);
  return existsSync(run.saves) && run.runLog.endsWith("run-log.jsonl") ? join(dirname(run.runLog), "summary.json") : null;
}

/** Computes a run's rows and keeps them as its summary.json; returns the rows. */
export function writeSummary(runLogFile) {
  const rows = computeRows(runLogFile);
  const file = summaryFile(runLogFile);
  if (file) {
    writeFileSync(`${file}.tmp`, JSON.stringify({ version: SUMMARY_VERSION, written: new Date().toISOString(), rows }));
    renameSync(`${file}.tmp`, file);
  }
  return rows;
}

/** A run's rows: from its summary while that's current (this version, newer than the run log), else computed. */
export function readRows(runLogFile) {
  const file = summaryFile(runLogFile);
  if (file && existsSync(file) && statSync(file).mtimeMs >= statSync(runLogFile).mtimeMs) {
    try {
      const s = JSON.parse(readFileSync(file, "utf8"));
      if (s.version === SUMMARY_VERSION && Array.isArray(s.rows)) return s.rows;
    } catch {
      /* computed below */
    }
  }
  return computeRows(runLogFile);
}

/**
 * The run logs in a runs folder: each run folder's (<id>/run-log.jsonl), and the loose logs from
 * before folders (<id>.jsonl; not the transcripts that sat next to them).
 */
export function findRunLogs(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() && existsSync(join(dir, e.name, "run-log.jsonl")) ? [join(dir, e.name, "run-log.jsonl")]
    : e.isFile() && e.name.endsWith(".jsonl") && !e.name.endsWith(".transcript.jsonl") ? [join(dir, e.name)] : []).sort();
}
