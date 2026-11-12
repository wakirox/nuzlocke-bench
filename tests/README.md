# Tests

```bash
npm test              # type-check src and tests, then everything that needs no ROM (this is what CI runs)
npm run typecheck     # the type check alone (tsconfig.test.json; vitest doesn't check types)
npm run test:watch
NUZLOCKE_TEST_REPLAY=saves/bestReplay.nuzlocke.json npm test   # + replay a real recorded run
```

The tests check that the harness reports the game correctly — encounters, deaths, level caps,
rule violations, positions, paths. They never check advice or decisions: what to do with that
data is the model's call.

## Layout

| Folder | What | Needs a ROM |
|---|---|---|
| `rules/` | Game-agnostic rule suites (`*.suite.ts`) and the file that runs them for every game | no |
| `games/<game>/` | One folder per game: its fixture (built on the game's adapter, `src/games/<game>/`), RAM-layout tests, quirks the shared suites can't express | no |
| `games/index.ts` | The list of games the shared suites run against | — |
| `harness/` | `GameFixture` (the contract a game implements), the `Run` scenario helper, the emulator core in Node, save-file reader | — |
| `bridge/` | Pathfinding over hand-drawn maps | no |
| `emulator/` | The core in Node and replay determinism, on a tiny homebrew ROM built in the test | no |
| `server/` | MCP server pieces: headless static serving, the run log | no |
| `rom/` | Replays of real recorded runs; skipped unless `NUZLOCKE_TEST_REPLAY` is set | yes |

## Writing a rule test

Rules are tested by playing short scenarios through a game's fixture:

```ts
const run = new Run(game).goTo(game.places.route).wildBattle(game.ids.wildA).catchWild("BITEY");
expect(Object.values(run.engine.snap.areas)).toEqual([expect.objectContaining({ status: "caught" })]);
```

`Run` turns each call into the next game state and feeds it to the rules engine, as the app
does when it polls the emulator. Use the fixture's ids and places, never a game's raw numbers,
and the test runs on every game. Put a rule that only exists in one game in that game's folder.

## Adding a game

A game is one adapter in the app (`src/games/<game>/`, implementing `GameAdapter` from
`src/games/adapter.ts` and listed in `src/games/index.ts`) plus one fixture here.

1. **Fixture** — `tests/games/<game>/fixture.ts` exporting a `GameFixture`
   (`tests/harness/game-fixture.ts`): the engine to test, the ids and places the suites talk
   about (a ball, a potion, a starter, a two-stage family, two wild species, two routes, two
   floors of one area, the Hall of Fame), its level caps, its adapter (the places are its maps),
   and builders for its game states.
   `tests/games/gen1/fixture.ts` is the model.
2. **List it** in `tests/games/index.ts`. Every shared suite now runs on it; failures show
   where the engine doesn't handle that game yet.
3. **RAM tests** — `tests/games/<game>/ram.test.ts`: write its memory layout into a fake RAM
   and read it back through the adapter's state reader, like `gen1/ram.test.ts`.
4. **Quirks** — game-only rules in `tests/games/<game>/rules.test.ts`.
5. **Replay** — once a run of it is recorded, `NUZLOCKE_TEST_REPLAY` checks it end to end.

The suites drive the engine through `GameState`, so a new game's adapter maps its RAM into
that same shape; the Tracker takes the rest (items by role, the maps the rules treat specially,
the type chart) from the adapter's data. `GameVersion` (`src/rom/types.ts`) and the ROM reader
are what still name Gen 1's versions only.

## Recorded runs

`rom/replay.test.ts` plays a saved recording (it contains the ROM it ran on) through the
emulator core in Node, feeds the Tracker every 6 frames like the app, and checks the run ends
the same way. The first pass writes what the engine saw to `rom/golden/<mode>-attempt-<n>.json`;
later passes must match it. Commit that file to lock the result in; delete it to accept a
deliberate change. Recordings made before tracker data was stored with them also need
`NUZLOCKE_TEST_DATA=<that run's saves/run.json>`.
