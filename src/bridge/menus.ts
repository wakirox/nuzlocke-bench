// Menus and dialogue: reading text, steering cursors, choosing options, the naming
// keyboard, and the start-menu / party / bag screens.

import type { Button } from "../emulator/gameboy";
import type { BattleAction, ScreenLayout } from "../games/adapter";
import type { BattlerHp } from "../games/types";
import { menuLabel } from "./menu-label";
import { newBoxLines } from "./text-lines";
import { steerPartyCursor } from "./party-cursor";
import type { BridgeCore } from "./bridge-core";

/** A battle-menu option named in choose("PKMN"…) (by its label on screen), or null for any other menu's. */
const battleAction = (layout: ScreenLayout, option: string): BattleAction | null => {
  const letters = (s: string) => s.toUpperCase().replace(/[^A-Z]/g, "");
  const o = letters(option);
  return (Object.keys(layout.battleMenu) as BattleAction[]).find((a) => letters(layout.battleMenu[a].label) === o) ?? null;
};
/** A menu label as a regular expression that matches just that text. */
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * "(MONA: 85% → 63% HP.)" for each battler whose HP changed while the same Pokémon stayed out.
 * Your side in HP, the foe's in % like its bar (a player never sees the foe's numbers).
 */
function hpChanges(before: { you: BattlerHp; foe: BattlerHp }, after: { you: BattlerHp; foe: BattlerHp }): string[] {
  const out: string[] = [];
  const same = (a: BattlerHp, b: BattlerHp) => a.species === b.species && a.name === b.name && a.maxHp === b.maxHp && a.species > 0;
  const pct = (m: BattlerHp) => (m.maxHp ? Math.round((m.hp / m.maxHp) * 100) : 0);
  if (same(before.you, after.you) && before.you.hp !== after.you.hp) out.push(`(${after.you.name}: ${before.you.hp} → ${after.you.hp}/${after.you.maxHp} HP.)`);
  if (same(before.foe, after.foe) && before.foe.hp !== after.foe.hp) out.push(`(${after.foe.name}: ${pct(before.foe)}% → ${pct(after.foe)}% HP.)`);
  return out;
}

export class Menus {
  constructor(private core: BridgeCore) {}

  /**
   * Presses A through dialogue until a choice/menu (▶ cursor) appears, the
   * text box closes, or the limit is hit. Returns every message seen.
   */
  async advanceText(maxPresses: number, opts: { pastTheEnd?: boolean } = {}): Promise<{ messages: string[]; stopped: string }> {
    const gb = this.core.requireGb();
    const messages: string[] = [];
    let lastBox: string[] = []; // the text box as last read (its lines, without menu rows)
    let lastLine = -1; // where in messages the box's last line went
    let emptyWaits = 0;
    let pictureNudged = false;
    let quantityWaits = 0;
    let quantityText: string | null = null; // the text box when a quantity box was first seen
    let hp = this.core.host.battleHp();
    // Messages seen since the battle screen opened (a trainer's line comes before it).
    let battleFrom = this.core.host.position().battle ? 0 : -1;
    // The battle menu's second row (ITEM RUN) shows inside the text box: a choice, not a message.
    const { bag, run } = this.core.layout.battleMenu;
    const menuRow = new RegExp(`^${escapeRe(bag.label)}\\s+${escapeRe(run.label)}$`);
    for (let presses = 0; presses < maxPresses; ) {
      if (battleFrom < 0 && this.core.host.position().battle) battleFrom = messages.length;
      const lines = await this.core.settledScreen();
      const box = this.core.textBox(lines);
      // HP that changed since the last line: what the hit (or heal) just shown did, as the bars show it.
      const now = this.core.host.battleHp();
      if (hp && now) messages.push(...hpChanges(hp, now));
      hp = now;
      // Text scrolls up a line at a time; record each line once. Menu rows (FIGHT/PKMN, YES/NO…)
      // are choices, not messages.
      const text = box.lines.filter((line) => !/[▶▷]/.test(line) && !menuRow.test(line));
      const read = newBoxLines(lastBox, text);
      if (read.replaceLast !== null && lastLine >= 0) messages[lastLine] = read.replaceLast;
      for (const line of read.add) lastLine = messages.push(line) - 1;
      if (text.length) lastBox = text;
      // A quantity box (a shop's "×01") has no ▶: up/down change it and A confirms, so don't
      // press A through it. But text with a ▼ under it (the price question once a quantity
      // is picked) is read on, and so is text that changed under the box: after a purchase the
      // old box stays drawn under the clerk's thank-you, which waits for a press (back to the
      // list). Only a box that stays put, its text too, is waiting for a quantity.
      if (!this.core.host.position().battle && !lines.some((l) => l.includes("▶")) && lines.some((l) => /×\d\d/.test(l))) {
        quantityText ??= box.lines.join("\n");
        let moreText = box.lines.join("\n") !== quantityText;
        for (let i = 0; i < 2 && !moreText; i++) {
          moreText = this.core.textBoxRows().some((l) => l.includes("▼"));
          if (!moreText) await gb.runFrames(16, 8);
        }
        if (!moreText) {
          await gb.runFrames(40, 8);
          if (quantityWaits++ < 5 && this.core.screenText().join("\n") !== lines.join("\n")) continue;
          const q = lines.join(" ").match(/×\d\d/)?.[0];
          return { messages, stopped: `a quantity to choose (${q}): press up/down to change it, then a to confirm` };
        }
      }
      // A ▼ in the text box means more text — that wins over a menu still drawn
      // behind it. The ▼ blinks, so look twice before deciding.
      if (lines.some((l) => l.includes("▶"))) {
        let moreText = false;
        for (let i = 0; i < 2 && !moreText; i++) {
          moreText = this.core.textBoxRows().some((l) => l.includes("▼"));
          if (!moreText) await gb.runFrames(16, 8);
        }
        if (!moreText) return { messages, stopped: "a menu or choice is waiting for input" };
      }
      if (!opts.pastTheEnd && this.core.host.brief()?.outcome) return { messages, stopped: "the run ended" };
      if (!box.open) {
        // Full-screen pages also wait for A: anything with a ▼, and encyclopedia entries
        // (recognized by their two labels, the layout's dexEntry — the ▼ only appears once the text is done).
        const [l1, l2] = this.core.layout.dexEntry.labels.map((w) => new RegExp(`\\b${escapeRe(w)}\\b`));
        const dexPage = lines.some((l) => l1.test(l)) && lines.some((l) => l2.test(l));
        if (dexPage || lines.some((l) => l.includes("▼"))) {
          await this.core.tap("a", 4, 24);
          presses++;
          continue;
        }
        // Give scripted scenes a moment to open the next box before giving up
        // (a battle's intro animation runs ~4 seconds before its first message).
        // A trainer who has spotted you sets the opponent before the battle screen opens.
        const pos = this.core.host.position();
        // A scene that has taken the controls (an escort, a cutscene walk) runs on by itself: wait
        // it out (about 10 s of game time at most) rather than reporting "no text" in the middle of it.
        const patience = pos.scripted ? 30 : (pos.battle && battleFrom >= 0 && messages.length === battleFrom) || pos.battleSoon ? 15 : 3;
        if (emptyWaits++ < patience) {
          await gb.runFrames(20, 8);
          continue;
        }
        // Still held by the scene with nothing to read: it may wait for a button over a picture
        // (Crystal's starter balls show the Pokémon and wait for A before any text). Press A once.
        // Only over a picture: a screen with anything to read (the naming keyboard) is waiting for
        // the player's own input, and an A there types a letter (run 4's nickname began with one).
        const nothingToRead = lines.every((l) => !l.trim() || l.startsWith("(No text"));
        if (pos.scripted && !pos.battle && !pictureNudged && nothingToRead) {
          pictureNudged = true;
          emptyWaits = 0;
          await this.core.tap("a", 4, 24);
          presses++;
          continue;
        }
        return { messages, stopped: "no text on screen" };
      }
      if (!box.lines.length) {
        if (emptyWaits++ < 6) {
          await gb.runFrames(20, 8);
          continue;
        }
      }
      emptyWaits = 0;
      await this.core.tap("a", 4, 24);
      presses++;
    }
    return { messages, stopped: "press limit reached" };
  }

  /** Is the ▶ cursor directly in front of `option` anywhere on screen? */
  cursorOn(option: string): boolean {
    const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const want = norm(option);
    return this.core.screenText().some((line) => {
      const i = line.indexOf("▶");
      return i >= 0 && norm(line.slice(i + 1).split(/\s{2,}|[│┐┘]/)[0]).startsWith(want);
    });
  }

  /**
   * One step of a menu cursor that checks the press landed: a press that changes nothing on screen
   * is tried once more after a pause, since a menu can ignore input for a moment after it opens and
   * can miss a short press (Crystal's bag does both). True when the screen changed: false means the
   * cursor is at the end of the list (or the menu took neither press).
   */
  async menuStep(dir: Button): Promise<boolean> {
    const before = this.core.screenText().join("\n");
    await this.core.tap(dir, 6, 8);
    if (this.core.screenText().join("\n") !== before) return true;
    await this.core.requireGb().runFrames(16, 8);
    if (this.core.screenText().join("\n") !== before) return true;
    await this.core.tap(dir, 6, 8);
    await this.core.requireGb().runFrames(8, 8);
    return this.core.screenText().join("\n") !== before;
  }

  /**
   * Picks a menu option by its text (YES/NO, NEW NAME, FIGHT/ITEM…): moves the
   * cursor until ▶ is on it, presses A, then reads any dialogue that follows.
   */
  async choose(option: string): Promise<unknown> {
    if (!option.trim()) throw new Error("option is required, e.g. YES");
    // The menu may still be drawing (e.g. right after a battle turn); give it a moment.
    if (!this.core.screenText().some((l) => l.includes("▶"))) await this.advanceText(10);
    if (!this.core.screenText().some((l) => l.includes("▶"))) {
      const q = this.core.screenText().join(" ").match(/×\d\d/)?.[0];
      throw new Error(q
        ? `No menu cursor (▶) on screen: a quantity is being chosen (${q}). press up/down to change it, then a to confirm.`
        : "No menu cursor (▶) on screen.");
    }
    // The battle menu: step to the option from where the cursor is (see battleMenuTo).
    const action = battleAction(this.core.layout, option);
    if (action && this.battleMenuCursor()) {
      if (!(await this.battleMenuTo(action))) throw new Error(`Couldn't put the cursor on "${option}". Screen:\n${this.core.screenText().join("\n")}`);
      await this.core.tap("a", 4, 20);
      const after = await this.advanceText(30);
      return this.core.result({ chose: option, messages: after.messages, stopped: after.stopped });
    }
    // Sweep: to the top, down the column, then the other column (2×2 menus).
    // (Long lists like the bag scroll, hence the long downward run.)
    const plan: Button[] = [
      ...Array<Button>(20).fill("down"), "right",
      ...Array<Button>(3).fill("up"), ...Array<Button>(3).fill("down"), "left",
    ];
    const label = menuLabel(option);
    let found = this.cursorOn(label);
    // To the top first, however far down the list the cursor is; stop once nothing moves.
    for (let i = 0; i < 20 && !found; i++) {
      const moved = await this.menuStep("up");
      found = this.cursorOn(label);
      if (!moved) break;
    }
    for (const step of plan) {
      if (found) break;
      await this.menuStep(step);
      found = this.cursorOn(label);
    }
    if (!found) throw new Error(`Couldn't put the cursor on "${option}". Screen:\n${this.core.screenText().join("\n")}`);
    await this.core.tap("a", 4, 20);
    const after = await this.advanceText(30);
    return this.core.result({ chose: option, messages: after.messages, stopped: after.stopped });
  }

  /**
   * Picks an item in the open bag. A bag with pockets (Crystal: items, balls, key items, TMs) shows
   * one at a time: each pocket is searched top to bottom, then right goes to the next. A one-pocket
   * bag is an ordinary list (choose).
   */
  async chooseInBag(item: string): Promise<unknown> {
    const pockets = this.core.layout.bagPockets;
    if (pockets <= 1) return this.choose(item);
    const label = menuLabel(item);
    // Steps `dir` until the item is under the cursor or the list stops moving.
    const scan = async (dir: Button) => {
      for (let i = 0; i < 30; i++) {
        if (this.cursorOn(label)) return true;
        if (!(await this.menuStep(dir))) return this.cursorOn(label);
      }
      return this.cursorOn(label);
    };
    // A pocket slides in: until its cursor is drawn, presses are lost (the right that should
    // reach the items pocket went missing in a test run, and the candies weren't found).
    // A cursor on screen isn't proof the pocket takes input yet (coming from the TM pocket the
    // slide takes longer): wait for the cursor, then for the screen to stop changing.
    const settle = async () => {
      for (let i = 0; i < 12 && !this.core.screenText().some((l) => l.includes("▶")); i++) await this.core.requireGb().runFrames(5, 5);
      await this.core.settledScreen();
      await this.core.requireGb().runFrames(12, 8);
    };
    await settle();
    for (let p = 0; p < pockets; p++) {
      if ((await scan("up")) || (await scan("down"))) {
        await this.core.tap("a", 4, 20);
        const after = await this.advanceText(30);
        return this.core.result({ chose: item, messages: after.messages, stopped: after.stopped });
      }
      // To the next pocket. Two empty pockets look the same on screen, so the game's own pocket
      // number says whether the press took (run 6 searched one pocket twice and missed the candies).
      const pocketNow = () => this.core.game.bagPocket?.(this.core.requireGb());
      const from = pocketNow();
      for (let tries = 0; tries < 4; tries++) {
        await this.core.tap("right", 6, 12); // a 2-frame press is sometimes missed by the bag
        await settle();
        if (from === undefined || pocketNow() !== from) break;
      }
    }
    throw new Error(`Couldn't find "${item}" in the bag's pockets. Screen:\n${this.core.screenText().join("\n")}`);
  }

  /**
   * Swaps a party Pokémon into slot 1 through the start menu (POKéMON → pick →
   * SWITCH → current lead).
   */
  async makeLead(which: string): Promise<unknown> {
    if (this.core.host.position().battle) throw new Error("Can't reorder the party during a battle.");
    const state = this.core.host.summary() as { party?: { slot: number; species: string; nickname: string }[] } | null;
    const party = state?.party ?? [];
    const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const target = /^\d$/.test(which)
      ? party.find((m) => m.slot === Number(which))
      : party.find((m) => norm(m.species) === norm(which) || norm(m.nickname) === norm(which));
    if (!target) throw new Error(`No "${which}" in the party (${party.map((m) => `${m.slot}=${m.nickname}`).join(", ")}).`);
    if (target.slot === 1) return this.core.result({ messages: [`${target.nickname} is already your lead.`] });

    await this.openStartMenu();
    await this.choose(this.core.layout.startMenu.party);
    // The party screen's ▶ sits on each entry's HP row (Gen 1: rows 1, 3, 5…), not its name, so move by
    // slot. It opens where the last pick was (e.g. after Rare Candies), and stays on the picked
    // Pokémon after SWITCH.
    const row = this.partyCursorRow();
    const at = row >= 0 ? this.core.layout.partyScreen.slotAt(row) : 0;
    for (let i = at; i < target.slot - 1; i++) await this.core.tap("down", 4, 10);
    for (let i = at; i > target.slot - 1; i--) await this.core.tap("up", 4, 10);
    await this.core.tap("a", 4, 30);
    await this.choose("SWITCH");
    for (let i = 1; i < target.slot; i++) await this.core.tap("up", 4, 10);
    await this.core.tap("a", 4, 60);
    // Back out of the party screen and the start menu (the screen fades between them, so
    // keep pressing B until the start menu is really gone).
    await this.core.tap("b", 4, 20);
    await this.core.tap("b", 4, 20);
    // A fade can hide the menu for a moment: only stop after two clear looks in a row.
    for (let i = 0, clear = 0; i < 10 && clear < 2; i++) {
      await this.core.requireGb().runFrames(15, 8);
      if (this.startMenuShown()) {
        clear = 0;
        await this.core.tap("b", 4, 20);
      } else clear++;
    }
    this.core.host.refresh();
    const after = (this.core.host.summary() as { party?: { nickname: string }[] } | null)?.party ?? [];
    const ok = after[0]?.nickname === target.nickname;
    return this.core.result({ messages: [ok ? `${target.nickname} is now your lead.` : "The swap didn't go through — check the screen."] });
  }

  /**
   * Feeds Rare Candies to party slot `slot` (1-6) through the game's own bag menu
   * until it reaches `toLevel` (refused past the Nuzlocke level cap). Evolutions
   * play out as usual; a "delete a move?" question stops here with the prompt
   * open, for the caller to answer with choose.
   */
  async rareCandy(slot: number, toLevel?: number): Promise<unknown> {
    if (this.core.host.position().battle) throw new Error("Rare Candies are used outside battle.");
    // An earlier candy's move question still waiting holds every menu: say so instead of failing on the menus.
    if (this.moveQuestionOpen()) {
      throw new Error("A move-learning question is still open on screen: answer it with choose (YES, then the move to forget, or NO) before using another candy.");
    }
    type Party = { slot: number; nickname: string; level: number }[];
    const read = () => {
      this.core.host.refresh();
      const s = this.core.host.summary() as { party?: Party; bag?: { item: string; qty: number }[]; nuzlocke?: { levelCap?: { level: number } | null } } | null;
      return { party: s?.party ?? [], bag: s?.bag ?? [], cap: s?.nuzlocke?.levelCap?.level };
    };
    const first = read();
    // Check the bag before opening any menu: a failed search would leave the menus open.
    if (!first.bag.some((it) => /RARE CANDY/i.test(it.item) && it.qty > 0)) throw new Error("There are no Rare Candies in the bag.");
    const mon = first.party.find((m) => m.slot === slot);
    if (!mon) throw new Error(`No Pokémon in slot ${slot} (${first.party.map((m) => `${m.slot}=${m.nickname}`).join(", ")}).`);
    // The target level is the player's call; the cap (a rule) still limits it.
    if (toLevel == null || !Number.isFinite(toLevel)) throw new Error(`Say which level to raise ${mon.nickname} (Lv${mon.level}) to.`);
    // Past the cap is refused, not lowered to it: the harness never picks the level.
    if (first.cap != null && toLevel > first.cap) throw new Error(`Rare Candies can't take ${mon.nickname} past the level cap (Lv${first.cap}).`);
    const target = Math.min(toLevel, 100);
    if (mon.level >= target) return this.core.result({ messages: [`${mon.nickname} is already Lv${mon.level} (target Lv${target}).`] });

    const log: string[] = [];
    await this.openStartMenu();
    await this.choose(this.core.layout.startMenu.bag);
    for (let i = 0; i < 100; i++) {
      const level = read().party.find((m) => m.slot === slot)?.level ?? 0;
      if (level >= target) break;
      // The bag remembers where it was scrolled (and which pocket): search it for the candies.
      await this.chooseInBag("RARE CANDY");
      await this.choose("USE");
      // The party screen fades in after USE, and presses during the fade are dropped (USE can return
      // before it's drawn: once the run has ended, reading text stops at once). Steer by the ▶ on
      // screen, and use the candy only with it on the target's row.
      if (!(await this.steerParty(slot - 1))) {
        const screen = this.core.screenText().join("\n");
        await this.closeMenus();
        throw new Error(`Couldn't put the cursor on ${mon.nickname} (slot ${slot}), so no candy was used${log.length ? " this time" : ""}. Screen:\n${screen}`);
      }
      await this.core.tap("a", 4, 30);
      // Read the level-up through, even after the run has ended: the next candy needs the bag back.
      const after = await this.advanceText(40, { pastTheEnd: true });
      log.push(...after.messages);
      if (this.cursorOn("YES") || after.messages.some((m) => this.core.layout.texts.moveQuestion.test(m))) {
        return this.core.result({ messages: log, stopped: "a move-learning question is open: answer with choose (YES, then the move to forget, or NO)" });
      }
    }
    // Close the bag and the start menu (as many B presses as it takes: Crystal's needs one more).
    await this.closeMenus();
    const done = read().party.find((m) => m.slot === slot);
    // Messages arrive one text-box line at a time ("NOVA grew" / "to level 21!"): rejoin, keep the events.
    const events = log.join(" ").match(/\S+ (?:grew to level \d+|evolved into [A-Z.'♀♂ -]+?!|learned [A-Z -]+?!|forgot [A-Z -]+?!)/g) ?? [];
    return this.core.result({ messages: [...events, `${done?.nickname} is Lv${done?.level}.`] });
  }

  /** Types an A–Z name on the naming keyboard (cursor starts on "A"), then confirms. */
  async typeName(name: string): Promise<void> {
    // Let the keyboard finish opening before the first input.
    await this.core.requireGb().runFrames(60, 8);
    const { lettersPerRow, nameRow, confirm } = this.core.layout.keyboard;
    const typed = () => (this.core.screenText()[nameRow] ?? "").replace(/[^A-Z]/g, "");
    // The cursor opens on "A"; track it across a retry (the keyboard wraps, so it can't be "homed").
    let row = 0;
    let col = 0;
    for (let attempt = 0; attempt < 2; attempt++) {
      // Clear anything typed so far (B deletes one letter; the cursor stays put).
      for (let i = 0; i < 8 && typed(); i++) await this.core.tap("b", 4, 10);
      for (const ch of name) {
        const i = ch.charCodeAt(0) - 65; // keyboard rows hold the same number of letters (Gen 1: A–I, J–R, S–Z)
        const r = Math.floor(i / lettersPerRow);
        const c = i % lettersPerRow;
        for (; col < c; col++) await this.core.tap("right", 4, 10);
        for (; col > c; col--) await this.core.tap("left", 4, 10);
        for (; row < r; row++) await this.core.tap("down", 4, 10);
        for (; row > r; row--) await this.core.tap("up", 4, 10);
        await this.core.tap("a", 4, 12);
      }
      if (typed() === name) break;
    }
    for (const b of confirm) await this.core.tap(b, 4, 40);
  }

  /** Power-on → title → options (fast text, no animations, SET) → names → bedroom. */
  async startGame(name: string, rival: string): Promise<unknown> {
    const gb = this.core.requireGb();
    if (!/^[A-Z]{1,7}$/.test(name) || !/^[A-Z]{1,7}$/.test(rival)) {
      throw new Error("Names must be 1–7 capital letters A–Z.");
    }
    if (this.core.host.brief()?.lead) {
      throw new Error("start_game only works on a fresh run (this one already has a Pokémon).");
    }
    // Title screen / intro: press START until the main menu shows.
    for (let i = 0; i < 60 && !this.cursorOn("NEW GAME"); i++) await this.core.tap("start", 6, 45);
    if (!this.cursorOn("NEW GAME")) throw new Error("Couldn't reach the main menu (is there a save file? use the menu manually).");

    // Options: TEXT SPEED fast, BATTLE ANIMATION off, BATTLE STYLE set.
    await this.core.tap("down", 3, 10);
    await this.core.tap("a", 4, 30);
    await this.core.tap("left", 3, 8);
    await this.core.tap("down", 3, 8);
    await this.core.tap("right", 3, 8);
    await this.core.tap("down", 3, 8);
    await this.core.tap("right", 3, 8);
    await this.core.tap("b", 4, 60);
    for (let i = 0; i < 4 && !this.cursorOn("NEW GAME"); i++) await this.core.tap("up", 3, 10);

    if (this.core.host.version() === "crystal") return this.startCrystal(name);

    // New game → the professor's speech → player name → rival name → bedroom.
    const log: string[] = [];
    await this.core.tap("a", 4, 60);
    for (let i = 0; i < 4 && !this.cursorOn("NEW NAME"); i++) log.push(...(await this.advanceText(60)).messages);
    await this.core.tap("a", 4, 30); // NEW NAME
    await this.typeName(name);
    for (let i = 0; i < 6 && !this.cursorOn("NEW NAME"); i++) log.push(...(await this.advanceText(60)).messages);
    await this.core.tap("a", 4, 30);
    await this.typeName(rival);
    // (The game sets the bedroom as the current map early, so stop when the dialogue runs dry.)
    for (let i = 0; i < 6; i++) {
      const r = await this.advanceText(60);
      log.push(...r.messages);
      if (!r.messages.length && r.stopped === "no text on screen") break;
    }
    await gb.runFrames(120, 8);
    return this.core.result({ messages: log.slice(-6), map: this.core.mapText() });
  }

  /**
   * Crystal's new game, from the main menu (options already set): boy, the clock as the game
   * offers it (accepted as is), the professor's speech, the player's name, then the bedroom.
   * The rival is named later in the game, on the naming keyboard (press name:NAME).
   */
  private async startCrystal(name: string): Promise<unknown> {
    const gb = this.core.requireGb();
    const log: string[] = [];
    await this.core.tap("a", 4, 60);
    // Every question up to the naming (BOY/GIRL, the hour, the minutes, their YES/NO) keeps its
    // first answer; the name menu opens on NEW NAME.
    for (let i = 0; i < 40 && !this.cursorOn("NEW NAME"); i++) {
      const r = await this.advanceText(20);
      log.push(...r.messages);
      if (!this.cursorOn("NEW NAME")) await this.core.tap("a", 4, 30);
    }
    if (!this.cursorOn("NEW NAME")) throw new Error(`Couldn't reach the naming menu. Screen:\n${this.core.screenText().join("\n")}`);
    await this.core.tap("a", 4, 30); // NEW NAME
    await this.typeName(name);
    for (let i = 0; i < 6; i++) {
      const r = await this.advanceText(60);
      log.push(...r.messages);
      if (!r.messages.length && r.stopped === "no text on screen") break;
    }
    await gb.runFrames(120, 8);
    return this.core.result({ messages: log.slice(-6), map: this.core.mapText() });
  }

  /** The party screen's row with the ▶ on it, or -1. */
  partyCursorRow(): number {
    return this.core.screenText().slice(0, this.core.layout.partyScreen.rows).findIndex((l) => l.includes("▶"));
  }

  /**
   * The party screen is up: its ▶ beside a party member's name (on its row or the next to it). A ▶ in
   * the top rows alone isn't proof: Crystal's bag list sits there too, and after a Super Repel it
   * was taken for the party screen asking for a target.
   */
  private partyScreenOpen(): boolean {
    const row = this.partyCursorRow();
    if (row < 0) return false;
    const names = (this.core.summary()?.party ?? []).map((m) => m.nickname.toUpperCase()).filter(Boolean);
    const near = this.core.screenText().slice(Math.max(0, row - 1), row + 2).join(" ").toUpperCase();
    return names.some((n) => near.includes(n));
  }

  /** The party screen's cursor slot (0-based; ▶ sits on each entry's HP row), or -1. */
  private partyCursor(): number {
    const row = this.partyCursorRow();
    return row >= 0 ? this.core.layout.partyScreen.slotAt(row) : -1;
  }

  /** Moves the party screen's cursor to `slot` (0-based), waiting out its fade-in. */
  async steerParty(slot: number): Promise<boolean> {
    return steerPartyCursor({
      cursor: () => this.partyCursor(),
      wait: () => this.core.requireGb().runFrames(6, 6),
      press: (dir) => this.core.tap(dir, 4, 10),
    }, slot);
  }

  /** Where the battle menu's ▶ is (Gen 1: FIGHT PKMN / ITEM RUN), or null when that menu isn't up. */
  battleMenuCursor(): BattleAction | null {
    const menu = this.core.layout.battleMenu;
    const actions = Object.keys(menu) as BattleAction[];
    const onOption = new RegExp(`▶\\s*(${actions.map((a) => escapeRe(menu[a].label)).join("|")})\\b`);
    for (const l of this.core.screenText()) {
      const m = onOption.exec(l);
      if (m && this.core.screenText().some((x) => x.includes(menu.fight.label) && x.includes(menu.party.label))) return actions.find((a) => menu[a].label === m[1])!;
    }
    return null;
  }

  /**
   * Steps the battle menu's cursor onto `option`, one press at a time from where it is, never off
   * the 2×2 grid: after some list menus (one house's list of badges) the game takes a press off the edge as a
   * pick, so Up on FIGHT opens the moves.
   */
  async battleMenuTo(option: BattleAction): Promise<boolean> {
    const at = (a: BattleAction) => this.core.layout.battleMenu[a].at;
    for (let i = 0; i < 4; i++) {
      const now = this.battleMenuCursor();
      if (!now) return false;
      if (now === option) return true;
      const [cx, cy] = at(now), [tx, ty] = at(option);
      await this.core.tap(cy !== ty ? (ty < cy ? "up" : "down") : tx < cx ? "left" : "right", 6, 8);
    }
    return this.battleMenuCursor() === option;
  }

  atBattleMenu(): boolean {
    const lines = this.core.screenText();
    const menu = this.core.layout.battleMenu;
    return lines.some((l) => l.includes(menu.fight.label) && l.includes(menu.party.label)) || this.atSafariMenu();
  }

  /** The game reserve's battle menu: BALL×N / BAIT / THROW ROCK / RUN (its own balls aren't in the bag). */
  atSafariMenu(): boolean {
    const lines = this.core.screenText();
    const [a, b] = this.core.layout.safariMenu.labels;
    return lines.some((l) => l.includes(a) && l.includes(b));
  }

  /** Opens the start menu. A press can be swallowed (a menu just closing, a script finishing), so press until it shows. */
  /** A move question waiting on screen, its follow-up included (Gen 1 "Abandon learning X?", Crystal "Stop learning X?"). */
  private moveQuestionOpen(): boolean {
    return this.core.layout.texts.moveQuestion.test(this.core.screenText().join(" ")) && this.core.screenText().some((l) => l.includes("▶"));
  }

  /**
   * The start menu is on screen (even with its cursor hidden mid-fade): its box shows the encyclopedia
   * or EXIT (Crystal's has no encyclopedia entry until the player gets one).
   */
  private startMenuShown(): boolean {
    const { dex, exit } = this.core.layout.startMenu;
    return this.core.screenText().some((l) => l.includes("│") && (l.includes(dex) || new RegExp(`│\\s*▶?${exit}\\b`).test(l)));
  }

  async openStartMenu(): Promise<void> {
    // A move question holds every menu: say so, instead of sweeping its cursor from YES to NO looking for the menu.
    if (this.moveQuestionOpen()) {
      throw new Error("A move-learning question is still open on screen: answer it with choose (YES, then the move to forget, or NO) first.");
    }
    // The start menu shows both of these; the bag left open covers all of it but its last rows.
    const { bag, exit } = this.core.layout.startMenu;
    const shows = (word: string) => this.core.screenText().some((l) => new RegExp(`\\b${word}\\b`).test(l));
    for (let i = 0; i < 10; i++) {
      if (shows(exit) && !shows(bag)) await this.core.tap("b", 4, 16); // a text box may only now have uncovered it
      else if (this.core.screenText().some((l) => l.includes("▶"))) break;
      else if (this.core.textBox(this.core.screenText()).open) await this.advanceText(10);
      else await this.core.tap("start", 6, 30);
    }
    // Another menu (a PC, a shop, a question): say so, instead of sweeping its cursor looking for ours.
    if (this.core.screenText().some((l) => l.includes("▶")) && !(shows(exit) && shows(bag))) {
      throw new Error(`Another menu is open on screen: close it first (press b, or answer it with choose). Screen:\n${this.core.screenText().join("\n")}`);
    }
  }

  /** Closes the start menu and anything open on top of it. */
  private async closeMenus(): Promise<void> {
    for (let i = 0, clear = 0; i < 12 && clear < 2; i++) {
      await this.core.requireGb().runFrames(10, 8);
      // Mid-fade no menu shows, but one may come back when it ends (the bag, after the party screen).
      if (this.core.screenText().some((l) => l.includes("faded to white"))) {
        clear = 0;
        continue;
      }
      const open = this.startMenuShown() || this.core.screenText().some((l) => l.includes("▶") || l.includes("▷"));
      if (open) {
        clear = 0;
        await this.core.tap("b", 4, 16);
      } else clear++;
    }
  }

  /** Outside battle: use a bag item (on a party Pokémon when it asks which). */
  async useItem(query: string, target: string | null): Promise<unknown> {
    if (this.core.host.position().battle) throw new Error("item: outside battle only (items in battle break the Nuzlocke rules; use 'ball' for Poké Balls).");
    const norm = (x: string) => x.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const bag = this.core.summary()?.bag ?? [];
    const it = bag.find((b) => norm(b.item) === norm(query)) ?? bag.find((b) => norm(b.item).includes(norm(query)));
    if (!it) throw new Error(`No "${query}" in the bag (${bag.map((b) => b.item).join(", ")}).`);
    const mon = target ? this.core.partyMember(target) : null;
    await this.openStartMenu();
    await this.choose(this.core.layout.startMenu.bag);
    await this.chooseInBag(it.item);
    const use = (await this.choose("USE")) as { messages?: string[] };
    const messages = [...(use.messages ?? [])];
    // A TM/HM asks whether to teach it before the party screen.
    if (this.cursorOn("YES") && messages.some((m) => this.core.layout.texts.teachQuestion.test(m))) {
      messages.push(...((((await this.choose("YES")) as { messages?: string[] }).messages) ?? []));
    }
    if (messages.some((m) => /which/i.test(m)) || this.partyScreenOpen()) {
      if (!mon) {
        await this.closeMenus();
        throw new Error(`${it.item} needs a target: item:${query.toLowerCase().replace(/ /g, "_")}:NAME`);
      }
      if (!(await this.steerParty(mon.slot - 1))) throw new Error(`Couldn't put the cursor on ${mon.nickname}.`);
      await this.core.tap("a", 4, 30);
      messages.push(...(await this.advanceText(20)).messages);
      // A TM into a full moveset asks which move to delete: leave that choice open.
      if (this.cursorOn("YES") && this.core.layout.texts.moveQuestion.test(messages.join(" "))) {
        return this.core.result({ used: it.item, on: mon?.nickname, messages, stopped: "a move-learning question is open: answer with choose (YES, then the move to forget, or NO)" });
      }
    }
    await this.closeMenus();
    if (/ESCAPE ROPE/i.test(it.item) && !this.core.layout.texts.notNow.test(messages.join(" "))) await this.core.awaitWarp();
    return this.core.result({ used: it.item, on: mon?.nickname, messages });
  }
}
