import * as Abilities from './abilities';
import * as Items from './items';
import * as Moves from './moves';
import * as Species from './species';
import * as N3DSConstants from './n3ds-constants';
import * as Gen5Constants from './gen5-constants';
import { ItemList } from '../pokemon/item-list';
import { MoveCategory } from '../pokemon/move-category';

export const Type_XY = N3DSConstants.Type_XY;
export const Type_ORAS = N3DSConstants.Type_ORAS;

export const pokemonCount = 721;
export const xyFormeCount = 77;
export const orasFormeCount = 104;
export const orasformeMovesetOffset = 35;

export const actuallyCosmeticForms: number[] = [ Species.Gen6Formes.cherrimCosmetic1, Species.Gen6Formes.keldeoCosmetic1, Species.Gen6Formes.furfrouCosmetic1, Species.Gen6Formes.furfrouCosmetic2, Species.Gen6Formes.furfrouCosmetic3, Species.Gen6Formes.furfrouCosmetic4, Species.Gen6Formes.furfrouCosmetic5, Species.Gen6Formes.furfrouCosmetic6, Species.Gen6Formes.furfrouCosmetic7, Species.Gen6Formes.furfrouCosmetic8, Species.Gen6Formes.furfrouCosmetic9, Species.Gen6Formes.pumpkabooCosmetic1, Species.Gen6Formes.pumpkabooCosmetic2, Species.Gen6Formes.pumpkabooCosmetic3, Species.Gen6Formes.gourgeistCosmetic1, Species.Gen6Formes.gourgeistCosmetic2, Species.Gen6Formes.gourgeistCosmetic3, Species.Gen6Formes.floetteCosmetic1, Species.Gen6Formes.floetteCosmetic2, Species.Gen6Formes.floetteCosmetic3, Species.Gen6Formes.floetteCosmetic4, Species.Gen6Formes.pikachuCosmetic1, Species.Gen6Formes.pikachuCosmetic2, Species.Gen6Formes.pikachuCosmetic3, Species.Gen6Formes.pikachuCosmetic4, Species.Gen6Formes.pikachuCosmetic5, Species.Gen6Formes.pikachuCosmetic6 ];

export const criesTablePrefixXY = "60000A006B000A0082000A003D010A00";

export const introPokemonModelOffsetXY = "01000400020002000200000003000000";
export const introInitialCryOffset1XY = "3AFEFFEB000055E31400D40507005001";
export const introInitialCryOffset2XY = "0800A0E110FEFFEB000057E31550C405";
export const introInitialCryOffset3XY = "0020E0E30310A0E1E4FDFFEB0000A0E3";
export const introRepeatedCryOffsetXY = "1080BDE800002041000000008D001000";

const speciesToMegaStoneXY = setupSpeciesToMegaStone(Type_XY);
export const speciesToMegaStoneORAS = setupSpeciesToMegaStone(Type_ORAS);

export const formeSuffixes = setupFormeSuffixes();
const dummyFormeSuffixes = setupDummyFormeSuffixes();
const formeSuffixesByBaseForme = setupFormeSuffixesByBaseForme();

export function getFormeSuffixByBaseForme(baseForme: number, formNum: number): string {
    return (formeSuffixesByBaseForme.get(baseForme) ?? dummyFormeSuffixes).get(formNum) ?? "";
}

export const xyIrregularFormes: number[] = [ Species.Gen6Formes.castformF, Species.Gen6Formes.castformW, Species.Gen6Formes.castformI, Species.Gen6Formes.darmanitanZ, Species.Gen6Formes.meloettaP, Species.Gen6Formes.kyuremW, Species.Gen6Formes.kyuremB, Species.Gen6Formes.gengarMega, Species.Gen6Formes.gardevoirMega, Species.Gen6Formes.ampharosMega, Species.Gen6Formes.venusaurMega, Species.Gen6Formes.charizardMegaX, Species.Gen6Formes.charizardMegaY, Species.Gen6Formes.mewtwoMegaX, Species.Gen6Formes.mewtwoMegaY, Species.Gen6Formes.blazikenMega, Species.Gen6Formes.medichamMega, Species.Gen6Formes.houndoomMega, Species.Gen6Formes.aggronMega, Species.Gen6Formes.banetteMega, Species.Gen6Formes.tyranitarMega, Species.Gen6Formes.scizorMega, Species.Gen6Formes.pinsirMega, Species.Gen6Formes.aerodactylMega, Species.Gen6Formes.lucarioMega, Species.Gen6Formes.abomasnowMega, Species.Gen6Formes.aegislashB, Species.Gen6Formes.blastoiseMega, Species.Gen6Formes.kangaskhanMega, Species.Gen6Formes.gyaradosMega, Species.Gen6Formes.absolMega, Species.Gen6Formes.alakazamMega, Species.Gen6Formes.heracrossMega, Species.Gen6Formes.mawileMega, Species.Gen6Formes.manectricMega, Species.Gen6Formes.garchompMega, Species.Gen6Formes.latiosMega, Species.Gen6Formes.latiasMega ];

export const orasIrregularFormes: number[] = [ Species.Gen6Formes.castformF, Species.Gen6Formes.castformW, Species.Gen6Formes.castformI, Species.Gen6Formes.darmanitanZ, Species.Gen6Formes.meloettaP, Species.Gen6Formes.kyuremW, Species.Gen6Formes.kyuremB, Species.Gen6Formes.gengarMega, Species.Gen6Formes.gardevoirMega, Species.Gen6Formes.ampharosMega, Species.Gen6Formes.venusaurMega, Species.Gen6Formes.charizardMegaX, Species.Gen6Formes.charizardMegaY, Species.Gen6Formes.mewtwoMegaX, Species.Gen6Formes.mewtwoMegaY, Species.Gen6Formes.blazikenMega, Species.Gen6Formes.medichamMega, Species.Gen6Formes.houndoomMega, Species.Gen6Formes.aggronMega, Species.Gen6Formes.banetteMega, Species.Gen6Formes.tyranitarMega, Species.Gen6Formes.scizorMega, Species.Gen6Formes.pinsirMega, Species.Gen6Formes.aerodactylMega, Species.Gen6Formes.lucarioMega, Species.Gen6Formes.abomasnowMega, Species.Gen6Formes.aegislashB, Species.Gen6Formes.blastoiseMega, Species.Gen6Formes.kangaskhanMega, Species.Gen6Formes.gyaradosMega, Species.Gen6Formes.absolMega, Species.Gen6Formes.alakazamMega, Species.Gen6Formes.heracrossMega, Species.Gen6Formes.mawileMega, Species.Gen6Formes.manectricMega, Species.Gen6Formes.garchompMega, Species.Gen6Formes.latiosMega, Species.Gen6Formes.latiasMega, Species.Gen6Formes.swampertMega, Species.Gen6Formes.sceptileMega, Species.Gen6Formes.sableyeMega, Species.Gen6Formes.altariaMega, Species.Gen6Formes.galladeMega, Species.Gen6Formes.audinoMega, Species.Gen6Formes.sharpedoMega, Species.Gen6Formes.slowbroMega, Species.Gen6Formes.steelixMega, Species.Gen6Formes.pidgeotMega, Species.Gen6Formes.glalieMega, Species.Gen6Formes.diancieMega, Species.Gen6Formes.metagrossMega, Species.Gen6Formes.kyogreP, Species.Gen6Formes.groudonP, Species.Gen6Formes.rayquazaMega, Species.Gen6Formes.cameruptMega, Species.Gen6Formes.lopunnyMega, Species.Gen6Formes.salamenceMega, Species.Gen6Formes.beedrillMega ];

export const moveCountXY = 617;
export const moveCountORAS = 621;
export const highestAbilityIndexXY = Abilities.auraBreak;
export const highestAbilityIndexORAS = Abilities.deltaStream;

export const uselessAbilities: number[] = [Abilities.forecast, Abilities.multitype, Abilities.flowerGift, Abilities.zenMode, Abilities.stanceChange];

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

export const noDamageStatusQuality = 1;
export const noDamageStatChangeQuality = 2;
export const damageStatusQuality = 4;
export const noDamageStatusAndStatChangeQuality = 5;
export const damageTargetDebuffQuality = 6;
export const damageUserBuffQuality = 7;
export const damageAbsorbQuality = 8;

//     public static const bannedMoves: number[] = Collections.singletonList(Moves.hyperspaceFury);
// 
export const typeTable: (string | null)[] = constructTypeTable();

// Copied from pk3DS. "Dark Grass Held Item" should probably be renamed
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
export const bsFormeOffset = 28;
export const bsFormeSpriteOffset = 30;
export const bsFormeCountOffset = 32;
export const bsTMHMCompatOffset = 40;
export const bsSpecialMTCompatOffset = 56;
export const bsMTCompatOffset = 64;

export const bsSizeXY = 0x40;
export const bsSizeORAS = 0x50;

export const evolutionMethodCount = 34;

export const staticPokemonSize = 0xC;
export const staticPokemonCountXY = 0xD;
export const staticPokemonCountORAS = 0x3B;

export const giftPokemonSizeXY = 0x18;
export const giftPokemonSizeORAS = 0x24;
export const giftPokemonCountXY = 0x13;
export const giftPokemonCountORAS = 0x25;

export const tmDataPrefix = "D400AE02AF02B002";
export const tmCount = 100;
export const tmBlockOneCount = 92;
export const tmBlockTwoCount = 3;
export const tmBlockThreeCount = 5;
export const tmBlockOneOffset = Items.tm01;
export const tmBlockTwoOffset = Items.tm93;
export const tmBlockThreeOffset = Items.tm96;
export const hmBlockOneCount = 5;
export const rockSmashOffsetORAS = 10;
export const diveOffsetORAS = 28;
export const tmBlockTwoStartingOffsetXY = 97;
export const tmBlockTwoStartingOffsetORAS = 98;
export const hmCountXY = 5;
export const hmCountORAS = 7;
export const hiddenItemCountORAS = 170;
export const hiddenItemsPrefixORAS = "A100A200A300A400A5001400010053004A0084000900";
export const itemPalettesPrefix = "6F7461746500FF920A063F";
export const shopItemsLocatorXY = "0400110004000300", shopItemsLocatorORAS = "04001100120004000300";

export const tutorMoveCount = 60;
export const tutorsLocator = "C2015701A20012024401BA01";
export const tutorsShopPrefix = "8A02000030000000";

export const tutorSize: number[] = [15, 17, 16, 15];

export const ingameTradesPrefixXY = "BA0A02015E000100BC0A150069000100";
export const ingameTradesPrefixORAS = "810B7A0097000A00000047006B000A00";

export const ingameTradeSize = 0x24;

export const friendshipValueForEvoLocator = "DC0050E3BC00002A";

export const perfectOddsBranchLocator = "050000BA000050E3";

export const fastestTextPrefixes: string[] = ["1080BDE80000A0E31080BDE8F0412DE9", "485080E59C4040E24C50C0E5EC009FE5"];

export const mainGameShopsXY: number[] = [ 10,11,12,13,16,17,20,21,24,25 ];

export const mainGameShopsORAS: number[] = [ 10, 11, 13, 14, 16, 17, 18, 19, 20, 21 ];

export const shopNamesXY: string[] = [ "Primary 0 Badges", "Primary 1 Badges", "Primary 2 Badges", "Primary 3 Badges", "Primary 4 Badges", "Primary 5 Badges", "Primary 6 Badges", "Primary 7 Badges", "Primary 8 Badges", "Unused", "Lumiose Herboriste", "Lumiose Poké Ball Boutique", "Lumiose Stone Emporium", "Coumarine Incenses", "Aquacorde Poké Ball", "Aquacorde Potion", "Lumiose North Secondary", "Cyllage Secondary", "Shalour Secondary (TMs)", "Lumiose South Secondary (TMs)", "Laverre Secondary", "Snowbelle Secondary", "Kiloude Secondary (TMs)", "Anistar Secondary (TMs)", "Santalune Secondary", "Coumarine Secondary"];

export const shopNamesORAS: string[] = [ "Primary 0 Badges (After Pokédex)", "Primary 1 Badges", "Primary 2 Badges", "Primary 3 Badges", "Primary 4 Badges", "Primary 5 Badges", "Primary 6 Badges", "Primary 7 Badges", "Primary 8 Badges", "Primary 0 Badges (Before Pokédex)", "Slateport Incenses", "Slateport Vitamins", "Slateport TMs", "Rustboro Secondary", "Slateport Secondary", "Mauville Secondary (TMs)", "Verdanturf Secondary", "Fallarbor Secondary", "Lavaridge Herbs", "Lilycove Dept. Store 2F Left", "Lilycove Dept. Store 3F Left", "Lilycove Dept. Store 3F Right", "Lilycove Dept. Store 4F Left (TMs)", "Lilycove Dept. Store 4F Right (TMs)"];

export const evolutionItems: number[] = [Items.sunStone, Items.moonStone, Items.fireStone, Items.thunderStone, Items.waterStone, Items.leafStone, Items.shinyStone, Items.duskStone, Items.dawnStone, Items.ovalStone, Items.kingsRock, Items.deepSeaTooth, Items.deepSeaScale, Items.metalCoat, Items.dragonScale, Items.upgrade, Items.protector, Items.electirizer, Items.magmarizer, Items.dubiousDisc, Items.reaperCloth, Items.razorClaw, Items.razorFang, Items.prismScale, Items.whippedDream, Items.sachet];

export const requiredFieldTMsXY: number[] = [ 1, 9, 40, 19, 65, 73, 69, 74, 81, 57, 61, 97, 95, 71, 79, 30, 31, 36, 53, 29, 22, 3, 2, 80, 26];

export const requiredFieldTMsORAS: number[] = [ 37, 32, 62, 11, 86, 29, 59, 43, 53, 69, 6, 2, 13, 18, 22, 61, 30, 97, 7, 90, 26, 55, 34, 35, 64, 65, 66, 74, 79, 80, 81, 84, 89, 91, 93, 95];

export const fieldMovesXY: number[] = [ Moves.cut, Moves.fly, Moves.surf, Moves.strength, Moves.flash, Moves.dig, Moves.teleport, Moves.waterfall, Moves.sweetScent, Moves.rockSmash];
export const fieldMovesORAS: number[] = [ Moves.cut, Moves.fly, Moves.surf, Moves.strength, Moves.flash, Moves.dig, Moves.teleport, Moves.waterfall, Moves.sweetScent, Moves.rockSmash, Moves.secretPower, Moves.dive];

export const fallingEncounterOffset = 0xF4270;
export const fallingEncounterCount = 55;
export const fieldEncounterSize = 0x3C;
export const rustlingBushEncounterOffset = 0xF40CC;
export const rustlingBushEncounterCount = 7;
// TODO: const fallingEncounterNameMap = constructFallingEncounterNameMap();
// TODO: const rustlingBushEncounterNameMap = constructRustlingBushEncounterNameMap();
export const perPokemonAreaDataLengthXY = 0xE8;
export const perPokemonAreaDataLengthORAS = 0x2A0;

export const saveLoadFormeReversionPrefixXY = "09EB000094E5141094E54A0B80E2", saveLoadFormeReversionPrefixORAS = "09EB000094E5141094E5120A80E2";
export const afterBattleFormeReversionPrefix = "E4FFFFEA0000000000000000";
export const ninjaskSpeciesPrefix = "241094E5B810D1E1", shedinjaSpeciesPrefix = "C2FFFFEB0040A0E10020A0E3";
export const boxLegendaryFunctionPrefixXY = "14D08DE20900A0E1";
export const boxLegendaryEncounterFileXY = 341;
export const boxLegendaryLocalScriptOffsetXY = 0x6E0;
export const boxLegendaryCodeOffsetsXY: number[] = [ 144, 300, 584 ];
export const seaSpiritsDenEncounterFileXY = 351;
export const seaSpiritsDenLocalScriptOffsetXY = 0x1C0;
export const seaSpiritsDenScriptOffsetsXY: number[] = [ 0x500, 0x508, 0x510 ];
export const rayquazaFunctionPrefixORAS = "0900A0E1F08FBDE8";
export const rayquazaScriptOffsetsORAS: number[] = [ 3334, 14734 ];
export const rayquazaCodeOffsetsORAS: number[] = [ 136, 292, 576 ];
export const nationalDexFunctionLocator = "080094E5010000E21080BDE8170F122F", xyGetDexFlagFunctionLocator = "000055E30100A0030A00000A", orasGetHoennDexCaughtFunctionPrefix = "170F122F1CC15800";
export const megastoneTableStartingOffsetORAS = 0xABA;
export const megastoneTableEntrySizeORAS = 0x20;
export const megastoneTableLengthORAS = 27;

export const pickupTableLocator = "110012001A00";
export const numberOfPickupItems = 29;

export const xyRoamerFreeSpacePostfix = "540095E50220A0E30810A0E1", xyRoamerSpeciesLocator = "9040A0030400000A", xyRoamerLevelPrefix = "B020DDE13F3BC1E3";

export const xyTrashEncountersTablePrefix = "4028100000";
export const xyTrashEncounterDataLength = 16;
export const xyTrashCanEncounterCount = 24;
export const pokemonVillageGarbadorOffset = 0;
export const pokemonVillageGarbadorCount = 6;
export const pokemonVillageBanetteOffset = 6;
export const pokemonVillageBanetteCount = 6;
export const lostHotelGarbadorOffset = 12;
export const lostHotelGarbadorCount = 3;
export const lostHotelTrubbishOffset = 15;
export const lostHotelTrubbishCount = 3;
export const lostHotelRotomOffset = 18;
export const lostHotelRotomCount = 6;

//     public static const xyHardcodedTradeTexts: number[] = Arrays.asList(129, 349);
// 
export const consumableHeldItems: number[] = setupAllConsumableItems();

function setupAllConsumableItems(): number[] {
    const list: number[] = [...Gen5Constants.consumableHeldItems];
    list.push(Items.weaknessPolicy, Items.luminousMoss, Items.snowball, Items.roseliBerry,
    Items.keeBerry, Items.marangaBerry, Items.fairyGem);
    return list;
}

export const allHeldItems: number[] = setupAllHeldItems();

function setupAllHeldItems(): number[] {
    const list: number[] = [...Gen5Constants.allHeldItems];
    list.push(Items.weaknessPolicy, Items.snowball, Items.roseliBerry, Items.keeBerry,
    Items.marangaBerry, Items.fairyGem);
    list.push(Items.assaultVest, Items.pixiePlate, Items.safetyGoggles);
    return list;
}

export const generalPurposeConsumableItems: number[] = initializeGeneralPurposeConsumableItems();

function initializeGeneralPurposeConsumableItems(): number[] {
    const list: number[] = [...Gen5Constants.generalPurposeConsumableItems];
    list.push(Items.weaknessPolicy, Items.luminousMoss, Items.snowball, Items.keeBerry, Items.marangaBerry);
    return list;
}

export const generalPurposeItems: number[] = initializeGeneralPurposeItems();

function initializeGeneralPurposeItems(): number[] {
    const list: number[] = [...Gen5Constants.generalPurposeItems];
    list.push(Items.safetyGoggles);
    return list;
}

// TODO: const weaknessReducingBerries = initializeWeaknessReducingBerries();

//     private static Map<Type, Integer> initializeWeaknessReducingBerries() {
//         Map<Type, Integer> map = new HashMap<>(Gen5Constants.weaknessReducingBerries);
//         map.set(Type.FAIRY, Items.roseliBerry);
//         return Collections.unmodifiableMap(map);
//     }

// TODO: const consumableTypeBoostingItems = initializeConsumableTypeBoostingItems();

//     private static Map<Type, Integer> initializeConsumableTypeBoostingItems() {
//         Map<Type, Integer> map = new HashMap<>(Gen5Constants.consumableTypeBoostingItems);
//         map.set(Type.FAIRY, Items.fairyGem);
//         return Collections.unmodifiableMap(map);
//     }

// TODO: const typeBoostingItems = initializeTypeBoostingItems();

//     private static Map<Type, List<Integer>> initializeTypeBoostingItems() {
//         Map<Type, List<Integer>> map = new HashMap<>(Gen5Constants.typeBoostingItems);
//         map.set(Type.FAIRY, Arrays.asList(Items.pixiePlate));
//         return Collections.unmodifiableMap(map);
//     }

// TODO: const moveBoostingItems = initializeMoveBoostingItems();

//     private static Map<Integer, List<Integer>> initializeMoveBoostingItems() {
//         Map<Integer, List<Integer>> map = new HashMap<>(Gen5Constants.moveBoostingItems);
//         map.set(Moves.drainingKiss, Arrays.asList(Items.bigRoot));
//         map.set(Moves.infestation, Arrays.asList(Items.gripClaw, Items.bindingBand));
//         map.set(Moves.oblivionWing, Arrays.asList(Items.bigRoot));
//         map.set(Moves.parabolicCharge, Arrays.asList(Items.bigRoot));
//         return Collections.unmodifiableMap(map);
//     }

// TODO: const abilityBoostingItems = initializeAbilityBoostingItems();

//     private static Map<Integer, List<Integer>> initializeAbilityBoostingItems() {
//         Map<Integer, List<Integer>> map = new HashMap<>(Gen5Constants.abilityBoostingItems);
//         // Weather from abilities changed in Gen VI, so these items become relevant.
//         map.set(Abilities.drizzle, Arrays.asList(Items.dampRock));
//         map.set(Abilities.drought, Arrays.asList(Items.heatRock));
//         map.set(Abilities.sandStream, Arrays.asList(Items.smoothRock));
//         map.set(Abilities.snowWarning, Arrays.asList(Items.icyRock));
//         return Collections.unmodifiableMap(map);
//     }

// No new species boosting items in Gen VI
// TODO: const speciesBoostingItems = Gen5Constants.speciesBoostingItems;

export function getIngameTradesPrefix(romType: number): string {
    if (romType == Type_XY) {
    return ingameTradesPrefixXY;
    } else {
    return ingameTradesPrefixORAS;
    }
}

export function getRequiredFieldTMs(romType: number): number[] {
    if (romType == Type_XY) {
    return requiredFieldTMsXY;
    } else {
    return requiredFieldTMsORAS;
    }
}

export function getMainGameShops(romType: number): number[] {
    if (romType == Type_XY) {
    return mainGameShopsXY;
    } else {
    return mainGameShopsORAS;
    }
}

export function getShopNames(romType: number): string[] {
    if (romType == Type_XY) {
    return shopNamesXY;
    } else {
    return shopNamesORAS;
    }
}

export function getBsSize(romType: number): number {
    if (romType == Type_XY) {
    return bsSizeXY;
    } else {
    return bsSizeORAS;
    }
}

export function getIrregularFormes(romType: number): number[] {
    if (romType == Type_XY) {
    return xyIrregularFormes;
    } else if (romType == Type_ORAS) {
    return orasIrregularFormes;
    }
    return [];
}

export function getFormeCount(romType: number): number {
    if (romType == Type_XY) {
    return xyFormeCount;
    } else if (romType == Type_ORAS) {
    return orasFormeCount;
    }
    return 0;
}

export function getFormeMovesetOffset(romType: number): number {
    if (romType == Type_XY) {
    return orasformeMovesetOffset;
    } else if (romType == Type_ORAS) {
    return orasformeMovesetOffset;
    }
    return 0;
}

export function getMoveCount(romType: number): number {
    if (romType == Type_XY) {
    return moveCountXY;
    } else if (romType == Type_ORAS) {
    return moveCountORAS;
    }
    return moveCountXY;
}

export function getTMBlockTwoStartingOffset(romType: number): number {
    if (romType == Type_XY) {
    return tmBlockTwoStartingOffsetXY;
    } else if (romType == Type_ORAS) {
    return tmBlockTwoStartingOffsetORAS;
    }
    return tmBlockTwoStartingOffsetXY;
}

export function getHMCount(romType: number): number {
    if (romType == Type_XY) {
    return hmCountXY;
    } else if (romType == Type_ORAS) {
    return hmCountORAS;
    }
    return hmCountXY;
}

export function getHighestAbilityIndex(romType: number): number {
    if (romType == Type_XY) {
    return highestAbilityIndexXY;
    } else if (romType == Type_ORAS) {
    return highestAbilityIndexORAS;
    }
    return highestAbilityIndexXY;
}

export function getStaticPokemonCount(romType: number): number {
    if (romType == Type_XY) {
    return staticPokemonCountXY;
    } else if (romType == Type_ORAS) {
    return staticPokemonCountORAS;
    }
    return staticPokemonCountXY;
}

export function getGiftPokemonCount(romType: number): number {
    if (romType == Type_XY) {
    return giftPokemonCountXY;
    } else if (romType == Type_ORAS) {
    return giftPokemonCountORAS;
    }
    return giftPokemonCountXY;
}

export function getGiftPokemonSize(romType: number): number {
    if (romType == Type_XY) {
    return giftPokemonSizeXY;
    } else if (romType == Type_ORAS) {
    return giftPokemonSizeORAS;
    }
    return giftPokemonSizeXY;
}

export function getShopItemsLocator(romType: number): string {
    if (romType == Type_XY) {
    return shopItemsLocatorXY;
    } else if (romType == Type_ORAS) {
    return shopItemsLocatorORAS;
    }
    return shopItemsLocatorXY;
}

export function isMegaStone(itemIndex: number): boolean {
    // These values come from https://bulbapedia.bulbagarden.net/wiki/List_of_items_by_index_number_(Generation_VI)
    return (itemIndex >= Items.gengarite && itemIndex <= Items.latiosite) ||
    (itemIndex >= Items.swampertite && itemIndex <= Items.diancite) ||
    (itemIndex >= Items.cameruptite && itemIndex <= Items.beedrillite);
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

export function getSaveLoadFormeReversionPrefix(romType: number): string {
    if (romType == Type_XY) {
    return saveLoadFormeReversionPrefixXY;
    } else {
    return saveLoadFormeReversionPrefixORAS;
    }
}

function setupFormeSuffixes(): Map<number, string> {
    const formeSuffixes = new Map();
    formeSuffixes.set(Species.Gen6Formes.deoxysA,"-A");
    formeSuffixes.set(Species.Gen6Formes.deoxysD,"-D");
    formeSuffixes.set(Species.Gen6Formes.deoxysS,"-S");
    formeSuffixes.set(Species.Gen6Formes.wormadamS,"-S");
    formeSuffixes.set(Species.Gen6Formes.wormadamT,"-T");
    formeSuffixes.set(Species.Gen6Formes.shayminS,"-S");
    formeSuffixes.set(Species.Gen6Formes.giratinaO,"-O");
    formeSuffixes.set(Species.Gen6Formes.rotomH,"-H");
    formeSuffixes.set(Species.Gen6Formes.rotomW,"-W");
    formeSuffixes.set(Species.Gen6Formes.rotomFr,"-Fr");
    formeSuffixes.set(Species.Gen6Formes.rotomFa,"-Fa");
    formeSuffixes.set(Species.Gen6Formes.rotomM,"-M");
    formeSuffixes.set(Species.Gen6Formes.castformF,"-F");
    formeSuffixes.set(Species.Gen6Formes.castformW,"-W");
    formeSuffixes.set(Species.Gen6Formes.castformI,"-I");
    formeSuffixes.set(Species.Gen6Formes.basculinB,"-B");
    formeSuffixes.set(Species.Gen6Formes.darmanitanZ,"-Z");
    formeSuffixes.set(Species.Gen6Formes.meloettaP,"-P");
    formeSuffixes.set(Species.Gen6Formes.kyuremW,"-W");
    formeSuffixes.set(Species.Gen6Formes.kyuremB,"-B");
    formeSuffixes.set(Species.Gen6Formes.keldeoCosmetic1,"-R");
    formeSuffixes.set(Species.Gen6Formes.tornadusT,"-T");
    formeSuffixes.set(Species.Gen6Formes.thundurusT,"-T");
    formeSuffixes.set(Species.Gen6Formes.landorusT,"-T");
    formeSuffixes.set(Species.Gen6Formes.gengarMega,"-Mega");
    formeSuffixes.set(Species.Gen6Formes.meowsticF,"-F");
    // 749 - 757 Furfrou
    formeSuffixes.set(Species.Gen6Formes.gardevoirMega,"-Mega");
    formeSuffixes.set(Species.Gen6Formes.ampharosMega,"-Mega");
    formeSuffixes.set(Species.Gen6Formes.venusaurMega,"-Mega");
    formeSuffixes.set(Species.Gen6Formes.charizardMegaX,"-Mega-X");
    formeSuffixes.set(Species.Gen6Formes.charizardMegaY,"-Mega-Y");
    formeSuffixes.set(Species.Gen6Formes.mewtwoMegaX,"-Mega-X");
    formeSuffixes.set(Species.Gen6Formes.mewtwoMegaY,"-Mega-Y");
    formeSuffixes.set(Species.Gen6Formes.blazikenMega,"-Mega");
    formeSuffixes.set(Species.Gen6Formes.medichamMega,"-Mega");
    formeSuffixes.set(Species.Gen6Formes.houndoomMega,"-Mega");
    formeSuffixes.set(Species.Gen6Formes.aggronMega,"-Mega");
    formeSuffixes.set(Species.Gen6Formes.banetteMega,"-Mega");
    formeSuffixes.set(Species.Gen6Formes.tyranitarMega,"-Mega");
    formeSuffixes.set(Species.Gen6Formes.scizorMega,"-Mega");
    formeSuffixes.set(Species.Gen6Formes.pinsirMega,"-Mega");
    formeSuffixes.set(Species.Gen6Formes.aerodactylMega,"-Mega");
    formeSuffixes.set(Species.Gen6Formes.lucarioMega,"-Mega");
    formeSuffixes.set(Species.Gen6Formes.abomasnowMega,"-Mega");
    formeSuffixes.set(Species.Gen6Formes.aegislashB,"-B");
    formeSuffixes.set(Species.Gen6Formes.blastoiseMega,"-Mega");
    formeSuffixes.set(Species.Gen6Formes.kangaskhanMega,"-Mega");
    formeSuffixes.set(Species.Gen6Formes.gyaradosMega,"-Mega");
    formeSuffixes.set(Species.Gen6Formes.absolMega,"-Mega");
    formeSuffixes.set(Species.Gen6Formes.alakazamMega,"-Mega");
    formeSuffixes.set(Species.Gen6Formes.heracrossMega,"-Mega");
    formeSuffixes.set(Species.Gen6Formes.mawileMega,"-Mega");
    formeSuffixes.set(Species.Gen6Formes.manectricMega,"-Mega");
    formeSuffixes.set(Species.Gen6Formes.garchompMega,"-Mega");
    formeSuffixes.set(Species.Gen6Formes.latiosMega,"-Mega");
    formeSuffixes.set(Species.Gen6Formes.latiasMega,"-Mega");
    formeSuffixes.set(Species.Gen6Formes.pumpkabooCosmetic1,"-M");
    formeSuffixes.set(Species.Gen6Formes.pumpkabooCosmetic2,"-L");
    formeSuffixes.set(Species.Gen6Formes.pumpkabooCosmetic3,"-XL");
    formeSuffixes.set(Species.Gen6Formes.gourgeistCosmetic1,"-M");
    formeSuffixes.set(Species.Gen6Formes.gourgeistCosmetic2,"-L");
    formeSuffixes.set(Species.Gen6Formes.gourgeistCosmetic3,"-XL");
    // 794 - 797 Floette
    formeSuffixes.set(Species.Gen6Formes.floetteE,"-E");
    formeSuffixes.set(Species.Gen6Formes.swampertMega,"-Mega");
    formeSuffixes.set(Species.Gen6Formes.sceptileMega,"-Mega");
    formeSuffixes.set(Species.Gen6Formes.sableyeMega,"-Mega");
    formeSuffixes.set(Species.Gen6Formes.altariaMega,"-Mega");
    formeSuffixes.set(Species.Gen6Formes.galladeMega,"-Mega");
    formeSuffixes.set(Species.Gen6Formes.audinoMega,"-Mega");
    formeSuffixes.set(Species.Gen6Formes.sharpedoMega,"-Mega");
    formeSuffixes.set(Species.Gen6Formes.slowbroMega,"-Mega");
    formeSuffixes.set(Species.Gen6Formes.steelixMega,"-Mega");
    formeSuffixes.set(Species.Gen6Formes.pidgeotMega,"-Mega");
    formeSuffixes.set(Species.Gen6Formes.glalieMega,"-Mega");
    formeSuffixes.set(Species.Gen6Formes.diancieMega,"-Mega");
    formeSuffixes.set(Species.Gen6Formes.metagrossMega,"-Mega");
    formeSuffixes.set(Species.Gen6Formes.kyogreP,"-P");
    formeSuffixes.set(Species.Gen6Formes.groudonP,"-P");
    formeSuffixes.set(Species.Gen6Formes.rayquazaMega,"-Mega");
    // 815 - 820 contest Pikachu
    formeSuffixes.set(Species.Gen6Formes.hoopaU,"-U");
    formeSuffixes.set(Species.Gen6Formes.cameruptMega,"-Mega");
    formeSuffixes.set(Species.Gen6Formes.lopunnyMega,"-Mega");
    formeSuffixes.set(Species.Gen6Formes.salamenceMega,"-Mega");
    formeSuffixes.set(Species.Gen6Formes.beedrillMega,"-Mega");
    
    return formeSuffixes;
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
    
    for (const species of speciesToMegaStoneORAS.keys()) {
    const megaMap = new Map();
    if (species == Species.charizard || species == Species.mewtwo) {
    megaMap.set(1,"-Mega-X");
    megaMap.set(2,"-Mega-Y");
    } else {
    megaMap.set(1,"-Mega");
    }
    map.set(species,megaMap);
    }
    
    return map;
}

function setupDummyFormeSuffixes(): Map<number, string> {
    const m = new Map();
    m.set(0,"");
    return m;
}

//     public static const regularShopItems: number[], opShopItems;
// 

let allowedItemsXY: ItemList;
let allowedItemsORAS: ItemList;
let nonBadItemsXY: ItemList;
let nonBadItemsORAS: ItemList;
let regularShopItems: number[] = [];
let opShopItems: number[] = [];

setupAllowedItems();

function setupAllowedItems(): void {
    allowedItemsXY = new ItemList(Items.megaGlove);
    // Key items + version exclusives
    allowedItemsXY.banRange(Items.explorerKit, 76);
    allowedItemsXY.banRange(Items.dataCard01, 32);
    allowedItemsXY.banRange(Items.xtransceiverMale, 18);
    allowedItemsXY.banSingles(Items.expShare, Items.libertyPass, Items.propCase, Items.dragonSkull,
    Items.lightStone, Items.darkStone);
    // Unknown blank items or version exclusives
    allowedItemsXY.banRange(Items.tea, 3);
    allowedItemsXY.banRange(Items.unused120, 14);
    // TMs & HMs - tms cant be held in gen6
    allowedItemsXY.tmRange(Items.tm01, 92);
    allowedItemsXY.tmRange(Items.tm93, 3);
    allowedItemsXY.banRange(Items.tm01, 100);
    allowedItemsXY.banRange(Items.tm93, 3);
    // Battle Launcher exclusives
    allowedItemsXY.banRange(Items.direHit2, 24);
    
    // Key items (Gen 6)
    allowedItemsXY.banRange(Items.holoCasterMale,3);
    allowedItemsXY.banSingles(Items.pokeFlute, Items.sprinklotad);
    allowedItemsXY.banRange(Items.powerPlantPass,4);
    allowedItemsXY.banRange(Items.elevatorKey,4);
    allowedItemsXY.banRange(Items.lensCase,3);
    allowedItemsXY.banRange(Items.lookerTicket,3);
    allowedItemsXY.banRange(Items.megaCharm,2);
    
    // TMs (Gen 6)
    allowedItemsXY.tmRange(Items.tm96,5);
    allowedItemsXY.banRange(Items.tm96,5);
    
    allowedItemsORAS = allowedItemsXY.copy(Items.eonFlute);
    // Key items and an HM
    allowedItemsORAS.banRange(Items.machBike,34);
    allowedItemsORAS.banRange(Items.prisonBottle,2);
    allowedItemsORAS.banRange(Items.meteoriteThirdForm,5);
    
    // non-bad items
    // ban specific pokemon hold items, berries, apricorns, mail
    nonBadItemsXY = allowedItemsXY.copy();
    
    nonBadItemsXY.banSingles(Items.oddKeystone, Items.griseousOrb, Items.soulDew, Items.lightBall,
    Items.oranBerry, Items.quickPowder, Items.passOrb, Items.discountCoupon, Items.strangeSouvenir);
    nonBadItemsXY.banRange(Items.growthMulch, 4); // mulch
    nonBadItemsXY.banRange(Items.adamantOrb, 2); // orbs
    nonBadItemsXY.banRange(Items.mail1, 12); // mails
    nonBadItemsXY.banRange(Items.figyBerry, 25); // berries without useful battle effects
    nonBadItemsXY.banRange(Items.luckyPunch, 4); // pokemon specific
    nonBadItemsXY.banRange(Items.redScarf, 5); // contest scarves
    nonBadItemsXY.banRange(Items.relicCopper,7); // relic items
    nonBadItemsXY.banRange(Items.richMulch,4); // more mulch
    nonBadItemsXY.banRange(Items.shoalSalt, 6); // Shoal items and Shards; they serve no purpose in XY
    
    nonBadItemsORAS = allowedItemsORAS.copy();
    
    nonBadItemsORAS.banSingles(Items.oddKeystone, Items.griseousOrb, Items.soulDew, Items.lightBall,
    Items.oranBerry, Items.quickPowder, Items.passOrb, Items.discountCoupon, Items.strangeSouvenir);
    nonBadItemsORAS.banRange(Items.growthMulch, 4); // mulch
    nonBadItemsORAS.banRange(Items.adamantOrb, 2); // orbs
    nonBadItemsORAS.banRange(Items.mail1, 12); // mails
    nonBadItemsORAS.banRange(Items.figyBerry, 25); // berries without useful battle effects
    nonBadItemsORAS.banRange(Items.luckyPunch, 4); // pokemon specific
    nonBadItemsORAS.banRange(Items.redScarf, 5); // contest scarves
    nonBadItemsORAS.banRange(Items.relicCopper,7); // relic items
    nonBadItemsORAS.banRange(Items.richMulch,4); // more mulch
    
    regularShopItems = [];
    
    for (let i = Items.ultraBall; i <= Items.pokeBall; i++) regularShopItems.push(i);
    for (let i = Items.potion; i <= Items.revive; i++) regularShopItems.push(i);
    for (let i = Items.superRepel; i <= Items.repel; i++) regularShopItems.push(i);
    
    opShopItems = [];
    
    // "Money items" etc
    opShopItems.push(Items.lavaCookie);
    opShopItems.push(Items.berryJuice);
    opShopItems.push(Items.rareCandy);
    opShopItems.push(Items.oldGateau);
    for (let i = Items.blueFlute; i <= Items.shoalShell; i++) opShopItems.push(i);
    for (let i = Items.tinyMushroom; i <= Items.nugget; i++) opShopItems.push(i);
    opShopItems.push(Items.rareBone);
    for (let i = Items.lansatBerry; i <= Items.rowapBerry; i++) opShopItems.push(i);
    opShopItems.push(Items.luckyEgg);
    opShopItems.push(Items.prettyFeather);
    for (let i = Items.balmMushroom; i <= Items.casteliacone; i++) opShopItems.push(i);
}

export function getAllowedItems(romType: number): ItemList {
    if (romType == Type_XY) {
    return allowedItemsXY;
    } else {
    return allowedItemsORAS;
    }
}

export function getNonBadItems(romType: number): ItemList {
    if (romType == Type_XY) {
    return nonBadItemsXY;
    } else {
    return nonBadItemsORAS;
    }
}

export const uniqueNoSellItems: number[] = [Items.gengarite, Items.gardevoirite, Items.ampharosite, Items.venusaurite, Items.charizarditeX, Items.blastoisinite, Items.mewtwoniteX, Items.mewtwoniteY, Items.blazikenite, Items.medichamite, Items.houndoominite, Items.aggronite, Items.banettite, Items.tyranitarite, Items.scizorite, Items.pinsirite, Items.aerodactylite, Items.lucarionite, Items.abomasite, Items.kangaskhanite, Items.gyaradosite, Items.absolite, Items.charizarditeY, Items.alakazite, Items.heracronite, Items.mawilite, Items.manectite, Items.garchompite, Items.latiasite, Items.latiosite, Items.swampertite, Items.sceptilite, Items.sablenite, Items.altarianite, Items.galladite, Items.audinite, Items.metagrossite, Items.sharpedonite, Items.slowbronite, Items.steelixite, Items.pidgeotite, Items.glalitite, Items.diancite, Items.cameruptite, Items.lopunnite, Items.salamencite, Items.beedrillite];

function setupSpeciesToMegaStone(romType: number): Map<number, number[]> {
    const map = new Map<number, number[]>();
    
    map.set(Species.venusaur, [Items.venusaurite]);
    map.set(Species.charizard, [Items.charizarditeX, Items.charizarditeY]);
    map.set(Species.blastoise, [Items.blastoisinite]);
    map.set(Species.alakazam, [Items.alakazite]);
    map.set(Species.gengar, [Items.gengarite]);
    map.set(Species.kangaskhan, [Items.kangaskhanite]);
    map.set(Species.pinsir, [Items.pinsirite]);
    map.set(Species.gyarados, [Items.gyaradosite]);
    map.set(Species.aerodactyl, [Items.aerodactylite]);
    map.set(Species.mewtwo, [Items.mewtwoniteX, Items.mewtwoniteY]);
    map.set(Species.ampharos, [Items.ampharosite]);
    map.set(Species.scizor, [Items.scizorite]);
    map.set(Species.heracross, [Items.heracronite]);
    map.set(Species.houndoom, [Items.houndoominite]);
    map.set(Species.tyranitar, [Items.tyranitarite]);
    map.set(Species.blaziken, [Items.blazikenite]);
    map.set(Species.gardevoir, [Items.gardevoirite]);
    map.set(Species.mawile, [Items.mawilite]);
    map.set(Species.aggron, [Items.aggronite]);
    map.set(Species.medicham, [Items.medichamite]);
    map.set(Species.manectric, [Items.manectite]);
    map.set(Species.banette, [Items.banettite]);
    map.set(Species.absol, [Items.absolite]);
    map.set(Species.latias, [Items.latiasite]);
    map.set(Species.latios, [Items.latiosite]);
    map.set(Species.garchomp, [Items.garchompite]);
    map.set(Species.lucario, [Items.lucarionite]);
    map.set(Species.abomasnow, [Items.abomasite]);
    
    if (romType == Type_ORAS) {
    map.set(Species.beedrill, [Items.beedrillite]);
    map.set(Species.pidgeot, [Items.pidgeotite]);
    map.set(Species.slowbro, [Items.slowbronite]);
    map.set(Species.steelix, [Items.steelixite]);
    map.set(Species.sceptile, [Items.sceptilite]);
    map.set(Species.swampert, [Items.swampertite]);
    map.set(Species.sableye, [Items.sablenite]);
    map.set(Species.sharpedo, [Items.sharpedonite]);
    map.set(Species.camerupt, [Items.cameruptite]);
    map.set(Species.altaria, [Items.altarianite]);
    map.set(Species.glalie, [Items.glalitite]);
    map.set(Species.salamence, [Items.salamencite]);
    map.set(Species.metagross, [Items.metagrossite]);
    map.set(Species.lopunny, [Items.lopunnite]);
    map.set(Species.gallade, [Items.galladite]);
    map.set(Species.audino, [Items.audinite]);
    map.set(Species.diancie, [Items.diancite]);
    }
    
    return map;
}

export function tagTrainersXY(trs: any[]): void {
    
    // Gym Trainers
    tag(trs,"GYM1", 39, 40, 48);
    tag(trs,"GYM2",64, 63, 106, 105);
    tag(trs,"GYM3",83, 84, 146, 147);
    tag(trs,"GYM4", 121, 122, 123, 124);
    tag(trs,"GYM5", 461, 462, 463, 464, 465, 466, 467, 468, 469, 28, 29, 30);
    tag(trs,"GYM6", 245, 250, 248, 243);
    tag(trs,"GYM7", 170, 171, 172, 365, 366);
    tag(trs,"GYM8", 168, 169, 31, 32);
    
    // Gym Leaders
    tag(trs,"GYM1-LEADER", 6);
    tag(trs,"GYM2-LEADER",76);
    tag(trs,"GYM3-LEADER",21);
    tag(trs,"GYM4-LEADER", 22);
    tag(trs,"GYM5-LEADER", 23);
    tag(trs,"GYM6-LEADER", 24);
    tag(trs,"GYM7-LEADER", 25);
    tag(trs,"GYM8-LEADER", 26);
    
    tagTrainer(trs, 188, "NOTSTRONG"); // Successor Korrina
    
    // Elite 4
    tagTrainer(trs, 269, "ELITE1"); // Malva
    tagTrainer(trs, 271, "ELITE2"); // Siebold
    tagTrainer(trs, 187, "ELITE3"); // Wikstrom
    tagTrainer(trs, 270, "ELITE4"); // Drasna
    tagTrainer(trs, 276, "CHAMPION"); // Diantha
    
    tag(trs,"THEMED:LYSANDRE-LEADER", 303, 525, 526);
    tag(trs,"STRONG", 174, 175, 304, 344, 345, 346, 347, 348, 349, 350, 351, 470, 471, 472, 473, 474, 475, 476, 477, 478, 479); // Team Flare Admins lol
    tag(trs,"STRONG", 324, 325, 438, 439, 573); // Tierno and Trevor
    tag(trs,"STRONG", 327, 328); // Sycamore
    
    // Rival - Serena
    tagRival(trs, "RIVAL1", 596);
    tagRival(trs, "RIVAL2", 575);
    tagRival(trs, "RIVAL3", 581);
    tagRival(trs, "RIVAL4", 578);
    tagRival(trs, "RIVAL5", 584);
    tagRival(trs, "RIVAL6", 607);
    tagRival(trs, "RIVAL7", 587);
    tagRival(trs, "RIVAL8", 590);
    tagRival(trs, "RIVAL9", 593);
    tagRival(trs, "RIVAL10", 599);
    
    // Rival - Calem
    tagRival(trs, "RIVAL1", 435);
    tagRival(trs, "RIVAL2", 130);
    tagRival(trs, "RIVAL3", 329);
    tagRival(trs, "RIVAL4", 184);
    tagRival(trs, "RIVAL5", 332);
    tagRival(trs, "RIVAL6", 604);
    tagRival(trs, "RIVAL7", 335);
    tagRival(trs, "RIVAL8", 338);
    tagRival(trs, "RIVAL9", 341);
    tagRival(trs, "RIVAL10", 519);
    
    // Rival - Shauna
    tagRival(trs, "FRIEND1", 137);
    tagRival(trs, "FRIEND2", 321);
}

export function tagTrainersORAS(trs: any[]): void {
    
    // Gym Trainers & Leaders
    tag(trs,"GYM1",562, 22, 667);
    tag(trs,"GYM2",60, 56, 59);
    tag(trs,"GYM3",34, 568, 614, 35);
    tag(trs,"GYM4",81, 824, 83, 615, 823, 613, 85);
    tag(trs,"GYM5",63, 64, 65, 66, 67, 68, 69);
    tag(trs,"GYM6",115, 517, 516, 118, 730);
    tag(trs,"GYM7",157, 158, 159, 226, 320, 225);
    tag(trs,"GYM8",647, 342, 594, 646, 338, 339, 340, 341); // Includes Wallace in Delta Episode
    
    // Gym Leaders
    tag(trs,"GYM1-LEADER", 561);
    tag(trs,"GYM2-LEADER",563);
    tag(trs,"GYM3-LEADER",567);
    tag(trs,"GYM4-LEADER", 569);
    tag(trs,"GYM5-LEADER", 570);
    tag(trs,"GYM6-LEADER", 571);
    tag(trs,"GYM7-LEADER", 552);
    tag(trs,"GYM8-LEADER", 572, 943);
    
    // Elite 4
    tag(trs, "ELITE1", 553, 909); // Sidney
    tag(trs, "ELITE2", 554, 910); // Phoebe
    tag(trs, "ELITE3", 555, 911); // Glacia
    tag(trs, "ELITE4", 556, 912); // Drake
    tag(trs, "CHAMPION", 557, 913, 680, 942); // Steven (includes other appearances)
    
    tag(trs,"THEMED:MAXIE-LEADER", 235, 236, 271);
    tag(trs,"THEMED:ARCHIE-LEADER",178, 231, 266);
    tag(trs,"THEMED:MATT-STRONG",683, 684, 685, 686, 687);
    tag(trs,"THEMED:SHELLY-STRONG",688,689,690);
    tag(trs,"THEMED:TABITHA-STRONG",691,692,693);
    tag(trs,"THEMED:COURTNEY-STRONG",694,695,696,697,698);
    tag(trs, "THEMED:WALLY-STRONG", 518, 583, 944, 946);
    
    // Rival - Brendan
    tagRival(trs, "RIVAL1", 1);
    tagRival(trs, "RIVAL2", 289);
    tagRival(trs, "RIVAL3", 674);
    tagRival(trs, "RIVAL4", 292);
    tagRival(trs, "RIVAL5", 527);
    tagRival(trs, "RIVAL6", 699);
    
    // Rival - May
    tagRival(trs, "RIVAL1", 4);
    tagRival(trs, "RIVAL2", 295);
    tagRival(trs, "RIVAL3", 677);
    tagRival(trs, "RIVAL4", 298);
    tagRival(trs, "RIVAL5", 530);
    tagRival(trs, "RIVAL6", 906);
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

export function setMultiBattleStatusXY(trs: any[]): void {
    // 108 + 111: Team Flare Grunts in Glittering Cave
    // 348 + 350: Team Flare Celosia and Bryony fight in Poké Ball Factory
    // 438 + 439: Tierno and Trevor fight on Route 7
    // 470 + 611, 472 + 610, 476 + 612: Team Flare Admin and Grunt fights in Team Flare Secret HQ
    setMultiBattleStatus(trs, 108, 111, 348, 350, 438, 439, 470, 472, 476, 610, 611, 612);
}

export function setMultiBattleStatusORAS(trs: any[]): void {
    // 683 + 904: Aqua Admin Matt and Team Aqua Grunt fight on the Southern Island
    // 687 + 905: Aqua Admin Matt and Team Aqua Grunt fight at the Mossdeep Space Center
    // 688 + 903: Aqua Admin Shelly and Team Aqua Grunt fight in Meteor Falls
    // 691 + 902: Magma Admin Tabitha and Team Magma Grunt fight in Meteor Falls
    // 694 + 900: Magma Admin Courtney and Team Magma Grunt fight on the Southern Island
    // 698 + 901: Magma Admin Courtney and Team Magma Grunt fight at the Mossdeep Space Center
    setMultiBattleStatus(trs, 683, 687, 688, 691, 694, 698, 900, 901, 902, 903, 904, 905);
}

function setMultiBattleStatus(allTrainers: any[], ...numbers: number[]): void {
    for (const num of numbers) {
    if (allTrainers.length > (num - 1)) {
    allTrainers[num - 1].multiBattleStatus = "ALWAYS";
    }
    }
}

//     private static Map<Integer, String> constructFallingEncounterNameMap() {
//         Map<Integer, String> map = new Map();
//         map.set(0, "Glittering Cave Ceiling Encounter");
//         map.set(4, "Reflection Cave Ceiling Encounter");
//         map.set(20, "Victory Road Outside 2 Sky Encounter");
//         map.set(24, "Victory Road Inside 2 Encounter");
//         map.set(28, "Victory Road Outside 3 Sky Encounter");
//         map.set(32, "Victory Road Inside 3 Ceiling Encounter");
//         map.set(36, "Victory Road Outside 4 Sky Encounter");
//         map.set(46, "Terminus Cave Ceiling Encounter");
//         return map;
//     }

//     private static Map<Integer, String> constructRustlingBushEncounterNameMap() {
//         Map<Integer, String> map = new Map();
//         map.set(0, "Route 6 Rustling Bush Encounter");
//         map.set(3, "Route 18 Rustling Bush Encounter");
//         return map;
//     }

// TODO: const balancedItemPrices = Stream.of(new Integer[][] { // Skip item index 0. All prices divided by 10 {Items.masterBall, 300}, {Items.ultraBall, 120}, {Items.greatBall, 60}, {Items.pokeBall, 20}, {Items.safariBall, 50}, {Items.netBall, 100}, {Items.diveBall, 100}, {Items.nestBall, 100}, {Items.repeatBall, 100}, {Items.timerBall, 100}, {Items.luxuryBall, 100}, {Items.premierBall, 20}, {Items.duskBall, 100}, {Items.healBall, 30}, {Items.quickBall, 100}, {Items.cherishBall, 20}, {Items.potion, 30}, {Items.antidote, 10}, {Items.burnHeal, 25}, {Items.iceHeal, 25}, {Items.awakening, 25}, {Items.paralyzeHeal, 20}, {Items.fullRestore, 300}, {Items.maxPotion, 250}, {Items.hyperPotion, 120}, {Items.superPotion, 70}, {Items.fullHeal, 60}, {Items.revive, 150}, {Items.maxRevive, 400}, {Items.freshWater, 40}, {Items.sodaPop, 60}, {Items.lemonade, 70}, {Items.moomooMilk, 80}, {Items.energyPowder, 40}, {Items.energyRoot, 110}, {Items.healPowder, 45}, {Items.revivalHerb, 280}, {Items.ether, 300}, {Items.maxEther, 450}, {Items.elixir, 1500}, {Items.maxElixir, 1800}, {Items.lavaCookie, 45}, {Items.berryJuice, 10}, {Items.sacredAsh, 1000}, {Items.hpUp, 980}, {Items.protein, 980}, {Items.iron, 980}, {Items.carbos, 980}, {Items.calcium, 980}, {Items.rareCandy, 1000}, {Items.ppUp, 980}, {Items.zinc, 980}, {Items.ppMax, 2490}, {Items.oldGateau, 45}, {Items.guardSpec, 70}, {Items.direHit, 65}, {Items.xAttack, 50}, {Items.xDefense, 55}, {Items.xSpeed, 35}, {Items.xAccuracy, 95}, {Items.xSpAtk, 35}, {Items.xSpDef, 35}, {Items.pokeDoll, 100}, {Items.fluffyTail, 100}, {Items.blueFlute, 2}, {Items.yellowFlute, 2}, {Items.redFlute, 2}, {Items.blackFlute, 2}, {Items.whiteFlute, 2}, {Items.shoalSalt, 2}, {Items.shoalShell, 2}, {Items.redShard, 40}, {Items.blueShard, 40}, {Items.yellowShard, 40}, {Items.greenShard, 40}, {Items.superRepel, 50}, {Items.maxRepel, 70}, {Items.escapeRope, 55}, {Items.repel, 35}, {Items.sunStone, 300}, {Items.moonStone, 300}, {Items.fireStone, 300}, {Items.thunderStone, 300}, {Items.waterStone, 300}, {Items.leafStone, 300}, {Items.tinyMushroom, 50}, {Items.bigMushroom, 500}, {Items.pearl, 140}, {Items.bigPearl, 750}, {Items.stardust, 200}, {Items.starPiece, 980}, {Items.nugget, 1000}, {Items.heartScale, 500}, {Items.honey, 50}, {Items.growthMulch, 20}, {Items.dampMulch, 20}, {Items.stableMulch, 20}, {Items.gooeyMulch, 20}, {Items.rootFossil, 500}, {Items.clawFossil, 500}, {Items.helixFossil, 500}, {Items.domeFossil, 500}, {Items.oldAmber, 800}, {Items.armorFossil, 500}, {Items.skullFossil, 500}, {Items.rareBone, 1000}, {Items.shinyStone, 300}, {Items.duskStone, 300}, {Items.dawnStone, 300}, {Items.ovalStone, 300}, {Items.oddKeystone, 210}, {Items.griseousOrb, 1000}, {Items.tea, 0}, // unused in Gen 6 {Items.unused114, 0}, {Items.autograph, 0}, {Items.douseDrive, 100}, {Items.shockDrive, 100}, {Items.burnDrive, 100}, {Items.chillDrive, 100}, {Items.unused120, 0}, {Items.pokemonBox, 0}, // unused in Gen 6 {Items.medicinePocket, 0}, // unused in Gen 6 {Items.tmCase, 0}, // unused in Gen 6 {Items.candyJar, 0}, // unused in Gen 6 {Items.powerUpPocket, 0}, // unused in Gen 6 {Items.clothingTrunk, 0}, // unused in Gen 6 {Items.catchingPocket, 0}, // unused in Gen 6 {Items.battlePocket, 0}, // unused in Gen 6 {Items.unused129, 0}, {Items.unused130, 0}, {Items.unused131, 0}, {Items.unused132, 0}, {Items.unused133, 0}, {Items.sweetHeart, 15}, {Items.adamantOrb, 1000}, {Items.lustrousOrb, 1000}, {Items.mail1, 5}, {Items.mail2, 5}, {Items.mail3, 5}, {Items.mail4, 5}, {Items.mail5, 5}, {Items.mail6, 5}, {Items.mail7, 5}, {Items.mail8, 5}, {Items.mail9, 5}, {Items.mail10, 5}, {Items.mail11, 5}, {Items.mail12, 5}, {Items.cheriBerry, 20}, {Items.chestoBerry, 25}, {Items.pechaBerry, 10}, {Items.rawstBerry, 25}, {Items.aspearBerry, 25}, {Items.leppaBerry, 300}, {Items.oranBerry, 5}, {Items.persimBerry, 20}, {Items.lumBerry, 50}, {Items.sitrusBerry, 50}, {Items.figyBerry, 10}, {Items.wikiBerry, 10}, {Items.magoBerry, 10}, {Items.aguavBerry, 10}, {Items.iapapaBerry, 10}, {Items.razzBerry, 50}, {Items.blukBerry, 50}, {Items.nanabBerry, 50}, {Items.wepearBerry, 50}, {Items.pinapBerry, 50}, {Items.pomegBerry, 50}, {Items.kelpsyBerry, 50}, {Items.qualotBerry, 50}, {Items.hondewBerry, 50}, {Items.grepaBerry, 50}, {Items.tamatoBerry, 50}, {Items.cornnBerry, 50}, {Items.magostBerry, 50}, {Items.rabutaBerry, 50}, {Items.nomelBerry, 50}, {Items.spelonBerry, 50}, {Items.pamtreBerry, 50}, {Items.watmelBerry, 50}, {Items.durinBerry, 50}, {Items.belueBerry, 50}, {Items.occaBerry, 100}, {Items.passhoBerry, 100}, {Items.wacanBerry, 100}, {Items.rindoBerry, 100}, {Items.yacheBerry, 100}, {Items.chopleBerry, 100}, {Items.kebiaBerry, 100}, {Items.shucaBerry, 100}, {Items.cobaBerry, 100}, {Items.payapaBerry, 100}, {Items.tangaBerry, 100}, {Items.chartiBerry, 100}, {Items.kasibBerry, 100}, {Items.habanBerry, 100}, {Items.colburBerry, 100}, {Items.babiriBerry, 100}, {Items.chilanBerry, 100}, {Items.liechiBerry, 100}, {Items.ganlonBerry, 100}, {Items.salacBerry, 100}, {Items.petayaBerry, 100}, {Items.apicotBerry, 100}, {Items.lansatBerry, 100}, {Items.starfBerry, 100}, {Items.enigmaBerry, 100}, {Items.micleBerry, 100}, {Items.custapBerry, 100}, {Items.jabocaBerry, 100}, {Items.rowapBerry, 100}, {Items.brightPowder, 300}, {Items.whiteHerb, 100}, {Items.machoBrace, 300}, {Items.expShare, 0}, {Items.quickClaw, 450}, {Items.sootheBell, 100}, {Items.mentalHerb, 100}, {Items.choiceBand, 1000}, {Items.kingsRock, 500}, {Items.silverPowder, 200}, {Items.amuletCoin, 1500}, {Items.cleanseTag, 100}, {Items.soulDew, 20}, {Items.deepSeaTooth, 300}, {Items.deepSeaScale, 300}, {Items.smokeBall, 20}, {Items.everstone, 20}, {Items.focusBand, 300}, {Items.luckyEgg, 1000}, {Items.scopeLens, 500}, {Items.metalCoat, 300}, {Items.leftovers, 1000}, {Items.dragonScale, 300}, {Items.lightBall, 10}, {Items.softSand, 200}, {Items.hardStone, 200}, {Items.miracleSeed, 200}, {Items.blackGlasses, 200}, {Items.blackBelt, 200}, {Items.magnet, 200}, {Items.mysticWater, 200}, {Items.sharpBeak, 200}, {Items.poisonBarb, 200}, {Items.neverMeltIce, 200}, {Items.spellTag, 200}, {Items.twistedSpoon, 200}, {Items.charcoal, 200}, {Items.dragonFang, 200}, {Items.silkScarf, 200}, {Items.upgrade, 300}, {Items.shellBell, 600}, {Items.seaIncense, 200}, {Items.laxIncense, 300}, {Items.luckyPunch, 1}, {Items.metalPowder, 1}, {Items.thickClub, 50}, {Items.leek, 20}, {Items.redScarf, 10}, {Items.blueScarf, 10}, {Items.pinkScarf, 10}, {Items.greenScarf, 10}, {Items.yellowScarf, 10}, {Items.wideLens, 150}, {Items.muscleBand, 200}, {Items.wiseGlasses, 200}, {Items.expertBelt, 600}, {Items.lightClay, 150}, {Items.lifeOrb, 1000}, {Items.powerHerb, 100}, {Items.toxicOrb, 150}, {Items.flameOrb, 150}, {Items.quickPowder, 1}, {Items.focusSash, 200}, {Items.zoomLens, 150}, {Items.metronome, 300}, {Items.ironBall, 100}, {Items.laggingTail, 100}, {Items.destinyKnot, 150}, {Items.blackSludge, 500}, {Items.icyRock, 20}, {Items.smoothRock, 20}, {Items.heatRock, 20}, {Items.dampRock, 20}, {Items.gripClaw, 150}, {Items.choiceScarf, 1000}, {Items.stickyBarb, 150}, {Items.powerBracer, 300}, {Items.powerBelt, 300}, {Items.powerLens, 300}, {Items.powerBand, 300}, {Items.powerAnklet, 300}, {Items.powerWeight, 300}, {Items.shedShell, 50}, {Items.bigRoot, 150}, {Items.choiceSpecs, 1000}, {Items.flamePlate, 200}, {Items.splashPlate, 200}, {Items.zapPlate, 200}, {Items.meadowPlate, 200}, {Items.iciclePlate, 200}, {Items.fistPlate, 200}, {Items.toxicPlate, 200}, {Items.earthPlate, 200}, {Items.skyPlate, 200}, {Items.mindPlate, 200}, {Items.insectPlate, 200}, {Items.stonePlate, 200}, {Items.spookyPlate, 200}, {Items.dracoPlate, 200}, {Items.dreadPlate, 200}, {Items.ironPlate, 200}, {Items.oddIncense, 200}, {Items.rockIncense, 200}, {Items.fullIncense, 100}, {Items.waveIncense, 200}, {Items.roseIncense, 200}, {Items.luckIncense, 1500}, {Items.pureIncense, 100}, {Items.protector, 300}, {Items.electirizer, 300}, {Items.magmarizer, 300}, {Items.dubiousDisc, 300}, {Items.reaperCloth, 300}, {Items.razorClaw, 500}, {Items.razorFang, 500}, {Items.tm01, 1000}, {Items.tm02, 1000}, {Items.tm03, 1000}, {Items.tm04, 1000}, {Items.tm05, 1000}, {Items.tm06, 1000}, {Items.tm07, 2000}, {Items.tm08, 1000}, {Items.tm09, 1000}, {Items.tm10, 1000}, {Items.tm11, 2000}, {Items.tm12, 1000}, {Items.tm13, 1000}, {Items.tm14, 2000}, {Items.tm15, 2000}, {Items.tm16, 2000}, {Items.tm17, 1000}, {Items.tm18, 2000}, {Items.tm19, 1000}, {Items.tm20, 2000}, {Items.tm21, 1000}, {Items.tm22, 1000}, {Items.tm23, 1000}, {Items.tm24, 1000}, {Items.tm25, 2000}, {Items.tm26, 1000}, {Items.tm27, 1000}, {Items.tm28, 1000}, {Items.tm29, 1000}, {Items.tm30, 1000}, {Items.tm31, 1000}, {Items.tm32, 1000}, {Items.tm33, 2000}, {Items.tm34, 1000}, {Items.tm35, 1000}, {Items.tm36, 1000}, {Items.tm37, 2000}, {Items.tm38, 2000}, {Items.tm39, 1000}, {Items.tm40, 1000}, {Items.tm41, 1000}, {Items.tm42, 1000}, {Items.tm43, 1000}, {Items.tm44, 1000}, {Items.tm45, 1000}, {Items.tm46, 1000}, {Items.tm47, 1000}, {Items.tm48, 1000}, {Items.tm49, 1000}, {Items.tm50, 1000}, {Items.tm51, 1000}, {Items.tm52, 1000}, {Items.tm53, 1000}, {Items.tm54, 1000}, {Items.tm55, 1000}, {Items.tm56, 1000}, {Items.tm57, 1000}, {Items.tm58, 1000}, {Items.tm59, 1000}, {Items.tm60, 1000}, {Items.tm61, 1000}, {Items.tm62, 1000}, {Items.tm63, 1000}, {Items.tm64, 1000}, {Items.tm65, 1000}, {Items.tm66, 1000}, {Items.tm67, 1000}, {Items.tm68, 2000}, {Items.tm69, 1000}, {Items.tm70, 1000}, {Items.tm71, 1000}, {Items.tm72, 1000}, {Items.tm73, 1000}, {Items.tm74, 1000}, {Items.tm75, 1000}, {Items.tm76, 1000}, {Items.tm77, 1000}, {Items.tm78, 1000}, {Items.tm79, 1000}, {Items.tm80, 1000}, {Items.tm81, 1000}, {Items.tm82, 1000}, {Items.tm83, 1000}, {Items.tm84, 1000}, {Items.tm85, 1000}, {Items.tm86, 1000}, {Items.tm87, 1000}, {Items.tm88, 1000}, {Items.tm89, 1000}, {Items.tm90, 1000}, {Items.tm91, 1000}, {Items.tm92, 1000}, {Items.hm01, 0}, {Items.hm02, 0}, {Items.hm03, 0}, {Items.hm04, 0}, {Items.hm05, 0}, {Items.hm06, 0}, {Items.hm07, 0}, // unused in Gen 6 {Items.hm08, 0}, // unused in Gen 6 {Items.explorerKit, 0}, {Items.lootSack, 0}, {Items.ruleBook, 0}, {Items.pokeRadar, 0}, {Items.pointCard, 0}, {Items.journal, 0}, {Items.sealCase, 0}, {Items.fashionCase, 0}, {Items.sealBag, 0}, {Items.palPad, 0}, {Items.worksKey, 0}, {Items.oldCharm, 0}, {Items.galacticKey, 0}, {Items.redChain, 0}, {Items.townMap, 0}, {Items.vsSeeker, 0}, {Items.coinCase, 0}, {Items.oldRod, 0}, {Items.goodRod, 0}, {Items.superRod, 0}, {Items.sprayduck, 0}, {Items.poffinCase, 0}, {Items.bike, 0}, {Items.suiteKey, 0}, {Items.oaksLetter, 0}, {Items.lunarWing, 0}, {Items.memberCard, 0}, {Items.azureFlute, 0}, {Items.ssTicketJohto, 0}, {Items.contestPass, 0}, {Items.magmaStone, 0}, {Items.parcelSinnoh, 0}, {Items.coupon1, 0}, {Items.coupon2, 0}, {Items.coupon3, 0}, {Items.storageKeySinnoh, 0}, {Items.secretPotion, 0}, {Items.vsRecorder, 0}, {Items.gracidea, 0}, {Items.secretKeySinnoh, 0}, {Items.apricornBox, 0}, {Items.unownReport, 0}, {Items.berryPots, 0}, {Items.dowsingMachine, 0}, {Items.blueCard, 0}, {Items.slowpokeTail, 0}, {Items.clearBell, 0}, {Items.cardKeyJohto, 0}, {Items.basementKeyJohto, 0}, {Items.squirtBottle, 0}, {Items.redScale, 0}, {Items.lostItem, 0}, {Items.pass, 0}, {Items.machinePart, 0}, {Items.silverWing, 0}, {Items.rainbowWing, 0}, {Items.mysteryEgg, 0}, {Items.redApricorn, 2}, {Items.blueApricorn, 2}, {Items.yellowApricorn, 2}, {Items.greenApricorn, 2}, {Items.pinkApricorn, 2}, {Items.whiteApricorn, 2}, {Items.blackApricorn, 2}, {Items.fastBall, 30}, {Items.levelBall, 30}, {Items.lureBall, 30}, {Items.heavyBall, 30}, {Items.loveBall, 30}, {Items.friendBall, 30}, {Items.moonBall, 30}, {Items.sportBall, 30}, {Items.parkBall, 0}, {Items.photoAlbum, 0}, {Items.gbSounds, 0}, {Items.tidalBell, 0}, {Items.rageCandyBar, 15}, {Items.dataCard01, 0}, {Items.dataCard02, 0}, {Items.dataCard03, 0}, {Items.dataCard04, 0}, {Items.dataCard05, 0}, {Items.dataCard06, 0}, {Items.dataCard07, 0}, {Items.dataCard08, 0}, {Items.dataCard09, 0}, {Items.dataCard10, 0}, {Items.dataCard11, 0}, {Items.dataCard12, 0}, {Items.dataCard13, 0}, {Items.dataCard14, 0}, {Items.dataCard15, 0}, {Items.dataCard16, 0}, {Items.dataCard17, 0}, {Items.dataCard18, 0}, {Items.dataCard19, 0}, {Items.dataCard20, 0}, {Items.dataCard21, 0}, {Items.dataCard22, 0}, {Items.dataCard23, 0}, {Items.dataCard24, 0}, {Items.dataCard25, 0}, {Items.dataCard26, 0}, {Items.dataCard27, 0}, {Items.jadeOrb, 0}, {Items.lockCapsule, 0}, {Items.redOrb, 0}, {Items.blueOrb, 0}, {Items.enigmaStone, 0}, {Items.prismScale, 300}, {Items.eviolite, 1000}, {Items.floatStone, 100}, {Items.rockyHelmet, 600}, {Items.airBalloon, 100}, {Items.redCard, 100}, {Items.ringTarget, 100}, {Items.bindingBand, 200}, {Items.absorbBulb, 100}, {Items.cellBattery, 100}, {Items.ejectButton, 100}, {Items.fireGem, 100}, {Items.waterGem, 100}, {Items.electricGem, 100}, {Items.grassGem, 100}, {Items.iceGem, 100}, {Items.fightingGem, 100}, {Items.poisonGem, 100}, {Items.groundGem, 100}, {Items.flyingGem, 100}, {Items.psychicGem, 100}, {Items.bugGem, 100}, {Items.rockGem, 100}, {Items.ghostGem, 100}, {Items.dragonGem, 100}, {Items.darkGem, 100}, {Items.steelGem, 100}, {Items.normalGem, 100}, {Items.healthFeather, 300}, {Items.muscleFeather, 300}, {Items.resistFeather, 300}, {Items.geniusFeather, 300}, {Items.cleverFeather, 300}, {Items.swiftFeather, 300}, {Items.prettyFeather, 20}, {Items.coverFossil, 500}, {Items.plumeFossil, 500}, {Items.libertyPass, 0}, {Items.passOrb, 20}, {Items.dreamBall, 100}, {Items.pokeToy, 100}, {Items.propCase, 0}, {Items.dragonSkull, 0}, {Items.balmMushroom, 1250}, {Items.bigNugget, 2000}, {Items.pearlString, 1500}, {Items.cometShard, 3000}, {Items.relicCopper, 0}, {Items.relicSilver, 0}, {Items.relicGold, 0}, {Items.relicVase, 0}, {Items.relicBand, 0}, {Items.relicStatue, 0}, {Items.relicCrown, 0}, {Items.casteliacone, 45}, {Items.direHit2, 0}, {Items.xSpeed2, 0}, {Items.xSpAtk2, 0}, {Items.xSpDef2, 0}, {Items.xDefense2, 0}, {Items.xAttack2, 0}, {Items.xAccuracy2, 0}, {Items.xSpeed3, 0}, {Items.xSpAtk3, 0}, {Items.xSpDef3, 0}, {Items.xDefense3, 0}, {Items.xAttack3, 0}, {Items.xAccuracy3, 0}, {Items.xSpeed6, 0}, {Items.xSpAtk6, 0}, {Items.xSpDef6, 0}, {Items.xDefense6, 0}, {Items.xAttack6, 0}, {Items.xAccuracy6, 0}, {Items.abilityUrge, 0}, {Items.itemDrop, 0}, {Items.itemUrge, 0}, {Items.resetUrge, 0}, {Items.direHit3, 0}, {Items.lightStone, 0}, {Items.darkStone, 0}, {Items.tm93, 1000}, {Items.tm94, 1000}, {Items.tm95, 1000}, {Items.xtransceiverMale, 0}, {Items.unused622, 0}, {Items.gram1, 0}, {Items.gram2, 0}, {Items.gram3, 0}, {Items.xtransceiverFemale, 0}, {Items.medalBox, 0}, {Items.dNASplicersFuse, 0}, {Items.dNASplicersSeparate, 0}, {Items.permit, 0}, {Items.ovalCharm, 0}, {Items.shinyCharm, 0}, {Items.plasmaCard, 0}, {Items.grubbyHanky, 0}, {Items.colressMachine, 0}, {Items.droppedItemCurtis, 0}, {Items.droppedItemYancy, 0}, {Items.revealGlass, 0}, {Items.weaknessPolicy, 200}, {Items.assaultVest, 600}, {Items.holoCasterMale, 0}, {Items.profsLetter, 0}, {Items.rollerSkates, 0}, {Items.pixiePlate, 200}, {Items.abilityCapsule, 500}, {Items.whippedDream, 300}, {Items.sachet, 300}, {Items.luminousMoss, 20}, {Items.snowball, 20}, {Items.safetyGoggles, 300}, {Items.pokeFlute, 0}, {Items.richMulch, 20}, {Items.surpriseMulch, 20}, {Items.boostMulch, 20}, {Items.amazeMulch, 20}, {Items.gengarite, 1000}, {Items.gardevoirite, 1000}, {Items.ampharosite, 1000}, {Items.venusaurite, 1000}, {Items.charizarditeX, 1000}, {Items.blastoisinite, 1000}, {Items.mewtwoniteX, 2000}, {Items.mewtwoniteY, 2000}, {Items.blazikenite, 1000}, {Items.medichamite, 500}, {Items.houndoominite, 1000}, {Items.aggronite, 1000}, {Items.banettite, 500}, {Items.tyranitarite, 2000}, {Items.scizorite, 1000}, {Items.pinsirite, 1000}, {Items.aerodactylite, 1000}, {Items.lucarionite, 1000}, {Items.abomasite, 500}, {Items.kangaskhanite, 500}, {Items.gyaradosite, 1000}, {Items.absolite, 500}, {Items.charizarditeY, 1000}, {Items.alakazite, 1000}, {Items.heracronite, 1000}, {Items.mawilite, 300}, {Items.manectite, 500}, {Items.garchompite, 2000}, {Items.latiasite, 2000}, {Items.latiosite, 2000}, {Items.roseliBerry, 100}, {Items.keeBerry, 100}, {Items.marangaBerry, 100}, {Items.sprinklotad, 0}, {Items.tm96, 1000}, {Items.tm97, 1000}, {Items.tm98, 1000}, {Items.tm99, 1000}, {Items.tm100, 500}, {Items.powerPlantPass, 0}, {Items.megaRing, 0}, {Items.intriguingStone, 0}, {Items.commonStone, 0}, {Items.discountCoupon, 2}, {Items.elevatorKey, 0}, {Items.tmvPass, 0}, {Items.honorofKalos, 0}, {Items.adventureGuide, 0}, {Items.strangeSouvenir, 1}, {Items.lensCase, 0}, {Items.makeupBag, 0}, {Items.travelTrunk, 0}, {Items.lumioseGalette, 45}, {Items.shalourSable, 45}, {Items.jawFossil, 500}, {Items.sailFossil, 500}, {Items.lookerTicket, 0}, {Items.bikeYellow, 0}, {Items.holoCasterFemale, 0}, {Items.fairyGem, 100}, {Items.megaCharm, 0}, {Items.megaGlove, 0}, {Items.machBike, 0}, {Items.acroBike, 0}, {Items.wailmerPail, 0}, {Items.devonParts, 0}, {Items.sootSack, 0}, {Items.basementKeyHoenn, 0}, {Items.pokeblockKit, 0}, {Items.letter, 0}, {Items.eonTicket, 0}, {Items.scanner, 0}, {Items.goGoggles, 0}, {Items.meteoriteFirstForm, 0}, {Items.keytoRoom1, 0}, {Items.keytoRoom2, 0}, {Items.keytoRoom4, 0}, {Items.keytoRoom6, 0}, {Items.storageKeyHoenn, 0}, {Items.devonScope, 0}, {Items.ssTicketHoenn, 0}, {Items.hm07ORAS, 0}, {Items.devonScubaGear, 0}, {Items.contestCostumeMale, 0}, {Items.contestCostumeFemale, 0}, {Items.magmaSuit, 0}, {Items.aquaSuit, 0}, {Items.pairOfTickets, 0}, {Items.megaBracelet, 0}, {Items.megaPendant, 0}, {Items.megaGlasses, 0}, {Items.megaAnchor, 0}, {Items.megaStickpin, 0}, {Items.megaTiara, 0}, {Items.megaAnklet, 0}, {Items.meteoriteSecondForm, 0}, {Items.swampertite, 1000}, {Items.sceptilite, 1000}, {Items.sablenite, 300}, {Items.altarianite, 500}, {Items.galladite, 1000}, {Items.audinite, 500}, {Items.metagrossite, 2000}, {Items.sharpedonite, 500}, {Items.slowbronite, 500}, {Items.steelixite, 1000}, {Items.pidgeotite, 500}, {Items.glalitite, 500}, {Items.diancite, 2000}, {Items.prisonBottle, 0}, {Items.megaCuff, 0}, {Items.cameruptite, 500}, {Items.lopunnite, 500}, {Items.salamencite, 2000}, {Items.beedrillite, 300}, {Items.meteoriteThirdForm, 0}, {Items.meteoriteFinalForm, 0}, {Items.keyStone, 0}, {Items.meteoriteShard, 0}, {Items.eonFlute, 0}, }).collect(Collectors.toMap(kv -> kv[0], kv -> kv[1]));

export const xyMapNumToPokedexIndex: number[] = [
    7,  // Couriway Town
    8,  // Ambrette Town
    13, // Cyllage City
    14, // Shalour City
    16, // Laverre City
    22, // Route 2
    23, // Route 3
    24, // Route 4
    25, // Route 5
    26, // Route 6
    27, // Route 7
    28, // Route 8
    29, // Route 9
    30, // Route 10
    31, // Route 11
    32, // Route 12
    33, // Route 13
    34, // Route 14
    35, // Route 15
    36, // Route 16
    37, // Route 17
    38, // Route 18
    39, // Route 19
    40, // Route 20
    41, // Route 21
    42, // Route 22
    44, // Santalune Forest
    45, // Parfum Palace
    46, 46, // Glittering Cave
    47, 47, 47, 47, // Reflection Cave
    49, 49, 49, 49, 49, // Frost Cavern
    50, // Pokemon Village
    51, 51, 51, 51, 51, // Victory Road
    52, // Connecting Cave
    54, 54, 54, 54, 54, // Terminus Cave
    55, // Lost Hotel
    43, // Azure Bay
    46, 46, 46, 46, // Glittering Cave (ceiling)
    47, 47, 47, 47, 47, 47, 47, 47, 47, 47, 47, 47, 47, 47, 47, 47, // Reflection Cave (ceiling)
    51, 51, 51, 51, 51, 51, 51, 51, 51, 51, 51, 51, 51, 51, 51, 51, 51, 51, 51, 51, 51, 51, 51, 51, 51, 51, // Victory Road (ceiling and sky)
    54, 54, 54, 54, 54, 54, 54, 54, 54, // Terminus Cave (ceiling)
    26, 26, 26, // Route 6 (rustling bush)
    38, 38, 38, 38, // Route 18 (rustling bush)
];

export const orasMapNumToPokedexIndex: number[] = [
    2,  // Dewford Town
    6,  // Pacifidlog Town
    7,  // Petalburg City
    8,  // Slateport City
    12, // Lilycove City
    13, // Mossdeep City
    14, // Sootopolis City
    15, // Ever Grande City
    17, // Route 101
    18, // Route 102
    19, // Route 103
    20, // Route 104 (North Section)
    21, // Route 104 (South Section)
    22, // Route 105
    23, // Route 106
    24, // Route 107
    26, // Route 108
    27, // Route 109
    28, // Route 110
    30, // Route 111 (Desert)
    32, // Route 111 (South Section)
    33, // Route 112 (North Section)
    34, // Route 112 (South Section)
    35, // Route 113
    36, // Route 114
    37, // Route 115
    38, // Route 116
    39, // Route 117
    40, // Route 118
    41, 41, // Route 119
    43, 43, // Route 120
    45, // Route 121
    46, // Route 122
    47, // Route 123
    48, // Route 124
    50, // Route 125
    51, // Route 126
    53, // Route 127
    55, // Route 128
    57, // Route 129
    59, // Route 130
    61, // Route 131
    62, // Route 132
    63, // Route 133
    64, // Route 134
    25, // Route 107 (Underwater)
    49, // Route 124 (Underwater)
    52, // Route 126 (Underwater)
    56, // Route 128 (Underwater)
    58, // Route 129 (Underwater)
    60, // Route 130 (Underwater)
    69, 69, 69, 69, // Meteor Falls
    73, // Rusturf Tunnel
    74, 74, 74, // Granite Cave
    78, // Petalburg Woods
    80, // Jagged Pass
    81, // Fiery Path
    82, 82, 82, 82, 82, 82, // Mt. Pyre
    -1, // Team Aqua Hideout
    88, 88, 88, 88, 88, 88, 88, 88, 88, 88, 88, // Seafloor Cavern
    102, 102, 102, 102, 102, // Cave of Origin
    114, 114, 114, 114, // Victory Road
    119, 119, 119, 119, 119, 119, 119, // Shoal Cave
    130, // New Mauville
    136, 136, 136, 136, // Sea Mauville
    -1, // Sealed Chamber
    -1, -1, -1, -1, // Scorched Slab
    -1, // Team Magma Hideout
    150, // Sky Pillar
    -1, -1, -1, -1, -1, -1, -1, -1, // Mirage Forest
    -1, -1, -1, -1, -1, -1, -1, -1, // Mirage Island
    -1, // Mirage Mountain
    159, // Battle Resort
    65, 65, 65, 65, // Safari Zone
    102, // Cave of Origin
    -1, -1, -1, -1, -1, -1, -1, // Mirage Mountain
    -1, -1, -1, -1, -1, -1, -1, -1, // Mirage Cave
    -1, // Mt. Pyre (unused)
    -1, // Sootopolis City (unused)
];
