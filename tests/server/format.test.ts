// What tool results cost the model: they repeat only what changed.

import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM module without type declarations
import { COMPACT_GRID_NOTE, MAP_LEGEND, NAMING_HINT, compactGridNote, compactGrids, createFormatter, hideEffectiveness, mapLegend, mapOnRequest, json, legendFor, narrowGrids, plainErrorScreen, plainScreen, screenText, sentences, wideGrids } from "../../mcp-server/format.mjs";
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

describe("the location line", () => {
  it("names the trainer in a trainer battle", () => {
    const line = (status: Record<string, unknown>) => text(createFormatter().afterAction(result([], { status }))).split("\n").find((l) => l.startsWith("📍"));
    expect(line({ location: "GYM_3 [GYM_3]", battle: "trainer", trainer: "SAILOR" })).toBe("📍 GYM_3 [GYM_3] | battle: trainer (SAILOR)");
    expect(line({ location: "ROUTE_1 [ROUTE_1]", battle: "wild", trainer: null })).toBe("📍 ROUTE_1 [ROUTE_1] | battle: wild");
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

  it("joins a word broken over two lines with a hyphen without a space (Crystal)", () => {
    expect(sentences(["It's super-", "effective!"])).toEqual(["It's super-effective!"]);
    // Also after an accented letter (the games' "é").
    expect(sentences(["Don't lose at the POKé-", "MON LEAGUE!"])).toEqual(["Don't lose at the POKé-MON LEAGUE!"]);
    // A dash standing alone between words keeps its spaces.
    expect(sentences(["Wait -", "who's there?"])).toEqual(["Wait - who's there?"]);
  });

  it("says a status move that \"didn't affect\" the foe missed or failed; an immunity is left as it is", () => {
    expect(sentences(["NOVA used", "HUMMING!", "It didn't affect", "Enemy BIRDMON!"])).toEqual([
      "NOVA used HUMMING!",
      `It didn't affect Enemy BIRDMON! (the move missed or failed: an immunity reads "doesn't affect")`,
    ]);
    expect(sentences(["It doesn't affect", "Enemy GHOSTMON!"])).toEqual(["It doesn't affect Enemy GHOSTMON!"]);
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
    // The "x" row: the first column's whole x and every multiple of 5, each ending over its column;
    // under it, each column's last digit.
    const wide = ["Map exits: up.", "       8  9 10 11", "y  6   .  @  #  \"", "y  7   T  .  .  !", "Doors (D): (9,7) → HOUSE."].join("\n");
    expect(narrowGrids(wide)).toBe(["Map exits: up.", "x     8  10", "      8 9 0 1", "y  6  . @ # \"", "y  7  T . . !", "Doors (D): (9,7) → HOUSE."].join("\n"));
  });

  it("writes negative columns whole on the x row, and the last digit under them", () => {
    // 0 a column after -1: one space between them is enough.
    expect(narrowGrids("      -1  0  1\ny  0   #  @  .")).toBe("x    -1 0 1\n      1 0 1\ny  0  # @ .");
  });

  it("writes the last column's whole x too, when it doesn't touch the one before", () => {
    // A wide map past its last multiple of 5: x8 was read as x18 after the 0 column (2026-11-20).
    const xs = Array.from({ length: 20 }, (_, i) => i - 10);
    const wide = `     ${xs.map((x) => String(x).padStart(4)).join("")}\ny  0 ${xs.map(() => "   .").join("")}`;
    expect(narrowGrids(wide).split("\n")[0]).toBe("x   -10        -5         0         5       9");
  });

  it("leaves out a multiple of 5 that would touch the number before it", () => {
    // -6 is the first column; -5 next to it would read as "-6-5": the next whole number is 0.
    const xs = [-6, -5, -4, -3, -2, -1, 0, 1];
    const wide = `     ${xs.map((x) => String(x).padStart(3)).join("")}\ny  0 ${xs.map(() => "  .").join("")}`;
    expect(narrowGrids(wide).split("\n").slice(0, 2)).toEqual(["x    -6           0 1", "      6 5 4 3 2 1 0 1"]);
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

  it("counts a contraction tile ('s, 't, 'll…) as one square, so a box row with one keeps its right border", () => {
    // 18 squares inside the border each: a contraction is two characters on one square.
    const box = ["┌──────────────────┐", "│IT's MOM's PC.      │", "│You can't, you'll   │", "└──────────────────┘"];
    expect(plainScreen(box)).toEqual(["Text: IT's MOM's PC. / You can't, you'll"]);
    // After a gender sign or a digit too.
    const names = ["┌──────────────────┐", "│NIDORAN♂'s attack  │", "│PORYGON2's attack  │", "└──────────────────┘"];
    expect(plainScreen(names)).toEqual(["Text: NIDORAN♂'s attack / PORYGON2's attack"]);
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

  it("narrowGrids stays fast on a long digit run that is not a header", () => {
    const line = `     ${"0".repeat(5000)}x`;
    const start = performance.now();
    expect(narrowGrids(`${line}\ny  0   .`)).toBe(`${line}\ny  0   .`);
    expect(performance.now() - start).toBeLessThan(500);
  });

  it("compactGrids groups 5-square blocks, trims rock margins to 5s, collapses plain rows, and writes Cliffs + Points", () => {
    expect(COMPACT_GRID_NOTE).toContain("5-column blocks");
    expect(COMPACT_GRID_NOTE).toContain("floor switches");
    expect(COMPACT_GRID_NOTE).toContain("Cliffs");
    expect(COMPACT_GRID_NOTE).toContain("y8|9 x5–7");
    // 16 columns (x 0..15): columns 0..5 and 13..15 are all #, so left snaps to x=5 and right trims to x=12.
    // Row 0 and row 6 are all # (trimmed); rows 2..4 are identical plain floor (collapsed to y  2-4);
    // rows 1 and 5 have interactive squares (@, I, C, S, D), which never collapse even if repeated.
    const wide = renderView({
      grid: [
        [..."################"],
        [..."######.@..I.C###"],
        [..."######.......###"],
        [..."######.......###"],
        [..."######.......###"],
        [..."######S....D.###"],
        [..."################"],
      ],
      originX: 0, originY: 0, pc: 7, pr: 1,
      exits: ["up"],
      doors: [{ x: 11, y: 5, to: "HOUSE", tx: 2, ty: 7 }],
      tiles: Array.from({ length: 7 }, (_, r) => Array.from({ length: 16 }, (_, c) => (r >= 3 && c >= 8 && c <= 10 ? 2 : 1))),
      stepBlocked: (a, b) => a !== b,
    });
    const out = compactGrids(wide);
    expect(out).toBe([
      "Map exits: up, plus 1 door (D).",
      "       5     10",
      "y  1   #.@.. I.C",
      "y  2-4 #.... ...",
      "y  5   #S... .D.",
      "Cliffs: y2|3 x8–10; x7|8 y3–5; x10|11 y3–5.",
      "Doors (D): (11,5) → HOUSE (2,7).",
      "Points: I (10,1); C (12,1); S (6,5).",
    ].join("\n"));
    expect(legendFor(out)).toContain("I item ball");

    // Tall maps (>= 16 emitted grid lines) repeat the ruler at the bottom.
    const tall = renderView({
      grid: Array.from({ length: 18 }, (_, r) => (r % 2 === 0 ? [..."..@......."] : [..."#.#......."])),
      originX: 0, originY: 0, pc: 2, pr: 0,
    });
    const tallLines = compactGrids(tall).split("\n");
    expect(tallLines[0]).toBe("       0     5");
    expect(tallLines.at(-1)).toBe("       0     5");
  });

  it("compactGrids widens the row-tag column for y >= 100 ranges so every row stays aligned with the ruler", () => {
    // 144-row route (the height of the long north-south routes): has 6-char (96-101) and 7-char (102-143) ranges.
    const grid = Array.from({ length: 144 }, (_, r) => {
      if (r === 95) return [..."..@......."];
      if (r >= 96 && r <= 101) return [...'""""......'];
      if (r >= 102) return [...".........."];
      return [..."#........."];
    });
    const out = compactGrids(renderView({ grid, originX: 0, originY: 0, pc: 2, pr: 95 }));
    const lines = out.split("\n");
    expect(lines).toEqual([
      "         0     5",
      "y   0-94 #.... .....",
      "y 95     ..@.. .....",
      'y 96-101 """". .....',
      "y102-143 ..... .....",
    ]);
    // Every emitted row's squares start at the exact column of the 0 tick, and x=5 aligns on every line.
    const x0Col = lines[0].indexOf("0");
    const x5Col = lines[0].indexOf("5");
    for (const row of lines.slice(1)) {
      expect(row[x0Col]).not.toBe(" ");
      expect(row[x5Col - 1]).toBe(" ");
      expect(row[x5Col]).not.toBe(" ");
    }
    expect(legendFor(out)).toContain('" tall grass');
  });

  it("explains b in the legend and handles b in compactGrids only when boulderSwitch is on", () => {
    expect(MAP_LEGEND).not.toContain("b boulder on a floor switch");
    expect(mapLegend({ boulderSwitch: true })).toContain("B boulder, b boulder on a floor switch, o floor switch");
    expect(COMPACT_GRID_NOTE).not.toContain("B b o O");
    expect(compactGridNote({ boulderSwitch: true })).toContain("I C W S P $ H B b o O");

    const map = ["       0  1  2  3", "y  5   #  b  B  o"].join("\n");
    expect(legendFor(map)).toBe("Legend: B boulder, o floor switch, # blocked.");
    expect(legendFor(map, { boulderSwitch: true })).toBe("Legend: B boulder, b boulder on a floor switch, o floor switch, # blocked.");

    // Compact + boulderSwitch: `b` is listed in Points and identical rows with `b` never collapse.
    const cave = renderView({
      grid: [
        [..."..@.."],
        [..."..b.."],
        [..."..b.."],
        [..."..B.o"],
      ],
      originX: 0, originY: 0, pc: 2, pr: 0,
    });
    // `b` reaches the grid only with the option on (the bridge turns it back into `B` otherwise).
    const out = compactGrids(cave);
    expect(out).toBe([
      "       0",
      "y  0   ..@..",
      "y  1   ..b..",
      "y  2   ..b..",
      "y  3   ..B.o",
      "Points: B (2,3); b (2,1), (2,2); o (4,3).",
    ].join("\n"));
    // NUZLOCKE_MAP_POINTS on the narrow and wide grids lists `b` too.
    expect(narrowGrids(cave, { points: true })).toContain("Points: B (2,3); b (2,1), (2,2); o (4,3).");
    expect(wideGrids(cave, { points: true })).toContain("Points: B (2,3); b (2,1), (2,2); o (4,3).");
  });

  it("narrowGrids and wideGrids with points: true share the 9-kind Points line and repeat the x header on tall maps", () => {
    const wide = renderView({
      grid: [
        [..."@ICSP$HBoO"],
        [...".........."],
      ],
      originX: 0, originY: 0, pc: 0, pr: 0,
      doors: [{ x: 9, y: 1, to: "EXIT", tx: 1, ty: 1 }],
    });
    const expectedPoints = "Points: I (1,0); C (2,0); S (3,0); P (4,0); $ (5,0); H (6,0); B (7,0); o (8,0); O (9,0).";
    expect(narrowGrids(wide)).not.toContain("Points:");
    expect(wideGrids(wide)).toBe(wide);
    expect(narrowGrids(wide, { points: true })).toContain(`Doors (D): (9,1) → EXIT (1,1).\n${expectedPoints}`);
    expect(wideGrids(wide, { points: true })).toContain(`Doors (D): (9,1) → EXIT (1,1).\n${expectedPoints}`);
    expect(compactGrids(wide)).toContain(expectedPoints);

    // Tall map (>= 16 rows, x >= 10 so narrow header is two rows) repeats x header at the bottom.
    const tall = renderView({
      grid: Array.from({ length: 16 }, (_, r) => (r === 0 ? [..."@..........."] : r === 15 ? [..."...........I"] : [..."............"])),
      originX: 0, originY: 0, pc: 0, pr: 0,
    });
    const narrowTall = narrowGrids(tall, { points: true }).split("\n");
    expect(narrowTall.slice(0, 2)).toEqual(narrowTall.slice(18, 20));
    expect(narrowTall[20]).toBe("Points: I (11,15).");
    expect(narrowGrids(tall).split("\n")).toHaveLength(18); // default: no bottom header, no Points

    const wideTall = wideGrids(tall, { points: true }).split("\n");
    expect(wideTall[0]).toBe(wideTall[17]);
    expect(wideTall[18]).toBe("Points: I (11,15).");

    // Dark-cave output has no coordinate grid and gets no Points line.
    const dark = "It's dark.\n? ? ?\n? @ ?\n? ? ?";
    expect(narrowGrids(dark, { points: true })).toBe(dark);
    expect(wideGrids(dark, { points: true })).toBe(dark);
  });
});

describe("grids with negative x (0.3.0: coordinates count from where the run arrived)", () => {
  const map = (x0: number) => renderView({ grid: [[..."#.@."], [..."...."]], originX: x0, originY: -1, pc: 2, pr: 0 });

  it("narrow: negative x written whole on the x row, the last digit under each column", () => {
    const lines = narrowGrids(map(-3)).split("\n");
    expect(lines.slice(0, 2)).toEqual(["x    -3     0", "      3 2 1 0"]);
    expect(lines[2]).toBe("y -1  # . @ .");
  });

  it("narrow: two-digit negative x the same way, -10 as a multiple of 5", () => {
    const lines = narrowGrids(map(-11)).split("\n");
    // -11 is the first column: -10 next to it would touch it, so it's left out. -8 is the last column.
    expect(lines.slice(0, 2)).toEqual(["x   -11    -8", "      1 0 9 8"]);
  });

  it("wide: the bridge widens the columns so an x of three characters doesn't run into the next", () => {
    const lines = map(-11).split("\n");
    expect(lines[0]).toBe("      -11 -10  -9  -8");
    expect(lines[1]).toBe("y -1    #   .   @   .");
    expect(wideGrids(map(-11))).toBe(map(-11));
    // Columns of two characters at most stay 3 wide, as before.
    expect(map(-3).split("\n")[0]).toBe("      -3 -2 -1  0");
  });

  it("reaches -100 on a tall or wide map entered at its far end: wider labels, parsed by every grid", () => {
    const far = renderView({ grid: [[..."#.@"], [..."..."]], originX: -101, originY: -100, pc: 2, pr: 0 });
    const lines = far.split("\n");
    expect(lines[0]).toBe("       -101 -100  -99");
    expect(lines[1]).toBe("y-100     #    .    @");
    expect(lines[2]).toBe("y -99     .    .    .");
    expect(narrowGrids(far).split("\n")).toEqual([
      "x   -101 -99",
      "       1 0 9",
      "y-100  # . @",
      "y -99  . . .",
    ]);
    // -100 starts a 5-column block: a space before it.
    expect(compactGrids(far)).toMatch(/^y-100 +# \.@$/m);
    expect(wideGrids(far, { points: true })).toContain(far);
  });

  it("compact: rulers and row ranges take negative coordinates", () => {
    const out = compactGrids(renderView({ grid: [[..."..@...."], [..."......."], [..."......."]], originX: -12, originY: -5, pc: 2, pr: 0 }));
    const lines = out.split("\n");
    // -12 and -11 have no room for a label of their own before -10's block (as with any x).
    expect(lines[0].trim().split(/ +/).map(Number)).toEqual([-10]);
    expect(lines[1]).toBe("y -5   .. @....");
    expect(lines[2]).toMatch(/^y\s*-4--3 +\.\. \.\.\.\.\.$/);
  });
});
