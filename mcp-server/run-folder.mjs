// Where a benchmark run's files live: one folder per run, runs/<id>/, holding everything
// about it. (Runs from before this layout are loose files: runs/<id>.jsonl, <id>.transcript.jsonl,
// <id>.agent.json and the <id>-saves/ folder; locateRun finds those too.)
//
//   runs/<id>/run-log.jsonl     the server's log, one line per tool call
//   runs/<id>/transcript.jsonl  the whole session (transcript.jsonl.gz once the run has ended)
//   runs/<id>/agent.json        who played and how it ended (model, effort, nudges, cost…)
//   runs/<id>/saves/            the game's saves and recordings

import { existsSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

/** A transcript's text, plain or gzipped (`<file>.gz`, as a finished run keeps it), or null. */
export function readTranscript(file) {
  if (existsSync(file)) return readFileSync(file, "utf8");
  if (existsSync(`${file}.gz`)) return gunzipSync(readFileSync(`${file}.gz`)).toString("utf8");
  return null;
}

/**
 * Gzips a finished run's transcript (about a quarter of the size): writes `<file>.gz`, and removes
 * the plain file only once the .gz reads back to the same bytes. Returns the sizes, or null when
 * there's nothing to do.
 */
export function compressTranscript(file) {
  if (!existsSync(file)) return null;
  const plain = readFileSync(file);
  const packed = gzipSync(plain, { level: 9 });
  if (!gunzipSync(packed).equals(plain)) throw new Error(`${file}: the compressed copy doesn't read back the same`);
  writeFileSync(`${file}.gz.tmp`, packed);
  renameSync(`${file}.gz.tmp`, `${file}.gz`);
  rmSync(file);
  return { before: plain.length, after: packed.length };
}

/** The files of the run in folder `dir`. */
export function runFiles(dir) {
  return {
    dir,
    name: basename(dir),
    runLog: join(dir, "run-log.jsonl"),
    transcript: join(dir, "transcript.jsonl"),
    agent: join(dir, "agent.json"),
    /** Who plays, written as the run starts (agent.json only comes at the end): { model, effort }. */
    player: join(dir, "player.json"),
    saves: join(dir, "saves"),
  };
}

/** A run given as its folder, its saves folder, or an older loose layout (runs/<id>-saves or runs/<id>.jsonl). */
export function locateRun(path) {
  const p = resolve(path);
  const isDir = existsSync(p) && statSync(p).isDirectory();
  if (isDir && existsSync(join(p, "saves"))) return runFiles(p);
  if (isDir && basename(p) === "saves") return runFiles(dirname(p));
  // A file inside a run's folder (its run log, transcript or agent.json).
  if (!isDir && existsSync(join(dirname(p), "saves")) && ["run-log.jsonl", "transcript.jsonl", "agent.json"].includes(basename(p))) return runFiles(dirname(p));
  // Older layout: everything next to each other in runs/.
  const base = join(dirname(p), basename(p).replace(/-saves$|\.transcript\.jsonl$|\.agent\.json$|\.jsonl$/, ""));
  return {
    dir: dirname(p),
    name: basename(base),
    runLog: `${base}.jsonl`,
    transcript: `${base}.transcript.jsonl`,
    agent: `${base}.agent.json`,
    saves: `${base}-saves`,
  };
}
