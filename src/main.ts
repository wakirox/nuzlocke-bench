// Fonts are bundled with the page (OFL), so nothing is fetched from elsewhere.
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./styles.css";
import { BRIDGE_HTTP, WATCHED } from "./bridge/endpoint";
import { GameBoy, loadCore } from "./emulator/gameboy";
import { attachInput } from "./emulator/input";
import { readRom } from "./rom/client";
import { RULESETS, RULESET_IDS, goalText, isKnownRuleset, type ChallengeMode } from "./rulesets";
import { NUZLOCKE_RULES } from "./tracker/rules/nuzlocke";
import { KEYS, backupOk, clearRun, exportAll, importAll, kv, restoreFromDisk, type BaseRom, type CurrentRun, type RunRecord } from "./storage";
import { detectVersion, gameFor } from "./games";
import type { GameState } from "./games/types";
import { Tracker, type TrackerSnapshot } from "./tracker/tracker";
import { ConvoView, OPEN_RESULTS, type ConvoEvent } from "./ui/convo";
import { partyFocus, realTime, renderEncounters, renderEnemy, renderEvents, renderParty, renderRun } from "./ui/tracker-view";
import { AiBridge } from "./bridge/ai-bridge";
import { battleMoves, brief, summarize } from "./bridge/summary";
import { KIND_CANDY_CAP, KIND_LEVEL_CAP, KIND_TOP_UP, Recorder, type ReplayLog, type SavedReplay } from "./emulator/replay";

// A watched run (several windows tiled small): fit the game screen to the window.
if (WATCHED) document.documentElement.classList.add("watch");

// ---- The model's conversation beside the game (runs played with npm run bench) ----
const CONVO_KEY = "nuzlocke.convo";
let convoNext = 0;
let convoTimer = 0;
let convo: ConvoView | null = null;
/** Follow the newest entries until the reader scrolls up; scrolling back to the bottom follows again. */
let convoFollow = true;
/** The list's scroll position as last seen: only scrolling up (not the list growing) stops following. */
let convoTop = 0;
/** Entries that came in while the reader was scrolled up (on the "Jump to latest" button). */
let convoUnseen = 0;
// Collapsed (the default): only the newest results are shown whole, older ones are one line each.
const COLLAPSE_KEY = "nuzlocke.convoOlderCollapsed";
// What the model has used so far (benchmark runs): in the Run panel, polled while an AI is connected.
type Usage = { tokens: number; turns: number; model?: string | null; effort?: string | null };
let modelUsage: string | null = null;
let usageTick = 0;
function showUsage(u: Usage | null | undefined) {
  // The model it runs on: a quiet label above the log (older servers don't send it).
  $("convo-model").textContent = u?.model ? `${u.model}${u.effort ? ` · ${u.effort} effort` : ""}` : "";
  const text = u && u.turns ? `${(u.tokens / 1e6).toFixed(1)}M tokens · ${u.turns.toLocaleString("en-US")} turns` : null;
  if (text === modelUsage) return;
  modelUsage = text;
  $("convo-usage").textContent = text ?? "";
  if (tracker && state) setHtml("t-run", renderRun(tracker, state, modelUsage));
}
async function pollUsage() {
  try {
    const r = await fetch(`${BRIDGE_HTTP}/transcript/usage`);
    showUsage(((await r.json()) as { usage?: Usage | null }).usage);
  } catch {
    /* no server: nothing to show */
  }
}
async function pollConvo() {
  try {
    const r = await fetch(`${BRIDGE_HTTP}/transcript?from=${convoNext}`);
    const feed = (await r.json()) as { events: ConvoEvent[]; next: number; missing?: boolean; usage?: Usage | null };
    // A server from before the usage field: ask its own route.
    if (feed.usage === undefined) void pollUsage();
    else showUsage(feed.usage);
    $("convo-state").textContent = feed.missing ? "No transcript: only runs played with npm run bench have one" : "";
    if (convo && feed.events.length) {
      for (const e of feed.events) convo.add(e);
      convo.settle();
      if (!convoFollow) convoUnseen += feed.events.filter((e) => e.kind !== "result").length;
    }
    // Also when the last try found the list hidden (no height yet, so nothing scrolled).
    if (convoFollow && (feed.events.length || !convoTop)) followConvo();
    // Live: something happened in the last minute (a finished run's log is just a log).
    $("convo-live").hidden = !(convo?.last && Date.now() - convo.last < 60_000);
    showJump();
    convoNext = feed.next;
  } catch {
    $("convo-state").textContent = "Game server not reachable";
  }
}
function followConvo() {
  const list = $("convo-list");
  list.scrollTop = list.scrollHeight;
  convoTop = list.scrollTop;
}
function showJump() {
  const jump = $("convo-jump");
  jump.hidden = convoFollow;
  jump.textContent = convoUnseen ? `${convoUnseen} new · Jump to latest` : "Jump to latest";
}
function showConvo(on: boolean) {
  localStorage.setItem(CONVO_KEY, on ? "1" : "0");
  $("convo").hidden = !on;
  $("game").classList.toggle("with-convo", on);
  $("btn-convo").classList.toggle("on", on);
  clearInterval(convoTimer);
  if (on) {
    void pollConvo();
    convoTimer = window.setInterval(() => void pollConvo(), 2000);
  }
}
function collapseConvo(on: boolean) {
  localStorage.setItem(COLLAPSE_KEY, on ? "1" : "0");
  $("convo-list").classList.toggle("collapsed", on);
  $("convo-collapse").textContent = on ? "Expand all" : `Only the last ${OPEN_RESULTS} open`;
  convo?.reset();
  if (convoFollow) followConvo();
}
document.addEventListener("DOMContentLoaded", () => {
  const list = $("convo-list");
  convo = new ConvoView(list);
  $("btn-convo").addEventListener("click", () => showConvo($("convo").hidden));
  $("convo-collapse").addEventListener("click", () => collapseConvo(!list.classList.contains("collapsed")));
  collapseConvo(localStorage.getItem(COLLAPSE_KEY) !== "0");
  list.addEventListener("scroll", () => {
    if (!list.clientHeight) return;
    if (list.scrollHeight - list.scrollTop - list.clientHeight < 40) convoFollow = true;
    else if (list.scrollTop < convoTop - 1) convoFollow = false;
    convoTop = list.scrollTop;
    if (convoFollow) convoUnseen = 0;
    showJump();
  });
  $("convo-jump").addEventListener("click", () => {
    convoFollow = true;
    convoUnseen = 0;
    followConvo();
    showJump();
  });
  // A screenshot decodes after it's added and makes the list taller: stay at the bottom.
  list.addEventListener("load", () => convoFollow && followConvo(), true);
  if (localStorage.getItem(CONVO_KEY) === "1") showConvo(true);
});

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

// ---------------------------------------------------------------------------
// State

let baseRom: BaseRom | null = null;
let run: CurrentRun | null = null;
let gb: GameBoy | null = null;
let tracker: Tracker | null = null;
let state: GameState | null = null;
let detachInput: (() => void) | null = null;
let frameCount = 0;
let ffSpeed = 1;
let ffHeld = false;
let autosaveTimer = 0;
let realTimer = 0;
let lastRealTick = 0;
let renderQueued = false;
let aiConnected = false;
let fontSig: Uint8Array | null = null;
/** Records the current run for replay; `runRom` is the exact ROM it runs on. */
let recorder: Recorder | null = null;
let runRom: Uint8Array | null = null;
const lastHtml: Record<string, string> = {};
// Browser-local preferences. Their names are from the app's first name; renaming them would
// drop what each browser remembers, so they stay.
const VOLUME_KEY = "kaizo.volume";

// ---------------------------------------------------------------------------
// Boot

/** The AI bridge's commands wait for this (AiHost.booted). */
let bootDone = () => {};
const booted = new Promise<void>((resolve) => (bootDone = resolve));

async function boot() {
  // A browser with an empty store (fresh pane, cleared data) picks the run up from the disk backup.
  if (await restoreFromDisk()) console.info("Restored the saves from the disk backup.");
  if (!bridge.active && (await kv.get<boolean>(AI_PREF_DB_KEY))) bridge.start();
  baseRom = (await kv.get<BaseRom>(KEYS.baseRom)) ?? null;
  run = (await kv.get<CurrentRun>(KEYS.run)) ?? null;
  // A saved run of a ruleset this version no longer has can't be played: start from setup.
  // (Its history stays; "Play" replaces the run's saves.)
  if (run && !isKnownRuleset(run.mode)) {
    console.info(`The saved run uses a ruleset this version doesn't have (${String(run.mode)}): not resuming it.`);
    run = null;
  }
  updateRomLabel();
  bindSetup();
  bindToolbar();
  if (run) {
    await launch(run);
  } else {
    showSetup();
  }
}

function showSetup() {
  $("setup").hidden = false;
  $("game").hidden = true;
  updateRunMeta();
  void renderBest();
}

function updateRomLabel() {
  const text = $("drop-text");
  const drop = $("drop");
  if (baseRom) {
    const v = detectVersion(baseRom.bytes);
    text.textContent = `${baseRom.name} — Pokémon ${v ?? "?"} (click to change)`;
    drop.classList.add("loaded");
  }
  ($("start") as HTMLButtonElement).disabled = !baseRom;
}

// ---------------------------------------------------------------------------
// Setup screen

/** Each ruleset is its own challenge: own rules, own best run. */
const bestKey = (m: ChallengeMode) => KEYS.bestReplay(m);
const setupMode = () => ($<HTMLSelectElement>("mode").value || RULESET_IDS[0]) as ChallengeMode;
/** The challenge on screen: the current run's, or the one picked on the setup screen. */
const viewMode = (): ChallengeMode => (run && !$("game").hidden ? run.mode : setupMode());

/** Show only the options and rules of the challenge picked on the setup screen. */
function applySetupMode() {
  const mode = setupMode();
  document.querySelectorAll<HTMLElement>("[data-for]").forEach((el) => (el.hidden = el.dataset.for !== mode));
  $<HTMLInputElement>("end-on-violation").checked = RULESETS[mode].endOnViolationByDefault;
  void renderBest();
}

/** Rule ids left unticked under "Which rules disqualify". */
const lenientRulesChosen = () =>
  Array.from(document.querySelectorAll<HTMLInputElement>("#rule-switches input")).filter((i) => !i.checked).map((i) => i.value);

function bindSetup() {
  $<HTMLSelectElement>("mode").innerHTML = Object.values(RULESETS).map((r) => `<option value="${r.id}">${r.label}</option>`).join("");
  $("rule-switches").innerHTML = NUZLOCKE_RULES.map((r) =>
    `<label class="check"><input type="checkbox" value="${r.id}" checked /> ${r.label}</label>`).join("");
  $<HTMLSelectElement>("mode").addEventListener("change", applySetupMode);
  applySetupMode();
  const input = $<HTMLInputElement>("rom-input");
  const drop = $("drop");
  const status = $("setup-status");

  const accept = async (file: File) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!detectVersion(bytes)) {
      status.textContent = "That file isn't Pokémon Red, Blue, Yellow or Crystal.";
      status.classList.add("error");
      return;
    }
    status.textContent = "";
    status.classList.remove("error");
    baseRom = { name: file.name, bytes };
    await kv.set(KEYS.baseRom, baseRom);
    updateRomLabel();
  };

  input.addEventListener("change", () => input.files?.[0] && accept(input.files[0]));
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("over");
    const f = e.dataTransfer?.files?.[0];
    if (f) accept(f);
  });

  $("start").addEventListener("click", async () => {
    await startNewRun({ mode: setupMode(),
      rareCandies: $<HTMLInputElement>("rare-candies").checked,
      hardLevelCaps: $<HTMLInputElement>("hard-level-caps").checked,
      firstRivalFree: $<HTMLInputElement>("first-rival-free").checked,
      endOnViolation: $<HTMLInputElement>("end-on-violation").checked,
      lenientRules: lenientRulesChosen(),
      goalBadges: Number($<HTMLSelectElement>("goal").value) || 0 });
  });
}

async function startNewRun(opts: { mode?: ChallengeMode; rareCandies?: boolean; hardLevelCaps?: boolean; firstRivalFree?: boolean; endOnViolation?: boolean; lenientRules?: string[]; goalBadges?: number }) {
  if (!baseRom) throw new Error("Load a Red, Blue, Yellow or Crystal ROM first.");
  const mode = opts.mode ?? run?.mode ?? RULESET_IDS[0];
  const status = $("setup-status");
  const startBtn = $<HTMLButtonElement>("start");
  status.classList.remove("error");
  startBtn.disabled = true;
  // Stop the old game *before* its data is cleared: otherwise its periodic
  // autosave/battery flush can land after clearRun() and the new run would boot
  // from the previous run's state.
  teardown(false);
  showSetup();
  try {
    const rs = RULESETS[mode];
    const result = await readRom(baseRom.bytes, (stage) => (status.textContent = stage));
    const attempt = ((await kv.get<number>(KEYS.attempts)) ?? 0) + 1;
    await kv.set(KEYS.attempts, attempt);
    await clearRun();
    run = { attempt, mode, rom: result.rom, data: result.data, startedAt: Date.now(),
      rareCandies: rs.rareCandies && (opts.rareCandies ?? run?.rareCandies ?? true),
      hardLevelCaps: rs.options.hardLevelCaps && (opts.hardLevelCaps ?? run?.hardLevelCaps ?? false),
      firstRivalFree: rs.options.firstRivalFree && (opts.firstRivalFree ?? run?.firstRivalFree ?? false),
      endOnViolation: opts.endOnViolation ?? (run?.mode === mode ? run?.endOnViolation : undefined) ?? rs.endOnViolationByDefault,
      lenientRules: opts.lenientRules ?? (run?.mode === mode ? run?.lenientRules : undefined) ?? [],
      goalBadges: (opts.goalBadges ?? run?.goalBadges) || undefined };
    await kv.set(KEYS.run, run);
    status.textContent = "Starting…";
    // Boot each new run in a freshly loaded page: a clean emulator instance
    // from power-on. Re-creating the core in place led to early crashes.
    // (Short delay so an AI bridge reply can go out first.)
    setTimeout(() => location.reload(), 150);
  } catch (e) {
    status.textContent = `Couldn't start the run: ${(e as Error).message}`;
    status.classList.add("error");
    throw e;
  } finally {
    startBtn.disabled = !baseRom;
  }
}

// ---------------------------------------------------------------------------
// Game

async function launch(r: CurrentRun) {
  teardown();
  $("setup").hidden = true;
  $("game").hidden = false;
  updateRunMeta();

  const core = await loadCore();
  const extRam = (await kv.get<Uint8Array>(KEYS.battery)) ?? null;
  const snapshot = (await kv.get<TrackerSnapshot>(KEYS.tracker)) ?? null;

  const rom = r.rom.slice();
  gb = new GameBoy(core, {
    canvas: $<HTMLCanvasElement>("screen"),
    rom,
    extRam,
    onBatterySave: (ram) => void kv.set(KEYS.battery, ram),
    onFrame,
  });
  const auto = await kv.get<Uint8Array>(KEYS.autoState);
  if (auto) gb.loadState(auto);
  // Recording: a new run starts from power-on; a resumed one continues its saved log. The log is
  // saved together with autoState, so it normally ends exactly here — if not, resync with a state.
  runRom = rom;
  const savedLog = await kv.get<ReplayLog>(KEYS.replay);
  recorder = new Recorder(savedLog ?? { start: gb.saveState() });
  if (savedLog && savedLog.endTicks !== gb.ticks) recorder.state(gb.saveState());
  gb.recorder = recorder;
  gb.volume = Number($<HTMLInputElement>("volume").value);
  gb.externalControl = aiConnected;
  applySpeed();

  eventsSeen = 0;
  tracker = new Tracker(r.data, r.mode, snapshot, queueRender, {
    hardLevelCaps: !!r.hardLevelCaps, firstRivalFree: !!r.firstRivalFree,
    endOnViolation: r.endOnViolation ?? RULESETS[r.mode].endOnViolationByDefault,
    lenientRules: r.lenientRules ?? [],
    goalBadges: r.goalBadges,
  });
  detachInput = attachInput(gb, {
    onFastForward: (held) => { ffHeld = held; applySpeed(); },
    onSaveState: () => void saveSlot("manual"),
    onLoadState: () => void loadSlot("manual"),
  }, $("touchpad"));

  gb.start();
  autosaveTimer = window.setInterval(autosave, 15000);
  // Real time on the run: counted while the page is open, and shown even while the game waits on an AI.
  lastRealTick = Date.now();
  realTimer = window.setInterval(() => {
    const now = Date.now();
    const gap = now - lastRealTick;
    lastRealTick = now;
    if (!tracker || gap <= 0 || gap > 60_000) return; // a gap that long is a closed laptop, not play
    tracker.addRealTime(gap);
    const el = document.querySelector("#t-run .real-time");
    if (el && tracker.snap.realMs != null) el.textContent = realTime(tracker.snap.realMs);
    if (aiConnected && $("convo").hidden && ++usageTick % 5 === 0) void pollUsage();
  }, 1000);
  pollState();
  renderAll();
  renderHistory();
  if (tracker.snap.outcome) showOutcome();
}

function teardown(flushBattery = true) {
  clearInterval(autosaveTimer);
  clearInterval(realTimer);
  detachInput?.();
  detachInput = null;
  gb?.destroy(flushBattery);
  gb = null;
  tracker = null;
  recorder = null;
  runRom = null;
  state = null;
  fontSig = null;
  for (const k of Object.keys(lastHtml)) delete lastHtml[k];
}

/**
 * With hard level caps nobody can be over the cap, so the usual cap rule (what an over-cap
 * Pokémon may do) and the wipe rule's over-cap clause would describe what can't happen: one plain
 * cap rule instead. Null: the page's own text stands.
 */
function hardCapText(li: HTMLElement): string | null {
  if (!run?.hardLevelCaps) return null;
  if (li.dataset.rule === "level-cap") {
    return "Level caps (hard): the cap is the highest level of the next Gym Leader. A Pokémon at the cap gains no more levels — " +
      "experience and Rare Candies stop there. In the League the cap is the last Elite Four member's highest level. Once the League's battles have begun, experience may pass it, but Rare Candies still stop there. " +
      "Outside battle, the line about your lead in each result ends with the current cap (\"cap Lv14\").";
  }
  if (li.dataset.rule === "wipe") return "A wipe (every living Pokémon fainted; the dead don't count, healed or not) ends the run.";
  return null;
}

/** Nuzlocke option, on unless turned off: Rare Candies never run out (level caps still apply). */
const infiniteCandies = (r: CurrentRun) => RULESETS[r.mode].rareCandies && r.rareCandies !== false;

function onFrame() {
  frameCount++;
  // The bottomless Rare Candies start after the first rival battle: that fight is played at the starter's own level.
  if (gb && run && infiniteCandies(run) && gameFor(run.data.version).firstRivalBattleFought(gb)) {
    const g = gb, game = gameFor(run.data.version), candy = game.data.items.rareCandy;
    g.intervene(KIND_TOP_UP, candy, () => game.topUpItem(g, candy));
  }
  if (frameCount % 6 === 0) pollState();
}

/**
 * Hard level caps option: keep the level the game's experience and Rare Candies stop at equal to
 * the current cap (it rises with each badge). The loaded ROM starts at 100 on every page load, so
 * this also sets it after a resume. Recorded by name (KIND_LEVEL_CAP) for playback.
 */
function syncHardCap(g: GameBoy, t: Tracker, s: GameState) {
  // Not before there's a party: at power-on, RAM is noise (it can read as a badge).
  if (!s.party.length) return;
  const level = t.levelCapForRom(s);
  if (level == null) return;
  if (t.game.levelCapInRom(g) !== level) g.intervene(KIND_LEVEL_CAP, level, () => t.game.setLevelCapInRom(g, level));
  // In the League experience may pass the cap, but Rare Candies still stop there.
  const candy = t.candyCapForRom(s);
  if (candy != null && t.game.candyCapInRom(g) !== candy) g.intervene(KIND_CANDY_CAP, candy, () => t.game.setCandyCapInRom(g, candy));
}

/** The trainer who started the current battle: map + sprite index (to remember it once beaten). */
let engagedTrainer: { map: number; sprite: number } | null = null;

function pollState() {
  if (!gb || !tracker || !run) return;
  const prev = state;
  const game = gameFor(run.data.version);
  state = game.readGameState(gb);
  syncHardCap(gb, tracker, state);
  // Trainer battles: find the sprite whose trainer class + number (wMapSpriteExtraData) match
  // the opponent's; fall back to the nearest trainer sprite.
  if (prev && prev.battle === 0 && state.battle === 2) {
    const foe = state.enemyTrainer;
    const sprites = game.trainerSprites(gb, prev.x, prev.y);
    const exact = foe && sprites.find((t) => {
      const who = game.spriteTrainer(gb!, t.index);
      return who.trainerClass === foe.trainerClass && who.number === foe.number;
    });
    const near = sprites
      .map((t) => ({ t, d: Math.abs(t.x - prev.x) + Math.abs(t.y - prev.y) }))
      .sort((a, b) => a.d - b.d)[0];
    engagedTrainer = exact ? { map: prev.map, sprite: exact.index } : near && near.d <= 6 ? { map: prev.map, sprite: near.t.index } : null;
  }
  if (prev && prev.battle === 2 && state.battle === 0) {
    if (engagedTrainer && state.party.some((m) => m.hp > 0)) tracker.noteTrainerBeaten(engagedTrainer.map, engagedTrainer.sprite);
    engagedTrainer = null;
  }
  const hadOutcome = tracker.snap.outcome;
  tracker.update(state);
  if (!hadOutcome && tracker.snap.outcome) {
    void persistTracker();
    showOutcome();
  }
  queueRender();
}

function queueRender() {
  if (renderQueued) return;
  renderQueued = true;
  setTimeout(() => {
    renderQueued = false;
    renderAll();
  }, 200);
}

function setHtml(id: string, html: string) {
  if (lastHtml[id] === html) return;
  lastHtml[id] = html;
  $(id).innerHTML = html;
}

/** The party tile the player clicked (its uid), until the focused Pokémon changes. */
let partyPick: string | null = null;
let lastFocus = "";

function renderAll() {
  if (!tracker || !state) return;
  const focus = partyFocus(state);
  if (focus !== lastFocus) {
    // A new fighter (or lead) takes the main card again.
    lastFocus = focus;
    partyPick = null;
  }
  setHtml("t-lead", renderParty(tracker, state, partyPick));
  // One slot: the foe in battle, else the area's wild Pokémon (so it's never empty and nothing moves).
  setHtml("t-enemy", renderEnemy(tracker, state) || renderEncounters(tracker, state) ||
    (state.started ? `<section class="card"><h3>Wild Pokémon</h3><p class="muted">None here.</p></section>` : ""));
  setHtml("t-run", renderRun(tracker, state, modelUsage));
  setHtml("t-events", renderEvents(tracker));
  updateRunMeta();
}

function updateRunMeta() {
  const meta = $("run-meta");
  if (!run) {
    meta.textContent = "";
    return;
  }
  meta.innerHTML = `Attempt <b>#${run.attempt}</b> · ${RULESETS[run.mode].label} · ${capitalize(run.data.version)}` +
    (run.goalBadges ? ` · goal: <b>${goalText({ goalBadges: run.goalBadges })}</b>` : "");
}

const capitalize = (s: string) => s[0].toUpperCase() + s.slice(1);
const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

async function persistTracker() {
  if (tracker) await kv.set(KEYS.tracker, tracker.snap);
}

/** tracker.eventCount already shown in a tool result (AI bridge). */
let eventsSeen = 0;
let autosaveFailed = false;
let autosaveProblem: string | null = null;

async function autosave() {
  if (!gb || !tracker) return;
  try {
    // Capture both now: if the run is replaced mid-save, don't write its tracker over the new run's.
    const machine = gb.saveState();
    const log = recorder?.log(gb.ticks);
    const snap = tracker.snap;
    const owner = gb;
    await kv.set(KEYS.autoState, machine);
    if (gb === owner) {
      await kv.set(KEYS.tracker, snap);
      if (log) await kv.set(KEYS.replay, log);
    }
    autosaveProblem = null;
    if (autosaveFailed) {
      autosaveFailed = false;
      $("ai-status").textContent = aiStatusText;
    }
    // The disk copy is written a moment later; show how the last one went.
    setTimeout(() => {
      const el = $("backup-state");
      el.classList.toggle("fail", !backupOk);
      el.textContent = backupOk ? "Backed up" : "No backup";
      el.title = backupOk
        ? "Saves are backed up to disk (the project's saves/ folder)."
        : "No disk backup: the MCP server isn't running. Saves live only in this browser — use Export save to keep a copy.";
    }, 2000);
  } catch (e) {
    // Never fail quietly: a reload would bring back an old save.
    autosaveFailed = true;
    autosaveProblem = e instanceof Error ? e.message : String(e);
    $("ai-status").textContent = `⚠ Autosave failed (${e instanceof Error ? e.message : e}) — don't reload; progress since the last save would be lost.`;
    throw e;
  }
}

/** Victory beats everything; then badges; then the lead's best level. */
function runScore(outcome: RunRecord["outcome"], badges: number, level: number): number {
  return (outcome.kind === "victory" ? 1_000_000 : 0) + badges * 1000 + level;
}

/** Keeps the recording of the furthest run so far. */
/** Finished runs' recordings kept for checking (scripts/verify-run.mjs): the most recent ones. */
const KEEP_RUN_REPLAYS = 20;

async function keepIfBest(outcome: RunRecord["outcome"], lead: string, level: number, badges: number) {
  if (!gb || !recorder || !runRom || !run) return;
  const score = runScore(outcome, badges, level);
  const saved: SavedReplay = {
    ...recorder.log(gb.ticks),
    rom: runRom,
    data: run.data,
    options: tracker?.options,
    meta: {
      attempt: run.attempt, mode: run.mode, version: run.data.version, lead, level, badges,
      outcome: outcome.detail, score, recordedAt: Date.now(),
    },
  };
  // Every finished run's recording, so any attempt can be checked (saves/replay.attempt-N.json).
  await kv.set(KEYS.runReplay(run.attempt), saved);
  if (run.attempt > KEEP_RUN_REPLAYS) await kv.del(KEYS.runReplay(run.attempt - KEEP_RUN_REPLAYS));
  const best = await kv.get<SavedReplay>(bestKey(run.mode));
  if (best && best.meta.score >= score) return;
  await kv.set(bestKey(run.mode), saved);
}

/**
 * A save at a story milestone, kept for good: the MCP server asks on the call that first reaches
 * one. The machine, the tracker and the battery as they are now, and how far the recording has
 * got, so a run can be continued from there (scripts/snapshot-run.mjs --milestone) without
 * replaying it from power-on.
 */
async function saveMilestone(id: string) {
  if (!gb || !tracker) return;
  const battery = (await kv.get<Uint8Array>(KEYS.battery)) ?? null;
  await kv.set(KEYS.milestone(id), { state: gb.saveState(), tracker: structuredClone(tracker.snap), battery, ticks: gb.ticks });
}

async function saveSlot(slot: string) {
  if (!gb) return;
  await kv.set(`${KEYS.slotState}.${slot}`, gb.saveState());
  flash(`Saved state${slot === "manual" ? "" : ` (${slot})`}.`);
}

async function loadSlot(slot: string): Promise<boolean> {
  if (!gb) return false;
  const st = await kv.get<Uint8Array>(`${KEYS.slotState}.${slot}`);
  if (!st) {
    flash("No saved state yet.");
    return false;
  }
  const ok = gb.loadState(st);
  flash(ok ? "Loaded state." : "Couldn't load that state.");
  return ok;
}

function flash(text: string) {
  const el = $("ai-status");
  el.textContent = text;
  setTimeout(() => { if (el.textContent === text) el.textContent = aiStatusText; }, 2500);
}

function applySpeed() {
  if (!gb) return;
  gb.speed = ffHeld ? Math.max(ffSpeed, 4) : ffSpeed;
  $("btn-ff").textContent = `Speed ${ffSpeed}×`;
}

// ---------------------------------------------------------------------------
// Toolbar

const ICON = (d: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const SOUND_ON = ICON('<path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/>');
const SOUND_OFF = ICON('<path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="m22 9-6 6"/><path d="m16 9 6 6"/>');

function bindToolbar() {
  $("btn-ff").addEventListener("click", () => {
    ffSpeed = ffSpeed === 1 ? 2 : ffSpeed === 2 ? 4 : ffSpeed === 4 ? 8 : 1;
    applySpeed();
  });
  $("btn-save").addEventListener("click", () => void saveSlot("manual"));
  $("btn-load").addEventListener("click", () => void loadSlot("manual"));
  // Muted by default; remember the viewer's choice.
  const volumeInput = $<HTMLInputElement>("volume");
  try {
    volumeInput.value = localStorage.getItem(VOLUME_KEY) ?? "0";
  } catch {
    /* ignore */
  }
  $("vol-icon").innerHTML = Number(volumeInput.value) > 0 ? SOUND_ON : SOUND_OFF;
  volumeInput.addEventListener("input", (e) => {
    const v = (e.target as HTMLInputElement).value;
    if (gb) gb.volume = Number(v);
    $("vol-icon").innerHTML = Number(v) > 0 ? SOUND_ON : SOUND_OFF;
    try {
      localStorage.setItem(VOLUME_KEY, v);
    } catch {
      /* ignore */
    }
  });
  $("btn-full").addEventListener("click", () => {
    const wrap = document.querySelector(".screen-wrap")!;
    if (document.fullscreenElement) document.exitFullscreen();
    else wrap.requestFullscreen?.();
  });
  $("btn-new").addEventListener("click", () => {
    if (!run) return showSetup();
    modal("Start a new run?", "This run will be recorded as abandoned and the game starts over.", [
      ["Start over", async () => { await recordRun({ kind: "abandoned", detail: "Abandoned" }); await startNewRun({}); }, "primary"],
      ["Back to setup", async () => { await recordRun({ kind: "abandoned", detail: "Abandoned" }); await abandonToSetup(); }],
      ["Cancel", () => {}],
    ]);
  });
  $("btn-ai").addEventListener("click", () => {
    if (bridge.active) bridge.stop();
    else bridge.start();
    try {
      localStorage.setItem(AI_PREF_KEY, bridge.active ? "1" : "");
    } catch {
      /* storage unavailable — the toggle just won't be remembered */
    }
    void kv.set(AI_PREF_DB_KEY, bridge.active); // also in the disk-backed store
  });
  $("btn-export").addEventListener("click", () => void exportSave());
  $("btn-import").addEventListener("click", () => $<HTMLInputElement>("import-file").click());
  $<HTMLInputElement>("import-file").addEventListener("change", (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) void importSave(file);
  });
  // A party tile shows that Pokémon in the main card.
  $("t-lead").addEventListener("click", (e) => {
    const tile = (e.target as HTMLElement).closest<HTMLElement>(".tile");
    if (!tile || !state) return;
    partyPick = tile.dataset.uid === partyFocus(state) ? null : tile.dataset.uid ?? null;
    renderAll();
  });
  window.addEventListener("beforeunload", () => {
    if (gb) {
      // Best effort: IndexedDB writes usually complete during unload.
      void kv.set(KEYS.autoState, gb.saveState());
      if (recorder) void kv.set(KEYS.replay, recorder.log(gb.ticks));
      void persistTracker();
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) void autosave();
  });
}

async function abandonToSetup() {
  teardown();
  await clearRun();
  run = null;
  showSetup();
}

// ---------------------------------------------------------------------------
// Outcomes, history, modal

async function recordRun(outcome: RunRecord["outcome"]) {
  if (!run) return;
  const lead = state?.party[0]?.species ? state.party[0] : tracker?.snap.lastLead;
  const leadName = lead && tracker ? tracker.name(lead.species) : "—";
  const level = Math.max(lead?.level ?? 0, tracker?.snap.maxLevel ?? 0);
  const badges = tracker?.snap.maxBadges ?? 0;
  const history = (await kv.get<RunRecord[]>(KEYS.history)) ?? [];
  // Recorded as soon as the run ends, and again by "New run": keep a single entry per attempt.
  if (history.some((h) => h.attempt === run!.attempt && h.startedAt === run!.startedAt)) {
    await keepIfBest(outcome, leadName, level, badges);
    return;
  }
  history.push({
    attempt: run.attempt,
    mode: run.mode,
    version: run.data.version,
    startedAt: run.startedAt,
    endedAt: Date.now(),
    lead: leadName,
    level,
    badges,
    outcome,
  });
  await kv.set(KEYS.history, history.slice(-200));
  await keepIfBest(outcome, leadName, level, badges);
}

function showOutcome() {
  if (!tracker?.snap.outcome || !run) return;
  const o = tracker.snap.outcome;
  gb?.setPaused(true);
  // Save the result (history + best replay) now, not only when "New run" is clicked.
  void recordRun(o).then(() => renderHistory());
  const next = async () => {
    await recordRun(o);
    await startNewRun({});
  };
  if (o.kind === "disqualified") {
    modal("Disqualified", `${o.detail} A rule was broken, so the run ends here.`, [["New run", next, "primary"]]);
  } else if (o.kind === "wipe") {
    modal("Run over", `${o.detail} A wipe ends a Nuzlocke.`, [["New run", next, "primary"]]);
  } else if (o.kind === "lost") {
    modal("Run over", `${o.detail} Going on could only break a rule, so the run is lost.`, [["New run", next, "primary"]]);
  } else {
    modal("🏆 Victory!", `${o.detail} ${RULESETS[run.mode].label} complete — ${tracker.snap.dead.length} lost along the way.`,
      [["New run", next, "primary"], ["Keep playing", () => gb?.setPaused(false)]]);
  }
}

type ModalAction = [label: string, fn: () => unknown, cls?: string];
function modal(title: string, html: string, actions: ModalAction[]) {
  $("modal-title").textContent = title;
  $("modal-text").innerHTML = html;
  const box = $("modal-actions");
  box.innerHTML = "";
  for (const [label, fn, cls] of actions) {
    const b = document.createElement("button");
    b.textContent = label;
    if (cls) b.className = cls;
    b.addEventListener("click", async () => {
      $("modal").hidden = true;
      try {
        await fn();
      } catch (e) {
        console.error(e);
      }
    });
    box.appendChild(b);
  }
  $("modal").hidden = false;
  (box.firstElementChild as HTMLElement | null)?.focus();
}

/** The furthest finished attempt (from history, so it includes runs recorded before replays existed). */
async function renderBest() {
  const mode = viewMode();
  const history = ((await kv.get<RunRecord[]>(KEYS.history)) ?? []).filter((h) => h.mode === mode);
  const best = history.reduce<RunRecord | null>(
    (b, h) => (!b || runScore(h.outcome, h.badges, h.level) > runScore(b.outcome, b.badges, b.level) ? h : b), null);
  const replay = await kv.get<SavedReplay>(bestKey(mode));
  // A slower call for the other screen (setup ↔ game) mustn't overwrite this one.
  if (viewMode() !== mode) return;
  const text = best
    ? `Best: attempt #${best.attempt} — ${best.level ? `${best.lead} Lv${best.level}` : "no Pokémon yet"}, ${best.badges} badge${best.badges === 1 ? "" : "s"}` +
      (replay ? (replay.meta.attempt === best.attempt ? " (replay saved)" : ` · best recorded: #${replay.meta.attempt}`) : " (recorded before replays existed)")
    : "";
  $("setup-best").textContent = text;
  $("best-summary").textContent = text ? `· ${text}` : "";
}

async function renderHistory() {
  void renderBest();
  const history = (await kv.get<RunRecord[]>(KEYS.history)) ?? [];
  if (!history.length) {
    $("t-history").innerHTML = `<p class="muted">No finished attempts yet.</p>`;
    return;
  }
  // Attempts of rulesets this version no longer has stay listed, tagged with their ruleset.
  const rows = history.slice(-30).reverse().map((h) =>
    `<tr><td>#${h.attempt}${isKnownRuleset(h.mode) ? "" : ` <span class="muted">${escapeHtml(h.mode ?? "older")}</span>`}</td><td>${escapeHtml(h.lead)} Lv${h.level}</td><td>${h.badges} badges</td><td>${h.outcome.kind === "victory" ? "🏆" : escapeHtml(h.outcome.kind)}</td></tr>`);
  $("t-history").innerHTML = `<table class="history"><tbody>${rows.join("")}</tbody></table>`;
}

// ---------------------------------------------------------------------------
// AI control (MCP bridge)

let aiStatusText = "";
const bridge = new AiBridge(
  {
    booted,
    gb: () => gb,
    canvas: $<HTMLCanvasElement>("screen"),
    refresh: () => pollState(),
    summary: () => (tracker && state && run ? summarize(tracker, state, run, { menuCursor: gb ? gameFor(run.data.version).menuCursor(gb) : 0 }) : null),
    newRun: async (opts) => {
      if (tracker?.snap.outcome) await recordRun(tracker.snap.outcome);
      else if (run) await recordRun({ kind: "abandoned", detail: "Abandoned (AI)" });
      $("modal").hidden = true;
      await startNewRun(opts);
      $("modal").hidden = true;
    },
    setBaseRom: async (name, bytes) => {
      if (!detectVersion(bytes)) throw new Error(`${name} isn't an English Pokémon Red, Blue, Yellow or Crystal ROM.`);
      baseRom = { name, bytes };
      await kv.set(KEYS.baseRom, baseRom);
      updateRomLabel();
    },
    saveState: (slot) => saveSlot(`ai-${slot}`),
    saveMilestone: (id) => saveMilestone(id),
    saveProblem: () => autosaveProblem,
    loadState: (slot) => loadSlot(`ai-${slot}`),
    version: () => run?.data.version ?? null,
    game: () => (run ? gameFor(run.data.version) : null),
    rom: () => run?.rom ?? null,
    beatenTrainers: () => (gb && run && tracker ? tracker.snap.beatenTrainers[gameFor(run.data.version).currentMap(gb)] ?? [] : []),
    mapTrainers: () => {
      if (!gb || !run || !tracker) return [];
      const game = gameFor(run.data.version);
      const beaten = tracker.snap.beatenTrainers[game.currentMap(gb)] ?? [];
      const here = game.position(gb);
      return game.trainerSprites(gb, here.x, here.y).map((s) => {
        const { trainerClass: cls } = game.spriteTrainer(gb!, s.index);
        return { x: s.x, y: s.y, name: run!.data.trainerClasses?.[cls - 1] || `class ${cls}`, beaten: beaten.includes(s.index) };
      });
    },
    brief: () => (tracker && state ? brief(tracker, state) : null),
    takePoisonHurt: () => tracker?.takePoisonHurt() ?? [],
    takeMapsEntered: () => tracker?.takeMapsEntered() ?? [],
    newEvents: () => {
      if (!tracker) return [];
      const n = Math.min(tracker.eventCount - eventsSeen, tracker.snap.events.length);
      eventsSeen = tracker.eventCount;
      return n > 0 ? tracker.snap.events.slice(-n).map((e) => `[${e.severity}] ${e.text}`) : [];
    },
    battleMoves: () => (tracker && state ? battleMoves(tracker, state) : []),
    battleHp: () => (gb && run ? gameFor(run.data.version).readBattleHp(gb) : null),
    position: () => {
      if (!gb || !run) return { x: 0, y: 0, map: 0, battle: false };
      return gameFor(run.data.version).position(gb);
    },
    fontSignature: () => (run ? (fontSig ??= gameFor(run.data.version).fontSignature(run.rom)) : null),
    // No run, no rules: a default ruleset here would be read as the rules of the run to come.
    rules: () => !run ? "No run is loaded yet. Start one (new_run, or the page's setup), then read the rules." : [
      `- Goal: ${goalText({ goalBadges: run.goalBadges })}. The run is won the moment it's reached.`,
      // A short run's goal (goalBadges) replaces the full game's: drop the rules' own "win by beating the Champion".
      ...Array.from(document.querySelectorAll<HTMLElement>(`.rules[data-for="${run.mode}"] li:not([data-option])`), (li) =>
        `- ${hardCapText(li) ?? (run?.goalBadges ? (li.textContent ?? "").replace(/\s*Win by beating the Champion\.$/, "") : li.textContent)}`),
      ...(run && infiniteCandies(run)
        ? ["- Rare Candies: always 99 in the bag once the first rival battle has been fought. Each one raises a Pokémon by one level. They're used outside battle."]
        : []),
      ...(run && (run.endOnViolation ?? RULESETS[run.mode].endOnViolationByDefault)
        ? [`- Breaking a rule ends the run at once (disqualified)${run.lenientRules?.length
            ? ` — except these, which are only logged this run: ${run.lenientRules.map((id) => NUZLOCKE_RULES.find((r) => r.id === id)?.label ?? id).join("; ")}`
            : ""}.`]
        : []),
      ...(run?.firstRivalFree
        ? ["- The first rival battle doesn't count: a Pokémon that faints in it isn't dead, and losing it doesn't end the run (the game heals your party after it)."]
        : []),
    ].join("\n"),
  },
  (status, detail) => {
    const on = status !== "off";
    $("btn-ai").classList.toggle("on", on);
    $("ai-badge").hidden = status !== "connected";
    aiConnected = status === "connected";
    document.documentElement.classList.toggle("ai-playing", aiConnected);
    if (gb) {
      gb.externalControl = aiConnected;
      if (status === "connected") gb.setPaused(false);
    }
    aiStatusText =
      status === "connected" ? "The model is connected through MCP — the game advances only when it sends inputs." :
      status === "connecting" ? `Connecting to the MCP bridge at ${detail}…` :
      status === "error" ? (detail ?? "Bridge error") : "";
    $("ai-status").textContent = aiStatusText;
  },
);

if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__bench = { gb: () => gb, run: () => run, tracker: () => tracker, state: () => state, save: () => autosave() };
}

// Remember the AI-control toggle across reloads (key name kept from the app's first name, like VOLUME_KEY).
const AI_PREF_KEY = "kaizo.aiControl";
const AI_PREF_DB_KEY = "aiControl";

/** Downloads every save (run, states, tracker, history, replays) as one file. */
async function exportSave() {
  if (gb) await autosave();
  const blob = new Blob([await exportAll()], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `nuzlocke-bench-save-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  flash("Save exported.");
}

async function importSave(file: File) {
  if (!confirm("Replace everything here (current run, history, best runs) with this save file?")) return;
  try {
    await importAll(await file.text());
    location.reload();
  } catch (e) {
    alert(`Couldn't import: ${(e as Error).message}`);
  }
}
try {
  // ?ai in the URL also turns it on (a fresh browser has nothing remembered).
  const viaUrl = new URLSearchParams(location.search).has("ai");
  if (viaUrl) void kv.set(AI_PREF_DB_KEY, true); // remembered like the toggle
  if (localStorage.getItem(AI_PREF_KEY) || viaUrl) bridge.start();
} catch {
  /* ignore */
}

boot()
  .catch((e) => {
    console.error(e);
    const s = $("setup-status");
    s.textContent = `Startup failed: ${(e as Error).message}`;
    s.classList.add("error");
    showSetup();
  })
  .finally(() => bootDone());
