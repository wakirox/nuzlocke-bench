// The game data the Node side uses (milestones, fight classes, hint steps…), by the run's game
// version as the page reports it (run.json data.version). A new generation adds its module here.
import { readFileSync } from "node:fs";
import { GEN1 } from "./gen1.mjs";
import { GEN2 } from "./gen2.mjs";

const GAMES = [GEN1, GEN2];

/** The data for a game version ("red", "yellow"…); Gen 1 when the version isn't known (older runs). */
export function gameData(version) {
  return GAMES.find((g) => g.versions.includes(String(version ?? "").toLowerCase())) ?? GEN1;
}

/** Whether a game version is experimental: playable, but its runs aren't scored or ranked. */
export function isExperimental(version) {
  return GAMES.some((g) => g.experimental && g.versions.includes(String(version ?? "").toLowerCase()));
}

/** The game version a ROM holds, from its header title ("red", "blue", "yellow", "crystal"), or null. */
export function romVersion(bytes) {
  const title = Buffer.from(bytes.subarray(0x134, 0x143)).toString("latin1");
  if (title.startsWith("PM_CRYSTAL")) return "crystal";
  return /^POKEMON (RED|BLUE|YELLOW)/.exec(title)?.[1].toLowerCase() ?? null;
}

/** The game data for the ROM file at `path` (its header), Gen 1 when there's none or it can't be read. */
export function gameOfRom(path) {
  try {
    return gameData(romVersion(readFileSync(path ?? "")));
  } catch {
    return gameData(null);
  }
}

/**
 * A run's benchmark version, the leaderboard it's on: Red's (and Yellow's) is the harness version without
 * its commit ("0.4.0@abc1234" → "0.4.0"); a game with a version of its own (Crystal) is "<game>-<its
 * version>", as the run recorded it ("crystal-0.1.0"), so a change to one game doesn't move the other's.
 * A Crystal run from before the version was recorded is its first, 0.1.0.
 * @param {{ game?: string | null, harness?: string | null, gameVersion?: string | null }} run
 */
export function benchVersionOf({ game, harness, gameVersion }) {
  if (/** @type {any} */ (gameData(game)).version) return `${String(game).toLowerCase()}-${gameVersion ?? "0.1.0"}`;
  return /^[^@\s(]+/.exec(String(harness ?? ""))?.[0] || null;
}

/**
 * Each game version's milestones, as the dashboard and the results list them: { "red": [{ id, label }],
 * …, "crystal": [...] }. A run's progress is read against its own game's (Crystal's aren't Red's).
 */
export function objectivesByGame() {
  return Object.fromEntries(GAMES.flatMap((g) => g.versions.map((v) => [v, g.objectives.map((o) => ({ id: o.id, label: o.label }))])));
}

export { GEN1, GEN2 };
