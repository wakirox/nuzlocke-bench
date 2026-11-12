# Benchmark

Presets, the tool-call budget, the report, running it with Claude, and what counts as an official result. [Back to the README](../README.md).

## Benchmark

A benchmark preset fixes everything that must match for results to be comparable. With
`NUZLOCKE_BENCHMARK=<preset>` every run is that ruleset with those options, the server starts it, and the model gets one attempt (no `new_run`)
and a fixed number of tool calls, and the run log starts with the preset and the harness that ran it: the package version, the
git commit, any tracked files changed since that commit, and the page served (`dist/`, built separately, so it can be older
than the code): the commit it was built from (`dist/build-info.json`, written by `npm run build`) and a hash of it.

| Preset | Ruleset | Goal | Tool calls | Rare Candies | Violation ends the run (every rule) |
|---|---|---|---|---|---|
| `hardcore-nuzlocke` | Hardcore Nuzlocke | Champion | 6,000 | infinite, after the first rival battle | yes |
| `hardcore-nuzlocke-badge1` | Hardcore Nuzlocke | first badge | 600 | infinite, after the first rival battle | yes |

**Tool calls** are the run's budget, the same for every model: the call that uses the last one ends the run (outcome
`out of calls`). Every call counts, reading state as much as acting (a `do` with several steps is one call); `report_issue` doesn't. The model is told the budget (`get_rules`; `get_state` shows `run.toolCalls`). Calls, not money or
time, because cost measures the price of a model and time the hardware, so a cheap model would get more play for the same
dollars. The budgets sit well past what runs have needed so far (the first badge took 139 to 402 calls, the last League
rooms about 4,400), so they stop runs that are lost, not slow ones. The count is kept with the run's saves
(`tool-calls.txt`), so a run continued with `--resume` goes on counting.

Options go on top of any preset, joined with `+` in its id: `NUZLOCKE_BENCHMARK=hardcore-nuzlocke+hardcap`. The
run is recorded under that id, so the report keeps different conditions apart (`--preset hardcore-nuzlocke+hardcap`).
`npm run bench` turns both options on unless told otherwise, so `--preset hardcore-nuzlocke` runs as
`hardcore-nuzlocke+firstrival+hardcap`; `-o nohardcap` or `-o nofirstrival` turns one off (repeat `-o`, or
`-o nohardcap,nofirstrival` for the strict rules). `NUZLOCKE_BENCHMARK` adds nothing: its id is the conditions.

| Option | Turns on (on by default in `npm run bench`) |
|---|---|
| `hardcap` | Hard level caps: a Pokémon at the cap gains no more levels (easier) |
| `firstrival` | The first rival battle doesn't count: a Pokémon that faints in it isn't dead, and losing it doesn't end the run (easier) |

`hardcore-nuzlocke-badge1` is the cheap rung: the same rules, but winning the first badge wins the run
(starter, first encounters, the first forest, the first gym). A full run takes hours; this one is a small
fraction of the calls, so it's the one to run often and across models.

While tuning the harness, a Hardcore Nuzlocke run can set some rules to "logged only" at the start
(setup: *Which rules disqualify*; MCP: `new_run` `lenient_rules`): their violations are recorded but don't
end the run. Rule ids: `first-encounter`, `dead-pokemon`, `level-cap`, `items-in-battle`, `nickname`,
`battle-style`. Benchmark presets allow none.

`npm run bench:report` turns the run logs into a table, one row per attempt (a session can hold several:
each `new_run` starts one): who played (model and effort), the harness (marked when it differs from its commit), outcome, badges, deaths, violations, in-game time,
tool calls, errors, nudges, tokens and model turns, real time, result size and most used tools — plus badge splits (in-game
time, tool call and real time of each badge). Model, nudges and tokens come from runs played with
`npm run bench` (below); a model that stopped playing shows as "gave up". A **Rare Candies and level caps**
table has the candies used, Pokémon candied to exactly the cap, Pokémon that went over the cap (by candy
or in battle) and level-cap violations (runs logged before these were recorded show none).

An **objectives** table follows the story step by step (badges, the first cave, the cottage past the
bridge and its task, the ship, the tower, the company building, the last cave, each League room, the
Champion) and shows, per model and preset, how many runs reached each step and where runs stopped. A step
counts when its badge is won or the player first stands on a map only reachable after it; a run continued
in another folder (`--resume`) counts once.

A second table, **how they played**, has what the outcome alone hides: the starter, catches, maps seen and
the furthest reached, the longest stretch of calls without reaching a new map (lost in a cave, stuck on a
blocker), the model's route book (routes saved / `go_to` trips), notes written, screenshots and Pokémon
Center heals. `-- --details` adds each run's catches, deaths with their causes, and the model's own notes.
`-- --preset hardcore-nuzlocke` keeps one preset's runs. In-game time only runs while a tool acts; real
time also counts the model's thinking between calls.

## Running the benchmark

`npm run bench` plays one run with Claude Code (`claude -p`), or straight through a model's API (`--api`), and records it (`npm run bench -- --help` lists every
option, preset and preset option; `bench:report` and `verify` take `--help` too):

```sh
npm run bench -- --rom path/to/red.gb --model claude-haiku-5-5 --effort medium \
  [--preset hardcore-nuzlocke-badge1] [-o nohardcap,nofirstrival] [--max-tokens 500] [--nudges 10] [--port 7880] [--headed] [--watch] [--playtest] [--no-report] [--grid wide]

# any other model, through its API (no Claude Code, no system prompt):
npm run bench -- --rom path/to/red.gb --model qwen3.8:27b --api openai [--base-url http://127.0.0.1:11434/v1] [--compact-window 100]
```

Crystal is an **experimental** game: `--rom` with a Crystal ROM plays, and says so when it starts, but the run
records `experimental: true` and is left out of the dashboard and the published results. Its milestones
and scoring aren't settled yet.

- **`--api openai|anthropic`**: the model plays through its API instead of Claude Code: OpenAI-style chat completions
  (Ollama, vLLM, OpenRouter…) or Anthropic's Messages API. It reads only the prompt and the game's tools, with no
  system prompt; nudges, the token stop, the transcript and `agent.json` are the same, and the conversation is
  compacted with the model's own summary at `--compact-window` (thousands of tokens; set it below the server's context
  limit). Key: `BENCH_API_KEY` (not needed for Ollama). Reports group these runs apart ("via API").

- **The prompt** says what to do, not how: read the rules with `get_rules`, then play until the run is over;
  nobody will answer questions.
- **Only the game's tools**: no shell, no files, no other MCP servers, no settings. Each run starts in its
  own empty folder with auto-memory off and the session not saved, so nothing from the repo or an earlier
  run can reach it, and its own saves folder (routes and notes start empty).
- **Nudges**: when the model ends its turn before the run is over, the only answer is "The run isn't over.
  Keep playing." — never a hint. Three nudges in a row answered without a single tool call: it **gave up**,
  and the run is over. At most `--nudges` (10) in all.
- **Tokens**: `--max-tokens` (default 500 million: input, cache and output) is a safety stop, not part of the benchmark,
  and the model isn't told about it: the preset's tool calls are what end a run, so a run stopped by tokens first isn't
  a finished result (it shows as unfinished). Each run records the tokens it used and its model turns (`agent.json`).
- **Output**: one folder per run, `runs/<id>/`, with `run-log.jsonl` (the run log), `transcript.jsonl` (the
  whole session), `agent.json` (model, effort, preset, nudges, tokens and model turns, why it stopped, the Claude Code version and
  a hash of the opening prompt), `saves/` (the game's saves and recordings, small; keep it to check the run later)
  and `summary.json`: the report's rows for the run (outcome, milestones, catches, deaths, tokens, score inputs), written
  as the run ends. The report and the dashboard read it instead of the run log and transcript while it's newer than
  the run log; `npm run bench:summary` writes it for older runs or after a change to what it holds.
- **Map grids** have one space between squares and a two-row x header (tens over ones): a square stays its own
  token at ~40% fewer tokens than two spaces. Three Haiku pairs showed no difference in navigation (2026-10-15);
  `--grid wide` gives the old two-space grid.
- **Maps on request** (since 2026-11-07): move results don't carry the area's map; `get_map` shows it, and so does a
  moving tool (`walk`, `walk_to`, `exit_map`, `travel`, `go_to`) given `show_map: true`, so the model asks when it needs
  one. An A/B (6 Haiku runs per side) found no difference in play at ~10% fewer tokens. Runs from before that showed the
  map after every move (reports label the few that did it on purpose "maps after every move").
- **`-o hints`** (a separate group, not a clean result): a `hint` tool says the next story step (where to go and what
  starts it, never how to play it), and the first turn mentions it. The one exception is the last step before the
  elite rooms: stock up on healing items at the league's shop, since the elite battles come back to back. Each hint
  uses a tool call. Hint runs also see how effective each move is against the foe.
- **Move effectiveness** (since 2026-11-07) is shown only in the hints group: it's the answer to a battle's main
  choice, which the game itself only shows after the hit ("super effective", which every run still sees). An A/B
  (Haiku and Sonnet, 2026-11-07) found no harm in hiding it. `--effectiveness on|off` overrides; every run records
  which (`agent.json`), and reports label main-benchmark runs that had it shown.
- **`report_issue`** is on in every run: the first turn asks the model to report a tool that lets it down (a result
  that doesn't match the screen, a wrong-looking map, an error it doesn't understand); it doesn't use up a tool call.
  `--no-report` leaves it out.
- **`--playtest`** (to test the tools, not the model): the model is asked to look out for such problems and report
  them as it plays. Playtests are marked in the report and aren't benchmark results.
- **`npm run bench:friction`** reads every recorded run and lists the spots where the tools may have let the model
  down: walks stopped by something in the way, errors, empty results, screenshots, the same call over and over,
  maps where one run took far longer than the others, and playtest reports. The same spot across several runs
  points at the tools; one run alone, at the model.
- **Context window**: runs use the model's standard window by default (Claude Code compacts the conversation when
  it fills, and the model carries on from the summary and its notes; that's part of the test). A `[1m]` suffix on
  `--model` gives a 1M window: fewer compactions, but every call re-reads the whole context, so a long run processes
  several times more tokens. The report's "How they played" table shows each run's compactions (after which call) and
  its peak context against the window it ran with (from the CLI's own record, e.g. "966k of 1M").
- Runs are independent: give parallel runs different `--port`s. Almost all of a run's time is the model
  thinking between calls, so several at once is the way to go faster.

Needs `npm run build`, Playwright (see [headless runs](mcp.md#headless-runs-no-browser-tab)) and the `claude` CLI (`CLAUDE_BIN` to choose one).

## Official results

The game server can only see the calls made to it: it can't tell what else the agent driving it has (a web
search, a walkthrough in its prompt, a person helping). So a result run anywhere else, with any other agent,
can't be checked for that, and the server being open doesn't change it. The rule is therefore about who runs:

- **Official results are runs we make ourselves**, with `npm run bench` as it is in this repository: no tools but
  the game's, no other MCP servers, no settings, no memory, an empty working folder, and a prompt that only says
  to read the rules and play. The harness is a commit: no uncommitted changes, and the page built from that same
  commit (the report marks a run otherwise, e.g. `0.1.0@70c0619 (page built from 296b6da)`). Each run's `transcript.jsonl` proves it: its first event lists every tool the model
  had (all `mcp__nuzlocke-bench__…`), and every call it made is in it.
- **Anything else is self-reported**: a different runner, agent, prompt or set of tools. Such runs may be shown,
  marked as self-reported, never next to official ones as if comparable. A submitted run comes with its folder
  (transcript, run log, `agent.json`, saves); `npm run verify` checks that its recording is a real game played
  with buttons and the harness's own changes only, but nothing can prove how its decisions were made.
- What a model already knows is part of it: Red is among the most written-about games there are, and a model
  that has read its walkthroughs in training plays with that knowledge (where a late key item is, which item
  wakes the sleeping road block). The full game measures knowledge and play together.
