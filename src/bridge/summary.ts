// Compact, name-resolved game state for an AI player. Mirrors what the human
// tracker shows.

import type { CurrentRun } from "../storage";
import type { GameState, MonState } from "../games/types";
import { areaKey, type Tracker } from "../tracker/tracker";
import { RULESETS, goalText } from "../rulesets";

/**
 * No coordinates in the dark, nor in a battle: the game lights battles (the dark flag reads as off
 * during one), so a battle's location would give away where a walk in the dark ended.
 */
export const hideCoords = (s: { dark?: boolean; battle: number }): boolean => !!s.dark || s.battle !== 0;

export function summarize(t: Tracker, state: GameState, run: CurrentRun, extra: { menuCursor: number }) {
  const G = t.game.data;
  // A slot the game is still filling in (the starter right after it's named) has no species
  // or level yet: it isn't a Pokémon yet, so leave it out.
  const s = state.party.some((m) => !m.species || !m.level) ? { ...state, party: state.party.filter((m) => m.species && m.level) } : state;
  // Before the game has a party, WRAM is uninitialized junk — don't report it.
  if (!s.started || !s.party.length) {
    return {
      run: { attempt: run.attempt, ruleset: run.mode, benchmark: RULESETS[run.mode].benchmark, game: t.data.version, outcome: t.snap.outcome },
      started: false,
      note: "No Pokémon in the party yet, so there's no party, lead, battle or bag data. On the title screen or intro, start_game starts the game; once you're walking around, action results show where you are.",
    };
  }
  const sp = (id: number) => t.data.species[id];
  const cap = t.levelCap(s);
  const describeMoves = (mon: MonState, defenderSpecies: number | null) =>
    mon.moves.map((id, i) => {
      if (!id) return null;
      const mv = t.data.moves[id];
      if (!mv) return { id };
      const def = defenderSpecies != null ? sp(defenderSpecies)?.types ?? [] : null;
      return {
        slot: i + 1,
        name: mv.name,
        type: mv.type,
        category: mv.power > 0 ? (G.specialTypes.has(mv.type) ? "special" : "physical") : "status",
        power: mv.power,
        accuracy: mv.accuracy,
        pp: mon.pp[i],
        maxPp: mv.pp,
        stab: (sp(mon.species)?.types ?? []).includes(mv.type) && mv.power > 0,
        effectiveness: def && mv.power > 0 ? G.effectiveness(mv.type, def) : undefined,
      };
    }).filter(Boolean);

  const inBattle = s.battle > 0;
  const active = inBattle && s.battleMon ? s.battleMon : s.party[0];
  const activeParty = s.party[inBattle ? s.activeIndex : 0] ?? s.party[0];
  const leadSp = active ? sp(active.species) : undefined;

  const lead = active && leadSp ? {
    species: leadSp.name,
    nickname: active.nickname,
    level: active.level,
    hp: active.hp,
    maxHp: active.maxHp,
    status: G.statusName(active.status),
    types: leadSp.types,
    baseStats: leadSp.base,
    bst: leadSp.bst,
    hmsLearnable: t.game.hmsLearnable(run.rom, leadSp),
    stats: active.stats,
    statStages: inBattle && s.battleMon ? stagesObj(s.battleMon.stages) : undefined,
    expToNextLevel: activeParty ? Math.max(0, G.expForLevel(leadSp.curve, activeParty.level + 1) - activeParty.exp) : undefined,
    moves: describeMoves(active, inBattle && s.enemy ? s.enemy.species : null),
    newMoves: leadSp.learnset.filter(([l]) => l > active.level).map(([l, m]) => `Lv${l} ${t.moveName(m)}`),
    evolutions: leadSp.evolutions.map((e) => ({
      method: e.method, level: e.level, item: e.item != null ? t.itemName(e.item) : undefined,
      into: t.name(e.to),
    })),
  } : null;

  let enemy = null;
  if (inBattle && s.enemy) {
    const e = s.enemy;
    const esp = sp(e.species);
    const myTypes = active ? sp(active.species)?.types ?? [] : [];
    enemy = {
      kind: s.battle === 1 ? "wild" : "trainer",
      species: esp?.name ?? `#${e.species}`,
      level: e.level,
      hpPercent: e.maxHp ? Math.round((e.hp / e.maxHp) * 100) : 0,
      status: G.statusName(e.status),
      types: esp?.types,
      statStages: stagesObj(e.stages),
      // What a player knows: the moves it has used, and how many Pokémon its trainer has by the Poké Balls.
      knownMoves: t.foeMoves.movesOf(e).map((id) => {
        const mv = t.data.moves[id];
        return { name: mv?.name, type: mv?.type, power: mv?.power, accuracy: mv?.accuracy, effectivenessVsYou: mv && mv.power > 0 ? G.effectiveness(mv.type, myTypes) : undefined };
      }),
      catchable: s.battle === 1 ? t.snap.areas[areaKey(s.mapConst)]?.status === "open" : undefined,
      hmsLearnable: s.battle === 1 ? t.game.hmsLearnable(run.rom, esp) : undefined,
      trainerPokemon: s.enemyTrainer ? { total: s.enemyTrainer.party.length, fainted: s.enemyTrainer.party.filter((m) => m.hp === 0).length } : undefined,
    };
  }

  const heals = t.healsInBag(s);
  return {
    run: {
      attempt: run.attempt, ruleset: run.mode, benchmark: RULESETS[run.mode].benchmark, game: t.data.version,
      goal: goalText(t.options),
      endsOnViolation: !!t.options.endOnViolation, loggedOnlyRules: t.options.lenientRules?.length ? t.options.lenientRules : undefined,
      outcome: t.snap.outcome,
    },
    started: s.started,
    location: { name: t.mapName(s), id: s.mapConst, ...(hideCoords(s) ? {} : { x: s.x, y: s.y }) },
    // With no Pokémon of your own a battle is a scene the game plays (Yellow's opening: the professor catching the partner Pokémon).
    battle: s.battle > 0 && !s.party.some((m) => m.species) ? "a scene (you have no Pokémon yet: advance_text plays it)"
      : s.battle === 1 ? "wild" : s.battle === 2 ? "trainer" : s.battle === -1 ? "lost" : "none",
    menuCursor: extra.menuCursor,
    lead,
    party: s.party.map((m, i) => ({ slot: i + 1, species: t.name(m.species), nickname: m.nickname, level: m.level, hp: m.hp, maxHp: m.maxHp, status: G.statusName(m.status),
      dead: t.isDead(m.uid), overLevelCap: cap ? m.level > cap.level : undefined,
      expToNextLevel: t.data.species[m.species] ? Math.max(0, G.expForLevel(t.data.species[m.species].curve, m.level + 1) - m.exp) : undefined })),
    nuzlocke: {
      levelCap: cap,
      thisArea: (() => {
        const a = t.snap.areas[areaKey(s.mapConst)];
        return a ? { ...a, species: t.name(a.species) } : thisAreaNote(t, s);
      })(),
      areas: Object.values(t.snap.areas).map((a) => `${a.label}: ${t.name(a.species)} ${a.status}`),
      dead: t.snap.dead.map((d) => `${d.nickname || t.name(d.species)} (${t.name(d.species)} Lv${d.level}, ${d.cause})`),
      hardLevelCaps: t.options.hardLevelCaps || undefined,
      firstRivalFree: t.options.firstRivalFree || undefined,
    },
    enemy,
    bag: s.bag.map((b) => ({ item: t.itemName(b.id), qty: b.qty })),
    healsInBag: { percentOfLeadHp: heals.pct, fullHeals: heals.full, statusHeals: heals.status, ppRestores: heals.pp, revives: heals.revives },
    badges: G.badges.filter((_, i) => s.badges & (1 << i)),
    money: s.money,
    pokemonCenterHeals: t.snap.pcHeals,
    catches: t.snap.catches.map((c) => ({ species: t.name(c.species), level: c.level, map: t.data.mapNames[c.map] || c.mapConst, gift: c.gift })),
    recentRuleEvents: t.snap.events.slice(-8).map((e) => `[${e.severity}] ${e.text}`),
  };
}

/** One short line per field, returned after every action. */
export function brief(t: Tracker, s: GameState) {
  const G = t.game.data;
  // Right as a battle starts the game hasn't sent its Pokémon out yet (its battle slot is still
  // empty): the one going out is the first in the party that can fight, so that one is shown.
  const battlerOut = s.battle > 0 && !!s.battleMon?.species && s.battleMon.maxHp > 0;
  const sendingOut = s.battle > 0 && !battlerOut;
  const leadIndex = battlerOut ? s.activeIndex : sendingOut ? Math.max(0, s.party.findIndex((m) => m.species && m.hp > 0)) : 0;
  const active = battlerOut ? s.battleMon : s.party[leadIndex];
  // The nickname is what battle messages say ("NOVA used CLAW!"), the species what it is.
  const nick = s.party[leadIndex]?.nickname;
  const mon = (m: { species: number; level: number; hp: number; maxHp: number; status: number } | undefined | null) =>
    // A slot the game is still filling in (max HP 0) has nothing true to say yet.
    m && m.species && m.maxHp > 0 ? `${nick && nick !== t.name(m.species) ? `${nick} (${t.name(m.species)})` : t.name(m.species)} Lv${m.level} ${m.hp}/${m.maxHp}HP${G.statusName(m.status) ? " " + G.statusName(m.status) : ""}` : null;
  // At 0 HP the foe in memory is the one that just fainted, or the last battle's while the next
  // isn't sent out yet: none is out, so it isn't named or rated.
  const foeOut = s.battle > 0 && !!s.enemy?.species && s.enemy.hp > 0;
  const enemy = s.battle > 0 && !foeOut ? "none out right now (fainted, or the next not sent out yet)"
    : foeOut && s.enemy
    ? `${s.battle === 1 ? "wild " : ""}${t.name(s.enemy.species)} Lv${s.enemy.level} ${s.enemy.maxHp ? Math.round((s.enemy.hp / s.enemy.maxHp) * 100) : 0}%HP${G.statusName(s.enemy.status) ? " " + G.statusName(s.enemy.status) : ""}`
    : null;
  // In battle: each move's multiplier against the foe and its PP, right on the status line.
  let moves = "";
  if (foeOut && s.enemy && active) {
    const def = t.data.species[s.enemy.species]?.types ?? [];
    moves = " | moves: " + active.moves
      .map((id, i) => {
        const mv = id ? t.data.moves[id] : undefined;
        if (!mv) return null;
        let e = mv.power > 0 ? G.effectiveness(mv.type, def) : null;
        if (e != null && G.fixedDamage(id, mv.power) && e > 0) e = 1; // fixed damage ignores type except immunity
        const tag = e == null ? "status" : e === 0 ? "no effect" : `${e}×`;
        return `${mv.name} ${tag} ${active.pp[i]}pp`;
      })
      .filter(Boolean)
      .join(", ");
  }
  const foeTypes = foeOut && s.enemy ? ` [${(t.data.species[s.enemy.species]?.types ?? []).join("/")}]` : "";
  // Before the first Pokémon the memory may not hold a map yet (title screen, intro): don't name one.
  const inWorld = s.started || !s.mapSize || (s.mapSize.w > 0 && s.mapSize.h > 0 && s.x < s.mapSize.w && s.y < s.mapSize.h);
  // The rest of the party with a status problem (poison drains HP while walking): what the party
  // menu shows a human at a glance, here only for those that need it.
  const others = s.party
    .filter((m, i) => i !== leadIndex && m.species && m.hp > 0 && G.statusName(m.status))
    .map((m) => `${m.nickname || t.name(m.species)} ${m.hp}/${m.maxHp}HP ${G.statusName(m.status)}`);
  // A dead Pokémon may ride in the party (only battling with it breaks the rule): outside battle,
  // results name the dead still in the party, the ones that can be sent out by mistake.
  // The game sends out the first party member with HP: when that one is dead (healed at a centre),
  // the next battle sends it out, a fact a player can't see from the list alone.
  const inParty = new Set(s.party.map((m) => m.uid));
  const firstOut = s.party.find((m) => m.species && m.hp > 0)?.uid;
  const dead = s.battle === 0 ? t.snap.dead.filter((d) => inParty.has(d.uid))
    .map((d) => `${d.nickname || t.name(d.species)}${d.uid === firstOut ? " (the game sends it out first)" : ""}`).join(", ") : "";
  return {
    location: inWorld ? `${t.mapName(s)} [${s.mapConst}]${hideCoords(s) ? "" : ` x${s.x} y${s.y}${s.facing ? ` facing ${s.facing}` : ""}`}` : "not in the game world yet (title screen or intro)",
    // With no Pokémon of your own a battle is a scene the game plays (Yellow's opening: the professor catching the partner Pokémon).
    battle: s.battle > 0 && !s.party.some((m) => m.species) ? "a scene (you have no Pokémon yet: advance_text plays it)"
      : s.battle === 1 ? "wild" : s.battle === 2 ? "trainer" : s.battle === -1 ? "lost" : "none",
    lead: mon(active) ? mon(active) + (sendingOut ? " (being sent out)" : "") + moves : null,
    // Outside battle the status line ends with the level cap ("cap Lv14"), the same on every result.
    cap: s.battle === 0 ? t.levelCap(s)?.level ?? null : null,
    // Once the League's battles have begun the cap holds only for Rare Candies: "cap Lv62" alone
    // read as broken when a Pokémon reached Lv63 against the last Elite Four member (2026-11-08).
    capCandiesOnly: s.battle === 0 && t.game.data.leagueUnderway(s.mapConst),
    others: others.length ? others.join(", ") : null,
    dead: dead || null,
    enemy: enemy ? enemy + foeTypes : null,
    outcome: t.snap.outcome ? `${t.snap.outcome.kind}: ${t.snap.outcome.detail}` : null,
    /** For the run log (not shown in tool results). */
    badges: popcount(s.badges),
    deaths: t.snap.dead.length,
    violations: t.snap.violations.length,
    candies: t.snap.candies,
    candiedToCap: t.snap.candiedToCap.length,
    overCap: t.snap.overCap.length,
    capViolations: t.snap.violations.filter((v) => v.rule === "level-cap").length,
    firstRival: t.snap.firstRival,
    /** The latest trainer battle (teams as it began, then how it went): the run log records each change. */
    lastFight: t.snap.trainerFights?.at(-1) ?? null,
    playTime: `${s.playTime.h}:${String(s.playTime.m).padStart(2, "0")}:${String(s.playTime.s).padStart(2, "0")}`,
  };
}

function popcount(n: number): number {
  let c = 0;
  for (; n; n &= n - 1) c++;
  return c;
}

/** The active battler's moves with PP. */
export function battleMoves(t: Tracker, s: GameState) {
  const mon = s.battle > 0 && s.battleMon ? s.battleMon : s.party[0];
  if (!mon) return [];
  return mon.moves
    .map((id, i) => ({ id, i }))
    .filter(({ id }) => id)
    .map(({ id, i }) => ({
      slot: i + 1,
      name: t.moveName(id),
      pp: mon.pp[i],
    }));
}

function stagesObj(st: number[]) {
  return { atk: st[0], def: st[1], spd: st[2], spc: st[3], acc: st[4], eva: st[5] };
}

/** An area whose encounter is unused: which grass Pokémon would count (not dupes). */
function thisAreaNote(t: Tracker, s: GameState): string {
  if (!s.grassMons.length) return "first encounter still available (no grass/cave encounters on this map)";
  const species = [...new Set(s.grassMons.map((m) => m.species))];
  const fresh = species.filter((id) => !t.isDupe(id)).map((id) => t.name(id));
  if (!fresh.length) return `every Pokémon here is a dupe (${species.map((id) => t.name(id)).join(", ")}) — nothing to catch, skip it`;
  return `first encounter still available — would count: ${fresh.join(", ")}`;
}
