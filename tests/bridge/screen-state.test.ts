// Pure screen-text recognizers on Gen 1 & Gen 2 18-row fixtures.

import { describe, expect, it } from "vitest";
import {
  battleAction,
  battleMenuCursorOf,
  dialogueBoxLines,
  isBattleMenuScreen,
  isBlankOrGraphicsScreen,
  isDexEntryScreen,
  isMoveQuestionOpen,
  isNamingKeyboardScreen,
  isPartyScreenOpen,
  isSafariMenuScreen,
  isScreenFaded,
  isStartMenuShown,
  isTargetMoveListOpen,
  partyCursorRowOf,
  partyCursorSlotOf,
  quantityPromptOf,
  quantityTextOf,
  startMenuRows,
} from "../../src/bridge/screen-state";
import { gen1Adapter } from "../../src/games/gen1";
import { gen2Adapter } from "../../src/games/gen2";
import { screenRows, textBoxScreen } from "../harness/fake-bridge";

const gen1 = gen1Adapter("red").screen;
const gen2 = gen2Adapter().screen;

describe("screen-state recognizers", () => {
  it("recognizes Gen 1, Crystal, and Safari battle menus and resolves cursor positions", () => {
    const g1 = textBoxScreen(gen1, ["", "▶FIGHT PKMN", "", " ITEM  RUN"]);
    expect(isBattleMenuScreen(g1, gen1)).toBe(true);
    expect(battleMenuCursorOf(g1, gen1)).toBe("fight");
    expect(battleAction(gen1, "pkmn")).toBe("party");

    const g2 = textBoxScreen(gen2, ["", " FIGHT PKMN", "", "▶PACK  RUN"]);
    expect(isBattleMenuScreen(g2, gen2)).toBe(true);
    expect(battleMenuCursorOf(g2, gen2)).toBe("bag");
    expect(battleAction(gen2, "pack")).toBe("bag");

    const [s1, s2] = gen1.safariMenu.labels;
    const safari = screenRows({ 14: `▶${s1}×30  ${s2}` });
    expect(isSafariMenuScreen(safari, gen1)).toBe(true);
    expect(isBattleMenuScreen(safari, gen1)).toBe(true);
  });

  it("reads party cursor row/slot from screen lines and distinguishes Crystal's bag list from the party screen", () => {
    // Crystal's bag places ▶ on row 2 too, but no party member's nickname is next to it.
    const bagPocket = screenRows({ 2: "       ▶SUPER REPEL ×3", 4: "        CANCEL" });
    expect(partyCursorRowOf(bagPocket, gen2)).toBe(2);
    expect(isPartyScreenOpen(bagPocket, gen2, ["CYNDA", "PIDGEY"])).toBe(false);

    const party = screenRows({ 1: "  CYNDA      Lv14", 2: "▶ HP: 38/38" });
    expect(partyCursorRowOf(party, gen2)).toBe(2);
    expect(partyCursorSlotOf(party, gen2)).toBe(gen2.partyScreen.slotAt(2));
    expect(isPartyScreenOpen(party, gen2, ["CYNDA", "PIDGEY"])).toBe(true);
  });

  it("detects naming keyboards (and rejects ordinary menus/dialogue), shop quantities, Gen 1 & Crystal dex entries, move questions, and fades", () => {
    const keyboard = screenRows({ 2: "YOUR NAME?", 6: "▶A B C D E F G H I", 8: " J K L M N O P Q R" });
    expect(isNamingKeyboardScreen(keyboard)).toBe(true);
    expect(isNamingKeyboardScreen(screenRows({ 8: "│▶YES│", 9: "│ NO │", 14: "ABCDEFGHI?" }))).toBe(false);
    expect(isNamingKeyboardScreen(screenRows({ 14: "A B C D E F G H" }))).toBe(false);

    const qty = screenRows({ 9: "│ ×03   ¥600 │", 14: "How many?" });
    expect(quantityTextOf(qty)).toBe("×03");
    expect(quantityPromptOf(qty, false)).toBe("×03");
    expect(quantityPromptOf(qty, true)).toBeNull();

    const [g1d1, g1d2] = gen1.dexEntry.labels;
    expect(isDexEntryScreen(screenRows({ 3: `${g1d1} 2'04"`, 5: `${g1d2} 15.0lb` }), gen1)).toBe(true);
    expect(isDexEntryScreen(screenRows({ 3: `${g1d1} 2'04"` }), gen1)).toBe(false);

    const [g2d1, g2d2] = gen2.dexEntry.labels;
    expect(isDexEntryScreen(screenRows({ 4: `${g2d1} 1'08"`, 6: `${g2d2} 17.0lb` }), gen2)).toBe(true);
    expect(isDexEntryScreen(screenRows({ 4: `${g2d1} 1'08"` }), gen2)).toBe(false);

    const moveQ = screenRows({ 8: "│▶YES│", 9: "│ NO │", 14: "Delete an older", 16: "move to make room?" });
    expect(isMoveQuestionOpen(moveQ, gen1)).toBe(true);

    const crystalStopQ = screenRows({ 8: "│▶YES│", 9: "│ NO │", 14: "Stop learning", 16: "EMBER?" });
    expect(isMoveQuestionOpen(crystalStopQ, gen2)).toBe(true);

    expect(isScreenFaded(["(Screen faded to white)"])).toBe(true);
    expect(isBlankOrGraphicsScreen(["", "  ", "(No text on screen)"])).toBe(true);
    expect(isBlankOrGraphicsScreen(keyboard)).toBe(false);
  });

  it("strips battle-menu choice rows from dialogue boxes and detects Gen 1 & Crystal start-menu / move-picker states", () => {
    expect(dialogueBoxLines(["Enemy RATTATA", "used TACKLE!", "▶FIGHT PKMN", "ITEM  RUN"], gen1))
      .toEqual(["Enemy RATTATA", "used TACKLE!"]);
    expect(dialogueBoxLines(["Wild SENTRET", "appeared!", "▶FIGHT PKMN", "PACK  RUN"], gen2))
      .toEqual(["Wild SENTRET", "appeared!"]);

    const coveredStart = screenRows({ 2: "          │POKéDEX│", 10: "          │ EXIT  │" });
    expect(isStartMenuShown(coveredStart, gen1)).toBe(true);
    expect(startMenuRows(coveredStart, gen1)).toEqual({ hasBag: false, hasExit: true, ready: false });

    const fullStart = screenRows({ 2: "          │▶POKéDEX│", 6: "          │ ITEM   │", 10: "          │ EXIT   │" });
    expect(isStartMenuShown(fullStart, gen1)).toBe(true);
    expect(startMenuRows(fullStart, gen1).ready).toBe(true);

    // Crystal before receiving the Pokédex has no POKéDEX row, only PKMN / PACK / … / EXIT.
    const crystalEarlyStart = screenRows({ 2: "          │▶PKMN  │", 4: "          │ PACK  │", 10: "          │ EXIT  │" });
    expect(isStartMenuShown(crystalEarlyStart, gen2)).toBe(true);
    expect(startMenuRows(crystalEarlyStart, gen2)).toEqual({ hasBag: true, hasExit: true, ready: true });

    const crystalBagOverStart = screenRows({ 2: "       ▶POTION ×2", 12: "          │ EXIT  │" });
    expect(isStartMenuShown(crystalBagOverStart, gen2)).toBe(true);
    expect(startMenuRows(crystalBagOverStart, gen2)).toEqual({ hasBag: false, hasExit: true, ready: false });

    const etherMoves = screenRows({ 8: "│▶THUNDERSHOCK│", 9: "│ GROWL       │" });
    expect(isTargetMoveListOpen(etherMoves, ["THUNDERSHOCK", "GROWL"])).toBe(true);
    expect(isTargetMoveListOpen(etherMoves, ["SURF", "CUT"])).toBe(false);
  });
});
