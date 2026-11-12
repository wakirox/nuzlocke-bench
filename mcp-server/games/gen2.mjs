// Gen 2 (Crystal): what the Node side needs to know about the game's story and data, with the
// same fields as gen1.mjs. Map ids are pret pokecrystal's map constants, trainer classes its
// trainer_constants; labels name no characters or places. The run ends at the Hall of Fame, after
// Johto's eight badges (Kanto isn't part of it).

/** Key items by id (pokecrystal item_constants), so the steps can check the bag. */
const ITEM = { egg: 69, squirtBottle: 175, secretPotion: 67, redScale: 66, cardKey: 127, basementKey: 133, clearBell: 70 };

export const GEN2 = {
  versions: ["crystal"],
  // Work in progress: playable, but its runs aren't scored or ranked (docs/benchmark.md).
  experimental: true,
  // The maps before the first rival battle (in the second town, after the errand south of it):
  // the player can't get further before that fight.
  home: new Set([
    "NEW_BARK_TOWN", "ELMS_LAB", "ELMS_HOUSE", "PLAYERS_HOUSE_1F", "PLAYERS_HOUSE_2F", "PLAYERS_NEIGHBORS_HOUSE",
    "ROUTE_29", "ROUTE_29_ROUTE_46_GATE", "CHERRYGROVE_CITY", "CHERRYGROVE_POKECENTER_1F", "CHERRYGROVE_MART", "GUIDE_GENTS_HOUSE",
    "CHERRYGROVE_GYM_SPEECH_HOUSE", "CHERRYGROVE_EVOLUTION_SPEECH_HOUSE", "ROUTE_30", "ROUTE_30_BERRY_HOUSE", "MR_POKEMONS_HOUSE",
  ]),
  /**
   * Trainer classes whose battles are the run's big fights (pokecrystal trainer_constants): the
   * rival (both classes), the eight gym leaders, the Elite Four, the Champion and the gang's executives.
   */
  bigFightClasses: new Set([9, 42, 1, 2, 3, 4, 5, 6, 7, 8, 11, 15, 13, 14, 16, 51, 55]),
  /** The story's objectives in order, as gen1.mjs's: a badge count, a first visit, or a rival beaten on a map. */
  objectives: [
    { id: "rival1", label: "Rival 1", rival: "CHERRYGROVE_CITY" },
    { id: "badge1", label: "Badge 1", badges: 1 },
    { id: "cave1", label: "Through the first cave", maps: ["AZALEA_TOWN"] },
    { id: "well", label: "The well's gang cleared", maps: ["SLOWPOKE_WELL_B1F"] },
    { id: "badge2", label: "Badge 2", badges: 2 },
    { id: "rival2", label: "Rival 2", rival: "AZALEA_TOWN" },
    { id: "forest", label: "Through the forest", maps: ["ROUTE_34"] },
    { id: "badge3", label: "Badge 3", badges: 3 },
    { id: "rival3", label: "Rival 3", rival: "BURNED_TOWER_1F" },
    { id: "badge4", label: "Badge 4", badges: 4 },
    { id: "badge5", label: "Badge 5", badges: 5 },
    { id: "badge6", label: "Badge 6", badges: 6 },
    { id: "hideout", label: "The gang's hideout", maps: ["TEAM_ROCKET_BASE_B3F"] },
    { id: "badge7", label: "Badge 7", badges: 7 },
    { id: "rival4", label: "Rival 4", rival: "GOLDENROD_UNDERGROUND" },
    { id: "tower", label: "Broadcast tower's top floor", maps: ["RADIO_TOWER_5F"] },
    { id: "icePath", label: "Through the ice cave", maps: ["BLACKTHORN_CITY"] },
    { id: "badge8", label: "Badge 8", badges: 8 },
    { id: "rival5", label: "Rival 5", rival: "VICTORY_ROAD" },
    { id: "league", label: "League building", maps: ["INDIGO_PLATEAU_POKECENTER_1F"] },
    { id: "elite1", label: "Elite room 1", maps: ["WILLS_ROOM"] },
    { id: "elite2", label: "Elite room 2", maps: ["KOGAS_ROOM"] },
    { id: "elite3", label: "Elite room 3", maps: ["BRUNOS_ROOM"] },
    { id: "elite4", label: "Elite room 4", maps: ["KARENS_ROOM"] },
    { id: "champion", label: "Champion beaten", maps: ["HALL_OF_FAME"] },
  ],
  rivalClasses: new Set([9, 42]),
  /** The hard stretches of the game: their maps, and the milestone that says they're done. */
  hardAreas: [
    { id: "cave", label: "First cave", prefix: "UNION_CAVE_", done: "cave1" },
    { id: "well", label: "The well", prefix: "SLOWPOKE_WELL_", done: "badge2" },
    { id: "forest", label: "Forest", prefix: "ILEX_FOREST", done: "forest" },
    { id: "hideout", label: "Gang's hideout", prefix: "TEAM_ROCKET_BASE_", done: "badge7" },
    { id: "tower", label: "Broadcast tower", prefix: "RADIO_TOWER_", done: "tower" },
    { id: "icePath", label: "Ice cave", prefix: "ICE_PATH_", done: "icePath" },
    { id: "lastCave", label: "Last cave", prefix: "VICTORY_ROAD", not: "VICTORY_ROAD_GATE", done: "league" },
  ],
  hintItems: ITEM,
  /**
   * The story's next step from the state (checked against pokecrystal's map scripts). Gyms in the
   * game's own order: the eight leaders are fought in badge order here.
   */
  hintSteps: [
    {
      when: (s) => !s.party,
      text: "Your first partner is in the professor's lab, west of your house in your home town: talk to him, then pick one of the three balls on the table at the back (walk_to it with interact, answer YES).",
    },
    {
      // A badge or the rival fight proves the errand done (a resumed run's log starts after it).
      when: (s) => s.badges < 1 && !s.rivalFought && !s.has(ITEM.egg) && !s.visited.has("MR_POKEMONS_HOUSE"),
      text: "The professor's errand: west along the route to the next town, then north up the route from there. The house you're sent to is at that route's north-east end (the west path north stays blocked by a scene of young trainers until the errand is done).",
    },
    {
      when: (s) => s.has(ITEM.egg),
      text: "Take the egg back to the professor's lab in your home town. Your rival waits in the town on the way and battles you. In the lab, talk to the professor; on your way out his aide gives you Poké Balls (needed to catch anything).",
    },
    {
      when: (s) => s.badges < 1,
      text: "North from the town past your home town: the route north (its west path is open now), then the next route north reaches the first gym's town. The gym is on its west side. (The tall tower there holds the light HM: optional.)",
    },
    {
      when: (s) => s.badges < 2 && !s.visited.has("AZALEA_TOWN"),
      text: "South from the first gym's town along the long route, through the cave at its south end, then east: the second gym's town.",
    },
    {
      when: (s) => s.badges < 2,
      text: "In the second gym's town the gang has taken the well at its north edge: go down into it and beat them (the gym is shut until then). Then the gym.",
    },
    {
      when: (s) => s.badges < 3 && !s.visited.has("ROUTE_34"),
      text: "West of the second gym's town is a forest. A charcoal maker's lost bird must be herded back to its owner at the forest's entrance (walk behind it to push it the other way); then he gives the cutting HM. Cut the tree further in to pass north.",
    },
    {
      when: (s) => s.badges < 3,
      text: "North of the forest is the big city. Its gym (the third) is in the city's middle-west.",
    },
    {
      when: (s) => s.badges < 4 && !s.has(ITEM.squirtBottle) && !s.visited.has("ECRUTEAK_CITY"),
      text: "A strange tree blocks the route north-east of the big city. After the third badge, talk to the girl standing near it, then to her sister at the city's flower shop: she gives a watering can (SQUIRTBOTTLE). Use it (use_item) facing the tree: it attacks, then the way north to the fourth gym's town is open.",
    },
    {
      when: (s) => s.badges < 4 && !s.visited.has("BURNED_TOWER_1F"),
      text: "In the fourth gym's town the gym is closed: its leader is at the burned tower in the town's north-west. Go in (your rival is there) and down the hole to the basement.",
    },
    {
      when: (s) => s.badges < 4,
      text: "Back in the fourth gym's town the gym is open now (south-west of the town). Inside, only some floor tiles are safe: walk where the map shows floor.",
    },
    {
      when: (s) => s.badges < 5,
      text: "West of the fourth gym's town, the routes lead to the port city. Its gym leader is up the lighthouse (east side) tending a sick Pokémon: climb it (a hole on the 4th floor leads on) and talk to her at the top. She asks for medicine from across the sea. Get the boulder-pushing HM in the port city's café first (the island gym needs it), and the surfing HM from the dance theater in the fourth gym's town (beat its five dancers). Then surf south-west from the port city to the island city. Its gym is the fifth (fighting types: push the boulders aside with field_move STRENGTH); after it, a woman outside gives the flying HM.",
    },
    {
      when: (s) => s.badges < 6 && !s.has(ITEM.secretPotion),
      text: "On the island city the pharmacy gives the medicine (SECRETPOTION) once the port city's leader has told you about the sickness.",
    },
    {
      when: (s) => s.badges < 6,
      text: "Take the medicine to the top of the port city's lighthouse and give it; its leader then returns to her gym (the sixth). The boulder-pushing HM is in the port city's café.",
    },
    {
      when: (s) => s.badges < 7 && !s.visited.has("TEAM_ROCKET_BASE_B1F"),
      text: "East of the fourth gym's town (surf across the route; skip the mountain's cave) lies a small town; north of it, through a gate where the gang charges a toll, is the lake. Surf to its middle and beat or catch the red Gyarados, then talk to the dragon trainer by the sign and agree to help. Back in the small town, the shop hides the gang's hideout: go in.",
    },
    {
      when: (s) => s.badges < 7,
      text: "Clear the gang's hideout under the small town's shop: a statue on the first floor sets off alarms until the scientist's computer turns them off; two grunts on the bottom floor tell the door's passwords; then knock out the Electrode powering the machine (the dragon trainer helps). He gives the whirlpool HM. Then the small town's gym opens (the seventh, ice types, on a slippery floor).",
    },
    {
      when: (s) => s.badges >= 7 && !s.has(ITEM.basementKey) && !s.has(ITEM.cardKey) && !s.has(ITEM.clearBell),
      text: "With seven badges the gang takes over the broadcast tower in the big city. Climb it to the 5th floor: the 'director' there is a fake; beat him for the BASEMENT_KEY.",
    },
    {
      when: (s) => s.has(ITEM.basementKey) && !s.has(ITEM.cardKey),
      text: "The real director is held below the big city: enter the underground (entrance north of the broadcast tower), open the basement door with the key, and go down (your rival waits). Flip the switches 3rd, then 2nd, then 1st to open the shutters, and the emergency switch; the director at the far end gives the CARD_KEY.",
    },
    {
      when: (s) => s.has(ITEM.cardKey) && !s.has(ITEM.clearBell),
      text: "Back to the broadcast tower: the key opens the locked door on its 3rd floor. Beat the gang down to the 1st floor, where its leaders are; the director then gives a bell (CLEAR_BELL).",
    },
    {
      when: (s) => s.badges < 8 && !s.visited.has("BLACKTHORN_CITY"),
      text: "East of the small town (open once the hideout is cleared), the route leads to the ice cave: slide across the ice floors (each slide goes until something stops you), take the waterfall HM inside, and push boulders into the holes on the lower floor (field_move STRENGTH). Beyond the cave is the last gym's town.",
    },
    {
      when: (s) => s.badges < 8,
      text: "The last gym (dragons) has boulders to push into holes (field_move STRENGTH). Beaten, the leader still wants you to pass a test in the dragon's den behind the gym: down its ladder, surf round, clear the whirlpool (field_move WHIRLPOOL) and enter the shrine; answer the elder as a caring trainer would. Then she gives the badge.",
    },
    {
      when: (s) => !s.visited.has("VICTORY_ROAD") && s.badges >= 8,
      text: "From your home town surf east (field_move SURF at the shore) along the long route; in the falls cave climb the waterfall (field_move WATERFALL), clear a whirlpool further on, then go north past the gate that checks your eight badges to the last cave. Your rival waits at its exit.",
    },
  ],
  // Checked against pokecrystal's map scripts and a full walkthrough (the owner's, 2026-11-11).
  // No dark stretch on the way (the dark cave is a side path).
  darkMaps: new Set(),
  afterTheDark: null,
};
