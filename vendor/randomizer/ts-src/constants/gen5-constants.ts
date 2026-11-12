import * as Abilities from './abilities';
import * as Gen4Constants from './gen4-constants';
import * as Items from './items';
import * as Moves from './moves';
import * as Species from './species';
import { ItemList } from '../pokemon/item-list';
import { MoveCategory } from '../pokemon/move-category';
import { MultiBattleStatus } from '../pokemon/trainer';

export const Type_BW = 0;
export const Type_BW2 = 1;

export const arm9Offset = 0x02004000;

export const pokemonCount = 649;
export const moveCount = 559;
export const bw1FormeCount = 18;
export const bw2FormeCount = 24;
export const bw1formeOffset = 0;
export const bw2formeOffset = 35;

export const bw1NonPokemonBattleSpriteCount = 3;
export const bw2NonPokemonBattleSpriteCount = 36;

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
export const bsGrowthCurveOffset = 21;
export const bsAbility1Offset = 24;
export const bsAbility2Offset = 25;
export const bsAbility3Offset = 26;
export const bsFormeOffset = 28;
export const bsFormeSpriteOffset = 30;
export const bsFormeCountOffset = 32;
export const bsTMHMCompatOffset = 40;
export const bsMTCompatOffset = 60;

// TODO: byte[] bw1NewStarterScript = { 0x24, 0x00, (byte) 0xA7, 0x02, (byte) 0xE7, 0x00, 0x00, 0x00, (byte) 0xDE, 0x00, 0x00, 0x00, (byte) 0xF8, 0x01, 0x05, 0x00 };

export const bw1StarterScriptMagic = "2400A702";

export const bw1StarterTextOffset = 18;
export const bw1CherenText1Offset = 26;
export const bw1CherenText2Offset = 53;

// TODO: byte[] bw2NewStarterScript = { 0x28, 0x00, (byte) 0xA1, 0x40, 0x04, 0x00, (byte) 0xDE, 0x00, 0x00, 0x00, (byte) 0xFD, 0x01, 0x05, 0x00 };

export const bw2StarterScriptMagic = "2800A1400400";

export const bw2StarterTextOffset = 37;
export const bw2RivalTextOffset = 60;

export const perSeasonEncounterDataLength = 232;
export const bw1AreaDataEntryLength = 249;
export const bw2AreaDataEntryLength = 345;
export const bw1EncounterAreaCount = 61;
export const bw2EncounterAreaCount = 85;

export const encountersOfEachType: number[] = [ 12, 12, 12, 5, 5, 5, 5 ];

export const encounterTypeNames: string[] = [ "Grass/Cave", "Doubles Grass", "Shaking Spots", "Surfing", "Surfing Spots", "Fishing", "Fishing Spots" ];

export const habitatClassificationOfEachType: number[] = [ 0, 0, 0, 1, 1, 2, 2 ];

export const bw2Route4AreaIndex = 40;
export const bw2VictoryRoadAreaIndex = 76;
export const bw2ReversalMountainAreaIndex = 73;

export const b2Route4EncounterFile = 104;
export const b2VRExclusiveRoom1 = 71;
export const b2VRExclusiveRoom2 = 73;
export const b2ReversalMountainStart = 49;
export const b2ReversalMountainEnd = 54;

export const w2Route4EncounterFile = 105;
export const w2VRExclusiveRoom1 = 78;
export const w2VRExclusiveRoom2 = 79;
export const w2ReversalMountainStart = 55;
export const w2ReversalMountainEnd = 60;

export const bw2HiddenHollowUnovaPokemon: number[] = [Species.watchog, Species.herdier, Species.liepard, Species.pansage, Species.pansear, Species.panpour, Species.pidove, Species.zebstrika, Species.boldore, Species.woobat, Species.drilbur, Species.audino, Species.gurdurr, Species.tympole, Species.throh, Species.sawk, Species.leavanny, Species.scolipede, Species.cottonee, Species.petilil, Species.basculin, Species.krookodile, Species.maractus, Species.crustle, Species.scraggy, Species.sigilyph, Species.tirtouga, Species.garbodor, Species.minccino, Species.gothorita, Species.duosion, Species.ducklett, Species.vanillish, Species.emolga, Species.karrablast, Species.alomomola, Species.galvantula, Species.klinklang, Species.elgyem, Species.litwick, Species.axew, Species.cubchoo, Species.shelmet, Species.stunfisk, Species.mienfoo, Species.druddigon, Species.golett, Species.pawniard, Species.bouffalant, Species.braviary, Species.mandibuzz, Species.heatmor, Species.durant];

export const tmDataPrefix = "87038803";

export const tmCount = 95;
export const hmCount = 6;
export const tmBlockOneCount = 92;
export const tmBlockOneOffset = Items.tm01;
export const tmBlockTwoOffset = Items.tm93;

export const bw1ItemPalettesPrefix = "E903EA03020003000400050006000700", bw2ItemPalettesPrefix = "FD03FE03020003000400050006000700";

export const bw2MoveTutorCount = 60;
export const bw2MoveTutorBytesPerEntry = 12;

export const evolutionMethodCount = 27;

export const highestAbilityIndex = Abilities.teravolt;

export const fossilPokemonFile = 877;
export const fossilPokemonLevelOffset = 0x3F7;

// TODO: const abilityVariations = setupAbilityVariations();

function setupAbilityVariations(): Map<number, number[]> {
    const map = new Map<number, number[]>();
    map.set(Abilities.insomnia, [Abilities.insomnia, Abilities.vitalSpirit]);
    map.set(Abilities.clearBody, [Abilities.clearBody, Abilities.whiteSmoke]);
    map.set(Abilities.hugePower, [Abilities.hugePower, Abilities.purePower]);
    map.set(Abilities.battleArmor, [Abilities.battleArmor, Abilities.shellArmor]);
    map.set(Abilities.cloudNine, [Abilities.cloudNine, Abilities.airLock]);
    map.set(Abilities.filter, [Abilities.filter, Abilities.solidRock]);
    map.set(Abilities.roughSkin, [Abilities.roughSkin, Abilities.ironBarbs]);
    map.set(Abilities.moldBreaker, [Abilities.moldBreaker, Abilities.turboblaze, Abilities.teravolt]);
    
    return map;
}

export const uselessAbilities: number[] = [Abilities.forecast, Abilities.multitype, Abilities.flowerGift, Abilities.zenMode];

export const normalItemSetVarCommand = 0x28;
export const hiddenItemSetVarCommand = 0x2A;
export const normalItemVarSet = 0x800C;
export const hiddenItemVarSet = 0x8000;

export const scriptListTerminator = 0xFD13;

export const mulchIndices: number[] = [Items.growthMulch, Items.dampMulch, Items.stableMulch, Items.gooeyMulch];

// TODO: MoveCategory[] moveCategoryIndices = { MoveCategory.STATUS, MoveCategory.PHYSICAL, MoveCategory.SPECIAL };

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

export const trappingEffect = 106;

export const noDamageStatusQuality = 1;
export const noDamageStatChangeQuality = 2;
export const damageStatusQuality = 4;
export const noDamageStatusAndStatChangeQuality = 5;
export const damageTargetDebuffQuality = 6;
export const damageUserBuffQuality = 7;
export const damageAbsorbQuality = 8;

export const typeTable: (string | null)[] = constructTypeTable();

const bw1FormeSuffixes = setupFormeSuffixes(Type_BW);

const bw2FormeSuffixes = setupFormeSuffixes(Type_BW2);

const formeSuffixesByBaseForme = setupFormeSuffixesByBaseForme();
const dummyFormeSuffixes = setupDummyFormeSuffixes();

const absolutePokeNumsByBaseForme = setupAbsolutePokeNumsByBaseForme();
const dummyAbsolutePokeNums = setupDummyAbsolutePokeNums();

export function getFormeSuffixByBaseForme(baseForme: number, formNum: number): string {
    const baseMap = formeSuffixesByBaseForme.get(baseForme) ?? dummyFormeSuffixes;
    return baseMap.get(formNum) ?? "";
}

export function getAbsolutePokeNumByBaseForme(baseForme: number, formNum: number): number {
    const baseMap = absolutePokeNumsByBaseForme.get(baseForme) ?? dummyAbsolutePokeNums;
    return baseMap.get(formNum) ?? baseForme;
}

export const bw1IrregularFormes: number[] = [ Species.Gen5Formes.castformF, Species.Gen5Formes.castformW, Species.Gen5Formes.castformI, Species.Gen5Formes.darmanitanZ, Species.Gen5Formes.meloettaP ];

export const bw2IrregularFormes: number[] = [ Species.Gen5Formes.castformF, Species.Gen5Formes.castformW, Species.Gen5Formes.castformI, Species.Gen5Formes.darmanitanZ, Species.Gen5Formes.meloettaP, Species.Gen5Formes.kyuremW, Species.Gen5Formes.kyuremB ];

export const emptyPlaythroughTrainers: number[] = [];

export const bw1MainPlaythroughTrainers: number[] = [ 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134, 135, 137, 138, 139, 140, 141, 142, 143, 144, 145, 150, 151, 152, 153, 154, 155, 156, 157, 158, 159, 160, 161, 162, 163, 164, 165, 166, 167, 168, 169, 170, 171, 172, 173, 174, 175, 176, 177, 178, 179, 180, 181, 182, 183, 184, 186, 187, 188, 190, 191, 192, 193, 194, 195, 196, 197, 198, 199, 200, 201, 202, 203, 204, 212, 213, 214, 215, 216, 217, 218, 220, 221, 222, 223, 224, 225, 226, 227, 228, 229, 230, 231, 232, 233, 234, 235, 236, 237, 238, 239, 240, 241, 242, 243, 244, 245, 246, 247, 248, 249, 250, 251, 252, 253, 254, 255, 256, 257, 258, 263, 264, 265, 266, 267, 268, 269, 270, 271, 272, 273, 274, 275, 276, 277, 278, 279, 280, 281, 282, 283, 284, 285, 286, 290, 291, 292, 293, 294, 295, 296, 297, 298, 299, 300, 301, 302, 303, 304, 305, 306, 307, 308, 309, 310, 311, 312, 313, 315, 316, 401, 402, 408, 409, 412, 413, 438, 439, 441, 442, 443, 445, 447, 450, 460, 461, 462, 465, 466, 468, 469, 470, 471, 472, 473, 474, 475, 476, 477, 478, 479, 480, 481, 484, 485, 488, 489, 490, 501, 502, 503, 504, 505, 506, 513, 514, 515, 516, 517, 518, 519, 520, 526, 531, 532, 533, 534, 535, 536, 537, 538, 544, 545, 546, 549, 550, 552, 553, 554, 555, 556, 557, 582, 583, 584, 585, 586, 587, 600, 601, 602, 603, 604, 605, 606, 607, 610, 611, 612, 613];

export const bw2MainPlaythroughTrainers: number[] = [ 4, 5, 6, 133, 134, 135, 136, 137, 138, 139, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156, 157, 158, 159, 160, 164, 165, 169, 170, 171, 172, 173, 174, 175, 176, 177, 178, 179, 180, 181, 182, 203, 204, 205, 206, 207, 208, 209, 210, 211, 212, 213, 214, 215, 216, 217, 218, 219, 220, 221, 222, 223, 224, 225, 226, 227, 228, 229, 230, 231, 232, 233, 234, 235, 237, 238, 239, 240, 242, 243, 244, 245, 247, 248, 249, 250, 252, 253, 254, 255, 256, 257, 258, 259, 260, 261, 262, 263, 264, 265, 266, 267, 268, 269, 270, 271, 272, 273, 274, 275, 276, 277, 278, 279, 280, 281, 282, 283, 284, 285, 286, 287, 288, 289, 290, 291, 292, 293, 294, 295, 296, 297, 298, 299, 300, 301, 302, 303, 304, 305, 306, 307, 308, 309, 310, 311, 312, 313, 314, 315, 316, 317, 318, 319, 320, 321, 322, 323, 324, 325, 326, 327, 328, 329, 330, 331, 332, 333, 334, 335, 336, 337, 338, 339, 340, 341, 342, 343, 344, 345, 346, 347, 348, 349, 350, 351, 352, 353, 354, 355, 356, 357, 358, 359, 360, 361, 362, 363, 364, 365, 366, 367, 372, 373, 374, 375, 376, 377, 381, 382, 383, 384, 385, 386, 387, 388, 389, 390, 391, 392, 426, 427, 428, 429, 430, 431, 432, 433, 434, 435, 436, 437, 438, 439, 440, 441, 442, 443, 444, 445, 446, 447, 448, 449, 450, 451, 452, 453, 454, 455, 461, 462, 463, 464, 465, 466, 467, 468, 469, 470, 471, 472, 473, 474, 475, 476, 477, 478, 479, 480, 481, 482, 483, 484, 485, 486, 497, 498, 499, 500, 501, 502, 503, 510, 511, 512, 513, 514, 515, 516, 517, 518, 519, 520, 521, 522, 523, 524, 537, 538, 539, 540, 541, 542, 543, 544, 545, 546, 547, 548, 549, 550, 551, 552, 553, 554, 555, 556, 557, 558, 559, 560, 561, 562, 563, 564, 565, 566, 567, 568, 569, 570, 580, 581, 583, 584, 585, 586, 587, 592, 593, 594, 595, 596, 597, 598, 599, 600, 601, 602, 603, 604, 605, 606, 607, 608, 609, 610, 611, 612, 613, 614, 615, 621, 622, 623, 624, 625, 626, 627, 628, 629, 630, 631, 657, 658, 659, 660, 661, 662, 663, 664, 665, 666, 667, 668, 669, 670, 671, 672, 673, 679, 680, 681, 682, 683, 690, 691, 692, 703, 704, 705, 712, 713, 714, 715, 716, 717, 718, 719, 720, 721, 722, 723, 724, 725, 726, 727, 728, 729, 730, 731, 732, 733, 734, 735, 736, 737, 738, 745, 746, 747, 748, 749, 750, 751, 752, 754, 755, 756, 763, 764, 765, 766, 767, 768, 769, 770, 771, 772, 773, 774, 775, 776, 786, 787, 788, 789, 797, 798, 799, 800, 801, 802, 803, 804, 805, 806, 807, 808, 809, 810, 811, 812];

export const bw2DriftveilTrainerOffsets: number[] = [56, 57, 0, 1, 2, 3, 4, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77];

export const normalTrainerNameLength = 813;
export const normalTrainerClassLength = 236;

//    public static final Map<Integer, String> bw1ShopIndex = new Map() {1:"Check"};

export const bw1MainGameShops: number[] = [ 3, 5, 6, 8, 9, 12, 14, 17, 18, 19, 21, 22 ];

export const bw1ShopNames: string[] = [ "Primary 0 Badges", "Shopping Mall 9 TMs", "Icirrus Secondary (TMs)", "Driftveil Herb Salesman", "Mistralton Secondary (TMs)", "Shopping Mall 9 F3 Left", "Accumula Secondary", "Nimbasa Secondary (TMs)", "Striaton Secondary", "League Secondary", "Lacunosa Secondary", "Black City/White Forest Secondary", "Nacrene/Shopping Mall 9 X Items", "Driftveil Incense Salesman", "Nacrene Secondary", "Undella Secondary", "Primary 2 Badges", "Castelia Secondary", "Driftveil Secondary", "Opelucid Secondary", "Primary 3 Badges", "Shopping Mall 9 F1", "Shopping Mall 9 F2", "Primary 5 Badges", "Primary 7 Badges", "Primary 8 Badges"];

export const bw2MainGameShops: number[] = [ 9, 11, 14, 15, 16, 18, 20, 21, 22, 23, 25, 26, 27, 28, 29, 30, 31 ];

export const bw2ShopNames: string[] = [ "Primary 0 Badges", "Primary 1 Badges", "Primary 3 Badges", "Primary 5 Badges", "Primary 7 Badges", "Primary 8 Badges", "Accumula Secondary", "Striaton Secondary (TMs)", "Nacrene Secondary", "Castelia Secondary", "Nimbasa Secondary (TMs)", "Driftveil Secondary", "Mistralton Secondary (TMs)", "Icirrus Secondary", "Opelucid Secondary", "Victory Road Secondary", "Pokemon League Secondary", "Lacunosa Secondary (TMs)", "Undella Secondary", "Black City/White Forest Secondary", "Nacrene/Shopping Mall 9 X Items", "Driftveil Herb Salesman", "Driftveil Incense Salesman", "Shopping Mall 9 F1", "Shopping Mall 9 TMs", "Shopping Mall 9 F2", "Shopping Mall 9 F3 Left", "Aspertia Secondary", "Virbank Secondary", "Humilau Secondary", "Floccesy Secondary", "Lentimas Secondary"];

export const evolutionItems: number[] = [Items.sunStone, Items.moonStone, Items.fireStone, Items.thunderStone, Items.waterStone, Items.leafStone, Items.shinyStone, Items.duskStone, Items.dawnStone, Items.ovalStone, Items.kingsRock, Items.deepSeaTooth, Items.deepSeaScale, Items.metalCoat, Items.dragonScale, Items.upgrade, Items.protector, Items.electirizer, Items.magmarizer, Items.dubiousDisc, Items.reaperCloth, Items.razorClaw, Items.razorFang, Items.prismScale];

export const bw1RequiredFieldTMs: number[] = [2, 3, 5, 6, 9, 12, 13, 19, 22, 24, 26, 29, 30, 35, 36, 39, 41, 46, 47, 50, 52, 53, 55, 58, 61, 63, 65, 66, 71, 80, 81, 84, 85, 86, 90, 91, 92, 93];

export const bw2RequiredFieldTMs: number[] = [1, 2, 3, 5, 6, 12, 13, 19, 22, 26, 28, 29, 30, 36, 39, 41, 46, 47, 50, 52, 53, 56, 58, 61, 63, 65, 66, 67, 69, 71, 80, 81, 84, 85, 86, 90, 91, 92, 93];

export const bw1EarlyRequiredHMMoves: number[] = [Moves.cut];

export const bw2EarlyRequiredHMMoves: number[] = [];

export const fieldMoves: number[] = [ Moves.cut, Moves.fly, Moves.surf, Moves.strength, Moves.flash, Moves.dig, Moves.teleport, Moves.waterfall, Moves.sweetScent, Moves.dive];

export const shedinjaSpeciesLocator = "24010000";

export const runningShoesPrefix = "01D0012008BD002008BD63";

export const introGraphicPrefix = "5A0000010000001700000001000000", bw1IntroCryPrefix = "0021009101910291", bw2IntroCryLocator = "3D020000F8B51C1C";

export const typeEffectivenessTableLocator = "0404040404020400";

export const forceChallengeModeLocator = "816A406B0B1C07490022434090000858834201D1";

export const pickupTableLocator = "19005C00DD00";
export const numberOfPickupItems = 29;

export const friendshipValueForEvoLocator = "DC282FD3";

export const perfectOddsBranchLocator = "08DB002801D0012000E0";

export const lowHealthMusicLocator = "00D10127";

export const consumableHeldItems: number[] = setupAllConsumableItems();

function setupAllConsumableItems(): number[] {
    const list: number[] = [...Gen4Constants.consumableHeldItems];
    list.push(Items.airBalloon, Items.redCard, Items.absorbBulb, Items.cellBattery,
    Items.ejectButton, Items.fireGem, Items.waterGem, Items.electricGem, Items.grassGem, Items.iceGem,
    Items.fightingGem, Items.poisonGem, Items.groundGem, Items.flyingGem, Items.psychicGem, Items.bugGem,
    Items.rockGem, Items.ghostGem, Items.dragonGem, Items.darkGem, Items.steelGem, Items.normalGem);
    return list;
}

export const allHeldItems: number[] = setupAllHeldItems();

function setupAllHeldItems(): number[] {
    const list: number[] = [...Gen4Constants.allHeldItems];
    list.push(Items.airBalloon, Items.redCard, Items.absorbBulb, Items.cellBattery,
    Items.ejectButton, Items.fireGem, Items.waterGem, Items.electricGem, Items.grassGem, Items.iceGem,
    Items.fightingGem, Items.poisonGem, Items.groundGem, Items.flyingGem, Items.psychicGem, Items.bugGem,
    Items.rockGem, Items.ghostGem, Items.dragonGem, Items.darkGem, Items.steelGem, Items.normalGem);
    list.push(Items.eviolite, Items.floatStone, Items.rockyHelmet, Items.ringTarget, Items.bindingBand);
    return list;
}

export const generalPurposeConsumableItems: number[] = initializeGeneralPurposeConsumableItems();

function initializeGeneralPurposeConsumableItems(): number[] {
    const list: number[] = [...Gen4Constants.generalPurposeConsumableItems];
    list.push(Items.redCard, Items.absorbBulb, Items.cellBattery, Items.ejectButton);
    return list;
}

export const generalPurposeItems: number[] = initializeGeneralPurposeItems();

function initializeGeneralPurposeItems(): number[] {
    const list: number[] = [...Gen4Constants.generalPurposeItems];
    list.push(Items.floatStone, Items.rockyHelmet);
    return list;
}

// TODO: const consumableTypeBoostingItems = initializeConsumableTypeBoostingItems();

//     private static Map<Type, Integer> initializeConsumableTypeBoostingItems() {
//         Map<Type, Integer> map = new Map();
//         map.set(Type.FIRE, Items.fireGem);
//         map.set(Type.WATER, Items.waterGem);
//         map.set(Type.ELECTRIC, Items.electricGem);
//         map.set(Type.GRASS, Items.grassGem);
//         map.set(Type.ICE, Items.iceGem);
//         map.set(Type.FIGHTING, Items.fightingGem);
//         map.set(Type.POISON, Items.poisonGem);
//         map.set(Type.GROUND, Items.groundGem);
//         map.set(Type.FLYING, Items.flyingGem);
//         map.set(Type.PSYCHIC, Items.psychicGem);
//         map.set(Type.BUG, Items.bugGem);
//         map.set(Type.ROCK, Items.rockGem);
//         map.set(Type.GHOST, Items.ghostGem);
//         map.set(Type.DRAGON, Items.dragonGem);
//         map.set(Type.DARK, Items.darkGem);
//         map.set(Type.STEEL, Items.steelGem);
//         map.set(Type.NORMAL, Items.normalGem);
//         return Collections.unmodifiableMap(map);
//     }

// TODO: const moveBoostingItems = initializeMoveBoostingItems();

//     private static Map<Integer, List<Integer>> initializeMoveBoostingItems() {
//         Map<Integer, List<Integer>> map = new HashMap<>(Gen4Constants.moveBoostingItems);
//         map.set(Moves.trick, Arrays.asList(Items.toxicOrb, Items.flameOrb, Items.ringTarget));
//         map.set(Moves.switcheroo, Arrays.asList(Items.toxicOrb, Items.flameOrb, Items.ringTarget));
// 
//         map.set(Moves.bind, Arrays.asList(Items.gripClaw, Items.bindingBand));
//         map.set(Moves.clamp, Arrays.asList(Items.gripClaw, Items.bindingBand));
//         map.set(Moves.fireSpin, Arrays.asList(Items.gripClaw, Items.bindingBand));
//         map.set(Moves.magmaStorm, Arrays.asList(Items.gripClaw, Items.bindingBand));
//         map.set(Moves.sandTomb, Arrays.asList(Items.gripClaw, Items.bindingBand));
//         map.set(Moves.whirlpool, Arrays.asList(Items.gripClaw, Items.bindingBand));
//         map.set(Moves.wrap, Arrays.asList(Items.gripClaw, Items.bindingBand));
// 
//         map.set(Moves.hornLeech, Arrays.asList(Items.bigRoot));
//         return Collections.unmodifiableMap(map);
//     }

// None of these have new entries in Gen V.
// TODO: const abilityBoostingItems = Gen4Constants.abilityBoostingItems;
// TODO: const speciesBoostingItems = Gen4Constants.speciesBoostingItems;
// TODO: const typeBoostingItems = Gen4Constants.typeBoostingItems;
// TODO: const weaknessReducingBerries = Gen4Constants.weaknessReducingBerries;

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
    return table;
}

export function typeToByte(type: string | null): number {
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
    default:
    return 0; // normal by default
    }
}

export function getAreaDataEntryLength(romType: number): number {
    if (romType == Type_BW) {
    return bw1AreaDataEntryLength;
    } else if (romType == Type_BW2) {
    return bw2AreaDataEntryLength;
    }
    return 0;
}

export function getEncounterAreaCount(romType: number): number {
    if (romType == Type_BW) {
    return bw1EncounterAreaCount;
    } else if (romType == Type_BW2) {
    return bw2EncounterAreaCount;
    }
    return 0;
}

export function getWildFileToAreaMap(romType: number): number[] {
    if (romType == Type_BW) {
    return bw1WildFileToAreaMap;
    } else if (romType == Type_BW2) {
    return bw2WildFileToAreaMap;
    }
    return new Array(0).fill(0);
}

export function getMainGameShops(romType: number): number[] {
    if (romType == Type_BW) {
    return bw1MainGameShops;
    } else if (romType == Type_BW2) {
    return bw2MainGameShops;
    }
    return [];
}

export function getIrregularFormes(romType: number): number[] {
    if (romType == Type_BW) {
    return bw1IrregularFormes;
    } else if (romType == Type_BW2) {
    return bw2IrregularFormes;
    }
    return [];
}

export function getFormeCount(romType: number): number {
    if (romType == Type_BW) {
    return bw1FormeCount;
    } else if (romType == Type_BW2) {
    return bw2FormeCount;
    }
    return 0;
}

export function getFormeOffset(romType: number): number {
    if (romType == Type_BW) {
    return bw1formeOffset;
    } else if (romType == Type_BW2) {
    return bw2formeOffset;
    }
    return 0;
}

export function getNonPokemonBattleSpriteCount(romType: number): number {
    if (romType == Type_BW) {
    return bw1NonPokemonBattleSpriteCount;
    } else if (romType == Type_BW2) {
    return bw2NonPokemonBattleSpriteCount;
    }
    return 0;
}

export function getFormeSuffix(internalIndex: number, romType: number): string {
    if (romType == Type_BW) {
    return bw1FormeSuffixes.get(internalIndex) ?? "";
    } else if (romType == Type_BW2) {
    return bw2FormeSuffixes.get(internalIndex) ?? "";
    } else {
    return "";
    }
}

function setupFormeSuffixes(gameVersion: number): Map<number, string> {
    const formeSuffixes = new Map();
    if (gameVersion == Type_BW) {
    formeSuffixes.set(Species.Gen5Formes.deoxysA,"-A");
    formeSuffixes.set(Species.Gen5Formes.deoxysD,"-D");
    formeSuffixes.set(Species.Gen5Formes.deoxysS,"-S");
    formeSuffixes.set(Species.Gen5Formes.wormadamS,"-S");
    formeSuffixes.set(Species.Gen5Formes.wormadamT,"-T");
    formeSuffixes.set(Species.Gen5Formes.shayminS,"-S");
    formeSuffixes.set(Species.Gen5Formes.giratinaO,"-O");
    formeSuffixes.set(Species.Gen5Formes.rotomH,"-H");
    formeSuffixes.set(Species.Gen5Formes.rotomW,"-W");
    formeSuffixes.set(Species.Gen5Formes.rotomFr,"-Fr");
    formeSuffixes.set(Species.Gen5Formes.rotomFa,"-Fa");
    formeSuffixes.set(Species.Gen5Formes.rotomM,"-M");
    formeSuffixes.set(Species.Gen5Formes.castformF,"-F");
    formeSuffixes.set(Species.Gen5Formes.castformW,"-W");
    formeSuffixes.set(Species.Gen5Formes.castformI,"-I");
    formeSuffixes.set(Species.Gen5Formes.basculinB,"-B");
    formeSuffixes.set(Species.Gen5Formes.darmanitanZ,"-Z");
    formeSuffixes.set(Species.Gen5Formes.meloettaP,"-P");
    } else if (gameVersion == Type_BW2) {
    formeSuffixes.set(Species.Gen5Formes.deoxysA + bw2formeOffset,"-A");
    formeSuffixes.set(Species.Gen5Formes.deoxysD + bw2formeOffset,"-D");
    formeSuffixes.set(Species.Gen5Formes.deoxysS + bw2formeOffset,"-S");
    formeSuffixes.set(Species.Gen5Formes.wormadamS + bw2formeOffset,"-S");
    formeSuffixes.set(Species.Gen5Formes.wormadamT + bw2formeOffset,"-T");
    formeSuffixes.set(Species.Gen5Formes.shayminS + bw2formeOffset,"-S");
    formeSuffixes.set(Species.Gen5Formes.giratinaO + bw2formeOffset,"-O");
    formeSuffixes.set(Species.Gen5Formes.rotomH + bw2formeOffset,"-H");
    formeSuffixes.set(Species.Gen5Formes.rotomW + bw2formeOffset,"-W");
    formeSuffixes.set(Species.Gen5Formes.rotomFr + bw2formeOffset,"-Fr");
    formeSuffixes.set(Species.Gen5Formes.rotomFa + bw2formeOffset,"-Fa");
    formeSuffixes.set(Species.Gen5Formes.rotomM + bw2formeOffset,"-M");
    formeSuffixes.set(Species.Gen5Formes.castformF + bw2formeOffset,"-F");
    formeSuffixes.set(Species.Gen5Formes.castformW + bw2formeOffset,"-W");
    formeSuffixes.set(Species.Gen5Formes.castformI + bw2formeOffset,"-I");
    formeSuffixes.set(Species.Gen5Formes.basculinB + bw2formeOffset,"-B");
    formeSuffixes.set(Species.Gen5Formes.darmanitanZ + bw2formeOffset,"-Z");
    formeSuffixes.set(Species.Gen5Formes.meloettaP + bw2formeOffset,"-P");
    formeSuffixes.set(Species.Gen5Formes.kyuremW + bw2formeOffset,"-W");
    formeSuffixes.set(Species.Gen5Formes.kyuremB + bw2formeOffset,"-B");
    formeSuffixes.set(Species.Gen5Formes.tornadusT + bw2formeOffset,"-T");
    formeSuffixes.set(Species.Gen5Formes.thundurusT + bw2formeOffset,"-T");
    formeSuffixes.set(Species.Gen5Formes.landorusT + bw2formeOffset,"-T");
    }
    
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
    
    const keldeoMap = new Map<number, string>();
    keldeoMap.set(1,"-R");
    map.set(Species.keldeo, keldeoMap);
    
    const tornadusMap = new Map();
    tornadusMap.set(1,"-T");
    map.set(Species.tornadus, tornadusMap);
    
    const thundurusMap = new Map();
    thundurusMap.set(1,"-T");
    map.set(Species.thundurus, thundurusMap);
    
    const landorusMap = new Map();
    landorusMap.set(1,"-T");
    map.set(Species.landorus, landorusMap);
    
    return map;
}

function setupDummyFormeSuffixes(): Map<number, string> {
    const m = new Map();
    m.set(0,"");
    return m;
}

function setupAbsolutePokeNumsByBaseForme(): Map<number, Map<number, number>> {
    
    const map = new Map<number, Map<number, number>>();
    
    const deoxysMap = new Map();
    deoxysMap.set(1,Species.Gen5Formes.deoxysA);
    deoxysMap.set(2,Species.Gen5Formes.deoxysD);
    deoxysMap.set(3,Species.Gen5Formes.deoxysS);
    map.set(Species.deoxys, deoxysMap);
    
    const wormadamMap = new Map();
    wormadamMap.set(1,Species.Gen5Formes.wormadamS);
    wormadamMap.set(2,Species.Gen5Formes.wormadamT);
    map.set(Species.wormadam, wormadamMap);
    
    const shayminMap = new Map();
    shayminMap.set(1,Species.Gen5Formes.shayminS);
    map.set(Species.shaymin, shayminMap);
    
    const giratinaMap = new Map();
    giratinaMap.set(1,Species.Gen5Formes.giratinaO);
    map.set(Species.giratina, giratinaMap);
    
    const rotomMap = new Map();
    rotomMap.set(1,Species.Gen5Formes.rotomH);
    rotomMap.set(2,Species.Gen5Formes.rotomW);
    rotomMap.set(3,Species.Gen5Formes.rotomFr);
    rotomMap.set(4,Species.Gen5Formes.rotomFa);
    rotomMap.set(5,Species.Gen5Formes.rotomM);
    map.set(Species.rotom, rotomMap);
    
    const castformMap = new Map();
    castformMap.set(1,Species.Gen5Formes.castformF);
    castformMap.set(2,Species.Gen5Formes.castformW);
    castformMap.set(3,Species.Gen5Formes.castformI);
    map.set(Species.castform, castformMap);
    
    const basculinMap = new Map();
    basculinMap.set(1,Species.Gen5Formes.basculinB);
    map.set(Species.basculin, basculinMap);
    
    const darmanitanMap = new Map();
    darmanitanMap.set(1,Species.Gen5Formes.darmanitanZ);
    map.set(Species.darmanitan, darmanitanMap);
    
    const meloettaMap = new Map();
    meloettaMap.set(1,Species.Gen5Formes.meloettaP);
    map.set(Species.meloetta, meloettaMap);
    
    const kyuremMap = new Map();
    kyuremMap.set(1,Species.Gen5Formes.kyuremW);
    kyuremMap.set(2,Species.Gen5Formes.kyuremB);
    map.set(Species.kyurem, kyuremMap);
    
    const keldeoMap = new Map();
    keldeoMap.set(1,Species.Gen5Formes.keldeoCosmetic1);
    map.set(Species.keldeo, keldeoMap);
    
    const tornadusMap = new Map();
    tornadusMap.set(1,Species.Gen5Formes.tornadusT);
    map.set(Species.tornadus, tornadusMap);
    
    const thundurusMap = new Map();
    thundurusMap.set(1,Species.Gen5Formes.thundurusT);
    map.set(Species.thundurus, thundurusMap);
    
    const landorusMap = new Map();
    landorusMap.set(1,Species.Gen5Formes.landorusT);
    map.set(Species.landorus, landorusMap);
    
    return map;
}

function setupDummyAbsolutePokeNums(): Map<number, number> {
    const m = new Map();
    m.set(255,0);
    return m;
}

//     public static const regularShopItems: number[], opShopItems;
//
//     public static String blackBoxLegendaryCheckPrefix1 = "79F6BAEF07B0F0BDC046", blackBoxLegendaryCheckPrefix2 = "DEDB0020C04302B0F8BDC046",
//         whiteBoxLegendaryCheckPrefix1 = "00F0FEF8002070BD", whiteBoxLegendaryCheckPrefix2 = "64F62EF970BD0000";

function rangeClosed(start: number, end: number): number[] {
    const result: number[] = [];
    for (let i = start; i <= end; i++) {
        result.push(i);
    }
    return result;
}

let allowedItems: ItemList;
let nonBadItemsBW1: ItemList;
let nonBadItemsBW2: ItemList;
let regularShopItems: number[];
let opShopItems: number[];

function setupAllowedItems(): void {
    allowedItems = new ItemList(Items.revealGlass);
    // Key items + version exclusives
    allowedItems.banRange(Items.explorerKit, 76);
    allowedItems.banRange(Items.dataCard01, 32);
    allowedItems.banRange(Items.xtransceiverMale, 18);
    allowedItems.banSingles(Items.libertyPass, Items.propCase, Items.dragonSkull, Items.lightStone, Items.darkStone);
    // Unknown blank items or version exclusives
    allowedItems.banRange(Items.tea, 3);
    allowedItems.banRange(Items.unused120, 14);
    // TMs & HMs - tms cant be held in gen5
    allowedItems.tmRange(Items.tm01, 92);
    allowedItems.tmRange(Items.tm93, 3);
    allowedItems.banRange(Items.tm01, 100);
    allowedItems.banRange(Items.tm93, 3);
    // Battle Launcher exclusives
    allowedItems.banRange(Items.direHit2, 24);
    
    // non-bad items
    // ban specific pokemon hold items, berries, apricorns, mail
    nonBadItemsBW2 = allowedItems.copy();
    
    nonBadItemsBW2.banSingles(Items.oddKeystone, Items.griseousOrb, Items.soulDew, Items.lightBall,
    Items.oranBerry, Items.quickPowder, Items.passOrb);
    nonBadItemsBW2.banRange(Items.growthMulch, 4); // mulch
    nonBadItemsBW2.banRange(Items.adamantOrb, 2); // orbs
    nonBadItemsBW2.banRange(Items.mail1, 12); // mails
    nonBadItemsBW2.banRange(Items.figyBerry, 25); // berries without useful battle effects
    nonBadItemsBW2.banRange(Items.luckyPunch, 4); // pokemon specific
    nonBadItemsBW2.banRange(Items.redScarf, 5); // contest scarves
    
    // Ban the shards in BW1; even the maniac only gives you $200 for them, and they serve no other purpose.
    nonBadItemsBW1 = nonBadItemsBW2.copy();
    nonBadItemsBW1.banRange(Items.redShard, 4);
    
    regularShopItems = [];
    
    regularShopItems.push(...rangeClosed(Items.ultraBall, Items.pokeBall));
    regularShopItems.push(...rangeClosed(Items.potion, Items.revive));
    regularShopItems.push(...rangeClosed(Items.superRepel, Items.repel));
    
    opShopItems = [];
    
    // "Money items" etc
    opShopItems.push(Items.lavaCookie);
    opShopItems.push(Items.berryJuice);
    opShopItems.push(Items.rareCandy);
    opShopItems.push(Items.oldGateau);
    opShopItems.push(...rangeClosed(Items.blueFlute, Items.shoalShell));
    opShopItems.push(...rangeClosed(Items.tinyMushroom, Items.nugget));
    opShopItems.push(Items.rareBone);
    opShopItems.push(...rangeClosed(Items.lansatBerry, Items.rowapBerry));
    opShopItems.push(Items.luckyEgg);
    opShopItems.push(Items.prettyFeather);
    opShopItems.push(...rangeClosed(Items.balmMushroom, Items.casteliacone));
}

setupAllowedItems();

export function getNonBadItems(romType: number): ItemList {
    if (romType == Type_BW2) {
    return nonBadItemsBW2;
    } else {
    return nonBadItemsBW1;
    }
}

// TODO: const balancedItemPrices = Stream.of(new Integer[][] { // Skip item index 0. All prices divided by 10 {Items.masterBall, 300}, {Items.ultraBall, 120}, {Items.greatBall, 60}, {Items.pokeBall, 20}, {Items.safariBall, 50}, {Items.netBall, 100}, {Items.diveBall, 100}, {Items.nestBall, 100}, {Items.repeatBall, 100}, {Items.timerBall, 100}, {Items.luxuryBall, 100}, {Items.premierBall, 20}, {Items.duskBall, 100}, {Items.healBall, 30}, {Items.quickBall, 100}, {Items.cherishBall, 20}, {Items.potion, 30}, {Items.antidote, 10}, {Items.burnHeal, 25}, {Items.iceHeal, 25}, {Items.awakening, 25}, {Items.paralyzeHeal, 20}, {Items.fullRestore, 300}, {Items.maxPotion, 250}, {Items.hyperPotion, 120}, {Items.superPotion, 70}, {Items.fullHeal, 60}, {Items.revive, 150}, {Items.maxRevive, 400}, {Items.freshWater, 40}, {Items.sodaPop, 60}, {Items.lemonade, 70}, {Items.moomooMilk, 80}, {Items.energyPowder, 40}, {Items.energyRoot, 110}, {Items.healPowder, 45}, {Items.revivalHerb, 280}, {Items.ether, 300}, {Items.maxEther, 450}, {Items.elixir, 1500}, {Items.maxElixir, 1800}, {Items.lavaCookie, 45}, {Items.berryJuice, 10}, {Items.sacredAsh, 1000}, {Items.hpUp, 980}, {Items.protein, 980}, {Items.iron, 980}, {Items.carbos, 980}, {Items.calcium, 980}, {Items.rareCandy, 1000}, {Items.ppUp, 980}, {Items.zinc, 980}, {Items.ppMax, 2490}, {Items.oldGateau, 45}, {Items.guardSpec, 70}, {Items.direHit, 65}, {Items.xAttack, 50}, {Items.xDefense, 55}, {Items.xSpeed, 35}, {Items.xAccuracy, 95}, {Items.xSpAtk, 35}, {Items.xSpDef, 35}, {Items.pokeDoll, 100}, {Items.fluffyTail, 100}, {Items.blueFlute, 2}, {Items.yellowFlute, 2}, {Items.redFlute, 2}, {Items.blackFlute, 2}, {Items.whiteFlute, 2}, {Items.shoalSalt, 2}, {Items.shoalShell, 2}, {Items.redShard, 40}, {Items.blueShard, 40}, {Items.yellowShard, 40}, {Items.greenShard, 40}, {Items.superRepel, 50}, {Items.maxRepel, 70}, {Items.escapeRope, 55}, {Items.repel, 35}, {Items.sunStone, 300}, {Items.moonStone, 300}, {Items.fireStone, 300}, {Items.thunderStone, 300}, {Items.waterStone, 300}, {Items.leafStone, 300}, {Items.tinyMushroom, 50}, {Items.bigMushroom, 500}, {Items.pearl, 140}, {Items.bigPearl, 750}, {Items.stardust, 200}, {Items.starPiece, 980}, {Items.nugget, 1000}, {Items.heartScale, 500}, {Items.honey, 50}, {Items.growthMulch, 20}, {Items.dampMulch, 20}, {Items.stableMulch, 20}, {Items.gooeyMulch, 20}, {Items.rootFossil, 500}, {Items.clawFossil, 500}, {Items.helixFossil, 500}, {Items.domeFossil, 500}, {Items.oldAmber, 800}, {Items.armorFossil, 500}, {Items.skullFossil, 500}, {Items.rareBone, 1000}, {Items.shinyStone, 300}, {Items.duskStone, 300}, {Items.dawnStone, 300}, {Items.ovalStone, 300}, {Items.oddKeystone, 210}, {Items.griseousOrb, 1000}, {Items.tea, 0}, // unused in Gen 5 {Items.unused114, 0}, {Items.autograph, 0}, // unused in Gen 5 {Items.douseDrive, 100}, {Items.shockDrive, 100}, {Items.burnDrive, 100}, {Items.chillDrive, 100}, {Items.unused120, 0}, {Items.pokemonBox, 0}, // unused in Gen 5 {Items.medicinePocket, 0}, // unused in Gen 5 {Items.tmCase, 0}, // unused in Gen 5 {Items.candyJar, 0}, // unused in Gen 5 {Items.powerUpPocket, 0}, // unused in Gen 5 {Items.clothingTrunk, 0}, // unused in Gen 5 {Items.catchingPocket, 0}, // unused in Gen 5 {Items.battlePocket, 0}, // unused in Gen 5 {Items.unused129, 0}, {Items.unused130, 0}, {Items.unused131, 0}, {Items.unused132, 0}, {Items.unused133, 0}, {Items.sweetHeart, 15}, {Items.adamantOrb, 1000}, {Items.lustrousOrb, 1000}, {Items.mail1, 5}, {Items.mail2, 5}, {Items.mail3, 5}, {Items.mail4, 5}, {Items.mail5, 5}, {Items.mail6, 5}, {Items.mail7, 5}, {Items.mail8, 5}, {Items.mail9, 5}, {Items.mail10, 5}, {Items.mail11, 5}, {Items.mail12, 5}, {Items.cheriBerry, 20}, {Items.chestoBerry, 25}, {Items.pechaBerry, 10}, {Items.rawstBerry, 25}, {Items.aspearBerry, 25}, {Items.leppaBerry, 300}, {Items.oranBerry, 5}, {Items.persimBerry, 20}, {Items.lumBerry, 50}, {Items.sitrusBerry, 50}, {Items.figyBerry, 10}, {Items.wikiBerry, 10}, {Items.magoBerry, 10}, {Items.aguavBerry, 10}, {Items.iapapaBerry, 10}, {Items.razzBerry, 50}, {Items.blukBerry, 50}, {Items.nanabBerry, 50}, {Items.wepearBerry, 50}, {Items.pinapBerry, 50}, {Items.pomegBerry, 50}, {Items.kelpsyBerry, 50}, {Items.qualotBerry, 50}, {Items.hondewBerry, 50}, {Items.grepaBerry, 50}, {Items.tamatoBerry, 50}, {Items.cornnBerry, 50}, {Items.magostBerry, 50}, {Items.rabutaBerry, 50}, {Items.nomelBerry, 50}, {Items.spelonBerry, 50}, {Items.pamtreBerry, 50}, {Items.watmelBerry, 50}, {Items.durinBerry, 50}, {Items.belueBerry, 50}, {Items.occaBerry, 100}, {Items.passhoBerry, 100}, {Items.wacanBerry, 100}, {Items.rindoBerry, 100}, {Items.yacheBerry, 100}, {Items.chopleBerry, 100}, {Items.kebiaBerry, 100}, {Items.shucaBerry, 100}, {Items.cobaBerry, 100}, {Items.payapaBerry, 100}, {Items.tangaBerry, 100}, {Items.chartiBerry, 100}, {Items.kasibBerry, 100}, {Items.habanBerry, 100}, {Items.colburBerry, 100}, {Items.babiriBerry, 100}, {Items.chilanBerry, 100}, {Items.liechiBerry, 100}, {Items.ganlonBerry, 100}, {Items.salacBerry, 100}, {Items.petayaBerry, 100}, {Items.apicotBerry, 100}, {Items.lansatBerry, 100}, {Items.starfBerry, 100}, {Items.enigmaBerry, 100}, {Items.micleBerry, 100}, {Items.custapBerry, 100}, {Items.jabocaBerry, 100}, {Items.rowapBerry, 100}, {Items.brightPowder, 300}, {Items.whiteHerb, 100}, {Items.machoBrace, 300}, {Items.expShare, 600}, {Items.quickClaw, 450}, {Items.sootheBell, 100}, {Items.mentalHerb, 100}, {Items.choiceBand, 1000}, {Items.kingsRock, 500}, {Items.silverPowder, 200}, {Items.amuletCoin, 1500}, {Items.cleanseTag, 100}, {Items.soulDew, 20}, {Items.deepSeaTooth, 300}, {Items.deepSeaScale, 300}, {Items.smokeBall, 20}, {Items.everstone, 20}, {Items.focusBand, 300}, {Items.luckyEgg, 1000}, {Items.scopeLens, 500}, {Items.metalCoat, 300}, {Items.leftovers, 1000}, {Items.dragonScale, 300}, {Items.lightBall, 10}, {Items.softSand, 200}, {Items.hardStone, 200}, {Items.miracleSeed, 200}, {Items.blackGlasses, 200}, {Items.blackBelt, 200}, {Items.magnet, 200}, {Items.mysticWater, 200}, {Items.sharpBeak, 200}, {Items.poisonBarb, 200}, {Items.neverMeltIce, 200}, {Items.spellTag, 200}, {Items.twistedSpoon, 200}, {Items.charcoal, 200}, {Items.dragonFang, 200}, {Items.silkScarf, 200}, {Items.upgrade, 300}, {Items.shellBell, 600}, {Items.seaIncense, 200}, {Items.laxIncense, 300}, {Items.luckyPunch, 1}, {Items.metalPowder, 1}, {Items.thickClub, 50}, {Items.leek, 20}, {Items.redScarf, 10}, {Items.blueScarf, 10}, {Items.pinkScarf, 10}, {Items.greenScarf, 10}, {Items.yellowScarf, 10}, {Items.wideLens, 150}, {Items.muscleBand, 200}, {Items.wiseGlasses, 200}, {Items.expertBelt, 600}, {Items.lightClay, 150}, {Items.lifeOrb, 1000}, {Items.powerHerb, 100}, {Items.toxicOrb, 150}, {Items.flameOrb, 150}, {Items.quickPowder, 1}, {Items.focusSash, 200}, {Items.zoomLens, 150}, {Items.metronome, 300}, {Items.ironBall, 100}, {Items.laggingTail, 100}, {Items.destinyKnot, 150}, {Items.blackSludge, 500}, {Items.icyRock, 20}, {Items.smoothRock, 20}, {Items.heatRock, 20}, {Items.dampRock, 20}, {Items.gripClaw, 150}, {Items.choiceScarf, 1000}, {Items.stickyBarb, 150}, {Items.powerBracer, 300}, {Items.powerBelt, 300}, {Items.powerLens, 300}, {Items.powerBand, 300}, {Items.powerAnklet, 300}, {Items.powerWeight, 300}, {Items.shedShell, 50}, {Items.bigRoot, 150}, {Items.choiceSpecs, 1000}, {Items.flamePlate, 200}, {Items.splashPlate, 200}, {Items.zapPlate, 200}, {Items.meadowPlate, 200}, {Items.iciclePlate, 200}, {Items.fistPlate, 200}, {Items.toxicPlate, 200}, {Items.earthPlate, 200}, {Items.skyPlate, 200}, {Items.mindPlate, 200}, {Items.insectPlate, 200}, {Items.stonePlate, 200}, {Items.spookyPlate, 200}, {Items.dracoPlate, 200}, {Items.dreadPlate, 200}, {Items.ironPlate, 200}, {Items.oddIncense, 200}, {Items.rockIncense, 200}, {Items.fullIncense, 100}, {Items.waveIncense, 200}, {Items.roseIncense, 200}, {Items.luckIncense, 1500}, {Items.pureIncense, 100}, {Items.protector, 300}, {Items.electirizer, 300}, {Items.magmarizer, 300}, {Items.dubiousDisc, 300}, {Items.reaperCloth, 300}, {Items.razorClaw, 500}, {Items.razorFang, 500}, {Items.tm01, 1000}, {Items.tm02, 1000}, {Items.tm03, 1000}, {Items.tm04, 1000}, {Items.tm05, 1000}, {Items.tm06, 1000}, {Items.tm07, 2000}, {Items.tm08, 1000}, {Items.tm09, 1000}, {Items.tm10, 1000}, {Items.tm11, 2000}, {Items.tm12, 1000}, {Items.tm13, 1000}, {Items.tm14, 2000}, {Items.tm15, 2000}, {Items.tm16, 2000}, {Items.tm17, 1000}, {Items.tm18, 2000}, {Items.tm19, 1000}, {Items.tm20, 2000}, {Items.tm21, 1000}, {Items.tm22, 1000}, {Items.tm23, 1000}, {Items.tm24, 1000}, {Items.tm25, 2000}, {Items.tm26, 1000}, {Items.tm27, 1000}, {Items.tm28, 1000}, {Items.tm29, 1000}, {Items.tm30, 1000}, {Items.tm31, 1000}, {Items.tm32, 1000}, {Items.tm33, 2000}, {Items.tm34, 1000}, {Items.tm35, 1000}, {Items.tm36, 1000}, {Items.tm37, 2000}, {Items.tm38, 2000}, {Items.tm39, 1000}, {Items.tm40, 1000}, {Items.tm41, 1000}, {Items.tm42, 1000}, {Items.tm43, 1000}, {Items.tm44, 1000}, {Items.tm45, 1000}, {Items.tm46, 1000}, {Items.tm47, 1000}, {Items.tm48, 1000}, {Items.tm49, 1000}, {Items.tm50, 1000}, {Items.tm51, 1000}, {Items.tm52, 1000}, {Items.tm53, 1000}, {Items.tm54, 1000}, {Items.tm55, 1000}, {Items.tm56, 1000}, {Items.tm57, 1000}, {Items.tm58, 1000}, {Items.tm59, 1000}, {Items.tm60, 1000}, {Items.tm61, 1000}, {Items.tm62, 1000}, {Items.tm63, 1000}, {Items.tm64, 1000}, {Items.tm65, 1000}, {Items.tm66, 1000}, {Items.tm67, 1000}, {Items.tm68, 2000}, {Items.tm69, 1000}, {Items.tm70, 1000}, {Items.tm71, 1000}, {Items.tm72, 1000}, {Items.tm73, 1000}, {Items.tm74, 1000}, {Items.tm75, 1000}, {Items.tm76, 1000}, {Items.tm77, 1000}, {Items.tm78, 1000}, {Items.tm79, 1000}, {Items.tm80, 1000}, {Items.tm81, 1000}, {Items.tm82, 1000}, {Items.tm83, 1000}, {Items.tm84, 1000}, {Items.tm85, 1000}, {Items.tm86, 1000}, {Items.tm87, 1000}, {Items.tm88, 1000}, {Items.tm89, 1000}, {Items.tm90, 1000}, {Items.tm91, 1000}, {Items.tm92, 1000}, {Items.hm01, 0}, {Items.hm02, 0}, {Items.hm03, 0}, {Items.hm04, 0}, {Items.hm05, 0}, {Items.hm06, 0}, {Items.hm07, 0}, // unused in Gen 5 {Items.hm08, 0}, // unused in Gen 5 {Items.explorerKit, 0}, {Items.lootSack, 0}, {Items.ruleBook, 0}, {Items.pokeRadar, 0}, {Items.pointCard, 0}, {Items.journal, 0}, {Items.sealCase, 0}, {Items.fashionCase, 0}, {Items.sealBag, 0}, {Items.palPad, 0}, {Items.worksKey, 0}, {Items.oldCharm, 0}, {Items.galacticKey, 0}, {Items.redChain, 0}, {Items.townMap, 0}, {Items.vsSeeker, 0}, {Items.coinCase, 0}, {Items.oldRod, 0}, {Items.goodRod, 0}, {Items.superRod, 0}, {Items.sprayduck, 0}, {Items.poffinCase, 0}, {Items.bike, 0}, {Items.suiteKey, 0}, {Items.oaksLetter, 0}, {Items.lunarWing, 0}, {Items.memberCard, 0}, {Items.azureFlute, 0}, {Items.ssTicketJohto, 0}, {Items.contestPass, 0}, {Items.magmaStone, 0}, {Items.parcelSinnoh, 0}, {Items.coupon1, 0}, {Items.coupon2, 0}, {Items.coupon3, 0}, {Items.storageKeySinnoh, 0}, {Items.secretPotion, 0}, {Items.vsRecorder, 0}, {Items.gracidea, 0}, {Items.secretKeySinnoh, 0}, {Items.apricornBox, 0}, {Items.unownReport, 0}, {Items.berryPots, 0}, {Items.dowsingMachine, 0}, {Items.blueCard, 0}, {Items.slowpokeTail, 0}, {Items.clearBell, 0}, {Items.cardKeyJohto, 0}, {Items.basementKeyJohto, 0}, {Items.squirtBottle, 0}, {Items.redScale, 0}, {Items.lostItem, 0}, {Items.pass, 0}, {Items.machinePart, 0}, {Items.silverWing, 0}, {Items.rainbowWing, 0}, {Items.mysteryEgg, 0}, {Items.redApricorn, 2}, {Items.blueApricorn, 2}, {Items.yellowApricorn, 2}, {Items.greenApricorn, 2}, {Items.pinkApricorn, 2}, {Items.whiteApricorn, 2}, {Items.blackApricorn, 2}, {Items.fastBall, 30}, {Items.levelBall, 30}, {Items.lureBall, 30}, {Items.heavyBall, 30}, {Items.loveBall, 30}, {Items.friendBall, 30}, {Items.moonBall, 30}, {Items.sportBall, 30}, {Items.parkBall, 0}, {Items.photoAlbum, 0}, {Items.gbSounds, 0}, {Items.tidalBell, 0}, {Items.rageCandyBar, 1500}, {Items.dataCard01, 0}, {Items.dataCard02, 0}, {Items.dataCard03, 0}, {Items.dataCard04, 0}, {Items.dataCard05, 0}, {Items.dataCard06, 0}, {Items.dataCard07, 0}, {Items.dataCard08, 0}, {Items.dataCard09, 0}, {Items.dataCard10, 0}, {Items.dataCard11, 0}, {Items.dataCard12, 0}, {Items.dataCard13, 0}, {Items.dataCard14, 0}, {Items.dataCard15, 0}, {Items.dataCard16, 0}, {Items.dataCard17, 0}, {Items.dataCard18, 0}, {Items.dataCard19, 0}, {Items.dataCard20, 0}, {Items.dataCard21, 0}, {Items.dataCard22, 0}, {Items.dataCard23, 0}, {Items.dataCard24, 0}, {Items.dataCard25, 0}, {Items.dataCard26, 0}, {Items.dataCard27, 0}, {Items.jadeOrb, 0}, {Items.lockCapsule, 0}, {Items.redOrb, 0}, {Items.blueOrb, 0}, {Items.enigmaStone, 0}, {Items.prismScale, 300}, {Items.eviolite, 1000}, {Items.floatStone, 100}, {Items.rockyHelmet, 600}, {Items.airBalloon, 100}, {Items.redCard, 100}, {Items.ringTarget, 100}, {Items.bindingBand, 200}, {Items.absorbBulb, 100}, {Items.cellBattery, 100}, {Items.ejectButton, 100}, {Items.fireGem, 100}, {Items.waterGem, 100}, {Items.electricGem, 100}, {Items.grassGem, 100}, {Items.iceGem, 100}, {Items.fightingGem, 100}, {Items.poisonGem, 100}, {Items.groundGem, 100}, {Items.flyingGem, 100}, {Items.psychicGem, 100}, {Items.bugGem, 100}, {Items.rockGem, 100}, {Items.ghostGem, 100}, {Items.dragonGem, 100}, {Items.darkGem, 100}, {Items.steelGem, 100}, {Items.normalGem, 100}, {Items.healthFeather, 300}, {Items.muscleFeather, 300}, {Items.resistFeather, 300}, {Items.geniusFeather, 300}, {Items.cleverFeather, 300}, {Items.swiftFeather, 300}, {Items.prettyFeather, 20}, {Items.coverFossil, 500}, {Items.plumeFossil, 500}, {Items.libertyPass, 0}, {Items.passOrb, 20}, {Items.dreamBall, 100}, {Items.pokeToy, 100}, {Items.propCase, 0}, {Items.dragonSkull, 0}, {Items.balmMushroom, 0}, {Items.bigNugget, 0}, {Items.pearlString, 0}, {Items.cometShard, 0}, {Items.relicCopper, 0}, {Items.relicSilver, 0}, {Items.relicGold, 0}, {Items.relicVase, 0}, {Items.relicBand, 0}, {Items.relicStatue, 0}, {Items.relicCrown, 0}, {Items.casteliacone, 45}, {Items.direHit2, 0}, {Items.xSpeed2, 0}, {Items.xSpAtk2, 0}, {Items.xSpDef2, 0}, {Items.xDefense2, 0}, {Items.xAttack2, 0}, {Items.xAccuracy2, 0}, {Items.xSpeed3, 0}, {Items.xSpAtk3, 0}, {Items.xSpDef3, 0}, {Items.xDefense3, 0}, {Items.xAttack3, 0}, {Items.xAccuracy3, 0}, {Items.xSpeed6, 0}, {Items.xSpAtk6, 0}, {Items.xSpDef6, 0}, {Items.xDefense6, 0}, {Items.xAttack6, 0}, {Items.xAccuracy6, 0}, {Items.abilityUrge, 0}, {Items.itemDrop, 0}, {Items.itemUrge, 0}, {Items.resetUrge, 0}, {Items.direHit3, 0}, {Items.lightStone, 0}, {Items.darkStone, 0}, {Items.tm93, 1000}, {Items.tm94, 1000}, {Items.tm95, 1000}, {Items.xtransceiverMale, 0}, {Items.unused622, 0}, {Items.gram1, 0}, {Items.gram2, 0}, {Items.gram3, 0}, {Items.xtransceiverFemale, 0}, {Items.medalBox, 0}, {Items.dNASplicersFuse, 0}, {Items.dNASplicersSeparate, 0}, {Items.permit, 0}, {Items.ovalCharm, 0}, {Items.shinyCharm, 0}, {Items.plasmaCard, 0}, {Items.grubbyHanky, 0}, {Items.colressMachine, 0}, {Items.droppedItemCurtis, 0}, {Items.droppedItemYancy, 0}, {Items.revealGlass, 0} }).collect(Collectors.toMap(kv -> kv[0], kv -> kv[1]));

// TODO: @SuppressWarnings("unused")
// TODO: int[][] habitatListEntries = { { 104, 105 }, // Route 4 { 124 }, // Route 15 { 134 }, // Route 21 { 84, 85, 86 }, // Clay Tunnel { 23, 24, 25, 26 }, // Twist Mountain { 97 }, // Village Bridge { 27, 28, 29, 30 }, // Dragonspiral Tower { 81, 82, 83 }, // Relic Passage { 106 }, // Route 5* { 125 }, // Route 16* { 98 }, // Marvelous Bridge { 123 }, // Abundant Shrine { 132 }, // Undella Town { 107 }, // Route 6 { 43 }, // Undella Bay { 102, 103 }, // Wellspring Cave { 95 }, // Nature Preserve { 127 }, // Route 18 { 32, 33, 34, 35, 36 }, // Giant Chasm { 111 }, // Route 7 { 31, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80 }, // Victory Road { 12, 13, 14, 15, 16, 17, 18, 19 }, // Relic Castle { 0 }, // Striation City { 128 }, // Route 19 { 3 }, // Aspertia City { 116 }, // Route 8* { 44, 45 }, // Floccesy Ranch { 61, 62, 63, 64, 65, 66, 67, 68, 69, 70 }, // Strange House { 129 }, // Route 20 { 4 }, // Virbank City { 37, 38, 39, 40, 41 }, // Castelia Sewers { 118 }, // Route 9 { 46, 47 }, // Virbank Complex { 42 }, // P2 Laboratory { 1 }, // Castelia City { 8, 9 }, // Pinwheel Forest { 5 }, // Humilau City { 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60 }, // Reversal Mountain { 6, 7 }, // Dreamyard { 112, 113, 114, 115 }, // Celestial Tower { 130 }, // Route 22 { 10, 11 }, // Desert Resort { 119 }, // Route 11 { 133 }, // Route 17 { 99 }, // Route 1 { 131 }, // Route 23 { 2 }, // Icirrus City* { 120 }, // Route 12 { 100 }, // Route 2 { 108, 109 }, // Mistralton Cave { 121 }, // Route 13 { 101 }, // Route 3 { 117 }, // Moor of Icirrus* { 96 }, // Driftveil Drawbridge { 93, 94 }, // Seaside Cave { 126 }, // Lostlorn Forest { 122 }, // Route 14 { 20, 21, 22 }, // Chargestone Cave };

// lol at all the 21s
export const bw1WildFileToAreaMap: number[] = [ 2, 6, 8, 18, 18, 19, 19, 20, 20, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 22, 23, 23, 23, 24, 24, 24, 24, 25, 25, 25, 25, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26, 27, 27, 27, 27, 29, 36, 57, 59, 60, 38, 39, 40, 30, 30, 41, 42, 43, 31, 31, 31, 44, 33, 33, 33, 33, 45, 34, 46, 32, 32, 32, 47, 47, 48, 49, 50, 51, 35, 52, 53, 37, 55, 12, 54, ];

// -1 = Nature Preserve (not on map)
export const bw2WildFileToAreaMap: number[] = [ 2, 4, 8, 59, 61, 63, 19, 19, 20, 20, 21, 21, 22, 22, 22, 22, 22, 22, 22, 22, 24, 24, 24, 25, 25, 25, 25, 26, 26, 26, 26, 76, 27, 27, 27, 27, 27, 70, 70, 70, 70, 70, 29, 35, 71, 71, 72, 72, 73, 73, 73, 73, 73, 73, 73, 73, 73, 73, 73, 73, 73, 74, 74, 74, 74, 74, 74, 74, 74, 74, 74, 76, 76, 76, 76, 76, 76, 76, 76, 76, 76, 77, 77, 77, 79, 79, 79, 79, 79, 79, 79, 79, 79, 78, 78, -1, 55, 57, 58, 37, 38, 39, 30, 30, 40, 40, 41, 42, 31, 31, 31, 43, 32, 32, 32, 32, 44, 33, 45, 46, 47, 48, 49, 34, 50, 51, 36, 53, 66, 67, 69, 75, 12, 52, 68, ];

export function tagTrainersBW(trs: any[]): void {
    // We use different Gym IDs to cheat the system for the 3 n00bs
    // Chili, Cress, and Cilan
    // Cilan can be GYM1, then Chili is GYM9 and Cress GYM10
    // Also their *trainers* are GYM11 lol
    
    // Gym Trainers
    tag(trs, "GYM11", 0x09, 0x0A);
    tag(trs, "GYM2", 0x56, 0x57, 0x58);
    tag(trs, "GYM3", 0xC4, 0xC6, 0xC7, 0xC8);
    tag(trs, "GYM4", 0x42, 0x43, 0x44, 0x45);
    tag(trs, "GYM5", 0xC9, 0xCA, 0xCB, 0x5F, 0xA8);
    tag(trs, "GYM6", 0x7D, 0x7F, 0x80, 0x46, 0x47);
    tag(trs, "GYM7", 0xD7, 0xD8, 0xD9, 0xD4, 0xD5, 0xD6);
    tag(trs, "GYM8", 0x109, 0x10A, 0x10F, 0x10E, 0x110, 0x10B, 0x113, 0x112);
    
    // Gym Leaders
    tagTrainer(trs, 0x0C, "GYM1-LEADER"); // Cilan
    tagTrainer(trs, 0x0B, "GYM9-LEADER"); // Chili
    tagTrainer(trs, 0x0D, "GYM10-LEADER"); // Cress
    tagTrainer(trs, 0x15, "GYM2-LEADER"); // Lenora
    tagTrainer(trs, 0x16, "GYM3-LEADER"); // Burgh
    tagTrainer(trs, 0x17, "GYM4-LEADER"); // Elesa
    tagTrainer(trs, 0x18, "GYM5-LEADER"); // Clay
    tagTrainer(trs, 0x19, "GYM6-LEADER"); // Skyla
    tagTrainer(trs, 0x83, "GYM7-LEADER"); // Brycen
    tagTrainer(trs, 0x84, "GYM8-LEADER"); // Iris or Drayden
    tagTrainer(trs, 0x85, "GYM8-LEADER"); // Iris or Drayden
    
    // Elite 4
    tagTrainer(trs, 0xE4, "ELITE1"); // Shauntal
    tagTrainer(trs, 0xE6, "ELITE2"); // Grimsley
    tagTrainer(trs, 0xE7, "ELITE3"); // Caitlin
    tagTrainer(trs, 0xE5, "ELITE4"); // Marshal
    
    // Elite 4 R2
    tagTrainer(trs, 0x233, "ELITE1"); // Shauntal
    tagTrainer(trs, 0x235, "ELITE2"); // Grimsley
    tagTrainer(trs, 0x236, "ELITE3"); // Caitlin
    tagTrainer(trs, 0x234, "ELITE4"); // Marshal
    tagTrainer(trs, 0x197, "CHAMPION"); // Alder
    
    // Ubers?
    tagTrainer(trs, 0x21E, "UBER"); // Game Freak Guy
    tagTrainer(trs, 0x237, "UBER"); // Cynthia
    tagTrainer(trs, 0xE8, "UBER"); // Ghetsis
    tagTrainer(trs, 0x24A, "UBER"); // N-White
    tagTrainer(trs, 0x24B, "UBER"); // N-Black
    
    // Rival - Cheren
    tagRivalBW(trs, "RIVAL1", 0x35);
    tagRivalBW(trs, "RIVAL2", 0x11F);
    tagRivalBW(trs, "RIVAL3", 0x38); // used for 3rd battle AND tag battle
    tagRivalBW(trs, "RIVAL4", 0x193);
    tagRivalBW(trs, "RIVAL5", 0x5A); // 5th battle & 2nd tag battle
    tagRivalBW(trs, "RIVAL6", 0x21B);
    tagRivalBW(trs, "RIVAL7", 0x24C);
    tagRivalBW(trs, "RIVAL8", 0x24F);
    
    // Rival - Bianca
    tagRivalBW(trs, "FRIEND1", 0x3B);
    tagRivalBW(trs, "FRIEND2", 0x1F2);
    tagRivalBW(trs, "FRIEND3", 0x1FB);
    tagRivalBW(trs, "FRIEND4", 0x1EB);
    tagRivalBW(trs, "FRIEND5", 0x1EE);
    tagRivalBW(trs, "FRIEND6", 0x252);
    
    // N
    tag(trs, "NOTSTRONG", 64);
    tag(trs, "STRONG", 65, 89, 218);
}

export function tagTrainersBW2(trs: any[]): void {
    // Use GYM9/10/11 for the retired Chili/Cress/Cilan.
    // Lenora doesn't have a team, or she'd be 12.
    // Likewise for Brycen
    
    // Some trainers have TWO teams because of Challenge Mode
    // I believe this is limited to Gym Leaders, E4, Champ...
    // The "Challenge Mode" teams have levels at similar to regular,
    // but have the normal boost applied too.
    
    // Gym Trainers
    tag(trs, "GYM1", 0xab, 0xac);
    tag(trs, "GYM2", 0xb2, 0xb3);
    tag(trs, "GYM3", 0x2de, 0x2df, 0x2e0, 0x2e1);
    // GYM4: old gym site included to give the city a theme
    tag(trs, "GYM4", 0x26d, 0x94, 0xcf, 0xd0, 0xd1); // 0x94 might be 0x324
    tag(trs, "GYM5", 0x13f, 0x140, 0x141, 0x142, 0x143, 0x144, 0x145);
    tag(trs, "GYM6", 0x95, 0x96, 0x97, 0x98, 0x14c);
    tag(trs, "GYM7", 0x17d, 0x17e, 0x17f, 0x180, 0x181);
    tag(trs, "GYM8", 0x15e, 0x15f, 0x160, 0x161, 0x162, 0x163);
    
    // Gym Leaders
    // Order: Normal, Challenge Mode
    // All the challenge mode teams are near the end of the ROM
    // which makes things a bit easier.
    tag(trs, "GYM1-LEADER", 0x9c, 0x2fc); // Cheren
    tag(trs, "GYM2-LEADER", 0x9d, 0x2fd); // Roxie
    tag(trs, "GYM3-LEADER", 0x9a, 0x2fe); // Burgh
    tag(trs, "GYM4-LEADER", 0x99, 0x2ff); // Elesa
    tag(trs, "GYM5-LEADER", 0x9e, 0x300); // Clay
    tag(trs, "GYM6-LEADER", 0x9b, 0x301); // Skyla
    tag(trs, "GYM7-LEADER", 0x9f, 0x302); // Drayden
    tag(trs, "GYM8-LEADER", 0xa0, 0x303); // Marlon
    
    // Elite 4 / Champion
    // Order: Normal, Challenge Mode, Rematch, Rematch Challenge Mode
    tag(trs, "ELITE1", 0x26, 0x304, 0x8f, 0x309);
    tag(trs, "ELITE2", 0x28, 0x305, 0x91, 0x30a);
    tag(trs, "ELITE3", 0x29, 0x307, 0x92, 0x30c);
    tag(trs, "ELITE4", 0x27, 0x306, 0x90, 0x30b);
    tag(trs, "CHAMPION", 0x155, 0x308, 0x218, 0x30d);
    
    // Rival - Hugh
    tagRivalBW(trs, "RIVAL1", 0xa1); // Start
    tagRivalBW(trs, "RIVAL2", 0xa6); // Floccessy Ranch
    tagRivalBW(trs, "RIVAL3", 0x24c); // Tag Battles in the sewers
    tagRivalBW(trs, "RIVAL4", 0x170); // Tag Battle on the Plasma Frigate
    tagRivalBW(trs, "RIVAL5", 0x17a); // Undella Town 1st visit
    tagRivalBW(trs, "RIVAL6", 0x2bd); // Lacunosa Town Tag Battle
    tagRivalBW(trs, "RIVAL7", 0x31a); // 2nd Plasma Frigate Tag Battle
    tagRivalBW(trs, "RIVAL8", 0x2ac); // Victory Road
    tagRivalBW(trs, "RIVAL9", 0x2b5); // Undella Town Post-E4
    tagRivalBW(trs, "RIVAL10", 0x2b8); // Driftveil Post-Undella-Battle
    
    // Tag Battle with Opposite Gender Hero
    tagRivalBW(trs, "FRIEND1", 0x168);
    tagRivalBW(trs, "FRIEND1", 0x16b);
    
    // Tag/PWT Battles with Cheren
    tag(trs, "GYM1", 0x173, 0x278, 0x32E);
    
    // The Restaurant Brothers
    tag(trs, "GYM9-LEADER", 0x1f0); // Cilan
    tag(trs, "GYM10-LEADER", 0x1ee); // Chili
    tag(trs, "GYM11-LEADER", 0x1ef); // Cress
    
    // Themed Trainers
    tag(trs, "THEMED:ZINZOLIN-STRONG", 0x2c0, 0x248, 0x15b, 0x1f1);
    tag(trs, "THEMED:COLRESS-STRONG", 0x166, 0x158, 0x32d, 0x32f);
    tag(trs, "THEMED:SHADOW1", 0x247, 0x15c, 0x2af);
    tag(trs, "THEMED:SHADOW2", 0x1f2, 0x2b0);
    tag(trs, "THEMED:SHADOW3", 0x1f3, 0x2b1);
    
    // Uber-Trainers
    // There are *fourteen* ubers of 17 allowed (incl. the champion)
    // It's a rather stacked game...
    tagTrainer(trs, 0x246, "UBER"); // Alder
    tagTrainer(trs, 0x1c8, "UBER"); // Cynthia
    tagTrainer(trs, 0xca, "UBER"); // Benga/BlackTower
    tagTrainer(trs, 0xc9, "UBER"); // Benga/WhiteTreehollow
    tagTrainer(trs, 0x5, "UBER"); // N/Zekrom
    tagTrainer(trs, 0x6, "UBER"); // N/Reshiram
    tagTrainer(trs, 0x30e, "UBER"); // N/Spring
    tagTrainer(trs, 0x30f, "UBER"); // N/Summer
    tagTrainer(trs, 0x310, "UBER"); // N/Autumn
    tagTrainer(trs, 0x311, "UBER"); // N/Winter
    tagTrainer(trs, 0x159, "UBER"); // Ghetsis
    tagTrainer(trs, 0x8c, "UBER"); // Game Freak Guy
    tagTrainer(trs, 0x24f, "UBER"); // Game Freak Leftovers Guy
    
}

function tagRivalBW(allTrainers: any[], tag: string, offset: number): void {
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

export function setMultiBattleStatusBW(trs: any[]): void {
    // 62 + 63: Multi Battle with Team Plasma Grunts in Wellspring Cave w/ Cheren
    // 401 + 402: Double Battle with Preschooler Sarah and Preschooler Billy
    setMultiBattleStatus(trs, MultiBattleStatus.ALWAYS, 62, 63, 401, 402);
}

export function setMultiBattleStatusBW2(trs: any[], isBlack2: boolean): void {
    // 342 + 356: Multi Battle with Team Plasma Grunts in Castelia Sewers w/ Hugh
    // 347 + 797: Multi Battle with Team Plasma Zinzolin and Team Plasma Grunt on Plasma Frigate w/ Hugh
    // 374 + 375: Multi Battle with Team Plasma Grunts on Plasma Frigate w/ Cheren
    // 376 + 377: Multi Battle with Team Plasma Grunts on Plasma Frigate w/ Hugh
    // 494 + 495 + 496: Cilan, Chili, and Cress all participate in a Multi Battle
    // 614 + 615: Double Battle with Veteran Claude and Veteran Cecile
    // 643 + 644: Double Battle with Veteran Sinan and Veteran Rosaline
    // 704 + 705: Multi Battle with Team Plasma Zinzolin and Team Plasma Grunt in Lacunosa Town w/ Hugh
    // 798 + 799: Multi Battle with Team Plasma Grunts on Plasma Frigate w/ Hugh
    // 807 + 809: Double Battle with Team Plasma Grunts on Plasma Frigate
    setMultiBattleStatus(trs, MultiBattleStatus.ALWAYS, 342, 347, 356, 374, 375, 376, 377, 494,
    495, 496, 614, 615, 643, 644, 704, 705, 797, 798, 799, 807, 809
    );
    
    // 513/788 + 522: Potential Double Battle with Backpacker Kiyo (513 in B2, 788 in W2) and Hiker Markus
    // 519/786 + 520/787: Potential Double Battle with Ace Trainer Ray (519 in W2, 786 in B2) and Ace Trainer Cora (520 in B2, 787 in W2)
    // 602 + 603: Potential Double Battle with Ace Trainer Webster and Ace Trainer Shanta
    // 790 + 791: Potential Double Battle with Nursery Aide Rosalyn and Preschooler Ike
    // 792 + 793: Potential Double Battle with Youngster Henley and Lass Helia
    setMultiBattleStatus(trs, MultiBattleStatus.POTENTIAL, 513, 522, 602, 603, 788, 790, 791, 792, 793);
    
    if (isBlack2) {
    // 789 + 521: Double Battle with Backpacker Kumiko and Hiker Jared
    setMultiBattleStatus(trs, MultiBattleStatus.ALWAYS, 521, 789);
    
    // 786 + 520: Potential Double Batlte with Ace Trainer Ray and Ace Trainer Cora
    setMultiBattleStatus(trs, MultiBattleStatus.POTENTIAL, 520, 786);
    } else {
    // 514 + 521: Potential Double Battle with Backpacker Kumiko and Hiker Jared
    setMultiBattleStatus(trs, MultiBattleStatus.POTENTIAL, 514, 521);
    
    // 519 + 787: Double Battle with Ace Trainer Ray and Ace Trainer Cora
    setMultiBattleStatus(trs, MultiBattleStatus.ALWAYS, 519, 787);
    }
}

function setMultiBattleStatus(allTrainers: any[], status: any, ...numbers: number[]): void {
    for (const num of numbers) {
    if (allTrainers.length > (num - 1)) {
    allTrainers[num - 1].multiBattleStatus = status;
    }
    }
}
