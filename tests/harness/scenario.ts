// A small, game-agnostic way to play a run through a rules engine, one poll at a time.
//
//   const run = new Run(game).goTo(game.places.route).wildBattle(game.ids.wildA).catchWild("BITEY");
//   expect(run.engine.snap.areas[...]).toMatchObject({ status: "caught" });
//
// Every call builds the next GameState from the current one and feeds it to the engine,
// the way the app polls the emulator. States come from the fixture, so the same scenario
// runs on any game.

import type { GameState, MonState, PcMon } from "../../src/games/types";
import type { Severity } from "../../src/tracker/tracker";
import type { GameFixture, Place, RulesEngine } from "./game-fixture";

export class Run {
  readonly engine: RulesEngine;
  s: GameState;
  /** uid of the Pokémon the last catchWild/receiveGift added. */
  lastNew = "";
  /** What the PC boxes hold (GameState.pcMons); null = the PC can't be read, as in states from plain RAM. */
  pc: PcMon[] | null = null;

  /** `engine` defaults to the game's Hardcore Nuzlocke engine. */
  constructor(readonly game: GameFixture, over?: Partial<GameState>, engine?: RulesEngine) {
    this.engine = engine ?? game.nuzlockeEngine();
    this.s = game.state(over);
    this.engine.update(this.s); // the first poll only primes the engine
  }

  /** Feeds the next state: the current one with `patch` applied. */
  poll(patch: Partial<GameState> | ((s: GameState) => Partial<GameState>) = {}): this {
    const { pcMons: _pc, ...cur } = this.s;
    const base = structuredClone(cur);
    const p = typeof patch === "function" ? patch(base) : patch;
    this.s = { ...base, ...structuredClone(p), ...(this.pc ? { pcMons: () => this.pc ?? [] } : {}) };
    this.engine.update(this.s);
    return this;
  }

  /** Walks `n` squares on the current map. */
  step(n = 1): this {
    for (let i = 0; i < n; i++) this.poll((s) => ({ x: (s.x + 1) % 30 }));
    return this;
  }

  /** Arrives on another map and takes a step there. */
  goTo(place: Place): this {
    return this.poll({ map: place.map, mapConst: place.mapConst }).step();
  }

  /** Changes party slot `slot` (out of battle, or the party side of a battle). */
  setMon(slot: number, patch: Partial<MonState>): this {
    return this.poll((s) => {
      const party = s.party.map((m, i) => (i === slot ? { ...m, ...patch } : m));
      // Keep the active battler in step with its party slot, as the game does.
      const battleMon = s.battle > 0 && s.battleMon && s.activeIndex === slot ? { ...s.battleMon, ...pickBattle(patch) } : s.battleMon;
      return { party, battleMon };
    });
  }

  wildBattle(species: number, level = 5): this {
    return this.startBattle(1, species, level);
  }

  trainerBattle(species: number, level = 5): this {
    return this.startBattle(2, species, level);
  }

  private startBattle(kind: 1 | 2, species: number, level: number): this {
    const lead = this.s.party[0];
    return this.poll({
      battle: kind,
      enemy: this.game.battleMon({ species, level, hp: 20, maxHp: 20 }),
      battleMon: this.game.battleMon(lead),
      activeIndex: 0,
    });
  }

  /** Sends party slot `slot` into the current battle. */
  sendOut(slot: number): this {
    return this.poll((s) => ({ activeIndex: slot, battleMon: this.game.battleMon(s.party[slot]) }));
  }

  /** The active battler uses a move (PP goes down, the last-used move changes). */
  useMove(moveId = 0x21): this {
    return this.poll((s) => ({
      playerUsedMove: s.playerUsedMove === moveId ? moveId + 1 : moveId,
      battleMon: s.battleMon ? { ...s.battleMon, pp: [Math.max(0, s.battleMon.pp[0] - 1), ...s.battleMon.pp.slice(1)] } : null,
    }));
  }

  /** Catches the wild Pokémon in this battle and leaves the battle. */
  catchWild(nickname: string): this {
    const e = this.s.enemy!;
    const mon = this.game.mon({ species: e.species, level: e.level, nickname });
    this.lastNew = mon.uid;
    this.useItem(this.game.ids.ball);
    this.poll((s) => ({ party: [...s.party, mon] }));
    return this.endBattle();
  }

  /** Leaves the battle (ran away, or won). */
  endBattle(): this {
    return this.poll({ battle: 0, enemy: null, battleMon: null, activeIndex: 0 });
  }

  /** A Pokémon given outside battle (gift, trade). Takes a few polls to settle, as in the app. */
  receiveGift(species: number, nickname: string, level = 5): this {
    const mon = this.game.mon({ species, level, nickname });
    this.lastNew = mon.uid;
    this.poll((s) => ({ party: [...s.party, mon] }));
    for (let i = 0; i < 5; i++) this.poll();
    return this;
  }

  /** Puts a Pokémon in the PC (from the next poll on). */
  deposit(species: number, level: number, uid = `pc${level}`): this {
    this.pc = [...(this.pc ?? []), { species, level, uid }];
    return this;
  }

  /** Uses one of an item from the bag. */
  useItem(id: number): this {
    return this.poll((s) => ({ bag: s.bag.map((it) => (it.id === id ? { ...it, qty: it.qty - 1 } : it)) }));
  }

  faint(slot: number): this {
    return this.setMon(slot, { hp: 0 });
  }

  /** Texts of the engine's events, optionally of one severity. */
  events(severity?: Severity): string[] {
    return this.engine.snap.events.filter((e) => !severity || e.severity === severity).map((e) => e.text);
  }

  violations(): string[] {
    return this.events("violation");
  }
}

/** The fields a battle struct shares with a party Pokémon. */
function pickBattle(p: Partial<MonState>): Partial<MonState> {
  const { uid: _uid, exp: _exp, ...rest } = p;
  return rest;
}
