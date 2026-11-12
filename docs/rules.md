# Rules: the judgement calls

How this harness reads three Hardcore Nuzlocke rules that players disagree on. [Back to the README](../README.md).

**On the first rival battle.** Under the strict rule a Pokémon that faints anywhere is dead, the lab fight right after
choosing a starter included, so losing it ends the run. Many players excuse that one fight (Bulbapedia: the
faint rule "is often not enforced at that time"): one Pokémon, no healing, mostly luck, and the game itself
goes on after a loss. The `firstrival` option does that (on by default in `npm run bench`; `-o nofirstrival` for the strict rule): a faint before that battle is over isn't a death and
isn't a wipe. The game heals the party right after the fight and only then marks it fought (pret's lab script:
`predef HealParty`, then the `SetEvent` for that battle), so the run picks up as the game does.

**On the dead.** Many players box or release a Pokémon the moment it faints. This harness doesn't move it:
**a dead Pokémon may stay in the party**, and a Pokémon Center may heal it. Only battling with it breaks the
rule (`dead-pokemon`): being sent out, as the lead when a battle starts or by a switch, the switch after a
faint included. Boxing the dead at a PC is the player's job, and part of what the benchmark sees. (Until
2026-10-16 the harness moved them to Box 12 itself; recordings from then still play back and verify that
way.) The dead don't count as standing, healed or not: when every living Pokémon has fainted, in battle or
from poison while walking, the run ends as a wipe, as it would without them, even if a healed dead one could
still be sent out.

**On the level cap.** Hardcore Nuzlocke caps levels at the next boss's highest level, but how strictly is a
matter of opinion. The usual write-up says a Pokémon over the cap "must be boxed, and cannot be used" until
it's under the cap, and that you must "enter the battle with no Pokémon over the level cap", without saying
whether that means every battle or only the boss's. This harness takes the less strict reading, by choice:
**a Pokémon over the cap may stay in the party, but it must not battle** — it may not lead or be sent out, in
any battle. Passing the cap during a battle is fine; from the next battle on it sits out until the cap goes
up.

Without hard caps the cap is soft: experience keeps coming, so using Rare Candies up to the cap and then
fighting on is a planning mistake the benchmark can see (the report counts it). **Hard level caps** (an option,
on top of any preset: `hardcap`, on by default in `npm run bench`, `-o nohardcap` for the soft cap, see
[benchmark.md](benchmark.md#benchmark)) make it impossible instead, as many ROM hacks do: a Pokémon at the
cap gains no more levels. The game already stops experience at Lv100 (pret `GainExperience`: `ld d, MAX_LEVEL`
before `CalcExperience`), and its Rare Candy checks Lv100 too; the harness sets both values in the emulator's
loaded copy of the ROM to the current cap (`src/games/gen1/hard-caps.ts`), recorded like its other interventions so
replays and the verifier do the same. The ROM file is untouched. A capped Pokémon's experience goes back to the
start of the cap level (the game's own clamp), and carries on from there when the cap rises. Found by pattern,
checked on Red. With no Pokémon left that may
battle — every living one, in the party and the PC, over the cap — the run is lost (outcome `lost`): it
couldn't go on without breaking a rule. In a trainer battle that's as soon as the ones that may battle have
fainted.
