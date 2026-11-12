// SPDX-License-Identifier: GPL-3.0-or-later
// Part of "randomize.sh" (https://github.com/justinelijahtaylor/randomizer)
// A web fork of Universal Pokemon Randomizer ZX. Licensed under GPLv3-or-later.
// See LICENSE.txt for the full license text.

/**
 * Browser shim for Node's `os` module.
 */

export const EOL = "\n";

export function homedir(): string {
  return "/";
}

export function tmpdir(): string {
  return "/tmp";
}

export function platform(): string {
  return "browser";
}

export function arch(): string {
  return "wasm";
}

export function release(): string {
  return "0.0.0";
}

const defaultExport = { EOL, homedir, tmpdir, platform, arch, release };
export default defaultExport;
