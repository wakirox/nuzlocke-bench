import type { SpeciesData } from "../rom/types";
import type { BattleMonState, GameState, MonState } from "../games/types";
import { areaKey, type Tracker } from "../tracker/tracker";

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const typeChip = (t: string) => `<span class="type t-${t.toLowerCase()}">${t.slice(0, 3)}</span>`;

function hpBar(hp: number, max: number): string {
  const pct = max ? Math.max(0, Math.min(100, (hp / max) * 100)) : 0;
  const cls = pct > 50 ? "good" : pct > 20 ? "mid" : "low";
  return `<div class="hpbar"><div class="hpfill ${cls}" style="width:${pct.toFixed(1)}%"></div></div>`;
}

function stage(n: number): string {
  if (!n) return "";
  return `<span class="stage ${n > 0 ? "up" : "down"}">${n > 0 ? "+" : ""}${n}</span>`;
}

function baseStats(sp: SpeciesData, stages?: number[]): string {
  const rows: [string, number, number | undefined][] = [
    ["HP", sp.base.hp, undefined], ["ATK", sp.base.atk, stages?.[0]], ["DEF", sp.base.def, stages?.[1]],
    ["SPD", sp.base.spd, stages?.[2]], ["SPC", sp.base.spc, stages?.[3]],
  ];
  return `<div class="stats">${rows
    .map(([k, v, st]) => `<div><span class="k">${k}</span><span class="v">${v}</span>${st ? stage(st) : ""}</div>`)
    .join("")}<div><span class="k">BST</span><span class="v">${sp.bst}</span></div></div>`;
}

/** Base and actual stats in one table: the stat names once, a row each for base and actual values. */
function statTable(sp: SpeciesData, mon: MonState, stages?: number[]): string {
  const keys = ["hp", "atk", "def", "spd", "spc"] as const;
  const actual = [mon.maxHp, mon.stats.atk, mon.stats.def, mon.stats.spd, mon.stats.spc];
  return `<table class="stat-table">
    <tr><th></th>${keys.map((k) => `<th>${k.toUpperCase()}</th>`).join("")}<th>BST</th></tr>
    <tr><th>Base</th>${keys.map((k) => `<td>${sp.base[k]}</td>`).join("")}<td>${sp.bst}</td></tr>
    <tr><th>Stat</th>${actual.map((v, i) => `<td class="v">${v}${i && stages?.[i - 1] ? stage(stages[i - 1]) : ""}</td>`).join("")}<td></td></tr>
  </table>`;
}

/** How/when a species evolves, and into what. */
function evoText(t: Tracker, sp: SpeciesData): string {
  if (!sp.evolutions.length) return `<span class="muted">Does not evolve</span>`;
  return [...new Set(sp.evolutions.map((e) => {
    const into = esc(t.name(e.to));
    if (e.method === "level") return `Lv ${e.level} → ${into}`;
    if (e.method === "stone") return `${esc(t.itemName(e.item ?? 0))} → ${into}`;
    if (e.method === "trade") return `Trade → ${into}`;
    return `→ ${into}`;
  }))].join(" · ");
}

function learnsetLine(sp: SpeciesData, level: number, t: Tracker, showNames: boolean): string {
  const upcoming = sp.learnset.filter(([l]) => l > 1);
  if (!upcoming.length) return `<span class="muted">No level-up moves</span>`;
  return upcoming
    .map(([l, m]) => {
      const learned = l <= level;
      const label = showNames ? `${l} ${esc(t.moveName(m))}` : `${l}`;
      return `<span class="lv ${learned ? "done" : ""}">${label}</span>`;
    })
    .join(" ");
}

function movesTable(t: Tracker, mon: MonState, defender: BattleMonState | null, userSpecies: number): string {
  const G = t.game.data;
  const userTypes = t.data.species[userSpecies]?.types ?? [];
  const defTypes = defender ? t.data.species[defender.species]?.types ?? [] : null;
  const rows = mon.moves
    .map((id, i) => {
      if (!id) return "";
      const mv = t.data.moves[id];
      if (!mv) return `<tr><td colspan="5">Move ${id}</td></tr>`;
      const stab = userTypes.includes(mv.type) && mv.power > 0;
      // Against the current foe: every damaging move gets a multiplier pill.
      // Fixed-damage moves ignore type except immunity (the game's own list: GameData.fixedDamage).
      let eff = "";
      let rowEff = "";
      if (defTypes && mv.power > 0) {
        let e = G.effectiveness(mv.type, defTypes);
        if (G.fixedDamage(mv.id, mv.power) && e > 0) e = 1;
        const label = e === 0 ? "No effect" : e >= 4 ? "4×" : e >= 2 ? "2×" : e <= 0.25 ? "¼×" : e < 1 ? "½×" : "1×";
        const cls = e === 0 ? "immune" : e > 1 ? "se" : e < 1 ? "nve" : "neutral";
        const title = e === 0 ? "doesn't affect the foe" : e > 1 ? "super effective" : e < 1 ? "not very effective" : "normal damage";
        eff = `<span class="eff ${cls}" title="${title}">${label}</span>`;
        rowEff = ` eff-row-${cls}`;
      }
      const cat = mv.power > 0 ? (G.specialTypes.has(mv.type) ? "S" : "P") : "–";
      return `<tr class="${rowEff.trim()}">
        <td>${esc(mv.name)}</td>
        <td>${typeChip(mv.type)}</td>
        <td class="num">${mv.power > 1 ? mv.power : "—"}${stab ? "<sup>S</sup>" : ""}</td>
        <td class="vs">${eff || `<span class="muted">–</span>`}</td>
        <td class="num">${mv.accuracy}</td>
        <td class="num">${mon.pp[i]}/${mv.pp}</td>
        <td class="cat">${cat}</td></tr>`;
    })
    .join("");
  // The column is there out of battle too (empty), so the card keeps its size when a fight starts.
  const vs = `<th title="Effectiveness against the current foe (in battle)">vs</th>`;
  return `<table class="moves"><thead><tr><th>Move</th><th>Type</th><th>Pow</th>${vs}<th>Acc</th><th>PP</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
}

/**
 * The party: one detailed card (the Pokémon fighting in battle, else the lead, or
 * whichever tile the player clicked) beside a column of small tiles, one per slot.
 */
export function renderParty(t: Tracker, s: GameState, selected: string | null): string {
  if (!s.started || !s.party.length) {
    return `<section class="card"><h3>Your Pokémon</h3><p class="muted">Start the game and get your first Pokémon.</p></section>`;
  }
  // The battle struct is empty for a moment at battle start — fall back to the party lead.
  const inBattle = s.battle > 0 && !!s.battleMon?.species;
  const active = inBattle ? s.activeIndex : 0;
  let shown = s.party.findIndex((m) => m.uid === selected);
  if (shown < 0) shown = active;
  if (!s.party[shown]) shown = 0; // a battle index read mid-transition can point past the party
  const fighting = inBattle && shown === active;
  const main = monCard(t, s, fighting ? s.battleMon! : s.party[shown], s.party[shown], fighting);
  const cap = t.levelCap(s);
  const tiles = s.party.map((m, i) => {
    const sp = t.data.species[m.species];
    const dead = t.isDead(m.uid);
    const over = !!cap && m.level > cap.level && !dead;
    const name = m.nickname || sp?.name || "?";
    const hp = inBattle && i === active && s.battleMon ? s.battleMon : m;
    const cls = ["tile", i === shown ? "shown" : "", inBattle && i === active ? "fighting" : "", dead ? "dead" : hp.hp === 0 ? "fainted" : "", over ? "over" : ""].join(" ");
    const title = `${sp?.name ?? ""}${over ? ` — over the level cap (Lv${cap!.level})` : ""}`;
    return `<button class="${cls.replace(/\s+/g, " ").trim()}" data-uid="${esc(m.uid)}" title="${esc(title)}">
      <span class="tname">${esc(name)}</span> <span class="lvl">${over ? "▲ " : ""}Lv ${m.level}</span>${dead ? " ☠" : ""}
      <span class="ttypes">${(sp?.types ?? []).map(typeChip).join("")}</span>
      ${hpBar(hp.hp, hp.maxHp)}
    </button>`;
  });
  return `<div class="party">${main}<div class="tiles">${tiles.join("")}</div></div>`;
}

/** The slot shown by default (the fighter in battle, else the lead), to drop the player's pick when it changes. */
export function partyFocus(s: GameState): string {
  const inBattle = s.battle > 0 && !!s.battleMon?.species;
  return s.party[inBattle ? s.activeIndex : 0]?.uid ?? "";
}

function monCard(t: Tracker, s: GameState, mon: MonState, partyMon: MonState, fighting: boolean): string {
  const G = t.game.data;
  const sp = t.data.species[mon.species];
  if (!sp) return `<section class="card"><p class="muted">Unknown species ${mon.species}</p></section>`;
  const status = G.statusName(mon.status);
  const dead = t.isDead(partyMon.uid);
  const cap = t.levelCap(s);
  const overCap = !!cap && partyMon.level > cap.level && !dead;
  const nick = partyMon.nickname && partyMon.nickname.toUpperCase() !== sp.name.toUpperCase() ? partyMon.nickname : "";
  const name = nick ? `${esc(nick)} <span class="muted">${esc(sp.name)}</span>` : esc(sp.name);
  const badges = `${sp.types.map(typeChip).join("")}${status ? `<span class="badge warn">${status}</span>` : ""}` +
    `${dead ? `<span class="badge bad">☠ DEAD</span>` : mon.hp === 0 ? `<span class="badge bad">FAINTED</span>` : ""}` +
    `${overCap ? `<span class="badge warn">OVER CAP (Lv${cap!.level})</span>` : ""}`;
  // EXP through the current level (party data: the battle struct has no EXP).
  const levelExp = G.expForLevel(sp.curve, partyMon.level);
  const nextExp = G.expForLevel(sp.curve, partyMon.level + 1);
  const toNext = partyMon.level >= 100 ? 0 : Math.max(0, nextExp - partyMon.exp);
  const expPct = partyMon.level >= 100 || nextExp <= levelExp ? 100
    : Math.max(0, Math.min(100, ((partyMon.exp - levelExp) / (nextExp - levelExp)) * 100));
  const stages = fighting ? (mon as BattleMonState).stages : undefined;
  // In battle: a green edge, not a badge (a badge can wrap the title row and resize the card).
  return `<section class="card mon lead${dead ? " dead" : ""}${fighting ? " fighting" : ""}"${fighting ? ` title="In battle"` : ""}>
    <div class="title-row">
      <h3>${name} <span class="lvl">Lv ${mon.level}</span></h3>
      <div>${badges}</div>
    </div>
    <div class="hp-row">${hpBar(mon.hp, mon.maxHp)}<span class="num">${mon.hp}/${mon.maxHp}</span></div>
    <div class="exp-row"><div class="expbar"><div class="expfill" style="width:${expPct.toFixed(1)}%"></div></div><span class="num">${partyMon.level >= 100 ? "MAX" : `${toNext} EXP to Lv ${partyMon.level + 1}`}</span></div>
    ${statTable(sp, mon, stages)}
    ${movesTable(t, mon, fighting ? s.enemy : null, mon.species)}
    <div class="sub"><span class="k">Learns</span> ${learnsetLine(sp, mon.level, t, true)}</div>
    <div class="sub"><span class="k">Evolves</span> ${evoText(t, sp)}</div>
  </section>`;
}

export function renderEnemy(t: Tracker, s: GameState): string {
  const G = t.game.data;
  if (s.battle <= 0 || !s.enemy) return "";
  const e = s.enemy;
  const sp = t.data.species[e.species];
  if (!sp) return "";
  const lead = s.party[0];
  const moves = e.moves.filter(Boolean).map((id) => {
    const mv = t.data.moves[id];
    if (!mv) return "";
    const defTypes = lead ? t.data.species[(s.battleMon ?? lead).species]?.types ?? [] : [];
    const eff = mv.power > 0 ? G.effectiveness(mv.type, defTypes) : 1;
    const effLabel = eff === 0 ? "✕" : eff > 1 ? `${eff}×` : eff < 1 ? (eff <= 0.25 ? "¼" : "½") : "";
    return `<li>${typeChip(mv.type)} ${esc(mv.name)} <span class="muted">${mv.power > 1 ? mv.power : "—"}/${mv.accuracy}</span>${effLabel ? ` <span class="eff ${eff > 1 ? "se" : "nve"}">${effLabel}</span>` : ""}</li>`;
  });
  const catchable = encounterBadge(t, s, e.species);
  const trainer = s.enemyTrainer
    ? `<div class="balls">${s.enemyTrainer.party.map((m) => `<span class="ball ${m.hp === 0 ? "fainted" : ""}" title="${esc(t.name(m.species))} Lv${m.level}"></span>`).join("")}</div>` +
      `<div class="muted team">${s.enemyTrainer.party.map((m) => `<span class="${m.hp === 0 ? "fainted" : ""}">${esc(t.name(m.species))} ${m.level}</span>`).join(" · ")}</div>`
    : "";
  const pct = e.maxHp ? Math.round((e.hp / e.maxHp) * 100) : 0;
  const status = G.statusName(e.status);

  return `<section class="card enemy">
    <div class="title-row">
      <h3>${s.battle === 1 ? "Wild " : ""}${esc(sp.name)} <span class="lvl">Lv ${e.level}</span></h3>
      <div>${sp.types.map(typeChip).join("")}${status ? `<span class="badge warn">${status}</span>` : ""}</div>
    </div>
    ${trainer}
    <div class="hp-row">${hpBar(e.hp, e.maxHp)}<span class="num">${pct}%</span></div>
    ${baseStats(sp, e.stages)}
    <ul class="enemy-moves">${moves.join("")}</ul>
    <div class="sub"><span class="k">Learns</span> ${learnsetLine(sp, e.level, t, false)}</div>
    <div class="sub"><span class="k">Evolves</span> ${evoText(t, sp)}</div>
    <div class="sub">${catchable}</div>
  </section>`;
}

/** Gen 1 wild slot odds out of 256, slots 1-10 of a map's table (pokered: WildMonEncounterSlotChances). */
const SLOT_ODDS = [51, 51, 39, 25, 25, 25, 13, 13, 11, 3];

/**
 * The current map's wild Pokémon (grass/cave table): species, levels and how likely each is per
 * encounter, plus the chance of an encounter per step.
 */
export function renderEncounters(t: Tracker, s: GameState): string {
  if (!s.started || !s.grassMons.length || s.grassRate === 0) return "";
  const rows = new Map<number, { odds: number; min: number; max: number }>();
  s.grassMons.forEach((m, i) => {
    if (!m.species) return;
    const r = rows.get(m.species) ?? { odds: 0, min: m.level, max: m.level };
    r.odds += SLOT_ODDS[i] ?? 0;
    r.min = Math.min(r.min, m.level);
    r.max = Math.max(r.max, m.level);
    rows.set(m.species, r);
  });
  const area = t.snap.areas[areaKey(s.mapConst)];
  const pct = (n: number) => `${((n / 256) * 100).toFixed(n < 13 ? 1 : 0)}%`;
  const list = [...rows.entries()].sort((a, b) => b[1].odds - a[1].odds).map(([species, r]) => {
    const name = esc(t.name(species));
    const types = (t.data.species[species]?.types ?? []).map(typeChip).join("");
    let tag = "";
    if (area) tag = area.species === species && area.status === "caught" ? `<span class="badge ok">caught</span>` : "";
    else tag = t.isDupe(species) ? `<span class="badge warn">dupe</span>` : `<span class="badge ok">counts</span>`;
    const lv = r.min === r.max ? `Lv ${r.min}` : `Lv ${r.min}–${r.max}`;
    return `<tr><td>${name} ${types}</td><td class="muted">${lv}</td><td class="num">${pct(r.odds)}</td><td>${tag}</td></tr>`;
  });
  const status = area
    ? `<span class="badge ${area.status === "caught" ? "ok" : "bad"}">${area.status === "caught" ? `caught ${esc(t.name(area.species))}` : area.status === "missed" ? "encounter spent" : "encounter in progress"}</span>`
    : `<span class="badge ok">encounter available</span>`;
  return `<section class="card encounters">
    <div class="title-row"><h3>Wild Pokémon <span class="muted">${esc(t.mapName(s))}</span></h3><div>${status}</div></div>
    <table class="enc"><tbody>${list.join("")}</tbody></table>
    <div class="sub muted">Encounter chance per step in grass/caves: ${pct(s.grassRate)} · water and fishing not listed</div>
  </section>`;
}

/** Wild battle: may this one be caught (the area's first encounter)? */
function encounterBadge(t: Tracker, s: GameState, species: number): string {
  if (s.battle !== 1) return "";
  const area = t.snap.areas[areaKey(s.mapConst)];
  if (area?.status === "open" && area.species === species) return `<span class="badge ok">First encounter — catch it</span>`;
  if (area) return `<span class="badge bad">Area spent — no catch</span>`;
  if (t.isDupe(species)) return `<span class="badge warn">Dupe — doesn't count</span>`;
  const balls = s.bag.some((it) => [0x01, 0x02, 0x03, 0x04, 0x08].includes(it.id) && it.qty > 0);
  return balls ? "" : `<span class="badge warn">Doesn't count (no Poké Balls)</span>`;
}

/** Milliseconds as h:mm:ss. */
export function realTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function renderNuzlocke(t: Tracker, s: GameState, usage: string | null): string {
  const G = t.game.data;
  const cap = t.levelCap(s);
  const time = `${s.playTime.h}:${String(s.playTime.m).padStart(2, "0")}:${String(s.playTime.s).padStart(2, "0")}`;
  const badges = G.badges.map((b, i) => `<span class="badge-icon ${s.badges & (1 << i) ? "have" : ""}" title="${b}">${i + 1}</span>`).join("");
  const here = t.snap.areas[areaKey(s.mapConst)];
  const hereText = here
    ? here.status === "caught" ? `caught ${esc(t.name(here.species))}` : here.status === "missed" ? `missed ${esc(t.name(here.species))}` : `${esc(t.name(here.species))} — catch it!`
    : "encounter still available";
  const areas = Object.values(t.snap.areas);
  const icon = { caught: "●", missed: "✕", open: "…" } as const;
  const overCap = cap ? s.party.filter((m) => m.level > cap.level && !t.isDead(m.uid)) : [];
  return `<section class="card run nuzlocke">
    <div class="grid2">
      <div><span class="k">Location</span> ${esc(t.mapName(s))}</div>
      <div><span class="k">Time</span> ${time}${t.snap.realMs != null ? ` <span class="muted" title="Real time with the run open (the game clock only runs while the game does)">· real <span class="real-time">${realTime(t.snap.realMs)}</span></span>` : ""}</div>
      <div><span class="k">Level cap</span> ${cap ? `<b>Lv ${cap.level}</b> <span class="muted">(${esc(cap.who)})</span>` : "—"}</div>
      <div><span class="k">Money</span> ₽${s.money}</div>
      <div><span class="k">Alive</span> ${s.party.filter((m) => !t.isDead(m.uid)).length} in party · ${s.boxCount} boxed</div>
      <div><span class="k">Trainers</span> ${t.snap.trainersBeaten}</div>
      ${usage ? `<div class="span2" title="What the model has used so far: tokens (input, output and cache) and turns (its replies)"><span class="k">Model</span> <span class="model-usage">${esc(usage)}</span></div>` : ""}
    </div>
    <div class="badges">${badges}</div>
    ${overCap.length ? `<div class="sub bad">Over the cap: ${overCap.map((m) => `${esc(t.name(m.species))} Lv${m.level}`).join(", ")}</div>` : ""}
    <div class="sub"><span class="k">Here</span> ${hereText}</div>
    ${areas.length ? `<div class="sub"><span class="k">Areas</span> ${areas.map((a) =>
      `<span class="nuz-area ${a.status}" title="${esc(a.label)}: ${esc(t.name(a.species))} Lv${a.level}">${icon[a.status]} ${esc(a.label)}</span>`).join(" ")}</div>` : ""}
    ${t.snap.dead.length ? `<div class="sub"><span class="k">Graveyard</span> ${t.snap.dead.map((d) =>
      `<span class="grave" title="${esc(d.cause)}">☠ ${esc(d.nickname || t.name(d.species))} Lv${d.level}</span>`).join(" ")}</div>` : ""}
  </section>`;
}

/** `usage`: what the model has used so far ("12.3M tokens · 622 turns"), when a benchmark run is playing. */
export function renderRun(t: Tracker, s: GameState, usage: string | null = null): string {
  if (!s.started) return "";
  return renderNuzlocke(t, s, usage);
}

/** `times`: show when each event happened (off in replays, where the clock time is the viewer's). */
export function renderEvents(t: Tracker, times = true, max = 40): string {
  const evs = t.snap.events.slice(-max).reverse();
  if (!evs.length) return `<p class="muted">No events yet. Rule checks appear here.</p>`;
  return `<ul class="events">${evs
    .map((e) => `<li class="ev-${e.severity}">${times ? `<time>${new Date(e.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>` : ""}${esc(e.text)}</li>`)
    .join("")}</ul>`;
}
