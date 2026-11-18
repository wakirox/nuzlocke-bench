// Controller for the live model-conversation panel beside the game (transcript polling, auto-follow
// scrolling, older-entry collapsing, and token/turn usage display).

import { BRIDGE_HTTP } from "../bridge/endpoint";
import { ConvoView, OPEN_RESULTS, type ConvoEvent } from "./convo";

const CONVO_KEY = "nuzlocke.convo";
// Collapsed (the default): only the newest results are shown whole, older ones are one line each.
const COLLAPSE_KEY = "nuzlocke.convoOlderCollapsed";

export type Usage = { tokens: number; turns: number; model?: string | null; effort?: string | null };

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export class ConvoPanel {
  usageText: string | null = null;
  private convo: ConvoView | null = null;
  private next = 0;
  private timer = 0;
  /** Follow the newest entries until the reader scrolls up; scrolling back to the bottom follows again. */
  private follow = true;
  /** The list's scroll position as last seen: only scrolling up (not the list growing) stops following. */
  private top = 0;
  /** Entries that came in while the reader was scrolled up (on the "Jump to latest" button). */
  private unseen = 0;

  constructor(private onUsageChange: (usageText: string | null) => void) {}

  get hidden(): boolean {
    return Boolean($("convo").hidden);
  }

  mount(): void {
    const list = $("convo-list");
    this.convo = new ConvoView(list);
    $("btn-convo").addEventListener("click", () => this.show(Boolean($("convo").hidden)));
    $("convo-collapse").addEventListener("click", () => this.collapse(!list.classList.contains("collapsed")));
    this.collapse(localStorage.getItem(COLLAPSE_KEY) !== "0");
    list.addEventListener("scroll", () => {
      if (!list.clientHeight) return;
      if (list.scrollHeight - list.scrollTop - list.clientHeight < 40) this.follow = true;
      else if (list.scrollTop < this.top - 1) this.follow = false;
      this.top = list.scrollTop;
      if (this.follow) this.unseen = 0;
      this.showJump();
    });
    $("convo-jump").addEventListener("click", () => {
      this.follow = true;
      this.unseen = 0;
      this.followLatest();
      this.showJump();
    });
    // A screenshot decodes after it's added and makes the list taller: stay at the bottom.
    list.addEventListener("load", () => this.follow && this.followLatest(), true);
    if (localStorage.getItem(CONVO_KEY) === "1") this.show(true);
  }

  async pollUsage(): Promise<void> {
    try {
      const r = await fetch(`${BRIDGE_HTTP}/transcript/usage`);
      this.applyUsage(((await r.json()) as { usage?: Usage | null }).usage);
    } catch {
      /* no server: nothing to show */
    }
  }

  private applyUsage(u: Usage | null | undefined): void {
    // The model it runs on: a quiet label above the log (older servers don't send it).
    $("convo-model").textContent = u?.model ? `${u.model}${u.effort ? ` · ${u.effort} effort` : ""}` : "";
    const text = u && u.turns ? `${(u.tokens / 1e6).toFixed(1)}M tokens · ${u.turns.toLocaleString("en-US")} turns` : null;
    if (text === this.usageText) return;
    this.usageText = text;
    $("convo-usage").textContent = text ?? "";
    this.onUsageChange(text);
  }

  private async pollConvo(): Promise<void> {
    try {
      const r = await fetch(`${BRIDGE_HTTP}/transcript?from=${this.next}`);
      const feed = (await r.json()) as { events: ConvoEvent[]; next: number; missing?: boolean; usage?: Usage | null };
      // A server from before the usage field: ask its own route.
      if (feed.usage === undefined) void this.pollUsage();
      else this.applyUsage(feed.usage);
      $("convo-state").textContent = feed.missing ? "No transcript: only runs played with npm run bench have one" : "";
      if (this.convo && feed.events.length) {
        for (const e of feed.events) this.convo.add(e);
        this.convo.settle();
        if (!this.follow) this.unseen += feed.events.filter((e) => e.kind !== "result").length;
      }
      // Also when the last try found the list hidden (no height yet, so nothing scrolled).
      if (this.follow && (feed.events.length || !this.top)) this.followLatest();
      // Live: something happened in the last minute (a finished run's log is just a log).
      $("convo-live").hidden = !(this.convo?.last && Date.now() - this.convo.last < 60_000);
      this.showJump();
      this.next = feed.next;
    } catch {
      $("convo-state").textContent = "Game server not reachable";
    }
  }

  private followLatest(): void {
    const list = $("convo-list");
    list.scrollTop = list.scrollHeight;
    this.top = list.scrollTop;
  }

  private showJump(): void {
    const jump = $("convo-jump");
    jump.hidden = this.follow;
    jump.textContent = this.unseen ? `${this.unseen} new · Jump to latest` : "Jump to latest";
  }

  private show(on: boolean): void {
    localStorage.setItem(CONVO_KEY, on ? "1" : "0");
    $("convo").hidden = !on;
    $("game").classList.toggle("with-convo", on);
    $("btn-convo").classList.toggle("on", on);
    clearInterval(this.timer);
    if (on) {
      void this.pollConvo();
      this.timer = window.setInterval(() => void this.pollConvo(), 2000);
    }
  }

  private collapse(on: boolean): void {
    localStorage.setItem(COLLAPSE_KEY, on ? "1" : "0");
    $("convo-list").classList.toggle("collapsed", on);
    $("convo-collapse").textContent = on ? "Expand all" : `Only the last ${OPEN_RESULTS} open`;
    this.convo?.reset();
    if (this.follow) this.followLatest();
  }
}
