// Runs the shared Hardcore Nuzlocke suite against every game in tests/games.
import { GAMES } from "../games";
import { nuzlockeRuleSuite } from "./nuzlocke.suite";

for (const game of GAMES) nuzlockeRuleSuite(game);
