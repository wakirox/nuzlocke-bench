// Pure screen-text recognizers and state classifier for Gen 1 & Gen 2 menus and dialogue.
// Turning 18-row decoded screen arrays into typed predicates and a discriminated `ScreenState`
// keeps frame-stepping loops in `menus.ts` free of inline regexes and lets every screen collision
// (Crystal's bag vs. party screen, shop quantities, BUBBLE vs. BUBBLEBEAM, fades) be unit-tested
// directly on static string fixtures.

import type { BattleAction, ScreenLayout } from "../games/adapter";

/** Escapes a literal label for safe use inside `new RegExp(...)`. */
export const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normAlphaNum = (s: string): string => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** A battle-menu option named in `choose("PKMN"…)` (by its label on screen), or null for any other menu's. */
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
 * Is the ▶ cursor directly in front of `option` anywhere on screen?
 * Prefix matches ("POKé" for POKéMON) apply unless the screen also lists `option` by itself
 * (BUBBLE vs. BUBBLEBEAM) or `exact` is true.
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

/** Whether the naming keyboard ("A B C D E F G H I") is open on screen. */
export function isNamingKeyboardScreen(lines: string[]): boolean {
  return lines.some((l) => /A B C D E F G H I/.test(l.replace(/▶/g, " ").replace(/ +/g, " ")));
}

/** Whether a full-screen Pokédex registration page is shown (recognized by its two labels). */
export function isDexEntryScreen(lines: string[], layout: ScreenLayout): boolean {
  const [l1, l2] = layout.dexEntry.labels.map((w) => new RegExp(`\\b${escapeRe(w)}\\b`));
  return lines.some((l) => l1.test(l)) && lines.some((l) => l2.test(l));
}

/** Filters text-box rows down to narrative dialogue lines, dropping menu cursors and the battle menu's bottom row. */
export function dialogueBoxLines(boxLines: string[], layout: ScreenLayout): string[] {
  const { bag, run } = layout.battleMenu;
  const menuRow = new RegExp(`^${escapeRe(bag.label)}\\s+${escapeRe(run.label)}$`);
  return boxLines.filter((line) => !/[▶▷]/.test(line) && !menuRow.test(line));
}

/** Returns the active shop/item quantity string (e.g. "×01") when outside battle with no ▶ cursor, or null. */
export function quantityPromptOf(lines: string[], inBattle: boolean): string | null {
  if (inBattle || hasActiveCursor(lines)) return null;
  for (const line of lines) {
    const m = /×\d\d/.exec(line);
    if (m) return m[0];
  }
  return null;
}

/** Where the battle menu's ▶ sits (`fight` / `party` / `bag` / `run`), or null when that menu isn't up. */
export function battleMenuCursorOf(lines: string[], layout: ScreenLayout): BattleAction | null {
  const menu = layout.battleMenu;
  const actions = Object.keys(menu) as BattleAction[];
  const onOption = new RegExp(`▶\\s*(${actions.map((a) => escapeRe(menu[a].label)).join("|")})\\b`);
  const hasTopRow = lines.some((x) => x.includes(menu.fight.label) && x.includes(menu.party.label));
  if (!hasTopRow) return null;
  for (const l of lines) {
    const m = onOption.exec(l);
    if (m) return actions.find((a) => menu[a].label === m[1])!;
  }
  return null;
}

/** The Safari Zone / reserve battle menu (`BALL×N` / `BAIT` / `THROW ROCK` / `RUN`). */
export function isSafariMenuScreen(lines: string[], layout: ScreenLayout): boolean {
  const [a, b] = layout.safariMenu.labels;
  return lines.some((l) => l.includes(a) && l.includes(b));
}

export function isBattleMenuScreen(lines: string[], layout: ScreenLayout): boolean {
  const menu = layout.battleMenu;
  return lines.some((l) => l.includes(menu.fight.label) && l.includes(menu.party.label)) || isSafariMenuScreen(lines, layout);
}

/** A move-learning question (or its follow-up) waiting for a choice on screen. */
export function isMoveQuestionOpen(lines: string[], layout: ScreenLayout): boolean {
  return layout.texts.moveQuestion.test(lines.join(" ")) && hasActiveCursor(lines);
}

/** Start-menu visibility: `shown` (box border + DEX/EXIT, even mid-fade) and `ready` (both BAG and EXIT uncovered). */
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

/**
 * Party-screen cursor inspection. `open` verifies a party member's nickname appears beside ▶ so
 * Crystal's bag list (which also places ▶ in the top rows) isn't mistaken for the party screen.
 */
export function partyScreenState(
  lines: string[],
  layout: ScreenLayout,
  partyNames: string[],
): { row: number; slot: number; open: boolean } {
  const row = lines.slice(0, layout.partyScreen.rows).findIndex((l) => l.includes("▶"));
  if (row < 0) return { row: -1, slot: -1, open: false };
  const slot = layout.partyScreen.slotAt(row);
  const names = partyNames.map((n) => n.toUpperCase()).filter(Boolean);
  const near = lines.slice(Math.max(0, row - 1), row + 2).join(" ").toUpperCase();
  return { row, slot, open: names.some((n) => near.includes(n)) };
}

/** Whether a single-move item picker (ETHER, PP UP) has opened the target Pokémon's move list. */
export function isTargetMoveListOpen(lines: string[], monMoves: string[]): boolean {
  const want = monMoves.map(normAlphaNum).filter(Boolean);
  if (!want.length) return false;
  const cell = (l: string) => normAlphaNum(l.slice(l.indexOf("▶") + 1).split(/\s{2,}|[│┐┘]/)[0]);
  return lines.some((l) => l.includes("▶") && want.includes(cell(l)));
}

export type ScreenState =
  | { kind: "faded" }
  | { kind: "naming_keyboard" }
  | { kind: "battle_menu"; cursor: BattleAction | null }
  | { kind: "safari_menu" }
  | { kind: "move_question" }
  | { kind: "party_screen"; row: number; slot: number }
  | { kind: "start_menu"; ready: boolean }
  | { kind: "quantity_prompt"; quantity: string }
  | { kind: "dex_entry" }
  | { kind: "choice_menu" }
  | { kind: "dialogue"; more: boolean }
  | { kind: "blank" }
  | { kind: "overworld" };

/** Classifies a decoded 18-row screen into its primary interactive `ScreenState`. */
export function classifyScreen(
  lines: string[],
  layout: ScreenLayout,
  opts: { inBattle?: boolean; textBoxOpen?: boolean; partyNames?: string[] } = {},
): ScreenState {
  if (isScreenFaded(lines)) return { kind: "faded" };
  if (isNamingKeyboardScreen(lines)) return { kind: "naming_keyboard" };
  if (isSafariMenuScreen(lines, layout)) return { kind: "safari_menu" };
  const battleCursor = battleMenuCursorOf(lines, layout);
  if (battleCursor || isBattleMenuScreen(lines, layout)) return { kind: "battle_menu", cursor: battleCursor };
  if (isMoveQuestionOpen(lines, layout)) return { kind: "move_question" };
  const party = partyScreenState(lines, layout, opts.partyNames ?? []);
  if (party.open) return { kind: "party_screen", row: party.row, slot: party.slot };
  const start = startMenuState(lines, layout);
  if (start.shown) return { kind: "start_menu", ready: start.ready };
  const quantity = quantityPromptOf(lines, Boolean(opts.inBattle));
  if (quantity) return { kind: "quantity_prompt", quantity };
  if (hasActiveCursor(lines)) return { kind: "choice_menu" };
  if (opts.textBoxOpen) return { kind: "dialogue", more: hasMorePrompt(lines) };
  if (isDexEntryScreen(lines, layout)) return { kind: "dex_entry" };
  if (isBlankOrGraphicsScreen(lines)) return { kind: "blank" };
  return { kind: "overworld" };
}
