// Battle turns: picking a move and switching Pokémon.

import type { BridgeCore } from "./bridge-core";
import type { Menus } from "./menus";

export class Battle {
  constructor(private core: BridgeCore, private menus: Menus) {}

  /**
   * In battle: switch to a party Pokémon. Also after a faint: answers whether to send out the next one (wild
   * battles) and picks when asked which comes out (trainer battles, the party list already open).
   */
  async switchTo(which: string): Promise<unknown> {
    if (!this.core.host.position().battle) throw new Error("switch: only in battle (outside, use make_lead).");
    const mon = this.core.partyMember(which);
    if (mon.hp <= 0) throw new Error(`${mon.nickname} has fainted.`);
    const messages: string[] = [];
    if (!this.core.screenText().some((l) => l.includes("▶"))) messages.push(...(await this.menus.advanceText(20)).messages);
    if (this.menus.cursorOn("YES") || this.menus.cursorOn("NO")) {
      messages.push(...(((await this.menus.choose("YES")) as { messages?: string[] }).messages ?? []));
    } else if (!this.core.screenText().some((l) => this.core.layout.texts.choosePokemon.test(l))) {
      if (!this.menus.atBattleMenu()) throw new Error(`Not at the battle menu. Screen:\n${this.core.screenText().join("\n")}`);
      await this.menus.choose(this.core.layout.battleMenu.party.label);
    }
    if (!(await this.menus.steerParty(mon.slot - 1))) throw new Error(`Couldn't put the cursor on ${mon.nickname}.`);
    await this.core.tap("a", 4, 20);
    // The SWITCH / STATS menu ignores input for a few frames after it opens (Crystal's does).
    await this.core.requireGb().runFrames(20);
    const r = this.menus.cursorOn("SWITCH")
      ? ((await this.menus.choose("SWITCH")) as { messages?: string[]; stopped?: string })
      : await this.menus.advanceText(30);
    messages.push(...(r.messages ?? []));
    return this.core.result({ switchedTo: mon.nickname, messages, stopped: r.stopped });
  }

  /** From the battle menu: FIGHT → pick a move → play out the turn. */
  async fight(move: string | number): Promise<unknown> {
    const gb = this.core.requireGb();
    if (!this.core.host.position().battle) throw new Error("Not in a battle.");

    let lines = this.core.screenText();
    const { fight: menuFight } = this.core.layout.battleMenu;
    const list = this.core.layout.moveList;
    // The move list may already be open (Gen 1: its TYPE/ box shows): pick from it directly.
    const moveListOpen = () => this.core.screenText().some((l) => l.includes(list.marker));
    if (!moveListOpen() && !lines.some((l) => /▶/.test(l))) {
      await this.menus.advanceText(20);
      lines = this.core.screenText();
    }
    if (!moveListOpen() && !lines.some((l) => l.includes(menuFight.label))) {
      throw new Error(`Not at the battle menu. Screen:\n${lines.join("\n")}`);
    }

    const moves = this.core.host.battleMoves();
    const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const target = typeof move === "number" || /^\d$/.test(String(move))
      ? moves.find((m) => m.slot === Number(move))
      : moves.find((m) => norm(m.name) === norm(String(move)));
    if (!target) throw new Error(`Unknown move "${move}". Known: ${moves.map((m) => `${m.slot}=${m.name}`).join(", ")}`);
    if (target.pp <= 0) throw new Error(`${target.name} has no PP left.`);

    if (!moveListOpen() && this.menus.battleMenuCursor()) {
      // Cursor to FIGHT (a step at a time, see battleMenuTo), open the move list.
      if (!(await this.menus.battleMenuTo("fight"))) throw new Error(`Couldn't put the cursor on ${menuFight.label}. Screen:\n${this.core.screenText().join("\n")}`);
      await this.core.tap("a", 4, 16);
      // The list draws in a few frames.
      for (let i = 0; i < 6 && !this.core.screenText().some((l) => l.includes("▶") && moves.some((m) => norm(l).includes(norm(m.name)))); i++) await gb.runFrames(8, 8);
    }
    // The move list is one move a row (Gen 1: rows 13–16 of the screen): the ▶ row is the cursor.
    const cursorLine = () => this.core.screenText().slice(...list.rows).find((l) => l.includes("▶")) ?? "";
    const cursorSlot = () => this.core.screenText().slice(...list.moves).findIndex((l) => l.includes("▶")) + 1;
    let chosen = cursorLine();
    if (!moves.some((m) => norm(chosen).includes(norm(m.name)))) {
      // No move list: asleep, frozen, recharging or locked into a move — FIGHT plays the turn as is.
      await gb.runFrames(20, 8);
      if (!this.core.screenText().some((l) => moves.some((m) => l.includes("▶") && norm(l).includes(norm(m.name))))) {
        const turn = await this.menus.advanceText(40);
        return this.core.result({ used: null, note: "No move to pick this turn (asleep, frozen, recharging or locked in): the turn played out.", messages: turn.messages, stopped: turn.stopped });
      }
      chosen = cursorLine();
    }
    // Straight up or down to it, never wrapping past an end (a press off the end can count as a pick).
    // By its row, not its name: one move's name can sit inside another's.
    for (let i = 0; i < 4 && cursorSlot() !== target.slot; i++) {
      const slot = cursorSlot();
      if (!slot) break;
      await this.core.tap(target.slot > slot ? "down" : "up", 2, 8);
      chosen = cursorLine();
    }
    if (cursorSlot() !== target.slot) {
      await this.core.tap("b", 4, 10);
      throw new Error(`Cursor didn't land on ${target.name} (saw "${chosen.trim()}"). Backed out to the battle menu.`);
    }
    await this.core.tap("a", 4, 20);
    const turn = await this.menus.advanceText(40);
    return this.core.result({ used: target.name, messages: turn.messages, stopped: turn.stopped });
  }
}
