// SPDX-License-Identifier: GPL-3.0-or-later
// Part of "randomize.sh" (https://github.com/justinelijahtaylor/randomizer)
// A web fork of Universal Pokemon Randomizer ZX. Licensed under GPLv3-or-later.
// See LICENSE.txt for the full license text.

/**
 * Browser shim for Node's `path` module (POSIX-style).
 * Minimal subset used by ts-src.
 */

const sep = "/";

function normalizeArray(parts: string[], allowAboveRoot: boolean): string[] {
  const res: string[] = [];
  for (const p of parts) {
    if (!p || p === ".") continue;
    if (p === "..") {
      if (res.length && res[res.length - 1] !== "..") res.pop();
      else if (allowAboveRoot) res.push("..");
    } else {
      res.push(p);
    }
  }
  return res;
}

export function resolve(...paths: string[]): string {
  let resolved = "";
  let absolute = false;
  for (let i = paths.length - 1; i >= 0 && !absolute; i--) {
    const p = paths[i];
    if (!p) continue;
    resolved = p + "/" + resolved;
    absolute = p.charAt(0) === "/";
  }
  if (!absolute) resolved = "/" + resolved;
  const parts = resolved.split("/");
  const normalized = normalizeArray(parts, false);
  return "/" + normalized.join("/");
}

export function join(...paths: string[]): string {
  if (paths.length === 0) return ".";
  const joined = paths.filter(Boolean).join("/");
  return normalize(joined);
}

export function normalize(p: string): string {
  if (!p) return ".";
  const isAbsolute = p.charAt(0) === "/";
  const trailing = p.length > 1 && p.charAt(p.length - 1) === "/";
  const parts = p.split("/");
  const normalized = normalizeArray(parts, !isAbsolute);
  let out = normalized.join("/");
  if (!out && !isAbsolute) out = ".";
  if (out && trailing) out += "/";
  return (isAbsolute ? "/" : "") + out;
}

export function dirname(p: string): string {
  if (!p) return ".";
  const idx = p.lastIndexOf("/");
  if (idx < 0) return ".";
  if (idx === 0) return "/";
  return p.slice(0, idx);
}

export function basename(p: string, ext?: string): string {
  const idx = p.lastIndexOf("/");
  let base = idx >= 0 ? p.slice(idx + 1) : p;
  if (ext && base.endsWith(ext)) base = base.slice(0, base.length - ext.length);
  return base;
}

export function extname(p: string): string {
  const idx = p.lastIndexOf(".");
  const slash = p.lastIndexOf("/");
  if (idx < 0 || idx < slash) return "";
  return p.slice(idx);
}

export function isAbsolute(p: string): boolean {
  return p.charAt(0) === "/";
}

export function relative(from: string, to: string): string {
  // Not a perfect implementation but adequate for our needs.
  const f = resolve(from).split("/").filter(Boolean);
  const t = resolve(to).split("/").filter(Boolean);
  let i = 0;
  while (i < f.length && i < t.length && f[i] === t[i]) i++;
  const up = f.slice(i).map(() => "..");
  const down = t.slice(i);
  return [...up, ...down].join("/") || ".";
}

export { sep };

const defaultExport = {
  resolve,
  join,
  normalize,
  dirname,
  basename,
  extname,
  isAbsolute,
  relative,
  sep,
};

export default defaultExport;
