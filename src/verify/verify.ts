// Checks a submitted run without trusting anything in it but its button presses.
//
// The verifier plays the recording from its own power-on state, on its own copy of the ROM,
// judged by its own tracker with tracker data it read from that ROM, under the conditions of
// the benchmark preset — never the recording's own claims. A recording passes only if it holds
// nothing but buttons and the harness's named interventions (a Rare Candy top-up, burying a
// dead Pokémon), each re-done here by the same code and checked as allowed. The result it
// reports is what happened in its own playback.
//
// What this proves: the run happened, under these rules, with these inputs. What it can't
// prove: who chose the inputs (a model, a script or a person).

import type { GameBoy } from "../emulator/gameboy";
import { FIELDS, KIND_BURY, KIND_CANDY_CAP, KIND_LEVEL_CAP, KIND_TOP_UP, ReplayPlayer, type InterventionKind, type SavedReplay } from "../emulator/replay";
import type { TrackerData } from "../rom/types";
import type { RunOptions } from "../rulesets";
import { gameFor } from "../games";
import type { MemoryReader } from "../games/types";
import { Tracker } from "../tracker/tracker";

/** What a benchmark preset fixes, as the verifier needs it. */
export interface Conditions {
  preset: string;
  rareCandies: boolean;
  options: RunOptions;
}

/** What the verifier needs from an emulator (NodeGameBoy). */
export interface VerifierGameBoy extends MemoryReader {
  readonly ticks: number;
  asGameBoy(): GameBoy;
  saveState(): Uint8Array;
  loadState(data: Uint8Array): boolean;
  getExtRam(): Uint8Array;
  destroy(): void;
}

export interface VerifyInput {
  /** The submitted recording. */
  replay: SavedReplay;
  /** The verifier's own copy of the game. */
  baseRom: Uint8Array;
  /** Tracker data read from baseRom by the verifier (not the recording's). */
  data: TrackerData;
  conditions: Conditions;
  /** A fresh emulator for a ROM (src/emulator/node-gameboy.ts in Node). */
  createGameBoy: (rom: Uint8Array) => Promise<VerifierGameBoy>;
  /** Called now and then with the share of the recording played (0–1). */
  onProgress?: (done: number) => void;
}

export interface VerifiedResult {
  outcome: { kind: string; detail: string } | null;
  badges: number;
  deaths: number;
  violations: string[];
  /** In-game clock when the run ended (h:mm:ss). */
  playTime: string;
  /** Emulated time played, in seconds. */
  seconds: number;
  buttonChanges: number;
  interventions: number;
}

export interface Verdict {
  /** True when the recording is clean and played back to a finished run that matches its claims. */
  ok: boolean;
  /** Why it isn't ok (empty when it is). */
  problems: string[];
  /** Things worth knowing that don't fail it. */
  notes: string[];
  preset: string;
  result: VerifiedResult;
  claimed: { outcome: string; badges: number };
}

/** The app polls the tracker every 6 frames. */
const POLL_TICKS = 6 * 70224;

const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

export async function verifyRecording(input: VerifyInput): Promise<Verdict> {
  const { replay, baseRom, data, conditions } = input;
  const problems: string[] = [];
  const notes: string[] = [];

  // ---- The recording itself: only buttons and allowed interventions. ----
  if (!sameBytes(replay.rom, baseRom)) problems.push("It ran on a different ROM than the verifier's (a modified or different game).");
  const ev = replay.events;
  let writes = 0;
  let buttons = 0;
  let interventions = 0;
  const odd = new Set<number>();
  let hardCapsOff = false;
  for (let i = 0; i < ev.length; i += FIELDS) {
    const kind = ev[i + 1];
    if (kind === 0) buttons++;
    else if (kind === 1) writes++;
    else if (kind === KIND_TOP_UP) {
      interventions++;
      if (!conditions.rareCandies || ev[i + 2] !== gameFor(data.version).data.items.rareCandy) odd.add(ev[i + 2]);
    } else if (kind === KIND_BURY) interventions++;
    else if (kind === KIND_LEVEL_CAP || kind === KIND_CANDY_CAP) {
      interventions++;
      if (!conditions.options.hardLevelCaps) hardCapsOff = true;
    } else problems.push(`Unknown event kind ${kind} at ${i / FIELDS}.`);
  }
  if (writes) problems.push(`It has ${writes} direct memory write(s): only the harness's named interventions are allowed.`);
  if (replay.states.length) problems.push(`It loads ${replay.states.length} save state(s) mid-run.`);
  for (const item of odd) problems.push(`It tops up item #${item}, which these conditions don't give out.`);
  if (hardCapsOff) problems.push("It sets hard level caps, which these conditions don't have.");
  const claimedOptions = JSON.stringify(normalize(replay.options ?? {}));
  if (claimedOptions !== JSON.stringify(normalize(conditions.options))) {
    notes.push(`It was recorded with options ${claimedOptions}; judged under the preset's ${JSON.stringify(normalize(conditions.options))}.`);
  }

  // ---- Play it back: from our power-on, judged by our tracker. ----
  const gb = await input.createGameBoy(baseRom);
  const powerOn = gb.saveState();
  if (!sameBytes(replay.start, powerOn) && !(await samePowerOn(input, baseRom, replay.start, gb))) {
    problems.push("It doesn't start from power-on (its start state has different memory); it was played from power-on.");
  }
  const tracker = new Tracker(data, "nuzlocke", null, () => {}, conditions.options);
  let earlyTopUp = false;
  const poll = () => tracker.update(gameFor(data.version).readGameState(gb));
  // Only what's allowed is played: buttons and interventions (raw writes are already a failure above).
  const allowed: number[] = [];
  for (let i = 0; i < ev.length; i += FIELDS) if (ev[i + 1] !== 1) allowed.push(ev[i], ev[i + 1], ev[i + 2], ev[i + 3]);
  const player = new ReplayPlayer(gb.asGameBoy(), { ...replay, events: new Float64Array(allowed), start: powerOn, states: [] }, {
    version: data.version,
    onIntervention: (kind: InterventionKind, a: number) => {
      if (kind === KIND_LEVEL_CAP) {
        // The hard cap goes where our own tracker says the cap is, as of now.
        poll();
        const want = tracker.levelCapForRom(gameFor(data.version).readGameState(gb));
        if (want !== a) problems.push(`It stops experience at Lv${a} where the cap is ${want == null ? "not hard" : `Lv${want}`}.`);
        return;
      }
      if (kind === KIND_CANDY_CAP) {
        poll();
        const want = tracker.candyCapForRom(gameFor(data.version).readGameState(gb));
        if (want !== a) problems.push(`It stops Rare Candies at Lv${a} where the cap is ${want == null ? "not hard" : `Lv${want}`}.`);
        return;
      }
      if (kind === KIND_TOP_UP) {
        // The bottomless Rare Candies start after the first rival battle (main.ts): that fight is
        // played at the starter's own level. Reported once: a run tops up on every frame.
        if (!earlyTopUp && !gameFor(data.version).firstRivalBattleFought(gb)) {
          earlyTopUp = true;
          problems.push("It tops up Rare Candies before the first rival battle, where the bag gets none.");
        }
        return;
      }
      if (kind !== KIND_BURY) return;
      // Burying is for the dead only: check the slot against our own tracker, as of now.
      poll();
      const s = gameFor(data.version).readGameState(gb);
      const mon = s.party[a];
      if (!mon || !tracker.isDead(mon.uid)) problems.push(`It buries party slot ${a + 1}${mon ? ` (${tracker.name(mon.species)})` : ""}, which isn't dead.`);
    },
  });
  const total = player.eventCount;
  let lastReport = 0;
  while (!player.done && !tracker.snap.outcome) {
    player.step(POLL_TICKS);
    poll();
    if (input.onProgress && player.eventIndex - lastReport > 5000) {
      lastReport = player.eventIndex;
      input.onProgress(total ? player.eventIndex / total : 1);
    }
  }
  const end = gameFor(data.version).readGameState(gb);
  const seconds = player.seconds;
  gb.destroy();

  const snap = tracker.snap;
  const result: VerifiedResult = {
    outcome: snap.outcome ? { kind: snap.outcome.kind, detail: snap.outcome.detail } : null,
    badges: snap.maxBadges,
    deaths: snap.dead.length,
    violations: snap.violations.map((v) => v.text),
    playTime: `${end.playTime.h}:${String(end.playTime.m).padStart(2, "0")}:${String(end.playTime.s).padStart(2, "0")}`,
    seconds: Math.round(seconds),
    buttonChanges: buttons,
    interventions,
  };
  const claimed = { outcome: replay.meta.outcome, badges: replay.meta.badges };
  if (!result.outcome) problems.push("Played back to the end, the run never finished.");
  else if (result.outcome.detail !== claimed.outcome) problems.push(`It claims "${claimed.outcome}", but played back it ends "${result.outcome.detail}".`);
  if (result.badges !== claimed.badges) problems.push(`It claims ${claimed.badges} badge(s); played back it has ${result.badges}.`);

  return { ok: problems.length === 0, problems, notes, preset: conditions.preset, result, claimed };
}

/**
 * Whether a start state is power-on as far as the game can tell: the same clock, CPU position,
 * memory and cartridge RAM. (The page's emulator is set up for its audio device, so its state
 * bytes can differ from ours while the machine is the same.)
 */
async function samePowerOn(input: VerifyInput, rom: Uint8Array, start: Uint8Array, powerOn: VerifierGameBoy): Promise<boolean> {
  const other = await input.createGameBoy(rom);
  try {
    if (!other.loadState(start)) return false;
    if (other.ticks !== powerOn.ticks || other.asGameBoy().pc !== powerOn.asGameBoy().pc) return false;
    for (let a = 0x8000; a <= 0xffff; a++) if (other.read8(a) !== powerOn.read8(a)) return false;
    return sameBytes(other.getExtRam(), powerOn.getExtRam());
  } finally {
    other.destroy();
  }
}

/** Options with defaults filled in, for comparing. */
function normalize(o: RunOptions): Required<RunOptions> {
  return {
    hardLevelCaps: !!o.hardLevelCaps, firstRivalFree: !!o.firstRivalFree, endOnViolation: !!o.endOnViolation,
    lenientRules: [...(o.lenientRules ?? [])].sort(), goalBadges: o.goalBadges ?? 0,
  };
}
