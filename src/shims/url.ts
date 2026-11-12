// SPDX-License-Identifier: GPL-3.0-or-later
// Part of "randomize.sh" (https://github.com/justinelijahtaylor/randomizer)
// A web fork of Universal Pokemon Randomizer ZX. Licensed under GPLv3-or-later.
// See LICENSE.txt for the full license text.

/**
 * Browser shim for Node's `url` module.
 * Only `fileURLToPath` is used by ts-src.
 */

export function fileURLToPath(url: string | URL): string {
  const s = typeof url === "string" ? url : url.toString();
  return s.replace(/^file:\/\//, "");
}

export function pathToFileURL(p: string): URL {
  return new URL("file://" + p);
}

const defaultExport = { fileURLToPath, pathToFileURL };
export default defaultExport;
