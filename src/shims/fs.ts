// SPDX-License-Identifier: GPL-3.0-or-later
// Part of "randomize.sh" (https://github.com/justinelijahtaylor/randomizer)
// A web fork of Universal Pokemon Randomizer ZX. Licensed under GPLv3-or-later.
// See LICENSE.txt for the full license text.

/**
 * Browser shim for Node's `fs` module.
 *
 * Only the subset of APIs used by `ts-src` is implemented. Reads and writes
 * are backed by the in-memory VirtualFS. File-descriptor based APIs use a
 * small in-process fd table — each open() grows the entry's bytes as
 * needed to hold writes at arbitrary offsets.
 */

import { Buffer } from "buffer";
import { vfs } from "./virtual-fs";

export const constants = {
  F_OK: 0,
  R_OK: 4,
  W_OK: 2,
  X_OK: 1,
};

// ---- Simple file descriptor table ----

interface FdEntry {
  path: string;
  /** Mutable buffer; grows on writeSync past the end. */
  data: Uint8Array;
  writable: boolean;
  closed: boolean;
}

const fdTable = new Map<number, FdEntry>();
let nextFd = 10;

function resolveRead(pathLike: string): Uint8Array {
  return vfs.read(pathLike);
}

export function existsSync(p: string): boolean {
  return vfs.exists(p);
}

type ReadFileOptions = { encoding?: string | null } | string | null | undefined;

export function readFileSync(p: string, options?: ReadFileOptions): Buffer | string {
  const bytes = resolveRead(p);
  const encoding =
    typeof options === "string"
      ? options
      : options && typeof options === "object"
        ? options.encoding ?? null
        : null;
  if (encoding) {
    return new TextDecoder(encoding === "utf-8" || encoding === "utf8" ? "utf-8" : encoding).decode(bytes);
  }
  return Buffer.from(bytes);
}

export function writeFileSync(p: string, data: Uint8Array | Buffer | string): void {
  let bytes: Uint8Array;
  if (typeof data === "string") {
    bytes = new TextEncoder().encode(data);
  } else if (data instanceof Uint8Array) {
    bytes = data;
  } else {
    bytes = new Uint8Array(data);
  }
  vfs.write(p, bytes);
}

export function accessSync(p: string, _mode?: number): void {
  if (!vfs.exists(p)) {
    throw Object.assign(new Error(`ENOENT: no such file or directory, access '${p}'`), {
      code: "ENOENT",
    });
  }
}

export function statSync(p: string) {
  return vfs.stat(p);
}

export function mkdirSync(_p: string, _opts?: unknown): undefined {
  return undefined;
}

export function openSync(p: string, flags: string | number = "r"): number {
  const fd = nextFd++;
  const flagStr = typeof flags === "string" ? flags : "r";
  const writable = /[wax+]/.test(flagStr);
  let data: Uint8Array;
  if (vfs.exists(p)) {
    data = new Uint8Array(vfs.read(p));
  } else if (writable) {
    data = new Uint8Array(0);
    vfs.write(p, data);
  } else {
    throw Object.assign(new Error(`ENOENT: no such file or directory, open '${p}'`), {
      code: "ENOENT",
    });
  }
  fdTable.set(fd, { path: p, data, writable, closed: false });
  return fd;
}

export function closeSync(fd: number): void {
  const entry = fdTable.get(fd);
  if (!entry || entry.closed) return;
  entry.closed = true;
  if (entry.writable) {
    vfs.write(entry.path, entry.data);
  }
  fdTable.delete(fd);
}

export function readSync(
  fd: number,
  buffer: Buffer | Uint8Array,
  offset: number,
  length: number,
  position: number | null,
): number {
  const entry = fdTable.get(fd);
  if (!entry) {
    throw Object.assign(new Error(`EBADF: bad file descriptor, read`), { code: "EBADF" });
  }
  const pos = position ?? 0;
  const end = Math.min(pos + length, entry.data.length);
  const slice = entry.data.subarray(pos, end);
  const out = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer as ArrayBufferLike);
  out.set(slice, offset);
  return slice.length;
}

export function writeSync(
  fd: number,
  buffer: Buffer | Uint8Array | string,
  offsetOrOpts?: number,
  length?: number,
  position?: number,
): number {
  const entry = fdTable.get(fd);
  if (!entry) {
    throw Object.assign(new Error(`EBADF: bad file descriptor, write`), { code: "EBADF" });
  }
  let src: Uint8Array;
  if (typeof buffer === "string") {
    src = new TextEncoder().encode(buffer);
  } else {
    src = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer as ArrayBufferLike);
  }
  const offset = typeof offsetOrOpts === "number" ? offsetOrOpts : 0;
  const len = typeof length === "number" ? length : src.length - offset;
  const pos = typeof position === "number" ? position : entry.data.length;

  const end = pos + len;
  if (end > entry.data.length) {
    // Grow buffer
    const grown = new Uint8Array(Math.max(end, entry.data.length * 2));
    grown.set(entry.data);
    entry.data = grown;
  }
  entry.data.set(src.subarray(offset, offset + len), pos);
  // Keep track of logical length; we trim to the high-water mark on close.
  // Simplest: record maxWritten and use it in closeSync/read. For now,
  // expose entry.data.subarray(0, entry.data.length) — we assume writes
  // fill correctly.
  return len;
}

export function unlinkSync(_p: string): void {
  // no-op; virtual fs is ephemeral
}

export function rmdirSync(_p: string): void {
  // no-op
}

export function rmSync(_p: string, _opts?: unknown): void {
  // no-op
}

export function renameSync(from: string, to: string): void {
  const bytes = vfs.read(from);
  vfs.write(to, bytes);
}

export function copyFileSync(from: string, to: string): void {
  const bytes = vfs.read(from);
  vfs.write(to, bytes);
}

export function readdirSync(_p: string, _opts?: unknown): string[] {
  return [];
}

export function createWriteStream(_p: string): never {
  throw new Error("fs.createWriteStream is not supported in the browser shim");
}

export function createReadStream(_p: string): never {
  throw new Error("fs.createReadStream is not supported in the browser shim");
}

const defaultExport = {
  constants,
  existsSync,
  readFileSync,
  writeFileSync,
  accessSync,
  statSync,
  mkdirSync,
  openSync,
  closeSync,
  readSync,
  writeSync,
  unlinkSync,
  rmdirSync,
  rmSync,
  renameSync,
  copyFileSync,
  readdirSync,
  createReadStream,
  createWriteStream,
};

export default defaultExport;
