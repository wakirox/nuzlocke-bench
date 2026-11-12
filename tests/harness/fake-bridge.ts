// A fake host + fake Game Boy for driving AiBridge.dispatch() against scripted screens, with no ROM.
//
// The screen is a script: a list of screens (18 rows of 20 columns, as the game's text reader returns
// them) that advance when buttons are pressed. Every press is recorded in order. Game-specific text
// stays in the tests; the harness only needs the game's ScreenLayout (pass the adapter's `screen`).

import type { Button, GameBoy } from "../../src/emulator/gameboy";
import type { AiHost } from "../../src/bridge/ai-bridge";
import type { GameAdapter, ScreenLayout } from "../../src/games/adapter";
import type { Position } from "../../src/games/types";

export const COLS = 20;
export const ROWS = 18;

/** 18 rows of 20 columns: `rows` maps a row number to its text; the other rows are blank. */
export function screenRows(rows: Record<number, string> = {}): string[] {
  return Array.from({ length: ROWS }, (_, r) => (rows[r] ?? "").padEnd(COLS).slice(0, COLS));
}

/** A screen with the bottom text box open on `lines` (one per row, up to the box height) over `above`. */
export function textBoxScreen(layout: ScreenLayout, lines: string[], above: Record<number, string> = {}, more = false): string[] {
  const { top, bottom } = layout.textBox;
  const rows: Record<number, string> = { ...above };
  rows[top] = "┌" + "─".repeat(COLS - 2) + "┐";
  rows[bottom] = "└" + "─".repeat(COLS - 2) + "┘";
  for (let r = top + 1; r < bottom; r++) rows[r] = "│" + (lines[r - top - 1] ?? "").padEnd(COLS - 2) + "│";
  if (more) rows[bottom - 1] = "│" + (lines[bottom - top - 2] ?? "").padEnd(COLS - 3) + "▼│";
  return screenRows(rows);
}

/** One screen of the script. `on` says which screen a button leads to (an index, or "next"); other buttons do nothing. */
export interface ScriptScreen {
  rows: string[];
  on?: Partial<Record<Button, number | "next">>;
}

export interface FakeHostOptions {
  position?: Partial<Position>;
  /** Called for every button press after the script has moved (for stateful screens such as a keyboard). */
  onPress?: (button: Button, host: FakeHost) => void;
  /** The summary / brief the bridge reads (defaults: nothing special). */
  outcome?: string | null;
  /** Fields of the game summary the bridge reads (e.g. battle: "wild", bag). */
  summary?: Record<string, unknown>;
}

export class FakeHost {
  /** Every button pressed, in order (chords count each button, in the order they went down). */
  readonly presses: Button[] = [];
  /** Total frames the bridge ran. */
  frames = 0;
  index = 0;
  rows: string[];
  readonly booted = Promise.resolve();
  readonly canvas = {} as HTMLCanvasElement;
  readonly gameBoy: GameBoy;
  readonly adapter: GameAdapter;
  private down = new Set<Button>();

  constructor(readonly layout: ScreenLayout, readonly script: ScriptScreen[], private opts: FakeHostOptions = {}) {
    this.rows = script[0]?.rows ?? screenRows();
    for (const s of script) if (s.rows.length !== ROWS || s.rows.some((r) => r.length !== COLS)) throw new Error(`Script screens must be ${COLS}×${ROWS}.`);
    this.gameBoy = {
      crashed: false,
      pc: 0,
      setButton: (b: Button, on: boolean) => {
        if (on && !this.down.has(b)) this.press(b);
        if (on) this.down.add(b);
        else this.down.delete(b);
      },
      runFrames: async (n: number) => {
        this.frames += n;
      },
      read8: () => 0, // LCD off: no V-blank alignment
      draw() {},
    } as unknown as GameBoy;
    this.adapter = {
      game: "fake",
      screen: layout,
      readScreenText: () => this.rows,
      crashedAt: () => false,
      isDark: () => false,
    } as unknown as GameAdapter;
  }

  /** Replaces the screen shown now (for onPress hooks). */
  show(rows: string[]): void {
    this.rows = rows;
  }

  private press(b: Button): void {
    this.presses.push(b);
    const to = this.script[this.index]?.on?.[b];
    if (to !== undefined) {
      this.index = to === "next" ? Math.min(this.index + 1, this.script.length - 1) : to;
      this.rows = this.script[this.index].rows;
    }
    this.opts.onPress?.(b, this);
  }

  /** The object to hand to `new AiBridge(...)`. */
  asHost(): AiHost {
    const position = (): Position => ({ x: 0, y: 0, map: 0, battle: false, inWorld: false, ...this.opts.position });
    return {
      booted: this.booted,
      gb: () => this.gameBoy,
      version: () => "yellow",
      game: () => this.adapter,
      summary: () => ({ ...this.opts.summary }),
      brief: () => ({ location: "test", battle: "", lead: null, enemy: null, outcome: this.opts.outcome ?? null }) as never,
      newEvents: () => [],
      takePoisonHurt: () => [],
      battleMoves: () => [],
      refresh: () => {},
      saveProblem: () => null,
      position,
      battleHp: () => null,
      fontSignature: () => null,
      beatenTrainers: () => [],
      mapTrainers: () => [],
      rom: () => null,
      canvas: this.canvas,
    } as unknown as AiHost;
  }
}
