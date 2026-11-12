# Nuzlocke Bench

A benchmark for language models: can a model beat Pokémon Red under Hardcore Nuzlocke rules, where a
fainted Pokémon is gone for good and a wipe ends the run? Gen 1 today: **Pokémon Red, Blue and Yellow**,
played exactly as they shipped.

**Results:** [the leaderboard](https://wakirox.github.io/nuzlocke-bench/) shows every official run, by model.
How a run is scored: [docs/scoring.md](docs/scoring.md).

Game Boy emulator + rules tracker in one page, plus an **MCP server** so an AI (e.g. Claude) can play
while you watch.

- **Emulator:** [binjgb](https://github.com/binji/binjgb) (WebAssembly). Keyboard, gamepad, touch; fast-forward;
  battery saves and auto-resume in IndexedDB.
- **Game data:** when a run starts, species, moves, learnsets, evolutions and names, and each boss's
  highest level (for the level caps), are read from your ROM in a Web Worker, through the Gen 1 ROM handler
  of the TypeScript port of UPR-ZX ([randomize.sh](https://github.com/justinelijahtaylor/randomizer),
  vendored in `vendor/randomizer/`). Nothing in the game is changed (except with hard level caps: [docs/rules.md](docs/rules.md)).
- **Tracker:** reads game RAM (addresses from pret's pokered/pokeyellow symbols): party stats/moves/PP,
  type effectiveness, the enemy's stats and moves, learnsets, evolutions, heals in bag, Pokémon Center
  heals, each area's first encounter, deaths, level caps, the Hardcore Nuzlocke rule checks,
  wipe/victory detection and the attempt history.

The rulesets are a registry (`src/rulesets.ts`): Hardcore Nuzlocke is the one there is today.
The games are too: everything game-specific (memory, screen, maps, data, bosses, the harness's
interventions) sits behind a game adapter (`src/games/adapter.ts`). Gen 1 (`src/games/gen1/`: Red, Blue,
Yellow) is the supported one. **Crystal (`src/games/gen2/`) is experimental**: it plays, but it's still being
built, and its runs aren't scored or ranked.

The rules follow Hardcore Nuzlocke; how this harness reads the debatable ones (the first rival battle, the level cap) is in [docs/rules.md](docs/rules.md).

Your ROM never leaves the browser. Bring your own legally obtained English (US/EU) ROM.

## How it's different

Language models playing these games isn't new ([related work](docs/related-work.md)). What's different here are the rules and how runs are measured:

- **Losses are permanent.** In the plain game a lost battle costs some money and a walk back, so a weak model is only
  slower. Here a Pokémon that faints is gone and a wipe ends the run, so the bench measures judgement under risk (when
  to fight, train, catch or use candies), not only finding the way.
- **The model can break the rules.** Nothing stops an illegal action: the tracker checks every rule, and a violation
  ends the run. Knowing the rules and keeping to them is part of the test.
- **Text, not pixels.** The map, menus and battles are read from RAM and given as text (a screenshot is one tool among
  many), so reading 8-bit graphics isn't what's measured.
- **No help.** No hints, walkthroughs, routes or helper agents, the same tools for every model, one attempt, and the
  harness version in every run log. Models get stuck here where the stream's old hints pointed (the first cave, the
  ledges after it, the story step past the bridge), and the bench measures that instead of patching it. (For weaker
  models there's an optional `hints` group with a hint tool; its runs are never mixed with clean results.)
- **Any model.** Claude plays through Claude Code; any other model plays straight through its API (OpenAI-style, e.g.
  Ollama, vLLM, OpenRouter, or Anthropic's), with no system prompt and nothing but the game's tools.

## Run it

**Requirements:** [Node.js](https://nodejs.org) 20 or newer (developed on 24), npm, a modern browser
(Chrome/Edge/Firefox), and your own English Pokémon Red, Blue or Yellow ROM (`.gb`/`.gbc`).

1. Get the code and install the dependencies (once):

   ```bash
   git clone https://github.com/wakirox/nuzlocke-bench.git
   cd nuzlocke-bench
   npm install
   ```

2. Start the dev server:

   ```bash
   npm run dev
   ```

3. Open http://localhost:5173 and drop your ROM on the page (it is kept in the browser's IndexedDB, so
   you only do this once).
4. Pick the goal and the Hardcore Nuzlocke options (infinite Rare Candies, hard level caps, the first rival
   battle not counting, whether a violation ends the run; all on by default), then press **Play**.
5. Play. The game, tracker and run history autosave to the browser every few seconds and resume on reload.

Controls: arrows · X = A · Z = B · Enter = Start · Backspace = Select · hold Space = fast-forward · F2/F4 = save/load state.

**Production build** (static files in `dist/`, served by any web server):

```bash
npm run build
npm run preview
```

**Backups:** **Export save** downloads everything (runs, states, tracker, replays) as one file; **Import**
restores it. While the MCP server below is running, the page also mirrors its saves to `saves/*.json`
in this folder (`NUZLOCKE_SAVES_DIR` to change), so they survive a cleared browser.

ROMs (`*.gb`, `*.gbc`, `dev-rom/`) and `saves/` are git-ignored: never commit them.

## Let a model play (MCP)

`.mcp.json` registers the server for Claude Code when you open this folder:

```json
{ "mcpServers": { "nuzlocke-bench": { "command": "node", "args": ["mcp-server/server.mjs"] } } }
```

For Claude Desktop or other clients, point them at `node <path>/mcp-server/server.mjs`.

1. Start the app and a run.
2. Click **AI control** — the tab connects to the server on `ws://127.0.0.1:7878` (`NUZLOCKE_BRIDGE_PORT` to change).
3. Ask Claude to play. While connected the game only advances when a tool sends input, so play is deterministic.

The tools (`get_map`, `walk_to`, `fight`, `do`, `notes`…), what each returns, and running the server headless are in [docs/mcp.md](docs/mcp.md).

## Benchmark

```sh
npm run build
npm run bench -- --rom path/to/red.gb --model claude-haiku-5-5 --effort low --preset hardcore-nuzlocke --watch
npm run bench -- --rom path/to/red.gb --model qwen3.8:27b --api openai --preset hardcore-nuzlocke   # a local Ollama model
npm run bench:report
```

| Preset | Ruleset | Goal | Tool calls | Rare Candies | Violation ends the run (every rule) |
|---|---|---|---|---|---|
| `hardcore-nuzlocke` | Hardcore Nuzlocke | Champion | 6,000 | infinite, after the first rival battle | yes |
| `hardcore-nuzlocke-badge1` | Hardcore Nuzlocke | first badge | 600 | infinite, after the first rival battle | yes |

A run plays headless by default; `--headed` opens the game window paced so you can follow it, `--watch` opens it
at full speed. When the run ends, the console prints its score and whether it counts as an official result.

Each run gets one attempt, a fixed number of tool calls and only the game's tools; its folder `runs/<id>/` holds the run log, transcript and saves
(the saves keep the ROM by reference, not a copy: keep your ROM files where the run found them).
Presets and options, the report, every `bench` flag and what counts as an official result: [docs/benchmark.md](docs/benchmark.md).
Saves, the run log and checking a recording: [docs/runs.md](docs/runs.md).

## Tests

`npm test` runs everything that needs no ROM (CI does too): the Hardcore Nuzlocke rules for every
supported game, Gen 1 memory reading, pathfinding, the emulator core and replay determinism, and the
MCP server's headless serving and run log. `NUZLOCKE_TEST_REPLAY=saves/bestReplay.nuzlocke.json npm test`
also replays your best recorded run and checks it ends the same way. See [tests/README.md](tests/README.md),
including how to plug in another game.

## Notes

- `vendor/randomizer/` is the GPL-3.0 UPR-ZX TypeScript port, with a few fixes made here (each marked in
  its file). Only its Gen 1 and Gen 2 ROM handlers are used, to read the game's data; the app randomizes
  nothing, and only the config files those handlers read are served (`public/config/`).
- Saves from earlier versions stay where they were (the browser store, `saves/*.json`, exported files).
  A saved run of a ruleset that's no longer here isn't resumed (the app opens on setup); its attempts stay
  in the history.

License: GPL-3.0-or-later (because of the vendored UPR-ZX port). binjgb is MIT.

Pokémon is a trademark of Nintendo, Creatures and Game Freak. This project isn't affiliated with or endorsed by
them. No ROMs or game assets are included: bring your own legally obtained copy.
