// The infinite Rare Candies option for Crystal: keeps 99 of an item in the items pocket, as Gen 1's
// bag.ts does. The pocket is in work-RAM bank 1: it's only written while that bank is switched in
// (writes go through the CPU's view, so the recording replays them), else on a later frame.

import type { MemoryWriter } from "../types";
import { A } from "./ram";

const SVBK = 0xff70;
const MAX_ITEMS = 20;

/** A bottomless stack in the items pocket (added if there's room). Call every frame. */
export function topUpItem(m: MemoryWriter, item: number): void {
  if ((m.read8(SVBK) & 7) > 1) return; // another bank is in: next frame
  const party = m.read8(A.partyCount);
  if (party < 1 || party > 6) return; // intro / no save yet
  const count = Math.min(m.read8(A.numItems), MAX_ITEMS);
  for (let i = 0; i < count; i++) {
    if (m.read8(A.items + i * 2) === item) {
      if (m.read8(A.items + i * 2 + 1) < 99) m.write8(A.items + i * 2 + 1, 99);
      return;
    }
  }
  if (count >= MAX_ITEMS) return;
  m.write8(A.items + count * 2, item);
  m.write8(A.items + count * 2 + 1, 99);
  m.write8(A.items + count * 2 + 2, 0xff);
  m.write8(A.numItems, count + 1);
}
