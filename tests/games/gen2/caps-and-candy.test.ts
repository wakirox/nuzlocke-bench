// Crystal's hard level caps (two level bytes in the loaded ROM) and its bottomless Rare Candy stack.

import { describe, expect, it } from "vitest";
import { capOffsets, candyCapInRom, levelCapInRom, setCandyCapInRom, setLevelCapInRom } from "../../../src/games/gen2/hard-caps";
import { topUpItem } from "../../../src/games/gen2/bag";
import { A } from "../../../src/games/gen2/ram";
// @ts-expect-error plain ESM module without type declarations
import { GEN2, gameData } from "../../../mcp-server/games/index.mjs";
// @ts-expect-error plain ESM module without type declarations
import { nextHint } from "../../../mcp-server/hints.mjs";
import { MAP_CONSTANTS_CRYSTAL } from "../../../src/games/gen2/map-constants";

/** A ROM holding GainExperience's and the Rare Candy's level checks, as Crystal compiles them. */
function romWithChecks() {
  const rom = new Uint8Array(0x50000);
  rom.set([0xea, 0x60, 0xcf, 0xcd, 0x56, 0x38, 0xc5, 0x16, 100, 0x21, 0x47, 0x4e, 0x3e, 0x14, 0xcf], 0x3ef48);
  rom.set([0x7e, 0xfe, 100, 0xd2, 0x83, 0x6e, 0x3c, 0x77, 0xea], 0xef24);
  // The pack's party-count check looks the same but for the last byte: it isn't the candy's.
  rom.set([0x7e, 0xfe, 6, 0xd2, 0xa3, 0x5a, 0x3c, 0x77, 0x4f], 0x4d9f8);
  // GainExperience's level-up loop and the experience bar's: `cp d` / `jp z`, `jr z`.
  rom.set([0x7e, 0xfe, 100, 0xd2, 0xb9, 0x70, 0xba, 0xca], 0x3ef88);
  rom.set([0x7b, 0xfe, 100, 0x30, 0x43, 0xba, 0x28], 0x3f1b7);
  let rom2 = rom;
  return { romBytes: () => rom2, writeRom: (o: number, v: number) => { rom2 = rom2.slice(); rom2[o] = v; } };
}

describe("Crystal hard caps", () => {
  it("finds both level checks, once each", () => {
    expect(capOffsets(romWithChecks().romBytes())).toEqual({ exp: 0x3ef48 + 8, candy: 0xef24 + 2, levelUp: 0x3ef88 + 7, barLoop: 0x3f1b7 + 6 });
  });
  it("sets experience and candies to the cap, and candies alone", () => {
    const gb = romWithChecks();
    setLevelCapInRom(gb, 14);
    expect([levelCapInRom(gb), candyCapInRom(gb)]).toEqual([14, 14]);
    setCandyCapInRom(gb, 20);
    expect([levelCapInRom(gb), candyCapInRom(gb)]).toEqual([14, 20]);
  });
  it("makes the level-up loops stop at 'not higher', so a Pokémon above the cap never levels down", () => {
    const gb = romWithChecks();
    setLevelCapInRom(gb, 20);
    expect(gb.romBytes()[0x3ef88 + 7]).toBe(0xd2); // jp z → jp nc
    expect(gb.romBytes()[0x3f1b7 + 6]).toBe(0x30); // jr z → jr nc
    setLevelCapInRom(gb, 25); // found again, already patched
    expect(levelCapInRom(gb)).toBe(25);
  });
});

describe("Crystal candy stack", () => {
  const mem = (svbk: number) => {
    const m = new Uint8Array(0x10000);
    m[0xff70] = svbk;
    m[A.partyCount] = 1;
    m[A.numItems] = 1;
    m.set([18, 1, 0xff], A.items);
    return { m, read8: (a: number) => m[a], read16be: () => 0, readBytes: () => new Uint8Array(), write8: (a: number, v: number) => { m[a] = v; } };
  };
  it("adds 99 to the items pocket, and keeps it at 99", () => {
    const r = mem(1);
    topUpItem(r, 32);
    expect([...r.m.slice(A.numItems, A.numItems + 6)]).toEqual([2, 18, 1, 32, 99, 0xff]);
    r.m[A.items + 3] = 5;
    topUpItem(r, 32);
    expect(r.m[A.items + 3]).toBe(99);
  });
  it("waits while another work-RAM bank is switched in", () => {
    const r = mem(5);
    topUpItem(r, 32);
    expect(r.m[A.numItems]).toBe(1);
  });
});

describe("Crystal story data", () => {
  it("is the server's data for a Crystal run", () => {
    expect(gameData("crystal")).toBe(GEN2);
  });
  it("names only maps the game has", () => {
    const known = new Set(MAP_CONSTANTS_CRYSTAL.filter(Boolean));
    const named = [...GEN2.home, ...GEN2.objectives.flatMap((o: { maps?: string[]; rival?: string }) => [...(o.maps ?? []), ...(o.rival ? [o.rival] : [])])];
    expect(named.filter((m) => !known.has(m))).toEqual([]);
  });

  it("walks the story: starter, errand, the egg back, then the gyms", () => {
    const at = (o: { party?: number; badges?: number; visited?: string[]; bag?: number[] }) =>
      nextHint({ party: o.party ?? 1, badges: o.badges ?? 0, visited: new Set(o.visited ?? []), has: (id: number) => (o.bag ?? []).includes(id) }, GEN2.objectives, new Set(), GEN2);
    expect(at({ party: 0 })).toMatch(/professor's lab/);
    expect(at({})).toMatch(/errand/);
    expect(at({ visited: ["MR_POKEMONS_HOUSE"], bag: [GEN2.hintItems.egg] })).toMatch(/egg back/);
    expect(at({ visited: ["MR_POKEMONS_HOUSE"] })).toMatch(/first gym's town/);
    // A resumed run's log doesn't show the errand: a badge (or the rival fight) proves it done.
    expect(at({ badges: 1 })).not.toMatch(/errand/);
    expect(at({ badges: 1, visited: ["MR_POKEMONS_HOUSE", "AZALEA_TOWN"] })).toMatch(/well/);
    expect(at({ badges: 7, visited: ["MR_POKEMONS_HOUSE"] })).toMatch(/BASEMENT_KEY/);
    expect(at({ badges: 7, visited: ["MR_POKEMONS_HOUSE"], bag: [GEN2.hintItems.basementKey] })).toMatch(/underground/);
    expect(at({ badges: 7, visited: ["MR_POKEMONS_HOUSE"], bag: [GEN2.hintItems.cardKey] })).toMatch(/3rd floor/);
    expect(at({ badges: 8, visited: ["MR_POKEMONS_HOUSE", "BLACKTHORN_CITY"], bag: [GEN2.hintItems.clearBell] })).toMatch(/eight badges/);
  });
});
