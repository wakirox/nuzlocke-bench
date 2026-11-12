// The game data the Node side uses (milestones, fight classes, hint steps…), by the run's game
// version as the page reports it (run.json data.version). A new generation adds its module here.
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

export { GEN1, GEN2 };
