// What scripts/verify-run.mjs loads (bundled with the browser shims, like the page's worker).

import { readRom, type LoadFile } from "../rom/reader";
import type { TrackerData } from "../rom/types";

export { verifyRecording } from "./verify";
export { NodeGameBoy } from "../emulator/node-gameboy";

/** The game exactly as the page would run it, and the tracker data read from it. */
export async function prepareNuzlocke(baseRom: Uint8Array, loadFile: LoadFile): Promise<{ rom: Uint8Array; data: TrackerData }> {
  return readRom(baseRom.slice().buffer, loadFile);
}

// For scripts/snapshot-run.mjs: play a recording to a chosen point with a tracker.
export { FIELDS, ReplayPlayer } from "../emulator/replay";
export { Tracker } from "../tracker/tracker";
export { gameFor } from "../games";
