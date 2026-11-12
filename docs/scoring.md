# Scoring

The dashboard ranks models by this score, on official runs only. A run's score has no maximum and no
floor: a bad run can go below zero.

## The official run

Only these runs make the leaderboard (`OFFICIAL` in `mcp-server/benchmark.mjs`, `notOfficial` in
`mcp-server/dashboard.mjs`):

- **Rules:** `hardcore-nuzlocke+firstrival+hardcap`, the full game with the default options. No hints:
  `-o hints` is for testing, and its runs are their own group.
- **Game:** Red.
- **Started on or after 2026-11-08,** when the official run was defined. Earlier runs stay on the
  dashboard as test runs.
- **From a new game.** A run continued after a crash or a reboot (`--resume`) still counts when every
  leg is on record. One started from a hand-made save doesn't.
- **Ended by the rules:** Champion, a wipe, lost, disqualified, out of calls, or gave up after the
  nudges. A run stopped by hand, or one nothing ended, isn't a result.
- **Nothing that helps or steers the model:** no playtest (`--playtest`), and no narration (older runs were marked "narrated").

Everything else is the runner's defaults: 3 nudges, the standard context window, the narrow grid,
report_issue on. Watching a run (`--headed`, `--watch`) doesn't change it.

The dashboard shows these runs only, one game at a time; test runs stay in `npm run bench:report`.

The published results are these runs alone: `npm run bench:results` keeps one file per benchmark version,
`results/<version>.json` (the harness version without its commit), with each official run as the dashboard
shows it and no game names. A run stays on file when its folder is gone; one whose folder is here is
updated, or taken out when it's no longer a result. `npm run bench:results -- --dashboard <file>` builds
the public page from those files only, so `runs/` stays private.

## Points

| What | Points | When |
|---|---|---|
| Each of the 8 badges | +60 | every run |
| Each of the 20 other milestones, the 6 rival wins before the League among them | +30 | every run |
| Beating the Champion | +130 | every run |
| Each death | -15 | every run, except the deaths in a wipe's last battle |
| A run that ends early: a wipe, lost, gave up, out of calls | -45 | once |
| Disqualified | -100 | every run |
| Speed: calls per milestone reached, up to the furthest | up to +29 | every run; 0 at 300 calls per milestone |
| The cottage step's speed: calls from the second badge to leaving that town south or east | up to +29 | when that step is done; 0 at 400 calls |
| The dark tunnel's speed: calls from the first step inside to the town past it | up to +29 | when crossed; 0 at 1,500 calls |
| Flash used in the dark tunnel | +30 | every run |
| Every 10 calls under the 6,000 budget | +1 | only after beating the Champion |

Each speed bonus is `round(29 × (1 − calls / zero))`, never below 0: under one milestone's worth, so being quick
never outweighs getting further. They break the ties between runs that stop at the same place.

The progress points add up to 1210. The milestones are `OBJECTIVES` in `mcp-server/report.mjs`.
A run keeps what it reached, however it ended.

A rival milestone counts when that fight is won. Runs logged before fights were recorded (2026-10-15)
get one when they reached a later milestone: an assumption, as the log can't show it. An early optional rival fight isn't a milestone.

A wipe's last Pokémon counts as a death in the run's stats (the run log doesn't count it, as the run ends
first). The deaths in a wipe's last battle, from the last call made outside a battle, are the wipe itself:
the score charges them once as the early end, not per Pokémon, so a big team that wipes doesn't cost more
than a lone starter. Giving up costs the same as wiping out, so stopping is never the cheaper way out.

Screenshots and failed tool calls are shown as each run's stats, not scored.

## A model's score

The median of its official runs, not its best: one lucky run shouldn't carry a model.

## Why these choices

- **A death costs half a milestone.** Deaths hurt, but playing safe never beats getting further.
  It does mean a cleaner run can outscore one that got a little further.
- **Efficiency counts only for finishers,** so a model gains nothing by rushing into a wipe.
- **Speed counts for every run, but stays under a milestone.** Before 2026-11-11 runs that stopped at the
  same place tied (three at 210, three at 225 to 240). The two speed checks single out the steps that
  stop most runs: the cottage step (finding the way on after the second badge's town) and the dark tunnel.
- **Flash is rewarded** as the player's own answer to the dark tunnel: getting the HM and using it is a plan.
- **One cost for any early end (2026-11-11).** Giving up used to cost nothing while a wipe cost 15 per
  Pokémon, so quitting was cheaper than fighting on.
- **Screenshots and failed calls aren't scored** (until 2026-11-08 they were -2 and -1 each). Both
  grow with how far a run gets, so they cost long runs the most: an 8-badge run lost 439 points to
  them and fell below a 6-badge run, and among runs that stop at the same place they decided the
  order by noise.
- **Tokens aren't scored.** They depend on the model and client more than on how well it plays.

## Open questions

- **Time.** Real time and game time stay separate information for now: the dashboard shows them and
  the score doesn't use them.
- **Efficiency.** It counts only for finishers at the moment; the speed bonuses cover the rest.
- **The speed scales** (300, 400, 1,500) come from today's runs: one run has crossed the dark tunnel (898
  calls) and two have done the cottage step (91 and 293). Revisit them once more runs get there.
- **Is -100 right for a disqualification?** It might deserve more.
- **When every model finishes clean,** efficiency only separates them for so long. Harder rule tiers
  (no free first rival, fewer candies, randomized), each with its own leaderboard, are the next step.
- **How many runs make a model's score.**
- **Freezing it.** Official results need a benchmark version, with rules and scoring fixed per version.
