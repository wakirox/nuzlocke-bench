// Text maps of the overworld — the grid a game adapter reads from memory (the visible screen or
// the whole current map: src/games/<game>/overworld.ts) — and breadth-first pathfinding over
// them. Lets an AI navigate without screenshots. Nothing here knows a game's memory or tiles.

export type Dir = "up" | "down" | "left" | "right";
const STEPS: [Dir, number, number][] = [["up", 0, -1], ["down", 0, 1], ["left", -1, 0], ["right", 1, 0]];

/**
 * Pipeline stage of an overworld view:
 * - `"raw"`: straight from ROM/RAM map data (all squares & doors present; harness mechanics only)
 * - `"known"`: masked to what the player/run has seen (`SeenMaps.fog`), safe to show & walk directly
 * - `"guessed"`: optimistic fill of `"?"` squares for frontier pathfinding; never shown to the player
 */
export type ViewStage = "raw" | "known" | "guessed";

export interface OverworldView<S extends ViewStage | undefined = undefined> {
  readonly stage?: S;
  /** grid[row][col]: @ you, N person, $ shop clerk, H nurse, B boulder, b boulder on a floor switch, o floor switch, O hole in the floor, D door/warp, S something to use by facing it, P a PC, # blocked, . walkable, " tall grass, v<> ledge, * ice (you slide on it) */
  grid: string[][];
  /** Map coordinates of grid[0][0]. */
  originX: number;
  originY: number;
  /** The player's position in the grid. */
  pc: number;
  pr: number;
  /** Map exits (connections) for the full map. */
  exits?: Dir[];
  /** Squares (row * width + col) an unbeaten trainer is looking at — walking there starts a fight. */
  watched?: Set<number>;
  /** For each watched square, the map coordinates of the trainer(s) looking at it. */
  watchers?: Map<number, [number, number][]>;
  /** Collision tile id of each square (same layout as grid), for tile-pair collisions. */
  tiles?: number[][];
  /** Whether a step between two squares with these collision tiles is blocked, going (dx, dy): Gen 1 cliff edges (pairs), Crystal one-sided walls. */
  stepBlocked?: (a: number, b: number, dx: number, dy: number) => boolean;
  /** The same for a step taken surfing, where the game has its own pairs (Gen 1: water against a cliff). */
  swimBlocked?: (a: number, b: number, dx: number, dy: number) => boolean;
  /** Whether a floor tile is the lower level of a cave, drawn apart from the upper as a player sees them. */
  lowerFloor?: (tile: number) => boolean;
  /** Whether a floor tile is a cave's stairs: the only squares where its two floor heights meet without a cliff. */
  stairs?: (tile: number) => boolean;
  /** Class of any map square, including the neighbouring map's strip just past the edge. */
  beyond?: (x: number, y: number) => string;
  /** Where each door/warp in the view leads. */
  doors?: Door[];
  /** The player is surfing: water ("~") can be crossed, and land stepped onto (not back). */
  surfing?: boolean;
}

export type AnyOverworldView = OverworldView<ViewStage | undefined>;
export type RawOverworldView = OverworldView<"raw"> & { readonly stage: "raw" };
export type KnownOverworldView = OverworldView<"known"> & { readonly stage: "known" };
export type GuessedOverworldView = OverworldView<"guessed"> & { readonly stage: "guessed" };
/** Views holding un-fogged map geometry (`RawOverworldView` or untagged test fixtures; rejects `"known"`/`"guessed"`). */
export type UnfoggedView = OverworldView<"raw" | undefined>;
/** Views safe to print as a lit map or exits line (`KnownOverworldView` or untagged test fixtures; rejects `"raw"`/`"guessed"`). */
export type FoggedView = OverworldView<"known" | undefined>;

/** A door or warp. `push`: the way to press while standing on it to go through (a warp mat), when the game says so. */
export interface Door { x: number; y: number; to: string; tx: number | null; ty: number | null; push?: Dir }

/** Whether the step from square (c, r) to (nc, nr) crosses a tile-pair edge (a cliff edge). */
export function pairBlocked(v: AnyOverworldView, c: number, r: number, nc: number, nr: number): boolean {
  if (!v.tiles || !v.stepBlocked) return false;
  return v.stepBlocked(v.tiles[r][c], v.tiles[nr][nc], nc - c, nr - r);
}

/** pairBlocked for a step taken surfing (swimBlocked). */
function swimPairBlocked(v: AnyOverworldView, c: number, r: number, nc: number, nr: number): boolean {
  if (!v.tiles || !v.swimBlocked) return false;
  return v.swimBlocked(v.tiles[r][c], v.tiles[nr][nc], nc - c, nr - r);
}

/** Whether a map square holds a boulder (plain, or sitting on a floor switch). */
export const isBoulder = (ch: string): boolean => ch === "B" || ch === "b";

/** A cave's stairs on the map: walkable, drawn apart from the floor (caveFloor). */
export const STAIRS = "≡";

/**
 * A walkable square of floor as a player sees it in a cave with two floor heights: "," on the lower
 * floor, STAIRS on the stairs between them (the only squares where the two meet without a cliff:
 * a player sees the steps, and the map showed them as floor until 2026-11-20), "." otherwise.
 */
export function caveFloor(v: AnyOverworldView, r: number, c: number): string {
  const tile = v.tiles?.[r]?.[c];
  if (tile === undefined) return ".";
  return v.lowerFloor?.(tile) ? "," : v.stairs?.(tile) ? STAIRS : ".";
}

/**
 * What a trainer's gaze stops at: walls and anything solid standing in the way (a gate, a counter,
 * a tree to cut, a sign or PC, a boulder) and people (N, $ clerk, H nurse, T trainer, I item ball).
 */
const BLOCKS_SIGHT = new Set(["#", "G", "=", "C", "S", "P", "B", "b", "N", "$", "H", "T", "I"]);

/** The four ways a trainer can face, as [dx, dy]: down, up, left, right. */
const FACINGS: [number, number][] = [[0, 1], [0, -1], [-1, 0], [1, 0]];

export interface TrainerSprite { index: number; x: number; y: number; dx: number; dy: number; onScreen: boolean; sight: boolean }

/** Which way an on-screen trainer faces, from the same TrainerSprite vector markWatched uses; undefined off screen (not updated). */
export function trainerFacing(s: Pick<TrainerSprite, "dx" | "dy" | "onScreen">): Dir | undefined {
  if (!s.onScreen) return undefined;
  return STEPS.find(([, dx, dy]) => dx === s.dx && dy === s.dy)?.[0];
}

/**
 * Marks what each unbeaten trainer can see: straight ahead until a wall or person, at most `reach`
 * squares (how far the game's trainers can spot you).
 */
export function markWatched(v: OverworldView, trainers: TrainerSprite[], beaten: number[], reach: number): void {
  const H = v.grid.length;
  const W = v.grid[0]?.length ?? 0;
  const watched = new Set<number>();
  const watchers = new Map<number, [number, number][]>();
  for (const t of trainers) {
    if (beaten.includes(t.index) || !t.sight) continue;
    // Off-screen sprites aren't updated, so their facing isn't known yet: assume any way.
    const dirs = t.onScreen ? [[t.dx, t.dy]] : FACINGS;
    for (const [dx, dy] of dirs) {
      for (let k = 1; k <= reach; k++) {
        const c = t.x + dx * k - v.originX;
        const r = t.y + dy * k - v.originY;
        if (r < 0 || r >= H || c < 0 || c >= W) {
          // Past the view's edge (a trainer just off screen looking in): the map says whether the
          // gaze gets through there; without the map it can't be told, so it stops.
          // (The map there shows no people: only what the map itself has stops it.)
          const past = v.beyond?.(t.x + dx * k, t.y + dy * k);
          if (past == null || BLOCKS_SIGHT.has(past)) break;
          continue;
        }
        if (BLOCKS_SIGHT.has(v.grid[r][c])) break;
        watched.add(r * W + c);
        const who = watchers.get(r * W + c) ?? [];
        if (!who.some(([x, y]) => x === t.x && y === t.y)) who.push([t.x, t.y]);
        watchers.set(r * W + c, who);
      }
    }
  }
  v.watched = watched;
  v.watchers = watchers;
}

/** Whether paths may cross unbeaten trainers' sight. The player decides; nothing here does. */
export interface SightOptions {
  /** true: route around trainers' sight where possible (stopping short when it isn't). false: plain shortest paths. */
  avoidSight: boolean;
}

/**
 * The trainers (map coordinates) whose sight a path crosses, in the order it reaches them —
 * reported with plain shortest paths, so the player knows what walking it means.
 */
export function sightCrossings(v: AnyOverworldView, dirs: Dir[]): [number, number][] {
  const W = v.grid[0]?.length ?? 0;
  const out: [number, number][] = [];
  let c = v.pc;
  let r = v.pr;
  for (const d of dirs) {
    const [, dx, dy] = STEPS.find(([s]) => s === d)!;
    const hop = LEDGE_DIR[v.grid[r + dy]?.[c + dx]] === d ? 2 : 1;
    c += dx * hop;
    r += dy * hop;
    for (const t of v.watchers?.get(r * W + c) ?? []) {
      if (!out.some(([x, y]) => x === t[0] && y === t[1])) out.push(t);
    }
  }
  return out;
}

/** Ledge squares on the map → the direction you can hop them. */
const LEDGE_DIR: Record<string, Dir> = { v: "down", "<": "left", ">": "right" };

/**
 * Why walk_to can't end on (x, y) when it's a one-way ledge, or null. Walking "to" a ledge used to
 * stop beside it and say "arrived", which read as success to a player trying to cross it the wrong way.
 */
export function ledgeTarget(v: AnyOverworldView, x: number, y: number): string | null {
  const ch = v.grid[y - v.originY]?.[x - v.originX];
  const dir = ch ? LEDGE_DIR[ch] : undefined;
  if (!dir) return null;
  const [dx, dy] = dir === "down" ? [0, 1] : dir === "left" ? [-1, 0] : [1, 0];
  return `(${x}, ${y}) is a one-way ledge (${ch}): you hop over it going ${dir} and can't stand on it. ` +
    `To go ${dir}, walk_to the square past it, (${x + dx}, ${y + dy}). To go the other way, the ledge row has to be walked around: walk_to a square beyond it and the path finds the gap.`;
}

/**
 * The screen as a player sees it in the dark: only the lit squares (litSquares) show, each as what it is
 * (rock, floor or the cave's lower floor, a ladder), since a player tells the cave's patterns apart. Lit isn't rock: in the dark
 * tunnel the floor's pattern shows while some walls are drawn black, so a square says what the map has
 * there, not whether it's lit. A black wall right next to a lit square shows as rock too: a player reads
 * it as the edge of what's lit (a cliff's shadow). Other black squares, the player and everyone else
 * (black sprites) are "?". The player is always at the screen's centre, so @ is known.
 * Returns the screen's squares row by row: "#", ".", ",", "D", "?" or "@" (SeenMaps.sawDark keeps them).
 */
/** What a lit square can show in the dark; anything else there (a person, an object) is a black sprite. */
const DARK_SEEN = new Set(["#", ".", ",", STAIRS, "D"]);

export function darkSquares(v: UnfoggedView, lit: boolean[][], covered?: boolean[][]): string[][] {
  // Squares under a text box or menu (boxedSquares) can't be seen, lit or not; nor do they light
  // the wall beside them.
  if (covered) lit = lit.map((row, r) => row.map((on, c) => on && !covered[r]?.[c]));
  return lit.map((row, r) =>
    row.map((on, c) => {
      if (covered?.[r]?.[c]) return "?";
      if (r === v.pr && c === v.pc) return "@";
      const raw = v.grid[r]?.[c] ?? "?";
      // A cave's lower floor and stairs, as on the lit map (renderView): the cliff between the levels can't be stepped across.
      const ch = raw === "." ? caveFloor(v, r, c) : raw;
      if (on) return DARK_SEEN.has(ch) ? ch : "?";
      const edge = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].some(([rr, cc]) => lit[rr]?.[cc]);
      return ch === "#" && edge ? "#" : "?";
    }));
}

/** Said above a dark map (BridgeCore.mapText): the map below is what the run has seen in the dark. */
export const DARK_HEADER =
  "It's dark: you see only some squares, and remember the ones you saw earlier in the dark. # rock, . floor, , lower floor (a cliff between it and .), ≡ stairs (the way between them), D ladder; ? is dark: rock or floor you haven't seen. Walks go only over squares shown here. You are at @.";

/** A dark screen's 160×144 RGBA pixels as 10×9 squares: is anything lit there? Floors have a stray lit dot or two. */
export function litSquares(rgba: Uint8ClampedArray): boolean[][] {
  const bright = (i: number) => rgba[i * 4] + rgba[i * 4 + 1] + rgba[i * 4 + 2];
  let black = Infinity;
  for (let i = 0; i < 160 * 144; i++) black = Math.min(black, bright(i));
  const out: boolean[][] = [];
  for (let r = 0; r < 9; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < 10; c++) {
      let n = 0;
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (bright((r * 16 + y) * 160 + c * 16 + x) > black) n++;
      row.push(n >= LIT_PIXELS);
    }
    out.push(row);
  }
  return out;
}
const LIT_PIXELS = 8;

/**
 * The 10×9 squares a text box or menu covers, from the screen's text (18 rows of 20 tiles; boxes
 * framed ┌┐└┘). In the dark a box is bright, but what's under it can't be seen: litSquares alone
 * read the whole box as lit cave (Rock Tunnel's rocks shown through a sign's text).
 */
export function boxedSquares(rawLines: string[], allTextIsUi = false): boolean[][] {
  const out = Array.from({ length: 9 }, () => Array<boolean>(10).fill(false));
  // Not the screen's 18 rows (a note such as "(Screen is faded to white…)"): nothing to place.
  if (rawLines.length !== 18) return out;
  const lines = rawLines.map(oneTilePerChar);
  const cover = (top: number, left: number, bottom: number, right: number) => {
    for (let r = top >> 1; r <= bottom >> 1 && r < 9; r++) for (let c = left >> 1; c <= right >> 1 && c < 10; c++) out[r][c] = true;
  };
  for (let top = 0; top < lines.length; top++) {
    for (let left = lines[top].indexOf("┌"); left >= 0; left = lines[top].indexOf("┌", left + 1)) {
      const right = lines[top].indexOf("┐", left + 1);
      if (right < 0) continue;
      // Down its sides to the bottom border, or to where a box drawn over it starts (that one is
      // covered in its own right): a menu under the bag has lost its └.
      let bottom = top + 1;
      while (bottom < lines.length - 1 && (lines[bottom][left] === "│" || lines[bottom][right] === "│")) bottom++;
      cover(top, left, bottom, right);
    }
  }
  // Where every map tile reads as "·" (Gen 1), any other tile is a menu or text, framed or not
  // (the party screen, the Pokédex): its square can't be seen.
  if (allTextIsUi) {
    lines.forEach((line, row) => [...line].forEach((ch, col) => {
      if (ch !== "·" && (row >> 1) < 9 && (col >> 1) < 10) out[row >> 1][col >> 1] = true;
    }));
  }
  return out;
}

/**
 * A screen line with one character per tile: the reader writes a few tiles as two characters
 * (PK, MN, and the contractions 's 't 'll…; see mcp-server/format.mjs oneSquare).
 */
function oneTilePerChar(line: string): string {
  const TILE = "";
  return line
    .replace(/PKMN/g, TILE + TILE)
    .replace(/(?<![A-Z])(?:PK|MN)(?=MN|[^A-Za-z]|$)/g, TILE)
    .replace(/(?<=[A-Za-z0-9é♂♀])'[dlmrstv]/g, TILE);
}

export interface MapTrainer { x: number; y: number; name: string; beaten: boolean; facing?: Dir }

/**
 * The trainers a map shows, as a player knows them: where they are, what they look like, which way
 * unbeaten on-screen ones face (when enabled), and who's been beaten. Not their teams: those stay
 * unknown until the fight.
 */
export function trainerList(trainers: MapTrainer[]): string {
  if (!trainers.length) return "";
  return `\nTrainers (T): ${trainers.map((t) => `(${t.x},${t.y}) ${t.name}${t.facing ? ` facing ${t.facing}` : ""}${t.beaten ? " [beaten]" : ""}`).join("; ")}.`;
}

/**
 * On a whole map, the squares of a cave's lower floor that nobody can get to: a
 * patch of lower floor with no door or ladder in it, closed on every side by rock or a cliff edge.
 * Mt. Moon's first floor has 29 such patches (234 squares) along its walls; drawn as lower floor
 * they read as a second level with no way onto it (a model called the map "messy"). Only the whole
 * map: on a screen's view (or a crop) a patch may go on past the edge, and the grid's edge counts
 * as closed here. Anything else beside a patch (a person, a boulder, water, a ledge…) counts as a
 * way in, so only fully closed patches are sealed.
 */
export function sealedLowerFloor(v: UnfoggedView): Set<number> {
  const sealed = new Set<number>();
  if (!v.exits || !v.tiles || !v.lowerFloor) return sealed;
  const H = v.grid.length;
  const W = v.grid[0]?.length ?? 0;
  const lower = (c: number, r: number) => v.grid[r][c] === "." && v.lowerFloor!(v.tiles![r][c]);
  const seen = new Set<number>();
  for (let r0 = 0; r0 < H; r0++) {
    for (let c0 = 0; c0 < W; c0++) {
      if (seen.has(r0 * W + c0) || !lower(c0, r0)) continue;
      const patch: number[] = [];
      let open = false;
      const todo: [number, number][] = [[c0, r0]];
      seen.add(r0 * W + c0);
      while (todo.length) {
        const [c, r] = todo.pop()!;
        patch.push(r * W + c);
        for (const [, dx, dy] of STEPS) {
          const nc = c + dx, nr = r + dy;
          if (nr < 0 || nr >= H || nc < 0 || nc >= W) continue;
          const ch = v.grid[nr][nc];
          // Water is a way in only where a swimmer can get ashore (Gen 1: not against a cliff).
          if (ch === "#" || (ch === "~" ? swimPairBlocked(v, nc, nr, c, r) : pairBlocked(v, c, r, nc, nr))) continue;
          if (lower(nc, nr)) {
            if (!seen.has(nr * W + nc)) { seen.add(nr * W + nc); todo.push([nc, nr]); }
          } else open = true;  // a step onto anything else (upper floor, a door, a person…): a way in
        }
      }
      if (!open) for (const i of patch) sealed.add(i);
    }
  }
  return sealed;
}

/**
 * A screen's view with the whole map's sealed lower-floor patches (sealedLowerFloor) drawn as rock.
 * A screen can't tell a closed patch from one that goes on past its edge, so the whole map decides:
 * otherwise the screen (lit, or the dark view) shows the top of every thick rock band as lower floor
 * that the whole map draws as rock (the dark tunnel's walls, 27 walks into them in one run).
 */
export function sealFromWholeMap<T extends UnfoggedView>(screen: T, whole: UnfoggedView): T {
  // Not a whole map (no ROM: view(true) falls back to the screen): it can't tell either (sealedLowerFloor checks).
  const sealed = sealedLowerFloor(whole);
  if (!sealed.size) return screen;
  const WW = whole.grid[0]?.length ?? 0;
  const WH = whole.grid.length;
  const isSealed = (r: number, c: number) => {
    const wc = screen.originX + c - whole.originX;
    const wr = screen.originY + r - whole.originY;
    return wc >= 0 && wc < WW && wr >= 0 && wr < WH && sealed.has(wr * WW + wc);
  };
  return { ...screen, grid: screen.grid.map((line, r) => line.map((ch, c) => (isSealed(r, c) ? "#" : ch))) };
}

export function renderView(view: FoggedView): string {
  // Closed patches of a cave's lower floor are drawn as rock (and drop out of the cliff edges list).
  // Only a whole map (readFullMap: it has exits) can tell: on a screen or a crop a patch may go on
  // past the edge, so those come sealed from the whole map already (sealFromWholeMap); a "known"
  // view from BridgeCore.view(true) was likewise sealed on its raw whole map before fogging.
  const closed = view.exits && view.stage !== "known" ? sealedLowerFloor(view as UnfoggedView) : new Set<number>();
  const VW = view.grid[0]?.length ?? 0;
  const v: FoggedView = closed.size
    ? { ...view, grid: view.grid.map((line, r) => line.map((ch, c) => (closed.has(r * VW + c) ? "#" : ch))) }
    : view;
  const cols = v.grid[0]?.length ?? 0;
  // Columns 3 wide and row labels 3 wide, wider when a coordinate needs it: since 0.3.0 they count
  // from where the run arrived, so a map entered at its far end reaches -10, or -100 on a tall one.
  const xw = Math.max(3, ...Array.from({ length: cols }, (_, c) => String(v.originX + c).length + 1));
  const yw = Math.max(3, ...v.grid.map((_, r) => String(v.originY + r).length));
  const header = " ".repeat(yw + 2) + Array.from({ length: cols }, (_, c) => String(v.originX + c).padStart(xw)).join("");
  const W = v.grid[0]?.length ?? 0;
  // Water too while surfing: a swimmer's gaze over the sea is what walk_to and travel steer around.
  // On foot the water stays water (a gaze over a pond isn't a way across it).
  const shown = (ch: string, r: number, c: number) => ((ch === "." || ch === '"' || (ch === "~" && !!v.surfing)) && v.watched?.has(r * W + c) ? "!" : ch);
  const levelled = (ch: string, r: number, c: number) => {
    const out = shown(ch, r, c);
    return out === "." ? caveFloor(v, r, c) : out;
  };
  const rows = v.grid.map((line, r) => `y${String(v.originY + r).padStart(yw)} ` + line.map((ch, c) => levelled(ch, r, c).padStart(xw)).join(""));
  const runs = doorRuns(v);
  const exits = exitsLine(v);
  const doors = runs.length
    ? `Doors (D): ${runs.map((r) => `(${r.from.x},${r.from.y})${r.to === r.from ? "" : `–(${r.to.x},${r.to.y})`} → ${r.key}`).join("; ")}.`
    : null;
  const edges = cliffEdges(v);
  return [
    ...(exits ? [exits] : []),
    header,
    ...rows,
    ...(edges ? [edges] : []),
    ...(doors ? [doors] : []),
  ].join("\n");
}

/**
 * The view's doors, as a player sees them: whether one can be walked to from here isn't said (a
 * player works that out from the map, or by trying), the user's rule: the same information a human has.
 * A wide door (a gate, a cave mouth) is several squares in a row that lead to the same place: listed once.
 */
function doorRuns(v: AnyOverworldView): { from: Door; to: Door; key: string }[] {
  const runs: { from: Door; to: Door; key: string }[] = [];
  for (const d of v.doors ?? []) {
    const key = `${d.to}${d.tx != null ? ` (${d.tx},${d.ty})` : ""}`;
    const last = runs[runs.length - 1];
    const next = last && last.key === key &&
      ((d.y === last.to.y && d.y === last.from.y && d.x === last.to.x + 1) || (d.x === last.to.x && d.x === last.from.x && d.y === last.to.y + 1));
    if (next) last.to = d;
    else runs.push({ from: d, to: d, key });
  }
  return runs;
}

/**
 * "Map exits: up, left, plus 2 doors (D)." for a whole map's view (null for the screen's, which has
 * no exits). It counts the doors too: it's all an action result shows of the map, and "left" alone
 * read as a dead end on a route whose way on is a house door (Haiku at Bill's, 2026-11-08).
 */
export function exitsLine(v: FoggedView): string | null {
  if (!v.exits) return null;
  const n = doorRuns(v).length;
  const doorCount = n ? `${n} door${n === 1 ? "" : "s"}` : "";
  return v.exits.length
    ? `Map exits: ${v.exits.join(", ")}${doorCount ? `, plus ${doorCount} (D)` : ""}.`
    : `Map exits: none (${doorCount ? `only ${doorCount} (D)` : "doors only"}).`;
}

/**
 * The tile-pair edges in the view (caves, forests): two squares that both look walkable but can't
 * be stepped between. A square can't show an edge, so they're listed, in runs:
 * "y11|y12 at x24–27" is the edge between rows 11 and 12 along x 24 to 27.
 */
function cliffEdges(v: AnyOverworldView): string | null {
  if (!v.tiles) return null;
  const H = v.grid.length;
  const W = v.grid[0]?.length ?? 0;
  // A boulder stands on floor: an edge beside it is what stops it being pushed there.
  // Water too where the game has surfing pairs: water against a cliff you can't get ashore over.
  const open = (c: number, r: number) => walkable(v.grid[r][c]) || isBoulder(v.grid[r][c]) || (!!v.swimBlocked && v.grid[r][c] === "~");
  const blocked = (c: number, r: number, nc: number, nr: number) =>
    onWater(v, c, r) || onWater(v, nc, nr) ? swimPairBlocked(v, c, r, nc, nr) : pairBlocked(v, c, r, nc, nr);
  const runs: string[] = [];
  const span = (a: number, b: number) => (a === b ? `${a}` : `${a}–${b}`);
  // Edges between rows r and r+1, grouped along x.
  for (let r = 0; r + 1 < H; r++) {
    for (let c = 0; c < W; c++) {
      if (!(open(c, r) && open(c, r + 1) && blocked(c, r, c, r + 1))) continue;
      let e = c;
      while (e + 1 < W && open(e + 1, r) && open(e + 1, r + 1) && blocked(e + 1, r, e + 1, r + 1)) e++;
      runs.push(`y${v.originY + r}|y${v.originY + r + 1} at x${span(v.originX + c, v.originX + e)}`);
      c = e;
    }
  }
  // Edges between columns c and c+1, grouped along y.
  for (let c = 0; c + 1 < W; c++) {
    for (let r = 0; r < H; r++) {
      if (!(open(c, r) && open(c + 1, r) && blocked(c, r, c + 1, r))) continue;
      let e = r;
      while (e + 1 < H && open(c, e + 1) && open(c + 1, e + 1) && blocked(c, e + 1, c + 1, e + 1)) e++;
      runs.push(`x${v.originX + c}|x${v.originX + c + 1} at y${span(v.originY + r, v.originY + e)}`);
      r = e;
    }
  }
  return runs.length ? `Cliff edges (both sides look walkable, but you can't step across): ${runs.join("; ")}.` : null;
}

const walkable = (ch: string) => ch === "." || ch === '"' || ch === "o" || ch === "D" || ch === "@" || ch === "F" || ch === "*";

/** Whether (c, r) is water the player is crossing: a "~" square, or where a surfing player stands. */
const onWater = (v: AnyOverworldView, c: number, r: number) => v.grid[r][c] === "~" || (!!v.surfing && c === v.pc && r === v.pr);

/**
 * Squares reachable in one move from (c, r), with the presses it takes: plain steps onto walkable
 * squares, hops over a ledge in its direction (landing one past it, one press), and slides on ice
 * ("*", Crystal): onto ice you slide on until something stops you, on the last ice square before
 * it, or on the first square past the ice (one press a square, as the walk counts them).
 * Surfing: from water, on across water or off onto land; once on land, only land.
 */
function* moves(v: AnyOverworldView, c: number, r: number): Generator<[Dir, number, number, number]> {
  const H = v.grid.length;
  const W = v.grid[0].length;
  const swimming = !!v.surfing && onWater(v, c, r);
  for (const [dir, dx, dy] of STEPS) {
    const nc = c + dx;
    const nr = r + dy;
    if (nc < 0 || nc >= W || nr < 0 || nr >= H) continue;
    const ch = v.grid[nr][nc];
    if (swimming) {
      if ((ch === "~" || walkable(ch)) && !swimPairBlocked(v, c, r, nc, nr)) yield [dir, nc, nr, 1];
      continue;
    }
    if (LEDGE_DIR[ch] === dir) {
      const lc = nc + dx;
      const lr = nr + dy;
      if (lc >= 0 && lc < W && lr >= 0 && lr < H && walkable(v.grid[lr][lc])) yield [dir, lc, lr, 1];
    } else if (walkable(ch) && !pairBlocked(v, c, r, nc, nr)) {
      if (ch !== "*") {
        yield [dir, nc, nr, 1];
        continue;
      }
      let sc = nc;
      let sr = nr;
      let n = 1;
      for (;;) {
        const tc = sc + dx;
        const tr = sr + dy;
        if (tc < 0 || tc >= W || tr < 0 || tr >= H) break;
        const t = v.grid[tr][tc];
        if (!walkable(t) || pairBlocked(v, sc, sr, tc, tr)) break; // stopped on the ice
        sc = tc;
        sr = tr;
        n++;
        if (t !== "*") break; // off the ice: stops there
      }
      yield [dir, sc, sr, n];
    }
  }
}

/**
 * Breadth-first search from the player. `isGoal(c, r)` ends the search;
 * doors are only entered when they are the goal.
 */
function search(v: AnyOverworldView, isGoal: (c: number, r: number) => boolean, avoidWatched = true): { dirs: Dir[]; end: [number, number] } | null {
  const W = v.grid[0].length;
  const key = (c: number, r: number) => r * W + c;
  const start = key(v.pc, v.pr);
  const prev = new Map<number, [number, Dir, number]>();
  const seen = new Set([start]);
  const queue: [number, number][] = [[v.pc, v.pr]];
  while (queue.length) {
    const [c, r] = queue.shift()!;
    if (isGoal(c, r)) {
      const dirs: Dir[] = [];
      for (let k = key(c, r); k !== start; ) {
        const [p, d, n] = prev.get(k)!;
        for (let i = 0; i < n; i++) dirs.unshift(d);
        k = p;
      }
      return { dirs, end: [c, r] };
    }
    // Doors warp you away: never pass through them.
    if (v.grid[r][c] === "D" && !(c === v.pc && r === v.pr)) continue;
    for (const [dir, nc, nr, n] of moves(v, c, r)) {
      const k = key(nc, nr);
      if (seen.has(k)) continue;
      // Stay out of trainers' sight unless that square is where we're going.
      if (avoidWatched && v.watched?.has(k) && !isGoal(nc, nr)) continue;
      seen.add(k);
      prev.set(k, [key(c, r), dir, n]);
      queue.push([nc, nr]);
    }
  }
  return null;
}

/**
 * When a square can't be walked to: what stands in the way, if one kind of thing does. Tries the
 * map with people, then boulders made passable, and names the first such square on the way that
 * then exists ("the person at (27,12)"). Null otherwise. Trees and water are never named: this
 * looks at one map only, so saying a field move is needed would ignore any way round through a door.
 */
export function wayBlockedBy(v: AnyOverworldView, tx: number, ty: number): string | null {
  return wayBlocker(v, tx, ty)?.what ?? null;
}

/** wayBlockedBy's square: where the person or boulder in the way stands, and how it's named. */
export function wayBlocker(v: AnyOverworldView, tx: number, ty: number): { x: number; y: number; what: string } | null {
  const tc = tx - v.originX;
  const tr = ty - v.originY;
  if (tr < 0 || tr >= v.grid.length || tc < 0 || tc >= v.grid[0].length) return null;
  const kinds: [string, string, (x: number, y: number) => string][] = [
    ["NT$H", ".", (x, y) => `the ${v.grid[y - v.originY][x - v.originX] === "T" ? "trainer" : "person"} standing at (${x},${y})`],
    ["Bb", ".", (x, y) => `the boulder at (${x},${y})`],
  ];
  for (const [chars, as, say] of kinds) {
    const grid = v.grid.map((row) => row.map((ch) => (chars.includes(ch) ? as : ch)));
    const open: AnyOverworldView = { ...v, grid };
    const target = walkable(grid[tr][tc]);
    const goal = (c: number, r: number) => (target ? c === tc && r === tr : Math.abs(c - tc) + Math.abs(r - tr) === 1);
    const found = search(open, goal, false);
    if (!found) continue;
    let c = v.pc;
    let r = v.pr;
    for (const d of found.dirs) {
      const [, dx, dy] = STEPS.find(([s]) => s === d)!;
      const hop = LEDGE_DIR[grid[r + dy]?.[c + dx]] === d ? 2 : 1;
      c += dx * hop;
      r += dy * hop;
      if (chars.includes(v.grid[r][c])) return { x: c + v.originX, y: r + v.originY, what: say(c + v.originX, r + v.originY) };
    }
  }
  return null;
}

/**
 * The part of a whole-map view from (x0, y0) to (x1, y1), map coordinates inclusive, clamped to the
 * map: what a result shows when the squares it talks about aren't all on screen. No exits line, as
 * it isn't the whole map.
 */
export function cropView<T extends AnyOverworldView>(v: T, x0: number, y0: number, x1: number, y1: number): T {
  const W = v.grid[0]?.length ?? 0;
  const c0 = Math.max(0, x0 - v.originX), r0 = Math.max(0, y0 - v.originY);
  const c1 = Math.min(W - 1, x1 - v.originX), r1 = Math.min(v.grid.length - 1, y1 - v.originY);
  const w = c1 - c0 + 1;
  const inside = (k: number) => { const r = Math.floor(k / W), c = k % W; return r >= r0 && r <= r1 && c >= c0 && c <= c1; };
  const moved = (k: number) => (Math.floor(k / W) - r0) * w + (k % W) - c0;
  return {
    ...v,
    grid: v.grid.slice(r0, r1 + 1).map((row) => row.slice(c0, c1 + 1)),
    tiles: v.tiles?.slice(r0, r1 + 1).map((row) => row.slice(c0, c1 + 1)),
    originX: v.originX + c0,
    originY: v.originY + r0,
    pc: v.pc - c0,
    pr: v.pr - r0,
    exits: undefined,
    watched: v.watched && new Set([...v.watched].filter(inside).map(moved)),
    watchers: v.watchers && new Map([...v.watchers].filter(([k]) => inside(k)).map(([k, t]) => [moved(k), t])),
    doors: v.doors?.filter((d) => d.x >= v.originX + c0 && d.x <= v.originX + c1 && d.y >= v.originY + r0 && d.y <= v.originY + r1),
  };
}

/**
 * A whole map as the run knows it (BridgeCore.view(true)), cut to the smallest rectangle holding
 * every square it has seen (everything but "?"), with one ring of "?" around it: a player doesn't
 * know how big a map is until they have been to its edges, but does know there may be more past what
 * they've seen (a crop ending on floor read as a room's wall: the stairs, a Pokémon Center's PC,
 * 2026-11-19). The ring is drawn past the map's real edges too, so it gives no size away.
 * The exits line stays (which ways lead on, not where the edges are).
 * Only for what's printed: walks still plan on the whole view.
 */
export function seenPart<T extends FoggedView>(v: T): T {
  if (v.stage !== "known") return v;
  let [r0, r1, c0, c1] = [Infinity, -1, Infinity, -1];
  v.grid.forEach((row, r) => row.forEach((ch, c) => {
    if (ch === "?") return;
    [r0, r1, c0, c1] = [Math.min(r0, r), Math.max(r1, r), Math.min(c0, c), Math.max(c1, c)];
  }));
  if (r1 < 0) return v;
  return fogRing({ ...cropView(v, v.originX + c0, v.originY + r0, v.originX + c1, v.originY + r1), exits: v.exits });
}

/** The view with one row or column of "?" added on every side (squares keyed by row * width move with it). */
function fogRing<T extends FoggedView>(v: T): T {
  const W = v.grid[0]?.length ?? 0;
  const W2 = W + 2;
  const moved = (k: number) => (Math.floor(k / W) + 1) * W2 + (k % W) + 1;
  const pad = <C>(rows: C[][], fill: C) => [Array<C>(W2).fill(fill), ...rows.map((row) => [fill, ...row, fill]), Array<C>(W2).fill(fill)];
  return {
    ...v,
    grid: pad(v.grid, "?"),
    // A "?" square is never drawn by its tile (the lower floor, cliff edges), so any id does.
    tiles: v.tiles && pad(v.tiles, 0),
    originX: v.originX - 1,
    originY: v.originY - 1,
    pc: v.pc + 1,
    pr: v.pr + 1,
    watched: v.watched && new Set([...v.watched].map(moved)),
    watchers: v.watchers && new Map([...v.watchers].map(([k, t]) => [moved(k), t])),
  };
}

/**
 * Shortest path to map coordinate (tx, ty). If the target itself isn't
 * walkable (a person, sign, counter…) the path ends next to it and `face`
 * says which way to turn to interact.
 */
export function findPath(
  v: AnyOverworldView,
  tx: number,
  ty: number,
  opts: SightOptions = { avoidSight: true },
): { dirs: Dir[]; face: Dir | null; sightStop?: [number, number]; crosses?: [number, number][] } | null {
  const tc = tx - v.originX;
  const tr = ty - v.originY;
  if (tr < 0 || tr >= v.grid.length || tc < 0 || tc >= v.grid[0].length) return null;
  // A square the run hasn't seen (fog of war) isn't something to walk up to and face, like a sign.
  if (v.grid[tr][tc] === "?") return null;
  // A hole asked for is gone into, like a door (the burned mansion's top floor is left that way):
  // paths still never cross one on the way somewhere else.
  if (v.grid[tr][tc] === "O") {
    return findPath({ ...v, grid: v.grid.map((row, r) => (r === tr ? row.map((ch, c) => (c === tc ? "D" : ch)) : row)) }, tx, ty, opts);
  }
  const targetWalkable = walkable(v.grid[tr][tc]) || (!!v.surfing && v.grid[tr][tc] === "~");
  // Next to it, or across a counter from it: the game talks over counters (a shop's clerk, the nurse).
  const acrossCounter = (c: number, r: number) =>
    (c === tc || r === tr) && Math.abs(c - tc) + Math.abs(r - tr) === 2 && v.grid[(r + tr) / 2][(c + tc) / 2] === "=";
  // A PC is used only from below, facing up (every PC in the game is a hidden event used facing up).
  const pc = v.grid[tr][tc] === "P";
  const goal = (c: number, r: number) =>
    targetWalkable ? c === tc && r === tr
      : pc ? c === tc && r === tr + 1
      : (Math.abs(c - tc) + Math.abs(r - tr) === 1 || acrossCounter(c, r)) && v.grid[r][c] !== "D";
  const toward = (ec: number, er: number): Dir => STEPS.find(([, dx, dy]) => dx === Math.sign(tc - ec) && dy === Math.sign(tr - er))![0];
  if (!opts.avoidSight) {
    const plain = search(v, goal, false);
    if (!plain) return null;
    const [ec, er] = plain.end;
    const face = targetWalkable ? null : toward(ec, er);
    const crosses = sightCrossings(v, plain.dirs);
    return crosses.length ? { dirs: plain.dirs, face, crosses } : { dirs: plain.dirs, face };
  }
  // Route around trainers' sight if possible.
  const found = search(v, goal);
  if (found) {
    const [ec, er] = found.end;
    const face = targetWalkable ? null : toward(ec, er);
    return { dirs: found.dirs, face };
  }
  // The only way crosses a trainer's sight: walk up to the edge of it and say where, so the
  // player decides whether to take that fight (walking on would start it unannounced).
  const blind = search(v, goal, false);
  if (!blind) return null;
  // Heading for a trainer means taking that fight: walking into its gaze is the point.
  if (v.grid[tr][tc] === "T") {
    const [ec, er] = blind.end;
    return { dirs: blind.dirs, face: toward(ec, er) };
  }
  const cut = stopAtSight(v, blind.dirs, goal);
  if (cut.sightStop) return { ...cut, face: null };
  const [ec, er] = blind.end;
  const face = targetWalkable ? null : toward(ec, er);
  return { dirs: blind.dirs, face };
}

/** Cuts a path just before its first step into an unbeaten trainer's sight (map coords of that square). */
function stopAtSight(
  v: AnyOverworldView,
  dirs: Dir[],
  goal: (c: number, r: number) => boolean,
): { dirs: Dir[]; sightStop?: [number, number] } {
  const W = v.grid[0].length;
  let c = v.pc;
  let r = v.pr;
  for (let i = 0; i < dirs.length; i++) {
    const [, dx, dy] = STEPS.find(([d]) => d === dirs[i])!;
    // Ledge hops move two squares in one step.
    const hop = LEDGE_DIR[v.grid[r + dy]?.[c + dx]] === dirs[i] ? 2 : 1;
    const nc = c + dx * hop;
    const nr = r + dy * hop;
    if (v.watched?.has(nr * W + nc) && !goal(nc, nr)) return { dirs: dirs.slice(0, i), sightStop: [nc + v.originX, nr + v.originY] };
    c = nc;
    r = nr;
  }
  return { dirs };
}

/**
 * Path to the nearest walkable square on the map's edge in `dir` (to cross into the next map).
 * Like findPath, it stops short (sightStop) when the only way crosses a trainer's sight.
 */
export function pathToEdge(
  v: AnyOverworldView,
  dir: Dir,
  opts: SightOptions = { avoidSight: true },
): { dirs: Dir[]; sightStop?: [number, number]; crosses?: [number, number][] } | null {
  const H = v.grid.length;
  const W = v.grid[0].length;
  const onEdge = (c: number, r: number) =>
    (dir === "up" && r === 0) || (dir === "down" && r === H - 1) || (dir === "left" && c === 0) || (dir === "right" && c === W - 1);
  const [, dx, dy] = STEPS.find(([d]) => d === dir)!;
  // The connected map decides whether you can cross: its square just past the edge must be open,
  // or water when you reach the edge swimming (a sea route carries on into the next map's sea).
  const crossable = (c: number, r: number) => {
    if (!v.beyond) return true;
    const ch = v.beyond(c + v.originX + dx, r + v.originY + dy);
    if (ch === "~") return !!v.surfing && onWater(v, c, r);
    return ch === "." || ch === '"' || LEDGE_DIR[ch] === dir;
  };
  const goal = (c: number, r: number) => onEdge(c, r) && v.grid[r][c] !== "D" && crossable(c, r);
  if (!opts.avoidSight) {
    const plain = search(v, goal, false);
    if (!plain) return null;
    const crosses = sightCrossings(v, plain.dirs);
    return crosses.length ? { dirs: plain.dirs, crosses } : { dirs: plain.dirs };
  }
  const found = search(v, goal);
  if (found) return { dirs: found.dirs };
  const blind = search(v, goal, false);
  return blind ? stopAtSight(v, blind.dirs, goal) : null;
}

/**
 * Picks the reachable square that gets furthest in `dir` (ties: the shortest
 * walk) and returns the path there, or null if nothing beats where you stand.
 */
export function pathFurthest(v: AnyOverworldView, dir: Dir, opts: SightOptions = { avoidSight: true }): Dir[] | null {
  const progress = (c: number, r: number) => (dir === "up" ? -r : dir === "down" ? r : dir === "left" ? -c : c);
  // BFS visits squares in distance order, so the first square at the best progress is the closest one.
  let bestScore = progress(v.pc, v.pr);
  let tc = -1;
  let tr = -1;
  search(v, (c, r) => {
    const s = progress(c, r);
    const watched = opts.avoidSight && v.watched?.has(r * v.grid[0].length + c);
    if (s > bestScore && v.grid[r][c] !== "D" && !watched) {
      bestScore = s;
      tc = c;
      tr = r;
    }
    return false; // explore everything
  }, opts.avoidSight);
  if (tc < 0) return null;
  return search(v, (c, r) => c === tc && r === tr, opts.avoidSight)?.dirs ?? null;
}

/**
 * Where `dirs` walked from the player on `v` end, in map coordinates (a ledge hop moves two
 * squares): the square a route was planned to reach, beside its target or across a counter from it.
 */
export function routeEnd(v: AnyOverworldView, dirs: Dir[]): [number, number] {
  let [c, r] = [v.pc, v.pr];
  for (const d of dirs) {
    const [, dx, dy] = STEPS.find(([s]) => s === d)!;
    const squares = LEDGE_DIR[v.grid[r + dy]?.[c + dx]] === d ? 2 : 1;
    [c, r] = [c + dx * squares, r + dy * squares];
  }
  return [v.originX + c, v.originY + r];
}

/**
 * Collapses ["up","up","left"] into [["up",2],["left",1]]. Given the view the steps were planned on
 * (from its player), counts squares, as a walk does (walkStraight counts each square the player
 * moves): a ledge hop is one step but two squares, and counted as one it ended the walk a square
 * short of where it was planned to go (a walk_to over a ledge said "arrived" a square early).
 */
export function toSegments(dirs: Dir[], v?: AnyOverworldView): [Dir, number][] {
  const out: [Dir, number][] = [];
  let c = v?.pc ?? 0;
  let r = v?.pr ?? 0;
  for (const d of dirs) {
    const [, dx, dy] = STEPS.find(([s]) => s === d)!;
    const squares = v && LEDGE_DIR[v.grid[r + dy]?.[c + dx]] === d ? 2 : 1;
    c += dx * squares;
    r += dy * squares;
    const last = out[out.length - 1];
    if (last && last[0] === d) last[1] += squares;
    else out.push([d, squares]);
  }
  return out;
}
