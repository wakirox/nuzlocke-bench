// Pure screen-state classification and menu/dialogue recognizers on Gen 1 & Gen 2 18-row fixtures.

import { describe, expect, it } from "vitest";
import {
  battleAction,
  classifyScreen,
  dialogueBoxLines,
  isTargetMoveListOpen,
  partyScreenState,
  quantityPromptOf,
  startMenuState,
} from "../../src/bridge/screen-state";
import { gen1Adapter } from "../../src/games/gen1";
import { gen2Adapter } from "../../src/games/gen2";
import { screenRows, textBoxScreen } from "../harness/fake-bridge";

const gen1 = gen1Adapter("red").screen;
const gen2 = gen2Adapter().screen;

describe("screen-state recognizer and classifier", () => {
  it("recognizes Gen 1 and Crystal battle menus and resolves cursor positions", () => {
    const g1 = textBoxScreen(gen1, ["", "▶FIGHT PKMN", "", " ITEM  RUN"]);
    expect(classifyScreen(g1, gen1, { inBattle: true })).toEqual({ kind: "battle_menu", cursor: "fight" });
    expect(battleAction(gen1, "pkmn")).toBe("party");

    const g2 = textBoxScreen(gen2, ["", " FIGHT PKMN", "", "▶PACK  RUN"]);
    expect(classifyScreen(g2, gen2, { inBattle: true })).toEqual({ kind: "battle_menu", cursor: "bag" });
    expect(battleAction(gen2, "pack")).toBe("bag");
  });

  it("distinguishes Crystal's bag pocket list from the party screen", () => {
    // Crystal's bag places ▶ on row 2 too, but no party member's nickname is next to it.
    const bagPocket = screenRows({ 2: "       ▶SUPER REPEL ×3", 4: "        CANCEL" });
    expect(partyScreenState(bagPocket, gen2, ["CYNDA", "PIDGEY"]).open).toBe(false);
    expect(classifyScreen(bagPocket, gen2, { partyNames: ["CYNDA", "PIDGEY"] })).toEqual({ kind: "choice_menu" });

    const party = screenRows({ 1: "  CYNDA      Lv14", 2: "▶ HP: 38/38" });
    expect(partyScreenState(party, gen2, ["CYNDA", "PIDGEY"])).toMatchObject({ open: true, row: 2 });
    expect(classifyScreen(party, gen2, { partyNames: ["CYNDA", "PIDGEY"] }).kind).toBe("party_screen");
  });

  it("detects naming keyboards, shop quantity prompts, dex entries, move questions, and fades", () => {
    const keyboard = screenRows({ 2: "YOUR NAME?", 6: "▶A B C D E F G H I", 8: " J K L M N O P Q R" });
    expect(classifyScreen(keyboard, gen1)).toEqual({ kind: "naming_keyboard" });

    const qty = screenRows({ 9: "│ ×03   ¥600 │", 14: "How many?" });
    expect(quantityPromptOf(qty, false)).toBe("×03");
    expect(quantityPromptOf(qty, true)).toBeNull();
    expect(classifyScreen(qty, gen1, { inBattle: false })).toEqual({ kind: "quantity_prompt", quantity: "×03" });

    const [d1, d2] = gen1.dexEntry.labels;
    const dex = screenRows({ 3: `${d1} 2'04"`, 5: `${d2} 15.0lb` });
    expect(classifyScreen(dex, gen1)).toEqual({ kind: "dex_entry" });

    const moveQ = screenRows({ 8: "│▶YES│", 9: "│ NO │", 14: "Delete an older", 16: "move to make room?" });
    expect(classifyScreen(moveQ, gen1, { textBoxOpen: true })).toEqual({ kind: "move_question" });

    expect(classifyScreen(["(Screen faded to white)"], gen1)).toEqual({ kind: "faded" });
  });

  it("strips battle-menu choice rows from dialogue boxes and detects start-menu / move-picker states", () => {
    expect(dialogueBoxLines(["Enemy RATTATA", "used TACKLE!", "▶FIGHT PKMN", "ITEM  RUN"], gen1))
      .toEqual(["Enemy RATTATA", "used TACKLE!"]);

    const coveredStart = screenRows({ 2: "          │POKéDEX│", 10: "          │ EXIT  │" });
    expect(startMenuState(coveredStart, gen1)).toEqual({ shown: true, hasBag: false, hasExit: true, ready: false });

    const fullStart = screenRows({ 2: "          │▶POKéDEX│", 6: "          │ ITEM   │", 10: "          │ EXIT   │" });
    expect(startMenuState(fullStart, gen1).ready).toBe(true);

    const etherMoves = screenRows({ 8: "│▶THUNDERSHOCK│", 9: "│ GROWL       │" });
    expect(isTargetMoveListOpen(etherMoves, ["THUNDERSHOCK", "GROWL"])).toBe(true);
    expect(isTargetMoveListOpen(etherMoves, ["SURF", "CUT"])).toBe(false);
  });
});
