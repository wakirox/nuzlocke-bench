// Every game the shared suites run against. To add one, write its fixture
// (see tests/README.md) and list it here.

import type { GameFixture } from "../harness/game-fixture";
import { gen1Fixture } from "./gen1/fixture";

export const GAMES: GameFixture[] = [
  gen1Fixture("red"),
  // Rules are the same in Blue and Yellow; their RAM differences are covered in gen1/ram.test.ts.
];
