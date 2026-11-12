# After a run: saves, the run log, checking a recording

[Back to the README](../README.md).

## Saves and transcripts

ROMs: saves keep the ROM by reference (its SHA-256), not a copy, and read it back from the ROM files. The run's ROM
and the others in its folder are found; elsewhere, pass `--roms <dir>`. Runs saved before keep their
copies until `node scripts/rom-refs.mjs --roms <dir> --write` turns them into references (a dry run without `--write`).

Transcripts: a finished run keeps `transcript.jsonl.gz` (about a quarter of the size; bench-run compresses it after
writing `summary.json`, and every reader takes either form). `node scripts/compress-transcripts.mjs` does the same for
earlier runs: only runs whose `agent.json` is written, and the plain file goes only once the copy reads back the same.

## Run log

Every tool call is appended to `runs/<start time>.jsonl` (`NUZLOCKE_RUN_LOG=<file>` to choose, `off` to disable):
call number, time, duration, tool, arguments, error, location (`where`), badges, deaths, violations, the
in-game clock (`playTime`) and the run outcome when it ends —
enough to count steps, time and deaths per run and compare runs. Both `runs/` and `saves-headless/` are git-ignored.

## Checking a run

Every finished run's recording is kept (`saves/replay.attempt-N.json`, the last 20). Anyone with their own
copy of the game can check one:

```sh
npm run verify -- saves-headless/replay.attempt-3.json --rom red.gb --preset hardcore-nuzlocke-badge1
```

The checker trusts nothing in the file but its button presses. It plays them from power-on on your ROM,
re-does the harness's own interventions (the Rare Candy top-up; in older recordings, moving the dead to the PC), judges the run
with a fresh tracker under the preset's rules (data read from your ROM), and reports what really happened.
It fails a recording that ran on another ROM, doesn't start from power-on, pokes memory, loads a save
state, gets an intervention the rules don't give (another item, burying a living Pokémon), or claims a
result its playback doesn't reach. A full run takes minutes to check.

What it proves is what was played, under which rules; not who played it — a model, a script or a person
send the same button presses. Results that need that (a leaderboard of models) come from runs we start
ourselves.
