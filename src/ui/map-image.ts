// The model panel's maps as pictures: the text grid a tool result carries (what the model reads)
// drawn as one coloured block per square, with a legend; a click opens it big in the viewer, which
// can also show the text the model actually got.

import { fitScale, openViewer } from "./viewer";

/** Colour and meaning of each map symbol (the get_map legend). */
const SYMBOLS: Record<string, [string, string]> = {
  "#": ["#3b3f46", "blocked"],
  ".": ["#d9d6c3", "walkable"],
  ",": ["#b5ad8f", "lower floor (cave)"],
  '"': ["#4caf50", "tall grass"],
  "~": ["#3b82f6", "water"],
  "*": ["#bfe8f5", "ice (you slide)"],
  "?": ["#6b7280", "not seen yet"],
  v: ["#a0703c", "ledge (hop down)"],
  "<": ["#a0703c", "ledge (hop left)"],
  ">": ["#a0703c", "ledge (hop right)"],
  "@": ["#ff3b30", "you"],
  T: ["#ff9500", "trainer"],
  "!": ["#ffcc80", "a trainer's sight"],
  N: ["#af52de", "person"],
  $: ["#34c759", "shop clerk"],
  H: ["#ff2d55", "nurse"],
  F: ["#ffe14d", "your Pikachu (follows you)"],
  I: ["#ffd60a", "item"],
  D: ["#2ec4b6", "door / warp"],
  G: ["#b0413e", "closed gate"],
  S: ["#ff6fa8", "sign / switch"],
  P: ["#5ac8fa", "PC"],
  C: ["#1e6b2f", "tree to Cut"],
  B: ["#8d6e63", "boulder"],
  b: ["#c0ca33", "boulder on a floor switch"],
  o: ["#f5f5f5", "floor switch"],
  O: ["#000000", "hole"],
  "=": ["#795548", "counter"],
  "↑": ["#d500f9", "spinner"], "↓": ["#d500f9", "spinner"], "←": ["#d500f9", "spinner"], "→": ["#d500f9", "spinner"], "+": ["#d500f9", "spinner"],
};

/** A dark map shows only what the run has seen in the dark, and its text says so (DARK_HEADER). */
const DARK_SYMBOLS: Record<string, [string, string]> = {
  "#": ["#6f7f78", "rock"],
  ".": ["#3b4a44", "floor"],
  ",": ["#2c3833", "lower floor"],
  "?": ["#141414", "dark: can't see"],
  D: ["#2ec4b6", "ladder"],
  "@": ["#ff3b30", "you"],
};
const DARK_HEAD = /^It.s dark[.:]/;
const DARK_ROW = /^[#.,?D@]( [#.,?D@])*$/;

const ROW = /^y\s*-?\d+(?:--?\d+)? /;
const ROW_TAG = /^y\s*(-?\d+)(?:-(-?\d+))? +/;
const HEADER = /^ {5}[ \d-]+$/;

interface Grid { cells: string[][]; ys: number[]; x0: number; start: number; end: number; dark?: boolean; cliffs?: Cliff[] }

/** A ledge between two squares: horizontal between rows `at` and `at + 1`, or vertical between columns, over from..to. */
export interface Cliff { axis: "x" | "y"; at: number; from: number; to: number }

/** The result's "Cliff edges" (or compact "Cliffs:") line: "y8|y9 at x5–7; x27|x28 at y22" / "y8|9 x5–7; x27|28 y22". */
export function cliffsOf(lines: string[]): Cliff[] {
  const line = lines.find((l) => /^Cliff(?: edges\b|s:)/.test(l));
  if (!line) return [];
  return [...line.matchAll(/([xy])(-?\d+)\|[xy]?-?\d+ (?:at )?[xy](-?\d+)(?:–(-?\d+))?/g)].map((m) => ({
    axis: m[1] as "x" | "y", at: Number(m[2]), from: Number(m[3]), to: Number(m[4] ?? m[3]),
  }));
}

/** Pixels a square gets on the canvas, so a ledge can sit between two squares. */
const SQUARE = 4;
const CLIFF_COLOUR = "#c2185b";

/** The map grid in a result's lines (header rows + "y N" rows), or null. */
export function findGrid(lines: string[]): Grid | null {
  const dark = lines.findIndex((l) => DARK_HEAD.test(l));
  if (dark >= 0) {
    // Before 0.3.0 the dark view had no coordinates: rows of squares only.
    let last = dark + 1;
    while (last < lines.length && DARK_ROW.test(lines[last])) last++;
    if (last > dark + 1) return { cells: lines.slice(dark + 1, last).map((l) => l.split(" ")), ys: [], x0: 0, start: dark + 1, end: last, dark: true };
    // Since then it's a map like any other, in the dark's colours.
    const grid = codedGrid(lines);
    return grid && { ...grid, dark: true };
  }
  return codedGrid(lines);
}

/** A map grid with coordinates (header rows + "y N" rows), or null. */
function codedGrid(lines: string[]): Grid | null {
  const first = lines.findIndex((l) => ROW.test(l));
  if (first < 0) return null;
  let rowsEnd = first;
  while (rowsEnd < lines.length && ROW.test(lines[rowsEnd])) rowsEnd++;
  let end = rowsEnd;
  while (end < lines.length && HEADER.test(lines[end]) && lines[end].trim() !== "") end++;
  let start = first;
  while (start > 0 && HEADER.test(lines[start - 1])) start--;
  const rows = lines.slice(first, rowsEnd);
  const head = lines.slice(start, first);
  const rowBody = (l: string) => l.replace(ROW_TAG, "");
  // The compact grid's ruler is one line; a narrow header with long row labels (y-100) is several.
  const isCompact = rows.some((l) => /^y\s*-?\d+--?\d+ /.test(l) || /\S{2}/.test(rowBody(l)))
    || (head.length <= 1 && rows.every((l) => (ROW_TAG.exec(l)?.[0].length ?? 0) >= 7) && !rowBody(rows[0]).includes("  "));
  if (isCompact) {
    const cells: string[][] = [];
    const ys: number[] = [];
    for (const l of rows) {
      const m = ROW_TAG.exec(l);
      const y0 = Number(m?.[1] ?? 0);
      const y1 = m?.[2] != null ? Number(m[2]) : y0;
      const rowCells = l.slice(m?.[0].length ?? 7).trim().split(/\s+/).flatMap((b) => [...b]);
      for (let y = y0; y <= y1; y++) {
        cells.push(rowCells);
        ys.push(y);
      }
    }
    let x0 = 0;
    const gridCol = ROW_TAG.exec(rows[0])?.[0].length ?? 7;
    const tick = head.length ? /-?\d+/.exec(head[0]) : null;
    if (tick) x0 = Number(tick[0]) - rows[0].slice(gridCol, tick.index).replace(/ /g, "").length;
    return { cells, ys, x0, start, end, cliffs: cliffsOf(lines) };
  }
  const cells = rows.map((l) => l.slice(5).trim().split(/\s+/));
  const ys = rows.map((l) => Number(l.slice(1, 5)));
  // x of the first column: the wide header is numbers (its columns widen for -10 and beyond); the
  // narrow one is digits read down each column, with a sign row on top when x goes below -9 and a
  // hundreds row for 100 or more (0.3.0: coordinates count from where the run arrived).
  let x0 = 0;
  const numbers = head.length === 1 ? head[0].trim().split(/\s+/) : [];
  if (numbers.length === cells[0].length && numbers.every((n) => /^-?\d+$/.test(n))) x0 = Number(numbers[0]);
  else if (head.length) {
    // The first column read top to bottom: a - (in a sign row, or in the tens row) and its digits.
    const col = head[head.length - 1].search(/\d/);
    const down = head.map((row) => row[col] ?? " ").join("");
    x0 = (down.includes("-") ? -1 : 1) * Number(down.replace(/\D/g, ""));
  }
  return { cells, ys, x0, start, end, cliffs: cliffsOf(lines) };
}

/** The grid as a canvas, one pixel a square (CSS scales it); hover shows x,y and what's there. */
function gridCanvas(grid: Grid): { canvas: HTMLCanvasElement; used: Set<string>; w: number; h: number } {
  const w = Math.max(...grid.cells.map((r) => r.length));
  const h = grid.cells.length;
  const canvas = document.createElement("canvas");
  canvas.width = w * SQUARE;
  canvas.height = h * SQUARE;
  const ctx = canvas.getContext("2d")!;
  const used = new Set<string>();
  const symbols = grid.dark ? DARK_SYMBOLS : SYMBOLS;
  grid.cells.forEach((row, r) => row.forEach((ch, c) => {
    ctx.fillStyle = symbols[ch]?.[0] ?? "#888";
    ctx.fillRect(c * SQUARE, r * SQUARE, SQUARE, SQUARE);
    used.add(ch);
  }));
  ctx.fillStyle = CLIFF_COLOUR;
  for (const e of grid.cliffs ?? []) {
    const line = (grid.ys[0] ?? 0);
    const horizontal = e.axis === "y";
    const across = horizontal ? e.at - line + 1 : e.at - grid.x0 + 1;
    const along = (horizontal ? e.from - grid.x0 : e.from - line) * SQUARE;
    const length = (e.to - e.from + 1) * SQUARE;
    if (horizontal) ctx.fillRect(along, across * SQUARE - 1, length, 2);
    else ctx.fillRect(across * SQUARE - 1, along, 2, length);
  }
  canvas.addEventListener("mousemove", (ev) => {
    const rect = canvas.getBoundingClientRect();
    const c = Math.floor(((ev.clientX - rect.left) / rect.width) * w);
    const r = Math.floor(((ev.clientY - rect.top) / rect.height) * h);
    const ch = grid.cells[r]?.[c];
    canvas.title = !ch ? "" : !grid.ys.length ? symbols[ch]?.[1] ?? ch : `(${grid.x0 + c}, ${grid.ys[r]}) ${symbols[ch]?.[1] ?? ch}`;
  });
  return { canvas, used, w, h };
}

function legendOf(used: Set<string>, symbols = SYMBOLS, cliffs = false): HTMLElement {
  const legend = document.createElement("span");
  legend.className = "convo-map-legend";
  for (const ch of Object.keys(symbols)) {
    if (!used.has(ch)) continue;
    const item = document.createElement("span");
    item.innerHTML = `<i style="background:${symbols[ch][0]}"></i>`;
    item.append(symbols[ch][1]);
    legend.append(item);
  }
  if (cliffs) {
    const item = document.createElement("span");
    item.innerHTML = `<i style="background:${CLIFF_COLOUR}"></i>`;
    item.append("cliff edge (can't step across)");
    legend.append(item);
  }
  return legend;
}

/** The map in the viewer: as big as the window allows, or as the text the model got. */
function openMap(grid: Grid, text: string, asText: boolean): void {
  const { canvas, used, w, h } = gridCanvas(grid);
  const px = fitScale(w, h);
  canvas.style.width = `${w * px}px`;
  canvas.style.height = `${h * px}px`;
  const picture = document.createElement("div");
  picture.className = "viewer-map";
  picture.append(canvas, legendOf(used, grid.dark ? DARK_SYMBOLS : SYMBOLS, !!grid.cliffs?.length));
  const raw = document.createElement("pre");
  raw.className = "viewer-text";
  raw.textContent = text;
  const body = document.createElement("div");
  const toggle = document.createElement("button");
  const show = (t: boolean) => {
    picture.hidden = t;
    raw.hidden = !t;
    toggle.textContent = t ? "As a picture" : "As the model sees it";
  };
  toggle.addEventListener("click", () => show(Boolean(raw.hidden)));
  body.append(picture, raw);
  show(asText);
  openViewer("Map", body, [toggle]);
}

/** The map in the panel: small, with its legend; a click (or a button) opens it in the viewer. */
export function mapFigure(grid: Grid, text: string): HTMLElement {
  const fig = document.createElement("figure");
  fig.className = "convo-map";
  // The text kept with the picture: a copy of this page's log (the live viewer's) has no click
  // handlers, so it shows "As the model sees it" from here.
  fig.dataset.mapText = text;
  const { canvas, used, w, h } = gridCanvas(grid);
  // Big enough to read in the panel: up to 8 px a square, within about 360×300 px.
  const px = Math.max(2, Math.min(8, Math.floor(360 / w), Math.floor(300 / h)));
  canvas.style.width = `${w * px}px`;
  canvas.style.height = `${h * px}px`;
  canvas.addEventListener("click", (ev) => {
    ev.stopPropagation();
    openMap(grid, text, false);
  });
  const bar = document.createElement("div");
  bar.className = "convo-map-bar";
  const big = document.createElement("button");
  big.textContent = "⤢ Open";
  big.addEventListener("click", (ev) => {
    ev.stopPropagation();
    openMap(grid, text, false);
  });
  const asText = document.createElement("button");
  asText.textContent = "As the model sees it";
  asText.addEventListener("click", (ev) => {
    ev.stopPropagation();
    openMap(grid, text, true);
  });
  bar.append(big, asText, legendOf(used, grid.dark ? DARK_SYMBOLS : SYMBOLS, !!grid.cliffs?.length));
  fig.append(canvas, bar);
  return fig;
}
