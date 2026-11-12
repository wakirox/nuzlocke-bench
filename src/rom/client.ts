import type { ReadRomResult } from "./types";

/** Reads a clean Gen 1 ROM for a run (in a worker): the game as given, and the tracker's data. */
export function readRom(rom: Uint8Array, onProgress: (stage: string) => void): Promise<ReadRomResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (ev) => {
      const msg = ev.data;
      if (msg.type === "progress") {
        onProgress(msg.stage);
      } else if (msg.type === "done") {
        worker.terminate();
        resolve(msg.result as ReadRomResult);
      } else if (msg.type === "error") {
        worker.terminate();
        if (msg.stack) console.error(msg.stack);
        reject(new Error(msg.message));
      }
    };
    worker.onerror = (ev) => {
      worker.terminate();
      reject(new Error(ev.message || "ROM reader worker crashed"));
    };
    const copy = rom.slice().buffer;
    worker.postMessage({ type: "read", rom: copy, baseUrl: document.baseURI }, [copy]);
  });
}
