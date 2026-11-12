/*----------------------------------------------------------------------------*/
/*--  unicode-parser.ts - maintains the poke<->unicode text table            --*/
/*--  Code loosely derived from "thenewpoketext", copyright (C) loadingNOW   --*/
/*--  Ported to TypeScript                                                   --*/
/*----------------------------------------------------------------------------*/

import { FileFunctions } from "../utils/file-functions";

/**
 * Forward table: pokeChar code -> unicode string.
 * Indexed by 16-bit character code.
 */
export const tb: (string | null)[] = new Array<string | null>(65536).fill(null);

/**
 * Reverse table: unicode string -> pokeChar code.
 */
export const d: Map<string, number> = new Map();

let initialized = false;

export function ensureInitialized(): void {
  if (initialized) return;
  initialized = true;

  try {
    const buf = FileFunctions.openConfig("Generation4.tbl");
    const text = buf.toString("utf-8");
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
      const q = line;
      if (q.trim().length === 0) continue;
      const eqIdx = q.indexOf("=");
      if (eqIdx < 0) continue;
      const key = q.substring(0, eqIdx);
      let val = q.substring(eqIdx + 1);
      if (val.endsWith("\r\n")) {
        val = val.substring(0, val.length - 2);
      }
      const code = parseInt(key, 16);
      tb[code] = val;
      d.set(val, code);
    }
  } catch {
    // Config file not available - tables remain empty
  }
}

/**
 * Initialize the tables from an explicit map (useful for testing).
 */
export function initFromMap(entries: Map<number, string>): void {
  // Clear existing
  for (let i = 0; i < 65536; i++) {
    tb[i] = null;
  }
  d.clear();
  initialized = true;

  for (const [code, str] of entries) {
    tb[code] = str;
    d.set(str, code);
  }
}
