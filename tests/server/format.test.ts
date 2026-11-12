// What tool results cost the model: they repeat only what changed.

import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM module without type declarations
import { MAP_LEGEND, NAMING_HINT, createFormatter, hideEffectiveness, mapOnRequest, json, legendFor, narrowGrids, plainErrorScreen, plainScreen, screenText, sentences } from "../../mcp-server/format.mjs";
import { renderView } from "../../src/bridge/overworld";

const SCREEN = ["┌──────────────────┐", "│Wild BASEMON      │", "│appeared!         │", "└──────────────────┘"];
const text = (r: { content: { text: string }[] }) => r.content[0].text;
const result = (screenText: string[], extra: object = {}) => ({ status: { location: "ROUTE_1 (5,6)", battle: "wild" }, screenText, ...extra });

describe("hiding move effectiveness (the effectiveness switch)", () => {
  it("drops each move's multiplier from the status line, keeping status moves and PP", () => {
    const line = "🟢 you: NOVA (MONA) Lv9 20/25HP | moves: TACKLE 1× 34pp, WATER GUN 2× 25pp, LICK no effect 30pp, GROWL status 40pp, ODD 0.5× 10pp";
    expect(hideEffectiveness(line)).toBe("🟢 you: NOVA (MONA) Lv9 20/25HP | moves: TACKLE 34pp, WATER GUN 25pp, LICK 30pp, GROWL status 40pp, ODD 10pp");
  });

  it("drops the effectiveness fields from get_state, wherever they sit, and keeps the JSON valid", () => {
    const state = JSON.stringify({
      lead: { moves: [{ name: "TACKLE", power: 35, effectiveness: 2, pp: 30 }, { effectiveness: 0.5, name: "GUST" }] },
      enemy: { knownMoves: [{ name: "BITE", effectivenessVsYou: 1 }] },
    });
    const out = hideEffectiveness(state);
    expect(out).not.toMatch(/effectiveness/);
    expect(JSON.parse(out)).toEqual({ lead: { moves: [{ name: "TACKLE", power: 35, pp: 30 }, { name: "GUST" }] }, enemy: { knownMoves: [{ name: "BITE" }] } });
  });

  it("keeps the game's own message about a hit", () => {
    expect(hideEffectiveness("Messages:\n  • It's super effective!")).toBe("Messages:\n  • It's super effective!");
  });
});

describe("maps on request (the map A/B)", () => {
  const moved = (map: string) => ({ status: { location: "ROUTE_1 (5,6)", battle: "none" }, walk: "up 2/2 — arrived", map, screenText: [] });
  const area = "Map exits: up, down.\n      0 1 2\ny  6  . @ .\ny  7  . . .";

  it("leaves the area's map out of move results, keeping the exits and where to get it", () => {
    const text = createFormatter({ mapsOnRequest: true }).afterAction(moved(area)).content[0].text;
    expect(text).toContain("Map exits: up, down. Map: not shown (get_map shows it)");
    expect(text).not.toContain("y  6");
    expect(mapOnRequest("y  6  . @ .\ny  7  . . .")).toBe("Map: not shown (get_map shows it)");
  });

  it("still shows the map when the model asks for it, and after every move when turned back on", () => {
    expect(createFormatter({ mapsOnRequest: true }).afterAction(moved(area), { keepMap: true }).content[0].text).toContain("y  6  . @ .");
    expect(createFormatter().afterAction(moved(area)).content[0].text).toContain("y  6  . @ .");
  });
});

describe("action results", () => {
  it("show the screen in full the first time, then only say it's unchanged", () => {
    const f = createFormatter();
    expect(text(f.afterAction(result(SCREEN)))).toContain("Text: Wild BASEMON / appeared!");
    const again = text(f.afterAction(result(SCREEN)));
    expect(again).toContain("Screen: unchanged");
    expect(again).not.toContain("BASEMON");
  });

  it("show the screen again as soon as it changes", () => {
    const f = createFormatter();
    f.afterAction(result(SCREEN));
    const changed = [...SCREEN.slice(0, 1), "│BASEMON fled!     │", ...SCREEN.slice(2)];
    expect(text(f.afterAction(result(changed)))).toContain("BASEMON fled!");
  });

  it("show it in full again after reset (new page, loaded state)", () => {
    const f = createFormatter();
    f.afterAction(result(SCREEN));
    f.reset();
    expect(text(f.afterAction(result(SCREEN)))).toContain("Text: Wild BASEMON / appeared!");
  });

  it("shorten the overworld's no-text notice to one short line", () => {
    const f = createFormatter();
    const r = text(f.afterAction(result(["(No text on screen — overworld or a graphics screen. Use get_screen to see it.)"])));
    expect(r.split("\n").at(-1)).toBe("Screen: no text (overworld)");
  });

  it("keep everything that happened: status, messages, map, outcome", () => {
    const f = createFormatter();
    const r = text(f.afterAction(result(SCREEN, {
      status: { location: "ROUTE_1 (5,6)", battle: "none", lead: "NOVA Lv6", outcome: "victory: Became Champion" },
      messages: ["NOVA grew to Lv6!"], map: "y  6  . @ .", walk: "U3 R2",
    })));
    for (const part of ["📍 ROUTE_1 (5,6) | battle: none", "🟢 you: NOVA Lv6", "🏁 RUN ENDED — victory: Became Champion", "NOVA grew to Lv6!", "Map:\ny  6  . @ .", "Walk: U3 R2"]) {
      expect(r).toContain(part);
    }
  });
});

describe("the lead's line", () => {
  it("ends with the level cap outside battle, after anyone else's status", () => {
    const line = (status: Record<string, unknown>) => text(createFormatter().afterAction(result([], { status }))).split("\n").find((l) => l.startsWith("🟢"));
    expect(line({ location: "TOWN_2", battle: "none", lead: "NOVA (MONA) Lv10 6/29HP", cap: 14 })).toBe("🟢 you: NOVA (MONA) Lv10 6/29HP · cap Lv14");
    expect(line({ location: "TOWN_2", battle: "none", lead: "NOVA Lv10", others: "PIP 3/15HP PSN", cap: 14 })).toBe("🟢 you: NOVA Lv10 · also: PIP 3/15HP PSN · cap Lv14");
    expect(line({ location: "GYM_1", battle: "trainer", lead: "NOVA Lv10 | moves: BLAZE 1× 25pp", cap: null })).toBe("🟢 you: NOVA Lv10 | moves: BLAZE 1× 25pp");
  });

  it("says when the cap holds only for Rare Candies (League battles may pass it)", () => {
    const line = (status: Record<string, unknown>) => text(createFormatter().afterAction(result([], { status }))).split("\n").find((l) => l.startsWith("🟢"));
    expect(line({ location: "ROOM_4", battle: "none", lead: "NOVA Lv63", cap: 62, capCandiesOnly: true }))
      .toBe("🟢 you: NOVA Lv63 · cap Lv62 for Rare Candies (League battles may pass it)");
  });

  it("shows a dead lead, and a dead one among the others, as dead", () => {
    const line = (status: Record<string, unknown>) => text(createFormatter().afterAction(result([], { status }))).split("\n").find((l) => l.startsWith("🟢"));
    expect(line({ location: "TOWN_2", battle: "none", lead: "NOVA (MONA) Lv10 29/29HP", others: "PIP 3/15HP PSN", dead: "NOVA, PIP", cap: 14 }))
      .toBe("🟢 you: NOVA (MONA) Lv10 29/29HP · also: PIP 3/15HP PSN · dead: NOVA, PIP · cap Lv14");
  });
});

describe("maps", () => {
  it("leave the legend to get_map's description", () => {
    const map = renderView({ grid: [["#", "@", "."]], originX: 0, originY: 0, pc: 1, pr: 0 });
    expect(map).not.toMatch(/Legend/);
    expect(MAP_LEGEND).toMatch(/@ you/);
  });
});

describe("state", () => {
  it("is compact JSON", () => {
    const r = text(json({ run: { attempt: 1 }, party: [{ species: "STARTERMON" }] }));
    expect(r).toBe('{"run":{"attempt":1},"party":[{"species":"STARTERMON"}]}');
  });
});

describe("messages", () => {
  it("join text-box lines into sentences", () => {
    expect(sentences(["NOVA", "used CLAW!", "A lucky hit!", "It hardly did", "a thing...", "Enemy BASEMON", "fell!"]))
      .toEqual(["NOVA used CLAW!", "A lucky hit!", "It hardly did a thing...", "Enemy BASEMON fell!"]);
    expect(sentences(["Hey! We met on", "the trail!", "WALKER wants", "a rematch!"])).toEqual(["Hey! We met on the trail!", "WALKER wants a rematch!"]);
  });
});

describe("battle and map repeats", () => {
  const MENU = ["┌───────┌──────────┐", "│       │ FIGHT▶PKMN │", "│       │ ITEM  RUN│", "└───────└──────────┘"];
  it("give the battle menu screen as one line: the status lines carry names, levels and HP", () => {
    const out = text(createFormatter().afterAction(result(MENU)));
    expect(out).toContain("Screen: the battle menu (FIGHT, PKMN, ITEM, RUN)");
    expect(out).not.toContain("┌");
  });

  it("say a map is unchanged, except when the model asked for it", () => {
    const f = createFormatter();
    const walked = { status: { location: "ROUTE_1 (5,6)", battle: "none" }, map: "y  6  . @ .\ny  7  . . .", screenText: [] };
    expect(text(f.afterAction(walked))).toContain("Map:\ny  6  . @ .\ny  7");
    expect(text(f.afterAction(walked))).toContain("Map: unchanged");
    expect(text(f.afterAction(walked, { keepMap: true }))).toContain("Map:\ny  6  . @ .\ny  7");
    f.reset();
    expect(text(f.afterAction(walked))).toContain("Map:\ny  6  . @ .\ny  7");
  });
});

describe("battle notes", () => {
  it("show who an item was used on, a turn with no move to pick, and HP notes on their own", () => {
    const out = text(createFormatter().afterAction(result([], { used: "TONIC", on: "KAK", note: "No move to pick this turn.", messages: ["Enemy MONA", "used CLAW!", "(KAK: 69 → 68/69 HP.)"] })));
    expect(out).toContain("Used TONIC on KAK.");
    expect(out).toContain("Note: No move to pick this turn.");
    expect(out).toContain("  • Enemy MONA used CLAW!\n  • (KAK: 69 → 68/69 HP.)");
  });
});

describe("narrow grids", () => {
  it("put one space between squares and the x header in two rows, leaving other lines alone", () => {
    const wide = ["Map exits: up.", "       8  9 10 11", "y  6   .  @  #  \"", "y  7   T  .  .  !", "Doors (D): (9,7) → HOUSE."].join("\n");
    expect(narrowGrids(wide)).toBe(["Map exits: up.", "          1 1", "      8 9 0 1", "y  6  . @ # \"", "y  7  T . . !", "Doors (D): (9,7) → HOUSE."].join("\n"));
  });

  it("skip the tens row when every x is one digit, and mark negative columns", () => {
    expect(narrowGrids("      -1  0  1\ny  0   #  @  .")).toBe("      -    \n      1 0 1\ny  0  # @ .");
  });
});

describe("plain screen text", () => {
  it("writes each box as one line: dialogue, the menu with the cursor, a box's title", () => {
    const heal = ["", "···········┌───────┐", "···········│       │", "···········│▶HEAL  │", "···········│       │", "···········│ CANCEL│", "···········└───────┘",
      "┌──────────────────┐", "│                  │", "│Patch up your     │", "│                  │", "│team here?        │", "└──────────────────┘"];
    expect(plainScreen(heal)).toEqual(["Menu: ▶HEAL / CANCEL", "Text: Patch up your / team here?"]);
  });

  it("counts a two-letter tile (PK, MN) as one square, so a row stays inside its box", () => {
    const keys = ["┌──────────────────┐", "│▶A B C D E F G H I│", "│ × ( ) : ; [ ] PK MN│", "└──────────────────┘"];
    expect(plainScreen(keys)).toEqual(["Menu: ▶A B C D E F G H I / × ( ) : ; [ ] PK MN"]);
  });

  it("says how to type a name under an open naming keyboard, wherever its cursor is, and only there", () => {
    const keys = (row: string) => ["┌──────────────────┐", row, "│ × ( ) : ; [ ] PK MN│", "└──────────────────┘"];
    expect(screenText(keys("│▶A B C D E F G H I│"))).toContain(NAMING_HINT);
    expect(screenText(keys("│ A B▶C D E F G H I│"))).toContain(NAMING_HINT);
    const heal = ["┌───────┐", "│▶HEAL  │", "│ CANCEL│", "└───────┘"];
    expect(screenText(heal)).not.toContain("name:");
  });

  it("gives overlapping boxes their own text (the one on top keeps its border), a menu a level back marked", () => {
    const shop = ["┌─────────┐┌─MONEY─┐", "│▷BUY     ││  ¥3175│", "│   ┌──────────────┐", "│ SE│              │", "│   │▶ORB          │", "│ QU│         ¥200 │",
      "└───│ TONIC        │", "····│         ¥300 │", "┌───└──────────────┘", "│                  │", "│Browse the shelf. │", "│                  │", "│                  │", "└──────────────────┘"];
    expect(plainScreen(shop)).toEqual([
      "Menu (behind): ▷BUY / SE / QU", "Box MONEY: ¥3175", "Menu: ▶ORB ¥200 / TONIC ¥300", "Text: Browse the shelf.",
    ]);
  });
});

describe("plainErrorScreen", () => {
  it("turns the raw screen an error carries into plain text", () => {
    const raw = [
      "   SPARKY    ·11    ",
      "   RATTY ┌─────────┐",
      "         │    │ YES│",
      "         │    │▶NO │",
      "         └────└────┘",
      "┌──────────────────┐",
      "│drop a move to    │",
      "│learn CLAW?       │",
      "└──────────────────┘",
    ];
    const out = plainErrorScreen(`Couldn't put the cursor on "ITEM". Screen:\n${raw.join("\n")}`);
    expect(out.startsWith(`Couldn't put the cursor on "ITEM". Screen:\n`)).toBe(true);
    expect(out).not.toMatch(/[┌└│─]/);
    expect(out).toContain("drop a move to");
    expect(plainErrorScreen("No path to (3, 4).")).toBe("No path to (3, 4).");
  });
});

describe("legendFor", () => {
  it("explains only the symbols on the map", () => {
    const map = ["      0 1 2 3", "y  4  # P . .", "y  5  # . @ N", "y  6  # D D .", "Doors (D): (2,6) → ROUTE_25 (45,3)."].join("\n");
    const key = legendFor(map)!;
    expect(key).toMatch(/^Legend: /);
    for (const s of ["@ you", "P a PC", "N person", "D door", "# blocked", ". walkable"]) expect(key).toContain(s);
    for (const s of ["tall grass", "water", "spinner", "T trainer", "ledge"]) expect(key).not.toContain(s);
    expect(legendFor("No map here")).toBeNull();
  });
});
