// The run tracker. Feed it a GameState every few frames; it diffs against the previous one
// and does what every ruleset shares — battle start/end, catches and gifts, Pokémon Center
// heals, wipes and victory, the event log — and hands the rest to the ruleset's rules
// (rules/nuzlocke.ts) at fixed points of each poll (rules/types.ts).

import type { TrackerData } from "../rom/types";
import { FoeMoves } from "./foe-moves";
import { gameFor, type GameAdapter } from "../games";
import type { GameState } from "../games/types";
import { NuzlockeRules } from "./rules/nuzlocke";
import type { ItemDeltas, RuleModule } from "./rules/types";
import { RULESETS, type ChallengeMode, type RunOptions } from "../rulesets";

export type Severity = "violation" | "warning" | "info";

export interface RunEvent {
  t: number;
  severity: Severity;
  text: string;
  /** For violations: the rule broken (ruleset rule ids, e.g. "level-cap"). */
  rule?: string;
}

export interface Catch {
  t: number;
  map: number;
  mapConst: string;
  species: number;
  level: number;
  gift: boolean;
}

export type Outcome =
  | { kind: "wipe"; detail: string }
  | { kind: "victory"; detail: string }
  /** No Pokémon left that may battle (every living one over the level cap): only a rule broken could go on. */
  | { kind: "lost"; detail: string }
  /** End the run on a violation (option): the first one ends it. */
  | { kind: "disqualified"; detail: string };

/** Everything that must survive a page reload for the current run. */
export interface TrackerSnapshot {
  events: RunEvent[];
  catches: Catch[];
  pcHeals: number;
  trainersBeaten: number;
  wildBattles: number;
  outcome: Outcome | null;
  maxBadges: number;
  maxLevel: number;
  /** Map id → sprite indices of trainers beaten there (they no longer engage). */
  beatenTrainers: Record<number, number[]>;
  /** Every violation this run (the event log keeps only the latest 300 events). */
  violations: RunEvent[];
  /** The lead as last seen (for the attempt history, even if the screen no longer shows it). */
  lastLead?: { species: number; level: number };
  /** Nuzlocke: each area's first encounter (area key → what it was and how it went). */
  areas: Record<string, NuzArea>;
  /** Nuzlocke: Pokémon that fainted (by uid) — dead for the rest of the run. */
  dead: DeadMon[];
  /** Nuzlocke: every species that has been yours this run (for the dupes clause). */
  owned: number[];
  /** Nuzlocke: Rare Candies used — levels gained outside battle, where nothing else levels a Pokémon. */
  candies: number;
  /** Nuzlocke: Pokémon candied to exactly the level cap ("uid:cap", once per cap). */
  candiedToCap: string[];
  /** Nuzlocke: Pokémon found over the level cap outside battle ("uid:cap", once per cap). */
  overCap: string[];
  /** How the first rival battle went: "lost-free" = lost, but the firstrival option excused it. Missing = not fought yet. */
  firstRival?: "won" | "lost" | "lost-free";
  /** Real time spent on the run while its page was open (ms), until it ended; missing in older saves. */
  realMs?: number;
  /** Every trainer battle: who, where, both teams as the battle began, and how it went (missing in older saves). */
  trainerFights?: TrainerFight[];
}

/** One trainer battle as it began, with names resolved (the report reads saves without the game data). */
export interface TrainerFight {
  /** Trainer class id (pret trainer_constants) and name, and the trainer's number in its class. */
  trainerClass: number;
  trainer: string;
  number: number;
  map: string;
  badges: number;
  levelCap: number | null;
  playTime: string;
  foe: { species: string; level: number }[];
  /** `dead`: carried in the party, but it may not battle (missing in older saves). */
  team: { nickname: string; species: string; level: number; hp: number; maxHp: number; moves: string[]; dead?: boolean }[];
  /** Index into `dead` when the battle began: the ones after it died in this battle (or later, if it's still going). */
  deadBefore: number;
  result?: "won" | "lost";
  died?: string[];
}

export interface NuzArea {
  label: string;
  species: number;
  level: number;
  status: "open" | "caught" | "missed";
}

export interface DeadMon {
  uid: string;
  species: number;
  level: number;
  nickname: string;
  cause: string;
  t: number;
}

export function emptySnapshot(): TrackerSnapshot {
  return {
    events: [], catches: [],
    pcHeals: 0, trainersBeaten: 0, wildBattles: 0, outcome: null,
    maxBadges: 0, maxLevel: 0, beatenTrainers: {},
    areas: {}, dead: [], owned: [], violations: [], candies: 0, candiedToCap: [], overCap: [],
  };
}

const bagCounts = (s: GameState) => {
  const m = new Map<number, number>();
  for (const it of s.bag) m.set(it.id, (m.get(it.id) ?? 0) + it.qty);
  return m;
};

export class Tracker {
  snap: TrackerSnapshot;
  /** Events logged since this tracker was made (events are trimmed; this isn't). */
  eventCount = 0;
  /** True from the moment a wild battle's catch lands until the next battle starts (rulesets read it). */
  caughtThisBattle = false;
  /** The ruleset's rules (see rules/). */
  readonly rules: RuleModule;
  /** The run's game: its data and the places and items the rules treat specially. */
  readonly game: GameAdapter;
  private readonly nuzlocke: NuzlockeRules | null;
  private prev: GameState | null = null;
  private lastWild: { species: number; level: number } | null = null;
  private lastBoxText = "";
  private styleChecked = false;
  private pendingCatch: {
    toParty: boolean;
    wild: boolean;
    enemy: { species: number; level: number } | null;
    /** Party + box count when it arrived, and polls since. */
    total: number;
    polls: number;
  } | null = null;
  private onChange: () => void;

  constructor(
    readonly data: TrackerData,
    readonly mode: ChallengeMode,
    snapshot: TrackerSnapshot | null,
    onChange: () => void,
    /** Optional rules chosen for this run. */
    readonly options: RunOptions = {},
  ) {
    this.snap = snapshot ?? emptySnapshot();
    // Snapshots from older versions lack newer fields.
    this.snap.beatenTrainers ??= {};
    this.snap.areas ??= {};
    this.snap.dead ??= [];
    this.snap.owned ??= [];
    this.snap.candies ??= 0;
    this.snap.candiedToCap ??= [];
    this.snap.overCap ??= [];
    this.snap.violations ??= this.snap.events.filter((e) => e.severity === "violation");
    this.onChange = onChange;
    this.game = gameFor(data.version);
    this.rules = RULESETS[mode].rules(this, options);
    this.nuzlocke = this.rules instanceof NuzlockeRules ? this.rules : null;
  }

  name(species: number): string {
    return this.data.species[species]?.name ?? `#${species}`;
  }
  moveName(id: number): string {
    return this.data.moves[id]?.name ?? `Move ${id}`;
  }
  itemName(id: number): string {
    return this.data.items[id] || `Item ${id}`;
  }
  mapName(s: GameState): string {
    return this.data.mapNames[s.map] || s.mapConst;
  }

  /** A trainer battle against this map's sprite was won. */
  noteTrainerBeaten(map: number, sprite: number): void {
    const list = (this.snap.beatenTrainers[map] ??= []);
    if (!list.includes(sprite)) list.push(sprite);
  }

  /** Adds to the run's event log (rulesets call this). */
  log(severity: Severity, text: string, rule?: string): void {
    const event: RunEvent = rule ? { t: Date.now(), severity, text, rule } : { t: Date.now(), severity, text };
    this.snap.events.push(event);
    this.eventCount++;
    if (severity === "violation") {
      this.snap.violations.push(event);
      // End the run on a violation (option): breaking a rule can't be played through.
      // Rules set to "logged only" at the start of the run (harness tuning) don't end it.
      const lenient = !!rule && (this.options.lenientRules ?? []).includes(rule);
      if (this.options.endOnViolation && !lenient && !this.snap.outcome) this.endRun({ kind: "disqualified", detail: `Disqualified: ${text}` });
    }
    if (this.snap.events.length > 300) this.snap.events.splice(0, this.snap.events.length - 300);
    this.onChange();
  }

  /** Total HP the healing items in the bag can restore for the lead. */
  healsInBag(s: GameState): { hp: number; pct: number; full: number; status: number; pp: number; revives: number } {
    const lead = s.party[0];
    const maxHp = lead?.maxHp || 1;
    let hp = 0, full = 0, status = 0, pp = 0, revives = 0;
    const items = this.game.data.items;
    for (const { id, qty } of s.bag) {
      const amt = items.healAmounts[id];
      if (amt === Infinity) { full += qty; hp += maxHp * qty; }
      else if (amt) hp += Math.min(amt, maxHp) * qty;
      if (items.statusHeals.has(id) || id === items.fullRestore) status += qty;
      if (items.ppRestores.has(id)) pp += qty;
      if (items.revives.has(id)) revives += qty;
    }
    return { hp, pct: Math.round((hp / maxHp) * 100), full, status, pp, revives };
  }

  /** What the foes in this battle have shown of their moves: a player knows no more. */
  readonly foeMoves = new FoeMoves();

  update(s: GameState): void {
    const p = this.prev;
    this.prev = s;
    if (!s.started) return;
    this.foeMoves.note(s);
    if (s.party[0]?.species) this.snap.lastLead = { species: s.party[0].species, level: s.party[0].level };
    if (!p || !p.started) {
      this.rules.begin?.(s);
      return;
    }
    if (this.snap.outcome) return;
    this.notePoison(s, p);

    const lead = s.party[0];
    const rules = this.rules;
    this.snap.maxBadges = Math.max(this.snap.maxBadges, popcount(s.badges));
    if (lead) this.snap.maxLevel = Math.max(this.snap.maxLevel, lead.level);

    // ---- Battle start / end ----
    if (p.battle === 0 && s.battle > 0) {
      if (s.battle === 1 && s.enemy) {
        this.snap.wildBattles++;
        this.lastWild = { species: s.enemy.species, level: s.enemy.level };
      }
    }
    if (p.battle === 2 && s.battle === 0 && s.party.some((m) => m.hp > 0)) {
      this.snap.trainersBeaten++;
    }
    this.trackFight(s, p);
    if (p.battle === 0 && s.battle > 0) {
      rules.battleStart?.(s, p);
      this.caughtThisBattle = false;
    }
    rules.battlePoll?.(s, p);

    // ---- Messages ----
    if (s.boxText !== this.lastBoxText) {
      this.lastBoxText = s.boxText;
      rules.boxText?.(s, s.boxText);
    }

    rules.partyPoll?.(s, p);

    // ---- "Set" battle style is mandatory ----
    if (!this.styleChecked) {
      this.styleChecked = true;
      if (!this.game.data.battleStyleSet(s)) {
        this.log(this.rules.setStyleRequired ? "violation" : "warning", "Battle style is SHIFT — the rules require SET (Start → Option → Battle Style).", "battle-style");
      }
    }

    // ---- Moves used ----
    if (s.battle > 0 && s.enemy) {
      const mine = s.playerUsedMove;
      if (mine !== p.playerUsedMove && mine > 0) rules.moveUsed?.(s, p, mine);
    }

    // ---- Wipe / victory ----
    // Only against a party that was alive last poll: the party count is written before a new
    // member's HP, so a fresh party can briefly read as all-fainted. In battle, or outside it:
    // poison takes HP while walking, and the last Pokémon fainting there blacks you out too.
    // A dead Pokémon (Nuzlocke) doesn't count as standing, healed or not: it may ride in the party
    // but never battle, so the run ends as it would have without it. (One that faints this poll is
    // recorded dead later in the poll: its HP says it's down.)
    const down = (m: GameState["party"][number]) => m.hp === 0 || this.isDead(m.uid);
    const allDown = s.party.length > 0 && s.party.length === p.party.length &&
      s.party.every(down) && p.party.some((m) => !down(m));
    // First rival battle option: losing it doesn't count (the game heals the party right after).
    if (this.options.firstRivalFree && s.firstRivalFought === false && (s.battle === -1 || allDown)) {
      if (!this.snap.firstRival) this.log("info", "The first rival battle was lost — under this run's rules it doesn't count: nobody died, and the game heals your party.");
      this.snap.firstRival = "lost-free";
      return;
    }
    // How the first rival battle went, for the report: won when the game marks it fought without a loss.
    if (p.firstRivalFought === false && s.firstRivalFought === true && !this.snap.firstRival) this.snap.firstRival = "won";
    if (s.battle === -1 || (allDown && s.battle >= 0)) {
      if (s.firstRivalFought === false) this.snap.firstRival = "lost";
      // The foe: this poll's, or the last one's when the battle has just closed (Crystal clears its
      // battle flag before the team is seen down). Poison only when no battle was on either.
      const foe = s.battle > 0 && s.enemy ? s.enemy : p.battle !== 0 && p.enemy ? p.enemy : null;
      const killer = foe ? `${this.name(foe.species)} Lv${foe.level}` : s.battle === 0 && p.battle === 0 ? "poison" : "unknown";
      this.endRun({ kind: "wipe", detail: `Team wiped by ${killer} at ${this.mapName(s)}.` });
      return;
    }
    rules.afterWipeCheck?.(s, p);
    const goal = this.options.goalBadges;
    if (goal && popcount(s.badges) >= goal && popcount(p.badges) < goal) {
      this.endRun({ kind: "victory", detail: `Won ${goal === 1 ? "the first badge" : `${goal} badges`} — the run's goal — with ${lead ? this.name(lead.species) : "?"}!` });
      return;
    }
    if (this.game.data.isHallOfFame(s.mapConst) || s.hofTeams > p.hofTeams) {
      this.endRun({ kind: "victory", detail: `Became Champion with ${lead ? this.name(lead.species) : "?"}!` });
      return;
    }

    // ---- Catches & gifts ----
    // The party/box count is written before the new Pokémon's data (the new slot
    // still holds whatever was there before), so note the arrival and record it
    // once the slot shows the caught species. Outside battle, wait a few polls:
    // the PC adds to one side a moment before it removes from the other, which
    // looks like a gift until the total drops back.
    const total = s.party.length + s.boxCount;
    const prevTotal = p.party.length + p.boxCount;
    if (total === prevTotal + 1) {
      const enemy = s.enemy?.species ? s.enemy : p.enemy?.species ? p.enemy : null;
      const wild = p.battle === 1 || s.battle === 1;
      this.pendingCatch = {
        toParty: s.party.length > p.party.length,
        wild,
        enemy: enemy ? { species: enemy.species, level: enemy.level } : wild ? this.lastWild : null,
        total,
        polls: 0,
      };
      if (wild) this.caughtThisBattle = true;
    } else if (this.pendingCatch && total !== this.pendingCatch.total) {
      this.pendingCatch = null; // a PC move, not a new Pokémon
    }
    const pc = this.pendingCatch;
    if (pc) pc.polls++;
    const newest = pc?.toParty ? s.party[s.party.length - 1] : null;
    const settled = !!pc && (pc.wild
      ? !pc.toParty || (!!newest?.species && (newest.species === pc.enemy?.species || !pc.enemy || pc.polls > 20))
      : pc.polls >= 5 && (!pc.toParty || (!!newest?.species && !!newest.level)));
    if (pc && settled) {
      this.pendingCatch = null;
      const gift = !pc.wild;
      // A catch keeps the wild Pokémon's species and level; a gift is read from its slot.
      const species = (pc.wild ? pc.enemy?.species : 0) || newest?.species || pc.enemy?.species || 0;
      const level = (pc.wild ? pc.enemy?.level : 0) || newest?.level || pc.enemy?.level || 0;
      const c: Catch = { t: Date.now(), map: s.map, mapConst: s.mapConst, species, level, gift };
      this.snap.catches.push(c);
      rules.caught(s, p, c);
    }
    rules.afterCatches?.(s, p);

    // ---- Items ----
    const before = bagCounts(p);
    const after = bagCounts(s);
    const deltas: ItemDeltas = new Map();
    for (const id of new Set([...before.keys(), ...after.keys()])) {
      const d = (after.get(id) ?? 0) - (before.get(id) ?? 0);
      if (d !== 0) deltas.set(id, d);
    }
    rules.items?.(s, p, deltas);

    // ---- Full heals: Pokémon Centers count; elsewhere is the ruleset's business ----
    if (s.battle === 0 && p.battle === 0 && s.party.length === p.party.length) {
      const hpNow = s.party.reduce((a, m) => a + m.hp, 0);
      const hpPrev = p.party.reduce((a, m) => a + m.hp, 0);
      const maxNow = s.party.reduce((a, m) => a + m.maxHp, 0);
      const ppNow = s.party.reduce((a, m) => a + m.pp.reduce((x, y) => x + y, 0), 0);
      const ppPrev = p.party.reduce((a, m) => a + m.pp.reduce((x, y) => x + y, 0), 0);
      // A level-up (Rare Candy) also tops up HP, but it raises max HP too; a heal doesn't.
      const maxPrev = p.party.reduce((a, m) => a + m.maxHp, 0);
      const fullHeal = maxNow === maxPrev && hpNow === maxNow && (hpPrev < maxPrev || ppNow > ppPrev);
      if (fullHeal && this.game.data.isPokecenter(s.mapConst)) {
        this.snap.pcHeals++;
        this.log("info", `Healed at ${this.mapName(s)} (Pokémon Center heal #${this.snap.pcHeals}).`);
      }
    }

    rules.end?.(s, p);
  }

  // ---- Hardcore Nuzlocke queries (null / false / -1 under other rulesets) ----

  /** The level nobody may exceed: the next boss's highest level (null without boss data). */
  /** Trainer battles: the teams as each begins, then how it ended and who died in it. */
  private trackFight(s: GameState, p: GameState) {
    const fights = (this.snap.trainerFights ??= []);
    const open = fights.at(-1)?.result === undefined ? fights.at(-1) : undefined;
    // Begun: the first poll of a trainer battle that shows the trainer (its data can lag the battle flag).
    if (s.battle === 2 && s.enemyTrainer && !open) {
      const cls = s.enemyTrainer.trainerClass;
      const pt = s.playTime;
      fights.push({
        trainerClass: cls, trainer: this.data.trainerClasses?.[cls - 1] ?? `class ${cls}`, number: s.enemyTrainer.number,
        map: this.mapName(s), badges: popcount(s.badges), levelCap: this.levelCap(s)?.level ?? null,
        playTime: `${pt.h}:${String(pt.m).padStart(2, "0")}:${String(pt.s).padStart(2, "0")}`,
        foe: s.enemyTrainer.party.map((m) => ({ species: this.name(m.species), level: m.level })),
        team: s.party.map((m) => ({
          nickname: m.nickname, species: this.name(m.species), level: m.level, hp: m.hp, maxHp: m.maxHp,
          moves: m.moves.filter(Boolean).map((id) => this.data.moves[id]?.name ?? `move ${id}`),
          ...(this.isDead(m.uid) ? { dead: true } : {}),
        })),
        deadBefore: this.snap.dead.length,
      });
      return;
    }
    if (!open) return;
    // The foe's team can be read a moment after the battle flag is set.
    if (s.battle === 2 && !open.foe.length && s.enemyTrainer?.party.length) {
      open.foe = s.enemyTrainer.party.map((m) => ({ species: this.name(m.species), level: m.level }));
    }
    if (p.battle === 2 && s.battle !== 2) {
      open.result = s.battle === 0 && s.party.some((m) => m.hp > 0) ? "won" : "lost";
      open.died = this.snap.dead.slice(open.deadBefore).map((d) => d.nickname || this.name(d.species));
    }
  }

  levelCap(s: GameState): { level: number; who: string } | null {
    return this.nuzlocke?.levelCap(s) ?? null;
  }

  isDupe(species: number): boolean {
    return this.nuzlocke?.isDupe(species) ?? false;
  }

  isDead(uid: string): boolean {
    return this.nuzlocke?.isDead(uid) ?? false;
  }

  /**
   * HP lost to poison while walking, since the last takePoisonHurt(): the game shows it as a flash
   * of the screen every four steps; results say it in words. Out of battle only (in battle the
   * messages say it).
   */
  private poisonHurt = new Map<string, { name: string; from: number; to: number; max: number }>();

  private notePoison(s: GameState, p: GameState): void {
    if (s.battle !== 0 || p.battle !== 0) return;
    for (const now of s.party) {
      const was = p.party.find((m) => m.uid && m.uid === now.uid);
      if (!was || now.hp >= was.hp || !this.game.data.isPoisoned(was.status)) continue;
      const seen = this.poisonHurt.get(now.uid);
      this.poisonHurt.set(now.uid, { name: now.nickname || this.name(now.species), from: seen?.from ?? was.hp, to: now.hp, max: now.maxHp });
    }
  }

  /** "NOVA hurt by poison: 7→3/24 HP" for each Pokémon poison hurt since the last call. */
  takePoisonHurt(): string[] {
    const out = [...this.poisonHurt.values()].map((h) => `${h.name} hurt by poison: ${h.from}→${h.to}/${h.max} HP${h.to === 0 ? " (fainted)" : ""}`);
    this.poisonHurt.clear();
    return out;
  }

  /** Hard level caps option: the level experience and Rare Candies should stop at now (null when off). */
  levelCapForRom(s: GameState): number | null {
    return this.nuzlocke?.levelCapForRom(s) ?? null;
  }

  candyCapForRom(s: GameState): number | null {
    return this.nuzlocke?.candyCapForRom(s) ?? null;
  }

  /** Ends the run (rulesets call this for their own endings). */
  endRun(outcome: Outcome): void {
    this.snap.outcome = outcome;
    // How a run ended isn't itself a rule broken: a wipe or faint is a warning, not a violation.
    this.log(outcome.kind === "victory" ? "info" : "warning", outcome.detail);
  }

  /** Real time passing on the run (the page's clock); stops when the run ends. */
  addRealTime(ms: number): void {
    if (!this.snap.outcome) this.snap.realMs = (this.snap.realMs ?? 0) + ms;
  }

}

function popcount(n: number): number {
  let c = 0;
  for (; n; n &= n - 1) c++;
  return c;
}

export { areaKey } from "./rules/nuzlocke";
