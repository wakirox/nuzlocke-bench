// Crystal's English charset (pret pokecrystal constants/charmap.asm): Gen 1's letters, digits and
// box borders, with the apostrophe pairs, é and a few symbols at new places.

import { charFor as gen1CharFor } from "../gen1/data";

const GEN2: Record<number, string> = {
  // $6D-$74 also hold battle-screen graphics (HP bar, Lv, ID): only the ellipsis is always text.
  0x75: "…",
  0xc0: "Ä", 0xc1: "Ö", 0xc2: "Ü", 0xc3: "ä", 0xc4: "ö", 0xc5: "ü",
  0xd0: "'d", 0xd1: "'l", 0xd2: "'m", 0xd3: "'r", 0xd4: "'s", 0xd5: "'t", 0xd6: "'v",
  0xdf: "←", 0xe9: "&", 0xea: "é", 0xeb: "→",
};
/** Gen 1 places Crystal uses for something else (or nothing). */
const NOT_GEN2 = new Set([0xba, 0xbb, 0xbc, 0xbd, 0xbe, 0xbf, 0xe4, 0xe5]);

export function charFor(c: number): string {
  return GEN2[c] ?? (NOT_GEN2.has(c) ? "" : gen1CharFor(c));
}

/** Crystal text → string; $50 ends it. */
export function decodeText(bytes: ArrayLike<number>): string {
  let s = "";
  for (let i = 0; i < bytes.length && bytes[i] !== 0x50; i++) s += charFor(bytes[i]);
  return s;
}
