// Reads the JSON files the app mirrors to saves/ (typed arrays stored as {"$ta", "b64"}),
// the same encoding as storage.ts.

import { readFileSync } from "node:fs";

const TYPED = { Uint8Array, Uint16Array, Uint32Array, Int8Array, Int16Array, Int32Array, Float32Array, Float64Array } as const;

export function readSaveFile<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8"), (_k, v) => {
    if (v && typeof v === "object" && typeof v.$ta === "string" && typeof v.b64 === "string" && v.$ta in TYPED) {
      const bytes = Buffer.from(v.b64, "base64");
      const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      return new TYPED[v.$ta as keyof typeof TYPED](ab);
    }
    return v;
  }) as T;
}
