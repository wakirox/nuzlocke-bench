// The games the harness can run, by version: each version's game adapter (src/games/adapter.ts).
// To add a game, implement its adapter in its own folder and add its versions here.

import type { GameVersion } from "../rom/types";
import type { GameAdapter } from "./adapter";
import { detectVersion as gen1Version, gen1Adapter } from "./gen1";
import { detectVersion as gen2Version, gen2Adapter } from "./gen2";

export type { GameAdapter } from "./adapter";

const adapters = new Map<GameVersion, GameAdapter>();

/** The adapter for a version's game (one per version, made on first use). */
export function gameFor(version: GameVersion): GameAdapter {
  let game = adapters.get(version);
  if (!game) {
    game = version === "crystal" ? gen2Adapter() : gen1Adapter(version);
    adapters.set(version, game);
  }
  return game;
}

/** The version a ROM is, by its header, as a player names it ("Red"), or null for a ROM no adapter plays. */
export function detectVersion(rom: Uint8Array): string | null {
  return gen1Version(rom) ?? gen2Version(rom);
}
