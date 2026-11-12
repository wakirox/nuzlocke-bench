// Catching: throwing a ball, the Pokédex page and the nickname prompt after it.

import type { BridgeCore } from "./bridge-core";
import type { Menus } from "./menus";

export class Capture {
  constructor(private core: BridgeCore, private menus: Menus) {}

  /** In a wild battle: throw a ball; on a catch, answer the nickname prompt with `nick`. */
  async throwBall(nick: string | null, kind: string | null): Promise<unknown> {
    const s = this.core.summary();
    if (s?.battle !== "wild") throw new Error("Balls are only thrown in wild battles.");
    // The game would take it, but the rules count the species' own name as no nickname.
    const foe = (s as { enemy?: { species?: string } }).enemy?.species;
    if (nick && foe && nick.toUpperCase().replace(/\s+/g, "") === foe.toUpperCase().replace(/\s+/g, "")) {
      throw new Error(`"${nick.toUpperCase()}" is its species name, which isn't a nickname (Nuzlocke rule). Nothing was thrown.`);
    }
    if (!this.menus.atSafariMenu() && !this.menus.atBattleMenu()) await this.menus.advanceText(20);
    if (this.menus.atSafariMenu()) return this.throwSafariBall(nick);
    const owned = (name: string) => (s.bag ?? []).some((b) => b.item === name && b.qty > 0);
    const names = this.core.layout.balls;
    const kinds = Object.keys(names);
    // Which ball is the player's call, never the harness's.
    const pick = kind ? names[kind] : null;
    if (!pick) throw new Error(`Say which ball: ${kinds.slice(0, -1).join(", ")} or ${kinds.at(-1)} (in the bag: ${(s.bag ?? []).filter((b) => /BALL/.test(b.item)).map((b) => `${b.item}×${b.qty}`).join(", ") || "none"}).`);
    if (!owned(pick)) throw new Error(`No ${pick} in the bag.`);
    const messages: string[] = [];
    if (!this.menus.atBattleMenu()) messages.push(...(await this.menus.advanceText(20)).messages);
    if (!this.menus.atBattleMenu()) throw new Error(`Not at the battle menu. Screen:\n${this.core.screenText().join("\n")}`);
    await this.menus.choose(this.core.layout.battleMenu.bag.label);
    let r = (await this.menus.chooseInBag(pick)) as { messages?: string[]; stopped?: string };
    // Gen 2 asks USE / QUIT before throwing (its description is all the text so far).
    if (this.menus.cursorOn("USE")) r = (await this.menus.choose("USE")) as typeof r;
    messages.push(...(r.messages ?? []));
    // "X was" / "caught!" on a catch; a near miss only says it appeared to be.
    const caught = messages.some((m) => this.core.layout.texts.caught.test(m.trim()) && !/appeared/i.test(m));
    let stopped = r.stopped;
    // A new species shows its Pokédex entry before the nickname prompt: page past it.
    for (let i = 0; caught && i < 6 && !this.menus.cursorOn("YES"); i++) {
      await this.core.tap("a", 4, 40);
      messages.push(...(await this.menus.advanceText(10)).messages);
    }
    if (caught && this.menus.cursorOn("YES")) {
      if (nick) {
        await this.core.tap("a", 4, 60); // YES → the naming keyboard
        await this.menus.typeName(nick.toUpperCase());
        messages.push(`Nicknamed ${nick.toUpperCase()}.`); // the prompt above is in the messages: it's answered
        const after = await this.menus.advanceText(30);
        messages.push(...after.messages);
        stopped = after.stopped;
      } else {
        stopped = "caught — the nickname prompt is open (answer YES and name it: press 'a name:XXXX')";
      }
    }
    return this.core.result({ threw: pick, caught, messages, stopped });
  }

  /** The game reserve: BALL from its own menu; the Pokémon may also flee between throws. */
  private async throwSafariBall(nick: string | null): Promise<unknown> {
    const r = (await this.menus.choose("BALL")) as { messages?: string[]; stopped?: string };
    const messages = [...(r.messages ?? [])];
    const caught = messages.some((m) => this.core.layout.texts.caught.test(m.trim()) && !/appeared/i.test(m));
    // eslint-disable-next-line no-control-regex -- the game's text uses \x08 as a control code
    const fled = !caught && messages.some((m) => /ran!|ran away|fled/i.test(m));
    let stopped = r.stopped;
    if (caught) {
      // The Pokédex entry for a new species sits between the catch and the nickname prompt.
      for (let i = 0; i < 6 && !this.menus.cursorOn("YES"); i++) {
        await this.core.tap("a", 4, 40);
        messages.push(...(await this.menus.advanceText(10)).messages);
      }
      if (this.menus.cursorOn("YES") && nick) {
        await this.core.tap("a", 4, 60);
        await this.menus.typeName(nick.toUpperCase());
        messages.push(`Nicknamed ${nick.toUpperCase()}.`); // the prompt above is in the messages: it's answered
        const after = await this.menus.advanceText(30);
        messages.push(...after.messages);
        stopped = after.stopped;
      } else if (this.menus.cursorOn("YES")) {
        stopped = "caught — the nickname prompt is open (answer YES and name it: press 'a name:XXXX')";
      }
    }
    return this.core.result({ threw: "SAFARI BALL", caught, fled, messages, stopped });
  }
}
