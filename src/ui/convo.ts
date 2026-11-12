// The model log beside the game: the model's transcript as a chat-style feed. Its words are the
// headline; each tool call is a card with its result inside (one line when closed, everything when
// open); a quiet divider marks each new place the results report. Nothing the model or a tool
// wrote is shortened: a closed card's line is a pointer, one click shows the whole text.

import { findGrid, mapFigure } from "./map-image";
import { fitScale, openViewer } from "./viewer";

export type ConvoEvent = {
  kind: string; text: string; tool?: string; id?: string; at?: string; error?: boolean;
  images?: { mime: string; data: string }[];
};

/** How many of the newest results stay open while older ones are closed. */
export const OPEN_RESULTS = 3;
/** Results longer than this many lines (maps aside) show their start until "Show all" is clicked. */
const LONG_LINES = 40;
/** The list keeps the newest entries only, so a long run doesn't slow the page. */
const MAX_ENTRIES = 800;

const STATUS = /^(📍|🟢|🔴|Messages:|Screen:|Tracker:)/u;
const BARE_STEP = /^\d+\.\s+\w+$/; // "2. walk_to" heading a batch step's own lines

/**
 * The line a closed result shows: a run ending or a tracker warning first (they matter most), then
 * an error's line, then the first line that says what happened (not the status header).
 */
export function summaryOf(text: string, error = false): string {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return "(no text)";
  const key = lines.find((l) => l.startsWith("🏁")) ?? lines.find((l) => l.startsWith("📋"));
  if (key) return key;
  // An error: the failed step of a batch ("2. walk_to ✗ No path…"), else its first line.
  if (error) return lines.find((l) => l.includes("✗")) ?? lines[0];
  // Not a heading ("Map:"), a map row or a map's column numbers either.
  const said = (l: string) => !STATUS.test(l) && !BARE_STEP.test(l) && !/^[\w ]{1,24}:$/.test(l) && !/^y\s*-?\d+ /.test(l) && !/^[\d\s-]+$/.test(l);
  return lines.find(said) ?? lines[0];
}

/** The place a result reports on its 📍 line ("CAVE 1 (3)"), or null. */
export function placeOf(text: string): string | null {
  const m = /📍 (.+?) \[/u.exec(text);
  return m ? m[1].trim() : null;
}

/** Seconds between two ISO times as "0.4s", "12s" or "2m 5s"; "" when either is missing. */
export function took(from?: string, to?: string): string {
  if (!from || !to) return "";
  const s = (Date.parse(to) - Date.parse(from)) / 1000;
  if (!(s >= 0)) return "";
  if (s < 10) return `${s.toFixed(1)}s`;
  if (s < 60) return `${Math.round(s)}s`;
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}

const clock = (at?: string) => (at ? new Date(at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "");

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const CHEVRON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** A screenshot the model was shown: small; a click opens it big in the viewer. */
function shot(im: { mime: string; data: string }): HTMLImageElement {
  const img = el("img", "convo-img");
  img.alt = "Screenshot the model got";
  // The Game Boy's size until it has loaded, so the list doesn't grow under the reader.
  img.width = 160;
  img.height = 144;
  img.src = `data:${im.mime};base64,${im.data}`;
  img.addEventListener("click", () => {
    const big = el("img", "viewer-img");
    big.alt = img.alt;
    big.src = img.src;
    const scale = fitScale(img.naturalWidth || 160, img.naturalHeight || 144, 8);
    big.style.width = `${(img.naturalWidth || 160) * scale}px`;
    openViewer("Screenshot (as the model got it)", big);
  });
  return img;
}

/** Text as it was written, in a block that starts clamped when it's very long. */
function textBlock(text: string, cls: string): HTMLElement {
  const pre = el("div", cls, text);
  const lines = text.split("\n").length;
  if (lines <= LONG_LINES) return pre;
  pre.classList.add("clamped");
  const wrap = el("div", "convo-long");
  const more = el("button", "convo-more", `Show all ${lines} lines`);
  more.addEventListener("click", () => {
    const clamped = pre.classList.toggle("clamped");
    more.textContent = clamped ? `Show all ${lines} lines` : "Show less";
  });
  wrap.append(pre, more);
  return wrap;
}

/** A result's whole text, its map drawn as a picture where the text grid was (the model got the text). */
function resultBody(e: ConvoEvent): HTMLElement {
  const body = el("div", "convo-result");
  const lines = e.text.split("\n");
  const grid = findGrid(lines);
  if (grid) {
    const before = lines.slice(0, grid.start).join("\n");
    const after = lines.slice(grid.end).join("\n");
    if (before.trim()) body.append(textBlock(before, "convo-text"));
    body.append(mapFigure(grid, lines.slice(grid.start, grid.end).join("\n")));
    if (after.trim()) body.append(textBlock(after, "convo-text"));
  } else if (e.text) body.append(textBlock(e.text, "convo-text"));
  for (const im of e.images ?? []) body.append(shot(im));
  return body;
}

type Card = { li: HTMLLIElement; at?: string; meta: HTMLElement; sum: HTMLElement; body: HTMLElement };

/** The feed's list: add events as they come; it pairs results with their calls and keeps the newest open. */
export class ConvoView {
  private waiting: Card[] = []; // calls still without a result, oldest first
  private byId = new Map<string, Card>();
  private place: string | null = null;
  /** Latest event time seen (for the header's "live" mark). */
  last: number | null = null;

  constructor(private list: HTMLElement) {}

  add(e: ConvoEvent): void {
    if (e.at) this.last = Math.max(this.last ?? 0, Date.parse(e.at));
    switch (e.kind) {
      case "call": return this.call(e);
      case "result": return this.result(e);
      case "say": return void this.list.append(el("li", "say", e.text));
      case "think": return void this.list.append(el("li", "think", e.text));
      case "user": {
        const li = el("li", "user");
        li.append(el("span", "convo-label", "Runner"), el("div", "", e.text));
        return void this.list.append(li);
      }
      case "summary": {
        // What a compaction left the model: long, so a closed card like a result.
        const card = this.card("summary", "Summary the model continued from", "", e.at);
        card.sum.textContent = summaryOf(e.text);
        card.body.append(textBlock(e.text, "convo-prose"));
        card.li.classList.add("done");
        return;
      }
      case "compact": case "end":
        return void this.list.append(el("li", `divider ${e.kind}`, e.kind === "end" ? "Turn ended" : e.text));
      default:
        return void this.list.append(el("li", "think", e.text));
    }
  }

  /** Trims the oldest entries and marks the newest results open (call after a batch of add()). */
  settle(): void {
    while (this.list.children.length > MAX_ENTRIES) this.list.firstElementChild?.remove();
    for (const li of this.list.querySelectorAll("li.recent")) li.classList.remove("recent");
    const done = this.list.querySelectorAll("li.call.done:not(.summary)");
    for (let i = Math.max(0, done.length - OPEN_RESULTS); i < done.length; i++) done[i].classList.add("recent");
    this.syncExpanded();
  }

  /** Every card back to the default (after "Expand all" / "Only the last 3 open"). */
  reset(): void {
    for (const li of this.list.querySelectorAll("li.open, li.shut")) li.classList.remove("open", "shut");
    this.syncExpanded();
  }

  private isOpen(li: Element): boolean {
    if (li.classList.contains("shut")) return false;
    if (li.classList.contains("open") || !this.list.classList.contains("collapsed")) return true;
    return li.classList.contains("recent");
  }

  /** Each card's open state onto the page (a class for the CSS, aria-expanded for screen readers). */
  private syncExpanded(): void {
    for (const li of this.list.querySelectorAll("li.call")) {
      const open = this.isOpen(li);
      li.classList.toggle("closed", !open);
      li.firstElementChild?.setAttribute("aria-expanded", String(open));
    }
  }

  private card(cls: string, name: string, args: string, at?: string): Card {
    const li = el("li", `call ${cls}`);
    const head = el("button", "call-head");
    head.type = "button";
    const meta = el("span", "call-meta", clock(at));
    if (at) meta.title = new Date(at).toLocaleString();
    head.append(el("span", "call-dot"), el("span", "call-tool", name));
    if (args && args !== "{}") head.append(el("span", "call-args", args));
    head.append(meta);
    head.insertAdjacentHTML("beforeend", CHEVRON);
    // A click opens a closed card, or closes an open one (the newest included).
    head.addEventListener("click", () => {
      const open = this.isOpen(li);
      li.classList.toggle("open", !open);
      li.classList.toggle("shut", open);
      li.classList.toggle("closed", open);
      head.setAttribute("aria-expanded", String(!open));
    });
    const sum = el("div", "call-sum");
    const body = el("div", "call-body");
    li.append(head, sum, body);
    this.list.append(li);
    return { li, at, meta, sum, body };
  }

  private call(e: ConvoEvent): void {
    // A hint (preset option "hints") stands out: it's help the model asked for, which a viewer looks for.
    const card = this.card(e.tool === "hint" ? "pending hint" : "pending", e.tool ?? "tool", e.text, e.at);
    card.sum.textContent = "Running…";
    this.waiting.push(card);
    if (e.id) this.byId.set(e.id, card);
  }

  private result(e: ConvoEvent): void {
    // Its call: by id, else the oldest one still waiting (older servers send no ids); a result whose
    // call came before the part of the transcript the page read gets a card of its own.
    let card = (e.id && this.byId.get(e.id)) || (e.id ? undefined : this.waiting[0]);
    if (!card) card = this.card("", "result", "", e.at);
    this.waiting = this.waiting.filter((c) => c !== card);
    if (e.id) this.byId.delete(e.id);
    card.li.classList.remove("pending");
    card.li.classList.add("done");
    if (e.error) card.li.classList.add("error");
    const sum = summaryOf(e.text, e.error);
    card.sum.textContent = sum;
    if (/^(🏁|📋)/u.test(sum)) card.sum.classList.add("key");
    // How long the tool took, when it's long enough to matter.
    const t = took(card.at, e.at);
    if (t && Date.parse(e.at!) - Date.parse(card.at!) >= 1000) card.meta.textContent = `${t} · ${card.meta.textContent}`;
    card.body.append(resultBody(e));
    // A new place: a quiet divider after the call that got there.
    const place = placeOf(e.text);
    if (place && place !== this.place) {
      this.place = place;
      const div = el("li", "divider place", place);
      div.title = "Where the model is from here on";
      card.li.after(div);
    }
  }
}
