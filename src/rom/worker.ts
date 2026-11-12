// SPDX-License-Identifier: GPL-3.0-or-later
// Reads the ROM (reader.ts) off the main thread: the vendored engine is large, and the page
// only needs it once per run.
//
// main -> worker: { type: "read", rom, baseUrl }
// worker -> main: { type: "progress", stage } | { type: "done", result } | { type: "error", message }

import { readRom } from "./reader";

function post(msg: unknown, transfer: Transferable[] = []) {
  (self as unknown as Worker).postMessage(msg, transfer);
}

self.onmessage = async (ev: MessageEvent<{ type: "read"; rom: ArrayBuffer; baseUrl: string }>) => {
  const { baseUrl } = ev.data;
  const loadFile = async (path: string) => {
    const url = new URL(path, baseUrl).href;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  };
  try {
    const result = await readRom(ev.data.rom, loadFile, (stage) => post({ type: "progress", stage }));
    post({ type: "done", result }, [result.rom.buffer]);
  } catch (e) {
    const err = e as Error;
    post({ type: "error", message: err?.message ?? String(e), stack: err?.stack });
  }
};
