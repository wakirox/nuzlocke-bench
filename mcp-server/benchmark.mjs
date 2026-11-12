// Benchmark presets: everything that must be the same for results to be comparable.
// NUZLOCKE_BENCHMARK=<preset id> locks the server to one: every run is that ruleset with those
// options, new_run can't change them, and the run log records the preset and harness version.
// Options go on top of a preset with "+": "hardcore-nuzlocke+hardcap" is the full game with hard
// level caps (scripts/bench-run.mjs: --preset hardcore-nuzlocke -o hardcap).
// max_calls is the run's tool-call budget (call-budget.mjs): the same for every model, set well
// past what the runs so far needed (the first badge took 139 to 402 calls; the last League rooms
// about 4,400), so it stops runs that are lost, not slow ones.

export const PRESETS = {
  /** The setup of the first full run: Hardcore Nuzlocke, infinite Rare Candies. */
  "hardcore-nuzlocke": { ruleset: "nuzlocke", rare_candies: true, hard_level_caps: false, first_rival_free: false, end_on_violation: true, lenient_rules: [], goal_badges: null, max_calls: 6000 },
  /** Short run: the same rules, won by the first badge. A cheap first rung (a full run costs hours). */
  "hardcore-nuzlocke-badge1": { ruleset: "nuzlocke", rare_candies: true, hard_level_caps: false, first_rival_free: false, end_on_violation: true, lenient_rules: [], goal_badges: 1, max_calls: 600 },
};

/** What each preset is, for --help. */
export const PRESET_ABOUT = {
  "hardcore-nuzlocke": "the full game: become Champion (6,000 tool calls)",
  "hardcore-nuzlocke-badge1": "short run, won by the first badge (600 tool calls; cheap; the runner's default)",
};

/** Options that go on top of any preset: what each turns on. */
export const OPTIONS = {
  hardcap: { about: "hard level caps: a Pokémon at the cap gains no more levels (easier)", set: { hard_level_caps: true } },
  firstrival: { about: "the first rival battle doesn't count: a faint there isn't a death (the usual exception)", set: { first_rival_free: true } },
  hints: { about: "a hint tool says the next story step (where to go, what starts it); each hint uses a tool call. Its own group, not a clean result", set: { hints: true } },
};

/**
 * Options npm run bench adds to every new run unless it's told no<option> (-o nohardcap): the usual
 * Nuzlocke reading. They stay in the run's preset id, so an id means the same conditions whatever the
 * defaults were when it ran.
 */
export const DEFAULT_OPTIONS = ["firstrival", "hardcap"];

/**
 * The official run (docs/scoring.md): the full game on Red with the default options, no hints. Only
 * runs under exactly these rules, from a new game, ended by the rules, make the leaderboard.
 */
export const OFFICIAL = { preset: "hardcore-nuzlocke+firstrival+hardcap", game: "red", since: "2026-11-08" };

/** The options asked for (-o), with the defaults added and each "no<option>" taken away. */
export function withDefaultOptions(given, defaults = DEFAULT_OPTIONS) {
  const asked = given.map((o) => o.trim()).filter(Boolean);
  const off = new Set();
  for (const o of asked.filter((o) => o.startsWith("no"))) {
    if (!OPTIONS[o.slice(2)]) throw new Error(`Unknown preset option "${o}" (known: ${Object.keys(OPTIONS).flatMap((k) => [k, `no${k}`]).join(", ")}).`);
    off.add(o.slice(2));
  }
  return [...defaults, ...asked.filter((o) => !o.startsWith("no"))].filter((o) => !off.has(o));
}

/** The presets and options, one per line, for the scripts' --help. */
export function presetHelp() {
  const pad = (s) => s.padEnd(26);
  return [
    "Presets:",
    ...Object.keys(PRESETS).map((id) => `  ${pad(id)}${PRESET_ABOUT[id] ?? ""}`),
    "",
    "Options on top of a preset (-o hardcap, or in an id: hardcore-nuzlocke+hardcap):",
    ...Object.entries(OPTIONS).map(([o, { about }]) => `  ${pad(o)}${about}`),
  ].join("\n");
}

/** A preset with options, as one id: the options in a fixed order, so equal conditions share an id. */
export function presetId(base, options = []) {
  const [name, ...already] = String(base).split("+");
  const all = [...new Set([...already, ...options].map((o) => o.trim()).filter(Boolean))].sort();
  return [name, ...all].join("+");
}

export function benchmarkPreset(id) {
  if (!id) return null;
  const [name, ...options] = presetId(id).split("+");
  const preset = PRESETS[name];
  if (!preset) throw new Error(`Unknown benchmark preset "${name}" (known: ${Object.keys(PRESETS).join(", ")}).`);
  const out = { id: presetId(id), ...preset };
  for (const o of options) {
    const change = OPTIONS[o];
    if (!change) throw new Error(`Unknown preset option "${o}" (known: ${Object.keys(OPTIONS).join(", ")}).`);
    Object.assign(out, change.set);
  }
  return out;
}

/**
 * new_run's parameters under a preset: the preset's ruleset and options, refusing any the
 * caller tried to set differently (so a run can't quietly leave the benchmark's conditions).
 */
export function applyPreset(preset, params) {
  if (!preset) return params;
  const fixed = {
    mode: preset.ruleset, rare_candies: preset.rare_candies,
    hard_level_caps: preset.hard_level_caps, first_rival_free: preset.first_rival_free, end_on_violation: preset.end_on_violation, lenient_rules: preset.lenient_rules, goal_badges: preset.goal_badges,
  };
  for (const [k, v] of Object.entries(fixed)) {
    if (params[k] != null && JSON.stringify(params[k]) !== JSON.stringify(v)) {
      throw new Error(`The benchmark preset "${preset.id}" fixes ${k} = ${v}.`);
    }
  }
  return { ...params, ...fixed };
}
