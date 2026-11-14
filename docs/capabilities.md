# What a run shows

The score ranks models. These numbers say where a model struggles: how it uses the tools, how it plans,
and how well it knows the way through the story. They're measured from each run's own records
(`mcp-server/capabilities.mjs`), shown on the run's page under "What the run shows", and kept in the
published results. **None of them is in the score.**

They're measured numbers on purpose, not 0-100 grades: a grade needs weights, and nothing in the data
says what those should be. Each group starts small and grows as runs show what's worth measuring.

## Tool use

| Number | What it is |
|---|---|
| Failed calls | The share of calls made that failed: errors, and calls the server rejected (as in the score) |
| Screenshots | The share of calls that were `get_screen` (as in the score) |
| Calls that move for the model | The share of calls that were `go_to`, `travel`, `walk_to`, `exit_map`, `walk`, `hunt` or `do`: one call moves the player, instead of the model pressing its way there |
| Raw button presses | The share of calls that were `press` |
| Batches | `do` calls |
| The same call three times running | Loops: the same tool with the same arguments three calls in a row, counted once however long (fighting with the same move, reading text and waiting are play, not loops) |

## Planning

| Number | What it is |
|---|---|
| Flash in the dark tunnel | Whether the model lit the tunnel (it needs the move, and ten species caught to get it) |
| Deaths per badge | Deaths over badges won |
| Times into each hard area | How many times it went in before getting through: going in, coming out to heal or catch, going back |

## Knowledge

| Number | What it is |
|---|---|
| The longest story steps | Calls from one milestone to the next, the five longest. A long step is where the model didn't know, or couldn't find, what came next |

## Next

Candidates, once their data is checked: how far below the level cap the model went into gym and rival
fights (the Rare Candies are free), how many of the areas it opened it caught something in, and
attacks into a type that resists them when it knew a better one.
