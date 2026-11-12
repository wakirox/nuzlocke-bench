# Related work

[Back to the README](../README.md).

Language models playing these games isn't new. What's different here are the rules and how runs are measured.

- **[Claude Plays Pokémon](https://www.twitch.tv/claudeplayspokemon)** (Anthropic's stream, Red): the model plays from
  screenshots, with a navigator tool that walks it to a square and memory files of its own. The harness changes with
  each model ([changelog](https://docs.google.com/document/d/e/2PACX-1vRIsu2pLI21W4KjfYbN13or8E-8cvJYw570wGMEp4UQU63ZhEh9FPGgj2ark8Yk7Vyrtt9MWq3jnn4h/pub)):
  early versions gave hints for the places where the model got stuck, and later ones dropped them. Opus 4.7 became
  Champion in May 2026 ([write-up](https://www.lesswrong.com/posts/sehJYg5Yny9fvpbpt/a-year-late-claude-finally-beats-pokemon)).
- **Gemini Plays Pokémon** (an independent developer; finished Blue and Yellow Legacy): screenshots plus RAM data, a
  text minimap of every square seen so far, a pathfinding subagent and code execution. The harness changed while runs
  were going on, and its author says the runs can't be compared with Claude's
  ([README](https://github.com/waylaidwanderer/gemini-plays-pokemon-public/blob/main/README.md),
  [comparison](https://www.lesswrong.com/posts/7mqp8uRnnPdbBzJZE/is-gemini-now-better-than-claude-at-pokemon)).
- **GPT Plays Pokémon** (an independent developer): GPT-5 became Champion in Red in 6,470 steps and in Crystal in
  9,517 ([list of self-reported runs](https://benchmarklist.com/benchmarks/pokemon_autonomous_completion/)).
- **[The PokéAgent Challenge](https://arxiv.org/abs/2603.15563)** (NeurIPS 2025): one open-source harness, Emerald
  up to the first gym, scored by 15 milestones, then time, then button presses. Its finding: the harness matters as
  much as the model, and coding-agent CLIs on their own made little progress.
- **[PokéBench](https://github.com/VibeCodyH/pokebench)** ([leaderboard](https://pokebench.tv)) is the closest to this
  bench's first-badge preset: Red up to the first gym, the same seat for every model (a screenshot, an ASCII map of
  where you can walk, the screen's text, up to six actions a turn), 1,000 turns, ten milestones read from memory.
  Other benchmarks on Red hold the harness fixed too: [another PokéBench](https://github.com/Biabuyan/pokebench) (short
  scenarios from save states), [a third](https://github.com/afk-sapien/pokebench) (a catalog of tasks), and on Blue
  [LLM Plays Pokémon](https://github.com/downthecrop/pokemon-llm). None of them has permadeath.
- **[AgenticNuzlocke](https://github.com/NKalavros/AgenticNuzlocke)**: language-model agents play a Nuzlocke of a
  Red-based ROM hack. It's built to get through the run, not to compare models: walkthrough fragments set the
  objectives, a rules layer keeps every action legal, and separate systems plan the team and the battles.
- Nuzlocke battle agents without a language model, such as [rr-offline-calc](https://github.com/obalak3/rr-offline-calc)
  and [NuzlockeAI](https://github.com/Fracture17/NuzlockeAI), search a trainer battle's outcomes exactly.
