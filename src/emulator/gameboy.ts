// Thin TypeScript wrapper around the binjgb WebAssembly core.
// Adapted from binjgb's docs/simple.js (MIT, Copyright (C) 2020 Ben Smith).

import type { InterventionKind, Recorder } from "./replay";
import { FAST_WATCH, PACED } from "../bridge/endpoint";

/* eslint-disable @typescript-eslint/no-explicit-any */
type BinjgbModule = any;

declare global {
  interface Window {
    Binjgb?: (opts?: object) => Promise<BinjgbModule>;
  }
}

export type Button = "up" | "down" | "left" | "right" | "a" | "b" | "start" | "select";

const SCREEN_WIDTH = 160;
const SCREEN_HEIGHT = 144;
const CPU_TICKS_PER_SECOND = 4194304;
const TICKS_PER_FRAME = 70224;
const EVENT_NEW_FRAME = 1;
const EVENT_AUDIO_BUFFER_FULL = 2;
const EVENT_UNTIL_TICKS = 4;
const AUDIO_FRAMES = 4096;
const AUDIO_LATENCY_SEC = 0.1;
const MAX_UPDATE_SEC = 5 / 60;
const CGB_COLOR_CURVE = 2;

let modulePromise: Promise<BinjgbModule> | null = null;

const coreBase = () => new URL("binjgb/", document.baseURI).href;
let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = coreBase() + "binjgb.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load the Game Boy emulator core."));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/**
 * Loads binjgb.js (+ .wasm) from /binjgb. The main game shares one module; pass
 * `separate` for a second emulator (replay viewer): binjgb isn't safe with two
 * emulators in one wasm heap, so that gets its own module instance.
 */
export function loadCore(separate = false): Promise<BinjgbModule> {
  const instantiate = () => loadScript().then(() => window.Binjgb!({ locateFile: (p: string) => coreBase() + p }));
  if (separate) return instantiate();
  modulePromise ??= instantiate();
  return modulePromise;
}

export interface GameBoyOptions {
  canvas: HTMLCanvasElement;
  rom: Uint8Array;
  extRam?: Uint8Array | null;
  /** Called (throttled) when the cartridge battery RAM changes, i.e. the game saved. */
  onBatterySave?: (extRam: Uint8Array) => void;
  /** Called once per emulated frame batch (every rAF). */
  onFrame?: () => void;
}

export class GameBoy {
  private m: BinjgbModule;
  private e: number;
  private romPtr: number;
  private romSize: number;
  private joypadPtr: number;
  private ctx2d: CanvasRenderingContext2D;
  private imageData: ImageData;
  private fbPtr: number;
  private fbSize: number;
  private audioPtr: number;
  private audioSize: number;
  private fbView: Uint8Array | null = null;
  private audioView: Uint8Array | null = null;
  private audioCtx: AudioContext;
  private audioStartSec = 0;
  private raf = 0;
  private lastRafSec = 0;
  private leftoverTicks = 0;
  private extRamDirty = false;
  private extRamTimer: number;
  private opts: GameBoyOptions;

  /** 1 = normal speed. Values > 1 run that many times faster (audio muted). */
  speed = 1;
  volume = 0;
  paused = false;
  /** While set, every input, RAM poke and state load is logged for a replay (see replay.ts). */
  recorder: Recorder | null = null;
  /** Inside intervene(): writes aren't logged one by one; this notes whether any changed memory. */
  private intervening: { changed: boolean } | null = null;

  constructor(module: BinjgbModule, opts: GameBoyOptions) {
    this.m = module;
    this.opts = opts;
    const size = (opts.rom.byteLength + 0x7fff) & ~0x7fff;
    this.romPtr = this.m._malloc(size);
    this.romSize = size;
    this.heap(this.romPtr, size).fill(0).set(opts.rom);
    this.audioCtx = new AudioContext();
    this.e = this.m._emulator_new_simple(this.romPtr, size, this.audioCtx.sampleRate, AUDIO_FRAMES, CGB_COLOR_CURVE);
    if (this.e === 0) throw new Error("The emulator rejected this ROM.");

    // set_joyp_* only take effect once a joypad callback is installed.
    this.joypadPtr = this.m._joypad_new();
    this.m._emulator_set_default_joypad_callback(this.e, this.joypadPtr);

    // Gen 1 games are DMG titles; binjgb's palette 79 is the GBC-style default.
    this.m._emulator_set_builtin_palette(this.e, 79);

    opts.canvas.width = SCREEN_WIDTH;
    opts.canvas.height = SCREEN_HEIGHT;
    this.ctx2d = opts.canvas.getContext("2d")!;
    this.imageData = this.ctx2d.createImageData(SCREEN_WIDTH, SCREEN_HEIGHT);
    this.fbPtr = this.m._get_frame_buffer_ptr(this.e);
    this.fbSize = this.m._get_frame_buffer_size(this.e);
    this.audioPtr = this.m._get_audio_buffer_ptr(this.e);
    this.audioSize = this.m._get_audio_buffer_capacity(this.e);

    if (opts.extRam && opts.extRam.byteLength > 0) this.loadExtRam(opts.extRam);

    this.extRamTimer = window.setInterval(() => {
      if (this.extRamDirty) {
        this.extRamDirty = false;
        this.opts.onBatterySave?.(this.getExtRam());
      }
    }, 1000);
  }

  private heap(ptr: number, size: number): Uint8Array {
    return new Uint8Array(this.m.HEAP8.buffer, ptr, size);
  }

  // The wasm heap may grow (detaching old views), so re-create views on demand.
  private get frameBuffer(): Uint8Array {
    if (!this.fbView || this.fbView.buffer !== this.m.HEAP8.buffer) this.fbView = this.heap(this.fbPtr, this.fbSize);
    return this.fbView;
  }

  private get audioBuffer(): Uint8Array {
    if (!this.audioView || this.audioView.buffer !== this.m.HEAP8.buffer) this.audioView = this.heap(this.audioPtr, this.audioSize);
    return this.audioView;
  }

  start(): void {
    this.lastRafSec = 0;
    this.leftoverTicks = 0;
    this.raf = requestAnimationFrame(this.tick);
  }

  /** `flushBattery: false` when the run is being discarded (don't write its save over the next run's). */
  destroy(flushBattery = true): void {
    cancelAnimationFrame(this.raf);
    clearInterval(this.extRamTimer);
    if (flushBattery && this.extRamDirty) this.opts.onBatterySave?.(this.getExtRam());
    this.audioCtx.close();
    if (this.stateFd) this.m._file_data_delete(this.stateFd);
    this.m._emulator_delete(this.e);
    this.m._joypad_delete(this.joypadPtr);
    this.m._free(this.romPtr);
  }

  /** AudioContext can only start after a user gesture. */
  resumeAudio(): void {
    if (this.audioCtx.state !== "running") this.audioCtx.resume();
  }

  setPaused(p: boolean): void {
    this.paused = p;
    if (p) this.audioCtx.suspend();
    else {
      this.lastRafSec = 0;
      this.audioStartSec = 0;
      this.audioCtx.resume();
    }
  }

  setButton(button: Button, pressed: boolean): void {
    const fn = {
      up: "_set_joyp_up", down: "_set_joyp_down", left: "_set_joyp_left", right: "_set_joyp_right",
      a: "_set_joyp_A", b: "_set_joyp_B", start: "_set_joyp_start", select: "_set_joyp_select",
    }[button];
    this.recorder?.button(this.ticks, button, pressed);
    this.m[fn](this.e, pressed ? 1 : 0);
  }

  get pc(): number {
    return this.m._emulator_get_PC(this.e);
  }

  /**
   * Gen 1 only executes ROM (plus an OAM-DMA stub in HRAM) and never uses the
   * RST vectors at $00–$3F (they hold $FF = RST $38, a runaway loop). A PC in
   * RAM/VRAM or below $40 means the game crashed.
   */
  get crashed(): boolean {
    const pc = this.pc;
    return pc < 0x40 || (pc >= 0x8000 && pc < 0xff80);
  }

  get ticks(): number {
    return this.m._emulator_get_ticks_f64(this.e);
  }

  // ---- Memory access for the tracker ----

  read8(addr: number): number {
    return this.m._emulator_read_mem(this.e, addr) & 0xff;
  }

  /** One byte of work-RAM bank `bank` at CPU address `addr` ($C000-$DFFF), whichever bank is switched in. */
  readWram(bank: number, addr: number): number {
    const off = addr < 0xd000 ? addr - 0xc000 : bank * 0x1000 + (addr - 0xd000);
    return this.m.HEAPU8[this.m._emulator_get_wram_ptr(this.e) + off];
  }

  /**
   * Runs one of the harness's own changes to the game (KIND_TOP_UP, KIND_BURY in replay.ts) and
   * records it by name — when it changed anything — instead of as raw writes, so a recording says
   * exactly what the harness did and playback re-does it with the same code.
   */
  intervene<T>(kind: InterventionKind, a: number, fn: () => T): T {
    if (!this.recorder) return fn();
    const ticks = this.ticks;
    this.intervening = { changed: false };
    try {
      return fn();
    } finally {
      if (this.intervening.changed) this.recorder.intervention(ticks, kind, a);
      this.intervening = null;
    }
  }

  write8(addr: number, value: number): void {
    // No-op writes (e.g. topping up a full stack of balls every frame) don't need logging.
    if (this.intervening) {
      if (this.read8(addr) !== (value & 0xff)) this.intervening.changed = true;
    } else if (this.recorder && this.read8(addr) !== (value & 0xff)) this.recorder.write(this.ticks, addr, value & 0xff);
    this.m._emulator_write_mem(this.e, addr, value & 0xff);
  }

  /** The loaded ROM as the emulator runs it (binjgb reads the cartridge from this buffer). */
  romBytes(): Uint8Array {
    return this.heap(this.romPtr, this.romSize);
  }

  /**
   * Changes one byte of the loaded ROM (the hard level caps option: src/games/gen1/hard-caps.ts).
   * Inside intervene() it's recorded by name like the harness's RAM changes.
   */
  writeRom(offset: number, value: number): void {
    const rom = this.romBytes();
    if (this.intervening && rom[offset] !== (value & 0xff)) this.intervening.changed = true;
    rom[offset] = value & 0xff;
  }

  read16be(addr: number): number {
    return (this.read8(addr) << 8) | this.read8(addr + 1);
  }

  readBytes(addr: number, len: number): Uint8Array {
    const out = new Uint8Array(len);
    for (let i = 0; i < len; i++) out[i] = this.read8(addr + i);
    return out;
  }

  // ---- Save data ----

  private withFileData<T>(fileDataPtr: number, cb: (ptr: number, buf: Uint8Array) => T): T {
    const buf = this.heap(this.m._get_file_data_ptr(fileDataPtr), this.m._get_file_data_size(fileDataPtr));
    try {
      return cb(fileDataPtr, buf);
    } finally {
      this.m._file_data_delete(fileDataPtr);
    }
  }

  getExtRam(): Uint8Array {
    return this.withFileData(this.m._ext_ram_file_data_new(this.e), (ptr, buf) => {
      this.m._emulator_write_ext_ram(this.e, ptr);
      return new Uint8Array(buf);
    });
  }

  loadExtRam(data: Uint8Array): void {
    if (this.intervening) this.intervening.changed = true;
    this.withFileData(this.m._ext_ram_file_data_new(this.e), (ptr, buf) => {
      if (buf.byteLength === data.byteLength) {
        buf.set(data);
        this.m._emulator_read_ext_ram(this.e, ptr);
      }
    });
  }

  /**
   * One state buffer for the emulator's lifetime: in this binjgb build, freeing a
   * state FileData doesn't give its ~200 KB back, so allocating one per save (every
   * 15 s) filled the 16 MB heap in ~20 minutes and every save after that failed.
   */
  private stateFd = 0;
  private stateBuffer(): { ptr: number; buf: Uint8Array } {
    if (!this.stateFd) this.stateFd = this.m._state_file_data_new(this.e);
    const ptr = this.stateFd;
    return { ptr, buf: this.heap(this.m._get_file_data_ptr(ptr), this.m._get_file_data_size(ptr)) };
  }

  saveState(): Uint8Array {
    this.trimJoypadLog();
    const { ptr, buf } = this.stateBuffer();
    this.m._emulator_write_state(this.e, ptr);
    return new Uint8Array(buf);
  }

  /**
   * binjgb's default joypad callback appends every button change to a buffer kept
   * for its own rewind, which we don't use — ~16 bytes a change, never freed. A
   * long session (the AI presses a lot) fills the fixed 16 MB heap and saveState
   * aborts with OOM. Swap in a fresh buffer; the button states carry over.
   */
  private trimJoypadLog(): void {
    const fresh = this.m._joypad_new();
    this.m._emulator_set_default_joypad_callback(this.e, fresh);
    this.m._joypad_delete(this.joypadPtr);
    this.joypadPtr = fresh;
  }

  loadState(data: Uint8Array): boolean {
    const { ptr, buf } = this.stateBuffer();
    if (buf.byteLength !== data.byteLength) return false;
    buf.set(data);
    const ok = this.m._emulator_read_state(this.e, ptr) === 0;
    if (ok) this.recorder?.state(data);
    return ok;
  }

  /** Runs to exactly CPU tick `ticks` (replay playback). Doesn't draw. */
  runTo(ticks: number): void {
    this.runUntil(ticks, this.speed === 1);
  }

  /** Puts the latest emulated frame on the canvas. */
  draw(): void {
    this.ctx2d.putImageData(this.imageData, 0, 0);
  }

  // ---- Main loop ----

  private runUntil(ticks: number, playAudio: boolean): void {
    for (;;) {
      const event = this.m._emulator_run_until_f64(this.e, ticks);
      if (event & EVENT_NEW_FRAME) this.imageData.data.set(this.frameBuffer);
      if (event & EVENT_AUDIO_BUFFER_FULL && playAudio) this.pushAudio();
      if (event & EVENT_UNTIL_TICKS) break;
    }
    if (this.m._emulator_was_ext_ram_updated(this.e)) this.extRamDirty = true;
  }

  /**
   * Runs exactly `frames` emulated frames (used by AI control). Advances a few
   * frames per animation frame so a human can watch; runs all at once when
   * the tab is hidden (rAF doesn't fire there) or nobody watches (headless, not watched).
   */
  async runFrames(frames: number, perAnimFrame = 4): Promise<void> {
    let left = Math.max(0, Math.floor(frames));
    while (left > 0) {
      if (FAST_WATCH && !document.hidden) {
        // As many frames as fit in most of a screen refresh, then draw one: full speed, still watchable.
        const until = performance.now() + 12;
        do {
          this.stepFrame();
          left--;
        } while (left > 0 && performance.now() < until);
      } else {
        const n = document.hidden || !PACED ? left : Math.min(left, perAnimFrame);
        for (let i = 0; i < n; i++) this.stepFrame();
        left -= n;
      }
      this.ctx2d.putImageData(this.imageData, 0, 0);
      this.opts.onFrame?.();
      if (left > 0) await new Promise((r) => requestAnimationFrame(r));
    }
  }

  /**
   * Runs to the next frame boundary (start of VBlank), so callers always
   * observe the machine at the same point — VRAM is readable there. If the
   * LCD is off no frame event fires; one frame's worth of ticks counts instead.
   */
  private stepFrame(): void {
    const target = this.ticks + TICKS_PER_FRAME;
    for (;;) {
      // Audio-buffer events also return early; keep going until a frame or the deadline.
      const event = this.m._emulator_run_until_f64(this.e, target);
      // Keep sound playing while an AI drives the game frame by frame.
      if (event & EVENT_AUDIO_BUFFER_FULL) this.pushAudio();
      if (event & EVENT_NEW_FRAME) {
        this.imageData.data.set(this.frameBuffer);
        break;
      }
      if (event & EVENT_UNTIL_TICKS) break;
    }
    if (this.m._emulator_was_ext_ram_updated(this.e)) this.extRamDirty = true;
  }

  /** While true the real-time loop stops advancing; runFrames() drives the game. */
  externalControl = false;

  private tick = (nowMs: number): void => {
    this.raf = requestAnimationFrame(this.tick);
    if (this.paused || this.externalControl) {
      this.lastRafSec = 0;
      return;
    }
    const nowSec = nowMs / 1000;
    const deltaSec = Math.max(nowSec - (this.lastRafSec || nowSec), 0);
    this.lastRafSec = nowSec;
    const deltaTicks = Math.min(deltaSec, MAX_UPDATE_SEC) * CPU_TICKS_PER_SECOND * this.speed;
    const until = this.ticks + deltaTicks - this.leftoverTicks;
    // While recording, only stop at frame boundaries: a replay can stop on those exactly,
    // but not always on the arbitrary tick a time-based stop lands on (inputs would drift).
    if (this.recorder) while (this.ticks < until) this.stepFrame();
    else this.runUntil(until, this.speed === 1);
    this.leftoverTicks = (this.ticks - until) | 0;
    this.ctx2d.putImageData(this.imageData, 0, 0);
    this.opts.onFrame?.();
  };

  private pushAudio(): void {
    if (this.audioCtx.state !== "running" || this.volume <= 0) return;
    const now = this.audioCtx.currentTime;
    this.audioStartSec ||= now + AUDIO_LATENCY_SEC;
    if (this.audioStartSec < now) {
      this.audioStartSec = now + AUDIO_LATENCY_SEC;
      return;
    }
    // Running faster than real time (AI stepping): drop audio rather than queue ever-growing lag.
    if (this.audioStartSec - now > AUDIO_LATENCY_SEC * 3) return;
    const buffer = this.audioCtx.createBuffer(2, AUDIO_FRAMES, this.audioCtx.sampleRate);
    const c0 = buffer.getChannelData(0);
    const c1 = buffer.getChannelData(1);
    const vol = this.volume / 255;
    const samples = this.audioBuffer;
    for (let i = 0; i < AUDIO_FRAMES; i++) {
      c0[i] = samples[2 * i] * vol;
      c1[i] = samples[2 * i + 1] * vol;
    }
    const src = this.audioCtx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.audioCtx.destination);
    src.start(this.audioStartSec);
    this.audioStartSec += AUDIO_FRAMES / this.audioCtx.sampleRate;
  }
}
