# MCP tools and headless runs

What the model can call, and how to run the server without a browser tab. [Back to the README](../README.md).

| Tool | What it does |
|---|---|
| `do` | Several of the model's own actions in one call (e.g. `walk_to` a door, `advance_text`, `choose` YES, `exit_map`); stops at the first step that leaves something new to decide — a battle, a step cut short, a tracker warning or violation, an error, the end of the run |
| `get_state` | Name-resolved state: lead (moves w/ power, PP, effectiveness), enemy, party, the Nuzlocke status (level cap, this area's encounter, the dead), bag, location, badges, heals, catches, rule events, outcome; `only` picks sections |
| `read_screen_text` | Decodes the screen's text/menus from memory (▶ = cursor, ▼ = more text) |
| `get_screen` | PNG screenshot (+ text) |
| `get_map` | The screen, or the whole map (`full`), as text: walls, grass, water, ledges, doors, people, signs (`S`), a Pokémon Center's PC (`P`; `walk_to` it with `interact` to switch it on), trainers and their sight; each trainer's class and whether they're beaten listed under it, not their teams. The first result on a map the run hasn't seen yet shows all of it |
| `press` | Button sequence: `a b start select up down left right`, repeats `down*3`, chords `up+b`, pauses `wait:30`, `name:X` on a naming keyboard |
| `advance_text` / `choose` | Press through dialogue until a choice (waiting out scenes that take the controls); pick a menu option by its text |
| `walk` / `walk_to` / `exit_map` / `travel` | Walk a path; pathfind to a square (`interact` talks to it); cross the map's edge (in a building whose doors all lead to the same place, out through the nearest door); head one way across maps. Path tools take `trainers: ignore/avoid`. A walk stopped by an open text box says so, with the text |
| `note_route` / `forget_route` / `routes` | The model's own route book: how two maps connect (an edge or a door), noted as it finds them |
| `notes` | The model's own notes for the run: a numbered list it can add to, remove entries from, or clear, kept outside the conversation (they survive when a long run is summarized); cleared by a new run |
| `go_to` | Travel to a map along noted routes only — no layout is known in advance |
| `start_game` | From the title screen: options (battle style Set), names; stops when you have control |
| `fight` / `switch_pokemon` / `throw_ball` | Battle: a move (plays the turn), a switch, a ball (with the catch's nickname) |
| `fight_trainer` / `hunt` | Walk up to a trainer and start the battle; pace grass until a wild battle |
| `make_lead` / `use_item` / `rare_candy` / `field_move` | Outside battle: reorder the party, use an item, level a Pokémon up to a target level with the infinite-candy option (a level past the cap is refused; the candies come after the first rival battle), use a field move |
| `policies` | Standing choices: flee wild battles that don't count, route around trainers' sight |
| `wait` | Advance N frames |
| `save_state` / `load_state` | Named slots (reloading to undo deaths is against the rules; not offered under a benchmark preset) |
| `new_run` | Start a new attempt from the loaded ROM (`mode`, the Hardcore Nuzlocke options, `goal_badges`, `rom_path`). Not offered under a benchmark preset: a benchmark run has one attempt, which the server starts |
| `get_rules` | The ruleset and the run's goal |
| `hint` | Only with the preset option `hints`: the next story step (where to go, what starts it); before the elite rooms, to stock up on healing items |

Fewer turns, fewer tokens: every action result already carries the location, lead, foe, messages, the
screen text (only when it changed) and the tracker's new events (📋), so a model that chains decided actions
with `do` and reads `get_state` sections only when it needs them plays the same game in far fewer calls.

Dev helpers: `node scripts/mcp-call.mjs <tool> '<json args>'` (one-shot call), `node scripts/mcp-smoke.mjs`.

## Headless runs (no browser tab)

For unattended or repeated runs (e.g. comparing models), the MCP server can serve the built app itself and
drive it in a headless Chromium — the same page code, rules and tools, just nobody watching.

```bash
npm run build
npm install -D playwright-core && npx playwright-core install chromium-headless-shell   # once
```

Then give the server `NUZLOCKE_HEADLESS=1`, e.g. in `.mcp.json`:

```json
{ "mcpServers": { "nuzlocke-bench": { "command": "node", "args": ["mcp-server/server.mjs"],
  "env": { "NUZLOCKE_HEADLESS": "1", "NUZLOCKE_ROM": "C:/roms/red.gb", "NUZLOCKE_SAVES_DIR": "runs/attempt-01" } } } }
```

| Variable | Effect |
|---|---|
| `NUZLOCKE_HEADLESS=1` | Serve `dist/` on the bridge port and open it in headless Chromium at `/?ai&headless` (frames run unpaced) |
| `NUZLOCKE_ROM` | Base ROM: when the save folder has no run yet, start one automatically |
| `NUZLOCKE_MODE` | Ruleset for that run (default and only one today: `nuzlocke`) |
| `NUZLOCKE_HARD_LEVEL_CAPS=1` | Hardcore Nuzlocke option for that run: hard level caps (nobody gains levels past the cap) |
| `NUZLOCKE_FIRST_RIVAL_FREE=1` | Hardcore Nuzlocke option for that run: the first rival battle doesn't count |
| `NUZLOCKE_GOAL_BADGES=1` | Short run: that many badges wins the run (default: become Champion) |
| `NUZLOCKE_BENCHMARK` | Lock every run to a benchmark preset ([benchmark.md](benchmark.md)) |
| `NUZLOCKE_SAVES_DIR` | Save folder; headless defaults to `saves-headless/`, apart from your own `saves/` |
| `NUZLOCKE_BRIDGE_PORT` | Port (default 7878): give parallel runs different ports and save folders |
| `NUZLOCKE_RUN_LOG` | Run log file, or `off` ([runs.md](runs.md#run-log)) |
| `NUZLOCKE_BROWSER_PATH` | Use an installed Chrome/Chromium instead of Playwright's |
| `NUZLOCKE_HEADED=1` | Show the browser window, paced to watch the run |
| `NUZLOCKE_HEADED=fast` | Show the window at full speed (an app window that fits the page to its size; `bench --watch`) |
| `NUZLOCKE_GRID=wide` | Map grids with two spaces between squares (the default, narrow, has one) |
| `NUZLOCKE_EFFECTIVENESS=on\|off` | Whether results say how effective each move is (default: only under a preset with `hints`) |
| `NUZLOCKE_ROMS_DIR` | More ROM files for saves that keep the ROM by reference (default: `NUZLOCKE_ROM`'s folder) |
| `NUZLOCKE_REPORT_ISSUE=0` | Leave out `report_issue` (on by default) |
| `NUZLOCKE_PLAYTEST=1` | Playtest: the run tests the tools and is marked as not a benchmark result |

Without `NUZLOCKE_ROM`, call `new_run` with `rom_path` as the first step. Closing the MCP client closes
the browser. The server also logs to `nuzlocke-bench.log` in the system's temp folder (MCP clients often hide
its stderr). `npm run smoke:headless -- --rom path/to/red.gb` checks the whole chain.
