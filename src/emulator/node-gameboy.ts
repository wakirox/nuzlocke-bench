// The app's emulator core (binjgb, public/binjgb) without a page: for tests and the run
// verifier, which play real frames in Node. Offers the parts of the app's GameBoy class that
// ReplayPlayer, the RAM readers and the harness's interventions use, with the same semantics.
// The core's files are handed in (no file access here): see tests/harness/node-gameboy.ts.

import type { Button, GameBoy } from "./gameboy";
import type { MemoryReader } from "../games/types";

/** binjgb.js (its text) and binjgb.wasm. */
export interface CoreFiles {
  js: string;
  wasm: Uint8Array;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Core = any;

export const TICKS_PER_FRAME = 70224;
const EVENT_NEW_FRAME = 1;
const EVENT_UNTIL_TICKS = 4;

const factories = new WeakMap<CoreFiles, (o: object) => Promise<Core>>();

/**
 * A fresh core instance. binjgb.js is a browser build; given the wasm bytes up front it never
 * needs fetch or the DOM. Like the app (gameboy.ts loadCore), every emulator gets its own
 * instance: binjgb isn't safe with two emulators in one wasm heap, nor after one is deleted.
 */
function loadCore(files: CoreFiles): Promise<Core> {
  let factory = factories.get(files);
  if (!factory) {
    factory = new Function(`${files.js}\nreturn Binjgb;`)() as (o: object) => Promise<Core>;
    factories.set(files, factory);
  }
  // binjgb prints the cartridge header on load; keep output clean.
  return factory({ wasmBinary: files.wasm, print: () => {}, printErr: () => {} });
}

const JOYPAD: Record<Button, string> = {
  up: "_set_joyp_up", down: "_set_joyp_down", left: "_set_joyp_left", right: "_set_joyp_right",
  a: "_set_joyp_A", b: "_set_joyp_B", start: "_set_joyp_start", select: "_set_joyp_select",
};

export class NodeGameBoy implements MemoryReader {
  private constructor(private m: Core, private e: number, private joypad: number, private romPtr: number, private romSize: number) {}

  static async create(rom: Uint8Array, core: CoreFiles): Promise<NodeGameBoy> {
    const m = await loadCore(core);
    const size = (rom.byteLength + 0x7fff) & ~0x7fff;
    const romPtr = m._malloc(size);
    new Uint8Array(m.HEAP8.buffer, romPtr, size).fill(0).set(rom);
    const e = m._emulator_new_simple(romPtr, size, 44100, 4096, 2);
    if (!e) throw new Error("The emulator rejected this ROM.");
    const joypad = m._joypad_new();
    m._emulator_set_default_joypad_callback(e, joypad);
    return new NodeGameBoy(m, e, joypad, romPtr, size);
  }

  /** Lets go of the emulator (its core instance goes with it). */
  destroy(): void {
    this.m = null;
  }

  get pc(): number {
    return this.m._emulator_get_PC(this.e);
  }

  get ticks(): number {
    return this.m._emulator_get_ticks_f64(this.e);
  }

  read8(addr: number): number {
    return this.m._emulator_read_mem(this.e, addr) & 0xff;
  }

  /** One byte of work-RAM bank `bank` at CPU address `addr` ($C000-$DFFF), whichever bank is switched in. */
  readWram(bank: number, addr: number): number {
    const off = addr < 0xd000 ? addr - 0xc000 : bank * 0x1000 + (addr - 0xd000);
    return this.m.HEAPU8[this.m._emulator_get_wram_ptr(this.e) + off];
  }

  read16be(addr: number): number {
    return (this.read8(addr) << 8) | this.read8(addr + 1);
  }

  readBytes(addr: number, len: number): Uint8Array {
    const out = new Uint8Array(len);
    for (let i = 0; i < len; i++) out[i] = this.read8(addr + i);
    return out;
  }

  write8(addr: number, value: number): void {
    this.m._emulator_write_mem(this.e, addr, value & 0xff);
  }

  /** The loaded ROM as the emulator runs it (binjgb reads the cartridge from this buffer). */
  romBytes(): Uint8Array {
    return new Uint8Array(this.m.HEAP8.buffer, this.romPtr, this.romSize);
  }

  /** Changes one byte of the loaded ROM (the hard level caps option: src/games/gen1/hard-caps.ts). */
  writeRom(offset: number, value: number): void {
    this.romBytes()[offset] = value & 0xff;
  }

  setButton(button: Button, pressed: boolean): void {
    this.m[JOYPAD[button]](this.e, pressed ? 1 : 0);
  }

  /** Runs to exactly CPU tick `ticks`. */
  runTo(ticks: number): void {
    while (!(this.m._emulator_run_until_f64(this.e, ticks) & EVENT_UNTIL_TICKS)) {
      /* frame / audio events: keep going */
    }
  }

  /** Runs to the next frame boundary, as the app's AI stepping does. */
  stepFrame(): void {
    const target = this.ticks + TICKS_PER_FRAME;
    for (;;) {
      const ev = this.m._emulator_run_until_f64(this.e, target);
      if (ev & (EVENT_NEW_FRAME | EVENT_UNTIL_TICKS)) break;
    }
  }

  draw(): void {
    /* nothing to draw on */
  }

  private stateFd = 0;
  private stateBuffer(): { ptr: number; buf: Uint8Array } {
    if (!this.stateFd) this.stateFd = this.m._state_file_data_new(this.e);
    const ptr = this.stateFd;
    return { ptr, buf: new Uint8Array(this.m.HEAP8.buffer, this.m._get_file_data_ptr(ptr), this.m._get_file_data_size(ptr)) };
  }

  saveState(): Uint8Array {
    // Same as the app: swap the ever-growing joypad log for a fresh one first.
    const fresh = this.m._joypad_new();
    this.m._emulator_set_default_joypad_callback(this.e, fresh);
    this.m._joypad_delete(this.joypad);
    this.joypad = fresh;
    const { ptr, buf } = this.stateBuffer();
    this.m._emulator_write_state(this.e, ptr);
    return new Uint8Array(buf);
  }

  loadState(data: Uint8Array): boolean {
    const { ptr, buf } = this.stateBuffer();
    if (buf.byteLength !== data.byteLength) return false;
    buf.set(data);
    return this.m._emulator_read_state(this.e, ptr) === 0;
  }

  getExtRam(): Uint8Array {
    return this.withFileData(this.m._ext_ram_file_data_new(this.e), (ptr, buf) => {
      this.m._emulator_write_ext_ram(this.e, ptr);
      return new Uint8Array(buf);
    });
  }

  loadExtRam(data: Uint8Array): void {
    this.withFileData(this.m._ext_ram_file_data_new(this.e), (ptr, buf) => {
      if (buf.byteLength === data.byteLength) {
        buf.set(data);
        this.m._emulator_read_ext_ram(this.e, ptr);
      }
    });
  }

  private withFileData<T>(fd: number, cb: (ptr: number, buf: Uint8Array) => T): T {
    const buf = new Uint8Array(this.m.HEAP8.buffer, this.m._get_file_data_ptr(fd), this.m._get_file_data_size(fd));
    try {
      return cb(fd, buf);
    } finally {
      this.m._file_data_delete(fd);
    }
  }

  /** For APIs typed against the app's GameBoy (ReplayPlayer): this offers the members they use. */
  asGameBoy(): GameBoy {
    return this as unknown as GameBoy;
  }
}
