# To do

Kept for later, when there's quota to spend on it.

- **Back up the runs.** `runs/` is gitignored and lives only on one machine.
  Copy each run folder (transcript, run log, `agent.json`, saves) to a private repo.
- **A leaderboard page.** Generated from `npm run bench:report`: one table per set of conditions
  (preset + options), one row per model and effort (furthest badge, deaths, outcome, calls, cost). Official runs only (see "Official results" in the README).
- **Flag runs that aren't official.** `bench:report` reads the transcript's first event and marks a run whose
  model had tools other than the game's.
- **A wipe counts its last Pokémon.** When the run ends in a wipe, the Pokémon that fainted in it isn't added
  to the deaths (the run ends first), so a one-Pokémon wipe shows 0 deaths.
- **A randomized preset.** A seed made when the run starts (Pokémon, trainers, and ideally the map
  connections), so walkthroughs, read online or in training, stop matching the game.
