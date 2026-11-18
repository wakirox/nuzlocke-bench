// Menus and dialogue: reading text, steering cursors, choosing options, the naming
// keyboard, and the start-menu / party / bag screens. Pure screen recognition lives in
// `screen-state.ts` so these loops stay focused on frame stepping and input transitions.

import type { Button } from "../emulator/gameboy";
import type { BattleAction } from "../games/adapter";
import type { BattlerHp } from "../games/types";
import type { BridgeCore } from "./bridge-core";
import { menuLabel } from "./menu-label";
import { steerPartyCursor } from "./party-cursor";
import {
  battleAction,
  battleMenuCursorOf,
  classifyScreen,
  cursorOnOption,
  dialogueBoxLines,
  hasActiveCursor,
  hasAnyCursor,
  hasMorePrompt,
  isBattleMenuScreen,
  isBlankOrGraphicsScreen,
  isDexEntryScreen,
  isMoveQuestionOpen,
  isNamingKeyboardScreen,
  isSafariMenuScreen,
  isScreenFaded,
  isTargetMoveListOpen,
  partyScreenState,
  quantityPromptOf,
  startMenuState,
} from "./screen-state";
import { newBoxLines } from "./text-lines";

export { cursorOnOption };

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
  /**
   * A candy or TM stopped on a move question: once it's answered the game goes back to the bag, which
   * in Crystal fills the screen (no start menu peeking out to recognize it by). The next start-menu
   * opening backs out of it.
   */
  private bagLeftOpen = false;

  constructor(private core: BridgeCore) {}

  /** Checks twice across 16 frames whether the blinking `▼` more-text indicator is present in the text box. */
  private async textBoxHasMore(): Promise<boolean> {
    const gb = this.core.requireGb();
    for (let i = 0; i < 2; i++) {
      if (hasMorePrompt(this.core.textBoxRows())) return true;
      await gb.runFrames(16, 8);
    }
    return false;
  }

  /**
   * Presses A through dialogue until a choice/menu (▶ cursor) appears, the
   * text box closes, or the limit is hit. Returns every message seen.
   */
  async advanceText(maxPresses: number, opts: { pastTheEnd?: boolean } = {}): Promise<{ messages: string[]; stopped: string }> {
    const gb = this.core.requireGb();
    const messages: string[] = [];
    let lastBox: string[] = [];
    let lastLine = -1;
    let emptyWaits = 0;
    let pictureNudged = false;
    let quantityWaits = 0;
    let quantityText: string | null = null;
    let hp = this.core.host.battleHp();
    // Messages seen since the battle screen opened (a trainer's line comes before it).
    let battleFrom = this.core.host.position().battle ? 0 : -1;

    for (let presses = 0; presses < maxPresses; ) {
      if (battleFrom < 0 && this.core.host.position().battle) battleFrom = messages.length;
      const lines = await this.core.settledScreen();
      const box = this.core.textBox(lines);
      const now = this.core.host.battleHp();
      if (hp && now) messages.push(...hpChanges(hp, now));
      hp = now;

      // Text scrolls up a line at a time; record each line once. Menu rows are choices, not messages.
      const text = dialogueBoxLines(box.lines, this.core.layout);
      const read = newBoxLines(lastBox, text);
      if (read.replaceLast !== null && lastLine >= 0) messages[lastLine] = read.replaceLast;
      for (const line of read.add) lastLine = messages.push(line) - 1;
      if (text.length) lastBox = text;

      // A shop's quantity box ("×01") has no ▶: up/down change it and A confirms, unless ▼ or
      // changed text underneath shows dialogue continuing after a purchase.
      const qty = quantityPromptOf(lines, this.core.host.position().battle);
      if (qty) {
        quantityText ??= box.lines.join("\n");
        const moreText = box.lines.join("\n") !== quantityText || (await this.textBoxHasMore());
        if (!moreText) {
          await gb.runFrames(40, 8);
          if (quantityWaits++ < 5 && this.core.screenText().join("\n") !== lines.join("\n")) continue;
          return { messages, stopped: `a quantity to choose (${qty}): press up/down to change it, then a to confirm` };
        }
      }

      // A ▼ in the text box means more text — that wins over a menu still drawn behind it.
      if (hasActiveCursor(lines) && !(await this.textBoxHasMore())) {
        return { messages, stopped: "a menu or choice is waiting for input" };
      }
      if (!opts.pastTheEnd && this.core.host.brief()?.outcome) return { messages, stopped: "the run ended" };

      if (!box.open) {
        if (isDexEntryScreen(lines, this.core.layout) || hasMorePrompt(lines)) {
          await this.core.tap("a", 4, 24);
          presses++;
          continue;
        }
        const pos = this.core.host.position();
        const patience = pos.scripted ? 30 : (pos.battle && battleFrom >= 0 && messages.length === battleFrom) || pos.battleSoon ? 15 : 3;
        if (emptyWaits++ < patience) {
          await gb.runFrames(20, 8);
          continue;
        }
        // Crystal's starter balls show the Pokémon over a blank text screen and wait for A once.
        if (pos.scripted && !pos.battle && !pictureNudged && isBlankOrGraphicsScreen(lines)) {
          pictureNudged = true;
          emptyWaits = 0;
          await this.core.tap("a", 4, 24);
          presses++;
          continue;
        }
        return { messages, stopped: "no text on screen" };
      }

      if (!box.lines.length && emptyWaits++ < 6) {
        await gb.runFrames(20, 8);
        continue;
      }
      emptyWaits = 0;
      await this.core.tap("a", 4, 24);
      presses++;
    }
    return { messages, stopped: "press limit reached" };
  }

  cursorOn(option: string, exact = false): boolean {
    return cursorOnOption(this.core.screenText(), option, exact);
  }

  /**
   * One step of a menu cursor that checks the press landed: retries once after a short pause if
   * nothing moved (Crystal's bag can drop a press right after opening).
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
  async choose(option: string, opts: { exact?: boolean } = {}): Promise<unknown> {
    if (!option.trim()) throw new Error("option is required, e.g. YES");
    if (!hasActiveCursor(this.core.screenText())) await this.advanceText(10);
    const lines = this.core.screenText();
    const state = classifyScreen(lines, this.core.layout, { inBattle: this.core.host.position().battle });
    if (state.kind === "quantity_prompt") {
      throw new Error(`No menu cursor (▶) on screen: a quantity is being chosen (${state.quantity}). press up/down to change it, then a to confirm.`);
    }
    if (!hasActiveCursor(lines)) throw new Error("No menu cursor (▶) on screen.");
    if (isNamingKeyboardScreen(lines)) {
      throw new Error("The naming keyboard is open: choose doesn't type. press name:NAME types a name (letters, up to 10) and confirms it.");
    }

    const action = battleAction(this.core.layout, option);
    if (action && this.battleMenuCursor()) {
      if (!(await this.battleMenuTo(action))) throw new Error(`Couldn't put the cursor on "${option}". Screen:\n${this.core.screenText().join("\n")}`);
      await this.core.tap("a", 4, 20);
      const after = await this.advanceText(30);
      return this.core.result({ chose: option, messages: after.messages, stopped: after.stopped });
    }

    const plan: Button[] = [
      ...Array<Button>(20).fill("down"), "right",
      ...Array<Button>(3).fill("up"), ...Array<Button>(3).fill("down"), "left",
    ];
    const label = menuLabel(option);
    const sweep = async (exact: boolean) => {
      let found = this.cursorOn(label, exact);
      for (let i = 0; i < 20 && !found; i++) {
        const moved = await this.menuStep("up");
        found = this.cursorOn(label, exact);
        if (!moved) break;
      }
      for (const step of plan) {
        if (found) break;
        await this.menuStep(step);
        found = this.cursorOn(label, exact);
      }
      return found;
    };
    const found = (await sweep(true)) || (!opts.exact && (await sweep(false)));
    if (!found) throw new Error(`Couldn't put the cursor on "${option}". Screen:\n${this.core.screenText().join("\n")}`);
    await this.core.tap("a", 4, 20);
    const after = await this.advanceText(30);
    await this.closeBagAfterMoveQuestion(after.messages);
    return this.core.result({ chose: option, messages: after.messages, stopped: after.stopped });
  }

  private async closeBagAfterMoveQuestion(messages: string[]): Promise<void> {
    if (!this.bagLeftOpen || this.moveQuestionOpen() || !/\blearned\b|did not learn/i.test(messages.join(" "))) return;
    this.bagLeftOpen = false;
    await this.closeMenus();
  }

  forgetBagLeftOpen(): void {
    this.bagLeftOpen = false;
  }

  async chooseInBag(item: string): Promise<unknown> {
    const pockets = this.core.layout.bagPockets;
    if (pockets <= 1) return this.choose(item, { exact: true });
    const label = menuLabel(item);
    const scan = async (dir: Button) => {
      for (let i = 0; i < 30; i++) {
        if (this.cursorOn(label, true)) return true;
        if (!(await this.menuStep(dir))) return this.cursorOn(label, true);
      }
      return this.cursorOn(label, true);
    };
    const settle = async () => {
      for (let i = 0; i < 12 && !hasActiveCursor(this.core.screenText()); i++) await this.core.requireGb().runFrames(5, 5);
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
      const pocketNow = () => this.core.game.bagPocket?.(this.core.requireGb());
      const from = pocketNow();
      for (let tries = 0; tries < 4; tries++) {
        await this.core.tap("right", 6, 12);
        await settle();
        if (from === undefined || pocketNow() !== from) break;
      }
    }
    throw new Error(`Couldn't find "${item}" in the bag's pockets. Screen:\n${this.core.screenText().join("\n")}`);
  }

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
    const backOut = async (why: string) => {
      const screen = this.core.screenText().join("\n");
      await this.closeMenus();
      throw new Error(`${why}, so the party wasn't reordered. Screen:\n${screen}`);
    };
    if (!(await this.steerParty(target.slot - 1))) await backOut(`Couldn't put the cursor on ${target.nickname}`);
    await this.core.tap("a", 4, 30);
    await this.choose("SWITCH");
    if (!(await this.steerParty(0))) await backOut("Couldn't put the cursor on the lead's slot");
    await this.core.tap("a", 4, 60);
    await this.core.tap("b", 4, 20);
    await this.core.tap("b", 4, 20);
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

  async rareCandy(slot: number, toLevel?: number): Promise<unknown> {
    if (this.core.host.position().battle) throw new Error("Rare Candies are used outside battle.");
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
    if (!first.bag.some((it) => /RARE CANDY/i.test(it.item) && it.qty > 0)) throw new Error("There are no Rare Candies in the bag.");
    const mon = first.party.find((m) => m.slot === slot);
    if (!mon) throw new Error(`No Pokémon in slot ${slot} (${first.party.map((m) => `${m.slot}=${m.nickname}`).join(", ")}).`);
    if (toLevel == null || !Number.isFinite(toLevel)) throw new Error(`Say which level to raise ${mon.nickname} (Lv${mon.level}) to.`);
    if (first.cap != null && toLevel > first.cap) throw new Error(`Rare Candies can't take ${mon.nickname} past the level cap (Lv${first.cap}).`);
    const target = Math.min(toLevel, 100);
    if (mon.level >= target) return this.core.result({ messages: [`${mon.nickname} is already Lv${mon.level} (target Lv${target}).`] });

    const log: string[] = [];
    await this.openStartMenu();
    await this.choose(this.core.layout.startMenu.bag);
    for (let i = 0; i < 100; i++) {
      const level = read().party.find((m) => m.slot === slot)?.level ?? 0;
      if (level >= target) break;
      await this.chooseInBag("RARE CANDY");
      await this.choose("USE");
      if (!(await this.steerParty(slot - 1))) {
        const screen = this.core.screenText().join("\n");
        await this.closeMenus();
        throw new Error(`Couldn't put the cursor on ${mon.nickname} (slot ${slot}), so no candy was used${log.length ? " this time" : ""}. Screen:\n${screen}`);
      }
      await this.core.tap("a", 4, 30);
      const after = await this.advanceText(40, { pastTheEnd: true });
      log.push(...after.messages);
      if (this.cursorOn("YES") || after.messages.some((m) => this.core.layout.texts.moveQuestion.test(m))) {
        this.bagLeftOpen = true;
        return this.core.result({ messages: log, stopped: "a move-learning question is open: answer with choose (YES, then the move to forget, or NO)" });
      }
    }
    await this.closeMenus();
    const done = read().party.find((m) => m.slot === slot);
    const events = log.join(" ").match(/\S+ (?:grew to level \d+|evolved into [A-Z.'♀♂ -]+?!|learned [A-Z -]+?!|forgot [A-Z -]+?!)/g) ?? [];
    return this.core.result({ messages: [...events, `${done?.nickname} is Lv${done?.level}.`] });
  }

  async typeName(name: string): Promise<void> {
    if (!/^[A-Z]{1,10}$/.test(name)) throw new Error(`"${name}" can't be typed: capital letters A–Z only, up to 10.`);
    await this.core.requireGb().runFrames(60, 8);
    const { lettersPerRow, nameRow, confirm } = this.core.layout.keyboard;
    const typed = () => (this.core.screenText()[nameRow] ?? "").replace(/[^A-Z]/g, "");
    let row = 0;
    let col = 0;
    for (let attempt = 0; attempt < 2; attempt++) {
      for (let i = 0; i < 10 && typed(); i++) await this.core.tap("b", 4, 10);
      for (const ch of name) {
        const i = ch.charCodeAt(0) - 65;
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

  async startGame(name: string, rival: string): Promise<unknown> {
    const gb = this.core.requireGb();
    if (!/^[A-Z]{1,7}$/.test(name) || !/^[A-Z]{1,7}$/.test(rival)) {
      throw new Error("Names must be 1–7 capital letters A–Z.");
    }
    if (this.core.host.brief()?.lead) {
      throw new Error("start_game only works on a fresh run (this one already has a Pokémon).");
    }
    for (let i = 0; i < 60 && !this.cursorOn("NEW GAME"); i++) {
      await this.core.tap("start", 6, 45);
      if (this.startMenuShown()) {
        await this.closeMenus();
        throw new Error("The game has already started: you're in the game world. Walk on from here (start_game is for the title screen).");
      }
    }
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

    const log: string[] = [];
    await this.core.tap("a", 4, 60);
    for (let i = 0; i < 4 && !this.cursorOn("NEW NAME"); i++) log.push(...(await this.advanceText(60)).messages);
    await this.core.tap("a", 4, 30);
    await this.typeName(name);
    for (let i = 0; i < 6 && !this.cursorOn("NEW NAME"); i++) log.push(...(await this.advanceText(60)).messages);
    await this.core.tap("a", 4, 30);
    await this.typeName(rival);
    for (let i = 0; i < 6; i++) {
      const r = await this.advanceText(60);
      log.push(...r.messages);
      if (!r.messages.length && r.stopped === "no text on screen") break;
    }
    await gb.runFrames(120, 8);
    return this.core.result({ messages: log.slice(-6), map: this.core.mapText() });
  }

  private async startCrystal(name: string): Promise<unknown> {
    const gb = this.core.requireGb();
    const log: string[] = [];
    await this.core.tap("a", 4, 60);
    for (let i = 0; i < 40 && !this.cursorOn("NEW NAME"); i++) {
      const r = await this.advanceText(20);
      log.push(...r.messages);
      if (!this.cursorOn("NEW NAME")) await this.core.tap("a", 4, 30);
    }
    if (!this.cursorOn("NEW NAME")) throw new Error(`Couldn't reach the naming menu. Screen:\n${this.core.screenText().join("\n")}`);
    await this.core.tap("a", 4, 30);
    await this.typeName(name);
    for (let i = 0; i < 6; i++) {
      const r = await this.advanceText(60);
      log.push(...r.messages);
      if (!r.messages.length && r.stopped === "no text on screen") break;
    }
    await gb.runFrames(120, 8);
    return this.core.result({ messages: log.slice(-6), map: this.core.mapText() });
  }

  private currentPartyState() {
    const names = (this.core.summary()?.party ?? []).map((m) => m.nickname);
    return partyScreenState(this.core.screenText(), this.core.layout, names);
  }

  partyCursorRow(): number {
    return this.currentPartyState().row;
  }

  private partyScreenOpen(): boolean {
    return this.currentPartyState().open;
  }

  private partyCursor(): number {
    return this.currentPartyState().slot;
  }

  async steerParty(slot: number): Promise<boolean> {
    return steerPartyCursor({
      cursor: () => this.partyCursor(),
      wait: () => this.core.requireGb().runFrames(6, 6),
      press: (dir) => this.core.tap(dir, 4, 10),
    }, slot);
  }

  battleMenuCursor(): BattleAction | null {
    return battleMenuCursorOf(this.core.screenText(), this.core.layout);
  }

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
    return isBattleMenuScreen(this.core.screenText(), this.core.layout);
  }

  atSafariMenu(): boolean {
    return isSafariMenuScreen(this.core.screenText(), this.core.layout);
  }

  private moveQuestionOpen(): boolean {
    return isMoveQuestionOpen(this.core.screenText(), this.core.layout);
  }

  private startMenuShown(): boolean {
    return startMenuState(this.core.screenText(), this.core.layout).shown;
  }

  async openStartMenu(): Promise<void> {
    if (this.moveQuestionOpen()) {
      throw new Error("A move-learning question is still open on screen: answer it with choose (YES, then the move to forget, or NO) first.");
    }
    const startNow = () => startMenuState(this.core.screenText(), this.core.layout);
    if (this.bagLeftOpen) {
      this.bagLeftOpen = false;
      for (let i = 0; i < 4 && hasActiveCursor(this.core.screenText()) && !startNow().ready; i++) {
        await this.core.tap("b", 4, 16);
        await this.core.settledScreen();
      }
    }
    for (let i = 0; i < 10; i++) {
      const st = startNow();
      if (st.hasExit && !st.hasBag) await this.core.tap("b", 4, 16);
      else if (hasActiveCursor(this.core.screenText())) break;
      else if (this.core.textBox(this.core.screenText()).open) await this.advanceText(10);
      else await this.core.tap("start", 6, 30);
    }
    if (hasActiveCursor(this.core.screenText()) && !startNow().ready) {
      throw new Error(`Another menu is open on screen: close it first (press b, or answer it with choose). Screen:\n${this.core.screenText().join("\n")}`);
    }
  }

  private async closeMenus(): Promise<void> {
    for (let i = 0, clear = 0; i < 12 && clear < 2; i++) {
      await this.core.requireGb().runFrames(10, 8);
      const lines = this.core.screenText();
      if (isScreenFaded(lines)) {
        clear = 0;
        continue;
      }
      if (this.startMenuShown() || hasAnyCursor(lines)) {
        clear = 0;
        await this.core.tap("b", 4, 16);
      } else clear++;
    }
  }

  async useItem(query: string, target: string | null, move: string | null = null): Promise<unknown> {
    if (this.core.host.position().battle) throw new Error("item: outside battle only (items in battle break the Nuzlocke rules; use 'ball' for Poké Balls).");
    const norm = (x: string) => x.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const summary = this.core.summary();
    const bag = summary?.bag ?? [];
    const it = bag.find((b) => norm(b.item) === norm(query));
    if (!it) {
      const like = bag.filter((b) => norm(b.item).includes(norm(query))).map((b) => b.item);
      throw new Error(`No "${query}" in the bag${like.length ? ` (similar: ${like.join(", ")}: name the one you mean)` : ""}. In the bag: ${bag.map((b) => b.item).join(", ") || "nothing"}.`);
    }
    const mon = target ? this.core.partyMember(target) : null;
    const monMoves = (mon ? summary?.party?.find((m) => m.slot === mon.slot)?.moves ?? [] : []).map((m) => m.split(":")[0]);
    if (move && mon && !monMoves.some((n) => norm(n) === norm(move))) throw new Error(`${mon.nickname} doesn't know ${move} (its moves: ${monMoves.join(", ")}).`);
    await this.openStartMenu();
    await this.choose(this.core.layout.startMenu.bag);
    await this.chooseInBag(it.item);
    const use = (await this.choose("USE")) as { messages?: string[] };
    const messages = [...(use.messages ?? [])];
    if (this.cursorOn("YES") && messages.some((m) => this.core.layout.texts.teachQuestion.test(m))) {
      messages.push(...((((await this.choose("YES")) as { messages?: string[] }).messages) ?? []));
    }
    if (messages.some((m) => /which/i.test(m)) || this.partyScreenOpen()) {
      if (!mon) {
        await this.closeMenus();
        throw new Error(`${it.item} needs a target: use_item again with pokemon (a nickname, species or slot). Nothing was used.`);
      }
      if (!(await this.steerParty(mon.slot - 1))) throw new Error(`Couldn't put the cursor on ${mon.nickname}.`);
      await this.core.tap("a", 4, 30);
      messages.push(...(await this.advanceText(20)).messages);
      const evolving = () => /evolving/i.test(messages.join(" ")) && !/evolved\s+into/i.test(messages.join(" "));
      for (let i = 0; i < 8 && evolving() && !hasActiveCursor(this.core.screenText()); i++) {
        await this.core.requireGb().runFrames(60, 8);
        messages.push(...(await this.advanceText(20)).messages);
      }
      if (this.cursorOn("YES") && this.core.layout.texts.moveQuestion.test(messages.join(" "))) {
        this.bagLeftOpen = true;
        return this.core.result({ used: it.item, on: mon?.nickname, messages, stopped: "a move-learning question is open: answer with choose (YES, then the move to forget, or NO)" });
      }
      if (isTargetMoveListOpen(this.core.screenText(), monMoves)) {
        if (!move) {
          await this.closeMenus();
          throw new Error(`${it.item} is used on one move: use_item again with move (${mon.nickname}'s moves: ${monMoves.join(", ")}). Nothing was used.`);
        }
        messages.push(...(((await this.choose(move)) as { messages?: string[] }).messages ?? []));
      }
    }
    await this.closeMenus();
    if (/ESCAPE ROPE/i.test(it.item) && !this.core.layout.texts.notNow.test(messages.join(" "))) await this.core.awaitWarp();
    return this.core.result({ used: it.item, on: mon?.nickname, messages });
  }
}
