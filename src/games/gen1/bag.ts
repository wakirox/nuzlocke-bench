// The harness's one change to the bag: a bottomless stack of an item (the infinite Rare Candies
// option). Recorded as a named intervention and re-done on playback (emulator/replay.ts).

import type { GameVersion } from "../../rom/types";
import type { MemoryWriter } from "../types";
import { addressesFor } from "./ram";

/** A bottomless stack: keeps 99 of an item in the bag (adding it if there's room). Call every frame. */
export function topUpItem(m: MemoryWriter, version: GameVersion, item: number): void {
  const A = addressesFor(version);
  const party = m.read8(A.partyCount);
  if (party < 1 || party > 6) return; // intro / no save yet: the bag isn't initialized
  const count = Math.min(m.read8(A.numBagItems), 20);
  for (let i = 0; i < count; i++) {
    if (m.read8(A.bagItems + i * 2) === item) {
      if (m.read8(A.bagItems + i * 2 + 1) < 99) m.write8(A.bagItems + i * 2 + 1, 99);
      return;
    }
  }
  if (count >= 20) return; // bag full
  m.write8(A.bagItems + count * 2, item);
  m.write8(A.bagItems + count * 2 + 1, 99);
  m.write8(A.bagItems + count * 2 + 2, 0xff);
  m.write8(A.numBagItems, count + 1);
}
