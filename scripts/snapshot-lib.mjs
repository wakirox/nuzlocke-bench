// The pure parts of scripts/snapshot-run.mjs: reading a run-log line, and choosing the poll
// of a replay that stands for the end of a logged tool call.

/** "CAVE (2) [CAVE_1F] x6 y25 facing up | battle: none" -> its parts (x/y missing in the dark and in battle). */
export function parseWhere(where) {
  const m = /\[([A-Z0-9_]+)\](?: x(\d+) y(\d+))?(?: facing (\w+))?\s*\|\s*battle: (\w+)/.exec(where ?? "");
  if (!m) return null;
  return { mapConst: m[1], x: m[2] == null ? null : Number(m[2]), y: m[3] == null ? null : Number(m[3]), facing: m[4] ?? null, battle: m[5] };
}

/** "2:19:02" -> seconds. */
export function parsePlayTime(text) {
  const m = /^(\d+):(\d{2}):(\d{2})$/.exec(String(text).trim());
  if (!m) throw new Error(`Not a game time (h:mm:ss): ${text}`);
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

export const fmtPlayTime = (s) => `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

const BATTLE_NAMES = { 0: "none", 1: "wild", 2: "trainer", "-1": "lost" };
export const battleName = (b) => BATTLE_NAMES[b] ?? String(b);

/**
 * What a logged call looks like in the game once it is over. The log keeps the in-game clock
 * (whole seconds) and `where` (map, x/y when not dark, battle), not a frame number, so the
 * call is found as the first poll of the replay that shows all of it with the buttons let go:
 * this second, this map, this x/y, this battle. Polls are the app's own (every 6 frames).
 */
export function callTarget(entry) {
  const where = parseWhere(entry.where);
  if (!where || !entry.playTime) throw new Error(`Call ${entry.n} has no location or game time in the run log.`);
  return { ...where, sec: parsePlayTime(entry.playTime), n: entry.n };
}

/**
 * Whether one poll of the replay is the target. `sample`: { sec, mapConst, x, y, battle ("none" | …), released }.
 * `target`: callTarget(), or { sec } alone for --at-time.
 */
export function matches(target, sample) {
  if (!sample.released) return false;
  if (sample.sec !== target.sec) return false;
  if (target.mapConst != null && sample.mapConst !== target.mapConst) return false;
  if (target.battle != null && sample.battle !== target.battle) return false;
  if (target.x != null && (sample.x !== target.x || sample.y !== target.y)) return false;
  return true;
}

/** The first matching sample's index (samples in replay order), or -1. */
export function firstMatch(target, samples) {
  return samples.findIndex((s) => matches(target, s));
}

/** The log's own numbers a snapshot can be checked against: [label, logged, found]. */
export function compareWithLog(entry, found) {
  const where = parseWhere(entry.where);
  const rows = [
    ["game time", entry.playTime, found.playTime],
    ["map", where?.mapConst, found.mapConst],
    ["battle", where?.battle, found.battle],
  ];
  if (where?.x != null) rows.push(["x/y", `${where.x}/${where.y}`, `${found.x}/${found.y}`]);
  for (const k of ["badges", "deaths", "violations", "candies"]) if (entry[k] != null) rows.push([k, entry[k], found[k]]);
  if (entry.candiedToCap != null) rows.push(["candiedToCap", entry.candiedToCap, found.candiedToCap]);
  if (entry.overCap != null) rows.push(["overCap", entry.overCap, found.overCap]);
  if (entry.firstRival != null) rows.push(["firstRival", entry.firstRival, found.firstRival]);
  return rows.map(([label, logged, got]) => ({ label, logged, got, ok: String(logged) === String(got) }));
}
