import * as Abilities from './abilities';
import * as Items from './items';
import * as Moves from './moves';
import * as Species from './species';
import * as N3DSConstants from './n3ds-constants';
import * as Gen6Constants from './gen6-constants';
import { ItemList } from '../pokemon/item-list';
import { MoveCategory } from '../pokemon/move-category';

export const Type_SM = N3DSConstants.Type_SM;
export const Type_USUM = N3DSConstants.Type_USUM;

export const pokemonCountSM = 802;
export const pokemonCountUSUM = 807;
export const formeCountSM = 158;
export const formeCountUSUM = 168;
export const moveCountSM = 719;
export const moveCountUSUM = 728;
export const highestAbilityIndexSM = Abilities.prismArmor;
export const highestAbilityIndexUSUM = Abilities.neuroforce;

export const bsHPOffset = 0;
export const bsAttackOffset = 1;
export const bsDefenseOffset = 2;
export const bsSpeedOffset = 3;
export const bsSpAtkOffset = 4;
export const bsSpDefOffset = 5;
export const bsPrimaryTypeOffset = 6;
export const bsSecondaryTypeOffset = 7;
export const bsCatchRateOffset = 8;
export const bsCommonHeldItemOffset = 12;
export const bsRareHeldItemOffset = 14;
export const bsDarkGrassHeldItemOffset = 16;
export const bsGenderOffset = 18;
export const bsGrowthCurveOffset = 21;
export const bsAbility1Offset = 24;
export const bsAbility2Offset = 25;
export const bsAbility3Offset = 26;
export const bsCallRateOffset = 27;
export const bsFormeOffset = 28;
export const bsFormeSpriteOffset = 30;
export const bsFormeCountOffset = 32;
export const bsTMHMCompatOffset = 40;
export const bsSpecialMTCompatOffset = 56;
export const bsMTCompatOffset = 60;

export const bsSize = 0x54;

export const evolutionMethodCount = 42;

const speciesWithAlolanForms: number[] = [
    Species.rattata, Species.raticate, Species.raichu, Species.sandshrew, Species.sandslash, Species.vulpix,
    Species.ninetales, Species.diglett, Species.dugtrio, Species.meowth, Species.persian, Species.geodude,
    Species.graveler, Species.golem, Species.grimer, Species.muk, Species.exeggutor, Species.marowak
];

// TODO: const dummyFormeSuffixes = setupDummyFormeSuffixes();
// TODO: const formeSuffixesByBaseForme = setupFormeSuffixesByBaseForme();
const dummyFormeSuffixes = new Map<number, string>();
const formeSuffixesByBaseForme = setupFormeSuffixesByBaseForme();

export function getFormeSuffixByBaseForme(baseForme: number, formNum: number): string {
    return (formeSuffixesByBaseForme.get(baseForme) ?? dummyFormeSuffixes).get(formNum) ?? "";
}

export function getIrregularFormes(romType: number): number[] {
    if (romType == Type_SM) {
    return irregularFormesSM;
    } else if (romType == Type_USUM) {
    return irregularFormesUSUM;
    }
    return irregularFormesSM;
}

export const irregularFormesSM: number[] = [ Species.SMFormes.castformF, Species.SMFormes.castformW, Species.SMFormes.castformI, Species.SMFormes.darmanitanZ, Species.SMFormes.meloettaP, Species.SMFormes.kyuremW, Species.SMFormes.kyuremB, Species.SMFormes.gengarMega, Species.SMFormes.gardevoirMega, Species.SMFormes.ampharosMega, Species.SMFormes.venusaurMega, Species.SMFormes.charizardMegaX, Species.SMFormes.charizardMegaY, Species.SMFormes.mewtwoMegaX, Species.SMFormes.mewtwoMegaY, Species.SMFormes.blazikenMega, Species.SMFormes.medichamMega, Species.SMFormes.houndoomMega, Species.SMFormes.aggronMega, Species.SMFormes.banetteMega, Species.SMFormes.tyranitarMega, Species.SMFormes.scizorMega, Species.SMFormes.pinsirMega, Species.SMFormes.aerodactylMega, Species.SMFormes.lucarioMega, Species.SMFormes.abomasnowMega, Species.SMFormes.aegislashB, Species.SMFormes.blastoiseMega, Species.SMFormes.kangaskhanMega, Species.SMFormes.gyaradosMega, Species.SMFormes.absolMega, Species.SMFormes.alakazamMega, Species.SMFormes.heracrossMega, Species.SMFormes.mawileMega, Species.SMFormes.manectricMega, Species.SMFormes.garchompMega, Species.SMFormes.latiosMega, Species.SMFormes.latiasMega, Species.SMFormes.swampertMega, Species.SMFormes.sceptileMega, Species.SMFormes.sableyeMega, Species.SMFormes.altariaMega, Species.SMFormes.galladeMega, Species.SMFormes.audinoMega, Species.SMFormes.sharpedoMega, Species.SMFormes.slowbroMega, Species.SMFormes.steelixMega, Species.SMFormes.pidgeotMega, Species.SMFormes.glalieMega, Species.SMFormes.diancieMega, Species.SMFormes.metagrossMega, Species.SMFormes.kyogreP, Species.SMFormes.groudonP, Species.SMFormes.rayquazaMega, Species.SMFormes.cameruptMega, Species.SMFormes.lopunnyMega, Species.SMFormes.salamenceMega, Species.SMFormes.beedrillMega, Species.SMFormes.wishiwashiS, Species.SMFormes.greninjaA, Species.SMFormes.zygardeC, Species.SMFormes.miniorC ];

export const irregularFormesUSUM: number[] = [ Species.USUMFormes.castformF, Species.USUMFormes.castformW, Species.USUMFormes.castformI, Species.USUMFormes.darmanitanZ, Species.USUMFormes.meloettaP, Species.USUMFormes.kyuremW, Species.USUMFormes.kyuremB, Species.USUMFormes.gengarMega, Species.USUMFormes.gardevoirMega, Species.USUMFormes.ampharosMega, Species.USUMFormes.venusaurMega, Species.USUMFormes.charizardMegaX, Species.USUMFormes.charizardMegaY, Species.USUMFormes.mewtwoMegaX, Species.USUMFormes.mewtwoMegaY, Species.USUMFormes.blazikenMega, Species.USUMFormes.medichamMega, Species.USUMFormes.houndoomMega, Species.USUMFormes.aggronMega, Species.USUMFormes.banetteMega, Species.USUMFormes.tyranitarMega, Species.USUMFormes.scizorMega, Species.USUMFormes.pinsirMega, Species.USUMFormes.aerodactylMega, Species.USUMFormes.lucarioMega, Species.USUMFormes.abomasnowMega, Species.USUMFormes.aegislashB, Species.USUMFormes.blastoiseMega, Species.USUMFormes.kangaskhanMega, Species.USUMFormes.gyaradosMega, Species.USUMFormes.absolMega, Species.USUMFormes.alakazamMega, Species.USUMFormes.heracrossMega, Species.USUMFormes.mawileMega, Species.USUMFormes.manectricMega, Species.USUMFormes.garchompMega, Species.USUMFormes.latiosMega, Species.USUMFormes.latiasMega, Species.USUMFormes.swampertMega, Species.USUMFormes.sceptileMega, Species.USUMFormes.sableyeMega, Species.USUMFormes.altariaMega, Species.USUMFormes.galladeMega, Species.USUMFormes.audinoMega, Species.USUMFormes.sharpedoMega, Species.USUMFormes.slowbroMega, Species.USUMFormes.steelixMega, Species.USUMFormes.pidgeotMega, Species.USUMFormes.glalieMega, Species.USUMFormes.diancieMega, Species.USUMFormes.metagrossMega, Species.USUMFormes.kyogreP, Species.USUMFormes.groudonP, Species.USUMFormes.rayquazaMega, Species.USUMFormes.cameruptMega, Species.USUMFormes.lopunnyMega, Species.USUMFormes.salamenceMega, Species.USUMFormes.beedrillMega, Species.USUMFormes.wishiwashiS, Species.USUMFormes.greninjaA, Species.USUMFormes.zygardeC, Species.USUMFormes.miniorC, Species.USUMFormes.necrozmaDM, Species.USUMFormes.necrozmaDW, Species.USUMFormes.necrozmaU ];

export const moveCategoryIndices: MoveCategory[] = [MoveCategory.STATUS, MoveCategory.PHYSICAL, MoveCategory.SPECIAL];

export function moveCategoryToByte(cat: MoveCategory): number {
    switch (cat) {
    case MoveCategory.PHYSICAL:
    return 1;
    case MoveCategory.SPECIAL:
    return 2;
    case MoveCategory.STATUS:
    default:
    return 0;
    }
}

export const noDamageTargetTrappingEffect = 106;
export const noDamageFieldTrappingEffect = 354;
export const damageAdjacentFoesTrappingEffect = 373;
export const damageTargetTrappingEffect = 384;

export const noDamageStatusQuality = 1;
export const noDamageStatChangeQuality = 2;
export const damageStatusQuality = 4;
export const noDamageStatusAndStatChangeQuality = 5;
export const damageTargetDebuffQuality = 6;
export const damageUserBuffQuality = 7;
export const damageAbsorbQuality = 8;

//     public static const bannedMoves: number[] = Arrays.asList(Moves.darkVoid, Moves.hyperspaceFury);
// 
export const typeTable = constructTypeTable();

export const tmDataPrefixSM = "034003410342034303",  tmDataPrefixUSUM = "03BC03BD03BE03BF03";
export const tmCount = 100;
export const tmBlockOneCount = 92;
export const tmBlockTwoCount = 3;
export const tmBlockThreeCount = 5;
export const tmBlockOneOffset = Items.tm01;
export const tmBlockTwoOffset = Items.tm93;
export const tmBlockThreeOffset = Items.tm96;
export const itemPalettesPrefix = "070000000000000000010100";

export const shopItemsOffsetSM = 0x50A8;
export const shopItemsOffsetUSUM = 0x50BC;

export const tutorsOffset = 0x54DE;
export const tutorsPrefix = "5F6F6E5F6F6666FF";
export const tutorMoveCount = 67;

export const fastestTextPrefixes: string[] = ["1080BDE80E000500F0412DE9", "34019FE50060A0E3"];

export const mainGameShopsSM: number[] = [ 8, 9, 10, 11, 14, 15, 17, 20, 21, 22, 23 ];

export const mainGameShopsUSUM: number[] = [ 8, 9, 10, 11, 14, 15, 17, 20, 21, 22, 23, 24, 25, 26, 27 ];

export const evolutionItems: number[] = [Items.sunStone, Items.moonStone, Items.fireStone, Items.thunderStone, Items.waterStone, Items.leafStone, Items.shinyStone, Items.duskStone, Items.dawnStone, Items.ovalStone, Items.kingsRock, Items.deepSeaTooth, Items.deepSeaScale, Items.metalCoat, Items.dragonScale, Items.upgrade, Items.protector, Items.electirizer, Items.magmarizer, Items.dubiousDisc, Items.reaperCloth, Items.razorClaw, Items.razorFang, Items.prismScale, Items.whippedDream, Items.sachet, Items.iceStone];

// TODO: List<Boolean> relevantEncounterFilesSM = setupRelevantEncounterFiles(Type_SM);
// TODO: List<Boolean> relevantEncounterFilesUSUM = setupRelevantEncounterFiles(Type_USUM);
const relevantEncounterFilesSM = setupRelevantEncounterFiles(Type_SM);
const relevantEncounterFilesUSUM = setupRelevantEncounterFiles(Type_USUM);

export const heldZCrystals: number[] = [
    Items.normaliumZHeld, // Normal
    Items.fightiniumZHeld, // Fighting
    Items.flyiniumZHeld, // Flying
    Items.poisoniumZHeld, // Poison
    Items.groundiumZHeld, // Ground
    Items.rockiumZHeld, // Rock
    Items.buginiumZHeld, // Bug
    Items.ghostiumZHeld, // Ghost
    Items.steeliumZHeld, // Steel
    Items.firiumZHeld, // Fire
    Items.wateriumZHeld, // Water
    Items.grassiumZHeld, // Grass
    Items.electriumZHeld, // Electric
    Items.psychiumZHeld, // Psychic
    Items.iciumZHeld, // Ice
    Items.dragoniumZHeld, // Dragon
    Items.darkiniumZHeld, // Dark
    Items.fairiumZHeld  // Fairy
];

// TODO: const abilityVariations = setupAbilityVariations();

function setupAbilityVariations(): Map<number, number[]> {
    const map = new Map<number, number[]>();
    map.set(Abilities.insomnia, [Abilities.insomnia, Abilities.vitalSpirit]);
    map.set(Abilities.clearBody, [Abilities.clearBody, Abilities.whiteSmoke, Abilities.fullMetalBody]);
    map.set(Abilities.hugePower, [Abilities.hugePower, Abilities.purePower]);
    map.set(Abilities.battleArmor, [Abilities.battleArmor, Abilities.shellArmor]);
    map.set(Abilities.cloudNine, [Abilities.cloudNine, Abilities.airLock]);
    map.set(Abilities.filter, [Abilities.filter, Abilities.solidRock, Abilities.prismArmor]);
    map.set(Abilities.roughSkin, [Abilities.roughSkin, Abilities.ironBarbs]);
    map.set(Abilities.moldBreaker, [Abilities.moldBreaker, Abilities.turboblaze, Abilities.teravolt]);
    map.set(Abilities.wimpOut, [Abilities.wimpOut, Abilities.emergencyExit]);
    map.set(Abilities.queenlyMajesty, [Abilities.queenlyMajesty, Abilities.dazzling]);
    map.set(Abilities.gooey, [Abilities.gooey, Abilities.tanglingHair]);
    map.set(Abilities.receiver, [Abilities.receiver, Abilities.powerOfAlchemy]);
    map.set(Abilities.multiscale, [Abilities.multiscale, Abilities.shadowShield]);
    
    return map;
}

export const uselessAbilities: number[] = [Abilities.forecast, Abilities.multitype, Abilities.flowerGift, Abilities.zenMode, Abilities.stanceChange, Abilities.shieldsDown, Abilities.schooling, Abilities.disguise, Abilities.battleBond, Abilities.powerConstruct, Abilities.rksSystem];

export const saveLoadFormeReversionPrefixSM = "00EB040094E50C1094E5F70E80E2", saveLoadFormeReversionPrefixUSUM = "00EB040094E50C1094E5030B80E2EE0F80E2";
export const afterBattleFormeReversionPrefix = "0055E10B00001A0010A0E30700A0E1";

export const ninjaskSpeciesPrefix = "11FF2FE11CD08DE2F080BDE8", shedinjaPrefix = "A0E194FDFFEB0040A0E1";

export const beastLusaminePokemonBoostsPrefix = "1D14FFFF";
export const beastLusamineTrainerIndex = 157;

export const miniorWildEncounterPatchPrefix = "032C42E2062052E2";

export const zygardeAssemblyScriptFile = 45;
export const zygardeAssemblyFormePrefix = "BC21CDE1B801CDE1", zygardeAssemblySpeciesPrefix = "FBEB4CD08DE20400A0E1F08FBDE8";

export const friendshipValueForEvoLocator = "DC0050E3F700002A";

export const perfectOddsBranchLocator = "050000BA000050E3";

export function getPokemonCount(romType: number): number {
    if (romType == Type_SM) {
    return pokemonCountSM;
    } else if (romType == Type_USUM) {
    return pokemonCountUSUM;
    }
    return pokemonCountSM;
}

export function getRegularShopItems(romType: number): number[] {
    if (romType == Type_SM) {
    return regularShopItemsSM;
    } else {
    return regularShopItemsUSUM;
    }
}

export const consumableHeldItems: number[] = setupAllConsumableItems();

function setupAllConsumableItems(): number[] {
    const list: number[] = [...Gen6Constants.consumableHeldItems];
    list.push(Items.adrenalineOrb, Items.electricSeed, Items.psychicSeed, Items.mistySeed, Items.grassySeed);
    return list;
}

export const allHeldItems: number[] = setupAllHeldItems();

function setupAllHeldItems(): number[] {
    // We intentionally do not include Z Crystals in this list. Adding Z-Crystals to random trainers should
    // probably require its own setting if desired.
    const list: number[] = [...Gen6Constants.allHeldItems];
    list.push(Items.adrenalineOrb, Items.electricSeed, Items.psychicSeed, Items.mistySeed, Items.grassySeed);
    list.push(Items.terrainExtender, Items.protectivePads);
    return list;
}

export const generalPurposeConsumableItems: number[] = initializeGeneralPurposeConsumableItems();

function initializeGeneralPurposeConsumableItems(): number[] {
    const list: number[] = [...Gen6Constants.generalPurposeConsumableItems];
    // These berries are worth the risk of causing confusion because they heal for half max HP.
    list.push(Items.figyBerry, Items.wikiBerry, Items.magoBerry,
    Items.aguavBerry, Items.iapapaBerry, Items.adrenalineOrb);
    return list;
}

export const generalPurposeItems: number[] = initializeGeneralPurposeItems();

function initializeGeneralPurposeItems(): number[] {
    const list: number[] = [...Gen6Constants.generalPurposeItems];
    list.push(Items.protectivePads);
    return list;
}

// TODO: const moveBoostingItems = initializeMoveBoostingItems();

//     private static Map<Integer, List<Integer>> initializeMoveBoostingItems() {
//         Map<Integer, List<Integer>> map = new HashMap<>(Gen6Constants.moveBoostingItems);
//         map.set(Moves.electricTerrain, Arrays.asList(Items.terrainExtender));
//         map.set(Moves.grassyTerrain, Arrays.asList(Items.terrainExtender));
//         map.set(Moves.mistyTerrain, Arrays.asList(Items.terrainExtender));
//         map.set(Moves.psychicTerrain, Arrays.asList(Items.terrainExtender));
//         map.set(Moves.strengthSap, Arrays.asList(Items.bigRoot));
//         return Collections.unmodifiableMap(map);
//     }
// TODO: const abilityBoostingItems = initializeAbilityBoostingItems();

//     private static Map<Integer, List<Integer>> initializeAbilityBoostingItems() {
//         Map<Integer, List<Integer>> map = new HashMap<>(Gen6Constants.abilityBoostingItems);
//         map.set(Abilities.electricSurge, Arrays.asList(Items.terrainExtender));
//         map.set(Abilities.grassySurge, Arrays.asList(Items.terrainExtender));
//         map.set(Abilities.mistySurge, Arrays.asList(Items.terrainExtender));
//         map.set(Abilities.psychicSurge, Arrays.asList(Items.terrainExtender));
//         return Collections.unmodifiableMap(map);
//     }

// TODO: const consumableAbilityBoostingItems = initializeConsumableAbilityBoostingItems();

//     private static Map<Integer, Integer> initializeConsumableAbilityBoostingItems() {
//         Map<Integer, Integer> map = new Map();
//         map.set(Abilities.electricSurge, Items.electricSeed);
//         map.set(Abilities.grassySurge, Items.grassySeed);
//         map.set(Abilities.mistySurge, Items.mistySeed);
//         map.set(Abilities.psychicSurge, Items.psychicSeed);
//         return Collections.unmodifiableMap(map);
//     }

// None of these have new entries in Gen VII.
// TODO: const consumableTypeBoostingItems = Gen6Constants.consumableTypeBoostingItems;
// TODO: const speciesBoostingItems = Gen6Constants.speciesBoostingItems;
// TODO: const typeBoostingItems = Gen6Constants.typeBoostingItems;
// TODO: const weaknessReducingBerries = Gen6Constants.weaknessReducingBerries;

export function isZCrystal(itemIndex: number): boolean {
    // From https://bulbapedia.bulbagarden.net/wiki/List_of_items_by_index_number_(Generation_VII)
    return (itemIndex >= Items.normaliumZHeld && itemIndex <= Items.pikaniumZHeld) ||
    (itemIndex >= Items.decidiumZHeld && itemIndex <= Items.pikashuniumZBag) ||
    (itemIndex >= Items.solganiumZBag && itemIndex <= Items.kommoniumZBag);
    
}

export function getShopNames(romType: number): string[] {
    const shopNames: string[] = [];
    shopNames.push("Primary 0 Trials");
    shopNames.push("Primary 1 Trials");
    shopNames.push("Primary 2 Trials");
    shopNames.push("Primary 3 Trials");
    shopNames.push("Primary 4 Trials");
    shopNames.push("Primary 5 Trials");
    shopNames.push("Primary 6 Trials");
    shopNames.push("Primary 7 Trials");
    shopNames.push("Konikoni City Incenses");
    shopNames.push("Konikoni City Herbs");
    shopNames.push("Hau'oli City Secondary");
    shopNames.push("Route 2 Secondary");
    shopNames.push("Heahea City Secondary (TMs)");
    shopNames.push("Royal Avenue Secondary (TMs)");
    shopNames.push("Route 8 Secondary");
    shopNames.push("Paniola Town Secondary");
    shopNames.push("Malie City Secondary (TMs)");
    shopNames.push("Mount Hokulani Secondary");
    shopNames.push("Seafolk Village Secondary (TMs)");
    shopNames.push("Konikoni City TMs");
    shopNames.push("Konikoni City Stones");
    shopNames.push("Thrifty Megamart, Center-Left");
    shopNames.push("Thrifty Megamart, Center-Right");
    shopNames.push("Thrifty Megamart, Right");
    if (romType == Type_USUM) {
    shopNames.push("Route 5 Secondary");
    shopNames.push("Konikoni City Secondary");
    shopNames.push("Tapu Village Secondary");
    shopNames.push("Mount Lanakila Secondary");
    }
    return shopNames;
}

export function getMainGameShops(romType: number): number[] {
    if (romType == Type_SM) {
    return mainGameShopsSM;
    } else {
    return mainGameShopsUSUM;
    }
}

export function getShopItemsOffset(romType: number): number {
    if (romType == Type_SM) {
    return shopItemsOffsetSM;
    } else {
    return shopItemsOffsetUSUM;
    }
}

export function getFormeCount(romType: number): number {
    if (romType == Type_SM) {
    return formeCountSM;
    } else {
    return formeCountUSUM;
    }
}

export function getMoveCount(romType: number): number {
    if (romType == Type_SM) {
    return moveCountSM;
    } else if (romType == Type_USUM) {
    return moveCountUSUM;
    }
    return moveCountSM;
}

export function getTmDataPrefix(romType: number): string {
    if (romType == Type_SM) {
    return tmDataPrefixSM;
    } else if (romType == Type_USUM) {
    return tmDataPrefixUSUM;
    }
    return tmDataPrefixSM;
}

export function getHighestAbilityIndex(romType: number): number {
    if (romType == Type_SM) {
    return highestAbilityIndexSM;
    } else if (romType == Type_USUM) {
    return highestAbilityIndexUSUM;
    }
    return highestAbilityIndexSM;
}

export function getRelevantEncounterFiles(romType: number): boolean[] {
    if (romType == Type_SM) {
    return relevantEncounterFilesSM;
    } else {
    return relevantEncounterFilesUSUM;
    }
}

export function getSaveLoadFormeReversionPrefix(romType: number): string {
    if (romType == Type_SM) {
    return saveLoadFormeReversionPrefixSM;
    } else {
    return saveLoadFormeReversionPrefixUSUM;
    }
}

function setupFormeSuffixesByBaseForme(): Map<number, Map<number, string>> {
    const map = new Map<number, Map<number, string>>();
    
    const deoxysMap = new Map();
    deoxysMap.set(1,"-A");
    deoxysMap.set(2,"-D");
    deoxysMap.set(3,"-S");
    map.set(Species.deoxys, deoxysMap);
    
    const wormadamMap = new Map();
    wormadamMap.set(1,"-S");
    wormadamMap.set(2,"-T");
    map.set(Species.wormadam, wormadamMap);
    
    const shayminMap = new Map();
    shayminMap.set(1,"-S");
    map.set(Species.shaymin, shayminMap);
    
    const giratinaMap = new Map();
    giratinaMap.set(1,"-O");
    map.set(Species.giratina, giratinaMap);
    
    const rotomMap = new Map();
    rotomMap.set(1,"-H");
    rotomMap.set(2,"-W");
    rotomMap.set(3,"-Fr");
    rotomMap.set(4,"-Fa");
    rotomMap.set(5,"-M");
    map.set(Species.rotom, rotomMap);
    
    const castformMap = new Map();
    castformMap.set(1,"-F");
    castformMap.set(2,"-W");
    castformMap.set(3,"-I");
    map.set(Species.castform, castformMap);
    
    const basculinMap = new Map();
    basculinMap.set(1,"-B");
    map.set(Species.basculin, basculinMap);
    
    const darmanitanMap = new Map();
    darmanitanMap.set(1,"-Z");
    map.set(Species.darmanitan, darmanitanMap);
    
    const meloettaMap = new Map();
    meloettaMap.set(1,"-P");
    map.set(Species.meloetta, meloettaMap);
    
    const kyuremMap = new Map();
    kyuremMap.set(1,"-W");
    kyuremMap.set(2,"-B");
    map.set(Species.kyurem, kyuremMap);
    
    const tornadusMap = new Map();
    tornadusMap.set(1,"-T");
    map.set(Species.tornadus, tornadusMap);
    
    const thundurusMap = new Map();
    thundurusMap.set(1,"-T");
    map.set(Species.thundurus, thundurusMap);
    
    const landorusMap = new Map();
    landorusMap.set(1,"-T");
    map.set(Species.landorus, landorusMap);
    
    const meowsticMap = new Map();
    meowsticMap.set(1,"-F");
    map.set(Species.meowstic, meowsticMap);
    
    const aegislashMap = new Map();
    aegislashMap.set(1,"-B");
    map.set(Species.aegislash, aegislashMap);
    
    const pumpkabooMap = new Map();
    pumpkabooMap.set(1,"-M");
    pumpkabooMap.set(2,"-L");
    pumpkabooMap.set(3,"-XL");
    map.set(Species.pumpkaboo, pumpkabooMap);
    
    const gourgeistMap = new Map();
    gourgeistMap.set(1,"-M");
    gourgeistMap.set(2,"-L");
    gourgeistMap.set(3,"-XL");
    map.set(Species.gourgeist, gourgeistMap);
    
    const floetteMap = new Map();
    floetteMap.set(5,"-E");
    map.set(Species.floette, floetteMap);
    
    const kyogreMap = new Map();
    kyogreMap.set(1,"-P");
    map.set(Species.kyogre, kyogreMap);
    
    const groudonMap = new Map();
    groudonMap.set(1,"-P");
    map.set(Species.groudon, groudonMap);
    
    const rayquazaMap = new Map();
    rayquazaMap.set(1,"-Mega");
    map.set(Species.rayquaza, rayquazaMap);
    
    const hoopaMap = new Map();
    hoopaMap.set(1,"-U");
    map.set(Species.hoopa, hoopaMap);
    
    for (const species of Gen6Constants.speciesToMegaStoneORAS.keys()) {
    const megaMap = new Map();
    if (species == Species.charizard || species == Species.mewtwo) {
    megaMap.set(1,"-Mega-X");
    megaMap.set(2,"-Mega-Y");
    } else {
    megaMap.set(1,"-Mega");
    }
    map.set(species,megaMap);
    }
    
    const wishiwashiMap = new Map();
    wishiwashiMap.set(1,"-S");
    map.set(Species.wishiwashi, wishiwashiMap);
    
    const oricorioMap = new Map();
    oricorioMap.set(1,"-E");
    oricorioMap.set(2,"-P");
    oricorioMap.set(3,"-G");
    map.set(Species.oricorio, oricorioMap);
    
    const lycanrocMap = new Map();
    lycanrocMap.set(1,"-M");
    lycanrocMap.set(2,"-D");
    map.set(Species.lycanroc, lycanrocMap);
    
    for (const species of speciesWithAlolanForms) {
    const alolanMap = new Map();
    alolanMap.set(1,"-A");
    map.set(species, alolanMap);
    }
    
    const greninjaMap = new Map();
    greninjaMap.set(2,"-A");
    map.set(Species.greninja, greninjaMap);
    
    const zygardeMap = new Map();
    zygardeMap.set(1,"-10");
    zygardeMap.set(4,"-C");
    map.set(Species.zygarde, zygardeMap);
    
    const miniorMap = new Map();
    miniorMap.set(7,"-C");
    map.set(Species.minior, miniorMap);
    
    const necrozmaMap = new Map();
    necrozmaMap.set(1,"-DM");
    necrozmaMap.set(2,"-DW");
    necrozmaMap.set(3,"-U");
    map.set(Species.necrozma, necrozmaMap);
    
    return map;
}

function setupDummyFormeSuffixes(): Map<number, string> {
    const m = new Map();
    m.set(0,"");
    return m;
}

//     private static const actuallyCosmeticFormsSM: number[] = Arrays.asList(
//             Species.SMFormes.cherrimCosmetic1,
// TODO: Species.SMFormes.shellosCosmetic1,
// TODO: Species.SMFormes.gastrodonCosmetic1,
// TODO: Species.SMFormes.keldeoCosmetic1,
// TODO: Species.SMFormes.furfrouCosmetic1, Species.SMFormes.furfrouCosmetic2,
// TODO: Species.SMFormes.furfrouCosmetic3, Species.SMFormes.furfrouCosmetic4,
// TODO: Species.SMFormes.furfrouCosmetic5, Species.SMFormes.furfrouCosmetic6,
// TODO: Species.SMFormes.furfrouCosmetic7, Species.SMFormes.furfrouCosmetic8,
// TODO: Species.SMFormes.furfrouCosmetic9,
// TODO: Species.SMFormes.pumpkabooCosmetic1, Species.SMFormes.pumpkabooCosmetic2,
// TODO: Species.SMFormes.pumpkabooCosmetic3,
// TODO: Species.SMFormes.gourgeistCosmetic1, Species.SMFormes.gourgeistCosmetic2,
// TODO: Species.SMFormes.gourgeistCosmetic3,
// TODO: Species.SMFormes.floetteCosmetic1, Species.SMFormes.floetteCosmetic2,
// TODO: Species.SMFormes.floetteCosmetic3, Species.SMFormes.floetteCosmetic4,
// TODO: Species.SMFormes.raticateACosmetic1,
// TODO: Species.SMFormes.mimikyuCosmetic1, Species.SMFormes.mimikyuCosmetic2, Species.SMFormes.mimikyuCosmetic3,
// TODO: Species.SMFormes.gumshoosCosmetic1,
// TODO: Species.SMFormes.vikavoltCosmetic1,
// TODO: Species.SMFormes.lurantisCosmetic1,
// TODO: Species.SMFormes.salazzleCosmetic1,
// TODO: Species.SMFormes.kommoOCosmetic1,
// TODO: Species.SMFormes.greninjaCosmetic1,
// TODO: Species.SMFormes.zygarde10Cosmetic1, Species.SMFormes.zygardeCosmetic1,
// TODO: Species.SMFormes.miniorCosmetic1, Species.SMFormes.miniorCosmetic2, Species.SMFormes.miniorCosmetic3,
// TODO: Species.SMFormes.miniorCosmetic4, Species.SMFormes.miniorCosmetic5, Species.SMFormes.miniorCosmetic6,
// TODO: Species.SMFormes.miniorCCosmetic1, Species.SMFormes.miniorCCosmetic2, Species.SMFormes.miniorCCosmetic3,
// TODO: Species.SMFormes.miniorCCosmetic4, Species.SMFormes.miniorCCosmetic5, Species.SMFormes.miniorCCosmetic6,
// TODO: Species.SMFormes.magearnaCosmetic1,
// TODO: Species.SMFormes.pikachuCosmetic1, Species.SMFormes.pikachuCosmetic2, Species.SMFormes.pikachuCosmetic3,
// TODO: Species.SMFormes.pikachuCosmetic4, Species.SMFormes.pikachuCosmetic5, Species.SMFormes.pikachuCosmetic6 // Pikachu With Funny Hats
// TODO: );

//     private static const actuallyCosmeticFormsUSUM: number[] = Arrays.asList(
//             Species.USUMFormes.cherrimCosmetic1,
// TODO: Species.USUMFormes.shellosCosmetic1,
// TODO: Species.USUMFormes.gastrodonCosmetic1,
// TODO: Species.USUMFormes.keldeoCosmetic1,
// TODO: Species.USUMFormes.furfrouCosmetic1, Species.USUMFormes.furfrouCosmetic2,
// TODO: Species.USUMFormes.furfrouCosmetic3, Species.USUMFormes.furfrouCosmetic4,
// TODO: Species.USUMFormes.furfrouCosmetic5, Species.USUMFormes.furfrouCosmetic6,
// TODO: Species.USUMFormes.furfrouCosmetic7, Species.USUMFormes.furfrouCosmetic8,
// TODO: Species.USUMFormes.furfrouCosmetic9,
// TODO: Species.USUMFormes.pumpkabooCosmetic1, Species.USUMFormes.pumpkabooCosmetic2,
// TODO: Species.USUMFormes.pumpkabooCosmetic3,
// TODO: Species.USUMFormes.gourgeistCosmetic1, Species.USUMFormes.gourgeistCosmetic2,
// TODO: Species.USUMFormes.gourgeistCosmetic3,
// TODO: Species.USUMFormes.floetteCosmetic1, Species.USUMFormes.floetteCosmetic2,
// TODO: Species.USUMFormes.floetteCosmetic3, Species.USUMFormes.floetteCosmetic4,
// TODO: Species.USUMFormes.raticateACosmetic1,
// TODO: Species.USUMFormes.marowakACosmetic1,
// TODO: Species.USUMFormes.mimikyuCosmetic1, Species.USUMFormes.mimikyuCosmetic2, Species.USUMFormes.mimikyuCosmetic3,
// TODO: Species.USUMFormes.gumshoosCosmetic1,
// TODO: Species.USUMFormes.vikavoltCosmetic1,
// TODO: Species.USUMFormes.lurantisCosmetic1,
// TODO: Species.USUMFormes.salazzleCosmetic1,
// TODO: Species.USUMFormes.kommoOCosmetic1,
// TODO: Species.USUMFormes.araquanidCosmetic1,
// TODO: Species.USUMFormes.togedemaruCosmetic1,
// TODO: Species.USUMFormes.ribombeeCosmetic1,
// TODO: Species.USUMFormes.greninjaCosmetic1,
// TODO: Species.USUMFormes.zygarde10Cosmetic1, Species.USUMFormes.zygardeCosmetic1,
// TODO: Species.USUMFormes.miniorCosmetic1, Species.USUMFormes.miniorCosmetic2, Species.USUMFormes.miniorCosmetic3,
// TODO: Species.USUMFormes.miniorCosmetic4, Species.USUMFormes.miniorCosmetic5, Species.USUMFormes.miniorCosmetic6,
// TODO: Species.USUMFormes.miniorCCosmetic1, Species.USUMFormes.miniorCCosmetic2, Species.USUMFormes.miniorCCosmetic3,
// TODO: Species.USUMFormes.miniorCCosmetic4, Species.USUMFormes.miniorCCosmetic5, Species.USUMFormes.miniorCCosmetic6,
// TODO: Species.USUMFormes.magearnaCosmetic1,
// TODO: Species.USUMFormes.pikachuCosmetic1, Species.USUMFormes.pikachuCosmetic2, Species.USUMFormes.pikachuCosmetic3,
// TODO: Species.USUMFormes.pikachuCosmetic4, Species.USUMFormes.pikachuCosmetic5, Species.USUMFormes.pikachuCosmetic6,
// TODO: Species.USUMFormes.pikachuCosmetic7, // Pikachu With Funny Hats
// TODO: Species.USUMFormes.rockruffCosmetic1
// TODO: );

const actuallyCosmeticFormsSM: number[] = []; // TODO: populate when SMFormes cosmetic constants are available
const actuallyCosmeticFormsUSUM: number[] = []; // TODO: populate when USUMFormes cosmetic constants are available

export function getActuallyCosmeticForms(romType: number): number[] {
    if (romType == Type_SM) {
    return actuallyCosmeticFormsSM;
    } else {
    return actuallyCosmeticFormsUSUM;
    }
}

//     private static const ignoreFormsSM: number[] = Arrays.asList(
//             Species.SMFormes.cherrimCosmetic1,
// TODO: Species.SMFormes.greninjaCosmetic1,
// TODO: Species.SMFormes.zygarde10Cosmetic1,
// TODO: Species.SMFormes.zygardeCosmetic1,
// TODO: Species.SMFormes.miniorCosmetic1,
// TODO: Species.SMFormes.miniorCosmetic2,
// TODO: Species.SMFormes.miniorCosmetic3,
// TODO: Species.SMFormes.miniorCosmetic4,
// TODO: Species.SMFormes.miniorCosmetic5,
// TODO: Species.SMFormes.miniorCosmetic6,
// TODO: Species.SMFormes.mimikyuCosmetic1,
// TODO: Species.SMFormes.mimikyuCosmetic3
// TODO: );

//     private static const ignoreFormsUSUM: number[] = Arrays.asList(
//             Species.USUMFormes.cherrimCosmetic1,
// TODO: Species.USUMFormes.greninjaCosmetic1,
// TODO: Species.USUMFormes.zygarde10Cosmetic1,
// TODO: Species.USUMFormes.zygardeCosmetic1,
// TODO: Species.USUMFormes.miniorCosmetic1,
// TODO: Species.USUMFormes.miniorCosmetic2,
// TODO: Species.USUMFormes.miniorCosmetic3,
// TODO: Species.USUMFormes.miniorCosmetic4,
// TODO: Species.USUMFormes.miniorCosmetic5,
// TODO: Species.USUMFormes.miniorCosmetic6,
// TODO: Species.USUMFormes.mimikyuCosmetic1,
// TODO: Species.USUMFormes.mimikyuCosmetic3,
// TODO: Species.USUMFormes.rockruffCosmetic1
// TODO: );

const ignoreFormsSM: number[] = []; // TODO: populate when SMFormes cosmetic constants are available
const ignoreFormsUSUM: number[] = []; // TODO: populate when USUMFormes cosmetic constants are available

export function getIgnoreForms(romType: number): number[] {
    if (romType == Type_SM) {
    return ignoreFormsSM;
    } else {
    return ignoreFormsUSUM;
    }
}

//     private static Map<Integer,Integer> altFormesWithCosmeticFormsUSUM = setupAltFormesWithCosmeticForms(Type_USUM);
// 

const altFormesWithCosmeticFormsSM = setupAltFormesWithCosmeticForms(Type_SM);
const altFormesWithCosmeticFormsUSUM = setupAltFormesWithCosmeticForms(Type_USUM);

export function getAltFormesWithCosmeticForms(romType: number): Map<number, number> {
    if (romType == Type_SM) {
    return altFormesWithCosmeticFormsSM;
    } else {
    return altFormesWithCosmeticFormsUSUM;
    }
}

function setupAltFormesWithCosmeticForms(romType: number): Map<number, number> {
    const map = new Map();
    if (romType == Type_SM) {
    map.set(Species.SMFormes.raticateA,1); // 1 form (Totem)
    map.set(Species.SMFormes.zygarde10,1); // 1 form (Power Construct)
    map.set(Species.SMFormes.miniorC,6); // 6 forms (colors)
    } else {
    map.set(Species.USUMFormes.raticateA,1); // 1 form (Totem)
    map.set(Species.USUMFormes.marowakA,1); // 1 form (Totem)
    map.set(Species.USUMFormes.zygarde10,1); // 1 form (Power Construct)
    map.set(Species.USUMFormes.miniorC,6); // 6 forms (colors)
    }
    
    return map;
}

function constructTypeTable(): (string | null)[] {
    const table: (string | null)[] = new Array(256).fill(null);
    table[0x00] = "NORMAL";
    table[0x01] = "FIGHTING";
    table[0x02] = "FLYING";
    table[0x03] = "POISON";
    table[0x04] = "GROUND";
    table[0x05] = "ROCK";
    table[0x06] = "BUG";
    table[0x07] = "GHOST";
    table[0x08] = "STEEL";
    table[0x09] = "FIRE";
    table[0x0A] = "WATER";
    table[0x0B] = "GRASS";
    table[0x0C] = "ELECTRIC";
    table[0x0D] = "PSYCHIC";
    table[0x0E] = "ICE";
    table[0x0F] = "DRAGON";
    table[0x10] = "DARK";
    table[0x11] = "FAIRY";
    return table;
}

export function typeToByte(type: string): number {
    if (type == null) {
    return 0x00; // normal?
    }
    switch (type) {
    case "NORMAL":
    return 0x00;
    case "FIGHTING":
    return 0x01;
    case "FLYING":
    return 0x02;
    case "POISON":
    return 0x03;
    case "GROUND":
    return 0x04;
    case "ROCK":
    return 0x05;
    case "BUG":
    return 0x06;
    case "GHOST":
    return 0x07;
    case "FIRE":
    return 0x09;
    case "WATER":
    return 0x0A;
    case "GRASS":
    return 0x0B;
    case "ELECTRIC":
    return 0x0C;
    case "PSYCHIC":
    return 0x0D;
    case "ICE":
    return 0x0E;
    case "DRAGON":
    return 0x0F;
    case "STEEL":
    return 0x08;
    case "DARK":
    return 0x10;
    case "FAIRY":
    return 0x11;
    default:
    return 0; // normal by default
    }
}

function setupRelevantEncounterFiles(romType: number): boolean[] {
    let fileCount = romType == Type_SM ? 2761 : 3696;
    const list: boolean[] = [];
    
    for (let i = 0; i < fileCount; i++) {
    if (((i - 9) % 11 == 0) || (i % 11 == 0)) {
    list.push(true);
    } else {
    list.push(false);
    }
    }
    
    return list;
}

//     public static Map<Integer, List<Integer>> getHardcodedTradeTextOffsets(int romType) {
//         Map<Integer, List<Integer>> hardcodedTradeTextOffsets = new Map();
//         if (romType == Gen7Constants.Type_USUM) {
//             // For some reason, the Route 2 trade is hardcoded in USUM but not in SM
//             hardcodedTradeTextOffsets.set(0, Arrays.asList(20, 21, 22));
//         }
//         hardcodedTradeTextOffsets.set(1, Arrays.asList(26, 28, 30));
//         hardcodedTradeTextOffsets.set(2, Arrays.asList(32, 33, 34, 36));
//         hardcodedTradeTextOffsets.set(3, Arrays.asList(38, 39, 40, 42));
//         hardcodedTradeTextOffsets.set(4, Arrays.asList(44, 45, 46, 48));
//         hardcodedTradeTextOffsets.set(5, Arrays.asList(50, 51, 52, 54));
//         hardcodedTradeTextOffsets.set(6, Arrays.asList(56, 57, 58, 60));
//         return hardcodedTradeTextOffsets;
//     }

let allowedItemsSM: ItemList;
let allowedItemsUSUM: ItemList;
export let nonBadItems: ItemList;
let regularShopItemsSM: number[] = [];
let regularShopItemsUSUM: number[] = [];
let opShopItems: number[] = [];

setupAllowedItems();

function setupAllowedItems(): void {
    allowedItemsSM = new ItemList(Items.fairyMemory);
    // Key items + version exclusives
    allowedItemsSM.banRange(Items.explorerKit, 76);
    allowedItemsSM.banRange(Items.dataCard01, 32);
    allowedItemsSM.banRange(Items.xtransceiverMale, 18);
    allowedItemsSM.banSingles(Items.expShare, Items.libertyPass, Items.propCase, Items.dragonSkull,
    Items.lightStone, Items.darkStone);
    // Unknown blank items or version exclusives
    allowedItemsSM.banRange(Items.tea, 3);
    allowedItemsSM.banRange(Items.unused120, 14);
    // TMs & HMs - tms cant be held in gen7
    allowedItemsSM.tmRange(Items.tm01, 92);
    allowedItemsSM.tmRange(Items.tm93, 3);
    allowedItemsSM.banRange(Items.tm01, 100);
    allowedItemsSM.banRange(Items.tm93, 3);
    // Battle Launcher exclusives
    allowedItemsSM.banRange(Items.direHit2, 24);
    
    // Key items (Gen 6)
    allowedItemsSM.banRange(Items.holoCasterMale,3);
    allowedItemsSM.banSingles(Items.pokeFlute, Items.sprinklotad);
    allowedItemsSM.banRange(Items.powerPlantPass,4);
    allowedItemsSM.banRange(Items.elevatorKey,4);
    allowedItemsSM.banRange(Items.lensCase,3);
    allowedItemsSM.banRange(Items.lookerTicket,3);
    allowedItemsSM.banRange(Items.megaCharm,2);
    
    // TMs (Gen 6)
    allowedItemsSM.tmRange(Items.tm96,5);
    allowedItemsSM.banRange(Items.tm96,5);
    
    // Key items and an HM
    allowedItemsSM.banRange(Items.machBike,34);
    allowedItemsSM.banRange(Items.prisonBottle,2);
    allowedItemsSM.banRange(Items.meteoriteThirdForm,5);
    
    // Z-Crystals
    allowedItemsSM.banRange(Items.normaliumZHeld,19);
    allowedItemsSM.banRange(Items.decidiumZHeld,39);
    
    // Key Items (Gen 7)
    allowedItemsSM.banSingles(Items.zRing, Items.sparklingStone, Items.zygardeCube, Items.ridePager,
    Items.sunFlute, Items.moonFlute, Items.enigmaticCard);
    allowedItemsSM.banRange(Items.forageBag,3);
    
    // Unused
    allowedItemsSM.banSingles(Items.unused848, Items.unused859);
    allowedItemsSM.banRange(Items.unused837,4);
    allowedItemsSM.banRange(Items.silverRazzBerry,18);
    allowedItemsSM.banRange(Items.stretchySpring,19);
    
    allowedItemsUSUM = allowedItemsSM.copy(Items.rotoCatch);
    
    // Z-Crystals
    allowedItemsUSUM.banRange(Items.solganiumZBag,12);
    
    // Key Items
    allowedItemsUSUM.banRange(Items.zPowerRing,16);
    
    // ROTO LOTO
    allowedItemsUSUM.banRange(Items.rotoHatch,11);
    
    // non-bad items
    // ban specific pokemon hold items, berries, apricorns, mail
    nonBadItems = allowedItemsSM.copy();
    
    nonBadItems.banSingles(Items.oddKeystone, Items.griseousOrb, Items.soulDew, Items.lightBall,
    Items.oranBerry, Items.quickPowder, Items.passOrb, Items.discountCoupon, Items.strangeSouvenir,
    Items.festivalTicket);
    nonBadItems.banRange(Items.growthMulch, 4); // mulch
    nonBadItems.banRange(Items.adamantOrb, 2); // orbs
    nonBadItems.banRange(Items.mail1, 12); // mails
    nonBadItems.banRange(Items.figyBerry, 25); // berries without useful battle effects
    nonBadItems.banRange(Items.luckyPunch, 4); // pokemon specific
    nonBadItems.banRange(Items.redScarf, 5); // contest scarves
    nonBadItems.banRange(Items.richMulch,4); // more mulch
    nonBadItems.banRange(Items.gengarite, 30); // Mega Stones, part 1
    nonBadItems.banRange(Items.swampertite, 13); // Mega Stones, part 2
    nonBadItems.banRange(Items.cameruptite, 4); // Mega Stones, part 3
    nonBadItems.banRange(Items.fightingMemory,17); // Memories
    nonBadItems.banRange(Items.relicCopper,7); // relic items
    nonBadItems.banSingles(Items.shoalSalt, Items.shoalShell); // Shoal items; have no purpose and sell for $10.
    nonBadItems.banRange(Items.blueFlute, 5); // Flutes; have no purpose and sell for $10.
    
    regularShopItemsSM = [];

    for (let i = Items.ultraBall; i <= Items.pokeBall; i++) regularShopItemsSM.push(i);
    for (let i = Items.potion; i <= Items.revive; i++) regularShopItemsSM.push(i);
    for (let i = Items.superRepel; i <= Items.repel; i++) regularShopItemsSM.push(i);
    regularShopItemsSM.push(Items.honey);
    regularShopItemsSM.push(Items.adrenalineOrb);

    regularShopItemsUSUM = [...regularShopItemsSM];
    regularShopItemsUSUM.push(Items.pokeToy);

    opShopItems = [];

    // "Money items" etc
    opShopItems.push(Items.lavaCookie);
    opShopItems.push(Items.berryJuice);
    opShopItems.push(Items.rareCandy);
    opShopItems.push(Items.oldGateau);
    for (let i = Items.tinyMushroom; i <= Items.nugget; i++) opShopItems.push(i);
    opShopItems.push(Items.rareBone);
    for (let i = Items.lansatBerry; i <= Items.rowapBerry; i++) opShopItems.push(i);
    opShopItems.push(Items.luckyEgg);
    opShopItems.push(Items.prettyFeather);
    for (let i = Items.balmMushroom; i <= Items.casteliacone; i++) opShopItems.push(i);
}

export function getAllowedItems(romType: number): ItemList {
    if (romType == Type_SM) {
    return allowedItemsSM;
    } else {
    return allowedItemsUSUM;
    }
}

export const requiredFieldTMsSM: number[] = [ 80, 49, 5, 83, 64, 62, 100, 31, 46, 88, 57, 41, 59, 73, 53, 61, 28, 39, 55, 86, 30, 93, 81, 84, 74, 85, 72, 3, 3, 13, 36, 91, 79, 24, 97, 50, 99, 35, 2, 26, 6, 6 ];

export const requiredFieldTMsUSUM: number[] = [ 49, 5, 83, 64, 23, 100, 79, 24, 31, 46, 88, 41, 59, 32, 53, 61, 28, 39, 57, 86, 30, 62, 81, 80, 74, 85, 73, 72, 3, 3, 84, 13, 36, 91, 55, 97, 50, 93, 93, 99, 35, 2, 26, 6, 6 ];

export function getRequiredFieldTMs(romType: number): number[] {
    if (romType == Type_SM) {
    return [...new Set(requiredFieldTMsSM)];
    } else {
    return [...new Set(requiredFieldTMsUSUM)];
    }
}

export function tagTrainersSM(trs: any[]): void {
    
    tag(trs,"ELITE1", 23, 152, 349); // Hala
    tag(trs,"ELITE2",90, 153, 351); // Olivia
    tag(trs,"ELITE3", 154, 403); // Nanu
    tag(trs,"ELITE4", 155, 359); // Hapu
    tag(trs,"ELITE5", 149, 350); // Acerola
    tag(trs,"ELITE6", 156, 352); // Kahili
    
    tag(trs,"RIVAL2-0", 129);
    tag(trs,"RIVAL2-1", 413);
    tag(trs,"RIVAL2-2", 414);
    tagRival(trs,"RIVAL3",477);
    
    tagRival(trs,"FRIEND1", 6);
    tagRival(trs,"FRIEND2", 9);
    tagRival(trs,"FRIEND3", 12);
    tagRival(trs,"FRIEND4", 76);
    tagRival(trs,"FRIEND5", 82);
    tagRival(trs,"FRIEND6", 438);
    tagRival(trs,"FRIEND7", 217);
    tagRival(trs,"FRIEND8", 220);
    tagRival(trs,"FRIEND9", 447);
    tagRival(trs,"FRIEND10", 450);
    tagRival(trs,"FRIEND11", 482);
    tagRival(trs,"FRIEND12", 356);
    
    tag(trs,"THEMED:GLADION-STRONG", 79, 185, 239, 240, 415, 416, 417, 418, 419, 441);
    tag(trs,"THEMED:ILIMA-STRONG", 52, 215, 216, 396);
    tag(trs,"THEMED:LANA-STRONG", 144);
    tag(trs,"THEMED:KIAWE-STRONG", 398);
    tag(trs,"THEMED:MALLOW-STRONG", 146);
    tag(trs,"THEMED:SOPHOCLES-STRONG", 405);
    tag(trs,"THEMED:MOLAYNE-STRONG", 167, 481);
    tag(trs,"THEMED:MINA-STRONG", 435, 467);
    tag(trs,"THEMED:PLUMERIA-STRONG", 89, 238, 401);
    tag(trs,"THEMED:SINA-STRONG", 75);
    tag(trs,"THEMED:DEXIO-STRONG", 74, 412);
    tag(trs,"THEMED:FABA-STRONG",132, 241, 360, 410);
    tag(trs,"THEMED:GUZMA-LEADER", 138, 235, 236, 400);
    tag(trs,"THEMED:LUSAMINE-LEADER", 131, 158);
}

export function tagTrainersUSUM(trs: any[]): void {
    
    tag(trs,"ELITE1", 23, 650); // Hala
    tag(trs,"ELITE2", 90, 153, 351); // Olivia
    tag(trs,"ELITE3", 154, 508); // Nanu
    tag(trs,"ELITE4", 359, 497); // Hapu
    tag(trs,"ELITE5", 489, 490); // Big Mo
    tag(trs,"ELITE6", 149, 350); // Acerola
    tag(trs,"ELITE7", 156, 352); // Kahili
    
    tagRival(trs,"RIVAL2", 477); // Kukui
    
    // Hau
    tagRival(trs,"FRIEND1", 491);
    tagRival(trs,"FRIEND2", 9);
    tagRival(trs,"FRIEND3", 12);
    tagRival(trs,"FRIEND4", 76);
    tagRival(trs,"FRIEND5", 82);
    tagRival(trs,"FRIEND6", 438);
    tagRival(trs,"FRIEND7", 217);
    tagRival(trs,"FRIEND8", 220);
    tagRival(trs,"FRIEND9", 447);
    tagRival(trs,"FRIEND10", 450);
    tagRival(trs,"FRIEND11", 494);
    tagRival(trs,"FRIEND12", 356);
    
    tag(trs,"THEMED:GLADION-STRONG", 79, 185, 239, 240, 415, 416, 417, 418, 419, 441);
    tag(trs,"THEMED:ILIMA-STRONG", 52, 215, 216, 396, 502);
    tag(trs,"THEMED:LANA-STRONG", 144, 503);
    tag(trs,"THEMED:KIAWE-STRONG", 398, 504);
    tag(trs,"THEMED:MALLOW-STRONG", 146, 505);
    tag(trs,"THEMED:SOPHOCLES-STRONG", 405, 506);
    tag(trs,"THEMED:MINA-STRONG", 507);
    tag(trs,"THEMED:PLUMERIA-STRONG", 89, 238, 401);
    tag(trs,"THEMED:SINA-STRONG", 75);
    tag(trs,"THEMED:DEXIO-STRONG", 74, 412, 623);
    tag(trs,"THEMED:FABA-STRONG", 132, 241, 410, 561);
    tag(trs,"THEMED:SOLIERA-STRONG", 498, 499, 648, 651);
    tag(trs,"THEMED:DULSE-STRONG", 500, 501, 649, 652);
    tag(trs,"THEMED:GUZMA-LEADER", 138, 235, 236, 558, 647);
    tag(trs,"THEMED:LUSAMINE-LEADER", 131, 644);
    
    tag(trs,"UBER", 541, 542, 543, 580, 572, 573, 559, 560, 562, 645); // RR Episode
}

function tagRival(allTrainers: any[], tag: string, offset: number): void {
    allTrainers[offset - 1].tag = tag + "-0";
    allTrainers[offset].tag = tag + "-1";
    allTrainers[offset + 1].tag = tag + "-2";
    
}

function tagTrainer(allTrainers: any[], number: number, tag: string): void {
    if (allTrainers.length > (number - 1)) {
    allTrainers[number - 1].tag = tag;
    }
}

function tag(allTrainers: any[], tag: string, ...numbers: number[]): void {
    for (const num of numbers) {
    if (allTrainers.length > (num - 1)) {
    allTrainers[num - 1].tag = tag;
    }
    }
}

export function setMultiBattleStatusSM(trs: any[]): void {
    // All Double Battles in Gen 7 are internally treated as a Multi Battle
    // 92 + 93: Rising Star Duo Justin and Lauren
    // 97 + 98: Twins Isa and Nico
    // 134 + 136: Aether Foundation Employees in Secret Lab B w/ Hau
    // 141 + 227: Team Skull Grunts on Route 17
    // 241 + 442: Faba and Aether Foundation Employee w/ Hau
    // 262 + 265: Ace Duo Aimee and Kent
    // 270 + 299: Swimmers Jake and Yumi
    // 278 + 280: Honeymooners Noriko and Devin
    // 303 + 307: Veteran Duo Tsunekazu and Nobuko
    // 315 + 316: Team Skull Grunts in Po Town
    // 331 + 332: Karate Family Guy and Samuel
    // 371 + 372: Twins Harper and Sarah
    // 373 + 374: Swimmer Girls Ashlyn and Kylie
    // 375 + 376: Golf Buddies Tara and Tina
    // 421 + 422: Athletic Siblings Alyssa and Sho
    // 425 + 426: Punk Pair Lane and Yoko
    // 429 + 430: Punk Pair Troy and Marie
    // 443 + 444: Team Skull Grunts in Diglett's Tunnel w/ Hau
    // 453 + 454: Aether Foundation Employees w/ Hau
    // 455 + 456: Aether Foundation Employees w/ Gladion
    setMultiBattleStatus(trs, 92, 93, 97, 98, 134, 136, 141, 227, 241, 262, 265, 270, 278, 280, 299, 303,
    307, 315, 316, 331, 332, 371, 372, 373, 374, 375, 376, 421, 422, 425, 426, 429, 430, 442, 443, 444, 453,
    454, 455, 456
    );
}

export function setMultiBattleStatusUSUM(trs: any[]): void {
    // All Double Battles in Gen 7 are internally treated as a Multi Battle
    // 92 + 93: Rising Star Duo Justin and Lauren
    // 97 + 98: Twins Isa and Nico
    // 134 + 136: Aether Foundation Employees in Secret Lab B w/ Hau
    // 141 + 227: Team Skull Grunts on Route 17
    // 178 + 511: Capoeira Couple Cara and Douglas
    // 241 + 442: Faba and Aether Foundation Employee w/ Hau
    // 262 + 265: Ace Duo Aimee and Kent
    // 270 + 299: Swimmers Jake and Yumi
    // 278 + 280: Honeymooners Noriko and Devin
    // 303 + 307: Veteran Duo Tsunekazu and Nobuko
    // 315 + 316: Team Skull Grunts in Po Town
    // 331 + 332: Karate Family Guy and Samuel
    // 371 + 372: Twins Harper and Sarah
    // 373 + 374: Swimmer Girls Ashlyn and Kylie
    // 375 + 376: Golf Buddies Tara and Tina
    // 421 + 422: Athletic Siblings Alyssa and Sho
    // 425 + 426: Punk Pair Lane and Yoko
    // 429 + 430: Punk Pair Troy and Marie
    // 443 + 444: Team Skull Grunts in Diglett's Tunnel w/ Hau
    // 453 + 454: Aether Foundation Employees w/ Hau
    // 455 + 456: Aether Foundation Employees w/ Gladion
    // 514 + 521: Tourist Couple Yuriko and Landon
    // 515 + 534: Tourist Couple Steve and Reika
    // 529 + 530: Dancing Family Jen and Fumiko
    // 554 + 561: Aether Foundation Employee and Faba w/ Lillie
    // 557 + 578: GAME FREAK Iwao and Morimoto
    // 586 + 595: Team Rainbow Rocket Grunts w/ Guzma
    // 613 + 626: Master & Apprentice Kaimana and Breon
    // 617 + 618: Sparring Partners Allon and Eimar
    // 619 + 620: Sparring Partners Craig and Jason
    setMultiBattleStatus(trs, 92, 93, 97, 98, 134, 136, 141, 178, 227, 241, 262, 265, 270, 278, 280, 299,
    303, 307, 315, 316, 331, 332, 371, 372, 373, 374, 375, 376, 421, 422, 425, 426, 429, 430, 442, 443, 444,
    453, 454, 455, 456, 511, 514, 515, 521, 529, 530, 534, 544, 557, 561, 578, 586, 595, 613, 617, 618, 619,
    620, 626
    );
}

function setMultiBattleStatus(allTrainers: any[], ...numbers: number[]): void {
    for (const num of numbers) {
    if (allTrainers.length > (num - 1)) {
    allTrainers[num - 1].multiBattleStatus = "ALWAYS";
    }
    }
}

export function setForcedRivalStarterPositionsUSUM(allTrainers: any[]): void {
    
    // Hau 3
    allTrainers[12 - 1].forceStarterPosition = 0;
    allTrainers[13 - 1].forceStarterPosition = 0;
    allTrainers[14 - 1].forceStarterPosition = 0;
    
    // Hau 6
    allTrainers[217 - 1].forceStarterPosition = 0;
    allTrainers[218 - 1].forceStarterPosition = 0;
    allTrainers[219 - 1].forceStarterPosition = 0;
}

// TODO: const balancedItemPrices = Stream.of(new Integer[][] { // Skip item index 0. All prices divided by 10 {Items.masterBall, 300}, {Items.ultraBall, 80}, {Items.greatBall, 60}, {Items.pokeBall, 20}, {Items.safariBall, 50}, {Items.netBall, 100}, {Items.diveBall, 100}, {Items.nestBall, 100}, {Items.repeatBall, 100}, {Items.timerBall, 100}, {Items.luxuryBall, 100}, {Items.premierBall, 20}, {Items.duskBall, 100}, {Items.healBall, 30}, {Items.quickBall, 100}, {Items.cherishBall, 20}, {Items.potion, 20}, {Items.antidote, 20}, {Items.burnHeal, 30}, {Items.iceHeal, 10}, {Items.awakening, 10}, {Items.paralyzeHeal, 30}, {Items.fullRestore, 300}, {Items.maxPotion, 250}, {Items.hyperPotion, 150}, {Items.superPotion, 70}, {Items.fullHeal, 40}, {Items.revive, 200}, {Items.maxRevive, 400}, {Items.freshWater, 20}, {Items.sodaPop, 30}, {Items.lemonade, 40}, {Items.moomooMilk, 60}, {Items.energyPowder, 50}, {Items.energyRoot, 120}, {Items.healPowder, 30}, {Items.revivalHerb, 280}, {Items.ether, 300}, {Items.maxEther, 450}, {Items.elixir, 1500}, {Items.maxElixir, 1800}, {Items.lavaCookie, 35}, {Items.berryJuice, 20}, {Items.sacredAsh, 500}, {Items.hpUp, 1000}, {Items.protein, 1000}, {Items.iron, 1000}, {Items.carbos, 1000}, {Items.calcium, 1000}, {Items.rareCandy, 1000}, {Items.ppUp, 1000}, {Items.zinc, 1000}, {Items.ppMax, 2500}, {Items.oldGateau, 35}, {Items.guardSpec, 150}, {Items.direHit, 100}, {Items.xAttack, 100}, {Items.xDefense, 200}, {Items.xSpeed, 100}, {Items.xAccuracy, 100}, {Items.xSpAtk, 100}, {Items.xSpDef, 200}, {Items.pokeDoll, 10}, {Items.fluffyTail, 10}, {Items.blueFlute, 2}, {Items.yellowFlute, 2}, {Items.redFlute, 2}, {Items.blackFlute, 2}, {Items.whiteFlute, 2}, {Items.shoalSalt, 2}, {Items.shoalShell, 2}, {Items.redShard, 100}, {Items.blueShard, 100}, {Items.yellowShard, 100}, {Items.greenShard, 100}, {Items.superRepel, 70}, {Items.maxRepel, 90}, {Items.escapeRope, 100}, {Items.repel, 40}, {Items.sunStone, 300}, {Items.moonStone, 300}, {Items.fireStone, 300}, {Items.thunderStone, 300}, {Items.waterStone, 300}, {Items.leafStone, 300}, {Items.tinyMushroom, 50}, {Items.bigMushroom, 500}, {Items.pearl, 200}, {Items.bigPearl, 800}, {Items.stardust, 300}, {Items.starPiece, 1200}, {Items.nugget, 1000}, {Items.heartScale, 500}, {Items.honey, 30}, {Items.growthMulch, 20}, {Items.dampMulch, 20}, {Items.stableMulch, 20}, {Items.gooeyMulch, 20}, {Items.rootFossil, 700}, {Items.clawFossil, 700}, {Items.helixFossil, 700}, {Items.domeFossil, 700}, {Items.oldAmber, 1000}, {Items.armorFossil, 700}, {Items.skullFossil, 700}, {Items.rareBone, 500}, {Items.shinyStone, 300}, {Items.duskStone, 300}, {Items.dawnStone, 300}, {Items.ovalStone, 200}, {Items.oddKeystone, 210}, {Items.griseousOrb, 1000}, {Items.tea, 0}, // unused in Gen 7 {Items.unused114, 0}, {Items.autograph, 0}, {Items.douseDrive, 100}, {Items.shockDrive, 100}, {Items.burnDrive, 100}, {Items.chillDrive, 100}, {Items.unused120, 0}, {Items.pokemonBox, 0}, // unused in Gen 7 {Items.medicinePocket, 0}, // unused in Gen 7 {Items.tmCase, 0}, // unused in Gen 7 {Items.candyJar, 0}, // unused in Gen 7 {Items.powerUpPocket, 0}, // unused in Gen 7 {Items.clothingTrunk, 0}, // unused in Gen 7 {Items.catchingPocket, 0}, // unused in Gen 7 {Items.battlePocket, 0}, // unused in Gen 7 {Items.unused129, 0}, {Items.unused130, 0}, {Items.unused131, 0}, {Items.unused132, 0}, {Items.unused133, 0}, {Items.sweetHeart, 15}, {Items.adamantOrb, 1000}, {Items.lustrousOrb, 1000}, {Items.mail1, 5}, {Items.mail2, 5}, {Items.mail3, 5}, {Items.mail4, 5}, {Items.mail5, 5}, {Items.mail6, 5}, {Items.mail7, 5}, {Items.mail8, 5}, {Items.mail9, 5}, {Items.mail10, 5}, {Items.mail11, 5}, {Items.mail12, 5}, {Items.cheriBerry, 20}, {Items.chestoBerry, 25}, {Items.pechaBerry, 10}, {Items.rawstBerry, 25}, {Items.aspearBerry, 25}, {Items.leppaBerry, 300}, {Items.oranBerry, 5}, {Items.persimBerry, 20}, {Items.lumBerry, 50}, {Items.sitrusBerry, 50}, {Items.figyBerry, 10}, {Items.wikiBerry, 10}, {Items.magoBerry, 10}, {Items.aguavBerry, 10}, {Items.iapapaBerry, 10}, {Items.razzBerry, 50}, {Items.blukBerry, 50}, {Items.nanabBerry, 50}, {Items.wepearBerry, 50}, {Items.pinapBerry, 50}, {Items.pomegBerry, 50}, {Items.kelpsyBerry, 50}, {Items.qualotBerry, 50}, {Items.hondewBerry, 50}, {Items.grepaBerry, 50}, {Items.tamatoBerry, 50}, {Items.cornnBerry, 50}, {Items.magostBerry, 50}, {Items.rabutaBerry, 50}, {Items.nomelBerry, 50}, {Items.spelonBerry, 50}, {Items.pamtreBerry, 50}, {Items.watmelBerry, 50}, {Items.durinBerry, 50}, {Items.belueBerry, 50}, {Items.occaBerry, 100}, {Items.passhoBerry, 100}, {Items.wacanBerry, 100}, {Items.rindoBerry, 100}, {Items.yacheBerry, 100}, {Items.chopleBerry, 100}, {Items.kebiaBerry, 100}, {Items.shucaBerry, 100}, {Items.cobaBerry, 100}, {Items.payapaBerry, 100}, {Items.tangaBerry, 100}, {Items.chartiBerry, 100}, {Items.kasibBerry, 100}, {Items.habanBerry, 100}, {Items.colburBerry, 100}, {Items.babiriBerry, 100}, {Items.chilanBerry, 100}, {Items.liechiBerry, 100}, {Items.ganlonBerry, 100}, {Items.salacBerry, 100}, {Items.petayaBerry, 100}, {Items.apicotBerry, 100}, {Items.lansatBerry, 100}, {Items.starfBerry, 100}, {Items.enigmaBerry, 100}, {Items.micleBerry, 100}, {Items.custapBerry, 100}, {Items.jabocaBerry, 100}, {Items.rowapBerry, 100}, {Items.brightPowder, 400}, {Items.whiteHerb, 400}, {Items.machoBrace, 300}, {Items.expShare, 0}, {Items.quickClaw, 450}, {Items.sootheBell, 100}, {Items.mentalHerb, 100}, {Items.choiceBand, 1000}, {Items.kingsRock, 500}, {Items.silverPowder, 200}, {Items.amuletCoin, 1500}, {Items.cleanseTag, 100}, {Items.soulDew, 20}, {Items.deepSeaTooth, 300}, {Items.deepSeaScale, 300}, {Items.smokeBall, 400}, {Items.everstone, 300}, {Items.focusBand, 300}, {Items.luckyEgg, 1000}, {Items.scopeLens, 500}, {Items.metalCoat, 300}, {Items.leftovers, 1000}, {Items.dragonScale, 300}, {Items.lightBall, 100}, {Items.softSand, 200}, {Items.hardStone, 200}, {Items.miracleSeed, 200}, {Items.blackGlasses, 200}, {Items.blackBelt, 200}, {Items.magnet, 200}, {Items.mysticWater, 200}, {Items.sharpBeak, 200}, {Items.poisonBarb, 200}, {Items.neverMeltIce, 200}, {Items.spellTag, 200}, {Items.twistedSpoon, 200}, {Items.charcoal, 200}, {Items.dragonFang, 200}, {Items.silkScarf, 200}, {Items.upgrade, 300}, {Items.shellBell, 600}, {Items.seaIncense, 200}, {Items.laxIncense, 300}, {Items.luckyPunch, 100}, {Items.metalPowder, 100}, {Items.thickClub, 100}, {Items.leek, 100}, {Items.redScarf, 10}, {Items.blueScarf, 10}, {Items.pinkScarf, 10}, {Items.greenScarf, 10}, {Items.yellowScarf, 10}, {Items.wideLens, 150}, {Items.muscleBand, 200}, {Items.wiseGlasses, 200}, {Items.expertBelt, 600}, {Items.lightClay, 150}, {Items.lifeOrb, 1000}, {Items.powerHerb, 100}, {Items.toxicOrb, 150}, {Items.flameOrb, 150}, {Items.quickPowder, 100}, {Items.focusSash, 200}, {Items.zoomLens, 150}, {Items.metronome, 300}, {Items.ironBall, 100}, {Items.laggingTail, 100}, {Items.destinyKnot, 150}, {Items.blackSludge, 500}, {Items.icyRock, 20}, {Items.smoothRock, 20}, {Items.heatRock, 20}, {Items.dampRock, 20}, {Items.gripClaw, 150}, {Items.choiceScarf, 1000}, {Items.stickyBarb, 150}, {Items.powerBracer, 300}, {Items.powerBelt, 300}, {Items.powerLens, 300}, {Items.powerBand, 300}, {Items.powerAnklet, 300}, {Items.powerWeight, 300}, {Items.shedShell, 50}, {Items.bigRoot, 150}, {Items.choiceSpecs, 1000}, {Items.flamePlate, 200}, {Items.splashPlate, 200}, {Items.zapPlate, 200}, {Items.meadowPlate, 200}, {Items.iciclePlate, 200}, {Items.fistPlate, 200}, {Items.toxicPlate, 200}, {Items.earthPlate, 200}, {Items.skyPlate, 200}, {Items.mindPlate, 200}, {Items.insectPlate, 200}, {Items.stonePlate, 200}, {Items.spookyPlate, 200}, {Items.dracoPlate, 200}, {Items.dreadPlate, 200}, {Items.ironPlate, 200}, {Items.oddIncense, 200}, {Items.rockIncense, 200}, {Items.fullIncense, 100}, {Items.waveIncense, 200}, {Items.roseIncense, 200}, {Items.luckIncense, 1500}, {Items.pureIncense, 100}, {Items.protector, 300}, {Items.electirizer, 300}, {Items.magmarizer, 300}, {Items.dubiousDisc, 300}, {Items.reaperCloth, 300}, {Items.razorClaw, 500}, {Items.razorFang, 500}, {Items.tm01, 1000}, {Items.tm02, 1000}, {Items.tm03, 1000}, {Items.tm04, 1000}, {Items.tm05, 1000}, {Items.tm06, 1000}, {Items.tm07, 2000}, {Items.tm08, 1000}, {Items.tm09, 1000}, {Items.tm10, 1000}, {Items.tm11, 2000}, {Items.tm12, 1000}, {Items.tm13, 1000}, {Items.tm14, 2000}, {Items.tm15, 2000}, {Items.tm16, 1000}, {Items.tm17, 1000}, {Items.tm18, 2000}, {Items.tm19, 1000}, {Items.tm20, 1000}, {Items.tm21, 1000}, {Items.tm22, 1000}, {Items.tm23, 1000}, {Items.tm24, 1000}, {Items.tm25, 2000}, {Items.tm26, 1000}, {Items.tm27, 1000}, {Items.tm28, 2000}, {Items.tm29, 1000}, {Items.tm30, 1000}, {Items.tm31, 1000}, {Items.tm32, 1000}, {Items.tm33, 1000}, {Items.tm34, 1000}, {Items.tm35, 1000}, {Items.tm36, 1000}, {Items.tm37, 2000}, {Items.tm38, 2000}, {Items.tm39, 1000}, {Items.tm40, 1000}, {Items.tm41, 1000}, {Items.tm42, 1000}, {Items.tm43, 1000}, {Items.tm44, 1000}, {Items.tm45, 1000}, {Items.tm46, 1000}, {Items.tm47, 1000}, {Items.tm48, 1000}, {Items.tm49, 1000}, {Items.tm50, 2000}, {Items.tm51, 1000}, {Items.tm52, 2000}, {Items.tm53, 1000}, {Items.tm54, 1000}, {Items.tm55, 1000}, {Items.tm56, 1000}, {Items.tm57, 1000}, {Items.tm58, 1000}, {Items.tm59, 2000}, {Items.tm60, 1000}, {Items.tm61, 1000}, {Items.tm62, 1000}, {Items.tm63, 1000}, {Items.tm64, 1000}, {Items.tm65, 1000}, {Items.tm66, 1000}, {Items.tm67, 1000}, {Items.tm68, 2000}, {Items.tm69, 1000}, {Items.tm70, 2000}, {Items.tm71, 2000}, {Items.tm72, 1000}, {Items.tm73, 500}, {Items.tm74, 1000}, {Items.tm75, 1000}, {Items.tm76, 1000}, {Items.tm77, 1000}, {Items.tm78, 1000}, {Items.tm79, 1000}, {Items.tm80, 1000}, {Items.tm81, 1000}, {Items.tm82, 1000}, {Items.tm83, 1000}, {Items.tm84, 1000}, {Items.tm85, 1000}, {Items.tm86, 1000}, {Items.tm87, 1000}, {Items.tm88, 1000}, {Items.tm89, 1000}, {Items.tm90, 1000}, {Items.tm91, 1000}, {Items.tm92, 1000}, {Items.hm01, 0}, {Items.hm02, 0}, {Items.hm03, 0}, {Items.hm04, 0}, {Items.hm05, 0}, {Items.hm06, 0}, {Items.hm07, 0}, // unused in Gen 7 {Items.hm08, 0}, // unused in Gen 7 {Items.explorerKit, 0}, {Items.lootSack, 0}, {Items.ruleBook, 0}, {Items.pokeRadar, 0}, {Items.pointCard, 0}, {Items.journal, 0}, {Items.sealCase, 0}, {Items.fashionCase, 0}, {Items.sealBag, 0}, {Items.palPad, 0}, {Items.worksKey, 0}, {Items.oldCharm, 0}, {Items.galacticKey, 0}, {Items.redChain, 0}, {Items.townMap, 0}, {Items.vsSeeker, 0}, {Items.coinCase, 0}, {Items.oldRod, 0}, {Items.goodRod, 0}, {Items.superRod, 0}, {Items.sprayduck, 0}, {Items.poffinCase, 0}, {Items.bike, 0}, {Items.suiteKey, 0}, {Items.oaksLetter, 0}, {Items.lunarWing, 0}, {Items.memberCard, 0}, {Items.azureFlute, 0}, {Items.ssTicketJohto, 0}, {Items.contestPass, 0}, {Items.magmaStone, 0}, {Items.parcelSinnoh, 0}, {Items.coupon1, 0}, {Items.coupon2, 0}, {Items.coupon3, 0}, {Items.storageKeySinnoh, 0}, {Items.secretPotion, 0}, {Items.vsRecorder, 0}, {Items.gracidea, 0}, {Items.secretKeySinnoh, 0}, {Items.apricornBox, 0}, {Items.unownReport, 0}, {Items.berryPots, 0}, {Items.dowsingMachine, 0}, {Items.blueCard, 0}, {Items.slowpokeTail, 0}, {Items.clearBell, 0}, {Items.cardKeyJohto, 0}, {Items.basementKeyJohto, 0}, {Items.squirtBottle, 0}, {Items.redScale, 0}, {Items.lostItem, 0}, {Items.pass, 0}, {Items.machinePart, 0}, {Items.silverWing, 0}, {Items.rainbowWing, 0}, {Items.mysteryEgg, 0}, {Items.redApricorn, 2}, {Items.blueApricorn, 2}, {Items.yellowApricorn, 2}, {Items.greenApricorn, 2}, {Items.pinkApricorn, 2}, {Items.whiteApricorn, 2}, {Items.blackApricorn, 2}, {Items.fastBall, 30}, {Items.levelBall, 30}, {Items.lureBall, 30}, {Items.heavyBall, 30}, {Items.loveBall, 30}, {Items.friendBall, 30}, {Items.moonBall, 30}, {Items.sportBall, 30}, {Items.parkBall, 0}, {Items.photoAlbum, 0}, {Items.gbSounds, 0}, {Items.tidalBell, 0}, {Items.rageCandyBar, 35}, {Items.dataCard01, 0}, {Items.dataCard02, 0}, {Items.dataCard03, 0}, {Items.dataCard04, 0}, {Items.dataCard05, 0}, {Items.dataCard06, 0}, {Items.dataCard07, 0}, {Items.dataCard08, 0}, {Items.dataCard09, 0}, {Items.dataCard10, 0}, {Items.dataCard11, 0}, {Items.dataCard12, 0}, {Items.dataCard13, 0}, {Items.dataCard14, 0}, {Items.dataCard15, 0}, {Items.dataCard16, 0}, {Items.dataCard17, 0}, {Items.dataCard18, 0}, {Items.dataCard19, 0}, {Items.dataCard20, 0}, {Items.dataCard21, 0}, {Items.dataCard22, 0}, {Items.dataCard23, 0}, {Items.dataCard24, 0}, {Items.dataCard25, 0}, {Items.dataCard26, 0}, {Items.dataCard27, 0}, {Items.jadeOrb, 0}, {Items.lockCapsule, 0}, {Items.redOrb, 0}, {Items.blueOrb, 0}, {Items.enigmaStone, 0}, {Items.prismScale, 300}, {Items.eviolite, 1000}, {Items.floatStone, 100}, {Items.rockyHelmet, 600}, {Items.airBalloon, 100}, {Items.redCard, 100}, {Items.ringTarget, 100}, {Items.bindingBand, 200}, {Items.absorbBulb, 100}, {Items.cellBattery, 100}, {Items.ejectButton, 100}, {Items.fireGem, 100}, {Items.waterGem, 100}, {Items.electricGem, 100}, {Items.grassGem, 100}, {Items.iceGem, 100}, {Items.fightingGem, 100}, {Items.poisonGem, 100}, {Items.groundGem, 100}, {Items.flyingGem, 100}, {Items.psychicGem, 100}, {Items.bugGem, 100}, {Items.rockGem, 100}, {Items.ghostGem, 100}, {Items.dragonGem, 100}, {Items.darkGem, 100}, {Items.steelGem, 100}, {Items.normalGem, 100}, {Items.healthFeather, 30}, {Items.muscleFeather, 30}, {Items.resistFeather, 30}, {Items.geniusFeather, 30}, {Items.cleverFeather, 30}, {Items.swiftFeather, 30}, {Items.prettyFeather, 100}, {Items.coverFossil, 700}, {Items.plumeFossil, 700}, {Items.libertyPass, 0}, {Items.passOrb, 20}, {Items.dreamBall, 100}, {Items.pokeToy, 10}, {Items.propCase, 0}, {Items.dragonSkull, 0}, {Items.balmMushroom, 1500}, {Items.bigNugget, 4000}, {Items.pearlString, 3000}, {Items.cometShard, 6000}, {Items.relicCopper, 0}, {Items.relicSilver, 0}, {Items.relicGold, 0}, {Items.relicVase, 0}, {Items.relicBand, 0}, {Items.relicStatue, 0}, {Items.relicCrown, 0}, {Items.casteliacone, 35}, {Items.direHit2, 0}, {Items.xSpeed2, 0}, {Items.xSpAtk2, 0}, {Items.xSpDef2, 0}, {Items.xDefense2, 0}, {Items.xAttack2, 0}, {Items.xAccuracy2, 0}, {Items.xSpeed3, 0}, {Items.xSpAtk3, 0}, {Items.xSpDef3, 0}, {Items.xDefense3, 0}, {Items.xAttack3, 0}, {Items.xAccuracy3, 0}, {Items.xSpeed6, 0}, {Items.xSpAtk6, 0}, {Items.xSpDef6, 0}, {Items.xDefense6, 0}, {Items.xAttack6, 0}, {Items.xAccuracy6, 0}, {Items.abilityUrge, 0}, {Items.itemDrop, 0}, {Items.itemUrge, 0}, {Items.resetUrge, 0}, {Items.direHit3, 0}, {Items.lightStone, 0}, {Items.darkStone, 0}, {Items.tm93, 2000}, {Items.tm94, 2000}, {Items.tm95, 1000}, {Items.xtransceiverMale, 0}, {Items.unused622, 0}, {Items.gram1, 0}, {Items.gram2, 0}, {Items.gram3, 0}, {Items.xtransceiverFemale, 0}, {Items.medalBox, 0}, {Items.dNASplicersFuse, 0}, {Items.dNASplicersSeparate, 0}, {Items.permit, 0}, {Items.ovalCharm, 0}, {Items.shinyCharm, 0}, {Items.plasmaCard, 0}, {Items.grubbyHanky, 0}, {Items.colressMachine, 0}, {Items.droppedItemCurtis, 0}, {Items.droppedItemYancy, 0}, {Items.revealGlass, 0}, {Items.weaknessPolicy, 200}, {Items.assaultVest, 600}, {Items.holoCasterMale, 0}, {Items.profsLetter, 0}, {Items.rollerSkates, 0}, {Items.pixiePlate, 200}, {Items.abilityCapsule, 500}, {Items.whippedDream, 300}, {Items.sachet, 300}, {Items.luminousMoss, 20}, {Items.snowball, 20}, {Items.safetyGoggles, 300}, {Items.pokeFlute, 0}, {Items.richMulch, 20}, {Items.surpriseMulch, 20}, {Items.boostMulch, 20}, {Items.amazeMulch, 20}, {Items.gengarite, 1000}, {Items.gardevoirite, 1000}, {Items.ampharosite, 1000}, {Items.venusaurite, 1000}, {Items.charizarditeX, 1000}, {Items.blastoisinite, 1000}, {Items.mewtwoniteX, 2000}, {Items.mewtwoniteY, 2000}, {Items.blazikenite, 1000}, {Items.medichamite, 500}, {Items.houndoominite, 1000}, {Items.aggronite, 1000}, {Items.banettite, 500}, {Items.tyranitarite, 2000}, {Items.scizorite, 1000}, {Items.pinsirite, 1000}, {Items.aerodactylite, 1000}, {Items.lucarionite, 1000}, {Items.abomasite, 500}, {Items.kangaskhanite, 500}, {Items.gyaradosite, 1000}, {Items.absolite, 500}, {Items.charizarditeY, 1000}, {Items.alakazite, 1000}, {Items.heracronite, 1000}, {Items.mawilite, 300}, {Items.manectite, 500}, {Items.garchompite, 2000}, {Items.latiasite, 2000}, {Items.latiosite, 2000}, {Items.roseliBerry, 100}, {Items.keeBerry, 100}, {Items.marangaBerry, 100}, {Items.sprinklotad, 0}, {Items.tm96, 1000}, {Items.tm97, 1000}, {Items.tm98, 2000}, {Items.tm99, 1000}, {Items.tm100, 500}, {Items.powerPlantPass, 0}, {Items.megaRing, 0}, {Items.intriguingStone, 0}, {Items.commonStone, 0}, {Items.discountCoupon, 2}, {Items.elevatorKey, 0}, {Items.tmvPass, 0}, {Items.honorofKalos, 0}, {Items.adventureGuide, 0}, {Items.strangeSouvenir, 300}, {Items.lensCase, 0}, {Items.makeupBag, 0}, {Items.travelTrunk, 0}, {Items.lumioseGalette, 35}, {Items.shalourSable, 35}, {Items.jawFossil, 700}, {Items.sailFossil, 700}, {Items.lookerTicket, 0}, {Items.bikeYellow, 0}, {Items.holoCasterFemale, 0}, {Items.fairyGem, 100}, {Items.megaCharm, 0}, {Items.megaGlove, 0}, {Items.machBike, 0}, {Items.acroBike, 0}, {Items.wailmerPail, 0}, {Items.devonParts, 0}, {Items.sootSack, 0}, {Items.basementKeyHoenn, 0}, {Items.pokeblockKit, 0}, {Items.letter, 0}, {Items.eonTicket, 0}, {Items.scanner, 0}, {Items.goGoggles, 0}, {Items.meteoriteFirstForm, 0}, {Items.keytoRoom1, 0}, {Items.keytoRoom2, 0}, {Items.keytoRoom4, 0}, {Items.keytoRoom6, 0}, {Items.storageKeyHoenn, 0}, {Items.devonScope, 0}, {Items.ssTicketHoenn, 0}, {Items.hm07ORAS, 0}, {Items.devonScubaGear, 0}, {Items.contestCostumeMale, 0}, {Items.contestCostumeFemale, 0}, {Items.magmaSuit, 0}, {Items.aquaSuit, 0}, {Items.pairOfTickets, 0}, {Items.megaBracelet, 0}, {Items.megaPendant, 0}, {Items.megaGlasses, 0}, {Items.megaAnchor, 0}, {Items.megaStickpin, 0}, {Items.megaTiara, 0}, {Items.megaAnklet, 0}, {Items.meteoriteSecondForm, 0}, {Items.swampertite, 1000}, {Items.sceptilite, 1000}, {Items.sablenite, 300}, {Items.altarianite, 500}, {Items.galladite, 1000}, {Items.audinite, 500}, {Items.metagrossite, 2000}, {Items.sharpedonite, 500}, {Items.slowbronite, 500}, {Items.steelixite, 1000}, {Items.pidgeotite, 500}, {Items.glalitite, 500}, {Items.diancite, 2000}, {Items.prisonBottle, 0}, {Items.megaCuff, 0}, {Items.cameruptite, 500}, {Items.lopunnite, 500}, {Items.salamencite, 2000}, {Items.beedrillite, 300}, {Items.meteoriteThirdForm, 0}, {Items.meteoriteFinalForm, 0}, {Items.keyStone, 0}, {Items.meteoriteShard, 0}, {Items.eonFlute, 0}, {Items.normaliumZHeld, 0}, {Items.firiumZHeld, 0}, {Items.wateriumZHeld, 0}, {Items.electriumZHeld, 0}, {Items.grassiumZHeld, 0}, {Items.iciumZHeld, 0}, {Items.fightiniumZHeld, 0}, {Items.poisoniumZHeld, 0}, {Items.groundiumZHeld, 0}, {Items.flyiniumZHeld, 0}, {Items.psychiumZHeld, 0}, {Items.buginiumZHeld, 0}, {Items.rockiumZHeld, 0}, {Items.ghostiumZHeld, 0}, {Items.dragoniumZHeld, 0}, {Items.darkiniumZHeld, 0}, {Items.steeliumZHeld, 0}, {Items.fairiumZHeld, 0}, {Items.pikaniumZHeld, 0}, {Items.bottleCap, 500}, {Items.goldBottleCap, 1000}, {Items.zRing, 0}, {Items.decidiumZHeld, 0}, {Items.inciniumZHeld, 0}, {Items.primariumZHeld, 0}, {Items.tapuniumZHeld, 0}, {Items.marshadiumZHeld, 0}, {Items.aloraichiumZHeld, 0}, {Items.snorliumZHeld, 0}, {Items.eeviumZHeld, 0}, {Items.mewniumZHeld, 0}, {Items.normaliumZBag, 0}, {Items.firiumZBag, 0}, {Items.wateriumZBag, 0}, {Items.electriumZBag, 0}, {Items.grassiumZBag, 0}, {Items.iciumZBag, 0}, {Items.fightiniumZBag, 0}, {Items.poisoniumZBag, 0}, {Items.groundiumZBag, 0}, {Items.flyiniumZBag, 0}, {Items.psychiumZBag, 0}, {Items.buginiumZBag, 0}, {Items.rockiumZBag, 0}, {Items.ghostiumZBag, 0}, {Items.dragoniumZBag, 0}, {Items.darkiniumZBag, 0}, {Items.steeliumZBag, 0}, {Items.fairiumZBag, 0}, {Items.pikaniumZBag, 0}, {Items.decidiumZBag, 0}, {Items.inciniumZBag, 0}, {Items.primariumZBag, 0}, {Items.tapuniumZBag, 0}, {Items.marshadiumZBag, 0}, {Items.aloraichiumZBag, 0}, {Items.snorliumZBag, 0}, {Items.eeviumZBag, 0}, {Items.mewniumZBag, 0}, {Items.pikashuniumZHeld, 0}, {Items.pikashuniumZBag, 0}, {Items.unused837, 0}, {Items.unused838, 0}, {Items.unused839, 0}, {Items.unused840, 0}, {Items.forageBag, 0}, {Items.fishingRod, 0}, {Items.professorsMask, 0}, {Items.festivalTicket, 1}, {Items.sparklingStone, 0}, {Items.adrenalineOrb, 30}, {Items.zygardeCube, 0}, {Items.unused848, 0}, {Items.iceStone, 300}, {Items.ridePager, 0}, {Items.beastBall, 30}, {Items.bigMalasada, 35}, {Items.redNectar, 30}, {Items.yellowNectar, 30}, {Items.pinkNectar, 30}, {Items.purpleNectar, 30}, {Items.sunFlute, 0}, {Items.moonFlute, 0}, {Items.unused859, 0}, {Items.enigmaticCard, 0}, {Items.silverRazzBerry, 0}, // unused in Gen 7 {Items.goldenRazzBerry, 0}, // unused in Gen 7 {Items.silverNanabBerry, 0}, // unused in Gen 7 {Items.goldenNanabBerry, 0}, // unused in Gen 7 {Items.silverPinapBerry, 0}, // unused in Gen 7 {Items.goldenPinapBerry, 0}, // unused in Gen 7 {Items.unused867, 0}, {Items.unused868, 0}, {Items.unused869, 0}, {Items.unused870, 0}, {Items.unused871, 0}, {Items.secretKeyKanto, 0}, // unused in Gen 7 {Items.ssTicketKanto, 0}, // unused in Gen 7 {Items.silphScope, 0}, // unused in Gen 7 {Items.parcelKanto, 0}, // unused in Gen 7 {Items.cardKeyKanto, 0}, // unused in Gen 7 {Items.goldTeeth, 0}, // unused in Gen 7 {Items.liftKey, 0}, // unused in Gen 7 {Items.terrainExtender, 400}, {Items.protectivePads, 300}, {Items.electricSeed, 100}, {Items.psychicSeed, 100}, {Items.mistySeed, 100}, {Items.grassySeed, 100}, {Items.stretchySpring, 0}, // unused in Gen 7 {Items.chalkyStone, 0}, // unused in Gen 7 {Items.marble, 0}, // unused in Gen 7 {Items.loneEarring, 0}, // unused in Gen 7 {Items.beachGlass, 0}, // unused in Gen 7 {Items.goldLeaf, 0}, // unused in Gen 7 {Items.silverLeaf, 0}, // unused in Gen 7 {Items.polishedMudBall, 0}, // unused in Gen 7 {Items.tropicalShell, 0}, // unused in Gen 7 {Items.leafLetterPikachu, 0}, // unused in Gen 7 {Items.leafLetterEevee, 0}, // unused in Gen 7 {Items.smallBouquet, 0}, // unused in Gen 7 {Items.unused897, 0}, {Items.unused898, 0}, {Items.unused899, 0}, {Items.lure, 0}, // unused in Gen 7 {Items.superLure, 0}, // unused in Gen 7 {Items.maxLure, 0}, // unused in Gen 7 {Items.pewterCrunchies, 0}, // unused in Gen 7 {Items.fightingMemory, 100}, {Items.flyingMemory, 100}, {Items.poisonMemory, 100}, {Items.groundMemory, 100}, {Items.rockMemory, 100}, {Items.bugMemory, 100}, {Items.ghostMemory, 100}, {Items.steelMemory, 100}, {Items.fireMemory, 100}, {Items.waterMemory, 100}, {Items.grassMemory, 100}, {Items.electricMemory, 100}, {Items.psychicMemory, 100}, {Items.iceMemory, 100}, {Items.dragonMemory, 100}, {Items.darkMemory, 100}, {Items.fairyMemory, 100}, {Items.solganiumZBag, 0}, {Items.lunaliumZBag, 0}, {Items.ultranecroziumZBag, 0}, {Items.mimikiumZHeld, 0}, {Items.lycaniumZHeld, 0}, {Items.kommoniumZHeld, 0}, {Items.solganiumZHeld, 0}, {Items.lunaliumZHeld, 0}, {Items.ultranecroziumZHeld, 0}, {Items.mimikiumZBag, 0}, {Items.lycaniumZBag, 0}, {Items.kommoniumZBag, 0}, {Items.zPowerRing, 0}, {Items.pinkPetal, 0}, {Items.orangePetal, 0}, {Items.bluePetal, 0}, {Items.redPetal, 0}, {Items.greenPetal, 0}, {Items.yellowPetal, 0}, {Items.purplePetal, 0}, {Items.rainbowFlower, 0}, {Items.surgeBadge, 0}, {Items.nSolarizerFuse, 0}, {Items.nLunarizerFuse, 0}, {Items.nSolarizerSeparate, 0}, {Items.nLunarizerSeparate, 0}, {Items.ilimaNormaliumZ, 0}, {Items.leftPokeBall, 0}, {Items.rotoHatch, 0}, {Items.rotoBargain, 0}, {Items.rotoPrizeMoney, 0}, {Items.rotoExpPoints, 0}, {Items.rotoFriendship, 0}, {Items.rotoEncounter, 0}, {Items.rotoStealth, 0}, {Items.rotoHPRestore, 0}, {Items.rotoPPRestore, 0}, {Items.rotoBoost, 0}, {Items.rotoCatch, 0}, }).collect(Collectors.toMap(kv -> kv[0], kv -> kv[1]));
