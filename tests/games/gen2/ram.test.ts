// Crystal memory reading: a fake RAM laid out as pokecrystal's symbols say, with work-RAM bank 1
// kept apart from whatever bank the CPU sees (the game switches banks), read back through the adapter.

import { describe, expect, it } from "vitest";
import { gameFor } from "../../../src/games";
import { A, BATTLETYPE_TUTORIAL, firstRivalBattleFought, grassEncounters } from "../../../src/games/gen2/ram";
import { decodeText } from "../../../src/games/gen2/text";
import { effectiveness, hmsLearnable } from "../../../src/games/gen2/data";
import type { MemoryReader } from "../../../src/games/types";

/** CPU view + a separate bank 1: what readWram(1, …) returns. Bank 5 is "switched in" for read8. */
class FakeCgbRam implements MemoryReader {
  readonly cpu = new Uint8Array(0x10000);
  readonly bank1 = new Uint8Array(0x1000);
  read8(a: number) { return this.cpu[a & 0xffff]; }
  read16be(a: number) { return (this.read8(a) << 8) | this.read8(a + 1); }
  readBytes(a: number, n: number) { return this.cpu.slice(a, a + n); }
  readWram(bank: number, a: number) { return a < 0xd000 ? this.cpu[a] : bank === 1 ? this.bank1[a - 0xd000] : 0xee; }
  set(a: number, bytes: ArrayLike<number>) {
    if (a >= 0xd000 && a < 0xe000) this.bank1.set(bytes, a - 0xd000); else this.cpu.set(bytes, a);
    return this;
  }
}

const TOTODILE = 158;
const text = (s: string, len = 11) => {
  const out = [...s].map((c) => (c >= "A" && c <= "Z" ? 0x80 + c.charCodeAt(0) - 65 : 0x7f));
  while (out.length < len) out.push(0x50);
  return out;
};

/** A party of one Totodile, as the game stores it (48-byte struct). */
function withTotodile(ram: FakeCgbRam): FakeCgbRam {
  const mon = new Array(48).fill(0);
  mon[0] = TOTODILE; mon[2] = 10; mon[3] = 43; // Scratch, Leer
  mon[6] = 0xee; mon[7] = 0xc5; mon[21] = 0xcd; mon[22] = 0x33; // OT id, DVs
  mon[10] = 135; mon[23] = 35; mon[24] = 30; mon[31] = 5; mon[32] = 0x08; // exp, PP, level, poisoned
  mon[35] = 18; mon[37] = 20; mon[39] = 12; mon[41] = 12; mon[43] = 9; mon[45] = 9; mon[47] = 10;
  return ram.set(A.partyCount, [1, TOTODILE, 0xff]).set(A.partyMons, mon).set(A.partyNicks, text("TOTODILE"));
}

describe("Crystal RAM", () => {
  const game = gameFor("crystal");

  it("reads the party from bank 1, whatever bank is switched in", () => {
    const s = game.readGameState(withTotodile(new FakeCgbRam()));
    expect(s.started).toBe(true);
    expect(s.party[0]).toMatchObject({
      species: TOTODILE, nickname: "TOTODILE", uid: "eec5cd33", level: 5, hp: 18, maxHp: 20, exp: 135,
      moves: [10, 43, 0, 0], pp: [35, 30, 0, 0], stats: { atk: 12, def: 12, spd: 9, spc: 9, spdef: 10 },
    });
    expect([...game.poisonedParty(withTotodile(new FakeCgbRam())).values()]).toEqual([{ slot: 0, hp: 18, maxHp: 20 }]);
  });

  it("numbers maps group << 8 | number and names them by pret's constants", () => {
    const ram = new FakeCgbRam().set(A.mapGroup, [0x18, 0x04]).set(A.yCoord, [6, 13]);
    const s = game.readGameState(ram);
    expect(s.map).toBe(0x1804);
    expect(s.mapConst).toBe("NEW_BARK_TOWN");
    expect({ x: s.x, y: s.y }).toEqual({ x: 13, y: 6 });
  });

  it("reads money as plain binary and the pockets together", () => {
    const ram = new FakeCgbRam().set(A.money, [0x00, 0x0b, 0xb8])
      .set(A.numItems, [1, 18, 3]).set(A.numBalls, [1, 5, 10]).set(A.numKeyItems, [1, 0x3b]);
    const s = game.readGameState(ram);
    expect(s.money).toBe(3000);
    expect(s.bag).toEqual([{ id: 18, qty: 3 }, { id: 5, qty: 10 }, { id: 0x3b, qty: 1 }]);
  });

  it("tells the catching demonstration and a lost battle apart", () => {
    const ram = withTotodile(new FakeCgbRam()).set(A.battleMode, [1]).set(A.battleType, [BATTLETYPE_TUTORIAL]);
    const s = game.readGameState(ram);
    expect(s.battle).toBe(1);
    expect(game.data.isDemoBattle(s)).toBe(true);
    ram.set(0xd0ee, [1]); // wBattleResult LOSE: written on any faint, not a lost battle
    expect(game.readGameState(ram).battle).toBe(1);
    ram.set(A.partyMons + 34, [0, 0]); // the only Pokémon down
    expect(game.readGameState(ram).battle).toBe(-1);
  });

  it("counts the Cherrygrove rival battle as fought once the town's scene moves past it", () => {
    const ram = new FakeCgbRam();
    expect(firstRivalBattleFought(ram)).toBe(false); // Mr. Pokémon not met yet
    ram.set(A.eventFlags + 3, [0x40]); // the egg: given before the rival is armed
    expect(firstRivalBattleFought(ram)).toBe(false);
    ram.set(A.mrPokemonsHouseScene, [1]).set(A.cherrygroveScene, [1]);
    expect(firstRivalBattleFought(ram)).toBe(false); // the rival waits
    ram.set(A.cherrygroveScene, [0]);
    expect(firstRivalBattleFought(ram)).toBe(true);
  });
});

describe("Crystal data", () => {
  it("decodes Crystal's apostrophes, é and ellipsis", () => {
    expect(decodeText([0x88, 0xd1, 0x7f, 0x8f, 0x8e, 0x8a, 0xea, 0x75, 0x50])).toBe("I'l POKé…");
  });

  it("uses the Gen 2 type chart", () => {
    expect(effectiveness("GHOST", ["PSYCHIC"])).toBe(2);
    expect(effectiveness("FIGHTING", ["DARK", "STEEL"])).toBe(4);
    expect(effectiveness("POISON", ["STEEL"])).toBe(0);
  });

  it("finds a map's grass table for the time of day", () => {
    const rom = new Uint8Array(0x30000).fill(0xff);
    const start = 0x0a * 0x4000 + (0x65e9 - 0x4000);
    const entry = [0x18, 0x03, 25, 20, 10];
    for (let tod = 0; tod < 3; tod++) for (let i = 0; i < 7; i++) entry.push(2 + tod, 161 + tod);
    rom.set(entry, start);
    expect(grassEncounters(rom, 0x18, 0x03, 1)).toEqual({ rate: 20, mons: Array(7).fill({ level: 3, species: 162 }) });
    expect(grassEncounters(rom, 0x18, 0x03, 3).rate).toBe(10); // darkness counts as night
    expect(grassEncounters(rom, 0x18, 0x04, 0)).toEqual({ rate: 0, mons: [] });
  });

  it("reads HMs from the base data's TM/HM bits", () => {
    const rom = new Uint8Array(0x60000);
    const base = 0x14 * 0x4000 + (0x5424 - 0x4000) + (TOTODILE - 1) * 32;
    rom[base] = TOTODILE;
    rom[base + 0x18 + 6] = 0b0001_0000; // bit 52: SURF
    const sp = { id: TOTODILE, dex: TOTODILE } as Parameters<typeof hmsLearnable>[1];
    expect(hmsLearnable(rom, sp)).toEqual(["SURF"]);
  });
});
