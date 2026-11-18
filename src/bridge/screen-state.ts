// Pure screen-text recognizers for Gen 1 & Gen 2 menus and dialogue, extracted from `menus.ts`
// so every screen check (Crystal's bag vs. party screen, shop quantities, BUBBLE vs. BUBBLEBEAM,
// battle-menu cursors, start-menu fades) can be unit-tested on static 18-row string fixtures.

import type { BattleAction, ScreenLayout } from "../games/adapter";

/** A menu label as a regular expression that matches just that text. */
export const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normAlphaNum = (s: string): string => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** A battle-menu option named in choose("PKMN"…) (by its label on screen), or null for any other menu's. */
export function battleAction(layout: ScreenLayout, option: string): BattleAction | null {
  const letters = (s: string) => s.toUpperCase().replace(/[^A-Z]/g, "");
  const o = letters(option);
  return (Object.keys(layout.battleMenu) as BattleAction[]).find((a) => letters(layout.battleMenu[a].label) === o) ?? null;
}

/** The menu cells on screen as normalized text (letters and digits), and which of them the ▶ is on. */
export function menuCells(lines: string[]): { cursor: string[]; all: string[] } {
  // A price or count one space after the name ("POTION ¥300", "MAX REVIVE ×1") isn't part of it.
  const norm = (s: string) => normAlphaNum(s.replace(/\s*(?:¥\s*\d+|×\s*\d+)\s*$/, ""));
  const cursor: string[] = [];
  const all: string[] = [];
  for (const line of lines) {
    const i = line.indexOf("▶");
    if (i >= 0) cursor.push(norm(line.slice(i + 1).split(/\s{2,}|[│┐┘]/)[0]));
    for (const cell of line.split(/\s{2,}|[│┐┘┌└─▶▷]/)) if (norm(cell)) all.push(norm(cell));
  }
  return { cursor, all };
}

/**
 * Is the ▶ cursor directly in front of `option` anywhere on screen? The option under it may run on
 * ("POKé" for POKéMON), but not when the screen lists the option asked for by itself: of BUBBLEBEAM
 * and BUBBLE, "BUBBLE" means BUBBLE (a move question would otherwise forget the wrong move).
 * `exact`: only the option itself, never a longer one that starts with it.
 */
export function cursorOnOption(lines: string[], option: string, exact = false): boolean {
  const want = normAlphaNum(option);
  // Nothing to match ("?", "---"): every cell would start with it.
  if (!want) return false;
  const { cursor, all } = menuCells(lines);
  if (cursor.includes(want)) return true;
  return !exact && cursor.some((c) => c.startsWith(want)) && !all.includes(want);
}

export const hasActiveCursor = (lines: string[]): boolean => lines.some((l) => l.includes("▶"));
export const hasAnyCursor = (lines: string[]): boolean => lines.some((l) => l.includes("▶") || l.includes("▷"));
export const hasMorePrompt = (rows: string[]): boolean => rows.some((l) => l.includes("▼"));
export const isScreenFaded = (lines: string[]): boolean => lines.some((l) => l.includes("faded to white"));
export const isBlankOrGraphicsScreen = (lines: string[]): boolean => lines.every((l) => !l.trim() || l.startsWith("(No text"));

/** The naming keyboard isn't a menu of options: sweeping it would type letters. */
export function isNamingKeyboardScreen(lines: string[]): boolean {
  return lines.some((l) => /A B C D E F G H I/.test(l.replace(/▶/g, " ").replace(/ +/g, " ")));
}

/**
 * Full-screen encyclopedia entries (recognized by their two labels, the layout's dexEntry —
 * the ▼ only appears once the text is done).
 */
export function isDexEntryScreen(lines: string[], layout: ScreenLayout): boolean {
  const [l1, l2] = layout.dexEntry.labels.map((w) => new RegExp(`\\b${escapeRe(w)}\\b`));
  return lines.some((l) => l1.test(l)) && lines.some((l) => l2.test(l));
}

/**
 * Text-box lines without choices: menu rows (FIGHT/PKMN, YES/NO…) and the battle menu's second row
 * (ITEM RUN, which shows inside the text box) are choices, not messages.
 */
export function dialogueBoxLines(boxLines: string[], layout: ScreenLayout): string[] {
  const { bag, run } = layout.battleMenu;
  const menuRow = new RegExp(`^${escapeRe(bag.label)}\\s+${escapeRe(run.label)}$`);
  return boxLines.filter((line) => !/[▶▷]/.test(line) && !menuRow.test(line));
}

/** Any `×NN` quantity counter visible on screen (e.g. "×01"), or null. */
export function quantityTextOf(lines: string[]): string | null {
  return lines.join(" ").match(/×\d\d/)?.[0] ?? null;
}

/** A shop's quantity box ("×01") outside battle when no ▶ cursor is shown, or null. */
export function quantityPromptOf(lines: string[], inBattle: boolean): string | null {
  if (inBattle || hasActiveCursor(lines) || !lines.some((l) => /×\d\d/.test(l))) return null;
  return quantityTextOf(lines);
}

/** Where the battle menu's ▶ is (Gen 1: FIGHT PKMN / ITEM RUN), or null when that menu isn't up. */
export function battleMenuCursorOf(lines: string[], layout: ScreenLayout): BattleAction | null {
  const menu = layout.battleMenu;
  const actions = Object.keys(menu) as BattleAction[];
  const onOption = new RegExp(`▶\\s*(${actions.map((a) => escapeRe(menu[a].label)).join("|")})\\b`);
  for (const l of lines) {
    const m = onOption.exec(l);
    if (m && lines.some((x) => x.includes(menu.fight.label) && x.includes(menu.party.label))) {
      return actions.find((a) => menu[a].label === m[1])!;
    }
  }
  return null;
}

/** The game reserve's battle menu: BALL×N / BAIT / THROW ROCK / RUN (its own balls aren't in the bag). */
export function isSafariMenuScreen(lines: string[], layout: ScreenLayout): boolean {
  const [a, b] = layout.safariMenu.labels;
  return lines.some((l) => l.includes(a) && l.includes(b));
}

export function isBattleMenuScreen(lines: string[], layout: ScreenLayout): boolean {
  const menu = layout.battleMenu;
  return lines.some((l) => l.includes(menu.fight.label) && l.includes(menu.party.label)) || isSafariMenuScreen(lines, layout);
}

/** A move question waiting on screen, its follow-up included (Gen 1 "Abandon learning X?", Crystal "Stop learning X?"). */
export function isMoveQuestionOpen(lines: string[], layout: ScreenLayout): boolean {
  return layout.texts.moveQuestion.test(lines.join(" ")) && hasActiveCursor(lines);
}

/**
 * Start-menu visibility:
 * - `shown`: its box shows the encyclopedia or EXIT (even with its cursor hidden mid-fade; Crystal's
 *   has no encyclopedia entry until the player gets one).
 * - `ready`: both BAG and EXIT are visible (the bag left open covers all of it except its last rows).
 */
export function startMenuState(lines: string[], layout: ScreenLayout): {
  shown: boolean;
  hasBag: boolean;
  hasExit: boolean;
  ready: boolean;
} {
  const { bag, dex, exit } = layout.startMenu;
  const shows = (word: string) => lines.some((l) => new RegExp(`\\b${escapeRe(word)}\\b`).test(l));
  const shown = lines.some((l) => l.includes("│") && (l.includes(dex) || new RegExp(`│\\s*▶?${escapeRe(exit)}\\b`).test(l)));
  const hasBag = shows(bag);
  const hasExit = shows(exit);
  return { shown, hasBag, hasExit, ready: hasBag && hasExit };
}

/** The party screen's row with the ▶ on it, or -1 (reads screen lines only). */
export function partyCursorRowOf(lines: string[], layout: ScreenLayout): number {
  return lines.slice(0, layout.partyScreen.rows).findIndex((l) => l.includes("▶"));
}

/** The party screen's cursor slot (0-based; ▶ sits on each entry's HP row), or -1 (reads screen lines only). */
export function partyCursorSlotOf(lines: string[], layout: ScreenLayout): number {
  const row = partyCursorRowOf(lines, layout);
  return row >= 0 ? layout.partyScreen.slotAt(row) : -1;
}

/**
 * The party screen is up: its ▶ beside a party member's name (on its row or the next to it). A ▶ in
 * the top rows alone isn't proof: Crystal's bag list sits there too, and after a Super Repel it
 * was taken for the party screen asking for a target.
 */
export function isPartyScreenOpen(lines: string[], layout: ScreenLayout, partyNames: string[]): boolean {
  const row = partyCursorRowOf(lines, layout);
  if (row < 0) return false;
  const names = partyNames.map((n) => n.toUpperCase()).filter(Boolean);
  const near = lines.slice(Math.max(0, row - 1), row + 2).join(" ").toUpperCase();
  return names.some((n) => near.includes(n));
}

/** An item for one move (ETHER, PP UP) opens the Pokémon's moves: whether ▶ sits on one of `monMoves`. */
export function isTargetMoveListOpen(lines: string[], monMoves: string[]): boolean {
  const want = monMoves.map(normAlphaNum).filter(Boolean);
  if (!want.length) return false;
  const cell = (l: string) => normAlphaNum(l.slice(l.indexOf("▶") + 1).split(/\s{2,}|[│┐┘]/)[0]);
  return lines.some((l) => l.includes("▶") && want.includes(cell(l)));
}
