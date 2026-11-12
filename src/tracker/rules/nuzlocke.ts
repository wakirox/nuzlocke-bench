// Hardcore Nuzlocke: one catch per area (its first encounter, dupes and ball-less encounters
// skipped), nicknames, permadeath with a graveyard, level caps from the next boss, no items
// in battle. Moved out of the Tracker unchanged; the Tracker calls these hooks each poll.

import type { GameState } from "../../games/types";
import type { Catch, Tracker } from "../tracker";
import type { ItemDeltas, RuleModule } from "./types";

/** A Nuzlocke area: a route, town or building; multi-floor places count once. */
export function areaKey(c: string): string {
  return c.replace(/_(\d+F|B\d+F)$/, "");
}

/**
 * Every Hardcore Nuzlocke rule a violation can be filed under. Each disqualifies (when the run
 * ends on violations) unless it was set to "logged only" at the start of the run.
 */
export const NUZLOCKE_RULES = [
  { id: "first-encounter", label: "Catch only an area's first encounter" },
  { id: "dead-pokemon", label: "A fainted Pokémon never battles again" },
  { id: "level-cap", label: "Level caps" },
  { id: "items-in-battle", label: "No items in battle" },
  { id: "nickname", label: "Nickname every Pokémon" },
  { id: "battle-style", label: "Battle style Set" },
] as const;

export type NuzlockeRuleId = (typeof NUZLOCKE_RULES)[number]["id"];

export class NuzlockeRules implements RuleModule {
  /** Battle style Set is a Hardcore rule. */
  readonly setStyleRequired = true;
  /** A wild battle whose first-encounter check still waits for the enemy's data. */
  private encounterPending = false;
  /** The area whose first encounter is this battle, if it is one. */
  private encounterArea: string | null = null;
  /** Party slots already checked (dead / level cap) since they came out this battle. */
  private sentChecked = new Set<number>();
  /** Pokémon that were over the cap when this battle started (they may ride along, not battle). */
  private overAtStart = new Set<string>();
  /** Polls in a row with no Pokémon left that may battle (a few: a half-written party mustn't end the run). */
  private strandedPolls = 0;
  /** Party Pokémon seen so far, and the new ones whose nickname is checked once you walk on. */
  private seenUids: Set<string> | null = null;
  /**
   * New Pokémon not yet checked for a nickname: the species each came as, and whether it has had a
   * name of its own while still that species (seen on any poll before the check).
   */
  private nickPending = new Map<string, { species: number; named: boolean }>();
  /** You've walked since the last battle (a badge won in it has had time to raise the cap). */
  private walking = false;
  private family: Map<number, number> | null = null;

  constructor(
    private t: Tracker,
    /**
     * Hard level caps (optional, easier): a Pokémon at the cap gains no more levels — the game's
     * own experience routine and Rare Candy stop there (the game adapter's hard caps) — so it can't go over.
     * Without it, a Pokémon over the cap when a battle starts may stay in the party but not battle
     * (lead or be sent out); passing the cap during a battle is fine, and the League's cap is the
     * last Elite Four member's top level.
     */
    readonly hardLevelCaps = false,
  ) {}

  /**
   * Hard level caps: the level experience should stop at now, and Rare Candies with it unless
   * candyCapForRom says otherwise (null when the option is off). Once the League's battles have
   * begun experience may pass the cap, as by the usual rule.
   */
  levelCapForRom(s: GameState): number | null {
    if (!this.hardLevelCaps) return null;
    const cap = this.leagueUnderway(s) ? null : this.levelCap(s);
    return cap?.level ?? this.t.game.data.maxLevel;
  }

  /** Hard level caps: the level Rare Candies stop at now (null when the option is off). They never pass the cap, League or not. */
  candyCapForRom(s: GameState): number | null {
    return this.hardLevelCaps ? this.levelCap(s)?.level ?? this.t.game.data.maxLevel : null;
  }

  battleStart(s: GameState): void {
    this.sentChecked.clear();
    this.overAtStart.clear();
    this.encounterArea = null;
    // The catching demo early in the game (the player's name is swapped for the demonstrator's) isn't your battle.
    this.encounterPending = s.battle === 1 && !this.t.game.data.isDemoBattle(s);
    // Level caps: who is over the cap as the battle starts. Carrying them is fine; battling isn't
    // (checked as each Pokémon comes out, the lead included).
    const cap = this.levelCap(s);
    if (!cap || this.leagueUnderway(s)) return;
    for (const m of s.party) {
      if (m.species && m.level > cap.level && !this.isDead(m.uid)) this.overAtStart.add(m.uid);
    }
  }

  /** Once the League's battles have begun (past the first Elite Four member) the cap may be passed. */
  private leagueUnderway(s: GameState): boolean {
    return this.t.game.data.leagueUnderway(s.mapConst);
  }

  /** Per-poll battle checks: first encounters, dead or over-cap Pokémon sent out. */
  battlePoll(s: GameState, _p: GameState): void {
    if (this.encounterPending && s.battle === 1 && s.enemy?.species) {
      this.encounterPending = false;
      this.firstEncounter(s, s.enemy.species, s.enemy.level);
    }
    if (s.battle > 0 && s.battleMon?.species && s.battleMon.hp > 0 && !this.sentChecked.has(s.activeIndex)) {
      const mon = s.party[s.activeIndex];
      if (mon && mon.species === s.battleMon.species) {
        this.sentChecked.add(s.activeIndex);
        const who = this.monLabel(mon);
        if (this.isDead(mon.uid)) {
          this.t.log("violation", `${who} is dead but was sent into battle — a fainted Pokémon may never battle again.`, "dead-pokemon");
        }
        // Level caps: nobody over the cap when the battle started may battle in it.
        const cap = this.leagueUnderway(s) ? null : this.levelCap(s);
        if (cap && this.overAtStart.has(mon.uid)) {
          this.t.log("violation", `${who} Lv${mon.level} battled over the level cap (Lv${cap.level}, ${cap.who}'s highest) — a Pokémon over the cap may stay in the party but must not battle.`, "level-cap");
        }
      }
    }
  }

  boxText(s: GameState, text: string): void {
    if (s.battle > 0 && /played/i.test(text) && /FLUTE/.test(text)) {
      this.t.log("violation", "Played the Poké Flute in battle — Hardcore Nuzlocke bans items in battle.", "items-in-battle");
    }
  }

  caught(s: GameState, _p: GameState, c: Catch): void {
    this.t.snap.owned.push(c.species);
    this.t.log("info", `${c.gift ? "Received" : "Caught"} ${this.t.name(c.species)} Lv${c.level} at ${this.t.mapName(s)}.`);
    if (c.gift) return;
    // An area is only "open" during (or right after) its first-encounter battle.
    const area = this.t.snap.areas[areaKey(s.mapConst)];
    if (area && area.status === "open") {
      area.status = "caught";
    } else {
      this.t.log("violation", `Caught ${this.t.name(c.species)} on ${this.t.mapName(s)}, but it wasn't the area's first encounter.`, "first-encounter");
    }
  }

  /** Every poll, after catches are counted: missed encounters, deaths, species owned, level cap. */
  afterCatches(s: GameState, p: GameState): void {
    const snap = this.t.snap;
    // A catch can register a poll after the battle ends; caughtThisBattle is set the moment it lands.
    if (p.battle === 1 && s.battle === 0) {
      const area = this.encounterArea ? snap.areas[this.encounterArea] : null;
      if (area && area.status === "open" && !this.t.caughtThisBattle) {
        area.status = "missed";
        this.t.log("warning", `${this.t.name(area.species)} got away — no catch on ${area.label} this run.`);
      }
      this.encounterArea = null;
      this.encounterPending = false;
    }
    for (const m of s.party) if (m.species && !snap.owned.includes(m.species)) snap.owned.push(m.species);
    const moved = s.x !== p.x || s.y !== p.y || s.map !== p.map;
    if (s.battle !== 0) this.walking = false;
    else if (moved) this.walking = true;
    // Nicknames: the naming screen comes after the Pokémon lands in the party, so judge a
    // newcomer's name once you're moving again. (Party members at load were judged before.)
    if (!this.seenUids) this.seenUids = new Set(p.party.map((m) => m.uid));
    for (const m of s.party) {
      if (m.uid && m.species && !this.seenUids.has(m.uid)) {
        this.seenUids.add(m.uid);
        this.nickPending.set(m.uid, { species: m.species, named: false });
      }
    }
    // A name of its own, seen while it's still the species it came as. After an evolution the game
    // renames an unnamed Pokémon to its new species, so the name alone can't tell the two apart then.
    for (const [uid, pending] of this.nickPending) {
      const m = s.party.find((x) => x.uid === uid);
      if (m && m.species === pending.species && m.nickname.toUpperCase() !== this.t.name(pending.species).toUpperCase()) pending.named = true;
    }
    if (this.nickPending.size && s.battle === 0 && (s.x !== p.x || s.y !== p.y || s.map !== p.map)) {
      for (const [uid, pending] of this.nickPending) {
        const m = s.party.find((x) => x.uid === uid);
        // Unnamed: never had a name of its own, and still carries a species' name (the one it came as,
        // or the one the game gave it on evolving). A name that's only the evolved form's still counts.
        const species = [pending.species, m?.species ?? 0].map((id) => this.t.name(id).toUpperCase());
        if (m && !pending.named && species.includes(m.nickname.toUpperCase())) {
          this.t.log("violation", `${this.t.name(m.species)} has no nickname — Nuzlocke: nickname every Pokémon you get.`, "nickname");
        }
      }
      this.nickPending.clear();
    }
    for (const now of s.party) {
      const was = p.party.find((m) => m.uid && m.uid === now.uid);
      if (!was || was.hp === 0 || now.hp > 0 || this.isDead(now.uid)) continue;
      // First rival battle option: a faint there isn't a death (the game heals the party after it).
      if (this.t.options.firstRivalFree && s.firstRivalFought === false) continue;
      // The foe: this poll's, or the last one's when the battle has just closed (see the tracker's wipe).
      const foe = s.battle > 0 && s.enemy ? s.enemy : p.battle !== 0 && p.enemy ? p.enemy : null;
      const cause = foe ? `${this.t.name(foe.species)} Lv${foe.level}` : s.battle === 0 && p.battle === 0 ? "poison" : "unknown";
      snap.dead.push({ uid: now.uid, species: now.species, level: now.level, nickname: now.nickname, cause, t: Date.now() });
      this.t.log("warning", `${this.monLabel(now)} died (${cause}, ${this.t.mapName(s)}). It can never battle again.`);
    }
    // Out of battle only: a level-up in a gym leader fight is followed by the badge that raises the cap.
    const cap = this.leagueUnderway(s) ? null : this.levelCap(s);
    if (s.battle !== 0) return;
    // Rare Candies: outside battle nothing else levels a Pokémon up (one candy, one level).
    if (p.battle === 0) {
      for (const now of s.party) {
        const was = p.party.find((m) => m.uid && m.uid === now.uid);
        if (!was || now.level <= was.level) continue;
        snap.candies += now.level - was.level;
        const key = `${now.uid}:${cap?.level}`;
        if (cap && now.level === cap.level && !snap.candiedToCap.includes(key)) snap.candiedToCap.push(key);
      }
    }
    if (!cap) return;
    for (const m of s.party) {
      const key = `${m.uid}:${cap.level}`;
      if (m.level > cap.level && !snap.overCap.includes(key) && !this.isDead(m.uid)) {
        snap.overCap.push(key);
        this.t.log("warning", `${this.monLabel(m)} is Lv${m.level}, over the level cap (Lv${cap.level}, ${cap.who}'s highest) — it may stay in the party, but must not battle (lead or be sent out) until the cap goes up.`);
      }
    }
  }

  end(s: GameState): void {
    this.checkStranded(s);
  }

  /**
   * No Pokémon left that may battle: every living one, in the party and the PC, is over the
   * level cap — or, in a battle, the ones that may battle have fainted and only those that may
   * not are standing. Playing on can only break a rule, so the run is lost.
   */
  private checkStranded(s: GameState): void {
    const why = this.t.snap.outcome ? null : this.stranded(s);
    this.strandedPolls = why ? this.strandedPolls + 1 : 0;
    if (why && this.strandedPolls >= 5) this.t.endRun({ kind: "lost", detail: `No Pokémon left that may battle (${this.t.mapName(s)}): ${why}` });
  }

  private stranded(s: GameState): string | null {
    const cap = this.levelCap(s);
    if (!cap || this.leagueUnderway(s) || !s.party.length) return null;
    const capText = `the level cap is Lv${cap.level} (${cap.who}'s highest)`;
    const pcHasOne = () => (s.pcMons?.() ?? []).some((m) => m.level <= cap.level && !this.isDead(m.uid));
    const who = (ms: GameState["party"], over: (m: GameState["party"][number]) => boolean) =>
      ms.map((m) => `${this.monLabel(m)} Lv${m.level} ${this.isDead(m.uid) ? "is dead" : over(m) ? "is over the cap" : "has fainted"}`).join(", ");
    if (s.battle > 0) {
      // The dead don't stand, healed or not: with no living one standing it's a wipe (the Tracker ends the run).
      const standing = s.party.filter((m) => m.hp > 0 && !this.isDead(m.uid));
      if (!standing.length) return null;
      const barred = (m: GameState["party"][number]) => this.overAtStart.has(m.uid);
      if (standing.some((m) => !barred(m))) return null;
      // Only a trainer battle makes you send one out (and only while the foe is standing); a wild one can be fled, and the PC may hold one.
      if (s.battle === 2 ? !s.enemy || s.enemy.hp === 0 : pcHasOne()) return null;
      return `${who(s.party, barred)}; ${capText}.`;
    }
    // Once you've walked since the last battle: a gym leader's badge, which raises the cap, comes after the battle.
    if (s.battle !== 0 || !this.walking) return null;
    if (s.party.some((m) => !this.isDead(m.uid) && m.level <= cap.level) || pcHasOne()) return null;
    return `${who(s.party, (m) => m.level > cap.level)}, and nobody in the PC is at or under the cap; ${capText}.`;
  }

  /** Hardcore: no items in battle (Poké Balls aside). Anything goes outside battle. */
  items(s: GameState, p: GameState, deltas: ItemDeltas): void {
    for (const [id, d] of deltas) {
      if (d < 0 && s.battle > 0 && p.battle > 0 && !this.t.game.data.items.balls.has(id)) {
        this.t.log("violation", `Used ${this.t.itemName(id)} in battle — Hardcore Nuzlocke bans items in battle.`, "items-in-battle");
      }
    }
  }

  // ---- Queries the app and the bridge use ----

  /** The level nobody may exceed: the next boss's highest level (null without boss data). */
  levelCap(s: GameState): { level: number; who: string } | null {
    const caps = this.t.data.levelCaps;
    if (!caps) return null;
    const leaders = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `Gym ${n}`);
    // Badges can come out of order (gyms 5–7): the lowest unbeaten leader sets the cap.
    let gym = -1;
    caps.gyms.forEach((level, i) => {
      if (!(s.badges & (1 << i)) && level && (gym < 0 || level < caps.gyms[gym])) gym = i;
    });
    if (gym >= 0) return { level: caps.gyms[gym], who: leaders[gym] };
    const names = [1, 2, 3, 4].map((n) => `Elite Four ${n}`);
    // The whole League is capped at the last Elite Four member's top level.
    return { level: caps.elite[3], who: names[3] };
  }

  isDupe(species: number): boolean {
    const root = this.familyRoot(species);
    return this.t.snap.owned.some((o) => this.familyRoot(o) === root);
  }

  isDead(uid: string): boolean {
    return !!uid && this.t.snap.dead.some((d) => d.uid === uid);
  }

  // ---- Internals ----

  /** Lowest pre-evolution of a species (for the dupes clause). */
  private familyRoot(species: number): number {
    if (!this.family) {
      this.family = new Map();
      for (const sp of Object.values(this.t.data.species)) {
        for (const e of sp.evolutions) if (!this.family.has(e.to)) this.family.set(e.to, sp.id);
      }
    }
    let cur = species;
    for (let i = 0; i < 4 && this.family.has(cur); i++) cur = this.family.get(cur)!;
    return cur;
  }

  private firstEncounter(s: GameState, species: number, level: number): void {
    const key = areaKey(s.mapConst);
    const label = this.t.mapName(s);
    if (this.t.snap.areas[key]) {
      this.t.log("info", `${this.t.name(species)} on ${label}: this area's encounter is used.`);
      return;
    }
    if (!s.bag.some((it) => this.t.game.data.items.balls.has(it.id) && it.qty > 0)) {
      this.t.log("info", `${this.t.name(species)} on ${label}, but you have no Poké Balls yet — this one doesn't count.`);
      return;
    }
    if (this.isDupe(species)) {
      this.t.log("info", `${this.t.name(species)} on ${label}: dupe of a line you already have — doesn't count, the next new one does.`);
      return;
    }
    this.t.snap.areas[key] = { label, species, level, status: "open" };
    this.encounterArea = key;
    this.t.log("info", `First encounter on ${label}: ${this.t.name(species)} Lv${level} — your only chance to catch here.`);
  }

  private monLabel(m: { species: number; nickname: string }): string {
    const sp = this.t.name(m.species);
    return m.nickname && m.nickname.toUpperCase() !== sp.toUpperCase() ? `${m.nickname} (${sp})` : sp;
  }
}
