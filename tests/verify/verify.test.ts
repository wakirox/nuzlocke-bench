// The run verifier: a recording is believed only as far as its button presses, played back
// from power-on and judged by the verifier's own tracker.
//
// The "game" here is a tiny homebrew ROM laid out like Red's memory: it sets up a one-Pokémon
// party, then sets the first badge while A is held. With a first-badge goal, pressing A wins.

import { describe, expect, it } from "vitest";
import { FIELDS, KIND_BURY, KIND_TOP_UP, Recorder, type SavedReplay } from "../../src/emulator/replay";
import { ITEM } from "../../src/games/gen1/data";
import { verifyRecording, type Conditions } from "../../src/verify/verify";
import { NodeGameBoy, TICKS_PER_FRAME } from "../harness/node-gameboy";
import { trackerData } from "../games/gen1/fixture";

/** Red's addresses (src/games/gen1/ram.ts). */
const RED = { partyCount: 0xd163, partySpecies: 0xd164, partyMons: 0xd16b, numBagItems: 0xd31d, bagItems: 0xd31e, badges: 0xd356 };
/** The byte and bit of the first rival battle's event flag (0x23 of wEventFlags at 0xd747). */
const RIVAL_FLAG = { addr: 0xd747 + (0x23 >> 3), bit: 1 << (0x23 & 7) };
const STARTER = 0xb0;

/** rivalFought: the save is past the first rival battle (Rare Candies are topped up only after it). */
function badgeRom({ rivalFought = true } = {}): Uint8Array {
  const rom = new Uint8Array(0x8000);
  rom.set([0x00, 0xc3, 0x50, 0x01], 0x100); // nop; jp $0150
  const st = (addr: number) => [0xea, addr & 0xff, addr >> 8]; // ld [addr], a
  const ld = (v: number) => [0x3e, v]; // ld a, v
  const setup = [
    ...ld(1), ...st(RED.partyCount),
    ...ld(STARTER), ...st(RED.partySpecies), ...st(RED.partyMons),
    ...ld(0xff), ...st(RED.partySpecies + 1), ...st(RED.bagItems),
    0xaf, ...st(RED.partyMons + 1), ...st(RED.partyMons + 34), ...st(RED.numBagItems), ...st(RED.badges), // xor a: HP / max HP high bytes, empty bag, no badges
    ...ld(20), ...st(RED.partyMons + 2), ...st(RED.partyMons + 35), // 20 HP
    ...ld(5), ...st(RED.partyMons + 33), // Lv5
    ...ld(rivalFought ? RIVAL_FLAG.bit : 0), ...st(RIVAL_FLAG.addr),
  ];
  const loop = [
    ...ld(0x10), 0xe0, 0x00, // select the buttons
    0xf0, 0x00, 0xf0, 0x00, // read (twice, to settle)
    0xcb, 0x47, // bit 0, a   (A pressed = 0)
    0x20, 0x00, // jr nz, loop   (offset patched below)
    ...ld(1), ...st(RED.badges),
    0x18, 0x00, // jr loop
  ];
  const loopAt = 0x150 + setup.length;
  const jrNz = loop.indexOf(0x20, 9);
  loop[jrNz + 1] = (-(jrNz + 2)) & 0xff;
  loop[loop.length - 1] = (-loop.length) & 0xff;
  rom.set([...setup, ...loop], 0x150);
  expect(loopAt + loop.length).toBeLessThan(0x200);
  let chk = 0;
  for (let i = 0x134; i <= 0x14c; i++) chk = (chk - rom[i] - 1) & 0xff;
  rom[0x14d] = chk;
  return rom;
}

const ROM = badgeRom();
const DATA = trackerData("red");
const SHORT_RUN: Conditions = { preset: "test-badge1", rareCandies: true, options: { endOnViolation: true, lenientRules: [], goalBadges: 1 } };
const WON = "Won the first badge — the run's goal — with STARTERMON!";
const F = TICKS_PER_FRAME;

/** A recording the way the page makes one: power-on state, then events at CPU ticks. */
async function record(build: (r: Recorder) => void, meta: Partial<SavedReplay["meta"]> = {}, rom = ROM): Promise<SavedReplay> {
  const gb = await NodeGameBoy.create(rom);
  const r = new Recorder({ start: gb.saveState() });
  gb.destroy();
  build(r);
  return {
    ...r.log(40 * F), rom, options: SHORT_RUN.options,
    meta: { attempt: 1, mode: "nuzlocke", version: "red", lead: "STARTERMON", level: 5, badges: 1, outcome: WON, score: 0, recordedAt: 0, ...meta },
  };
}
const pressA = (r: Recorder) => {
  r.button(10 * F, "a", true);
  r.button(12 * F, "a", false);
};
const verify = (replay: SavedReplay, over: Partial<Parameters<typeof verifyRecording>[0]> = {}) =>
  verifyRecording({ replay, baseRom: ROM, data: DATA, conditions: SHORT_RUN, createGameBoy: (rom) => NodeGameBoy.create(rom), ...over });

describe("run verifier", () => {
  it("verifies a run made of button presses and allowed interventions, from its own playback", async () => {
    const v = await verify(await record((r) => {
      r.intervention(3 * F, KIND_TOP_UP, ITEM.RARE_CANDY);
      pressA(r);
    }));
    expect(v.problems).toEqual([]);
    expect(v.ok).toBe(true);
    expect(v.result).toMatchObject({ outcome: { kind: "victory", detail: WON }, badges: 1, buttonChanges: 2, interventions: 1 });
  });

  it("rejects poking memory, and ignores the poke when playing back", async () => {
    const rep = await record((r) => r.write(10 * F, RED.badges, 1));
    const v = await verify(rep);
    expect(v.ok).toBe(false);
    expect(v.problems).toEqual(expect.arrayContaining([
      expect.stringMatching(/direct memory write/),
      expect.stringMatching(/never finished/),
    ]));
  });

  it("plays from power-on, whatever state the recording says it starts from", async () => {
    // Start from a machine that already has the badge: no input needed... unless it's checked.
    const gb = await NodeGameBoy.create(ROM);
    gb.runTo(5 * F);
    gb.write8(RED.badges, 1);
    const cheat = { ...(await record(() => {})), start: gb.saveState() };
    gb.destroy();
    const v = await verify(cheat);
    expect(v.ok).toBe(false);
    expect(v.problems).toEqual([
      expect.stringMatching(/doesn't start from power-on/),
      expect.stringMatching(/never finished/),
      expect.stringMatching(/claims 1 badge/),
    ]);
  });

  it("rejects loaded save states, another ROM, and claims that don't match the playback", async () => {
    const withState = await record(pressA);
    withState.states = [{ at: 0, state: withState.start }];
    expect((await verify(withState)).problems).toEqual([expect.stringMatching(/loads 1 save state/)]);

    const otherRom = ROM.slice();
    otherRom[0x7fff] ^= 1;
    expect((await verify(await record(pressA), { baseRom: otherRom })).problems[0]).toMatch(/different ROM/);

    const bragging = await record(pressA, { outcome: "Became Champion with STARTERMON!", badges: 8 });
    expect((await verify(bragging)).problems).toEqual([
      expect.stringMatching(/claims "Became Champion/),
      expect.stringMatching(/claims 8 badge/),
    ]);
  });

  it("allows only the interventions the conditions give: no other item, no burying the living", async () => {
    const otherItem = await record((r) => {
      r.intervention(3 * F, KIND_TOP_UP, ITEM.POTION);
      pressA(r);
    });
    expect((await verify(otherItem)).problems).toEqual([expect.stringMatching(/tops up item #/)]);
    const noCandies = await record((r) => {
      r.intervention(3 * F, KIND_TOP_UP, ITEM.RARE_CANDY);
      pressA(r);
    });
    expect((await verify(noCandies, { conditions: { ...SHORT_RUN, rareCandies: false } })).ok).toBe(false);

    const burial = await record((r) => {
      r.intervention(8 * F, KIND_BURY, 0);
      pressA(r);
    });
    expect((await verify(burial)).problems).toEqual([expect.stringMatching(/buries party slot 1 \(STARTERMON\), which isn't dead/)]);
  });

  it("rejects Rare Candies topped up before the first rival battle, once however many there are", async () => {
    const early = badgeRom({ rivalFought: false });
    const rep = await record((r) => {
      r.intervention(3 * F, KIND_TOP_UP, ITEM.RARE_CANDY);
      r.intervention(4 * F, KIND_TOP_UP, ITEM.RARE_CANDY);
      pressA(r);
    }, {}, early);
    const v = await verify(rep, { baseRom: early });
    expect(v.ok).toBe(false);
    expect(v.problems).toEqual([expect.stringMatching(/tops up Rare Candies before the first rival battle/)]);
  });

  it("re-does a top-up exactly as live: the bag gets its 99 Rare Candies", async () => {
    const rep = await record((r) => r.intervention(3 * F, KIND_TOP_UP, ITEM.RARE_CANDY));
    const gb = await NodeGameBoy.create(ROM);
    const { ReplayPlayer } = await import("../../src/emulator/replay");
    const player = new ReplayPlayer(gb.asGameBoy(), rep, { version: "red" });
    player.step(5 * F);
    expect([gb.read8(RED.numBagItems), gb.read8(RED.bagItems), gb.read8(RED.bagItems + 1)]).toEqual([1, ITEM.RARE_CANDY, 99]);
    gb.destroy();
    expect(rep.events.length / FIELDS).toBe(1);
  });
});
