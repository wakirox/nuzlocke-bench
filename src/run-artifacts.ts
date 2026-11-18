// Declarative manifest of every persisted artifact belonging to a run: its storage key, disk-mirror
// throttling, cleanup on `clearRun`, milestone unpacking, and snapshot copy list.
// Keeping this in one browser/Node-neutral module prevents new per-run state (e.g. routes, fog-of-war
// seen memory) from being forgotten in clearRun, milestones or snapshot-run.mjs.

import { FIELDS, type ReplayLog } from "./emulator/replay";
import type { SeenData } from "./bridge/seen";
import type { ChallengeMode } from "./rulesets";
import type { TrackerData } from "./rom/types";
import type { Outcome, TrackerSnapshot } from "./tracker/tracker";

export interface BaseRom {
  name: string;
  bytes: Uint8Array;
}

export interface CurrentRun {
  attempt: number;
  /**
   * The ruleset. Saves from rulesets this version no longer has keep their old id: the app
   * treats such a run as no current run (see isKnownRuleset).
   */
  mode: ChallengeMode;
  /** The game the run plays: the base ROM as loaded, unchanged. */
  rom: Uint8Array;
  data: TrackerData;
  startedAt: number;
  /** Hardcore Nuzlocke option: a bottomless stack of Rare Candies (missing = on). */
  rareCandies?: boolean;
  /** Hardcore Nuzlocke option: hard level caps (missing = off). */
  hardLevelCaps?: boolean;
  /** Hardcore Nuzlocke option: the first rival battle doesn't count (missing = off). */
  firstRivalFree?: boolean;
  /** The first violation ends the run (missing = the ruleset's default). */
  endOnViolation?: boolean;
  /** Rule ids set to "logged only" at the start of the run (harness tuning). */
  lenientRules?: string[];
  /** Short run: badges that win the run (missing = full game). */
  goalBadges?: number;
}

/** A finished attempt in the run history. */
export interface RunRecord {
  attempt: number;
  /** Runs recorded before a ruleset was removed keep its id (or none, the oldest): shown, never resumed. */
  mode?: string;
  version: string;
  startedAt: number;
  endedAt: number;
  lead: string;
  level: number;
  badges: number;
  /** Older records may hold outcome kinds this version no longer produces. */
  outcome: Outcome | { kind: "abandoned"; detail: string } | { kind: string; detail: string };
}

/** A story-milestone checkpoint stored at `KEYS.milestone(id)`. */
export interface MilestoneSave {
  state: Uint8Array;
  tracker: TrackerSnapshot;
  battery: Uint8Array | null;
  ticks: number;
  /** The run's memory of the maps (fog of war, 0.2.0 on): what it had seen by then (absent on older milestones). */
  seen?: SeenData;
}

export const KEYS = {
  baseRom: "baseRom",
  run: "run",
  battery: "run.battery",
  autoState: "run.autoState",
  /** Prefix for named save slots (`${KEYS.slotState}.${slot}`); not stored as a bare key itself. */
  slotState: "run.slotState",
  tracker: "run.tracker",
  history: "history",
  attempts: "attempts",
  /** The current run's recording so far (ReplayLog), saved alongside autoState. */
  replay: "run.replay",
  /** The AI's own route book for this run (note_route / go_to). */
  routes: "run.routes",
  /** What this run has seen of each map (SeenData): the AI's maps show only that. */
  seen: "run.seen",
  /** A save kept when the run first reached a story milestone, by milestone id. */
  milestone: (id: string) => `run.milestone.${id}`,
  /** A ruleset's furthest run's recording (SavedReplay), kept across runs ("bestReplay.nuzlocke"). */
  bestReplay: (ruleset: ChallengeMode) => `bestReplay.${ruleset}`,
  /** A finished run's recording (SavedReplay), by attempt number — what scripts/verify-run.mjs checks. */
  runReplay: (attempt: number) => `replay.attempt-${attempt}`,
} as const;

export interface RunArtifactSpec {
  key: string;
  /** Minimum interval (ms) between disk-backup flushes for large rapidly-growing keys; omitted = immediate. */
  throttleMs?: number;
  /** Copied verbatim from the source saves folder by `scripts/snapshot-run.mjs`. */
  snapshotCopy?: boolean;
  /** Field on `MilestoneSave` holding this artifact's value when unpacking a milestone save. */
  milestoneField?: keyof Omit<MilestoneSave, "ticks">;
}

/** Every stored per-run artifact (all deleted on `clearRun`). */
export const RUN_ARTIFACTS: readonly RunArtifactSpec[] = [
  { key: KEYS.run, snapshotCopy: true },
  { key: KEYS.autoState, milestoneField: "state" },
  { key: KEYS.battery, milestoneField: "battery" },
  { key: KEYS.tracker, milestoneField: "tracker" },
  // The run's memory of the maps (fog of war, 0.2.0 on): old milestones have no `seen`, so unpack skips null/undefined.
  { key: KEYS.seen, milestoneField: "seen" },
  // The current run's recording grows to megabytes; copy it at most every 2 minutes (a disk copy
  // that's a little behind just means a jump in the replay, which it already handles).
  { key: KEYS.replay, throttleMs: 120_000 },
  { key: KEYS.routes },
];

/** Save filenames copied unchanged into a snapshot folder (`scripts/snapshot-run.mjs`). */
export const SNAPSHOT_KEPT_FILES: readonly string[] = [
  ...RUN_ARTIFACTS.filter((a) => a.snapshotCopy).map((a) => `${a.key}.json`),
  "baseRom.json",
  "attempts.json",
  "policies.json",
  "aiControl.json",
];

/** Disk-mirror throttle intervals (ms) by storage key, derived from `RUN_ARTIFACTS`. */
export const THROTTLED_KEYS: Record<string, number> = Object.fromEntries(
  RUN_ARTIFACTS.filter((a) => (a.throttleMs ?? 0) > 0).map((a) => [a.key, a.throttleMs!]),
);

/**
 * Every key in `existingKeys` (plus fixed per-run keys) that belongs to the active run and should be
 * deleted on `clearRun()`: `RUN_ARTIFACTS` keys plus any `run.milestone.*` saves.
 */
export function keysClearedWithRun(existingKeys: Iterable<string>): string[] {
  const out = new Set<string>(RUN_ARTIFACTS.map((a) => a.key));
  const milestonePrefix = KEYS.milestone("");
  for (const k of existingKeys) {
    if (k.startsWith(milestonePrefix)) out.add(k);
  }
  return [...out];
}

/** Cuts a `ReplayLog` at `ticks` (for milestone snapshots). */
function cutReplayAtTicks(rep: ReplayLog, ticks: number, fields = FIELDS): { cut: ReplayLog; events: number } {
  let n = 0;
  while (n * fields < rep.events.length && rep.events[n * fields] <= ticks) n++;
  return {
    events: n,
    cut: {
      start: rep.start,
      events: rep.events.slice(0, n * fields),
      states: rep.states.filter((st) => st.at < n),
      endTicks: ticks,
    },
  };
}

/**
 * Unpacks a `MilestoneSave` + full `ReplayLog` into `{ key -> value }` pairs ready to write into a
 * snapshot's saves folder (`run.autoState`, `run.tracker`, optional `run.battery` & `run.seen`, and cut `run.replay`).
 */
export function unpackMilestone(
  milestone: MilestoneSave,
  fullReplay: ReplayLog,
  fields = FIELDS,
): { files: Record<string, unknown>; events: number } {
  const { cut, events } = cutReplayAtTicks(fullReplay, milestone.ticks, fields);
  const files: Record<string, unknown> = {};
  for (const spec of RUN_ARTIFACTS) {
    if (!spec.milestoneField) continue;
    const val = milestone[spec.milestoneField];
    if (val != null) files[spec.key] = val;
  }
  files[KEYS.replay] = cut;
  return { files, events };
}
