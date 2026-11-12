// Replays a real recorded run through the rules engine and checks it ends the way it did.
// Needs a recording, which holds the ROM it ran on, so it only runs on your machine:
//
//   NUZLOCKE_TEST_REPLAY=saves/bestReplay.nuzlocke.json npm test
//
// Recordings from before tracker data was saved with them also need the run's data:
//   NUZLOCKE_TEST_DATA=saves/run.json   (the run file of that same run)
//
// The first pass writes what the engine saw (areas, deaths, catches, violations) to
// tests/rom/golden/<mode>-attempt-<n>.json; later passes must match it. Commit that file to
// lock the result in; delete it to accept a deliberate change.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { SavedReplay } from "../../src/emulator/replay";
import { ReplayPlayer } from "../../src/emulator/replay";
import type { TrackerData } from "../../src/rom/types";
import { isKnownRuleset } from "../../src/rulesets";
import { gameFor } from "../../src/games";
import { Tracker } from "../../src/tracker/tracker";
import { NodeGameBoy, TICKS_PER_FRAME } from "../harness/node-gameboy";
import { readSaveFile } from "../harness/save-files";

const REPLAY = process.env.NUZLOCKE_TEST_REPLAY;
/** The app polls the tracker every 6 frames. */
const POLL = 6 * TICKS_PER_FRAME;

describe.skipIf(!REPLAY)("recorded run", () => {
  it("replays to the same ending, with the same events", { timeout: 60 * 60_000 }, async () => {
    const rep = readSaveFile<SavedReplay & { data?: TrackerData }>(REPLAY!);
    const data = rep.data ?? (process.env.NUZLOCKE_TEST_DATA ? readSaveFile<{ data: TrackerData }>(process.env.NUZLOCKE_TEST_DATA).data : null);
    if (!data) throw new Error("This recording has no tracker data: set NUZLOCKE_TEST_DATA to that run's saves/run.json.");
    const mode = rep.meta.mode;
    if (!isKnownRuleset(mode)) throw new Error(`This recording's ruleset (${mode ?? "none"}) isn't one this version has.`);

    const gb = await NodeGameBoy.create(rep.rom);
    const player = new ReplayPlayer(gb.asGameBoy(), rep, { version: data.version });
    const tracker = new Tracker(data, mode, null, () => {});
    while (!player.done) {
      player.step(POLL);
      tracker.update(gameFor(data.version).readGameState(gb));
    }
    gb.destroy();

    const snap = tracker.snap;
    expect(snap.outcome?.detail).toBe(rep.meta.outcome);

    const summary = {
      mode,
      attempt: rep.meta.attempt,
      outcome: snap.outcome,
      maxBadges: snap.maxBadges,
      areas: snap.areas,
      dead: snap.dead.map(({ t: _t, ...d }) => d),
      catches: snap.catches.map(({ t: _t, ...c }) => c),
      violations: snap.violations.map((e) => e.text),
    };
    const dir = join(process.cwd(), "tests", "rom", "golden");
    const file = join(dir, `${mode}-attempt-${rep.meta.attempt}.json`);
    if (!existsSync(file)) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(file, JSON.stringify(summary, null, 2) + "\n");
      console.log(`Wrote ${file} — commit it to lock this run's result in.`);
    } else {
      expect(summary).toEqual(JSON.parse(readFileSync(file, "utf8")));
    }
  });
});
