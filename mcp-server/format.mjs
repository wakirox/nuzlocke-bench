// How tool results read to the model. Every character here is paid for on every call, so
// results say what changed and leave out what the model already has — without dropping
// anything it couldn't otherwise know.

/** Each map symbol (or group) and what it means. */
const LEGEND = [
  ["@", "@ you"],
  ["T", "T trainer (a solid square; it doesn't step aside, beaten or not; unbeaten ones fight you on sight)"],
  ["!", "! a walkable square (or water, for a swimmer's gaze) an unbeaten trainer is watching: stepping on it starts that trainer's battle, it isn't a wall (paths go around these only with trainers: avoid)"],
  ["I", "I item ball (or another item lying there to pick up, like a fossil)"],
  ["N", "N person"],
  ["$", "$ shop clerk (talk to them to buy or sell; across a counter like any person)"],
  ["H", "H nurse (talk to her to heal your team; across the counter)"],
  ["F", "F your Pikachu following you (Yellow: walk onto it and it steps aside; A while facing it shows how it feels)"],
  ["B", "B boulder"],
  ["o", "o floor switch"],
  [",", ", a cave's lower floor (. is its upper floor)"],
  ["≡", "≡ steps between the higher ground (.) and lower ground (,) of this same map, walked over like floor: the only way between them, elsewhere a cliff is between them (not a ladder: those are D and take you to another floor)"],
  ["O", "O hole in the floor (paths avoid it; walk_to it to drop through)"],
  ["D", "D door/warp"],
  ["G", "G a closed gate (solid)"],
  ["S", "S something you read or use by facing it and pressing A (a sign, a switch…)"],
  ["P", "P a PC (used only from the square below it, facing up: stand there and press A)"],
  ["C", "C tree you can Cut (face it, then field_move CUT)"],
  ["=", "= counter (a person behind it is talked to across it)"],
  ["#", "# blocked"],
  [".", ". walkable"],
  ["~", "~ water (Surf; walkable while surfing)"],
  ["?", "? not seen yet (never on your screen: go there to see it; never a walk_to target, but a walk can try a way through it, except in the dark)"],
  ["*", "* ice (step on it and you slide that way until something stops you; walk_to plans the slides)"],
  ['"', '" tall grass'],
  ["v<>", "v < > one-way ledge (hop that way)"],
  ["↑↓←→+", "↑ ↓ ← → spinner arrow (stepping on it slides you that way, along a fixed path; paths avoid them; + if its direction isn't known)"],
];

const BOULDER_SWITCH_ENTRY = ["b", "b boulder on a floor switch"];

function legendEntries({ boulderSwitch = false } = {}) {
  if (!boulderSwitch) return LEGEND;
  const at = LEGEND.findIndex(([chars]) => chars === "o");
  return [...LEGEND.slice(0, at), BOULDER_SWITCH_ENTRY, ...LEGEND.slice(at)];
}

/** Map symbols, given once in get_map's description instead of under every map. */
export function mapLegend(opts = {}) {
  return `Map legend: ${legendEntries(opts).map(([, text]) => text).join(", ")}. Columns are x, rows are y.`;
}
export const MAP_LEGEND = mapLegend();

/** The legend for just the symbols on the map(s) in `text` (get_map legend=true), or null. */
export function legendFor(text, opts = {}) {
  const squares = new Set(text.split("\n").filter((l) => /^y\s*-?\d+(?:--?\d+)? /.test(l)).flatMap((l) => [...l.replace(/^y\s*-?\d+(?:--?\d+)? +/, "")]));
  const entries = legendEntries(opts).filter(([chars]) => [...chars].some((ch) => squares.has(ch)));
  return entries.length ? `Legend: ${entries.map(([, t]) => t).join(", ")}.` : null;
}

const BORDER = new Set([..."┌┐└┘─│"]);

/**
 * The game screen's text as plain text, no box drawing: each box (dialogue, a menu, the money
 * box) becomes one line, its rows joined with " / ". A box with the ▶ cursor is the menu in use;
 * ▷ marks one a level back (BUY behind the item list). Where boxes overlap, a character belongs
 * to the smallest box around it. Text outside every box comes last. Rows matter in the few 2-D
 * menus (the battle menu, the naming keyboard): pressing down moves to the next row.
 */
// Tiles the screen reader writes as two characters (PK, MN, and the contractions 'd 'l 'm 'r 's 't 'v):
// one square each, so the columns line up again; written back out as the characters.
const TILES = [["PK", "\uE0E1"], ["MN", "\uE0E2"]];
// A contraction tile follows a letter (IT's, MOM's, you're, I'm), a digit or gender sign (PORYGON2's,
// NIDORAN\u2642's) and can be followed by one (you'll, you've).
const CONTRACTIONS = [..."dlmrstv"].map((ch, i) => [`'${ch}`, String.fromCharCode(0xe0f0 + i)]);
const oneSquare = (l) => CONTRACTIONS.reduce((s, [t, c]) => s.replace(new RegExp(`(?<=[A-Za-z0-9\u00E9\u2642\u2640])${t}`, "g"), c),
  TILES.reduce((s, [t, c]) => s.replace(new RegExp(`(?<![A-Z])${t}(?=MN|[^A-Za-z]|$)`, "g"), c), l.replace(/PKMN/g, "\uE0E1\uE0E2")));
const letters = (l) => [...TILES, ...CONTRACTIONS].reduce((s, [t, c]) => s.split(c).join(t), l);

export function plainScreen(rawLines) {
  const lines = rawLines.map(oneSquare);
  const W = Math.max(0, ...lines.map((l) => [...l].length));
  const grid = lines.map((l) => [...l].concat(Array(W - [...l].length).fill(" ")));
  const H = grid.length;
  const at = (r, c) => grid[r]?.[c] ?? " ";
  // Boxes: a ┌ with a ┐ to its right on the same row and a └ below it in the same column.
  const boxes = [];
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      if (at(r, c) !== "┌") continue;
      // Right along the top to ┐ (or a corner drawn over it) with the right edge going down from it.
      let c2 = c + 1;
      while (c2 < W && !((at(r, c2) === "┐" || at(r, c2) === "┘") && at(r + 1, c2) === "│")) c2++;
      // Down the left edge to └, or to where another box was drawn over the bottom.
      let r2 = r + 1;
      while (r2 < H && at(r2, c) === "│") r2++;
      if (c2 >= W || r2 >= H || r2 === r + 1) continue;
      const title = grid[r].slice(c + 1, c2).join("").replace(/[─┌┐└┘│]/g, " ").trim();
      boxes.push({ r, c, r2, c2, title, area: (r2 - r) * (c2 - c), rows: [] });
    }
  }
  // Which of two overlapping boxes is on top: the one whose border still shows inside the other.
  const borderIn = (a, b) => {
    let n = 0;
    let ok = 0;
    const cell = (y, x) => {
      if (y < b.r || y > b.r2 || x < b.c || x > b.c2) return;
      n++;
      if (BORDER.has(at(y, x))) ok++;
    };
    for (let x = a.c; x <= a.c2; x++) {
      cell(a.r, x);
      cell(a.r2, x);
    }
    for (let y = a.r + 1; y < a.r2; y++) {
      cell(y, a.c);
      cell(y, a.c2);
    }
    return n ? ok / n : 1;
  };
  const above = (a, b) => {
    const d = borderIn(a, b) - borderIn(b, a);
    return Math.abs(d) > 0.01 ? d > 0 : a.area < b.area;
  };
  // A square inside several boxes belongs to the top one.
  const owner = (r, c) => {
    let best = null;
    for (const b of boxes) if (r > b.r && r < b.r2 && c > b.c && c < b.c2 && (!best || above(b, best))) best = b;
    return best;
  };
  // A box's top border can carry its title (─MONEY─): that's not text on the screen.
  const onTitle = (r, c) => boxes.some((b) => r === b.r && c > b.c && c < b.c2);
  const outside = [];
  for (let r = 0; r < H; r++) {
    const rowOf = new Map();
    for (let c = 0; c < W; c++) {
      const ch = at(r, c);
      if (BORDER.has(ch) || onTitle(r, c)) continue;
      const b = owner(r, c);
      if (!rowOf.has(b)) rowOf.set(b, Array(W).fill(" "));
      rowOf.get(b)[c] = ch === "·" ? " " : ch;
    }
    for (const [b, chars] of rowOf) {
      const text = chars.join("").trim().replace(/ {2,}/g, "  ");
      if (!text) continue;
      (b ? b.rows : outside).push(text);
    }
  }
  // A row that's only a price or a number belongs with the row above (a shop's item, then its price).
  const joinRows = (rows) => rows.reduce((out, row) => {
    if (out.length && /^[¥×\d:/ .]+▼?$/.test(row)) out[out.length - 1] += ` ${row}`;
    else out.push(row);
    return out;
  }, []).join(" / ");
  const out = boxes.filter((b) => b.rows.length || b.title).map((b) => {
    const text = joinRows(b.rows);
    const kind = /▶/.test(text) ? "Menu" : /▷/.test(text) ? "Menu (behind)" : b.r2 === H - 1 && b.c === 0 ? "Text" : "Box";
    return `${kind}${b.title ? ` ${b.title}` : ""}: ${text}`;
  });
  if (outside.length) out.push(`Also on screen: ${joinRows(outside)}`);
  return out.map(letters);
}

/**
 * A result without move effectiveness (the effectiveness switch off): the status line's multiplier
 * per move ("TACKLE 2× 35pp" → "TACKLE 35pp", "no effect" too) and get_state's effectiveness
 * fields go. The game's own "It's super effective!" after a hit stays: any player sees that.
 */
export function hideEffectiveness(text) {
  return text
    .replace(/ (?:\d+(?:\.\d+)?×|no effect)(?= \d+(?:\/\d+)?pp)/g, "")
    .replace(/,"effectiveness(?:VsYou)?":[^,}\]]*/g, "")
    .replace(/"effectiveness(?:VsYou)?":[^,}\]]*,?/g, "");
}

/** Said under an open naming keyboard: spelling a name button by button is easy to get wrong. */
export const NAMING_HINT = "Naming keyboard: press name:NAME types a name (letters, up to 10) and confirms it.";

/** The screen as the results show it: plain text, one line per box, indented under "Screen:". */
export function screenText(lines) {
  if (lines.length === 1 && NO_TEXT.test(lines[0])) return lines[0];
  const plain = plainScreen(lines);
  if (plain.some((l) => /^Menu: /.test(l) && /A B C D E F G H I/.test(l.replace(/▶/g, " ").replace(/ +/g, " ")))) plain.push(NAMING_HINT);
  return plain.length ? plain.map((l) => `  ${l}`).join("\n") : "  (no text)";
}

/**
 * An error that ends with the raw screen ("…. Screen:" then the tile rows): the screen as plain text,
 * like every other result (box drawings are hard to read and cost tokens).
 */
export function plainErrorScreen(text) {
  const at = text.indexOf("Screen:\n");
  if (at < 0) return text;
  const raw = text.slice(at + "Screen:\n".length).split("\n");
  return `${text.slice(0, at)}Screen:\n${screenText(raw)}`;
}

/** With narrow grids (the default), said once in get_map's description. */
export const NARROW_GRID_NOTE = " The x header is two rows: the x row gives the whole x of the first column and of every multiple of 5, each number ending over its column; under it is each column's last digit. Count from the nearest whole number (never more than 4 columns away).";

/** With compact grids (NUZLOCKE_GRID=compact), said once in get_map's description. */
export function compactGridNote({ boulderSwitch = false } = {}) {
  const syms = boulderSwitch ? "I C S P $ H B b o O" : "I C S P $ H B o O";
  return (
    " Squares are grouped in 5-column blocks (a space before every x divisible by 5, marked on the x ruler); " +
    "identical plain rows collapse as y14-17, all-# outer margins are trimmed, " +
    `Points lists exact (x,y) coordinates of items, trees, signs/switches, PCs, clerks/nurses, boulders, floor switches and holes (${syms}), ` +
    "and Cliffs lists edges between walkable-looking squares you can't step across (e.g. y8|9 x5–7 is between rows 8 and 9 along x 5–7; x27|28 y22 is between columns 27 and 28 at y 22)."
  );
}
export const COMPACT_GRID_NOTE = compactGridNote();

// `b` (a boulder on a seen floor switch) reaches the grid only with NUZLOCKE_BOULDER_SWITCH=1
// (the bridge turns it back into `B` otherwise), so listing it here changes nothing by default.
const MAP_POINT_KINDS = ["I", "C", "S", "P", "$", "H", "B", "b", "o", "O"];
const TALL_MAP_ROWS = 16;
const INTERACTIVE = /[@TN$HFIDGSPCBboO]/;
const CLIFF_PREFIX = "Cliff edges (both sides look walkable, but you can't step across): ";
const mod5 = (x) => ((x % 5) + 5) % 5;

/** A bridge map row's label ("y  5 ", "y-100 "). */
const ROW_LABEL = /^y *-?\d+ /;

/**
 * Parses one wide map grid (the bridge's renderView) starting at `lines[i]`, or returns null if
 * `lines[i]` isn't a wide x header. Columns are 3 wide and row labels "y" + 3, or wider when a
 * coordinate needs it (since 0.3.0 they count from where the run arrived and can reach -100).
 */
function parseWideGrid(lines, i) {
  const label = ROW_LABEL.exec(lines[i + 1] ?? "");
  if (!label || !/^ {5,}(?: *-?\d)+$/.test(lines[i])) return null;
  const pre = label[0].length;
  if (lines[i].slice(0, pre).trim()) return null;
  const xs = lines[i].trim().split(/ +/).map(Number);
  const w = (lines[i].length - pre) / xs.length;
  if (!Number.isInteger(w) || w < 3) return null;
  let j = i + 1;
  const rawRows = [];
  for (; j < lines.length && ROW_LABEL.exec(lines[j])?.[0].length === pre; j++) {
    const cells = Array.from({ length: xs.length }, (_, k) => lines[j][pre + w * k + w - 1]);
    rawRows.push({ y: Number(lines[j].slice(1, pre - 1)), prefix: lines[j].slice(0, pre), cells });
  }
  return { xs, rawRows, end: j };
}

/** Shared `Points:` line for the interactive symbols visible on a parsed (already-fogged) grid. */
function pointsLine(rawRows, x0) {
  const bySym = new Map(MAP_POINT_KINDS.map((s) => [s, []]));
  for (const row of rawRows) {
    for (let c = 0; c < row.cells.length; c++) bySym.get(row.cells[c])?.push(`(${x0 + c},${row.y})`);
  }
  const parts = MAP_POINT_KINDS.flatMap((s) => (bySym.get(s).length ? [`${s} ${bySym.get(s).join(", ")}`] : []));
  return parts.length ? `Points: ${parts.join("; ")}.` : null;
}

/**
 * The compact grid (NUZLOCKE_GRID=compact): 5-square blocks with a space before every x divisible
 * by 5, one x ruler line (repeated at the bottom on tall maps), all-# outer margins trimmed (left
 * edge snapped to a multiple of 5), identical consecutive non-interactive rows collapsed (y14-17),
 * a Points line for seen targets, and a shorter Cliffs line.
 */
export function compactGrids(text) {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const parsed = parseWideGrid(lines, i);
    if (!parsed) continue;
    const { xs, rawRows, end: j } = parsed;
    const x0 = xs[0];
    const points = pointsLine(rawRows, x0);

    let rMin = rawRows.findIndex((r) => r.cells.some((ch) => ch !== "#"));
    let rMax = rawRows.length - 1;
    if (rMin < 0) {
      rMin = 0;
    } else {
      while (rMax > rMin && rawRows[rMax].cells.every((ch) => ch === "#")) rMax--;
    }
    let cMin = xs.length;
    let cMax = -1;
    for (let r = rMin; r <= rMax; r++) {
      for (let c = 0; c < xs.length; c++) {
        if (rawRows[r].cells[c] !== "#") {
          if (c < cMin) cMin = c;
          if (c > cMax) cMax = c;
        }
      }
    }
    if (cMax < 0) {
      cMin = 0;
      cMax = xs.length - 1;
    }
    const xStart = Math.max(x0, Math.floor((x0 + cMin) / 5) * 5);
    const cStart = xStart - x0;
    const trimmedXs = xs.slice(cStart, cMax + 1);

    const collapsed = [];
    for (let r = rMin; r <= rMax; r++) {
      const blocks = rawRows[r].cells.slice(cStart, cMax + 1).map((ch, k) => (k > 0 && mod5(trimmedXs[k]) === 0 ? ` ${ch}` : ch)).join("");
      const prev = collapsed[collapsed.length - 1];
      if (prev && prev.yEnd + 1 === rawRows[r].y && prev.blocks === blocks && !INTERACTIVE.test(blocks)) prev.yEnd = rawRows[r].y;
      else collapsed.push({ y0: rawRows[r].y, yEnd: rawRows[r].y, blocks });
    }
    // Size the row-tag column from the widest row label so y >= 100 ranges (e.g. y96-101, y102-143)
    // stay aligned with single rows and the x ruler.
    const rangeW = Math.max(5, ...collapsed.map((g) => (g.y0 === g.yEnd ? String(g.y0).length : `${g.y0}-${g.yEnd}`.length)));
    const tagW = rangeW + 2;
    const col = [tagW];
    for (let k = 1; k < trimmedXs.length; k++) col.push(col[k - 1] + (mod5(trimmedXs[k]) === 0 ? 2 : 1));
    const mults = trimmedXs.flatMap((x, k) => (mod5(x) === 0 ? [k] : []));
    const ticks = !mults.length || (mults[0] > 0 && col[mults[0]] - tagW > String(trimmedXs[0]).length) ? [0, ...mults] : mults;
    let ruler = "";
    for (const k of ticks) ruler = ruler.padEnd(col[k], " ") + String(trimmedXs[k]);

    const rowTag = (y0, y1) => (y0 === y1 ? `y${String(y0).padStart(3)}`.padEnd(tagW, " ") : `y${`${y0}-${y1}`.padStart(rangeW)} `);
    const gridLines = collapsed.map((g) => rowTag(g.y0, g.yEnd) + g.blocks);
    const out = [ruler, ...gridLines, ...(gridLines.length >= TALL_MAP_ROWS ? [ruler] : [])];
    lines.splice(i, j - i, ...out);
    let after = i + out.length;
    if (lines[after]?.startsWith(CLIFF_PREFIX)) {
      lines[after] = "Cliffs: " + lines[after].slice(CLIFF_PREFIX.length)
        .replace(/([xy]-?\d+)\|[xy](-?\d+) at ([xy]-?\d+(?:–-?\d+)?)/g, "$1|$2 $3");
      after++;
    }
    if (lines[after]?.startsWith("Doors (D): ")) after++;
    if (points) {
      lines.splice(after, 0, points);
      after++;
    }
    i = after - 1;
  }
  return lines.join("\n");
}

/**
 * The narrow grid's x header, two rows indented like the row labels ("y  5 "): an "x" row with
 * the whole x of the first column and of every multiple of 5, each ending over its column, and
 * under it each column's last digit. Any column is then at most 4 from a whole number. Until
 * 2026-11-19 it was each column's digits stacked in rows (sign, hundreds, tens, ones), read top
 * to bottom: models doubted their reading by a column or two and took screenshots to check.
 */
export function narrowHeader(xs, indent) {
  // Column c's digit is at indent + 2c + 1.
  const at = (c) => indent + 2 * c + 1;
  const label = [..."x".padEnd(at(xs.length - 1) + 1)];
  let lastEnd = -1;
  xs.forEach((x, c) => {
    if (c > 0 && x % 5 !== 0) return;
    const s = String(x);
    const start = at(c) - s.length + 1;
    // A gap of one space at least, so two numbers never read as one.
    if (start <= lastEnd + 1) return;
    for (let k = 0; k < s.length; k++) label[start + k] = s[k];
    lastEnd = at(c);
  });
  const ones = " ".repeat(indent) + xs.map((x) => ` ${Math.abs(x) % 10}`).join("");
  return [label.join("").trimEnd(), ones];
}

/**
 * The narrow grid: one space between squares instead of two. A square stays its own token (no
 * spaces at all would merge runs like "....." into one), at ~40% fewer tokens per map. The x
 * header becomes two rows (narrowHeader) to fit the narrower columns. With `points: true`
 * (NUZLOCKE_MAP_POINTS=1), tall maps repeat the x header at the bottom and add the shared `Points:` line.
 */
export function narrowGrids(text, { points = false } = {}) {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const parsed = parseWideGrid(lines, i);
    if (!parsed) continue;
    const { xs, rawRows, end: j } = parsed;
    const header = narrowHeader(xs, rawRows[0].prefix.length);
    const out = [
      ...header,
      ...rawRows.map((row) => row.prefix + row.cells.map((ch) => ` ${ch}`).join("")),
      ...(points && rawRows.length >= TALL_MAP_ROWS ? header : []),
    ];
    lines.splice(i, j - i, ...out);
    let after = i + out.length;
    if (points) {
      if (lines[after]?.startsWith(CLIFF_PREFIX)) after++;
      if (lines[after]?.startsWith("Doors (D): ")) after++;
      const line = pointsLine(rawRows, xs[0]);
      if (line) {
        lines.splice(after, 0, line);
        after++;
      }
    }
    i = after - 1;
  }
  return lines.join("\n");
}

/**
 * Wide grid with `points: true` (NUZLOCKE_GRID=wide + NUZLOCKE_MAP_POINTS=1): leaves the wide
 * squares untouched, repeats the x header at the bottom of tall maps, and adds the shared `Points:` line.
 */
export function wideGrids(text, { points = false } = {}) {
  if (!points) return text;
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const parsed = parseWideGrid(lines, i);
    if (!parsed) continue;
    const { xs, rawRows, end } = parsed;
    let after = end;
    if (rawRows.length >= TALL_MAP_ROWS) {
      lines.splice(after, 0, lines[i]);
      after++;
    }
    if (lines[after]?.startsWith(CLIFF_PREFIX)) after++;
    if (lines[after]?.startsWith("Doors (D): ")) after++;
    const line = pointsLine(rawRows, xs[0]);
    if (line) {
      lines.splice(after, 0, line);
      after++;
    }
    i = after - 1;
  }
  return lines.join("\n");
}

const NO_TEXT = /^\(No text on screen/;
const BATTLE_MENU = [/FIGHT\W*PKMN/, /ITEM\W*RUN/];

/**
 * Text-box lines joined into sentences: the game wraps at 18 characters, so a message wrapped over
 * two lines is one message, and a nickname line belongs with "used BLAZE!" after it.
 */
export function sentences(lines = []) {
  const out = [];
  for (const line of lines) {
    // An HP note ("(MONA: 85% → 63% HP.)") stands on its own.
    if (out.length && !line.startsWith("(") && !/[.!?…]["'”)]*$/.test(out[out.length - 1])) out[out.length - 1] += ` ${line}`;
    else out.push(line);
  }
  return out;
}

/** Compact JSON: indentation is mostly whitespace tokens. */
export const json = (v) => ({ content: [{ type: "text", text: JSON.stringify(v) }] });

/**
 * get_state's only=[...]: just those sections, but never silently empty. The "not started"
 * note stays, and sections the state doesn't have are named rather than left out.
 */
export function pickSections(state, only) {
  if (state == null) return { started: false, note: "No game state yet: the run is still loading. Try again in a moment." };
  if (!only?.length || typeof state !== "object") return state;
  const out = Object.fromEntries(only.filter((k) => k in state).map((k) => [k, state[k]]));
  for (const k of ["started", "note"]) if (k in state && !(k in out)) out[k] = state[k];
  const missing = only.filter((k) => !(k in state));
  if (missing.length) out.unavailable = missing;
  return out;
}

/**
 * Formats action results. Remembers the last screen text it sent, so an unchanged screen
 * is one line instead of eighteen; call reset() when the model may not have seen it (a new
 * page, a loaded state).
 */
/**
 * What a result says instead of the area's map when maps are sent only on request (mapsOnRequest):
 * the map's exits, if the map text names them, and where to get the picture.
 */
export function mapOnRequest(map) {
  const exits = /^Map exits:[^\n]*/m.exec(map ?? "")?.[0];
  return `${exits ? `${exits} ` : ""}Map: not shown (get_map shows it)`;
}

/** mapsOnRequest: a move's result leaves the area's map out unless asked (keepMap: get_map, or show_map on a move). */
export function createFormatter({ mapsOnRequest = false } = {}) {
  let lastScreen = null;
  let lastMap = null;

  const screen = (lines = [], inBattle = false) => {
    const text = lines.join("\n");
    if (lines.length === 1 && NO_TEXT.test(lines[0])) {
      lastScreen = text;
      return "Screen: no text (overworld)";
    }
    // The battle menu screen shows names, levels and HP bars the 🟢/🔴 lines already give exactly.
    if (inBattle && BATTLE_MENU.every((re) => lines.some((l) => re.test(l)))) {
      lastScreen = text;
      return "Screen: the battle menu (FIGHT, PKMN, ITEM, RUN)";
    }
    if (text === lastScreen) return "Screen: unchanged";
    lastScreen = text;
    return `Screen:\n${screenText(lines)}`;
  };

  /** keepMap: the model asked for the map (get_map), so it's shown even when unchanged. */
  const afterAction = (r, { keepMap = false } = {}) => {
    const s = r.status ?? {};
    const out = [
      r.saveWarning ? `⚠️ ${r.saveWarning}` : null,
      `📍 ${s.location ?? "?"} | battle: ${s.battle ?? "?"}${s.trainer ? ` (${s.trainer})` : ""}`,
      s.lead ? `🟢 you: ${s.lead}${s.others ? ` · also: ${s.others}` : ""}${s.dead ? ` · dead: ${s.dead}` : ""}${s.cap ? ` · cap Lv${s.cap}${s.capCandiesOnly ? " for Rare Candies (League battles may pass it)" : ""}` : ""}` : null,
      s.enemy ? `🔴 foe: ${s.enemy}` : null,
      s.outcome ? `🏁 RUN ENDED — ${s.outcome}` : null,
      r.crashed ? `💥 ${r.crashed}` : null,
      r.used ? `Used ${r.used}${r.on ? ` on ${r.on}` : ""}.` : null,
      r.note ? `Note: ${r.note}` : null,
      r.chose ? `Chose ${r.chose}.` : null,
      r.walk ? `Walk: ${r.walk}` : null,
      r.poison?.length ? `Poison: ${r.poison.join("; ")}` : null,
      r.switchedTo ? `Switched to ${r.switchedTo}.` : null,
      r.threw ? `Threw a ${r.threw}${r.caught ? " — caught!" : "."}` : null,
      r.messages?.length ? `Messages:\n${sentences(r.messages).map((m) => `  • ${m}`).join("\n")}` : null,
      r.events?.length ? `Tracker:\n${r.events.map((e) => `  📋 ${e}`).join("\n")}` : null,
      r.stopped ? `(stopped: ${r.stopped})` : null,
      r.map ? (mapsOnRequest && !keepMap && r.map.includes("\n") ? mapOnRequest(r.map)
        : r.map === lastMap && !keepMap && r.map.includes("\n") ? "Map: unchanged" : `Map:\n${r.map}`) : null,
      screen(r.screenText, !!s.battle && s.battle !== "none"),
    ].filter(Boolean);
    if (r.map) lastMap = r.map;
    return { content: [{ type: "text", text: out.join("\n") }] };
  };

  return {
    afterAction,
    /** Forget the last screen: the next result shows it in full. */
    reset: () => {
      lastScreen = null;
      lastMap = null;
    },
  };
}
