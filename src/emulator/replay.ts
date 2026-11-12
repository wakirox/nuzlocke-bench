// Run recordings. The Game Boy core is deterministic, so a run is fully described
// by its starting machine state plus every outside influence, stamped with the CPU
// tick it happened at: button changes, the harness's own interventions (a Rare Candy
// top-up, setting the hard level cap; in older recordings also burying a dead Pokémon — recorded by name, and re-done on playback), raw RAM pokes
// (none today; older recordings have some) and loaded save states. Playing
// those back against the same ROM reproduces the run exactly, at any speed.
//
// A recording made of buttons and named interventions only, from power-on, can be checked
// independently (src/verify): nothing in it can change the game except as the harness would.

import type { Button, GameBoy } from "./gameboy";
import type { GameVersion, TrackerData } from "../rom/types";
import type { RunOptions } from "../rulesets";
import { gameFor } from "../games";

export const BUTTONS: Button[] = ["up", "down", "left", "right", "a", "b", "start", "select"];

const KIND_BUTTON = 0;
const KIND_WRITE = 1;
/** The harness keeps item `a` at 99 in the bag (topUpItem). */
export const KIND_TOP_UP = 2;
/**
 * The harness moved dead party slot `a` to the last PC box (buryInLastBox). Older recordings only:
 * the harness no longer does it (the dead stay in the party until the player boxes them), but
 * those recordings still play back and verify as they ran.
 */
export const KIND_BURY = 3;
/** Hard level caps option: experience and Rare Candies stop at level `a` (setLevelCapInRom; 100 = no cap). */
export const KIND_LEVEL_CAP = 4;
const NO_LEVEL_CAP = 100;
/** Hard level caps option: Rare Candies alone stop at level `a`, once experience may pass the cap (setCandyCapInRom). */
export const KIND_CANDY_CAP = 5;
export type InterventionKind = typeof KIND_TOP_UP | typeof KIND_BURY | typeof KIND_LEVEL_CAP | typeof KIND_CANDY_CAP;
export const FIELDS = 4; // ticks, kind, a, b

export interface ReplayLog {
  /** Machine state the recording starts from. */
  start: Uint8Array;
  /** Flattened [ticks, kind, a, b]: kind 0 = button a (BUTTONS index) set to b; kind 1 = RAM[a] = b; 2–4 = interventions (KIND_*). */
  events: Float64Array;
  /** Save states loaded mid-run, applied before event #at. */
  states: { at: number; state: Uint8Array }[];
  /** CPU tick the recording ends at. */
  endTicks: number;
}

export interface ReplayMeta {
  attempt: number;
  /** The ruleset id ("nuzlocke"); older recordings may name a removed ruleset, or none. */
  mode?: string;
  /** Older recordings only. */
  seed?: string;
  version: string;
  lead: string;
  level: number;
  badges: number;
  outcome: string;
  /** Higher is further: victory, then badges, then the lead's best level. */
  score: number;
  recordedAt: number;
}

/** A finished run, with the exact ROM it ran on. */
export interface SavedReplay extends ReplayLog {
  rom: Uint8Array;
  meta: ReplayMeta;
  /** The run's tracker data, so the recording can be re-checked on its own (tests/rom). Missing on older recordings. */
  data?: TrackerData;
  /** The run's optional rules, so a replay judges it the same way. Missing on older recordings. */
  options?: RunOptions;
}

export class Recorder {
  private buf: Float64Array;
  private n = 0;
  readonly start: Uint8Array;
  private states: { at: number; state: Uint8Array }[];
  private held = new Array<boolean>(BUTTONS.length).fill(false);

  constructor(log: Pick<ReplayLog, "start"> & Partial<ReplayLog>) {
    this.start = log.start;
    this.states = log.states ? [...log.states] : [];
    const old = log.events ?? new Float64Array(0);
    this.buf = new Float64Array(Math.max(4096, old.length * 2));
    this.buf.set(old);
    this.n = old.length;
  }

  private push(ticks: number, kind: number, a: number, b: number): void {
    if (this.n + FIELDS > this.buf.length) {
      const bigger = new Float64Array(this.buf.length * 2);
      bigger.set(this.buf);
      this.buf = bigger;
    }
    this.buf.set([ticks, kind, a, b], this.n);
    this.n += FIELDS;
  }

  button(ticks: number, button: Button, pressed: boolean): void {
    const i = BUTTONS.indexOf(button);
    if (this.held[i] === pressed) return;
    this.held[i] = pressed;
    this.push(ticks, KIND_BUTTON, i, pressed ? 1 : 0);
  }

  write(ticks: number, addr: number, value: number): void {
    this.push(ticks, KIND_WRITE, addr, value);
  }

  intervention(ticks: number, kind: InterventionKind, a: number): void {
    this.push(ticks, kind, a, 0);
  }

  state(data: Uint8Array): void {
    this.states.push({ at: this.n / FIELDS, state: data.slice() });
  }

  log(endTicks: number): ReplayLog {
    return { start: this.start, events: this.buf.slice(0, this.n), states: [...this.states], endTicks };
  }
}

/** A point in a recording to resume playback from (seeking). */
export interface ReplayKeyframe {
  i: number;
  si: number;
  done: boolean;
  /** Buttons held at this point: the emulator state doesn't include the joypad. */
  held: boolean[];
  state: Uint8Array;
}

/** Steps a GameBoy through a recording. The caller owns the animation loop. */
export class ReplayPlayer {
  private i = 0;
  private si = 0;
  private startTicks: number;
  private held = new Array<boolean>(BUTTONS.length).fill(false);
  done = false;

  private version?: GameVersion;
  private onIntervention?: (kind: InterventionKind, a: number) => void;

  /**
   * opts.version lets playback re-do the harness's interventions (recordings that have them need it);
   * opts.onIntervention sees each one just before it's re-done (the verifier checks them).
   */
  constructor(private gb: GameBoy, private rec: ReplayLog, opts: { version?: GameVersion; onIntervention?: (kind: InterventionKind, a: number) => void } = {}) {
    this.version = opts.version;
    this.onIntervention = opts.onIntervention;
    gb.loadState(rec.start);
    this.startTicks = gb.ticks;
  }

  get eventCount(): number {
    return this.rec.events.length / FIELDS;
  }

  get eventIndex(): number {
    return this.i;
  }

  snapshot(): ReplayKeyframe {
    return { i: this.i, si: this.si, done: this.done, held: [...this.held], state: this.gb.saveState() };
  }

  /** Jumps to a keyframe taken from this recording (by any player of it: playback is deterministic). */
  restore(k: ReplayKeyframe): void {
    this.gb.loadState(k.state);
    this.i = k.i;
    this.si = k.si;
    this.done = k.done;
    this.held = [...k.held];
    BUTTONS.forEach((b, n) => this.gb.setButton(b, this.held[n]));
    this.restoreCap(KIND_LEVEL_CAP);
    this.restoreCap(KIND_CANDY_CAP);
  }

  /** The hard caps are in the ROM, which a save state doesn't hold: puts back the one in force here. */
  private restoreCap(kind: typeof KIND_LEVEL_CAP | typeof KIND_CANDY_CAP): void {
    const ev = this.rec.events;
    let cap: number | null = null;
    for (let n = 0; n < this.eventCount; n++) {
      if (ev[n * FIELDS + 1] !== kind) continue;
      if (n >= this.i) {
        cap ??= NO_LEVEL_CAP;
        break;
      }
      cap = ev[n * FIELDS + 2];
    }
    if (cap != null) intervene(this.gb, this.version, kind, cap);
  }

  /** Emulated seconds the whole recording covers. */
  get totalSeconds(): number {
    return Math.max(0, this.rec.endTicks - this.startTicks) / 4194304;
  }

  /** Emulated seconds played so far (game time, not wall time). */
  get seconds(): number {
    return Math.max(0, this.gb.ticks - this.startTicks) / 4194304;
  }

  /** Runs `budget` CPU ticks of the recording, applying its events on the way. */
  step(budget: number): void {
    const ev = this.rec.events;
    const count = this.eventCount;
    while (budget > 0 && !this.done) {
      const pending = this.rec.states[this.si];
      if (pending && pending.at === this.i) {
        this.gb.loadState(pending.state);
        this.si++;
        continue;
      }
      const now = this.gb.ticks;
      if (this.i >= count) {
        const end = Math.min(now + budget, this.rec.endTicks);
        if (end > now) this.gb.runTo(end);
        if (end >= this.rec.endTicks) this.done = true;
        break;
      }
      const at = ev[this.i * FIELDS];
      if (at - now > budget) {
        this.gb.runTo(now + budget);
        break;
      }
      if (at > now) this.gb.runTo(at);
      budget -= Math.max(0, at - now);
      const kind = ev[this.i * FIELDS + 1];
      const a = ev[this.i * FIELDS + 2];
      const b = ev[this.i * FIELDS + 3];
      if (kind === KIND_BUTTON) {
        this.held[a] = b === 1;
        this.gb.setButton(BUTTONS[a], b === 1);
      }
      else if (kind === KIND_WRITE) this.gb.write8(a, b);
      else {
        this.onIntervention?.(kind as InterventionKind, a);
        intervene(this.gb, this.version, kind as InterventionKind, a);
      }
      this.i++;
    }
    this.gb.draw();
  }
}

/** Re-does one of the harness's interventions exactly as it ran live (same machine state, same code). */
export function intervene(gb: GameBoy, version: GameVersion | undefined, kind: InterventionKind, a: number): void {
  if (!version) throw new Error("This recording has harness interventions: playing it back needs the game version.");
  const game = gameFor(version);
  try {
    if (kind === KIND_TOP_UP) game.topUpItem(gb, a);
    else if (kind === KIND_BURY) game.buryInLastBox(gb, a);
    else if (kind === KIND_LEVEL_CAP) game.setLevelCapInRom(gb, a);
    else if (kind === KIND_CANDY_CAP) game.setCandyCapInRom(gb, a);
  } catch {
    // It threw live too (the game was mid-write): whatever it wrote before throwing is written again.
  }
}
