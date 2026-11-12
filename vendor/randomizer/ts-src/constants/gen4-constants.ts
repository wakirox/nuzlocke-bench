import * as Abilities from './abilities';
import * as Items from './items';
import * as Moves from './moves';
import * as Species from './species';
import { ItemList } from '../pokemon/item-list';
import { MoveCategory } from '../pokemon/move-category';
import { FormeInfo } from '../pokemon/forme-info';
import { MultiBattleStatus } from '../pokemon/trainer';

export const Type_DP = 0;
export const Type_Plat = 1;
export const Type_HGSS = 2;

export const arm9Offset = 0x02000000;

export const pokemonCount = 493;
export const moveCount = 467;
export const dpFormeCount = 5;
export const platHgSsFormeCount = 12;
export const formeOffset = 2;

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
export const bsGenderRatioOffset = 16;
export const bsGrowthCurveOffset = 19;
export const bsAbility1Offset = 22;
export const bsAbility2Offset = 23;
export const bsTMHMCompatOffset = 28;

export const starterCriesPrefix = "0004000C10BD0000000000000000000000E000000000000000E0000000000200";

export const hgssStarterCodeSuffix = new Uint8Array([0x03, 0x03, 0x1A, 0x12, 0x01, 0x23, 0x00, 0x00]);

export const hgssFilesWithRivalScript: number[] = [ 7, 23, 96, 110, 819, 850, 866 ];

export const hgssRivalScriptMagic = new Uint8Array([0xCE, 0x00, 0x0C, 0x80, 0x11, 0x00, 0x0C, 0x80, 152, 0, 0x1C, 0x00, 0x05]);

export const ptFilesWithRivalScript: number[] = [ 31, 36, 112, 123, 186, 427, 429, 1096 ];

export const dpFilesWithRivalScript: number[] = [ 34, 90, 118, 180, 195, 394 ];

export const dpptRivalScriptMagic = new Uint8Array([0xDE, 0x00, 0x0C, 0x80, 0x11, 0x00, 0x0C, 0x80, 0x83, 0x01, 0x1C, 0x00, 0x01]);

export const dpptTagBattleScriptMagic1 = new Uint8Array([0xDE, 0x00, 0x0C, 0x80, 0x28, 0x00, 0x04, 0x80]);

export const dpptTagBattleScriptMagic2 = new Uint8Array([0x11, 0x00, 0x0C, 0x80, 0x86, 0x01, 0x1C, 0x00, 0x01]);

export const ptFilesWithTagScript: number[] = [ 2, 136, 201, 236 ];

export const dpFilesWithTagScript: number[] = [ 2, 131, 230 ];

export const dpStarterStringIndex = 19;
export const ptStarterStringIndex = 36;

export const fossilCount = 7;

export const dpptTMDataPrefix = "D100D200D300D400", hgssTMDataPrefix = "1E003200";

export const tmCount = 92;
export const hmCount = 8;

export const tmItemOffset = Items.tm01;

export const dpptTextCharsPerLine = 38;
export const hgssTextCharsPerLine = 36;

export const dpItemPalettesPrefix = "8D018E01210132018D018F0122013301", pthgssItemPalettesPrefix = "8D018E01210133018D018F0122013401";

export const ptSpearPillarPortalScriptFile = 237;

export const evolutionMethodCount = 26;

export const highestAbilityIndex = Abilities.badDreams;

export const consumableHeldItems: number[] = [ Items.cheriBerry, Items.chestoBerry, Items.pechaBerry, Items.rawstBerry, Items.aspearBerry, Items.leppaBerry, Items.oranBerry, Items.persimBerry, Items.lumBerry, Items.sitrusBerry, Items.figyBerry, Items.wikiBerry, Items.magoBerry, Items.aguavBerry, Items.iapapaBerry, Items.occaBerry, Items.passhoBerry, Items.wacanBerry, Items.rindoBerry, Items.yacheBerry, Items.chopleBerry, Items.kebiaBerry, Items.shucaBerry, Items.cobaBerry, Items.payapaBerry, Items.tangaBerry, Items.chartiBerry, Items.kasibBerry, Items.habanBerry, Items.colburBerry, Items.babiriBerry, Items.chilanBerry, Items.liechiBerry, Items.ganlonBerry, Items.salacBerry, Items.petayaBerry, Items.apicotBerry, Items.lansatBerry, Items.starfBerry, Items.enigmaBerry, Items.micleBerry, Items.custapBerry, Items.jabocaBerry, Items.rowapBerry, Items.berryJuice, Items.whiteHerb, Items.mentalHerb, Items.powerHerb, Items.focusSash];

export const allHeldItems: number[] = setupAllHeldItems();

function setupAllHeldItems(): number[] {
    const list: number[] = [];
    list.push(Items.brightPowder, Items.quickClaw, Items.choiceBand, Items.kingsRock,
    Items.silverPowder, Items.focusBand, Items.scopeLens, Items.metalCoat, Items.leftovers, Items.softSand,
    Items.hardStone, Items.miracleSeed, Items.blackGlasses, Items.blackBelt, Items.magnet,
    Items.mysticWater, Items.sharpBeak, Items.poisonBarb, Items.neverMeltIce, Items.spellTag,
    Items.twistedSpoon, Items.charcoal, Items.dragonFang, Items.silkScarf, Items.shellBell,
    Items.seaIncense, Items.laxIncense, Items.wideLens, Items.muscleBand, Items.wiseGlasses,
    Items.expertBelt, Items.lightClay, Items.lifeOrb, Items.toxicOrb, Items.flameOrb, Items.zoomLens,
    Items.metronome, Items.ironBall, Items.laggingTail, Items.destinyKnot, Items.blackSludge, Items.icyRock,
    Items.smoothRock, Items.heatRock, Items.dampRock, Items.gripClaw, Items.choiceScarf, Items.stickyBarb,
    Items.shedShell, Items.bigRoot, Items.choiceSpecs, Items.flamePlate, Items.splashPlate, Items.zapPlate,
    Items.meadowPlate, Items.iciclePlate, Items.fistPlate, Items.toxicPlate, Items.earthPlate,
    Items.skyPlate, Items.mindPlate, Items.insectPlate, Items.stonePlate, Items.spookyPlate,
    Items.dracoPlate, Items.dreadPlate, Items.ironPlate, Items.oddIncense, Items.rockIncense,
    Items.fullIncense, Items.waveIncense, Items.roseIncense, Items.razorClaw, Items.razorFang);
    list.push(...consumableHeldItems);
    return list;
}

// An NPC pokemon's nature is generated randomly with IVs during gameplay. Therefore, we do not include
// the flavor berries because, prior to Gen 7, they aren't worth the risk.
export const generalPurposeConsumableItems: number[] = [ Items.cheriBerry, Items.chestoBerry, Items.pechaBerry, Items.rawstBerry, Items.aspearBerry, Items.leppaBerry, Items.oranBerry, Items.persimBerry, Items.lumBerry, Items.sitrusBerry, Items.ganlonBerry, Items.salacBerry, Items.apicotBerry, Items.lansatBerry, Items.starfBerry, Items.enigmaBerry, Items.micleBerry, Items.custapBerry, Items.jabocaBerry, Items.rowapBerry, Items.berryJuice, Items.whiteHerb, Items.mentalHerb, Items.focusSash];

export const generalPurposeItems: number[] = [ Items.brightPowder, Items.quickClaw, Items.kingsRock, Items.focusBand, Items.scopeLens, Items.leftovers, Items.shellBell, Items.laxIncense, Items.wideLens, Items.expertBelt, Items.lifeOrb, Items.zoomLens, Items.destinyKnot, Items.shedShell, Items.razorClaw, Items.razorFang];

// TODO: const typeBoostingItems = initializeTypeBoostingItems();

//     private static Map<Type, List<Integer>> initializeTypeBoostingItems() {
//         Map<Type, List<Integer>> map = new Map();
//         map.set(Type.BUG, Arrays.asList(Items.silverPowder, Items.insectPlate));
//         map.set(Type.DARK, Arrays.asList(Items.blackGlasses, Items.dreadPlate));
//         map.set(Type.DRAGON, Arrays.asList(Items.dragonFang, Items.dracoPlate));
//         map.set(Type.ELECTRIC, Arrays.asList(Items.magnet, Items.zapPlate));
//         map.set(Type.FIGHTING, Arrays.asList(Items.blackBelt, Items.fistPlate));
//         map.set(Type.FIRE, Arrays.asList(Items.charcoal, Items.flamePlate));
//         map.set(Type.FLYING, Arrays.asList(Items.sharpBeak, Items.skyPlate));
//         map.set(Type.GHOST, Arrays.asList(Items.spellTag, Items.spookyPlate));
//         map.set(Type.GRASS, Arrays.asList(Items.miracleSeed, Items.meadowPlate, Items.roseIncense));
//         map.set(Type.GROUND, Arrays.asList(Items.softSand, Items.earthPlate));
//         map.set(Type.ICE, Arrays.asList(Items.neverMeltIce, Items.iciclePlate));
//         map.set(Type.NORMAL, Arrays.asList(Items.silkScarf));
//         map.set(Type.POISON, Arrays.asList(Items.poisonBarb, Items.toxicPlate));
//         map.set(Type.PSYCHIC, Arrays.asList(Items.twistedSpoon, Items.mindPlate, Items.oddIncense));
//         map.set(Type.ROCK, Arrays.asList(Items.hardStone, Items.stonePlate, Items.rockIncense));
//         map.set(Type.STEEL, Arrays.asList(Items.metalCoat, Items.ironPlate));
//         map.set(Type.WATER, Arrays.asList(Items.mysticWater, Items.seaIncense, Items.splashPlate, Items.waveIncense));
//         map.set(null, Collections.emptyList()); // ??? type
//         return Collections.unmodifiableMap(map);
//     }

// TODO: const moveBoostingItems = initializeMoveBoostingItems();

//     private static Map<Integer, List<Integer>> initializeMoveBoostingItems() {
//         Map<Integer, List<Integer>> map = new Map();
//         map.set(Moves.bounce, Arrays.asList(Items.powerHerb));
//         map.set(Moves.dig, Arrays.asList(Items.powerHerb));
//         map.set(Moves.dive, Arrays.asList(Items.powerHerb));
//         map.set(Moves.fly, Arrays.asList(Items.powerHerb));
//         map.set(Moves.razorWind, Arrays.asList(Items.powerHerb));
//         map.set(Moves.skullBash, Arrays.asList(Items.powerHerb));
//         map.set(Moves.skyAttack, Arrays.asList(Items.powerHerb));
//         map.set(Moves.solarBeam, Arrays.asList(Items.powerHerb));
// 
//         map.set(Moves.fling, Arrays.asList(Items.toxicOrb, Items.flameOrb, Items.ironBall));
// 
//         map.set(Moves.trick, Arrays.asList(Items.toxicOrb, Items.flameOrb, Items.fullIncense, Items.laggingTail));
//         map.set(Moves.switcheroo, Arrays.asList(Items.toxicOrb, Items.flameOrb, Items.fullIncense, Items.laggingTail));
// 
//         map.set(Moves.trickRoom, Arrays.asList(Items.ironBall));
// 
//         map.set(Moves.facade, Arrays.asList(Items.toxicOrb, Items.flameOrb));
// 
//         map.set(Moves.psychoShift, Arrays.asList(Items.toxicOrb, Items.flameOrb));
// 
//         map.set(Moves.lightScreen, Arrays.asList(Items.lightClay));
//         map.set(Moves.reflect, Arrays.asList(Items.lightClay));
// 
//         map.set(Moves.hail, Arrays.asList(Items.icyRock));
// 
//         map.set(Moves.sandstorm, Arrays.asList(Items.smoothRock));
// 
//         map.set(Moves.sunnyDay, Arrays.asList(Items.heatRock));
// 
//         map.set(Moves.rainDance, Arrays.asList(Items.dampRock));
// 
//         map.set(Moves.bind, Arrays.asList(Items.gripClaw));
//         map.set(Moves.clamp, Arrays.asList(Items.gripClaw));
//         map.set(Moves.fireSpin, Arrays.asList(Items.gripClaw));
//         map.set(Moves.magmaStorm, Arrays.asList(Items.gripClaw));
//         map.set(Moves.outrage, Arrays.asList(Items.gripClaw));
//         map.set(Moves.sandTomb, Arrays.asList(Items.gripClaw));
//         map.set(Moves.uproar, Arrays.asList(Items.gripClaw));
//         map.set(Moves.whirlpool, Arrays.asList(Items.gripClaw));
//         map.set(Moves.wrap, Arrays.asList(Items.gripClaw));
// 
//         map.set(Moves.absorb, Arrays.asList(Items.bigRoot));
//         map.set(Moves.aquaRing, Arrays.asList(Items.bigRoot));
//         map.set(Moves.drainPunch, Arrays.asList(Items.bigRoot));
//         map.set(Moves.dreamEater, Arrays.asList(Items.bigRoot));
//         map.set(Moves.gigaDrain, Arrays.asList(Items.bigRoot));
//         map.set(Moves.ingrain, Arrays.asList(Items.bigRoot));
//         map.set(Moves.leechLife, Arrays.asList(Items.bigRoot));
//         map.set(Moves.leechSeed, Arrays.asList(Items.bigRoot));
//         map.set(Moves.megaDrain, Arrays.asList(Items.bigRoot));
// 
//         return Collections.unmodifiableMap(map);
//     }

// TODO: const weaknessReducingBerries = initializeWeaknessReducingBerries();

//     private static Map<Type, Integer> initializeWeaknessReducingBerries() {
//         Map<Type, Integer> map = new Map();
//         map.set(Type.FIRE, Items.occaBerry);
//         map.set(Type.WATER, Items.passhoBerry);
//         map.set(Type.ELECTRIC, Items.wacanBerry);
//         map.set(Type.GRASS, Items.rindoBerry);
//         map.set(Type.ICE, Items.yacheBerry);
//         map.set(Type.FIGHTING, Items.chopleBerry);
//         map.set(Type.POISON, Items.kebiaBerry);
//         map.set(Type.GROUND, Items.shucaBerry);
//         map.set(Type.FLYING, Items.cobaBerry);
//         map.set(Type.PSYCHIC, Items.payapaBerry);
//         map.set(Type.BUG, Items.tangaBerry);
//         map.set(Type.ROCK, Items.chartiBerry);
//         map.set(Type.GHOST, Items.kasibBerry);
//         map.set(Type.DRAGON, Items.habanBerry);
//         map.set(Type.DARK, Items.colburBerry);
//         map.set(Type.STEEL, Items.babiriBerry);
//         return Collections.unmodifiableMap(map);
//     }

// TODO: const speciesBoostingItems = initializeSpeciesBoostingItems();

//     private static Map<Integer, List<Integer>> initializeSpeciesBoostingItems() {
//         Map<Integer, List<Integer>> map = new Map();
//         map.set(Species.dialga, Arrays.asList(Items.adamantOrb));
//         map.set(Species.palkia, Arrays.asList(Items.lustrousOrb));
//         map.set(Species.latias, Arrays.asList(Items.soulDew));
//         map.set(Species.latios, Arrays.asList(Items.soulDew));
//         map.set(Species.clamperl, Arrays.asList(Items.deepSeaTooth, Items.deepSeaScale));
//         map.set(Species.pikachu, Arrays.asList(Items.lightBall));
//         map.set(Species.chansey, Arrays.asList(Items.luckyPunch));
//         map.set(Species.ditto, Arrays.asList(Items.metalPowder, Items.quickPowder));
//         map.set(Species.cubone, Arrays.asList(Items.thickClub));
//         map.set(Species.marowak, Arrays.asList(Items.thickClub));
//         map.set(Species.farfetchd, Arrays.asList(Items.leek));
//         return Collections.unmodifiableMap(map);
//     }

// TODO: const abilityBoostingItems = initializeAbilityBoostingItems();

//     private static Map<Integer, List<Integer>> initializeAbilityBoostingItems() {
//         Map<Integer, List<Integer>> map = new Map();
//         map.set(Abilities.guts, Arrays.asList(Items.flameOrb, Items.toxicOrb));
//         map.set(Abilities.magicGuard, Arrays.asList(Items.stickyBarb, Items.lifeOrb));
//         return Collections.unmodifiableMap(map);
//     }

// TODO: const abilityVariations = setupAbilityVariations();

function setupAbilityVariations(): Map<number, number[]> {
    const map = new Map<number, number[]>();
    map.set(Abilities.insomnia, [Abilities.insomnia, Abilities.vitalSpirit]);
    map.set(Abilities.clearBody, [Abilities.clearBody, Abilities.whiteSmoke]);
    map.set(Abilities.hugePower, [Abilities.hugePower, Abilities.purePower]);
    map.set(Abilities.battleArmor, [Abilities.battleArmor, Abilities.shellArmor]);
    map.set(Abilities.cloudNine, [Abilities.cloudNine, Abilities.airLock]);
    map.set(Abilities.filter, [Abilities.filter, Abilities.solidRock]);
    
    return map;
}

// Note: Flower Gift is NOT useless in this generation; it is in this list solely for consistency with future generations.
export const uselessAbilities: number[] = [Abilities.forecast, Abilities.multitype, Abilities.flowerGift];

export const dpptSetVarScript = 0x28;
export const hgssSetVarScript = 0x29;

export const scriptListTerminator = 0xFD13;

export const itemScriptVariable = 0x8008;

const dpShopNames: string[] = [
    "Sunyshore Secondary", "Jubilife Secondary", "Floaroma Secondary",
    "Oreburgh Secondary", "Eterna Secondary", "Eterna Herbs",
    "Snowpoint Secondary", "Solaceon Secondary", "Pastoria Secondary",
    "Celestic Secondary", "Hearthome Secondary", "Canalave Secondary",
    "Veilstone Department Store Secret Base Decorations 1",
    "Veilstone Department Store Secret Base Decorations 2",
    "Veilstone Department Store Vitamins", "Veilstone Department Store TMs 1",
    "Sunyshore Market Seals 1", "Sunyshore Market Seals 2",
    "Sunyshore Market Seals 3", "Sunyshore Market Seals 4",
    "Veilstone Department Store TMs 2", "Sunyshore Market Seals 5",
    "Sunyshore Market Seals 6", "Sunyshore Market Seals 7",
    "Pokemon League Secondary", "Veilstone Department Store X Items",
    "Veilstone Department Store Healing", "Veilstone Department Store Balls Etc.",
    "Progressive Shops",
];

const ptShopNames: string[] = [
    "Jubilife Secondary", "Sunyshore Secondary", "Floaroma Secondary",
    "Oreburgh Secondary", "Eterna Herbs", "Canalave Secondary",
    "Pastoria Secondary", "Celestic Secondary", "Snowpoint Secondary",
    "Solaceon Secondary", "Eterna Secondary", "Hearthome Secondary",
    "Veilstone Department Store B1 Berries",
    "Veilstone Department Store Secret Base Decorations 1",
    "Veilstone Department Store Vitamins",
    "Veilstone Department Store Secret Base Decorations 2",
    "Veilstone Department Store TMs 1", "Sunyshore Market Seals 1",
    "Sunyshore Market Seals 2", "Sunyshore Market Seals 3",
    "Sunyshore Market Seals 4", "Veilstone Department Store TMs 2",
    "Sunyshore Market Seals 5", "Sunyshore Market Seals 6",
    "Sunyshore Market Seals 7", "Pokemon League Secondary",
    "Veilstone Department Store X Items", "Veilstone Department Store Healing",
    "Veilstone Department Store Balls Etc.", "Progressive Shops",
];

const hgssShopNames: string[] = [
    "Cherrygrove Secondary", "Cerulean Secondary", "Ecruteak Secondary",
    "Celadon Department Store Mail", "Saffron Secondary", "Violet Secondary",
    "Blackthorn Secondary", "Olivine Secondary", "Fuchsia Secondary",
    "Lavender Secondary", "Pewter Secondary", "Viridian Secondary",
    "Azalea Secondary", "Mahogany Before Hideout", "Safari Zone Gate Southwest",
    "Goldenrod Herb Shop", "Cianwood Pharmacy",
    "Veilstone Department Store Secret Base Decorations 1",
    "Veilstone Department Store Secret Base Decorations 2",
    "Goldenrod Department Store Vitamins", "Celadon Department Store Vitamins",
    "Mt. Moon Square", "Sunyshore Market Seals 1", "Sunyshore Market Seals 2",
    "Sunyshore Market Seals 3", "Sunyshore Market Seals 4",
    "Sunyshore Market Seals 5", "Sunyshore Market Seals 6",
    "Unused Secondary", "Sunyshore Market Seals 7",
    "Pokeathlon Dome Data Card Shop 25-27", "Goldenrod Department Store X Items",
    "Celadon Department Store X Items", "Mahogany After Hideout",
    "Goldenrod Department Store Healing", "Celadon Department Store Healing",
    "Goldenrod Department Store Balls Etc.", "Goldenrod TMs",
    "Celadon Department Store Balls Etc.", "Celadon TMs",
    "Pokeathlon Dome Athlete Shop Sunday (Pre-National Dex)",
    "Pokeathlon Dome Data Card Shop 19-24", "Pokeathlon Dome Data Card Shop 1-6",
    "Pokeathlon Dome Athlete Shop Monday (Pre-National Dex)",
    "Pokeathlon Dome Athlete Shop Tuesday (Pre-National Dex)",
    "Pokeathlon Dome Data Card Shop 7-12",
    "Pokeathlon Dome Athlete Shop Wednesday (Pre-National Dex)",
    "Pokeathlon Dome Athlete Shop Thursday (Pre-National Dex)",
    "Pokeathlon Dome Athlete Shop Friday (Pre-National Dex)",
    "Pokeathlon Dome Athlete Shop Saturday (Pre-National Dex)",
    "Pokeathlon Dome Data Card Shop 13-18",
    "Pokeathlon Dome Athlete Shop Sunday (Post-National Dex)",
    "Pokeathlon Dome Athlete Shop Monday (Post-National Dex)",
    "Pokeathlon Dome Athlete Shop Tuesday (Post-National Dex)",
    "Pokeathlon Dome Athlete Shop Wednesday (Post-National Dex)",
    "Pokeathlon Dome Athlete Shop Thursday (Post-National Dex)",
    "Pokeathlon Dome Athlete Shop Friday (Post-National Dex)",
    "Pokeathlon Dome Athlete Shop Saturday (Post-National Dex)",
    "Progressive Shops",
];

export function getShopNames(romType: number): string[] {
    if (romType == Type_DP) {
        return dpShopNames;
    } else if (romType == Type_Plat) {
        return ptShopNames;
    } else {
        return hgssShopNames;
    }
}

export const evolutionItems: number[] = [Items.sunStone, Items.moonStone, Items.fireStone, Items.thunderStone, Items.waterStone, Items.leafStone, Items.shinyStone, Items.duskStone, Items.dawnStone, Items.ovalStone, Items.kingsRock, Items.deepSeaTooth, Items.deepSeaScale, Items.metalCoat, Items.dragonScale, Items.upgrade, Items.protector, Items.electirizer, Items.magmarizer, Items.dubiousDisc, Items.reaperCloth, Items.razorClaw, Items.razorFang];

export const formeSuffixes: Map<number, string> = setupFormeSuffixes();
export const formeMappings: Map<number, FormeInfo> = setupFormeMappings();
export const cosmeticForms: Map<number, number> = setupCosmeticForms();

// TODO: const formeSuffixesByBaseForme = setupFormeSuffixesByBaseForme();
// TODO: const dummyFormeSuffixes = setupDummyFormeSuffixes();

// TODO: const absolutePokeNumsByBaseForme = setupAbsolutePokeNumsByBaseForme();
// TODO: const dummyAbsolutePokeNums = setupDummyAbsolutePokeNums();

// TODO: These functions depend on formeSuffixesByBaseForme and absolutePokeNumsByBaseForme which are not yet defined
export function getFormeSuffixByBaseForme(baseForme: number, formNum: number): string {
    // return formeSuffixesByBaseForme.getOrDefault(baseForme,dummyFormeSuffixes).getOrDefault(formNum,"");
    return "";
}

export function getAbsolutePokeNumByBaseForme(baseForme: number, formNum: number): number {
    // return absolutePokeNumsByBaseForme.getOrDefault(baseForme,dummyAbsolutePokeNums).getOrDefault(formNum,baseForme);
    return baseForme;
}

export const lyraEthanMarillSpritePrefix = "274E0604C301274E0704E101274E0804";

export const hgssBigOverworldPokemon: number[] = [
    536, 537, // MMODEL_FOLLOWER_MON_STEELIX, _STEELIX_F
    579, 580, // MMODEL_FOLLOWER_MON_LUGIA, _HO_OH
    651,      // MMODEL_FOLLOWER_MON_WAILORD
    712, 713, 714, // MMODEL_FOLLOWER_MON_KYOGRE, _GROUDON, _RAYQUAZA
    833, 834, 836, 837, 838, // MMODEL_FOLLOWER_MON_DIALGA, _PALKIA, _REGIGIGAS, _GIRATINA, _GIRATINA_ORIGIN
    845, 846, 847, 848, 849, 850, 851, 852, 853, 854, // MMODEL_FOLLOWER_MON_ARCEUS_NORMAL through _MYSTERY
    855, 856, 857, 858, 859, 860, 861, 862             // MMODEL_FOLLOWER_MON_ARCEUS_FIRE through _DARK
];

// Unown alts (to avoid 28x chance of getting Unown)
// Arceus alts (to avoid 18x chance of getting Arceus)
export const hgssBannedOverworldPokemon: number[] = [
    502, 503, 504, 505, 506, 507, 508, 509, 510, 511, // MMODEL_FOLLOWER_MON_UNOWN_B through _K
    512, 513, 514, 515, 516, 517, 518, 519, 520, 521, // MMODEL_FOLLOWER_MON_UNOWN_L through _U
    522, 523, 524, 525, 526, 527, 528,                 // MMODEL_FOLLOWER_MON_UNOWN_V through _EXCL
    846, 847, 848, 849, 850, 851, 852, 853, 854, 855,  // MMODEL_FOLLOWER_MON_ARCEUS_FIGHTING through _FIRE
    856, 857, 858, 859, 860, 861, 862                   // MMODEL_FOLLOWER_MON_ARCEUS_WATER through _DARK
];

export function convertOverworldSpriteToSpecies(overworldSpriteID: number): number {
    let speciesID = overworldSpriteID - 296;

    // Venusaur
    if (overworldSpriteID >= 300) { speciesID -= 1; }
    // Pikachu
    if (overworldSpriteID >= 323) { speciesID -= 1; }
    // Meganium
    if (overworldSpriteID >= 453) { speciesID -= 1; }
    // Pichu
    if (overworldSpriteID >= 472) { speciesID -= 1; }
    // Unown
    if (overworldSpriteID >= 528) { speciesID -= 27; }
    else if (overworldSpriteID > 501) { speciesID -= (overworldSpriteID - 501); }
    // Wobbuffet
    if (overworldSpriteID >= 530) { speciesID -= 1; }
    // Steelix
    if (overworldSpriteID >= 537) { speciesID -= 1; }
    // Heracross
    if (overworldSpriteID >= 544) { speciesID -= 1; }
    // Deoxys
    if (overworldSpriteID >= 719) { speciesID -= 3; }
    else if (overworldSpriteID > 716) { speciesID -= (overworldSpriteID - 716); }
    // Burmy
    if (overworldSpriteID >= 747) { speciesID -= 2; }
    else if (overworldSpriteID > 745) { speciesID -= (overworldSpriteID - 745); }
    // Wormadam
    if (overworldSpriteID >= 750) { speciesID -= 2; }
    else if (overworldSpriteID > 748) { speciesID -= (overworldSpriteID - 748); }
    // Combee
    if (overworldSpriteID >= 753) { speciesID -= 1; }
    // Shellos
    if (overworldSpriteID >= 761) { speciesID -= 1; }
    // Gastrodon
    if (overworldSpriteID >= 763) { speciesID -= 1; }
    // Gible
    if (overworldSpriteID >= 784) { speciesID -= 1; }
    // Gabite
    if (overworldSpriteID >= 786) { speciesID -= 1; }
    // Garchomp
    if (overworldSpriteID >= 788) { speciesID -= 1; }
    // Hippopotas
    if (overworldSpriteID >= 793) { speciesID -= 1; }
    // Hippowdon
    if (overworldSpriteID >= 795) { speciesID -= 1; }
    // Rotom
    if (overworldSpriteID >= 829) { speciesID -= 5; }
    else if (overworldSpriteID > 824) { speciesID -= (overworldSpriteID - 824); }
    // Giratina
    if (overworldSpriteID >= 838) { speciesID -= 1; }
    // Arceus
    if (overworldSpriteID > 845) { speciesID -= (overworldSpriteID - 845); }

    return speciesID;
}

// The original slot each of the 20 "alternate" slots is mapped to
// swarmx2, dayx2, nightx2, pokeradarx4, GBAx10
// NOTE: in the game data there are 6 fillers between pokeradar and GBA

export const dpptAlternateSlots: number[] = [ 0, 1, 2, 3, 2, 3, 4, 5, 10, 11, 8, 9, 8, 9, 8, 9, 8, 9, 8, 9 ];

export const dpptWaterSlotSetNames: string[] = [ "Surfing", "Filler", "Old Rod", "Good Rod", "Super Rod" ];

export const hgssTimeOfDayNames: string[] = [ "Morning", "Day", "Night" ];

export const hgssNonGrassSetNames: string[] = [ "", "Surfing", "Rock Smash", "Old Rod", "Good Rod", "Super Rod" ];
export const hgssGoodRodReplacementIndex = 3;
export const hgssSuperRodReplacementIndex = 1;

// TODO: MoveCategory[] moveCategoryIndices = { MoveCategory.PHYSICAL, MoveCategory.SPECIAL, MoveCategory.STATUS };

export function moveCategoryToByte(cat: MoveCategory): number {
    switch (cat) {
    case MoveCategory.PHYSICAL:
    return 0;
    case MoveCategory.SPECIAL:
    return 1;
    case MoveCategory.STATUS:
    default:
    return 2;
    }
}

export const noDamageSleepEffect = 1;
export const damagePoisonEffect = 2;
export const damageAbsorbEffect = 3;
export const damageBurnEffect = 4;
export const damageFreezeEffect = 5;
export const damageParalyzeEffect = 6;
export const dreamEaterEffect = 8;
export const noDamageAtkPlusOneEffect = 10;
export const noDamageDefPlusOneEffect = 11;
export const noDamageSpAtkPlusOneEffect = 13;
export const noDamageEvasionPlusOneEffect = 16;
export const noDamageAtkMinusOneEffect = 18;
export const noDamageDefMinusOneEffect = 19;
export const noDamageSpeMinusOneEffect = 20;
export const noDamageAccuracyMinusOneEffect = 23;
export const noDamageEvasionMinusOneEffect = 24;
export const flinchEffect = 31;
export const toxicEffect = 33;
export const razorWindEffect = 39;
export const bindingEffect = 42;
export const increasedCritEffect = 43;
export const damageRecoil25PercentEffect = 48;
export const noDamageConfusionEffect = 49;
export const noDamageAtkPlusTwoEffect = 50;
export const noDamageDefPlusTwoEffect = 51;
export const noDamageSpePlusTwoEffect = 52;
export const noDamageSpAtkPlusTwoEffect = 53;
export const noDamageSpDefPlusTwoEffect = 54;
export const noDamageAtkMinusTwoEffect = 58;
export const noDamageDefMinusTwoEffect = 59;
export const noDamageSpeMinusTwoEffect = 60;
export const noDamageSpDefMinusTwoEffect = 62;
export const noDamagePoisonEffect = 66;
export const noDamageParalyzeEffect = 67;
export const damageAtkMinusOneEffect = 68;
export const damageDefMinusOneEffect = 69;
export const damageSpeMinusOneEffect = 70;
export const damageSpAtkMinusOneEffect = 71;
export const damageSpDefMinusOneEffect = 72;
export const damageAccuracyMinusOneEffect = 73;
export const skyAttackEffect = 75;
export const damageConfusionEffect = 76;
export const twineedleEffect = 77;
export const rechargeEffect = 80;
export const snoreEffect = 92;
export const trappingEffect = 106;
export const minimizeEffect = 108;
export const swaggerEffect = 118;
export const damageBurnAndThawUserEffect = 125;
export const damageUserDefPlusOneEffect = 138;
export const damageUserAtkPlusOneEffect = 139;
export const damageUserAllPlusOneEffect = 140;
export const skullBashEffect = 145;
export const twisterEffect = 146;
export const futureSightAndDoomDesireEffect = 148;
export const stompEffect = 150;
export const solarbeamEffect = 151;
export const thunderEffect = 152;
export const flyEffect = 155;
export const defenseCurlEffect = 156;
export const fakeOutEffect = 158;
export const flatterEffect = 166;
export const noDamageBurnEffect = 167;
export const chargeEffect = 174;
export const damageUserAtkAndDefMinusOneEffect = 182;
export const damageRecoil33PercentEffect = 198;
export const teeterDanceEffect = 199;
export const blazeKickEffect = 200;
export const poisonFangEffect = 202;
export const damageUserSpAtkMinusTwoEffect = 204;
export const noDamageAtkAndDefMinusOneEffect = 205;
export const noDamageDefAndSpDefPlusOneEffect = 206;
export const noDamageAtkAndDefPlusOneEffect = 208;
export const damagePoisonWithIncreasedCritEffect = 209;
export const noDamageSpAtkAndSpDefPlusOneEffect = 211;
export const noDamageAtkAndSpePlusOneEffect = 212;
export const damageUserSpeMinusOneEffect = 218;
export const damageUserDefAndSpDefMinusOneEffect = 229;
export const flareBlitzEffect = 253;
export const diveEffect = 255;
export const digEffect = 256;
export const blizzardEffect = 260;
export const voltTackleEffect = 262;
export const bounceEffect = 263;
export const noDamageSpAtkMinusTwoEffect = 265;
export const chatterEffect = 267;
export const damageRecoil50PercentEffect = 269;
export const damageSpDefMinusTwoEffect = 271;
export const shadowForceEffect = 272;
export const fireFangEffect = 273;
export const iceFangEffect = 274;
export const thunderFangEffect = 275;
export const damageUserSpAtkPlusOneEffect = 276;

export const soundMoves: number[] = [Moves.growl, Moves.roar, Moves.sing, Moves.supersonic, Moves.screech, Moves.snore, Moves.uproar, Moves.metalSound, Moves.grassWhistle, Moves.hyperVoice, Moves.bugBuzz, Moves.chatter, Moves.perishSong, Moves.healBell];

export const punchMoves: number[] = [Moves.icePunch, Moves.firePunch, Moves.thunderPunch, Moves.machPunch, Moves.focusPunch, Moves.dizzyPunch, Moves.dynamicPunch, Moves.hammerArm, Moves.megaPunch, Moves.cometPunch, Moves.meteorMash, Moves.shadowPunch, Moves.drainPunch, Moves.bulletPunch, Moves.skyUppercut];

export const dpRequiredFieldTMs: number[] = [2, 3, 5, 9, 12, 19, 23, 28, 34, 39, 41, 43, 46, 47, 49, 50, 62, 69, 79, 80, 82, 84, 85, 87];

export const ptRequiredFieldTMs: number[] = [2, 3, 5, 7, 9, 11, 12, 18, 19, 23, 28, 34, 37, 39, 41, 43, 46, 47, 49, 50, 62, 69, 79, 80, 82, 84, 85, 87];

export const dpptFieldMoves: number[] = [ Moves.cut, Moves.fly, Moves.surf, Moves.strength, Moves.flash, Moves.dig, Moves.teleport, Moves.waterfall, Moves.rockSmash, Moves.sweetScent, Moves.defog, Moves.rockClimb];

export const hgssFieldMoves: number[] = [ Moves.cut, Moves.fly, Moves.surf, Moves.strength, Moves.flash, Moves.dig, Moves.teleport, Moves.whirlpool, Moves.waterfall, Moves.rockSmash, Moves.headbutt, Moves.sweetScent, Moves.rockClimb];

export const dpptEarlyRequiredHMMoves: number[] = [Moves.rockSmash, Moves.cut];

export const hgssEarlyRequiredHMMoves: number[] = [Moves.cut];

//     public static const regularShopItems: number[], opShopItems;
// 
export const shedinjaSpeciesLocator = "492080000090281C0521";

export const ilexForestScriptFile = 92;
export const ilexForestStringsFile = 115;
export const headbuttTutorScriptOffsets: number[] = [0xF55, 0xFC5, 0x100A, 0x104C];

export const doubleBattleFixPrefixDP = "022912D90221214201", doubleBattleFixPrefixPt = "022919D90221214205", doubleBattleFixPrefixHGSS = "2C2815D00221214201";

export const feebasLevelPrefixDPPt = "019813B0F0BD", honeyTreeLevelPrefixDPPt = "F0BDF0B589B0051C0C1C";

export const runningShoesCheckPrefixDPPt = "281C0C24", runningShoesCheckPrefixHGSS = "301C0C24";

export const distortionWorldGroundCheckPrefix = "23D849187944C988090409148F44";

export const dpptIntroPrefixes: string[] = ["381CF8BDC046", "08B0F8BD"];

export const hpBarSpeedPrefix = "0CD106200090", expBarSpeedPrefix = "011C00D101212E6C", bothBarsSpeedPrefix = "70BD90421DDA";

export const dpptEggMoveTablePrefix = "40016601";

export const typeEffectivenessTableLocator = "000505000805";

export const trophyGardenGrassEncounterIndexDP = 304;
export const trophyGardenGrassEncounterIndexPt = 308;
export const marshGrassEncounterIndicesDP: number[] = [76, 82, 88, 94, 100, 102];
export const marshGrassEncounterIndicesPt: number[] = [76, 82, 88, 94, 100, 106];

export const pickupTableLocator = "110012001A000300", rarePickupTableLocator = "19005C00DD00";
export const numberOfCommonPickupItems = 18;
export const numberOfRarePickupItems = 11;

export const friendshipValueForEvoLocator = "DC286AD3";

export const perfectOddsBranchLocator = "FF2901D30425";

export const dpptOverworldDexMaps: number[] = [ 1,  2,  3,  4,  5, -1, -1,  6, -1,  7, // 0-9 (cities, pkmn league, wind/ironworks) -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, // 10-19 (all mt coronet) -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, // 20-29 (mt coronet, great marsh, solaceon ruins) -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, // 30-39 (all solaceon ruins) -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, // 40-49 (solaceon ruins/v.road) -1, -1, -1, -1, -1, -1,  8, -1, -1, -1, // 50-59 (v.road, stark mountain outer then inner, sendoff spring) -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, // 60-69 (unknown, turnback cave) -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, // 70-79 (all turnback cave) -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, // 80-89 (all unknown) -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, // 90-99 (all unknown) -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, // 100-109 (unknown, snowpoint temple) -1, -1, -1, -1, -1, -1, -1, -1,  9, -1, // 110-119 (various dungeons, iron island outer/inner) -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, // 120-129 (rest of iron island inner, old chateau) -1, -1, -1, -1, -1, -1, -1, -1, 10, 11, // 130-139 (old chateau, inner lakes, lakefronts) 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, // 140-149 (first few routes) 22, -1, -1, -1, -1, -1, 23, 24, 25, 26, // 150-159 (route 209 + lost tower, more routes) 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, // 160-169 (routes; 220 is skipped until later)
// TODO: 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, // 170-179 (last few land routes, towns, resort area, first sea route)
// TODO: 47, 48, 49,                             // 180-182 (other sea routes)
];

export const dpptDungeonDexMaps: number[] = [ -1, -1, -1, -1, -1,  1,  1, -1,  2, -1, // 0-9 (cities, pkmn league, wind/ironworks, mine/forest) 3,  3,  3,  3,  3,  3,  3,  3,  3,  3, // 10-19 (all mt coronet) 3,  3,  3,  4,  4,  4,  4,  4,  4,  5, // 20-29 (mt coronet, great marsh, solaceon ruins) 5,  5,  5,  5,  5,  5,  5,  5,  5,  5, // 30-39 (all solaceon ruins) 5,  5,  5,  5,  5,  5,  5,  6,  6,  6, // 40-49 (solaceon ruins/v.road) 6,  6,  6,  7,  8,  8, -1,  9,  9, 10, // 50-59 (v.road, stark mountain outer then inner, sendoff spring) -1, -1, -1, 10, 10, 10, 10, 10, 10, 10, // 60-69 (unknown, turnback cave) 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, // 70-79 (all turnback cave) -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, // 80-89 (all unknown) -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, // 90-99 (all unknown) -1, -1, -1, -1, -1, -1, 11, 11, 11, 11, // 100-109 (unknown, snowpoint temple) 11, 11, 12, 12, 13, 13, 13, 14, -1, 15, // 110-119 (various dungeons, iron island outer/inner) 15, 15, 15, 15, 15, 16, 16, 16, 16, 16, // 120-129 (rest of iron island inner, old chateau) 16, 16, 16, 16, 17, 17, 18, 19, -1, -1, // 130-139 (old chateau, inner lakes, lakefronts) -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, // 140-149 (first few routes) -1, 20, 20, 20, 20, 20, -1, -1, -1, -1, // 150-159 (route 209 + lost tower, more routes) -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, // 160-169 (routes; 220 is skipped until later)
// TODO: -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, // 170-179 (last few land routes, towns, resort area, first sea route)
// TODO: -1, -1, -1,                             // 180-182 (other sea routes)
];

export const hgssOverworldDexMaps: number[] = [
     1,  2,  3,  4,  5,  6, -1, -1,  7, -1, // 0-9 (first few cities/routes, sprout tower + alph)
    -1, -1, -1, -1, -1, -1, -1,  8, -1, -1, // 10-19 (more alph, union cave, r33, slowpoke)
    -1,  9, 10, -1, -1, 11, 12, 13, -1, -1, // 20-29 (ilex, routes, natpark, routes, burned)
    -1, -1, -1, -1, -1, -1, -1, -1, 14, 15, // 30-39 (bell tower, routes)
    16, 17, 18, -1, -1, -1, -1, -1, -1, -1, // 40-49 (olivine, routes, whirl islands, missing slots)
    -1, 19, 20, -1, -1, -1, -1, 21, 22, 23, // 50-59 (missing, cianwood, routes, mortar)
    -1, -1, -1, -1, -1, 24, -1, 25, 26, -1, // 60-69 (ice path, missing, blackthorn, dragons, routes, dark)
    -1, 27, -1, -1, -1, -1, -1, -1, -1, -1, // 70-79 (dark, route 47, moon, seafoam, silver cave)
    -1, -1, -1, -1, -1, 28, -1, -1, -1, -1, // 80-89 (more silver cave, cliff stuff, random bell tower)
    -1, -1, 29, 30, 31, 32, 33, 34, 35, 36, // 90-99 (missing, saf zone, kanto routes/cities)
    37, 38, 39, 40, 41, 42, -1, -1, -1, -1, // 100-109 (more cities, some routes, more moon, RT)
    -1, 43, 44, 45, 46, 47, 48, 49, 50, 51, // 110-119 (vroad, routes 1-9)
    52, 53, 54, 55, 56, 57, 58, 59, 60, 61, // 120-129 (routes 10-21)
    62, 63, -1, -1, -1, -1, 64, -1, -1, -1, // 130-139 (last 2 routes, tohjo, DC, VR, route 2 north, VF, CC)
    -1, -1,                                  // 140-141 (cerulean cave)
];

export const hgssDungeonDexMaps: number[] = [
    -1, -1, -1, -1, -1, -1,  1,  1, -1,  2, // 0-9 (first few cities/routes, sprout tower + alph)
     2,  2,  2,  2,  3,  3,  3, -1,  4,  4, // 10-19 (more alph, union cave, r33, slowpoke)
     5, -1, -1,  6, -1, -1, -1, -1,  7,  7, // 20-29 (ilex, routes, natpark, routes, burned)
     8,  8,  8,  8,  8,  8,  8,  8, -1, -1, // 30-39 (bell tower, routes)
    -1, -1, -1,  9,  9, -1,  9, -1,  9, -1, // 40-49 (olivine, routes, whirl islands, missing slots)
    -1, -1, -1, 10, 10, 10, 10, -1, -1, -1, // 50-59 (missing, cianwood, routes, mortar)
    11, 11, 11, 11, -1, -1, 12, -1, -1, 13, // 60-69 (ice path, missing, blackthorn, dragons, routes, dark)
    13, -1, 14, 14, 15, 15, 15, 15, 15, 16, // 70-79 (dark, route 47, moon, seafoam, silver cave)
    16, 16, 17, 18,  8, -1, 16, 16, 16, 16, // 80-89 (more silver cave, cliff stuff, random bell tower)
    -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, // 90-99 (missing, saf zone, kanto routes/cities)
    -1, -1, -1, -1, -1, -1, 14, 14, 20, 20, // 100-109 (more cities, some routes, more moon, RT)
    21, -1, -1, -1, -1, -1, -1, -1, -1, -1, // 110-119 (vroad, routes 1-9)
    -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, // 120-129 (routes 10-21)
    -1, -1, 22, 23, 21, 21, -1, 24, -1, 25, // 130-139 (last 2 routes, tohjo, DC, VR, route 2 north, VF, CC)
    25, 25,                                  // 140-141 (cerulean cave)
];

export const hgssHeadbuttOverworldDexMaps: number[] = [
    43, 44, 45, 46, 47, 48, 49, 50, 53, 29, // Routes 1-12, skipping 9 and 10
    54, 55, 56, 59, 61, 63, 40, 41, 42,  2, // Routes 13-15, Route 18, Route 22, Routes 25-29
     4,  5,  7,  8,  9, 10, 11, 12, 14, 15, // Routes 30-39
    20, 21, 23, 25, 26, 32, 33, 65, 34, 35, // Routes 42-46, first five Kanto cities
    36, 37,  1,  3,  6, 66, 13, 22, 28, 60, // Remaining Kanto cities, Johto cities, Lake of Rage, Mt Silver, Route 21
    -1, -1, -1, 27, 39, 67, 64, 57, -1,     // National Park, Ilex/Viridian Forest, Routes 47-48, Safari Zone Gate, Routes 2 (north) and 16, Mt Silver Cave
];

export const hgssHeadbuttDungeonDexMaps: number[] = [
    -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, // Routes 1-12, skipping 9 and 10
    -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, // Routes 13-15, Route 18, Route 22, Routes 25-29
    -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, // Routes 30-39
    -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, // Routes 42-46, first five Kanto cities
    -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, // Remaining Kanto cities, Johto cities, Lake of Rage, Mt Silver, Route 21
     6,  5, 24, -1, -1, -1, -1, -1, 16,     // National Park, Ilex/Viridian Forest, Routes 47-48, Safari Zone Gate, Routes 2 (north) and 16, Mt Silver Cave
];

export const pokedexAreaDataSize = 495;
export const dpptMtCoronetDexIndex = 3;
export const dpptGreatMarshDexIndex = 4;
export const dpptTrophyGardenDexIndex = 14;
export const dpptFloaromaMeadowDexIndex = 21;
export const dpptOverworldHoneyTreeDexIndicies: number[] = [6, 7, 17, 18, 19, 20, 21, 22, 23, 24, 26, 27, 28, 29, 30, 31, 34, 36, 37, 50];
export const partnerTrainerIndices: number[] = [608, 609, 610, 611, 612];

let allowedItems: ItemList;
let nonBadItems: ItemList;
let regularShopItems: number[];
let opShopItems: number[];

function rangeClosed(start: number, end: number): number[] {
    const result: number[] = [];
    if (start <= end) {
        for (let i = start; i <= end; i++) result.push(i);
    } else {
        for (let i = start; i >= end; i--) result.push(i);
    }
    return result;
}

setupAllowedItems();

function setupAllowedItems(): void {
    allowedItems = new ItemList(Items.enigmaStone);
    // Key items + version exclusives
    allowedItems.banRange(Items.explorerKit, 109);
    // Unknown blank items or version exclusives
    allowedItems.banRange(Items.griseousOrb, 23);
    // HMs
    allowedItems.banRange(Items.hm01, 8);
    // TMs
    allowedItems.tmRange(Items.tm01, 92);

    // non-bad items
    // ban specific pokemon hold items, berries, apricorns, mail
    nonBadItems = allowedItems.copy();

    nonBadItems.banSingles(Items.oddKeystone, Items.griseousOrb, Items.soulDew, Items.lightBall,
    Items.oranBerry, Items.quickPowder);
    nonBadItems.banRange(Items.shoalSalt,2);
    nonBadItems.banRange(Items.growthMulch, 4); // mulch
    nonBadItems.banRange(Items.adamantOrb, 2); // orbs
    nonBadItems.banRange(Items.mail1, 12); // mails
    nonBadItems.banRange(Items.figyBerry, 25); // berries without useful battle effects
    nonBadItems.banRange(Items.luckyPunch, 4); // pokemon specific
    nonBadItems.banRange(Items.redScarf, 5); // contest scarves

    regularShopItems = [];

    regularShopItems.push(...rangeClosed(Items.ultraBall, Items.pokeBall));
    regularShopItems.push(...rangeClosed(Items.potion, Items.revive));
    regularShopItems.push(...rangeClosed(Items.superRepel, Items.repel));

    opShopItems = [];

    // "Money items" etc
    opShopItems.push(Items.rareCandy);
    opShopItems.push(...rangeClosed(Items.tinyMushroom, Items.nugget));
    opShopItems.push(Items.rareBone);
    opShopItems.push(Items.luckyEgg);
}

export function getDoubleBattleFixPrefix(romType: number): string {
    if (romType == Type_DP) {
    return doubleBattleFixPrefixDP;
    } else if (romType == Type_Plat) {
    return doubleBattleFixPrefixPt;
    } else {
    return doubleBattleFixPrefixHGSS;
    }
}

export function getRunWithoutRunningShoesPrefix(romType: number): string {
    if (romType == Type_DP || romType == Type_Plat) {
    return runningShoesCheckPrefixDPPt;
    } else {
    return runningShoesCheckPrefixHGSS;
    }
}

export function getTrophyGardenGrassEncounterIndex(romType: number): number {
    if (romType == Type_DP) {
    return trophyGardenGrassEncounterIndexDP;
    } else {
    return trophyGardenGrassEncounterIndexPt;
    }
}

export function getMarshGrassEncounterIndices(romType: number): number[] {
    if (romType == Type_DP) {
    return marshGrassEncounterIndicesDP;
    } else {
    return marshGrassEncounterIndicesPt;
    }
}

export function getTextCharsPerLine(romType: number): number {
    if (romType == Type_HGSS) {
    return hgssTextCharsPerLine;
    } else {
    return dpptTextCharsPerLine;
    }
}

export const balancedItemPrices: Map<number, number> = new Map<number, number>([
    [Items.masterBall, 300], [Items.ultraBall, 120], [Items.greatBall, 60], [Items.pokeBall, 20],
    [Items.safariBall, 50], [Items.netBall, 100], [Items.diveBall, 100], [Items.nestBall, 100],
    [Items.repeatBall, 100], [Items.timerBall, 100], [Items.luxuryBall, 100], [Items.premierBall, 20],
    [Items.duskBall, 100], [Items.healBall, 30], [Items.quickBall, 100], [Items.cherishBall, 20],
    [Items.potion, 30], [Items.antidote, 10], [Items.burnHeal, 25], [Items.iceHeal, 25],
    [Items.awakening, 25], [Items.paralyzeHeal, 20], [Items.fullRestore, 300], [Items.maxPotion, 250],
    [Items.hyperPotion, 120], [Items.superPotion, 70], [Items.fullHeal, 60], [Items.revive, 150],
    [Items.maxRevive, 400], [Items.freshWater, 40], [Items.sodaPop, 60], [Items.lemonade, 70],
    [Items.moomooMilk, 80], [Items.energyPowder, 40], [Items.energyRoot, 110], [Items.healPowder, 45],
    [Items.revivalHerb, 280], [Items.ether, 300], [Items.maxEther, 450], [Items.elixir, 1500],
    [Items.maxElixir, 1800], [Items.lavaCookie, 45], [Items.berryJuice, 10], [Items.sacredAsh, 1000],
    [Items.hpUp, 980], [Items.protein, 980], [Items.iron, 980], [Items.carbos, 980],
    [Items.calcium, 980], [Items.rareCandy, 1000], [Items.ppUp, 980], [Items.zinc, 980],
    [Items.ppMax, 2490], [Items.oldGateau, 45], [Items.guardSpec, 70], [Items.direHit, 65],
    [Items.xAttack, 50], [Items.xDefense, 55], [Items.xSpeed, 35], [Items.xAccuracy, 95],
    [Items.xSpAtk, 35], [Items.xSpDef, 35], [Items.pokeDoll, 100], [Items.fluffyTail, 100],
    [Items.blueFlute, 2], [Items.yellowFlute, 2], [Items.redFlute, 2], [Items.blackFlute, 2],
    [Items.whiteFlute, 2], [Items.shoalSalt, 2], [Items.shoalShell, 2], [Items.redShard, 40],
    [Items.blueShard, 40], [Items.yellowShard, 40], [Items.greenShard, 40], [Items.superRepel, 50],
    [Items.maxRepel, 70], [Items.escapeRope, 55], [Items.repel, 35], [Items.sunStone, 300],
    [Items.moonStone, 300], [Items.fireStone, 300], [Items.thunderStone, 300], [Items.waterStone, 300],
    [Items.leafStone, 300], [Items.tinyMushroom, 50], [Items.bigMushroom, 500], [Items.pearl, 140],
    [Items.bigPearl, 750], [Items.stardust, 200], [Items.starPiece, 980], [Items.nugget, 1000],
    [Items.heartScale, 500], [Items.honey, 50], [Items.growthMulch, 20], [Items.dampMulch, 20],
    [Items.stableMulch, 20], [Items.gooeyMulch, 20], [Items.rootFossil, 500], [Items.clawFossil, 500],
    [Items.helixFossil, 500], [Items.domeFossil, 500], [Items.oldAmber, 800], [Items.armorFossil, 500],
    [Items.skullFossil, 500], [Items.rareBone, 1000], [Items.shinyStone, 300], [Items.duskStone, 300],
    [Items.dawnStone, 300], [Items.ovalStone, 300], [Items.oddKeystone, 210], [Items.griseousOrb, 1000],
    [Items.tea, 0], [Items.unused114, 0], [Items.autograph, 0], [Items.douseDrive, 0],
    [Items.shockDrive, 0], [Items.burnDrive, 0], [Items.chillDrive, 0], [Items.unused120, 0],
    [Items.pokemonBox, 0], [Items.medicinePocket, 0], [Items.tmCase, 0], [Items.candyJar, 0],
    [Items.powerUpPocket, 0], [Items.clothingTrunk, 0], [Items.catchingPocket, 0], [Items.battlePocket, 0],
    [Items.unused129, 0], [Items.unused130, 0], [Items.unused131, 0], [Items.unused132, 0],
    [Items.unused133, 0], [Items.sweetHeart, 0], [Items.adamantOrb, 1000], [Items.lustrousOrb, 1000],
    [Items.mail1, 5], [Items.mail2, 5], [Items.mail3, 5], [Items.mail4, 5], [Items.mail5, 5],
    [Items.mail6, 5], [Items.mail7, 5], [Items.mail8, 5], [Items.mail9, 5], [Items.mail10, 5],
    [Items.mail11, 5], [Items.mail12, 5], [Items.cheriBerry, 20], [Items.chestoBerry, 25],
    [Items.pechaBerry, 10], [Items.rawstBerry, 25], [Items.aspearBerry, 25], [Items.leppaBerry, 300],
    [Items.oranBerry, 5], [Items.persimBerry, 20], [Items.lumBerry, 50], [Items.sitrusBerry, 50],
    [Items.figyBerry, 10], [Items.wikiBerry, 10], [Items.magoBerry, 10], [Items.aguavBerry, 10],
    [Items.iapapaBerry, 10], [Items.razzBerry, 50], [Items.blukBerry, 50], [Items.nanabBerry, 50],
    [Items.wepearBerry, 50], [Items.pinapBerry, 50], [Items.pomegBerry, 50], [Items.kelpsyBerry, 50],
    [Items.qualotBerry, 50], [Items.hondewBerry, 50], [Items.grepaBerry, 50], [Items.tamatoBerry, 50],
    [Items.cornnBerry, 50], [Items.magostBerry, 50], [Items.rabutaBerry, 50], [Items.nomelBerry, 50],
    [Items.spelonBerry, 50], [Items.pamtreBerry, 50], [Items.watmelBerry, 50], [Items.durinBerry, 50],
    [Items.belueBerry, 50], [Items.occaBerry, 100], [Items.passhoBerry, 100], [Items.wacanBerry, 100],
    [Items.rindoBerry, 100], [Items.yacheBerry, 100], [Items.chopleBerry, 100], [Items.kebiaBerry, 100],
    [Items.shucaBerry, 100], [Items.cobaBerry, 100], [Items.payapaBerry, 100], [Items.tangaBerry, 100],
    [Items.chartiBerry, 100], [Items.kasibBerry, 100], [Items.habanBerry, 100], [Items.colburBerry, 100],
    [Items.babiriBerry, 100], [Items.chilanBerry, 100], [Items.liechiBerry, 100], [Items.ganlonBerry, 100],
    [Items.salacBerry, 100], [Items.petayaBerry, 100], [Items.apicotBerry, 100], [Items.lansatBerry, 100],
    [Items.starfBerry, 100], [Items.enigmaBerry, 100], [Items.micleBerry, 100], [Items.custapBerry, 100],
    [Items.jabocaBerry, 100], [Items.rowapBerry, 100], [Items.brightPowder, 300], [Items.whiteHerb, 100],
    [Items.machoBrace, 300], [Items.expShare, 600], [Items.quickClaw, 450], [Items.sootheBell, 100],
    [Items.mentalHerb, 100], [Items.choiceBand, 1000], [Items.kingsRock, 500], [Items.silverPowder, 200],
    [Items.amuletCoin, 1500], [Items.cleanseTag, 100], [Items.soulDew, 20], [Items.deepSeaTooth, 300],
    [Items.deepSeaScale, 300], [Items.smokeBall, 20], [Items.everstone, 20], [Items.focusBand, 300],
    [Items.luckyEgg, 1000], [Items.scopeLens, 500], [Items.metalCoat, 300], [Items.leftovers, 1000],
    [Items.dragonScale, 300], [Items.lightBall, 10], [Items.softSand, 200], [Items.hardStone, 200],
    [Items.miracleSeed, 200], [Items.blackGlasses, 200], [Items.blackBelt, 200], [Items.magnet, 200],
    [Items.mysticWater, 200], [Items.sharpBeak, 200], [Items.poisonBarb, 200], [Items.neverMeltIce, 200],
    [Items.spellTag, 200], [Items.twistedSpoon, 200], [Items.charcoal, 200], [Items.dragonFang, 200],
    [Items.silkScarf, 200], [Items.upgrade, 300], [Items.shellBell, 600], [Items.seaIncense, 200],
    [Items.laxIncense, 300], [Items.luckyPunch, 1], [Items.metalPowder, 1], [Items.thickClub, 50],
    [Items.leek, 20], [Items.redScarf, 10], [Items.blueScarf, 10], [Items.pinkScarf, 10],
    [Items.greenScarf, 10], [Items.yellowScarf, 10], [Items.wideLens, 150], [Items.muscleBand, 200],
    [Items.wiseGlasses, 200], [Items.expertBelt, 600], [Items.lightClay, 150], [Items.lifeOrb, 1000],
    [Items.powerHerb, 100], [Items.toxicOrb, 150], [Items.flameOrb, 150], [Items.quickPowder, 1],
    [Items.focusSash, 200], [Items.zoomLens, 150], [Items.metronome, 300], [Items.ironBall, 100],
    [Items.laggingTail, 100], [Items.destinyKnot, 150], [Items.blackSludge, 500], [Items.icyRock, 20],
    [Items.smoothRock, 20], [Items.heatRock, 20], [Items.dampRock, 20], [Items.gripClaw, 150],
    [Items.choiceScarf, 1000], [Items.stickyBarb, 150], [Items.powerBracer, 300], [Items.powerBelt, 300],
    [Items.powerLens, 300], [Items.powerBand, 300], [Items.powerAnklet, 300], [Items.powerWeight, 300],
    [Items.shedShell, 50], [Items.bigRoot, 150], [Items.choiceSpecs, 1000], [Items.flamePlate, 200],
    [Items.splashPlate, 200], [Items.zapPlate, 200], [Items.meadowPlate, 200], [Items.iciclePlate, 200],
    [Items.fistPlate, 200], [Items.toxicPlate, 200], [Items.earthPlate, 200], [Items.skyPlate, 200],
    [Items.mindPlate, 200], [Items.insectPlate, 200], [Items.stonePlate, 200], [Items.spookyPlate, 200],
    [Items.dracoPlate, 200], [Items.dreadPlate, 200], [Items.ironPlate, 200], [Items.oddIncense, 200],
    [Items.rockIncense, 200], [Items.fullIncense, 100], [Items.waveIncense, 200], [Items.roseIncense, 200],
    [Items.luckIncense, 1500], [Items.pureIncense, 100], [Items.protector, 300], [Items.electirizer, 300],
    [Items.magmarizer, 300], [Items.dubiousDisc, 300], [Items.reaperCloth, 300], [Items.razorClaw, 500],
    [Items.razorFang, 500], [Items.tm01, 300], [Items.tm02, 300], [Items.tm03, 300], [Items.tm04, 150],
    [Items.tm05, 100], [Items.tm06, 300], [Items.tm07, 200], [Items.tm08, 150], [Items.tm09, 200],
    [Items.tm10, 200], [Items.tm11, 200], [Items.tm12, 150], [Items.tm13, 300], [Items.tm14, 550],
    [Items.tm15, 750], [Items.tm16, 200], [Items.tm17, 200], [Items.tm18, 200], [Items.tm19, 300],
    [Items.tm20, 200], [Items.tm21, 100], [Items.tm22, 300], [Items.tm23, 300], [Items.tm24, 300],
    [Items.tm25, 550], [Items.tm26, 300], [Items.tm27, 100], [Items.tm28, 200], [Items.tm29, 300],
    [Items.tm30, 300], [Items.tm31, 300], [Items.tm32, 100], [Items.tm33, 200], [Items.tm34, 300],
    [Items.tm35, 300], [Items.tm36, 300], [Items.tm37, 200], [Items.tm38, 550], [Items.tm39, 200],
    [Items.tm40, 300], [Items.tm41, 150], [Items.tm42, 300], [Items.tm43, 200], [Items.tm44, 300],
    [Items.tm45, 300], [Items.tm46, 200], [Items.tm47, 300], [Items.tm48, 300], [Items.tm49, 150],
    [Items.tm50, 550], [Items.tm51, 200], [Items.tm52, 550], [Items.tm53, 300], [Items.tm54, 200],
    [Items.tm55, 300], [Items.tm56, 200], [Items.tm57, 300], [Items.tm58, 200], [Items.tm59, 300],
    [Items.tm60, 300], [Items.tm61, 200], [Items.tm62, 300], [Items.tm63, 200], [Items.tm64, 750],
    [Items.tm65, 300], [Items.tm66, 300], [Items.tm67, 100], [Items.tm68, 750], [Items.tm69, 150],
    [Items.tm70, 100], [Items.tm71, 300], [Items.tm72, 300], [Items.tm73, 200], [Items.tm74, 300],
    [Items.tm75, 150], [Items.tm76, 200], [Items.tm77, 150], [Items.tm78, 150], [Items.tm79, 300],
    [Items.tm80, 300], [Items.tm81, 300], [Items.tm82, 100], [Items.tm83, 200], [Items.tm84, 300],
    [Items.tm85, 300], [Items.tm86, 300], [Items.tm87, 150], [Items.tm88, 300], [Items.tm89, 300],
    [Items.tm90, 200], [Items.tm91, 300], [Items.tm92, 550], [Items.hm01, 0], [Items.hm02, 0],
    [Items.hm03, 0], [Items.hm04, 0], [Items.hm05, 0], [Items.hm06, 0], [Items.hm07, 0],
    [Items.hm08, 0], [Items.explorerKit, 0], [Items.lootSack, 0], [Items.ruleBook, 0],
    [Items.pokeRadar, 0], [Items.pointCard, 0], [Items.journal, 0], [Items.sealCase, 0],
    [Items.fashionCase, 0], [Items.sealBag, 0], [Items.palPad, 0], [Items.worksKey, 0],
    [Items.oldCharm, 0], [Items.galacticKey, 0], [Items.redChain, 0], [Items.townMap, 0],
    [Items.vsSeeker, 0], [Items.coinCase, 0], [Items.oldRod, 0], [Items.goodRod, 0],
    [Items.superRod, 0], [Items.sprayduck, 0], [Items.poffinCase, 0], [Items.bike, 0],
    [Items.suiteKey, 0], [Items.oaksLetter, 0], [Items.lunarWing, 0], [Items.memberCard, 0],
    [Items.azureFlute, 0], [Items.ssTicketJohto, 0], [Items.contestPass, 0], [Items.magmaStone, 0],
    [Items.parcelSinnoh, 0], [Items.coupon1, 0], [Items.coupon2, 0], [Items.coupon3, 0],
    [Items.storageKeySinnoh, 0], [Items.secretPotion, 0], [Items.vsRecorder, 0], [Items.gracidea, 0],
    [Items.secretKeySinnoh, 0], [Items.apricornBox, 0], [Items.unownReport, 0], [Items.berryPots, 0],
    [Items.dowsingMachine, 0], [Items.blueCard, 0], [Items.slowpokeTail, 0], [Items.clearBell, 0],
    [Items.cardKeyJohto, 0], [Items.basementKeyJohto, 0], [Items.squirtBottle, 0], [Items.redScale, 0],
    [Items.lostItem, 0], [Items.pass, 0], [Items.machinePart, 0], [Items.silverWing, 0],
    [Items.rainbowWing, 0], [Items.mysteryEgg, 0], [Items.redApricorn, 2], [Items.blueApricorn, 2],
    [Items.yellowApricorn, 2], [Items.greenApricorn, 2], [Items.pinkApricorn, 2], [Items.whiteApricorn, 2],
    [Items.blackApricorn, 2], [Items.fastBall, 30], [Items.levelBall, 30], [Items.lureBall, 30],
    [Items.heavyBall, 30], [Items.loveBall, 30], [Items.friendBall, 30], [Items.moonBall, 30],
    [Items.sportBall, 30], [Items.parkBall, 0], [Items.photoAlbum, 0], [Items.gbSounds, 0],
    [Items.tidalBell, 0], [Items.rageCandyBar, 0], [Items.dataCard01, 0], [Items.dataCard02, 0],
    [Items.dataCard03, 0], [Items.dataCard04, 0], [Items.dataCard05, 0], [Items.dataCard06, 0],
    [Items.dataCard07, 0], [Items.dataCard08, 0], [Items.dataCard09, 0], [Items.dataCard10, 0],
    [Items.dataCard11, 0], [Items.dataCard12, 0], [Items.dataCard13, 0], [Items.dataCard14, 0],
    [Items.dataCard15, 0], [Items.dataCard16, 0], [Items.dataCard17, 0], [Items.dataCard18, 0],
    [Items.dataCard19, 0], [Items.dataCard20, 0], [Items.dataCard21, 0], [Items.dataCard22, 0],
    [Items.dataCard23, 0], [Items.dataCard24, 0], [Items.dataCard25, 0], [Items.dataCard26, 0],
    [Items.dataCard27, 0], [Items.jadeOrb, 0], [Items.lockCapsule, 0], [Items.redOrb, 0],
    [Items.blueOrb, 0], [Items.enigmaStone, 0],
]);

export const typeTable: (string | null)[] = constructTypeTable();

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
    table[0x0A] = "FIRE";
    table[0x0B] = "WATER";
    table[0x0C] = "GRASS";
    table[0x0D] = "ELECTRIC";
    table[0x0E] = "PSYCHIC";
    table[0x0F] = "ICE";
    table[0x10] = "DRAGON";
    table[0x11] = "DARK";
    return table;
}

export function typeToByte(type: string): number {
    if (type == null) {
    return 0x09; // ???-type
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
    return 0x0A;
    case "WATER":
    return 0x0B;
    case "GRASS":
    return 0x0C;
    case "ELECTRIC":
    return 0x0D;
    case "PSYCHIC":
    return 0x0E;
    case "ICE":
    return 0x0F;
    case "DRAGON":
    return 0x10;
    case "STEEL":
    return 0x08;
    case "DARK":
    return 0x11;
    default:
    return 0; // normal by default
    }
}

export function getFormeCount(romType: number): number {
    if (romType == Type_DP) {
    return dpFormeCount;
    } else if (romType == Type_Plat || romType == Type_HGSS) {
    return platHgSsFormeCount;
    }
    return 0;
}

function setupFormeSuffixes(): Map<number, string> {
    const formeSuffixes = new Map();
    formeSuffixes.set(Species.Gen4Formes.deoxysA + formeOffset,"-A");
    formeSuffixes.set(Species.Gen4Formes.deoxysD + formeOffset,"-D");
    formeSuffixes.set(Species.Gen4Formes.deoxysS + formeOffset,"-S");
    formeSuffixes.set(Species.Gen4Formes.wormadamS + formeOffset,"-S");
    formeSuffixes.set(Species.Gen4Formes.wormadamT + formeOffset,"-T");
    formeSuffixes.set(Species.Gen4Formes.giratinaO + formeOffset,"-O");
    formeSuffixes.set(Species.Gen4Formes.shayminS + formeOffset,"-S");
    formeSuffixes.set(Species.Gen4Formes.rotomH + formeOffset,"-H");
    formeSuffixes.set(Species.Gen4Formes.rotomW + formeOffset,"-W");
    formeSuffixes.set(Species.Gen4Formes.rotomFr + formeOffset,"-Fr");
    formeSuffixes.set(Species.Gen4Formes.rotomFa + formeOffset,"-Fa");
    formeSuffixes.set(Species.Gen4Formes.rotomM + formeOffset,"-M");
    return formeSuffixes;
}

function setupFormeMappings(): Map<number, any> {
    const formeMappings = new Map();
    
    formeMappings.set(Species.Gen4Formes.deoxysA + formeOffset,new FormeInfo(Species.deoxys,1, 0));
    formeMappings.set(Species.Gen4Formes.deoxysD + formeOffset,new FormeInfo(Species.deoxys,2, 0));
    formeMappings.set(Species.Gen4Formes.deoxysS + formeOffset,new FormeInfo(Species.deoxys,3, 0));
    formeMappings.set(Species.Gen4Formes.wormadamS + formeOffset,new FormeInfo(Species.wormadam,1, 0));
    formeMappings.set(Species.Gen4Formes.wormadamT + formeOffset,new FormeInfo(Species.wormadam,2, 0));
    formeMappings.set(Species.Gen4Formes.giratinaO + formeOffset,new FormeInfo(Species.giratina,1, 0));
    formeMappings.set(Species.Gen4Formes.shayminS + formeOffset,new FormeInfo(Species.shaymin,1, 0));
    formeMappings.set(Species.Gen4Formes.rotomH + formeOffset,new FormeInfo(Species.rotom,1, 0));
    formeMappings.set(Species.Gen4Formes.rotomW + formeOffset,new FormeInfo(Species.rotom,2, 0));
    formeMappings.set(Species.Gen4Formes.rotomFr + formeOffset,new FormeInfo(Species.rotom,3, 0));
    formeMappings.set(Species.Gen4Formes.rotomFa + formeOffset,new FormeInfo(Species.rotom,4, 0));
    formeMappings.set(Species.Gen4Formes.rotomM + formeOffset,new FormeInfo(Species.rotom,5, 0));
    
    return formeMappings;
}

function setupCosmeticForms(): Map<number, number> {
    const cosmeticForms = new Map();
    
    cosmeticForms.set(Species.unown, 28);
    cosmeticForms.set(Species.burmy, 3);
    cosmeticForms.set(Species.shellos, 2);
    cosmeticForms.set(Species.gastrodon, 2);
    return cosmeticForms;
}

function setupFormeSuffixesByBaseForme(): Map<number, Map<number, string>> {
    const map = new Map<number, Map<number, string>>();
    
    const deoxysMap = new Map();
    deoxysMap.set(1,"-A");
    deoxysMap.set(2,"-D");
    deoxysMap.set(3,"-S");
    map.set(Species.deoxys,deoxysMap);
    
    const wormadamMap = new Map();
    wormadamMap.set(1,"-S");
    wormadamMap.set(2,"-T");
    map.set(Species.wormadam,wormadamMap);
    
    const shayminMap = new Map();
    shayminMap.set(1,"-S");
    map.set(Species.shaymin,shayminMap);
    
    const giratinaMap = new Map();
    giratinaMap.set(1,"-O");
    map.set(Species.giratina,giratinaMap);
    
    const rotomMap = new Map();
    rotomMap.set(1,"-H");
    rotomMap.set(2,"-W");
    rotomMap.set(3,"-Fr");
    rotomMap.set(4,"-Fa");
    rotomMap.set(5,"-M");
    map.set(Species.rotom,rotomMap);
    
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
    deoxysMap.set(1,Species.Gen4Formes.deoxysA);
    deoxysMap.set(2,Species.Gen4Formes.deoxysD);
    deoxysMap.set(3,Species.Gen4Formes.deoxysS);
    map.set(Species.deoxys, deoxysMap);
    
    const wormadamMap = new Map();
    wormadamMap.set(1,Species.Gen4Formes.wormadamS);
    wormadamMap.set(2,Species.Gen4Formes.wormadamT);
    map.set(Species.wormadam, wormadamMap);
    
    const giratinaMap = new Map();
    giratinaMap.set(1,Species.Gen4Formes.giratinaO);
    map.set(Species.giratina, giratinaMap);
    
    const shayminMap = new Map();
    shayminMap.set(1,Species.Gen4Formes.shayminS);
    map.set(Species.shaymin, shayminMap);
    
    const rotomMap = new Map();
    rotomMap.set(1,Species.Gen4Formes.rotomH);
    rotomMap.set(2,Species.Gen4Formes.rotomW);
    rotomMap.set(3,Species.Gen4Formes.rotomFr);
    rotomMap.set(4,Species.Gen4Formes.rotomFa);
    rotomMap.set(5,Species.Gen4Formes.rotomM);
    map.set(Species.rotom, rotomMap);
    
    return map;
}

function setupDummyAbsolutePokeNums(): Map<number, number> {
    const m = new Map();
    m.set(255,0);
    return m;
}

export function tagTrainersDP(trs: any[]): void {
    // Gym Trainers
    tag(trs, "GYM1", 0xf4, 0xf5);
    tag(trs, "GYM2", 0x144, 0x103, 0x104, 0x15C);
    tag(trs, "GYM3", 0x135, 0x136, 0x137, 0x138);
    tag(trs, "GYM4", 0x1f1, 0x1f2, 0x191, 0x153, 0x125, 0x1E3);
    tag(trs, "GYM5", 0x165, 0x145, 0x10a, 0x14a, 0x154, 0x157, 0x118, 0x11c);
    tag(trs, "GYM6", 0x13a, 0x100, 0x101, 0x117, 0x16f, 0xe8, 0x11b);
    tag(trs, "GYM7", 0x10c, 0x10d, 0x10e, 0x10f, 0x33b, 0x33c);
    tag(trs, "GYM8", 0x158, 0x155, 0x12d, 0x12e, 0x12f, 0x11d, 0x119);
    
    // Gym Leaders
    tagTrainer(trs, 0xf6, "GYM1-LEADER");
    tagTrainer(trs, 0x13b, "GYM2-LEADER");
    tagTrainer(trs, 0x13d, "GYM3-LEADER"); // Maylene
    tagTrainer(trs, 0x13c, "GYM4-LEADER"); // Wake
    tagTrainer(trs, 0x13e, "GYM5-LEADER"); // Fantina
    tagTrainer(trs, 0xfa, "GYM6-LEADER"); // Byron
    tagTrainer(trs, 0x13f, "GYM7-LEADER"); // Candice
    tagTrainer(trs, 0x140, "GYM8-LEADER"); // Volkner
    
    // Elite 4
    tagTrainer(trs, 0x105, "ELITE1");
    tagTrainer(trs, 0x106, "ELITE2");
    tagTrainer(trs, 0x107, "ELITE3");
    tagTrainer(trs, 0x108, "ELITE4");
    tagTrainer(trs, 0x10b, "CHAMPION");
    
    // Rival battles (8)
    tagRivalConsecutive(trs, "RIVAL1", 0xf8);
    tagRivalConsecutive(trs, "RIVAL2", 0x1d7);
    tagRivalConsecutive(trs, "RIVAL3", 0x1da);
    tagRivalConsecutive(trs, "RIVAL4", 0x1dd);
    // Tag battle is not following ze usual format
    tagTrainer(trs, 0x26b, "RIVAL5-0");
    tagTrainer(trs, 0x26c, "RIVAL5-1");
    tagTrainer(trs, 0x25f, "RIVAL5-2");
    // Back to normal
    tagRivalConsecutive(trs, "RIVAL6", 0x1e0);
    tagRivalConsecutive(trs, "RIVAL7", 0x346);
    tagRivalConsecutive(trs, "RIVAL8", 0x349);
    
    // Themed
    tag(trs, "THEMED:CYRUS-LEADER", 0x193, 0x194);
    tag(trs, "THEMED:MARS-STRONG", 0x127, 0x195, 0x210);
    tag(trs, "THEMED:JUPITER-STRONG", 0x196, 0x197);
    tag(trs, "THEMED:SATURN-STRONG", 0x198, 0x199);
    
    // Lucas & Dawn tag battles
    tagFriendConsecutive(trs, "FRIEND1", 0x265);
    tagFriendConsecutive(trs, "FRIEND1", 0x268);
    tagFriendConsecutive2(trs, "FRIEND2", 0x26D);
    tagFriendConsecutive2(trs, "FRIEND2", 0x270);
    
}

export function tagTrainersPt(trs: any[]): void {
    // Gym Trainers
    tag(trs, "GYM1", 0xf4, 0xf5);
    tag(trs, "GYM2", 0x144, 0x103, 0x104, 0x15C);
    tag(trs, "GYM3", 0x165, 0x145, 0x154, 0x157, 0x118, 0x11c);
    tag(trs, "GYM4", 0x135, 0x136, 0x137, 0x138);
    tag(trs, "GYM5", 0x1f1, 0x1f2, 0x191, 0x153, 0x125, 0x1E3);
    tag(trs, "GYM6", 0x13a, 0x100, 0x101, 0x117, 0x16f, 0xe8, 0x11b);
    tag(trs, "GYM7", 0x10c, 0x10d, 0x10e, 0x10f, 0x33b, 0x33c);
    tag(trs, "GYM8", 0x158, 0x155, 0x12d, 0x12e, 0x12f, 0x11d, 0x119, 0x14b);
    
    // Gym Leaders
    tagTrainer(trs, 0xf6, "GYM1-LEADER");
    tagTrainer(trs, 0x13b, "GYM2-LEADER");
    tagTrainer(trs, 0x13e, "GYM3-LEADER"); // Fantina
    tagTrainer(trs, 0x13d, "GYM4-LEADER"); // Maylene
    tagTrainer(trs, 0x13c, "GYM5-LEADER"); // Wake
    tagTrainer(trs, 0xfa, "GYM6-LEADER"); // Byron
    tagTrainer(trs, 0x13f, "GYM7-LEADER"); // Candice
    tagTrainer(trs, 0x140, "GYM8-LEADER"); // Volkner
    
    // Elite 4
    tagTrainer(trs, 0x105, "ELITE1");
    tagTrainer(trs, 0x106, "ELITE2");
    tagTrainer(trs, 0x107, "ELITE3");
    tagTrainer(trs, 0x108, "ELITE4");
    tagTrainer(trs, 0x10b, "CHAMPION");
    
    // Rival battles (10)
    tagRivalConsecutive(trs, "RIVAL1", 0x353);
    tagRivalConsecutive(trs, "RIVAL2", 0xf8);
    tagRivalConsecutive(trs, "RIVAL3", 0x1d7);
    tagRivalConsecutive(trs, "RIVAL4", 0x1da);
    tagRivalConsecutive(trs, "RIVAL5", 0x1dd);
    // Tag battle is not following ze usual format
    tagTrainer(trs, 0x26b, "RIVAL6-0");
    tagTrainer(trs, 0x26c, "RIVAL6-1");
    tagTrainer(trs, 0x25f, "RIVAL6-2");
    // Back to normal
    tagRivalConsecutive(trs, "RIVAL7", 0x1e0);
    tagRivalConsecutive(trs, "RIVAL8", 0x346);
    tagRivalConsecutive(trs, "RIVAL9", 0x349);
    tagRivalConsecutive(trs, "RIVAL10", 0x368);
    
    // Battleground Gym Leaders
    tagTrainer(trs, 0x35A, "GYM1");
    tagTrainer(trs, 0x359, "GYM2");
    tagTrainer(trs, 0x35C, "GYM3");
    tagTrainer(trs, 0x356, "GYM4");
    tagTrainer(trs, 0x35B, "GYM5");
    tagTrainer(trs, 0x358, "GYM6");
    tagTrainer(trs, 0x355, "GYM7");
    tagTrainer(trs, 0x357, "GYM8");
    
    // Match vs Volkner and Flint in Battle Frontier
    tagTrainer(trs, 0x399, "GYM8");
    tagTrainer(trs, 0x39A, "ELITE3");
    
    // E4 rematch
    tagTrainer(trs, 0x362, "ELITE1");
    tagTrainer(trs, 0x363, "ELITE2");
    tagTrainer(trs, 0x364, "ELITE3");
    tagTrainer(trs, 0x365, "ELITE4");
    tagTrainer(trs, 0x366, "CHAMPION");
    
    // Themed
    tag(trs, "THEMED:CYRUS-LEADER", 0x391, 0x193, 0x194);
    tag(trs, "THEMED:MARS-STRONG", 0x127, 0x195, 0x210, 0x39e);
    tag(trs, "THEMED:JUPITER-STRONG", 0x196, 0x197, 0x39f);
    tag(trs, "THEMED:SATURN-STRONG", 0x198, 0x199);
    
    // Lucas & Dawn tag battles
    tagFriendConsecutive(trs, "FRIEND1", 0x265);
    tagFriendConsecutive(trs, "FRIEND1", 0x268);
    tagFriendConsecutive2(trs, "FRIEND2", 0x26D);
    tagFriendConsecutive2(trs, "FRIEND2", 0x270);
    
}

export function tagTrainersHGSS(trs: any[]): void {
    // Gym Trainers
    tag(trs, "GYM1", 0x32, 0x1D);
    tag(trs, "GYM2", 0x43, 0x44, 0x45, 0x0a);
    tag(trs, "GYM3", 0x05, 0x46, 0x47, 0x16);
    tag(trs, "GYM4", 0x1ed, 0x1ee, 0x59, 0x2e);
    tag(trs, "GYM5", 0x9c, 0x9d, 0x9f, 0xfb);
    tag(trs, "GYM7", 0x1e0, 0x1e1, 0x1e2, 0x1e3, 0x1e4);
    tag(trs, "GYM8", 0x6e, 0x6f, 0x70, 0x75, 0x77);
    
    tag(trs, "GYM9", 0x134, 0x2ad);
    tag(trs, "GYM10", 0x2a4, 0x2a5, 0x2a6, 0x129, 0x12a);
    tag(trs, "GYM11", 0x18c, 0xe8, 0x151);
    tag(trs, "GYM12", 0x150, 0x146, 0x164, 0x15a);
    tag(trs, "GYM13", 0x53, 0x54, 0xb7, 0x88);
    tag(trs, "GYM14", 0x170, 0x171, 0xe6, 0x19f);
    tag(trs, "GYM15", 0x2b1, 0x2b2, 0x2b3, 0x2b4, 0x2b5, 0x2b6);
    tag(trs, "GYM16", 0x2a9, 0x2aa, 0x2ab, 0x2ac);
    
    // Gym Leaders
    tagTrainer(trs, 0x14, "GYM1-LEADER");
    tagTrainer(trs, 0x15, "GYM2-LEADER");
    tagTrainer(trs, 0x1e, "GYM3-LEADER");
    tagTrainer(trs, 0x1f, "GYM4-LEADER");
    tagTrainer(trs, 0x22, "GYM5-LEADER");
    tagTrainer(trs, 0x21, "GYM6-LEADER");
    tagTrainer(trs, 0x20, "GYM7-LEADER");
    tagTrainer(trs, 0x23, "GYM8-LEADER");
    
    tagTrainer(trs, 0xFD, "GYM9-LEADER");
    tagTrainer(trs, 0xFE, "GYM10-LEADER");
    tagTrainer(trs, 0xFF, "GYM11-LEADER");
    tagTrainer(trs, 0x100, "GYM12-LEADER");
    tagTrainer(trs, 0x101, "GYM13-LEADER");
    tagTrainer(trs, 0x102, "GYM14-LEADER");
    tagTrainer(trs, 0x103, "GYM15-LEADER");
    tagTrainer(trs, 0x105, "GYM16-LEADER");
    
    // Elite 4
    tagTrainer(trs, 0xf5, "ELITE1");
    tagTrainer(trs, 0xf7, "ELITE2");
    tagTrainer(trs, 0x1a2, "ELITE3");
    tagTrainer(trs, 0xf6, "ELITE4");
    tagTrainer(trs, 0xf4, "CHAMPION");
    
    // Red
    tagTrainer(trs, 0x104, "UBER");
    
    // Gym Rematches
    tagTrainer(trs, 0x2c8, "GYM1-LEADER");
    tagTrainer(trs, 0x2c9, "GYM2-LEADER");
    tagTrainer(trs, 0x2ca, "GYM3-LEADER");
    tagTrainer(trs, 0x2cb, "GYM4-LEADER");
    tagTrainer(trs, 0x2ce, "GYM5-LEADER");
    tagTrainer(trs, 0x2cd, "GYM6-LEADER");
    tagTrainer(trs, 0x2cc, "GYM7-LEADER");
    tagTrainer(trs, 0x2cf, "GYM8-LEADER");
    
    tagTrainer(trs, 0x2d0, "GYM9-LEADER");
    tagTrainer(trs, 0x2d1, "GYM10-LEADER");
    tagTrainer(trs, 0x2d2, "GYM11-LEADER");
    tagTrainer(trs, 0x2d3, "GYM12-LEADER");
    tagTrainer(trs, 0x2d4, "GYM13-LEADER");
    tagTrainer(trs, 0x2d5, "GYM14-LEADER");
    tagTrainer(trs, 0x2d6, "GYM15-LEADER");
    tagTrainer(trs, 0x2d7, "GYM16-LEADER");
    
    // Elite 4 Rematch
    tagTrainer(trs, 0x2be, "ELITE1");
    tagTrainer(trs, 0x2bf, "ELITE2");
    tagTrainer(trs, 0x2c0, "ELITE3");
    tagTrainer(trs, 0x2c1, "ELITE4");
    tagTrainer(trs, 0x2bd, "CHAMPION");
    
    // Rival Battles
    tagRivalConsecutive(trs, "RIVAL1", 0x1F0);
    
    tagTrainer(trs, 0x10a, "RIVAL2-0");
    tagTrainer(trs, 0x10d, "RIVAL2-1");
    tagTrainer(trs, 0x1, "RIVAL2-2");
    
    tagTrainer(trs, 0x10B, "RIVAL3-0");
    tagTrainer(trs, 0x10E, "RIVAL3-1");
    tagTrainer(trs, 0x107, "RIVAL3-2");
    
    tagTrainer(trs, 0x121, "RIVAL4-0");
    tagTrainer(trs, 0x10f, "RIVAL4-1");
    tagTrainer(trs, 0x120, "RIVAL4-2");
    
    tagTrainer(trs, 0x10C, "RIVAL5-0");
    tagTrainer(trs, 0x110, "RIVAL5-1");
    tagTrainer(trs, 0x108, "RIVAL5-2");
    
    tagRivalConsecutive(trs, "RIVAL6", 0x11e);
    tagRivalConsecutive(trs, "RIVAL7", 0x2e0); // dragons den tag battle
    tagRivalConsecutive(trs, "RIVAL8", 0x1EA);
    
    // Clair & Lance match in Dragons Den
    tagTrainer(trs, 0x2DE, "GYM8");
    tagTrainer(trs, 0x2DD, "CHAMPION");
    
    tagTrainer(trs, 0xa0, "KIMONO1-STRONG");
    tagTrainer(trs, 0xa1, "KIMONO2-STRONG");
    tagTrainer(trs, 0xa2, "KIMONO3-STRONG");
    tagTrainer(trs, 0xa3, "KIMONO4-STRONG");
    tagTrainer(trs, 0xa4, "KIMONO5-STRONG");
    
    // Themed
    tag(trs, "THEMED:ARIANA-STRONG", 0x1df, 0x1de);
    tag(trs, "THEMED:PETREL-STRONG", 0x1e8, 0x1e7);
    tag(trs, "THEMED:PROTON-STRONG", 0x1e6, 0x2c2);
    tag(trs, "THEMED:SPROUTTOWER", 0x2b, 0x33, 0x34, 0x35, 0x36, 0x37, 0x122);
    
    tag(trs,"LEADER",485); // Archer
}

function tagTrainer(allTrainers: any[], number: number, tag: string): void {
    allTrainers[number - 1].tag = tag;
}

function tag(allTrainers: any[], tag: string, ...numbers: number[]): void {
    for (const num of numbers) {
    allTrainers[num - 1].tag = tag;
    }
}

function tagRivalConsecutive(allTrainers: any[], tag: string, offsetFire: number): void {
    allTrainers[offsetFire - 1].tag = tag + "-0";
    allTrainers[offsetFire].tag = tag + "-1";
    allTrainers[offsetFire - 2].tag = tag + "-2";
    
}

function tagFriendConsecutive(allTrainers: any[], tag: string, offsetGrass: number): void {
    allTrainers[offsetGrass - 1].tag = tag + "-1";
    allTrainers[offsetGrass].tag = tag + "-2";
    allTrainers[offsetGrass + 1].tag = tag + "-0";
    
}

function tagFriendConsecutive2(allTrainers: any[], tag: string, offsetWater: number): void {
    allTrainers[offsetWater - 1].tag = tag + "-0";
    allTrainers[offsetWater].tag = tag + "-1";
    allTrainers[offsetWater + 1].tag = tag + "-2";
    
}

export function setMultiBattleStatusDP(trs: any[]): void {
    // 407 + 528: Commander Mars and Commander Jupiter Multi Battle on Spear Pillar
    // 414 + 415: Galactic Grunts in Jubilife City
    // 419 + 426: Galactic Grunts in Lake Verity
    // 420 + 427: Galactic Grunts in Lake Verity
    // 521 + 527: Galactic Grunts on Spear Pillar
    // 561 + 590: Double Battle with Dragon Tamer Drake and Black Belt Jarrett
    // 835 + 836: Galactic Grunts in Iron Island
    // 848 + 849: Galactic Grunts in Veilstone City
    setMultiBattleStatus(trs, MultiBattleStatus.ALWAYS, 414, 415, 419, 420, 426, 427, 521, 527,
    528, 561, 590, 835, 836, 848, 849
    );
    
    // 34 + 35: Potential Double Battle with Camper Anthony and Picnicker Lauren
    // 82 + 83: Potential Double Battle with Rich Boy Jason and Lady Melissa
    // 84 + 85: Potential Double Battle with Gentleman Jeremy and Socialite Reina
    // 95 + 96: Potential Double Battle with PKMN Ranger Jeffrey and PKMN Ranger Allison
    // 104 + 106: Potential Double Battle with Swimmer Evan and Swimmer Mary
    // 160 + 494: Potential Double Battle with Swimmer Erik and Swimmer Claire
    // 186 + 191: Potential Double Battle with Swimmer Colton and Swimmer Paige
    // 201 + 204: Potential Double Battle with Bug Catcher Jack and Lass Briana
    // 202 + 203: Potential Double Battle with Bug Catcher Phillip and Bug Catcher Donald
    // 205 + 206: Potential Double Battle with Psychic Elijah and Psychic Lindsey
    // 278 + 287: Potential Double Battle with Ace Trainer Maya and Ace Trainer Dennis
    // 337 + 359: Potential Double Battle with Sailor Marc and Tuber Conner
    // 358 + 360: Potential Double Battle with Tuber Trenton and Tuber Mariel
    // 372 + 445: Potential Double Battle with Battle Girl Tyler and Black Belt Kendal
    // 373 + 386: Potential Double Battle with Bird Keeper Autumn and Dragon Tamer Joe
    // 379 + 459: Potential Double Battle with Camper Diego and Picnicker Ana
    // 383 + 443: Potential Double Battle with Collector Terry and Ruin Maniac Gerald
    // 388 + 392: Potential Double Battle with Ace Trainer Jonah and Ace Trainer Brenda
    // 389 + 393: Potential Double Battle with Ace Trainer Micah and Ace Trainer Brandi
    // 390 + 394: Potential Double Battle with Ace Trainer Arthur and Ace Trainer Clarice
    // 395 + 398: Potential Double Battle with Psychic Kody and Psychic Rachael
    // 396 + 399: Potential Double Battle with Psychic Landon and Psychic Desiree
    // 397 + 400: Potential Double Battle with Psychic Deandre and Psychic Kendra
    // 446 + 499: Potential Double Battle with Black Belt Eddie and Veteran Terrell
    // 447 + 500: Potential Double Battle with Black Belt Willie and Veteran Brenden
    // 450 + 496: Potential Double Battle with Lass Cassidy and Youngster Wayne
    // 452 + 453: Potential Double Battle with Hiker Damon and Hiker Maurice
    // 454 + 455: Potential Double Battle with Hiker Reginald and Hiker Lorenzo
    // 505 + 506: Potential Double Battle with Worker Brendon and Worker Quentin
    // 555 + 560: Potential Double Battle with Bird Keeper Geneva and Dragon Tamer Stanley
    // 556 + 589: Potential Double Battle with Bird Keeper Krystal and Black Belt Ray
    // 562 + 606: Potential Double Battle with Dragon Tamer Kenny and Veteran Harlan
    // 566 + 575: Potential Double Battle with Ace Trainer Felix and Ace Trainer Dana
    // 569 + 579: Potential Double Battle with Ace Trainer Keenan and Ace Trainer Kassandra
    // 570 + 580: Potential Double Battle with Ace Trainer Stefan and Ace Trainer Jasmin
    // 571 + 581: Potential Double Battle with Ace Trainer Skylar and Ace Trainer Natasha
    // 572 + 582: Potential Double Battle with Ace Trainer Abel and Ace Trainer Monique
    // 584 + 586: Potential Double Battle with Psychic Sterling and Psychic Chelsey
    // 591 + 596: Potential Double Battle with PKMN Ranger Kyler and PKMN Ranger Krista
    // 594 + 554/585: Potential Double Battle with PKMN Ranger Ashlee and either Bird Keeper Audrey or Psychic Daisy
    // 599 + 602: Potential Double Battle with Swimmer Sam and Swimmer Sophia
    setMultiBattleStatus(trs, MultiBattleStatus.POTENTIAL, 34, 35, 82, 83, 84, 85, 95, 96, 104,
    106, 160, 186, 191, 201, 202, 203, 204, 205, 206, 278, 287, 337, 358, 359, 360, 372, 373, 379, 383, 386,
    388, 389, 390, 392, 393, 394, 395, 396, 397, 398, 399, 400, 443, 445, 446, 447, 450, 452, 453, 454, 455,
    459, 494, 496, 499, 500, 505, 506, 554, 555, 556, 560, 562, 566, 569, 570, 571, 572, 575, 579, 580, 581,
    582, 584, 585, 586, 589, 591, 594, 596, 599, 602, 606
    );
}

export function setMultiBattleStatusPt(trs: any[]): void {
    // In addition to every single trainer listed in setCouldBeMultiBattleDP...
    // 921 + 922: Elite Four Flint and Leader Volkner Multi Battle in the Fight Area
    setMultiBattleStatus(trs, MultiBattleStatus.ALWAYS, 414, 415, 419, 420, 426, 427, 521, 527,
    528, 561, 590, 835, 836, 848, 849, 921, 922
    );
    setMultiBattleStatus(trs, MultiBattleStatus.POTENTIAL, 34, 35, 82, 83, 84, 85, 95, 96, 104,
    106, 160, 186, 191, 201, 202, 203, 204, 205, 206, 278, 287, 337, 358, 359, 360, 372, 373, 379, 383, 386,
    388, 389, 390, 392, 393, 394, 395, 396, 397, 398, 399, 400, 443, 445, 446, 447, 450, 452, 453, 454, 455,
    459, 494, 496, 499, 500, 505, 506, 554, 555, 556, 560, 562, 566, 569, 570, 571, 572, 575, 579, 580, 581,
    582, 584, 585, 586, 589, 591, 594, 596, 599, 602, 606
    );
}

export function setMultiBattleStatusHGSS(trs: any[]): void {
    // 120 + 417: Double Battle with Ace Trainer Irene and Ace Trainer Jenn
    // 354 + 355: Double Battle with Lass Laura and Lass Shannon
    // 479 + 499: Multi Battle with Executive Ariana and Team Rocket Grunt in Team Rocket HQ
    // 679 + 680: Double Battle with Beauty Callie and Beauty Kassandra
    // 733 + 734: Multi Battle with Champion Lance and Leader Clair in the Dragon's Den
    setMultiBattleStatus(trs, MultiBattleStatus.ALWAYS, 120, 354, 355, 417, 479, 499, 679, 680, 733, 734);
    
    // 147 + 151: Potential Double Battle with Camper Ted and Picnicker Erin
    // 423: Potential Double Battle with Pokéfan Jeremy. His potential teammate (Pokéfan Georgia) has more than
    // three Pokemon in the vanilla game, so we leave her be.
    // 564 + 567: Potential Double Battle with Teacher Clarice and School Kid Torin
    // 575 + 576: Potential Double Battle with Biker Dan and Biker Theron
    // 577 + 579: Potential Double Battle with Biker Markey and Biker Teddy
    setMultiBattleStatus(trs, MultiBattleStatus.POTENTIAL, 147, 151, 423, 564, 567, 575, 576, 577, 579);
}

function setMultiBattleStatus(allTrainers: any[], status: MultiBattleStatus, ...numbers: number[]): void {
    for (const num of numbers) {
    if (allTrainers.length > (num - 1)) {
    allTrainers[num - 1].multiBattleStatus = status;
    }
    }
}

export function getAllowedItems(): ItemList {
    return allowedItems;
}

export function getNonBadItems(): ItemList {
    return nonBadItems;
}

export function getRegularShopItems(): number[] {
    return regularShopItems;
}

export function getOpShopItems(): number[] {
    return opShopItems;
}
