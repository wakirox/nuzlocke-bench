// Gen 1 memory reading: a fake RAM laid out as the games lay it out (pret symbols),
// read back through readGameState / readScreenText. Red/Blue and Yellow differ by a
// byte in most places, so every check runs on both layouts.

import { describe, expect, it } from "vitest";
import { addressesFor, firstRivalBattleFought, readGameState, readScreenText } from "../../../src/games/gen1/ram";
import type { MemoryReader } from "../../../src/games/types";
import { BOX_MON, boxBase } from "../../../src/games/gen1/boxes";
import { ITEM } from "../../../src/games/gen1/data";
import type { GameVersion } from "../../../src/rom/types";
import { SPECIES } from "./fixture";

class FakeRam implements MemoryReader {
  readonly m = new Uint8Array(0x10000);
  read8(a: number) {
    return this.m[a & 0xffff];
  }
  read16be(a: number) {
    return (this.read8(a) << 8) | this.read8(a + 1);
  }
  readBytes(a: number, n: number) {
    return this.m.slice(a, a + n);
  }
  set(a: number, bytes: ArrayLike<number>) {
    this.m.set(bytes, a);
    return this;
  }
  w16(a: number, v: number) {
    return this.set(a, [v >> 8, v & 0xff]);
  }
}

/** Gen 1 text encoding (the reverse of gen1.charFor for letters, digits and space), 0x50-terminated. */
export function encodeText(s: string, len = 11): number[] {
  const out = [...s].map((ch) => {
    if (ch >= "A" && ch <= "Z") return 0x80 + ch.charCodeAt(0) - 65;
    if (ch >= "a" && ch <= "z") return 0xa0 + ch.charCodeAt(0) - 97;
    if (ch >= "0" && ch <= "9") return 0xf6 + ch.charCodeAt(0) - 48;
    if (ch === " ") return 0x7f;
    if (ch === "!") return 0xe7;
    throw new Error(`no Gen 1 code for ${ch}`);
  });
  out.push(0x50);
  while (out.length < len) out.push(0x50);
  return out;
}

/** A 44-byte party struct (pret party_struct). */
function partyMon(o: { species: number; hp: number; maxHp: number; level: number; moves: number[]; pp: number[]; otId: number; dvs: number; exp: number }) {
  const b = new Array(44).fill(0);
  b[0] = o.species;
  b[1] = o.hp >> 8; b[2] = o.hp & 0xff;
  o.moves.forEach((m, i) => (b[8 + i] = m));
  b[12] = o.otId >> 8; b[13] = o.otId & 0xff;
  b[14] = (o.exp >> 16) & 0xff; b[15] = (o.exp >> 8) & 0xff; b[16] = o.exp & 0xff;
  b[27] = o.dvs >> 8; b[28] = o.dvs & 0xff;
  // PP bytes carry PP-Up counts in the top two bits: the reader must mask them off.
  o.pp.forEach((p, i) => (b[29 + i] = p | 0x40));
  b[33] = o.level;
  b[34] = o.maxHp >> 8; b[35] = o.maxHp & 0xff;
  return b;
}

/** A 29-byte battle struct (pret battle_struct). */
function battleMon(o: { species: number; hp: number; maxHp: number; level: number }) {
  const b = new Array(29).fill(0);
  b[0] = o.species;
  b[1] = o.hp >> 8; b[2] = o.hp & 0xff;
  b[14] = o.level;
  b[15] = o.maxHp >> 8; b[16] = o.maxHp & 0xff;
  return b;
}

function overworld(version: GameVersion): FakeRam {
  const A = addressesFor(version);
  const ram = new FakeRam();
  ram.set(A.partyCount, [1, SPECIES.STARTER, 0xff]);
  ram.set(A.partyMons, partyMon({ species: SPECIES.STARTER, hp: 19, maxHp: 21, level: 6, moves: [0x0a, 0x2d, 0, 0], pp: [35, 40, 0, 0], otId: 0x1234, dvs: 0xabcd, exp: 0x0001f4 }));
  ram.set(A.partyNicks, encodeText("NOVA"));
  ram.set(A.playerName, encodeText("PLAYER"));
  ram.set(A.numBagItems, [2, ITEM.POKE_BALL, 5, ITEM.POTION, 3, 0xff]);
  ram.set(A.money, [0x01, 0x23, 0x45]); // BCD
  ram.set(A.curMap, [12]); // ROUTE_1 in both layouts
  ram.set(A.xCoord, [7]).set(A.yCoord, [20]);
  ram.set(A.badges, [0b101]);
  return ram;
}

for (const version of ["red", "yellow"] as const) {
  describe(`Gen 1 RAM — ${version}`, () => {
    it("reads the party, bag, money and position", () => {
      const s = readGameState(overworld(version), version);
      expect(s).toMatchObject({ started: true, playerName: "PLAYER", map: 12, mapConst: "ROUTE_1", x: 7, y: 20, badges: 0b101, money: 12345, battle: 0 });
      expect(s.party).toHaveLength(1);
      expect(s.party[0]).toMatchObject({
        species: SPECIES.STARTER, nickname: "NOVA", level: 6, hp: 19, maxHp: 21,
        moves: [0x0a, 0x2d, 0, 0], pp: [35, 40, 0, 0], exp: 500, uid: "1234abcd",
      });
      expect(s.bag).toEqual([{ id: ITEM.POKE_BALL, qty: 5 }, { id: ITEM.POTION, qty: 3 }]);
      expect(s.enemy).toBeNull();
    });

    it("isn't started before there's a party (title screen, intro)", () => {
      const ram = overworld(version);
      ram.set(addressesFor(version).partyCount, [0]);
      expect(readGameState(ram, version)).toMatchObject({ started: false, party: [] });
    });

    it("reads a wild battle: enemy, active battler, stat stages", () => {
      const A = addressesFor(version);
      const ram = overworld(version)
        .set(A.isInBattle, [1])
        .set(A.enemyMon, battleMon({ species: SPECIES.WILD_A, hp: 12, maxHp: 15, level: 3 }))
        .set(A.enemyMonNick, encodeText("WILDMON"))
        .set(A.battleMon, battleMon({ species: SPECIES.STARTER, hp: 19, maxHp: 21, level: 6 }))
        .set(A.enemyStatMods, [7, 7, 6, 7, 7, 8]) // 7 = no change
        .set(A.playerStatMods, [7, 7, 7, 7, 7, 7]);
      const s = readGameState(ram, version);
      expect(s.battle).toBe(1);
      expect(s.enemy).toMatchObject({ species: SPECIES.WILD_A, level: 3, hp: 12, maxHp: 15, nickname: "WILDMON", uid: "" });
      expect(s.enemy!.stages).toEqual([0, 0, -1, 0, 0, 1]);
      expect(s.battleMon).toMatchObject({ species: SPECIES.STARTER, level: 6 });
    });

    it("reads a lost battle as -1", () => {
      const ram = overworld(version).set(addressesFor(version).isInBattle, [0xff]);
      expect(readGameState(ram, version).battle).toBe(-1);
    });

    it("reads the text box", () => {
      const ram = overworld(version);
      const box = 0xc3a0 + 12 * 20;
      ram.set(box, [0x79]); // the box frame's top-left corner
      ram.set(box + 2 * 20 + 1, encodeText("Wild WILDMON").slice(0, -1));
      ram.set(box + 4 * 20 + 1, encodeText("appeared!").slice(0, -1));
      expect(readGameState(ram, version).boxText).toBe("Wild WILDMON appeared!");
    });
  });
}

describe("Gen 1 screen text", () => {
  const screen = () => {
    const ram = new FakeRam();
    ram.set(0xff40, [0x80 | 0x10]); // LCD on, background map at 0x9800
    ram.set(0xff47, [0xe4]); // a normal palette
    return ram;
  };

  it("decodes the background map line by line", () => {
    const ram = screen();
    ram.set(0x9800, encodeText("FIGHT").slice(0, 5)); // row 0
    ram.set(0x9800 + 32 * 2, [0xed, ...encodeText("ITEM").slice(0, 4)]); // row 2: cursor + ITEM
    const lines = readScreenText(ram);
    expect(lines).toHaveLength(18);
    expect(lines[0]).toBe("FIGHT");
    expect(lines[2]).toBe("▶ITEM");
  });

  it("says there's no text when the font is loaded but nothing is written", () => {
    const ram = screen();
    ram.set(0x9800, new Array(0x400).fill(0x7f)); // spaces everywhere (a picture with no text box yet)
    expect(readScreenText(ram)).toEqual([expect.stringMatching(/^\(No text on screen/)]);
  });

  it("says so when the screen is off or faded", () => {
    expect(readScreenText(new FakeRam())[0]).toMatch(/off/i);
    const ram = screen();
    ram.set(0xff47, [0]);
    expect(readScreenText(ram)[0]).toMatch(/faded/i);
  });
});

describe("first rival battle flag", () => {
  // The bottomless Rare Candies start once it's set (main.ts), so the first battle is fought at the starter's own level.
  const memWith = (version: GameVersion, flagByte: number): MemoryReader => {
    const at = addressesFor(version).eventFlags + 4; // event 0x23: byte 4, bit 3
    const read8 = (a: number) => (a === at ? flagByte : 0);
    return {
      read8,
      read16be: (a: number) => (read8(a) << 8) | read8(a + 1),
      readBytes: (a: number, n: number) => Uint8Array.from({ length: n }, (_, i) => read8(a + i)),
    };
  };

  for (const version of ["red", "yellow"] as GameVersion[]) {
    it(`reads the game's own event flag (${version})`, () => {
      expect(firstRivalBattleFought(memWith(version, 0), version)).toBe(false);
      expect(firstRivalBattleFought(memWith(version, 1 << 3), version)).toBe(true);
      expect(firstRivalBattleFought(memWith(version, 0xff ^ (1 << 3)), version)).toBe(false); // neighbouring events don't count
    });
  }
});

describe("PC boxes", () => {
  /** A box struct's first 33 bytes: species, level (byte 3), OT ID and DVs (the uid). */
  const boxMon = (species: number, level: number, otId: number) => {
    const b = new Array(33).fill(0);
    b[0] = species; b[3] = level; b[12] = otId >> 8; b[13] = otId & 0xff;
    return b;
  };
  const putBox = (write: (at: number, bytes: number[]) => void, at: number, mons: number[][]) => {
    write(at, [mons.length, ...mons.map((m) => m[0]), 0xff]);
    mons.forEach((m, i) => write(at + 22 + i * BOX_MON, m));
  };

  for (const version of ["red", "yellow"] as GameVersion[]) {
    const A = addressesFor(version);
    it(`reads the current box from WRAM and the others from cartridge RAM (${version})`, () => {
      const ram = new FakeRam();
      const sram = new Uint8Array(0x8000);
      ram.set(A.curBoxNum, [0x80 | 1]); // box 2, boxes set up
      putBox((at, b) => ram.set(at, b), A.boxCount, [boxMon(SPECIES.WILD_A, 12, 0x0102)]);
      putBox((at, b) => sram.set(b, at), boxBase(1), [boxMon(SPECIES.WILD_B, 30, 0x0909)]); // box 2's stale copy
      putBox((at, b) => sram.set(b, at), boxBase(11), [boxMon(SPECIES.WILD_B, 9, 0x0304)]);
      const mem = Object.assign(ram, { getExtRam: () => sram });
      expect(readGameState(mem, version).pcMons?.()).toEqual([
        { species: SPECIES.WILD_A, level: 12, uid: "01020000" },
        { species: SPECIES.WILD_B, level: 9, uid: "03040000" },
      ]);
    });

    it(`reads only the current box before the boxes were set up (${version})`, () => {
      const ram = new FakeRam();
      const sram = new Uint8Array(0x8000);
      putBox((at, b) => sram.set(b, at), boxBase(11), [boxMon(SPECIES.WILD_B, 9, 0x0304)]); // uninitialized memory
      expect(readGameState(Object.assign(ram, { getExtRam: () => sram }), version).pcMons?.()).toEqual([]);
    });
  }
});
