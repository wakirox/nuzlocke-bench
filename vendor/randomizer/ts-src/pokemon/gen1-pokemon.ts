// SPDX-License-Identifier: GPL-3.0-or-later
// Port of UPR-ZX's Gen1Pokemon.java (added by nuzlocke-bench): Gen 1 has a
// single Special stat, so stat math must use 5 stats. Without this subclass
// the generic 6-stat code spreads BST into spatk/spdef, which Gen 1 never
// writes back, and every randomized Pokémon loses a chunk of its BST.

import { Pokemon } from "./pokemon";

export class Gen1Pokemon extends Pokemon {
  constructor() {
    super();
    this.shuffledStatsOrder = [0, 1, 2, 3, 4];
  }

  public override copyShuffledStatsUpEvolution(evolvesFrom: Pokemon): void {
    const order = this.shuffledStatsOrder;
    this.shuffledStatsOrder = [0, 1, 2, 3, 4].map((i) => order.indexOf(i));
    this.applyShuffledOrderToStats();
    this.shuffledStatsOrder = (evolvesFrom as Gen1Pokemon).shuffledStatsOrder;
    this.applyShuffledOrderToStats();
  }

  protected override applyShuffledOrderToStats(): void {
    const stats = [this.hp, this.attack, this.defense, this.special, this.speed];
    this.hp = stats[this.shuffledStatsOrder[0]];
    this.attack = stats[this.shuffledStatsOrder[1]];
    this.defense = stats[this.shuffledStatsOrder[2]];
    this.special = stats[this.shuffledStatsOrder[3]];
    this.speed = stats[this.shuffledStatsOrder[4]];
  }

  public override randomizeStatsWithinBST(random: () => number): void {
    // Minimum 20 HP, 10 everything else
    const bst = this.bst() - 60;
    const hpW = random(), atkW = random(), defW = random();
    const specW = random(), speW = random();
    const totW = hpW + atkW + defW + specW + speW;

    this.hp = Math.max(1, Math.round((hpW / totW) * bst)) + 20;
    this.attack = Math.max(1, Math.round((atkW / totW) * bst)) + 10;
    this.defense = Math.max(1, Math.round((defW / totW) * bst)) + 10;
    this.special = Math.max(1, Math.round((specW / totW) * bst)) + 10;
    this.speed = Math.max(1, Math.round((speW / totW) * bst)) + 10;

    if (this.hp > 255 || this.attack > 255 || this.defense > 255 || this.special > 255 || this.speed > 255) {
      this.randomizeStatsWithinBST(random);
    }
  }

  public override copyRandomizedStatsUpEvolution(evolvesFrom: Pokemon): void {
    const bstRatio = this.bst() / evolvesFrom.bst();
    this.hp = Math.min(255, Math.max(1, Math.round(evolvesFrom.hp * bstRatio)));
    this.attack = Math.min(255, Math.max(1, Math.round(evolvesFrom.attack * bstRatio)));
    this.defense = Math.min(255, Math.max(1, Math.round(evolvesFrom.defense * bstRatio)));
    this.speed = Math.min(255, Math.max(1, Math.round(evolvesFrom.speed * bstRatio)));
    this.special = Math.min(255, Math.max(1, Math.round(evolvesFrom.special * bstRatio)));
  }

  public override assignNewStatsForEvolution(evolvesFrom: Pokemon, random: () => number): void {
    const bstDiff = this.bst() - evolvesFrom.bst();
    const hpW = random(), atkW = random(), defW = random();
    const specW = random(), speW = random();
    const totW = hpW + atkW + defW + specW + speW;

    this.hp = Math.min(255, Math.max(1, evolvesFrom.hp + Math.round((hpW / totW) * bstDiff)));
    this.attack = Math.min(255, Math.max(1, evolvesFrom.attack + Math.round((atkW / totW) * bstDiff)));
    this.defense = Math.min(255, Math.max(1, evolvesFrom.defense + Math.round((defW / totW) * bstDiff)));
    this.speed = Math.min(255, Math.max(1, evolvesFrom.speed + Math.round((speW / totW) * bstDiff)));
    this.special = Math.min(255, Math.max(1, evolvesFrom.special + Math.round((specW / totW) * bstDiff)));
  }

  public override bst(): number {
    return this.hp + this.attack + this.defense + this.special + this.speed;
  }

  public override bstForPowerLevels(): number {
    return this.bst();
  }

  public override getAttackSpecialAttackRatio(): number {
    return this.attack / (this.attack + this.special);
  }
}
