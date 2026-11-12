// ROMs in saves by reference: the page saves the ROM inside several records (the run, its base
// ROM, each replay), 1–2 MB each time. On disk a copy that matches a known ROM file byte for byte
// is kept as {"$romRef": "<sha256>"} and put back from the file when read. Anything else (a ROM
// no file matches) stays as it was.

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

/** Typed arrays this big or bigger are checked against the known ROMs (a Game Boy ROM is 512 KB+). */
const MIN_ROM_BYTES = 256 * 1024;

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/**
 * The ROM files a run can use, by SHA-256: `rom` (the run's --rom) and the other .gb/.gbc files in
 * its folder and in `dirs`. Each entry holds the file's base64, as the saves store it.
 */
export function knownRoms({ rom, dirs = [] } = {}) {
  const files = new Set();
  for (const d of [...(rom ? [dirname(rom)] : []), ...dirs]) {
    if (!d || !existsSync(d) || !statSync(d).isDirectory()) continue;
    for (const f of readdirSync(d)) if (/\.gbc?$/i.test(f)) files.add(join(d, f));
  }
  if (rom && existsSync(rom)) files.add(rom);
  const out = new Map();
  for (const f of files) {
    const bytes = readFileSync(f);
    out.set(sha256(bytes), { file: f, b64: bytes.toString("base64") });
  }
  return out;
}

/** A save's JSON with every known ROM swapped for a reference. */
export function stripRoms(value, roms) {
  if (Array.isArray(value)) return value.map((v) => stripRoms(v, roms));
  if (!value || typeof value !== "object") return value;
  if (value.$ta === "Uint8Array" && typeof value.b64 === "string" && value.b64.length * 0.75 >= MIN_ROM_BYTES) {
    // The page autosaves often: compare the base64 text with each known ROM's instead of hashing.
    for (const [hash, rom] of roms) if (rom.b64 === value.b64) return { $romRef: hash };
  }
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = stripRoms(v, roms);
  return out;
}

/** A save's JSON with every reference swapped back for its ROM; throws when no file has it. */
export function restoreRoms(value, roms) {
  if (Array.isArray(value)) return value.map((v) => restoreRoms(v, roms));
  if (!value || typeof value !== "object") return value;
  if (typeof value.$romRef === "string") {
    const rom = roms.get(value.$romRef);
    if (!rom) throw new Error(`A save needs a ROM no file here matches (SHA-256 ${value.$romRef}): pass its folder (--roms).`);
    return { $ta: "Uint8Array", b64: rom.b64 };
  }
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = restoreRoms(v, roms);
  return out;
}
