// SPDX-License-Identifier: GPL-3.0-or-later
// Part of "randomize.sh" (https://github.com/justinelijahtaylor/randomizer)
// A web fork of Universal Pokemon Randomizer ZX. Licensed under GPLv3-or-later.
// See LICENSE.txt for the full license text.

/**
 * In-memory virtual filesystem backing our browser `fs` shim.
 *
 * The ts-src engine code is heavily path-based (fs.readFileSync, etc.).
 * Rather than rewrite every call site, we intercept `fs` and serve reads
 * from a registered map of paths -> bytes.
 *
 * Paths are normalized by stripping any leading `file://`, collapsing `\`
 * to `/`, removing `./`, and resolving `..` segments. We also match by
 * trailing path segment so code that resolves to absolute paths
 * (e.g. `/some/other/dir/config/gen4_offsets.ini`) still hits the entry
 * registered under `config/gen4_offsets.ini`.
 */

export function normalizePath(p: string): string {
  if (!p) return "";
  let s = p.replace(/^file:\/\//, "").replace(/\\/g, "/");
  // Collapse //
  s = s.replace(/\/+/g, "/");
  // Resolve segments
  const parts = s.split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (part === "" || part === ".") {
      // preserve leading empty for absolute
      if (out.length === 0 && part === "") out.push("");
      continue;
    }
    if (part === "..") {
      if (out.length > 1) out.pop();
      continue;
    }
    out.push(part);
  }
  return out.join("/") || "/";
}

class VirtualFS {
  private files = new Map<string, Uint8Array>();
  // Secondary index: any trailing segment path (including bare filename)
  // -> absolute-ish key. Lets callers find files without knowing the exact
  // path the shim resolved to.
  private tails = new Map<string, string>();

  register(key: string, data: Uint8Array): void {
    const norm = normalizePath(key);
    this.files.set(norm, data);
    // Derive all trailing segments so callers can look up by any suffix
    // (e.g. "gen3_offsets.ini", "config/gen3_offsets.ini", etc.)
    const parts = norm.split("/").filter(Boolean);
    for (let i = 0; i < parts.length; i++) {
      const tail = parts.slice(i).join("/");
      // Only claim a tail if no existing registration already does; first
      // writer wins (bootstrap order is deterministic)
      if (!this.tails.has(tail)) this.tails.set(tail, norm);
    }
  }

  read(key: string): Uint8Array {
    const norm = normalizePath(key);
    const direct = this.files.get(norm);
    if (direct) return direct;
    // Try tail match longest-first
    const parts = norm.split("/").filter(Boolean);
    for (let i = 0; i < parts.length; i++) {
      const tail = parts.slice(i).join("/");
      const resolved = this.tails.get(tail);
      if (resolved) {
        const hit = this.files.get(resolved);
        if (hit) return hit;
      }
    }
    // Last resort: match by bare filename anywhere in the VFS
    const bare = parts[parts.length - 1];
    if (bare) {
      const resolved = this.tails.get(bare);
      if (resolved) {
        const hit = this.files.get(resolved);
        if (hit) return hit;
      }
    }
    throw Object.assign(new Error(`ENOENT: no such file or directory, open '${key}'`), {
      code: "ENOENT",
      errno: -2,
      syscall: "open",
      path: key,
    });
  }

  delete(key: string): void {
    const norm = normalizePath(key);
    this.files.delete(norm);
    for (const [tail, target] of this.tails) {
      if (target === norm) this.tails.delete(tail);
    }
  }

  write(key: string, data: Uint8Array): void {
    this.register(key, data);
  }

  exists(key: string): boolean {
    try {
      this.read(key);
      return true;
    } catch {
      return false;
    }
  }

  stat(key: string): { isFile(): boolean; isDirectory(): boolean; size: number } {
    const data = this.read(key);
    return {
      isFile: () => true,
      isDirectory: () => false,
      size: data.byteLength,
    };
  }

  list(): string[] {
    return [...this.files.keys()];
  }

  clear(): void {
    this.files.clear();
    this.tails.clear();
  }
}

// Singleton instance. Both the shim and the bootstrap code touch this.
export const vfs = new VirtualFS();
