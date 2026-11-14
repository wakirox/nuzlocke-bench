// Hardcore Nuzlocke rules, written once for every game: each test plays a short scenario
// through the game's fixture and checks what the rules engine recorded. Nothing here knows
// a game's ids, maps or RAM — only the fixture does.
//
// These check the *data* the harness reports (encounters, deaths, caps, violations). They
// never check advice: deciding what to do with that data is the model's job.

import { brief } from "../../src/bridge/summary";
import { describe, expect, it } from "vitest";
import type { GameFixture } from "../harness/game-fixture";
import { Run } from "../harness/scenario";

export function nuzlockeRuleSuite(game: GameFixture): void {
  const { ids, places, caps } = game;
  const areas = (run: Run) => Object.values(run.engine.snap.areas);

  describe(`Hardcore Nuzlocke rules — ${game.name}`, () => {
    describe("first encounter per area", () => {
      it("makes the first wild Pokémon in an area that area's one chance", () => {
        const run = new Run(game).goTo(places.route).wildBattle(ids.wildA, 3);
        expect(areas(run)).toEqual([expect.objectContaining({ species: ids.wildA, level: 3, status: "open" })]);
      });

      it("marks the area caught when it is caught", () => {
        const run = new Run(game).goTo(places.route).wildBattle(ids.wildA).catchWild("BITEY");
        expect(areas(run)).toEqual([expect.objectContaining({ species: ids.wildA, status: "caught" })]);
        expect(run.engine.snap.owned).toContain(ids.wildA);
        expect(run.violations()).toEqual([]);
      });

      it("marks the area missed when the battle ends without a catch", () => {
        const run = new Run(game).goTo(places.route).wildBattle(ids.wildA).endBattle();
        expect(areas(run)).toEqual([expect.objectContaining({ status: "missed" })]);
        expect(run.events("warning")).toHaveLength(1);
      });

      it("doesn't let a later encounter in a used area count, and flags catching it", () => {
        const run = new Run(game).goTo(places.route).wildBattle(ids.wildA).endBattle()
          .step(3).wildBattle(ids.wildB).catchWild("SPIKE");
        expect(areas(run)).toEqual([expect.objectContaining({ species: ids.wildA, status: "missed" })]);
        expect(run.violations()).toHaveLength(1);
      });

      it("gives every area its own first encounter", () => {
        const run = new Run(game).goTo(places.route).wildBattle(ids.wildA).endBattle()
          .goTo(places.route2).wildBattle(ids.wildB).catchWild("SPIKE");
        expect(areas(run).map((a) => [a.species, a.status])).toEqual([[ids.wildA, "missed"], [ids.wildB, "caught"]]);
        expect(run.violations()).toEqual([]);
      });

      it("counts the floors of one place as one area", () => {
        const [floor1, floor2] = places.sameAreaFloors;
        const run = new Run(game).goTo(floor1).wildBattle(ids.wildA).endBattle()
          .goTo(floor2).wildBattle(ids.wildB);
        expect(areas(run)).toHaveLength(1);
        expect(areas(run)[0]).toMatchObject({ species: ids.wildA });
      });

      it("says so when a battle's area has used its encounter, floors included, but not on the first", () => {
        const [floor1, floor2] = places.sameAreaFloors;
        const used = (r: Run) => r.engine.snap.events.filter((e) => /this area's encounter is used/.test(e.text));
        const run = new Run(game).goTo(floor1).wildBattle(ids.wildA);
        expect(used(run)).toEqual([]);
        run.endBattle().goTo(floor2).wildBattle(ids.wildB);
        expect(used(run)).toHaveLength(1);
      });

      it("doesn't count an encounter while you have no Poké Balls", () => {
        const run = new Run(game, { bag: [] }).goTo(places.route).wildBattle(ids.wildA).endBattle();
        expect(areas(run)).toEqual([]);
      });

      it("skips dupes of a family you already have (dupes clause) and counts the next new one", () => {
        const [base, evolved] = ids.family;
        const run = new Run(game).receiveGift(base, "BIRDY").goTo(places.route)
          .wildBattle(evolved).endBattle().step()
          .wildBattle(ids.wildA);
        expect(run.engine.isDupe(evolved)).toBe(true);
        expect(areas(run)).toEqual([expect.objectContaining({ species: ids.wildA, status: "open" })]);
      });

      it("doesn't spend an area's encounter on a gift", () => {
        const run = new Run(game).goTo(places.route).receiveGift(ids.wildB, "GIFTY");
        expect(areas(run)).toEqual([]);
        expect(run.engine.snap.catches).toEqual([expect.objectContaining({ species: ids.wildB, gift: true })]);
      });
    });

    describe("nicknames", () => {
      it("flags a catch left without a nickname once you walk on", () => {
        const run = new Run(game).goTo(places.route).wildBattle(ids.wildA).catchWild(game.speciesName(ids.wildA));
        expect(run.violations()).toEqual([]); // the naming screen comes after the catch
        run.step();
        expect(run.violations()).toHaveLength(1);
      });

      it("accepts a catch named after what it evolves into, evolved before you walk on", () => {
        const [base, evolved] = ids.family;
        const run = new Run(game).goTo(places.route).wildBattle(base);
        run.catchWild(run.engine.name(evolved).toUpperCase());
        const slot = run.s.party.length - 1;
        run.endBattle().setMon(slot, { species: evolved }).goTo(places.route2).step(2);
        expect(run.violations()).toEqual([]);
      });

      it("still flags an unnamed catch that evolves before you walk on (the game renames it to its new species)", () => {
        const [base, evolved] = ids.family;
        const run = new Run(game).goTo(places.route).wildBattle(base);
        run.catchWild(run.engine.name(base).toUpperCase()); // no name given: it's called what it is
        const slot = run.s.party.length - 1;
        run.endBattle().setMon(slot, { species: evolved, nickname: run.engine.name(evolved).toUpperCase() }).goTo(places.route2).step(2);
        expect(run.violations()).toHaveLength(1);
        expect(run.violations()[0]).toMatch(/has no nickname/);
      });

      it("accepts a nicknamed catch", () => {
        const run = new Run(game).goTo(places.route).wildBattle(ids.wildA).catchWild("BITEY").step(2);
        expect(run.violations()).toEqual([]);
      });
    });

    describe("deaths", () => {
      it("records a Pokémon that faints as dead, with what killed it", () => {
        const run = new Run(game).receiveGift(ids.wildB, "SPIKE").goTo(places.route)
          .trainerBattle(ids.wildA, 7).sendOut(1).faint(1);
        const uid = run.s.party[1].uid;
        expect(run.engine.isDead(uid)).toBe(true);
        expect(run.engine.snap.dead).toEqual([expect.objectContaining({ uid, species: ids.wildB, nickname: "SPIKE" })]);
        expect(run.engine.snap.outcome).toBeNull(); // the starter is still standing
      });

      it("flags a dead Pokémon sent into battle again", () => {
        const run = new Run(game).receiveGift(ids.wildB, "SPIKE").goTo(places.route)
          .trainerBattle(ids.wildA).sendOut(1).faint(1).sendOut(0).endBattle()
          .setMon(1, { hp: 10 }) // revived
          .step().trainerBattle(ids.wildA);
        expect(run.violations()).toEqual([]);
        run.sendOut(1);
        expect(run.violations()).toHaveLength(1);
      });

      it("names the dead in the party, and says when the game would send one out first", () => {
        const run = new Run(game).receiveGift(ids.wildB, "SPIKE").goTo(places.route)
          .trainerBattle(ids.wildA).sendOut(1).faint(1).sendOut(0).endBattle().step();
        expect(brief(run.engine, run.s).dead).toBe("SPIKE"); // fainted, second in the party
        run.setMon(1, { hp: 10 }).setMon(0, { hp: 0 }).step(); // healed, and the first one is down
        expect(brief(run.engine, run.s).dead).toBe("SPIKE (the game sends it out first)");
      });

      it("ends the run when the whole party has fainted — a loss, not a broken rule", () => {
        const run = new Run(game).goTo(places.route).trainerBattle(ids.wildA, 9).faint(0);
        expect(run.engine.snap.outcome).toMatchObject({ kind: "wipe" });
        expect(run.violations()).toEqual([]);
      });

      it("with the first rival battle option, losing that fight isn't a death or a wipe; later faints are", () => {
        const free = game.nuzlockeEngine({ firstRivalFree: true });
        const lab = new Run(game, { firstRivalFought: false }, free).trainerBattle(ids.wildA, 5).faint(0);
        expect(lab.engine.snap.outcome).toBeNull();
        expect(lab.engine.snap.dead).toEqual([]);
        expect(lab.events("info").some((e) => /first rival battle was lost/.test(e))).toBe(true);
        expect(lab.engine.snap.firstRival).toBe("lost-free");
        const later = new Run(game, { firstRivalFought: true }, game.nuzlockeEngine({ firstRivalFree: true })).goTo(places.route).trainerBattle(ids.wildA, 9).faint(0);
        expect(later.engine.snap.outcome).toMatchObject({ kind: "wipe" });
        const strict = new Run(game, { firstRivalFought: false }).trainerBattle(ids.wildA, 5).faint(0);
        expect(strict.engine.snap.outcome).toMatchObject({ kind: "wipe" }); // without the option it counts
        expect(strict.engine.snap.firstRival).toBe("lost");
        const won = new Run(game, { firstRivalFought: false }).trainerBattle(ids.wildA, 5).endBattle().poll({ firstRivalFought: true });
        expect(won.engine.snap.firstRival).toBe("won");
      });

      it("doesn't name a foe at 0 HP: it fainted, or the next isn't sent out yet", () => {
        const run = new Run(game).goTo(places.route).trainerBattle(ids.wildA, 9);
        expect(brief(run.engine, run.s).enemy).toMatch(/Lv9 100%HP/);
        run.s.enemy!.hp = 0; // a trainer's intro still holds the last battle's fainted foe
        expect(brief(run.engine, run.s).enemy).toMatch(/^none out right now/);
      });

      it("shows the Pokémon about to be sent out, with its moves, before the game fills in the battle slot", () => {
        const run = new Run(game).receiveGift(ids.wildB, "SPIKE").goTo(places.route).trainerBattle(ids.wildA, 9).faint(0);
        run.s.battleMon = { ...run.s.battleMon!, species: 0, maxHp: 0 }; // a new battle's intro: the slot is empty
        expect(brief(run.engine, run.s).lead).toMatch(/^SPIKE \(.+\) Lv\d+ \d+\/\d+HP \(being sent out\) \| moves: /);
      });

      it("says which way the player faces, except in the dark or a battle", () => {
        const run = new Run(game).receiveGift(ids.wildB, "SPIKE").goTo(places.route).poll({ facing: "up" });
        expect(brief(run.engine, run.s).location).toMatch(/ x\d+ y\d+ facing up$/);
        run.poll({ dark: true });
        expect(brief(run.engine, run.s).location).not.toMatch(/facing/);
        run.poll({ dark: false }).wildBattle(ids.wildA);
        expect(brief(run.engine, run.s).location).not.toMatch(/facing/);
      });

      it("lists nobody as dead while nobody is", () => {
        const run = new Run(game).receiveGift(ids.wildB, "SPIKE").goTo(places.route);
        expect(brief(run.engine, run.s).dead).toBeNull();
      });

      it("gives the level cap for the status line outside battle, and none in battle", () => {
        const run = new Run(game).goTo(places.route);
        expect(brief(run.engine, run.s).cap).toBe(run.engine.levelCap(run.s)?.level ?? null);
        expect(brief(run.engine, run.s).cap).toEqual(expect.any(Number));
        run.trainerBattle(ids.wildA, 9);
        expect(brief(run.engine, run.s).cap).toBeNull();
      });

      it("lists the maps entered since it was last asked, in order, then starts again", () => {
        const run = new Run(game).goTo(places.route);
        run.engine.takeMapsEntered();
        run.goTo(places.route2).goTo(places.route);
        expect(run.engine.takeMapsEntered()).toEqual([places.route2.mapConst, places.route.mapConst]);
        expect(run.engine.takeMapsEntered()).toEqual([]);
      });

      it("says how much poison took while walking, then starts again; and shows a poisoned Pokémon that isn't the lead", () => {
        const run = new Run(game).receiveGift(ids.wildB, "SPIKE").goTo(places.route).setMon(1, { status: 0x08, hp: 10 }).step()
          .setMon(1, { hp: 9 }).step().setMon(1, { hp: 8 }).step();
        expect(run.engine.takePoisonHurt()).toEqual([expect.stringMatching(/^SPIKE hurt by poison: 10→8\/\d+ HP$/)]);
        expect(run.engine.takePoisonHurt()).toEqual([]);
        expect(brief(run.engine, run.s).others).toMatch(/^SPIKE 8\/\d+HP PSN$/);
        // In battle the battle messages say it; a lead's status is on its own line already.
        run.setMon(1, { status: 0 });
        expect(brief(run.engine, run.s).others).toBeNull();
      });

      it("names the foe when the battle flag clears as the team goes down (Crystal), not poison", () => {
        const run = new Run(game).goTo(places.route).trainerBattle(ids.wildA, 9);
        run.poll((st) => ({ battle: 0, party: st.party.map((m) => ({ ...m, hp: 0 })) }));
        expect(run.engine.snap.outcome).toMatchObject({ kind: "wipe" });
        expect(run.engine.snap.outcome?.detail).not.toMatch(/poison/);
        expect(run.engine.snap.outcome?.detail).toMatch(/Lv9/);
      });

      it("ends the run when the last Pokémon faints outside battle (poison while walking)", () => {
        const run = new Run(game).goTo(places.route).step().faint(0);
        expect(run.engine.snap.outcome).toMatchObject({ kind: "wipe", detail: expect.stringMatching(/poison/) });
        expect(run.violations()).toEqual([]);
      });

      it("doesn't end the run when one of two faints outside battle", () => {
        const run = new Run(game).receiveGift(ids.wildB, "SPIKE").goTo(places.route).step().faint(0);
        expect(run.engine.snap.outcome).toBeNull();
      });
    });

    describe("the dead stay in the party", () => {
      // SPIKE dies in a trainer battle and is healed afterwards; it stays in the party (slot 1).
      const withDead = (extra?: string) => {
        const run = new Run(game).receiveGift(ids.wildB, "SPIKE");
        if (extra) run.receiveGift(ids.family[0], extra);
        return run.goTo(places.route).trainerBattle(ids.wildA).sendOut(1).faint(1).sendOut(0).endBattle()
          .setMon(1, { hp: 20 }) // healed (a Pokémon Center may)
          .step();
      };
      const leadWith = (run: Run, slot: number) => run.poll((s) => ({ party: [s.party[slot], ...s.party.filter((_, i) => i !== slot)] }));

      it("says a death is for good, and nothing else", () => {
        const run = withDead();
        expect(run.events("warning").find((e) => /died/.test(e))).toMatch(/died \(.+\)\. It can never battle again\.$/);
        expect(run.violations()).toEqual([]);
      });

      it("names the dead only while they're in the party, the only place they can be sent out from", () => {
        const run = withDead();
        expect(brief(run.engine, run.s).dead).toBeTruthy();
        run.poll((s) => ({ party: s.party.slice(0, 1) })); // boxed
        expect(run.engine.snap.dead).toHaveLength(1);
        expect(brief(run.engine, run.s).dead).toBeNull();
      });

      it("lets a dead Pokémon ride in the party and be healed, without a violation", () => {
        const run = withDead().step(3).goTo(places.route2).step(3);
        expect(run.s.party).toHaveLength(2);
        expect(run.engine.isDead(run.s.party[1].uid)).toBe(true);
        expect(run.violations()).toEqual([]);
      });

      it("flags a dead Pokémon leading a wild battle (the game sends the lead out)", () => {
        const run = leadWith(withDead(), 1).step().wildBattle(ids.wildA);
        expect(run.violations()).toEqual([expect.stringMatching(/is dead but was sent into battle/)]);
      });

      it("flags a dead Pokémon leading a trainer battle", () => {
        const run = leadWith(withDead(), 1).step().trainerBattle(ids.wildA);
        expect(run.violations()).toEqual([expect.stringMatching(/is dead but was sent into battle/)]);
      });

      it("flags a dead Pokémon picked when the one out faints (the forced switch)", () => {
        const run = withDead("BITEY").trainerBattle(ids.wildA).faint(0);
        expect(run.engine.snap.outcome).toBeNull(); // BITEY still stands
        run.sendOut(1);
        expect(run.violations()).toEqual([expect.stringMatching(/SPIKE.*is dead but was sent into battle/)]);
      });

      it("ends the run as a wipe at once when the last living one faints in battle, a healed dead one standing", () => {
        for (const battle of ["wild", "trainer"] as const) {
          const run = withDead();
          if (battle === "wild") run.wildBattle(ids.wildA);
          else run.trainerBattle(ids.wildA);
          run.faint(0);
          expect(run.engine.snap.outcome).toMatchObject({ kind: "wipe" });
          expect(run.violations()).toEqual([]);
        }
      });

      it("ends the run as a wipe when poison takes the last living one while walking, a healed dead one standing", () => {
        const run = withDead().step().faint(0);
        expect(run.engine.snap.outcome).toMatchObject({ kind: "wipe", detail: expect.stringMatching(/poison/) });
      });

      it("doesn't call it a wipe while a living one stands", () => {
        const run = withDead("BITEY").trainerBattle(ids.wildA).faint(0);
        expect(run.engine.snap.outcome).toBeNull();
      });

      it("loses the run (not a wipe) when the only living one standing may not battle, the rest dead or fainted", () => {
        // BITEY is over the cap as the battle starts; the lead faints; a healed dead SPIKE stands too.
        const run = withDead("BITEY").setMon(2, { level: caps.first.level + 1 }).step().trainerBattle(ids.wildA).faint(0);
        for (let i = 0; i < 5; i++) run.poll();
        expect(run.engine.snap.outcome).toMatchObject({ kind: "lost" });
        expect(run.violations()).toEqual([]);
      });

      it("names the dead outside battle while in the party, and not in battle", () => {
        const run = leadWith(withDead(), 1).step();
        expect(brief(run.engine, run.s).dead).toBe("SPIKE (the game sends it out first)"); // the lead, with HP
        expect(brief(run.engine, run.s).lead).not.toMatch(/dead/); // the list says it, not the lead's own line
        run.poll((s) => ({ party: [s.party[1], s.party[0]] })).setMon(1, { status: 0x08 }).step();
        expect(brief(run.engine, run.s).dead).toBe("SPIKE"); // no longer the lead
        expect(brief(run.engine, run.s).others).toMatch(/^SPIKE \d+\/\d+HP PSN$/);
        run.poll((s) => ({ party: [s.party[0]] })).step();
        expect(brief(run.engine, run.s).dead).toBeNull(); // boxed
        run.wildBattle(ids.wildA, 3);
        expect(brief(run.engine, run.s).dead).toBeNull();
      });
    });

    describe("level caps (the usual Hardcore rule)", () => {
      it("sets the cap from the next boss, raises it with each badge, and caps the League at its last member", () => {
        const run = new Run(game);
        expect(run.engine.levelCap(run.s)).toEqual(caps.first);
        run.poll({ badges: caps.firstBadge });
        expect(run.engine.levelCap(run.s)).toEqual(caps.second);
        run.poll({ badges: 0xff });
        expect(run.engine.levelCap(run.s)).toEqual(caps.league);
      });

      it("warns (but doesn't flag) a Pokémon over the cap out of battle", () => {
        const run = new Run(game).setMon(0, { level: caps.first.level + 1 }).step();
        expect(run.events("warning")).toHaveLength(1);
        expect(run.violations()).toEqual([]);
      });

      it("lets a Pokémon over the cap ride in the party; it may not battle", () => {
        const run = new Run(game).receiveGift(ids.wildB, "SPIKE", caps.first.level + 1).goTo(places.route).trainerBattle(ids.wildA);
        expect(run.violations()).toEqual([]);
        run.sendOut(1);
        expect(run.violations()).toHaveLength(1);
      });

      it("flags leading with a Pokémon over the cap", () => {
        const run = new Run(game).setMon(0, { level: caps.first.level + 1 }).goTo(places.route).wildBattle(ids.wildA);
        expect(run.violations()).toHaveLength(1);
      });

      it("allows passing the cap during a battle; from the next battle it may not battle", () => {
        const run = new Run(game).setMon(0, { level: caps.first.level }).goTo(places.route).trainerBattle(ids.wildA).useMove()
          .setMon(0, { level: caps.first.level + 1 }).useMove().useMove().endBattle();
        expect(run.violations()).toEqual([]);
        run.step().trainerBattle(ids.wildA);
        expect(run.violations()).toHaveLength(1);
      });
    });

    describe("no Pokémon left that may battle", () => {
      const over = caps.first.level + 1;
      const lost = (run: Run) => run.engine.snap.outcome?.kind === "lost";

      it("loses the run once every living Pokémon is over the cap, without a violation", () => {
        const run = new Run(game).setMon(0, { level: over }).step(5);
        expect(run.engine.snap.outcome).toMatchObject({ kind: "lost", detail: expect.stringMatching(/^No Pokémon left that may battle/) });
        expect(run.violations()).toEqual([]);
      });

      it("counts the dead out", () => {
        const run = new Run(game).receiveGift(ids.wildB, "SPIKE", over).goTo(places.route).wildBattle(ids.wildA).faint(0).endBattle().step(5);
        expect(lost(run)).toBe(true);
      });

      it("doesn't while one in the PC is at or under the cap", () => {
        const run = new Run(game).deposit(ids.wildA, caps.first.level).setMon(0, { level: over }).step(5);
        expect(run.engine.snap.outcome).toBeNull();
      });

      it("waits for a walk after a battle, so a badge can raise the cap first", () => {
        const run = new Run(game).setMon(0, { level: caps.first.level }).goTo(places.route).trainerBattle(ids.wildA)
          .setMon(0, { level: over }).endBattle();
        for (let i = 0; i < 5; i++) run.poll();
        run.poll({ badges: caps.firstBadge }).step(5);
        expect(run.engine.snap.outcome).toBeNull();
      });

      it("loses a trainer battle at once when only Pokémon that may not battle are standing", () => {
        const run = new Run(game).receiveGift(ids.wildB, "SPIKE", over).goTo(places.route).trainerBattle(ids.wildA).faint(0);
        for (let i = 0; i < 4; i++) run.poll();
        expect(lost(run)).toBe(true);
        expect(run.violations()).toEqual([]);
      });

      it("lets a wild battle be fled when the PC holds one that may battle", () => {
        const run = new Run(game).deposit(ids.wildA, 5).receiveGift(ids.wildB, "SPIKE", over).goTo(places.route).wildBattle(ids.wildA).faint(0);
        for (let i = 0; i < 4; i++) run.poll();
        run.endBattle().step(5);
        expect(run.engine.snap.outcome).toBeNull();
      });
    });

    describe("Rare Candies and the cap, counted", () => {
      it("counts levels gained outside battle as candies, and candying to exactly the cap", () => {
        const start = new Run(game).s.party[0].level;
        const run = new Run(game).setMon(0, { level: caps.first.level - 1 }).setMon(0, { level: caps.first.level }).step();
        expect(run.engine.snap.candies).toBe(caps.first.level - start);
        expect(run.engine.snap.candiedToCap).toHaveLength(1);
        expect(run.engine.snap.overCap).toEqual([]);
      });

      it("doesn't count levels from battles, but counts going over the cap", () => {
        const run = new Run(game).receiveGift(ids.wildB, "SPIKE").setMon(0, { level: caps.first.level }).goTo(places.route)
          .trainerBattle(ids.wildA).setMon(0, { level: caps.first.level + 1 }).endBattle().step();
        const candies = run.engine.snap.candies;
        expect(run.engine.snap.overCap).toHaveLength(1);
        run.step(3);
        expect(run.engine.snap.candies).toBe(candies);
        expect(run.engine.snap.overCap).toHaveLength(1);
      });
    });

    describe("hard level caps (option)", () => {
      it("asks the game to stop experience at the cap, rising with each badge; not when the option is off", () => {
        const run = new Run(game, undefined, game.nuzlockeEngine({ hardLevelCaps: true }));
        expect(run.engine.levelCapForRom(run.s)).toBe(caps.first.level);
        run.poll({ badges: caps.firstBadge });
        expect(run.engine.levelCapForRom(run.s)).toBe(caps.second.level);
        expect(new Run(game).engine.levelCapForRom(new Run(game).s)).toBeNull();
      });

      it("once the League is underway experience may pass the cap, but Rare Candies still stop there", () => {
        const run = new Run(game, undefined, game.nuzlockeEngine({ hardLevelCaps: true }));
        expect(run.engine.candyCapForRom(run.s)).toBe(caps.first.level); // with experience, before the League
        run.poll({ badges: 0xff });
        expect(run.engine.levelCapForRom(run.s)).toBe(caps.league.level);
        expect(run.engine.candyCapForRom(run.s)).toBe(caps.league.level);
        run.goTo(places.leagueUnderway);
        expect(run.engine.levelCapForRom(run.s)).toBe(game.adapter.data.maxLevel);
        expect(run.engine.candyCapForRom(run.s)).toBe(caps.league.level);
      });

      it("sets no candy cap when the option is off", () => {
        const run = new Run(game);
        expect(run.engine.candyCapForRom(run.s)).toBeNull();
        run.poll({ badges: 0xff }).goTo(places.leagueUnderway);
        expect(run.engine.candyCapForRom(run.s)).toBeNull();
      });
    });

    describe("items", () => {
      it("flags a healing item used in battle", () => {
        const run = new Run(game).goTo(places.route).trainerBattle(ids.wildA).useItem(ids.potion);
        expect(run.violations()).toHaveLength(1);
      });

      it("allows Poké Balls in battle and healing items outside it", () => {
        const run = new Run(game).useItem(ids.potion).goTo(places.route).wildBattle(ids.wildA).useItem(ids.ball);
        expect(run.violations()).toEqual([]);
      });
    });

    describe("end the run on a violation (option)", () => {
      const strictRun = () => new Run(game, undefined, game.nuzlockeEngine({ endOnViolation: true }));

      it("ends the run at the first violation, as disqualified", () => {
        const run = strictRun().goTo(places.route).trainerBattle(ids.wildA).useItem(ids.potion);
        expect(run.engine.snap.outcome).toMatchObject({ kind: "disqualified", detail: expect.stringMatching(/^Disqualified: Used /) });
        expect(run.violations()).toHaveLength(1);
      });

      it("records nothing after that", () => {
        const run = strictRun().goTo(places.route).trainerBattle(ids.wildA).useItem(ids.potion).useItem(ids.potion).endBattle().step();
        expect(run.violations()).toHaveLength(1);
      });

      it("only logs rules set to logged-only at the start, and still ends the run on the others", () => {
        const run = new Run(game, undefined, game.nuzlockeEngine({ endOnViolation: true, lenientRules: ["items-in-battle"] }))
          .goTo(places.route).trainerBattle(ids.wildA).useItem(ids.potion);
        expect(run.violations()).toHaveLength(1);
        expect(run.engine.snap.violations[0].rule).toBe("items-in-battle");
        expect(run.engine.snap.outcome).toBeNull();
        run.faint(0); // a wipe isn't a violation either
        expect(run.engine.snap.outcome).toMatchObject({ kind: "wipe" });
      });

      it("files every violation under a rule", () => {
        const run = new Run(game).goTo(places.route).trainerBattle(ids.wildA).useItem(ids.potion).endBattle()
          .step().wildBattle(ids.wildA).catchWild(game.speciesName(ids.wildA)).step();
        expect(run.engine.snap.violations.map((v) => v.rule)).toEqual(["items-in-battle", "nickname"]);
      });

      it("leaves a clean run alone", () => {
        const run = strictRun().goTo(places.route).wildBattle(ids.wildA).catchWild("BITEY").step(2);
        expect(run.engine.snap.outcome).toBeNull();
      });
    });

    it("requires battle style Set", () => {
      const run = new Run(game, { options: 0 }, game.nuzlockeEngine({ endOnViolation: true })).step();
      expect(run.engine.snap.violations.map((v) => v.rule)).toEqual(["battle-style"]);
      expect(run.engine.snap.outcome).toMatchObject({ kind: "disqualified" });
    });

    it("keeps every violation, even past the event log's limit", () => {
      const run = new Run(game).goTo(places.route).trainerBattle(ids.wildA);
      for (let i = 0; i < 160; i++) run.useItem(ids.potion).poll((s) => ({ bag: s.bag.map((b) => (b.id === ids.potion ? { ...b, qty: b.qty + 1 } : b)) }));
      expect(run.engine.snap.events.length).toBeLessThanOrEqual(300);
      expect(run.engine.snap.violations).toHaveLength(160);
    });

    it("records victory on reaching the Hall of Fame", () => {
      const run = new Run(game).goTo(places.hallOfFame);
      expect(run.engine.snap.outcome).toMatchObject({ kind: "victory" });
    });

    it("with a badge goal (short run), wins on that badge — and not before", () => {
      const run = new Run(game, undefined, game.nuzlockeEngine({ goalBadges: 1 })).goTo(places.route);
      expect(run.engine.snap.outcome).toBeNull();
      run.poll({ badges: caps.firstBadge });
      expect(run.engine.snap.outcome).toMatchObject({ kind: "victory", detail: expect.stringMatching(/first badge/) });
    });

    it("without a goal, a badge is just a badge", () => {
      const run = new Run(game).poll({ badges: caps.firstBadge });
      expect(run.engine.snap.outcome).toBeNull();
    });
  });
}
