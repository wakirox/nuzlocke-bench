// Gen 1 (Red, Blue, Yellow): what the Node side needs to know about the game's story and data:
// milestones, the home town, big-fight trainer classes, hard areas and the hint steps. Another
// generation gets a module of its own with the same fields (games/index.mjs picks by version).
// Map and item ids are the game's own constants; labels and hint texts name no characters or places.

/** Key items by id (the same in every Gen 1 version), so the steps can check the bag. */
const ITEM = {
  bicycle: 0x06, secretKey: 0x2b, bikeVoucher: 0x2d, cardKey: 0x30, drinks: [0x3c, 0x3d, 0x3e], ticket: 0x3f,
  goldTeeth: 0x40, parcel: 0x46, scope: 0x48, flute: 0x49, liftKey: 0x4a, cutHm: 0xc4, surfHm: 0xc6, strengthHm: 0xc7,
};

export const GEN1 = {
  versions: ["red", "blue", "yellow"],
  // The home town's maps (by their map constants): the first rival battle is fought before the player can leave them.
  home: new Set(["PALLET_TOWN", "OAKS_LAB", "REDS_HOUSE_1F", "REDS_HOUSE_2F", "BLUES_HOUSE"]),
  /**
   * Trainer classes whose battles are the run's big fights (pret trainer_constants, the same in Red,
   * Blue and Yellow): the rival, the gym leaders, the gang's boss and the Elite Four.
   */
  bigFightClasses: new Set([0x19, 0x2a, 0x2b, 0x1d, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, 0x2c, 0x21, 0x2e, 0x2f]),
  /**
   * The story's objectives in order: each is reached by a badge count, or the first time the player
   * stands on one of its maps (a map that can only be reached once that step is done). Labels don't
   * name characters or places. "Cottage step done" is leaving the second gym's town south or east:
   * the way stays shut until the cottage past the bridge has been visited and its task done.
   */
  objectives: [
    { id: "rival1", label: "Rival 1", rival: "OAKS_LAB" },
    { id: "badge1", label: "Badge 1", badges: 1 },
    { id: "cave1", label: "Through the first cave", maps: ["CERULEAN_CITY"] },
    { id: "badge2", label: "Badge 2", badges: 2 },
    { id: "rival2", label: "Rival 2", rival: "CERULEAN_CITY" },
    { id: "cottage", label: "Cottage past the bridge", maps: ["BILLS_HOUSE"] },
    { id: "cottageDone", label: "Cottage step done (town left south or east)", maps: ["ROUTE_5", "ROUTE_9", "VERMILION_CITY"] },
    { id: "ship", label: "Ship boarded", maps: ["SS_ANNE_1F"] },
    { id: "rival3", label: "Rival 3", rival: "SS_ANNE_2F" },
    { id: "badge3", label: "Badge 3", badges: 3 },
    { id: "town7", label: "Through the dark tunnel", maps: ["LAVENDER_TOWN"] },
    { id: "badge4", label: "Badge 4", badges: 4 },
    { id: "rival4", label: "Rival 4", rival: "POKEMON_TOWER_2F" },
    { id: "tower", label: "Tower's top floor", maps: ["POKEMON_TOWER_7F"] },
    { id: "badge5", label: "Badge 5", badges: 5 },
    { id: "rival5", label: "Rival 5", rival: "SILPH_CO_7F" },
    { id: "company", label: "Company building's top floor", maps: ["SILPH_CO_11F"] },
    { id: "badge6", label: "Badge 6", badges: 6 },
    // The last gym's door opens with the key at the bottom of the burned mansion.
    { id: "mansion", label: "Burned mansion solved", maps: ["CINNABAR_GYM"] },
    { id: "badge7", label: "Badge 7", badges: 7 },
    { id: "badge8", label: "Badge 8", badges: 8 },
    { id: "rival6", label: "Rival 6", rival: "ROUTE_22", rivalClass: 0x2a },
    { id: "lastCave", label: "Last cave", maps: ["VICTORY_ROAD_1F"] },
    { id: "league", label: "League building", maps: ["INDIGO_PLATEAU_LOBBY"] },
    { id: "elite1", label: "Elite room 1", maps: ["LORELEIS_ROOM"] },
    { id: "elite2", label: "Elite room 2", maps: ["BRUNOS_ROOM"] },
    { id: "elite3", label: "Elite room 3", maps: ["AGATHAS_ROOM"] },
    { id: "elite4", label: "Elite room 4", maps: ["LANCES_ROOM"] },
    { id: "champion", label: "Champion beaten", maps: ["HALL_OF_FAME"] },
  ],
  rivalClasses: new Set([0x19, 0x2a, 0x2b]),
  /** The hard stretches of the game: their maps, and the milestone that says they're done. */
  hardAreas: [
    { id: "cave", label: "First cave", prefix: "MT_MOON_", done: "cave1" },
    { id: "tunnel", label: "Dark tunnel", prefix: "ROCK_TUNNEL_", not: "ROCK_TUNNEL_POKECENTER", done: "town7" },
    { id: "tower", label: "Tower", prefix: "POKEMON_TOWER_", done: "tower" },
    { id: "company", label: "Company building", prefix: "SILPH_CO_", done: "company" },
    { id: "mansion", label: "Burned mansion", prefix: "POKEMON_MANSION_", done: "mansion" },
    { id: "lastCave", label: "Last cave", prefix: "VICTORY_ROAD_", done: "league" },
  ],
  hintItems: ITEM,
  hintSteps: [
    {
      // Walking into the lab yourself doesn't count: only the professor's escort starts the scene.
      when: (s) => !s.party && !s.ledIntoLab,
      text: "Leave town by its north edge. Stepping into the tall grass there makes the professor stop you and lead you to his lab.",
    },
    {
      when: (s) => !s.party,
      text: "Your first partner is in the professor's lab: the balls on the table at the back hold the choices. " +
        "walk_to one with interact and answer YES (if the professor hands one to you instead, talk to him).",
    },
    { when: (s) => !s.rivalFought && s.badges < 1, text: "Walk toward the lab's exit: your rival challenges you to a battle before you leave." },
    { when: (s) => s.has(ITEM.parcel), text: "Take the parcel back south to the professor's lab and talk to him." },
    {
      when: (s) => !s.visited.has("VIRIDIAN_MART") && s.badges < 1,
      text: "Go north along the route to the next town and enter its shop: the clerk has a parcel for the professor.",
    },
    {
      when: (s) => s.badges < 1,
      text: "Go north through the next town and the forest beyond it: the first gym is in the town past the forest. " +
        "(The gym in the town before the forest stays locked until much later.)",
    },
    {
      when: (s) => s.badges < 2 && !s.visited.has("CERULEAN_CITY"),
      text: "From the first gym's town, take the route east to the mountain and go through its cave (it has two floors below): the city with the second gym is on the other side.",
    },
    { when: (s) => s.badges < 2, text: "The second gym is in this city, the one past the mountain cave." },
    {
      when: (s) => !s.visited.has("BILLS_HOUSE") && !s.has(ITEM.ticket) && !s.has(ITEM.cutHm) && s.badges < 3,
      text: "North of the second gym's city, cross the bridge (a row of trainers) and follow the route east to the cottage at its end. " +
        "Inside, talk to the creature; once it steps into the machine, use the PC to start it, then talk to the researcher when he comes out: he gives you a ship ticket.",
    },
    {
      when: (s) => !s.visited.has("SS_ANNE_1F") && !s.has(ITEM.cutHm) && s.badges < 3,
      text: "With the ship ticket, take the route south from the second gym's city. The walled city in the middle is closed, so go through the underground path beneath it " +
        "and on south to the port town; board the ship at the harbour (south of the town).",
    },
    {
      when: (s) => !s.has(ITEM.cutHm) && s.badges < 3,
      text: "On the ship, go up to the captain's cabin at the top: talk to him and he gives you the tree-cutting HM. Leave before the ship sails.",
    },
    {
      when: (s) => s.badges < 3,
      text: "Teach the tree-cutting HM to a party member (use_item on it), then in the port town face the small tree in front of the gym and use field_move CUT. " +
        "The third gym's leader is behind a door that opens with two hidden switches in its bins.",
    },
    {
      when: (s) => !s.visited.has("LAVENDER_TOWN") && !s.visited.has("CELADON_CITY") && s.badges < 4,
      text: "Go back north to the second gym's city. Cut the small tree on its east side and follow the route east, then south, to the dark tunnel. " +
        "Go through it to the small town with the tower: it's dark, but the map still shows the walls (optional: the professor's aide in the gate on the east side of the route north of the town before the forest, " +
        "reached by cutting a tree, gives a light-making HM once you've caught 10 kinds).",
    },
    {
      when: (s) => s.badges < 4 && !s.visited.has("CELADON_CITY"),
      text: "From the tower town, go west: take the underground path beneath the walled city in the middle to the big city with the department store.",
    },
    { when: (s) => s.badges < 4, text: "The fourth gym is in this city, at its south side behind a small tree (cut it)." },
    {
      when: (s) => !s.has(ITEM.scope) && !s.has(ITEM.flute),
      text: "In this city's game corner, a poster hides a switch to the criminals' hideout below. Go down to the bottom floor and beat their boss for a scope that shows ghosts. " +
        "The hideout's lift needs a key that a grunt drops on its bottom floor; the lift takes you to the boss.",
    },
    {
      when: (s) => !s.has(ITEM.flute),
      text: "With the scope in your bag, climb the tower in the tower town to the top floor and free the old man held there. He goes home: visit his house in the tower town and he gives you a flute that wakes the sleeping giants blocking two roads.",
    },
    {
      when: (s) => s.badges < 5 && !s.visited.has("FUCHSIA_CITY"),
      text: "Go to the city on the south coast: south from the tower town along the coast routes (a sleeping giant blocks one: wake it with the flute), " +
        "or west of the big city (a sleeping giant blocks that road too) down the cycling road, which needs a bicycle: listen to the fan club chairman's story in the port town for a voucher, then trade it at the bike shop in the second gym's city.",
    },
    { when: (s) => s.badges < 5, text: "The fifth gym is in this south coast city; its room has invisible walls, so feel your way along." },
    {
      when: (s) => !s.has(ITEM.surfHm),
      text: "Enter the safari zone in this city (500 money a visit, and a step limit) and reach the secret house in its farthest area: it gives the surfing HM. Gold teeth lie on the way to it. " +
        "Surfing outside battle needs this city's gym badge.",
    },
    {
      when: (s) => !s.has(ITEM.strengthHm) && s.has(ITEM.goldTeeth),
      text: "Give the gold teeth to the warden in his house in this city: he gives you the boulder-pushing HM.",
    },
    {
      when: (s) => s.badges < 6 && !s.visited.has("SAFFRON_CITY"),
      text: "The guards at the gates of the walled city in the middle want a drink: buy one from the vending machines on the department store roof in the big city, then enter.",
    },
    {
      when: (s) => s.badges < 6 && !s.has(ITEM.cardKey),
      text: "In the walled city, the company building is taken over. Its card key is on the fifth floor; with it, open the locked doors and reach the boss at the top (teleport pads help).",
    },
    { when: (s) => s.badges < 6, text: "The sixth gym is in the walled city (teleport pads lead to the leader)." },
    {
      when: (s) => s.badges < 7 && !s.has(ITEM.secretKey),
      text: "Surf south from the first town to the volcano island. Its gym is locked: the key is in the basement of the burned mansion there (statues hide switches that move the gates).",
    },
    { when: (s) => s.badges < 7, text: "With the key, the seventh gym on the volcano island opens: answer its quiz machines or battle past them." },
    { when: (s) => s.badges < 8, text: "The last gym is in the town just north of the first town: it opens once you hold the other seven badges." },
    {
      when: (s) => !s.visited.has("VICTORY_ROAD_1F") && s.badges >= 8,
      text: "West of the last gym's town, your rival waits on the road. Then go north past the gates that check your badges to the last cave. Inside, push boulders onto switches with the boulder-pushing HM (field_move STRENGTH).",
    },
    {
      // The one step that isn't the story: what the last stretch asks of a player (owner's call for the hints group).
      when: (s) => s.badges >= 8 && !s.visited.has("LORELEIS_ROOM"),
      text: "Past the last cave is the league building, with a nurse and a shop. Stock up there before you go in: the elite " +
        "battles come one after another with no nurse in between, and items may only be used between battles, so bring plenty " +
        "of healing items and status cures and heal the team before each next door.",
    },
  ],
  // The dark tunnel's floors, and the map that says it was crossed.
  darkMaps: new Set(["ROCK_TUNNEL_1F", "ROCK_TUNNEL_B1F"]),
  afterTheDark: "LAVENDER_TOWN",
};
