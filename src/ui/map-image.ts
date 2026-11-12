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
  o: ["#f5f5f5", "floor switch"],
  O: ["#000000", "hole"],
  "=": ["#795548", "counter"],
  "↑": ["#d500f9", "spinner"], "↓": ["#d500f9", "spinner"], "←": ["#d500f9", "spinner"], "→": ["#d500f9", "spinner"], "+": ["#d500f9", "spinner"],
};

/** A dark map shows only what's lit, and its text says so (renderDarkView): no coordinates to hover. */
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

const ROW = /^y\s*-?\d+ /;
const HEADER = /^ {5}[ \d-]+$/;

interface Grid { cells: string[][]; ys: number[]; x0: number; start: number; end: number; dark?: boolean; cliffs?: Cliff[] }

/** A ledge between two squares: horizontal between rows `at` and `at + 1`, or vertical between columns, over from..to. */
export interface Cliff { axis: "x" | "y"; at: number; from: number; to: number }

/** The result's "Cliff edges" line: "y8|y9 at x5–7; x27|x28 at y22". */
export function cliffsOf(lines: string[]): Cliff[] {
  const line = lines.find((l) => l.startsWith("Cliff edges"));
  if (!line) return [];
  return [...line.matchAll(/([xy])(-?\d+)\|[xy]-?\d+ at [xy](-?\d+)(?:–(-?\d+))?/g)].map((m) => ({
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
    let last = dark + 1;
    while (last < lines.length && DARK_ROW.test(lines[last])) last++;
    if (last === dark + 1) return null;
    const cells = lines.slice(dark + 1, last).map((l) => l.split(" "));
    return { cells, ys: [], x0: 0, start: dark + 1, end: last, dark: true };
  }
  const first = lines.findIndex((l) => ROW.test(l));
  if (first < 0) return null;
  let end = first;
  while (end < lines.length && ROW.test(lines[end])) end++;
  let start = first;
  while (start > 0 && HEADER.test(lines[start - 1])) start--;
  const rows = lines.slice(first, end);
  const cells = rows.map((l) => l.slice(5).trim().split(/\s+/));
  const ys = rows.map((l) => Number(l.slice(1, 5)));
  // x of the first column: the wide header is numbers; the narrow one is tens over ones.
  const head = lines.slice(start, first);
  let x0 = 0;
  if (head.length === 1 && /\d\s{1,2}\d/.test(head[0]) && head[0].trim().split(/\s+/).length === cells[0].length) x0 = Number(head[0].trim().split(/\s+/)[0]);
  else if (head.length) {
    const ones = head[head.length - 1];
    const tens = head.length > 1 ? head[head.length - 2] : "";
    const col = ones.search(/[\d]/);
    const t = (tens[col] ?? " ").trim();
    x0 = t === "-" ? -Number(ones[col]) : Number(`${t}${ones[col]}`);
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
    canvas.title = !ch ? "" : grid.dark ? symbols[ch]?.[1] ?? ch : `(${grid.x0 + c}, ${grid.ys[r]}) ${symbols[ch]?.[1] ?? ch}`;
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
  toggle.addEventListener("click", () => show(raw.hidden));
  body.append(picture, raw);
  show(asText);
  openViewer("Map", body, [toggle]);
}

/** The map in the panel: small, with its legend; a click (or a button) opens it in the viewer. */
export function mapFigure(grid: Grid, text: string): HTMLElement {
  const fig = document.createElement("figure");
  fig.className = "convo-map";
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
