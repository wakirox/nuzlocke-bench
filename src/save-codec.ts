// JSON serialization for save files with typed arrays encoded as {"$ta": "<TypedArray>", "b64": "..."}.
// Shared by browser storage (src/storage.ts) and Node snapshot tools (scripts/snapshot-run.mjs).

const TYPED = {
  Uint8Array,
  Uint16Array,
  Uint32Array,
  Int8Array,
  Int16Array,
  Int32Array,
  Float32Array,
  Float64Array,
} as const;

type TypedName = keyof typeof TYPED;

/** JSON.stringify replacer turning typed arrays into `{$ta, b64}` objects. */
export function replaceSave(_key: string, value: unknown): unknown {
  if (ArrayBuffer.isView(value) && value.constructor.name in TYPED) {
    const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return { $ta: value.constructor.name, b64: btoa(binary) };
  }
  return value;
}

/** JSON.parse reviver turning `{$ta, b64}` objects back into typed arrays on an owned ArrayBuffer. */
export function reviveSave(_key: string, value: unknown): unknown {
  const tagged = value as { $ta?: string; b64?: string } | null;
  if (tagged && typeof tagged === "object" && typeof tagged.$ta === "string" && typeof tagged.b64 === "string" && tagged.$ta in TYPED) {
    const bin = atob(tagged.b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TYPED[tagged.$ta as TypedName](bytes.buffer);
  }
  return value;
}

/** Encodes `value` as JSON with typed arrays in `{$ta, b64}` form. */
export function encodeSave(value: unknown): string {
  return JSON.stringify(value, replaceSave);
}

/** Decodes a JSON string written by `encodeSave`. */
export function decodeSave<T = unknown>(text: string): T {
  return JSON.parse(text, reviveSave) as T;
}
