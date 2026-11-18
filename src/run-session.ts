// A live challenge run: binds the GameBoy emulator, game adapter, Nuzlocke tracker, replay recorder
// and fog-of-war map memory into one non-nullable aggregate with explicit frame/poll/checkpoint
// methods and no DOM dependencies.

import { battleMoves, brief, summarize } from "./bridge/summary";
import type { Brief, MoveInfo } from "./bridge/bridge-core";
import { SeenMaps, type SeenData } from "./bridge/seen";
import type { GameBoy } from "./emulator/gameboy";
import { KIND_CANDY_CAP, KIND_LEVEL_CAP, KIND_TOP_UP, Recorder, type ReplayLog, type SavedReplay } from "./emulator/replay";
import { gameFor, type GameAdapter } from "./games";
import type { BattlerHp, GameState, Position } from "./games/types";
import { RULESETS } from "./rulesets";
import type { CurrentRun, MilestoneSave, RunRecord } from "./run-artifacts";
import { Tracker, type TrackerSnapshot } from "./tracker/tracker";

/** Nuzlocke option, on unless turned off: Rare Candies never run out (level caps still apply). */
export const infiniteCandies = (r: CurrentRun): boolean =>
  Boolean(RULESETS[r.mode].rareCandies && r.rareCandies !== false);

/** Victory beats everything; then badges; then the lead's best level. */
export function runScore(outcome: RunRecord["outcome"], badges: number, level: number): number {
  return (outcome.kind === "victory" ? 1_000_000 : 0) + badges * 1000 + level;
}

/**
 * Hard level caps option: keep the level the game's experience and Rare Candies stop at equal to
 * the current cap (it rises with each badge). The loaded ROM starts at 100 on every page load, so
 * this also sets it after a resume. Recorded by name (KIND_LEVEL_CAP) for playback.
 */
export function syncHardCap(gb: GameBoy, tracker: Tracker, state: GameState): void {
  // Not before there's a party: at power-on, RAM is noise (it can read as a badge).
  if (!state.party.length) return;
  const level = tracker.levelCapForRom(state);
  if (level == null) return;
  if (tracker.game.levelCapInRom(gb) !== level) {
    gb.intervene(KIND_LEVEL_CAP, level, () => tracker.game.setLevelCapInRom(gb, level));
  }
  // In the League experience may pass the cap, but Rare Candies still stop there.
  const candy = tracker.candyCapForRom(state);
  if (candy != null && tracker.game.candyCapInRom(gb) !== candy) {
    gb.intervene(KIND_CANDY_CAP, candy, () => tracker.game.setCandyCapInRom(gb, candy));
  }
}

export interface AutosaveCapture {
  autoState: Uint8Array;
  tracker: TrackerSnapshot;
  replay: ReplayLog;
  seen?: SeenData;
}

export interface RunSessionOptions {
  run: CurrentRun;
  rom: Uint8Array;
  gb: GameBoy;
  snapshot?: TrackerSnapshot | null;
  savedReplay?: ReplayLog | null;
  seenData?: SeenData | null;
  onTrackerChange?: () => void;
  onPoll?: (info: { justEnded: boolean }) => void;
}

export class RunSession {
  readonly run: CurrentRun;
  readonly rom: Uint8Array;
  readonly gb: GameBoy;
  readonly adapter: GameAdapter;
  readonly tracker: Tracker;
  readonly recorder: Recorder;
  readonly seen: SeenMaps;
  readonly fontSig: Uint8Array;
  /** Latest polled game state; stays `null` until the first `poll()` so power-on RAM noise isn't read early. */
  state: GameState | null = null;

  private frameCount = 0;
  private eventsSeen = 0;
  private engagedTrainer: { map: number; sprite: number } | null = null;
  private onPoll?: (info: { justEnded: boolean }) => void;

  constructor(opts: RunSessionOptions) {
    this.run = opts.run;
    this.rom = opts.rom;
    this.gb = opts.gb;
    this.onPoll = opts.onPoll;
    this.adapter = gameFor(opts.run.data.version);
    this.fontSig = this.adapter.fontSignature(opts.run.rom);
    this.seen = new SeenMaps(opts.seenData ?? undefined);

    // Recording: a new run starts from power-on; a resumed one continues its saved log. The log is
    // saved together with autoState, so it normally ends exactly here — if not, resync with a state.
    this.recorder = new Recorder(opts.savedReplay ?? { start: opts.gb.saveState() });
    if (opts.savedReplay && opts.savedReplay.endTicks !== opts.gb.ticks) {
      this.recorder.state(opts.gb.saveState());
    }
    opts.gb.recorder = this.recorder;

    const r = opts.run;
    this.tracker = new Tracker(r.data, r.mode, opts.snapshot ?? null, opts.onTrackerChange ?? (() => {}), {
      hardLevelCaps: !!r.hardLevelCaps,
      firstRivalFree: !!r.firstRivalFree,
      endOnViolation: r.endOnViolation ?? RULESETS[r.mode].endOnViolationByDefault,
      lenientRules: r.lenientRules ?? [],
      goalBadges: r.goalBadges,
    });
  }

  /** Per-frame hook: tops up Rare Candies once unlocked and polls state every 6 frames. */
  stepFrame(): void {
    this.frameCount++;
    // The bottomless Rare Candies start after the first rival battle: that fight is played at the starter's own level.
    if (infiniteCandies(this.run) && this.adapter.firstRivalBattleFought(this.gb)) {
      const candy = this.adapter.data.items.rareCandy;
      this.gb.intervene(KIND_TOP_UP, candy, () => this.adapter.topUpItem(this.gb, candy));
    }
    if (this.frameCount % 6 === 0) this.poll();
  }

  /** Re-reads game memory, syncs hard caps, tracks beaten trainer sprites, and updates the tracker. */
  poll(): { justEnded: boolean } {
    const prev = this.state;
    const next = this.adapter.readGameState(this.gb);
    this.state = next;
    syncHardCap(this.gb, this.tracker, next);

    // Trainer battles: find the sprite whose trainer class + number (wMapSpriteExtraData) match
    // the opponent's; fall back to the nearest trainer sprite.
    if (prev && prev.battle === 0 && next.battle === 2) {
      const foe = next.enemyTrainer;
      const sprites = this.adapter.trainerSprites(this.gb, prev.x, prev.y);
      const exact = foe && sprites.find((t) => {
        const who = this.adapter.spriteTrainer(this.gb, t.index);
        return who.trainerClass === foe.trainerClass && who.number === foe.number;
      });
      const near = sprites
        .map((t) => ({ t, d: Math.abs(t.x - prev.x) + Math.abs(t.y - prev.y) }))
        .sort((a, b) => a.d - b.d)[0];
      this.engagedTrainer = exact
        ? { map: prev.map, sprite: exact.index }
        : near && near.d <= 6 ? { map: prev.map, sprite: near.t.index } : null;
    }
    if (prev && prev.battle === 2 && next.battle === 0) {
      if (this.engagedTrainer && next.party.some((m) => m.hp > 0)) {
        this.tracker.noteTrainerBeaten(this.engagedTrainer.map, this.engagedTrainer.sprite);
      }
      this.engagedTrainer = null;
    }

    const hadOutcome = this.tracker.snap.outcome;
    this.tracker.update(next);
    const justEnded = !hadOutcome && Boolean(this.tracker.snap.outcome);
    this.onPoll?.({ justEnded });
    return { justEnded };
  }

  /** Adds elapsed wall-clock time while ignoring long sleep/suspend gaps (> 60 s). */
  addRealTime(gapMs: number): boolean {
    if (gapMs <= 0 || gapMs > 60_000) return false;
    this.tracker.addRealTime(gapMs);
    return true;
  }

  /** Point-in-time capture for periodic autosaves and `beforeunload` (`seen` included only when dirty). */
  captureAutosave(): AutosaveCapture {
    return {
      autoState: this.gb.saveState(),
      tracker: this.tracker.snap,
      replay: this.recorder.log(this.gb.ticks),
      seen: this.seen.takeChanged() ? this.seen.data : undefined,
    };
  }

  /**
   * A save at a story milestone, kept for good: the machine, tracker and battery as they are now,
   * and how far the recording has got, so a run can be continued from there
   * (`scripts/snapshot-run.mjs --milestone`) without replaying it from power-on.
   */
  captureMilestone(battery: Uint8Array | null): MilestoneSave {
    return {
      state: this.gb.saveState(),
      tracker: structuredClone(this.tracker.snap),
      battery,
      ticks: this.gb.ticks,
      // With the run's memory of the maps (fog of war), so a test resumed from here remembers what it saw.
      seen: structuredClone(this.seen.data),
    };
  }

  /** Lead summary and `SavedReplay` for recording history / best-replay archives. */
  buildAttemptSummary(outcome: RunRecord["outcome"]): {
    leadName: string;
    level: number;
    badges: number;
    score: number;
    savedReplay: SavedReplay;
  } {
    const lead = this.state?.party[0]?.species ? this.state.party[0] : this.tracker.snap.lastLead;
    const leadName = lead ? this.tracker.name(lead.species) : "—";
    const level = Math.max(lead?.level ?? 0, this.tracker.snap.maxLevel ?? 0);
    const badges = this.tracker.snap.maxBadges ?? 0;
    const score = runScore(outcome, badges, level);
    const savedReplay: SavedReplay = {
      ...this.recorder.log(this.gb.ticks),
      rom: this.rom,
      data: this.run.data,
      options: this.tracker.options,
      meta: {
        attempt: this.run.attempt,
        mode: this.run.mode,
        version: this.run.data.version,
        lead: leadName,
        level,
        badges,
        outcome: outcome.detail,
        score,
        recordedAt: Date.now(),
      },
    };
    return { leadName, level, badges, score, savedReplay };
  }

  // ---- AiHost query projections ----

  summary(): unknown {
    return this.state ? summarize(this.tracker, this.state, this.run, { menuCursor: this.adapter.menuCursor(this.gb) }) : null;
  }

  brief(): Brief | null {
    return this.state ? brief(this.tracker, this.state) : null;
  }

  takeNewEvents(): string[] {
    const n = Math.min(this.tracker.eventCount - this.eventsSeen, this.tracker.snap.events.length);
    this.eventsSeen = this.tracker.eventCount;
    return n > 0 ? this.tracker.snap.events.slice(-n).map((e) => `[${e.severity}] ${e.text}`) : [];
  }

  battleMoves(): MoveInfo[] {
    return this.state ? battleMoves(this.tracker, this.state) : [];
  }

  battleHp(): { you: BattlerHp; foe: BattlerHp } | null {
    return this.adapter.readBattleHp(this.gb);
  }

  position(): Position {
    return this.adapter.position(this.gb);
  }

  beatenTrainers(): number[] {
    return this.tracker.snap.beatenTrainers[this.adapter.currentMap(this.gb)] ?? [];
  }

  mapTrainers(): { x: number; y: number; name: string; beaten: boolean }[] {
    const beaten = this.beatenTrainers();
    const here = this.adapter.position(this.gb);
    return this.adapter.trainerSprites(this.gb, here.x, here.y).map((s) => {
      const { trainerClass: cls } = this.adapter.spriteTrainer(this.gb, s.index);
      return { x: s.x, y: s.y, name: this.run.data.trainerClasses?.[cls - 1] || `class ${cls}`, beaten: beaten.includes(s.index) };
    });
  }

  destroy(flushBattery = true): void {
    this.gb.destroy(flushBattery);
  }
}
