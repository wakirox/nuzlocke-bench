// SPDX-License-Identifier: GPL-3.0-or-later
// Part of "randomize.sh" (https://github.com/justinelijahtaylor/randomizer)
// A web fork of Universal Pokemon Randomizer ZX. Licensed under GPLv3-or-later.
// See LICENSE.txt for the full license text.

/**
 * Browser shim for Node's `crypto` module.
 *
 * ts-src only uses `crypto.randomBytes(n)` for seeding the RNG. We back it
 * with the Web Crypto `getRandomValues` API.
 */

import { Buffer } from "buffer";

export function randomBytes(size: number): Buffer {
  const out = new Uint8Array(size);
  // globalThis.crypto exists in both the main thread and Web Workers
  globalThis.crypto.getRandomValues(out);
  return Buffer.from(out);
}

const defaultExport = { randomBytes };
export default defaultExport;
