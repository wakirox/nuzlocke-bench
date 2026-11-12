import * as Abilities from './abilities';
import * as Gen3Items from './gen3-items';
import * as Items from './items';
import * as Moves from './moves';
import * as Species from './species';
import { ItemList } from '../pokemon/item-list';
import { MultiBattleStatus } from '../pokemon/trainer';

export const RomType_Ruby = 0;
export const RomType_Sapp = 1;
export const RomType_Em = 2;
export const RomType_FRLG = 3;

export const size8M = 0x800000;
export const size16M = 0x1000000;
export const size32M = 0x2000000;

export const unofficialEmeraldROMName = "YJencrypted";

export const romNameOffset = 0xA0;
export const romCodeOffset = 0xAC;
export const romVersionOffset = 0xBC;
export const headerChecksumOffset = 0xBD;

export const pokemonCount = 386;

export const wildPokemonPointerPrefix = "0348048009E00000FFFF0000";

export const mapBanksPointerPrefix = "80180068890B091808687047";

export const rsPokemonNamesPointerSuffix = "30B50025084CC8F7";

export const frlgMapLabelsPointerPrefix = "AC470000AE470000B0470000";

export const rseMapLabelsPointerPrefix = "C078288030BC01BC00470000";

export const pokedexOrderPointerPrefix = "0448814208D0481C0004000C05E00000";

export const rsFrontSpritesPointerPrefix = "05E0";

export const rsFrontSpritesPointerSuffix = "1068191C";

export const rsPokemonPalettesPointerPrefix = "04D90148006817E0";

export const rsPokemonPalettesPointerSuffix = "080C064A11404840";

export const runningShoesCheckPrefixRS = "0440002C1DD08620", runningShoesCheckPrefixFRLG = "02200540002D29D0", runningShoesCheckPrefixE = "0640002E1BD08C20";

export const efrlgPokemonNamesPointer = 0x144;
export const efrlgMoveNamesPointer = 0x148;
export const efrlgAbilityNamesPointer = 0x1C0;
export const efrlgItemDataPointer = 0x1C8;
export const efrlgMoveDataPointer = 0x1CC;
export const efrlgPokemonStatsPointer = 0x1BC;
export const efrlgFrontSpritesPointer = 0x128;
export const efrlgPokemonPalettesPointer = 0x130;

// TODO: byte[] emptyPokemonSig = new byte[] { 0x32, (byte) 0x96, 0x32, (byte) 0x96, (byte) 0x96, 0x32, 0x00, 0x00, 0x03, 0x01, (byte) 0xAA, 0x0A, 0x00, 0x00, 0x00, 0x00, (byte) 0xFF, 0x78, 0x00, 0x00, 0x0F, 0x0F, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00 };

export const baseStatsEntrySize = 0x1C;

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

export const textTerminator = 0xFF;
export const textVariable = 0xFD;

export const freeSpaceByte = 0xFF;

export const rseStarter2Offset = 2;
export const rseStarter3Offset = 4;
export const frlgStarter2Offset = 515;
export const frlgStarter3Offset = 461;
export const frlgStarterRepeatOffset = 5;

export const frlgBaseStarter1 = 1;
export const frlgBaseStarter2 = 4;
export const frlgBaseStarter3 = 7;

export const frlgStarterItemsOffset = 218;

export const gbaAddRxOpcode = 0x30;
export const gbaUnconditionalJumpOpcode = 0xE0;
export const gbaSetRxOpcode = 0x20;
export const gbaCmpRxOpcode = 0x28;
export const gbaNopOpcode = 0x46C0;

export const gbaR0 = 0;
export const gbaR1 = 1;
export const gbaR2 = 2;
export const gbaR3 = 3;
export const gbaR4 = 4;
export const gbaR5 = 5;
export const gbaR6 = 6;
export const gbaR7 = 7;

export const typeTable: (string | null)[] = constructTypeTable();

export const grassSlots = 12;
export const surfingSlots = 5;
export const rockSmashSlots = 5;
export const fishingSlots = 10;

export const tmCount = 50;
export const hmCount = 8;

export const hmMoves: number[] = [ Moves.cut, Moves.fly, Moves.surf, Moves.strength, Moves.flash, Moves.rockSmash, Moves.waterfall, Moves.dive];

export const tmItemOffset = Gen3Items.tm01;

export const rseItemDescCharsPerLine = 18;
export const frlgItemDescCharsPerLine = 24;

export const regularTextboxCharsPerLine = 36;

export const pointerSearchRadius = 500;

export const itemDataDescriptionOffset = 0x14;

export const deoxysObeyCode = "CD21490088420FD0";

export const mewObeyOffsetFromDeoxysObey = 0x16;

export const levelEvoKantoDexCheckCode = "972814DD";

export const stoneEvoKantoDexCheckCode = "972808D9";

export const levelEvoKantoDexJumpAmount = 0x14;
export const stoneEvoKantoDexJumpAmount = 0x08;

export const rsPokedexScriptIdentifier = "326629010803";

export const rsNatDexScriptPart1 = "31720167";

export const rsNatDexScriptPart2 = "32662901082B00801102006B02021103016B020211DABE4E020211675A6A02022A008003";

export const frlgPokedexScriptIdentifier = "292908258101";

export const frlgNatDexScript = "292908258101256F0103";

export const frlgNatDexFlagChecker = "260D809301210D800100";

export const frlgE4FlagChecker = "2B2C0800000000000000";

export const frlgOaksLabKantoDexChecker = "257D011604800000260D80D400";

export const frlgOaksLabFix = "257D011604800100";

export const frlgOakOutsideHouseCheck = "1604800000260D80D4001908800580190980068083000880830109802109803C";

export const frlgOakOutsideHouseFix = "1604800100";

export const frlgOakAideCheckPrefix = "00B5064800880028";

export const ePokedexScriptIdentifier = "3229610825F00129E40816CD40010003";

export const eNatDexScriptPart1 = "31720167";

export const eNatDexScriptPart2 = "3229610825F00129E40825F30116CD40010003";

export const friendshipValueForEvoLocator = "DB2900D8";

export const perfectOddsBranchLocator = "FE2E2FD90020";

export const unhackedMaxPokedex = 411;
export const unhackedRealPokedex = 386;
export const hoennPokesStart = 252;

export const evolutionMethodCount = 15;

export const cacophonyIndex = 76;
export const airLockIndex = 77;
export const highestAbilityIndex = 77;

export const emMeteorFallsStevenIndex = 804;

// TODO: const abilityVariations = setupAbilityVariations();

function setupAbilityVariations(): Map<number, number[]> {
    const map = new Map<number, number[]>();
    map.set(Abilities.insomnia, [Abilities.insomnia, Abilities.vitalSpirit]);
    map.set(Abilities.clearBody, [Abilities.clearBody, Abilities.whiteSmoke]);
    map.set(Abilities.hugePower, [Abilities.hugePower, Abilities.purePower]);
    map.set(Abilities.battleArmor, [Abilities.battleArmor, Abilities.shellArmor]);
    map.set(Abilities.cloudNine, [Abilities.cloudNine, airLockIndex]);
    
    return map;
}

export const uselessAbilities: number[] = [Abilities.forecast, cacophonyIndex];

export const frlgMapLabelsStart = 0x58;

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
export const flinchWithMinimizeBonusEffect = 150;
export const solarbeamEffect = 151;
export const thunderEffect = 152;
export const semiInvulnerableEffect = 155;
export const defenseCurlEffect = 156;
export const fakeOutEffect = 158;
export const spitUpEffect = 161;
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
export const poisonTailEffect = 209;
export const noDamageSpAtkAndSpDefPlusOneEffect = 211;
export const noDamageAtkAndSpePlusOneEffect = 212;

export const soundMoves: number[] = [Moves.growl, Moves.roar, Moves.sing, Moves.supersonic, Moves.screech, Moves.snore, Moves.uproar, Moves.metalSound, Moves.grassWhistle, Moves.hyperVoice, Moves.perishSong, Moves.healBell];

export const rsRequiredFieldTMs: number[] = [1, 2, 6, 7, 11, 18, 22, 23, 26, 30, 37, 48];

export const eRequiredFieldTMs: number[] = [2, 6, 7, 11, 18, 22, 23, 30, 37, 48];

export const frlgRequiredFieldTMs: number[] = [1, 2, 7, 8, 9, 11, 12, 14, 17, 18, 21, 22, 25, 32, 36, 37, 40, 41, 44, 46, 47, 48, 49, 50];

export const rseFieldMoves: number[] = [ Moves.cut, Moves.fly, Moves.surf, Moves.strength, Moves.flash, Moves.dig, Moves.teleport, Moves.waterfall, Moves.rockSmash, Moves.sweetScent, Moves.dive, Moves.secretPower];

export const frlgFieldMoves: number[] = [ Moves.cut, Moves.fly, Moves.surf, Moves.strength, Moves.flash, Moves.dig, Moves.teleport, Moves.waterfall, Moves.rockSmash, Moves.sweetScent];

export const rseEarlyRequiredHMMoves: number[] = [Moves.rockSmash];

export const frlgEarlyRequiredHMMoves: number[] = [Moves.cut];

const rsShopNames: string[] = [
    "Slateport Vitamins", "Slateport TMs",
    "Oldale Poke Mart (Before Pokedex)", "Oldale Poke Mart (After Pokedex)",
    "Lavaridge Herbs", "Lavaridge Poke Mart", "Fallarbor Poke Mart",
    "Verdanturf Poke Mart", "Petalburg Poke Mart (Before 4 Badges)",
    "Petalburg Poke Mart (After 4 Badges)", "Slateport Poke Mart",
    "Mauville Poke Mart", "Rustboro Poke Mart (Before Delivering Devon Goods)",
    "Rustboro Poke Mart (After Delivering Devon Goods)", "Fortree Poke Mart",
    "Lilycove Department Store 2F Left", "Lilycove Department Store 2F Right",
    "Lilycove Department Store 3F Left", "Lilycove Department Store 3F Right",
    "Lilycove Department Store 4F Left (TMs)", "Lilycove Department Store 4F Right (TMs)",
    "Mossdeep Poke Mart", "Sootopolis Poke Mart", "Pokemon League Poke Mart",
];

const frlgShopNames: string[] = [
    "Trainer Tower Poke Mart",
    "Two Island Market Stall (Initial)", "Two Island Market Stall (After Saving Lostelle)",
    "Two Island Market Stall (After Hall of Fame)", "Two Island Market Stall (After Ruby/Sapphire Quest)",
    "Viridian Poke Mart", "Pewter Poke Mart", "Cerulean Poke Mart",
    "Lavender Poke Mart", "Vermillion Poke Mart",
    "Celadon Department 2F South", "Celadon Department 2F North (TMs)",
    "Celadon Department 4F", "Celadon Department 5F South", "Celadon Department 5F North",
    "Fuchsia Poke Mart", "Cinnabar Poke Mart", "Indigo Plateau Poke Mart",
    "Saffron Poke Mart", "Seven Island Poke Mart", "Three Island Poke Mart",
    "Four Island Poke Mart", "Six Island Poke Mart",
];

const emShopNames: string[] = [
    "Slateport Vitamins", "Slateport TMs",
    "Oldale Poke Mart (Before Pokedex)", "Oldale Poke Mart (After Pokedex)",
    "Lavaridge Herbs", "Lavaridge Poke Mart", "Fallarbor Poke Mart",
    "Verdanturf Poke Mart", "Petalburg Poke Mart (Before 4 Badges)",
    "Petalburg Poke Mart (After 4 Badges)", "Slateport Poke Mart",
    "Mauville Poke Mart", "Rustboro Poke Mart (Before Delivering Devon Goods)",
    "Rustboro Poke Mart (After Delivering Devon Goods)", "Fortree Poke Mart",
    "Lilycove Department Store 2F Left", "Lilycove Department Store 2F Right",
    "Lilycove Department Store 3F Left", "Lilycove Department Store 3F Right",
    "Lilycove Department Store 4F Left (TMs)", "Lilycove Department Store 4F Right (TMs)",
    "Mossdeep Poke Mart", "Sootopolis Poke Mart", "Pokemon League Poke Mart",
    "Battle Frontier Poke Mart", "Trainer Hill Poke Mart (Before Hall of Fame)",
    "Trainer Hill Poke Mart (After Hall of Fame)",
];

export function getShopNames(romType: number): string[] {
    if (romType === RomType_Ruby || romType === RomType_Sapp) {
        return rsShopNames;
    } else if (romType === RomType_FRLG) {
        return frlgShopNames;
    } else {
        return emShopNames;
    }
}

export const evolutionItems: number[] = [Gen3Items.sunStone, Gen3Items.moonStone, Gen3Items.fireStone, Gen3Items.thunderstone, Gen3Items.waterStone, Gen3Items.leafStone];

export const xItems: number[] = [Gen3Items.guardSpec, Gen3Items.direHit, Gen3Items.xAttack, Gen3Items.xDefend, Gen3Items.xSpeed, Gen3Items.xAccuracy, Gen3Items.xSpecial];

export const consumableHeldItems: number[] = [ Gen3Items.cheriBerry, Gen3Items.chestoBerry, Gen3Items.pechaBerry, Gen3Items.rawstBerry, Gen3Items.rawstBerry, Gen3Items.leppaBerry, Gen3Items.oranBerry, Gen3Items.persimBerry, Gen3Items.lumBerry, Gen3Items.sitrusBerry, Gen3Items.figyBerry, Gen3Items.wikiBerry, Gen3Items.magoBerry, Gen3Items.aguavBerry, Gen3Items.iapapaBerry, Gen3Items.liechiBerry, Gen3Items.ganlonBerry, Gen3Items.salacBerry, Gen3Items.petayaBerry, Gen3Items.apicotBerry, Gen3Items.lansatBerry, Gen3Items.starfBerry, Gen3Items.berryJuice, Gen3Items.whiteHerb, Gen3Items.mentalHerb];

export const allHeldItems: number[] = setupAllHeldItems();

function setupAllHeldItems(): number[] {
    const list: number[] = [];
    list.push(Gen3Items.brightPowder, Gen3Items.quickClaw, Gen3Items.choiceBand,
    Gen3Items.kingsRock, Gen3Items.silverPowder, Gen3Items.focusBand, Gen3Items.scopeLens,
    Gen3Items.metalCoat, Gen3Items.leftovers, Gen3Items.softSand, Gen3Items.hardStone,
    Gen3Items.miracleSeed, Gen3Items.blackGlasses, Gen3Items.blackBelt, Gen3Items.magnet,
    Gen3Items.mysticWater, Gen3Items.sharpBeak, Gen3Items.poisonBarb, Gen3Items.neverMeltIce,
    Gen3Items.spellTag, Gen3Items.twistedSpoon, Gen3Items.charcoal, Gen3Items.dragonFang,
    Gen3Items.silkScarf, Gen3Items.shellBell, Gen3Items.seaIncense, Gen3Items.laxIncense);
    list.push(...consumableHeldItems);
    return list;
}

// An NPC pokemon's nature is generated randomly with IVs during gameplay. Therefore, we do not include
// the flavor berries because, prior to Gen 7, they aren't worth the risk.
export const generalPurposeConsumableItems: number[] = [ Gen3Items.cheriBerry, Gen3Items.chestoBerry, Gen3Items.pechaBerry, Gen3Items.rawstBerry, Gen3Items.aspearBerry, Gen3Items.leppaBerry, Gen3Items.oranBerry, Gen3Items.persimBerry, Gen3Items.lumBerry, Gen3Items.sitrusBerry, Gen3Items.ganlonBerry, Gen3Items.salacBerry, Gen3Items.apicotBerry, Gen3Items.lansatBerry, Gen3Items.starfBerry, Gen3Items.berryJuice, Gen3Items.whiteHerb, Gen3Items.mentalHerb ];

export const generalPurposeItems: number[] = [ Gen3Items.brightPowder, Gen3Items.quickClaw, Gen3Items.kingsRock, Gen3Items.focusBand, Gen3Items.scopeLens, Gen3Items.leftovers, Gen3Items.shellBell, Gen3Items.laxIncense ];

// TODO: const typeBoostingItems = initializeTypeBoostingItems();

//     private static Map<Type, List<Integer>> initializeTypeBoostingItems() {
//         Map<Type, List<Integer>> map = new Map();
//         map.set(Type.BUG, Arrays.asList(Gen3Items.silverPowder));
//         map.set(Type.DARK, Arrays.asList(Gen3Items.blackGlasses));
//         map.set(Type.DRAGON, Arrays.asList(Gen3Items.dragonFang));
//         map.set(Type.ELECTRIC, Arrays.asList(Gen3Items.magnet));
//         map.set(Type.FIGHTING, Arrays.asList(Gen3Items.blackBelt));
//         map.set(Type.FIRE, Arrays.asList(Gen3Items.charcoal));
//         map.set(Type.FLYING, Arrays.asList(Gen3Items.sharpBeak));
//         map.set(Type.GHOST, Arrays.asList(Gen3Items.spellTag));
//         map.set(Type.GRASS, Arrays.asList(Gen3Items.miracleSeed));
//         map.set(Type.GROUND, Arrays.asList(Gen3Items.softSand));
//         map.set(Type.ICE, Arrays.asList(Gen3Items.neverMeltIce));
//         map.set(Type.NORMAL, Arrays.asList(Gen3Items.silkScarf));
//         map.set(Type.POISON, Arrays.asList(Gen3Items.poisonBarb));
//         map.set(Type.PSYCHIC, Arrays.asList(Gen3Items.twistedSpoon));
//         map.set(Type.ROCK, Arrays.asList(Gen3Items.hardStone));
//         map.set(Type.STEEL, Arrays.asList(Gen3Items.metalCoat));
//         map.set(Type.WATER, Arrays.asList(Gen3Items.mysticWater, Gen3Items.seaIncense));
//         map.set(null, Collections.emptyList()); // ??? type
//         return Collections.unmodifiableMap(map);
//     }

// TODO: const speciesBoostingItems = initializeSpeciesBoostingItems();

//     private static Map<Integer, List<Integer>> initializeSpeciesBoostingItems() {
//         Map<Integer, List<Integer>> map = new Map();
//         map.set(Species.latias, Arrays.asList(Gen3Items.soulDew));
//         map.set(Species.latios, Arrays.asList(Gen3Items.soulDew));
//         map.set(Species.clamperl, Arrays.asList(Gen3Items.deepSeaTooth, Gen3Items.deepSeaScale));
//         map.set(Species.pikachu, Arrays.asList(Gen3Items.lightBall));
//         map.set(Species.chansey, Arrays.asList(Gen3Items.luckyPunch));
//         map.set(Species.ditto, Arrays.asList(Gen3Items.metalPowder));
//         map.set(Species.cubone, Arrays.asList(Gen3Items.thickClub));
//         map.set(Species.marowak, Arrays.asList(Gen3Items.thickClub));
//         map.set(Species.farfetchd, Arrays.asList(Gen3Items.stick));
//         return Collections.unmodifiableMap(map);
//     }

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

//     public static const regularShopItems: number[], opShopItems;
// 

export function getRunningShoesCheckPrefix(romType: number): string {
    if (romType == RomType_Ruby || romType == RomType_Sapp) {
    return runningShoesCheckPrefixRS;
    } else if (romType == RomType_FRLG) {
    return runningShoesCheckPrefixFRLG;
    } else {
    return runningShoesCheckPrefixE;
    }
}

let allowedItems: ItemList;
let nonBadItemsRSE: ItemList;
let nonBadItemsFRLG: ItemList;
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
    allowedItems = new ItemList(Gen3Items.oldSeaMap);
    // Key items (+1 unknown item)
    allowedItems.banRange(Gen3Items.machBike, 30);
    allowedItems.banRange(Gen3Items.oaksParcel, 28);
    // Unknown blank items
    allowedItems.banRange(Gen3Items.unknown52, 11);
    allowedItems.banRange(Gen3Items.unknown87, 6);
    allowedItems.banRange(Gen3Items.unknown99, 4);
    allowedItems.banRange(Gen3Items.unknown112, 9);
    allowedItems.banRange(Gen3Items.unknown176, 3);
    allowedItems.banRange(Gen3Items.unknown226, 28);
    allowedItems.banRange(Gen3Items.unknown347, 2);
    allowedItems.banSingles(Gen3Items.unknown72, Gen3Items.unknown82, Gen3Items.unknown105, Gen3Items.unknown267);
    // HMs
    allowedItems.banRange(Gen3Items.hm01, 8);
    // TMs
    allowedItems.tmRange(Gen3Items.tm01, 50);

    // non-bad items
    // ban specific pokemon hold items, berries, apricorns, mail
    nonBadItemsRSE = allowedItems.copy();
    nonBadItemsRSE.banSingles(Gen3Items.lightBall, Gen3Items.oranBerry, Gen3Items.soulDew);
    nonBadItemsRSE.banRange(Gen3Items.orangeMail, 12); // mail
    nonBadItemsRSE.banRange(Gen3Items.figyBerry, 33); // berries
    nonBadItemsRSE.banRange(Gen3Items.luckyPunch, 4); // pokemon specific
    nonBadItemsRSE.banRange(Gen3Items.redScarf, 5); // contest scarves

    // FRLG-exclusive bad items
    // Ban Shoal items and Shards, since they don't do anything
    nonBadItemsFRLG = nonBadItemsRSE.copy();
    nonBadItemsFRLG.banRange(Gen3Items.shoalSalt, 6);

    regularShopItems = [];

    regularShopItems.push(...rangeClosed(Gen3Items.ultraBall, Gen3Items.pokeBall));
    regularShopItems.push(...rangeClosed(Gen3Items.potion, Gen3Items.revive));
    regularShopItems.push(...rangeClosed(Gen3Items.superRepel, Gen3Items.repel));

    opShopItems = [];

    // "Money items" etc
    opShopItems.push(Gen3Items.rareCandy);
    opShopItems.push(...rangeClosed(Gen3Items.tinyMushroom, Gen3Items.bigMushroom));
    opShopItems.push(...rangeClosed(Gen3Items.pearl, Gen3Items.nugget));
    opShopItems.push(Gen3Items.luckyEgg);
}

export function getAllowedItems(): ItemList {
    return allowedItems;
}

export function getRegularShopItems(): number[] {
    return regularShopItems;
}

export function getOPShopItems(): number[] {
    return opShopItems;
}

export function getNonBadItems(romType: number): ItemList {
    if (romType == RomType_FRLG) {
    return nonBadItemsFRLG;
    } else {
    return nonBadItemsRSE;
    }
}

export function trainerTagsRS(trs: any[], romType: number): void {
    // Gym Trainers
    tag(trs, "GYM1", 0x140, 0x141);
    tag(trs, "GYM2", 0x1AA, 0x1A9, 0xB3);
    tag(trs, "GYM3", 0xBF, 0x143, 0xC2, 0x289);
    tag(trs, "GYM4", 0xC9, 0x288, 0xCB, 0x28A, 0xCD);
    tag(trs, "GYM5", 0x47, 0x59, 0x49, 0x5A, 0x48, 0x5B, 0x4A);
    tag(trs, "GYM6", 0x191, 0x28F, 0x28E, 0x194);
    tag(trs, "GYM7", 0xE9, 0xEA, 0xEB, 0xF4, 0xF5, 0xF6);
    tag(trs, "GYM8", 0x82, 0x266, 0x83, 0x12D, 0x81, 0x74, 0x80, 0x265);
    
    // Gym Leaders
    tagTrainer(trs, 0x109, "GYM1-LEADER");
    tagTrainer(trs, 0x10A, "GYM2-LEADER");
    tagTrainer(trs, 0x10B, "GYM3-LEADER");
    tagTrainer(trs, 0x10C, "GYM4-LEADER");
    tagTrainer(trs, 0x10D, "GYM5-LEADER");
    tagTrainer(trs, 0x10E, "GYM6-LEADER");
    tagTrainer(trs, 0x10F, "GYM7-LEADER");
    tagTrainer(trs, 0x110, "GYM8-LEADER");
    // Elite 4
    tagTrainer(trs, 0x105, "ELITE1");
    tagTrainer(trs, 0x106, "ELITE2");
    tagTrainer(trs, 0x107, "ELITE3");
    tagTrainer(trs, 0x108, "ELITE4");
    tagTrainer(trs, 0x14F, "CHAMPION");
    // Brendan
    tagTrainer(trs, 0x208, "RIVAL1-2");
    tagTrainer(trs, 0x20B, "RIVAL1-0");
    tagTrainer(trs, 0x20E, "RIVAL1-1");
    
    tagTrainer(trs, 0x209, "RIVAL2-2");
    tagTrainer(trs, 0x20C, "RIVAL2-0");
    tagTrainer(trs, 0x20F, "RIVAL2-1");
    
    tagTrainer(trs, 0x20A, "RIVAL3-2");
    tagTrainer(trs, 0x20D, "RIVAL3-0");
    tagTrainer(trs, 0x210, "RIVAL3-1");
    
    tagTrainer(trs, 0x295, "RIVAL4-2");
    tagTrainer(trs, 0x296, "RIVAL4-0");
    tagTrainer(trs, 0x297, "RIVAL4-1");
    
    // May
    tagTrainer(trs, 0x211, "RIVAL1-2");
    tagTrainer(trs, 0x214, "RIVAL1-0");
    tagTrainer(trs, 0x217, "RIVAL1-1");
    
    tagTrainer(trs, 0x212, "RIVAL2-2");
    tagTrainer(trs, 0x215, "RIVAL2-0");
    tagTrainer(trs, 0x218, "RIVAL2-1");
    
    tagTrainer(trs, 0x213, "RIVAL3-2");
    tagTrainer(trs, 0x216, "RIVAL3-0");
    tagTrainer(trs, 0x219, "RIVAL3-1");
    
    tagTrainer(trs, 0x298, "RIVAL4-2");
    tagTrainer(trs, 0x299, "RIVAL4-0");
    tagTrainer(trs, 0x29A, "RIVAL4-1");
    
    // Wally
    tag(trs, "THEMED:WALLY-STRONG", 0x207, 0x290, 0x291, 0x292, 0x293, 0x294);
    
    if (romType == RomType_Ruby) {
    tag(trs, "THEMED:MAXIE-LEADER", 0x259, 0x25A);
    tag(trs, "THEMED:COURTNEY-STRONG", 0x257, 0x258);
    tag(trs, "THEMED:TABITHA-STRONG", 0x254, 0x255);
    } else {
    tag(trs, "THEMED:ARCHIE-LEADER", 0x23, 0x22);
    tag(trs, "THEMED:MATT-STRONG", 0x1E, 0x1F);
    tag(trs, "THEMED:SHELLY-STRONG", 0x20, 0x21);
    }
    
}

export function trainerTagsE(trs: any[]): void {
    // Gym Trainers
    tag(trs, "GYM1", 0x140, 0x141, 0x23B);
    tag(trs, "GYM2", 0x1AA, 0x1A9, 0xB3, 0x23C, 0x23D, 0x23E);
    tag(trs, "GYM3", 0xBF, 0x143, 0xC2, 0x289, 0x322);
    tag(trs, "GYM4", 0x288, 0xC9, 0xCB, 0x28A, 0xCA, 0xCC, 0x1F5, 0xCD);
    tag(trs, "GYM5", 0x47, 0x59, 0x49, 0x5A, 0x48, 0x5B, 0x4A);
    tag(trs, "GYM6", 0x192, 0x28F, 0x191, 0x28E, 0x194, 0x323);
    tag(trs, "GYM7", 0xE9, 0xEA, 0xEB, 0xF4, 0xF5, 0xF6, 0x24F, 0x248, 0x247, 0x249, 0x246, 0x23F);
    tag(trs, "GYM8", 0x265, 0x80, 0x1F6, 0x73, 0x81, 0x76, 0x82, 0x12D, 0x83, 0x266);
    
    // Gym Leaders + Emerald Rematches!
    tag(trs, "GYM1-LEADER", 0x109, 0x302, 0x303, 0x304, 0x305);
    tag(trs, "GYM2-LEADER", 0x10A, 0x306, 0x307, 0x308, 0x309);
    tag(trs, "GYM3-LEADER", 0x10B, 0x30A, 0x30B, 0x30C, 0x30D);
    tag(trs, "GYM4-LEADER", 0x10C, 0x30E, 0x30F, 0x310, 0x311);
    tag(trs, "GYM5-LEADER", 0x10D, 0x312, 0x313, 0x314, 0x315);
    tag(trs, "GYM6-LEADER", 0x10E, 0x316, 0x317, 0x318, 0x319);
    tag(trs, "GYM7-LEADER", 0x10F, 0x31A, 0x31B, 0x31C, 0x31D);
    tag(trs, "GYM8-LEADER", 0x110, 0x31E, 0x31F, 0x320, 0x321);
    
    // Elite 4
    tagTrainer(trs, 0x105, "ELITE1");
    tagTrainer(trs, 0x106, "ELITE2");
    tagTrainer(trs, 0x107, "ELITE3");
    tagTrainer(trs, 0x108, "ELITE4");
    tagTrainer(trs, 0x14F, "CHAMPION");
    
    // Brendan
    tagTrainer(trs, 0x208, "RIVAL1-2");
    tagTrainer(trs, 0x20B, "RIVAL1-0");
    tagTrainer(trs, 0x20E, "RIVAL1-1");
    
    tagTrainer(trs, 0x251, "RIVAL2-2");
    tagTrainer(trs, 0x250, "RIVAL2-0");
    tagTrainer(trs, 0x257, "RIVAL2-1");
    
    tagTrainer(trs, 0x209, "RIVAL3-2");
    tagTrainer(trs, 0x20C, "RIVAL3-0");
    tagTrainer(trs, 0x20F, "RIVAL3-1");
    
    tagTrainer(trs, 0x20A, "RIVAL4-2");
    tagTrainer(trs, 0x20D, "RIVAL4-0");
    tagTrainer(trs, 0x210, "RIVAL4-1");
    
    tagTrainer(trs, 0x295, "RIVAL5-2");
    tagTrainer(trs, 0x296, "RIVAL5-0");
    tagTrainer(trs, 0x297, "RIVAL5-1");
    
    // May
    tagTrainer(trs, 0x211, "RIVAL1-2");
    tagTrainer(trs, 0x214, "RIVAL1-0");
    tagTrainer(trs, 0x217, "RIVAL1-1");
    
    tagTrainer(trs, 0x258, "RIVAL2-2");
    tagTrainer(trs, 0x300, "RIVAL2-0");
    tagTrainer(trs, 0x301, "RIVAL2-1");
    
    tagTrainer(trs, 0x212, "RIVAL3-2");
    tagTrainer(trs, 0x215, "RIVAL3-0");
    tagTrainer(trs, 0x218, "RIVAL3-1");
    
    tagTrainer(trs, 0x213, "RIVAL4-2");
    tagTrainer(trs, 0x216, "RIVAL4-0");
    tagTrainer(trs, 0x219, "RIVAL4-1");
    
    tagTrainer(trs, 0x298, "RIVAL5-2");
    tagTrainer(trs, 0x299, "RIVAL5-0");
    tagTrainer(trs, 0x29A, "RIVAL5-1");
    
    // Themed
    tag(trs, "THEMED:MAXIE-LEADER", 0x259, 0x25A, 0x2DE);
    tag(trs, "THEMED:TABITHA-STRONG", 0x202, 0x255, 0x2DC);
    tag(trs, "THEMED:ARCHIE-LEADER", 0x22);
    tag(trs, "THEMED:MATT-STRONG", 0x1E);
    tag(trs, "THEMED:SHELLY-STRONG", 0x20, 0x21);
    tag(trs, "THEMED:WALLY-STRONG", 0x207, 0x290, 0x291, 0x292, 0x293, 0x294);
    
    // Steven
    tag(trs, "UBER", emMeteorFallsStevenIndex);
    
}

export function trainerTagsFRLG(trs: any[]): void {
    
    // Gym Trainers
    tag(trs, "GYM1", 0x8E);
    tag(trs, "GYM2", 0xEA, 0x96);
    tag(trs, "GYM3", 0xDC, 0x8D, 0x1A7);
    tag(trs, "GYM4", 0x10A, 0x84, 0x109, 0xA0, 0x192, 0x10B, 0x85);
    tag(trs, "GYM5", 0x125, 0x124, 0x120, 0x127, 0x126, 0x121);
    tag(trs, "GYM6", 0x11A, 0x119, 0x1CF, 0x11B, 0x1CE, 0x1D0, 0x118);
    tag(trs, "GYM7", 0xD5, 0xB1, 0xB2, 0xD6, 0xB3, 0xD7, 0xB4);
    tag(trs, "GYM8", 0x129, 0x143, 0x188, 0x190, 0x142, 0x128, 0x191, 0x144);
    
    // Gym Leaders
    tagTrainer(trs, 0x19E, "GYM1-LEADER");
    tagTrainer(trs, 0x19F, "GYM2-LEADER");
    tagTrainer(trs, 0x1A0, "GYM3-LEADER");
    tagTrainer(trs, 0x1A1, "GYM4-LEADER");
    tagTrainer(trs, 0x1A2, "GYM5-LEADER");
    tagTrainer(trs, 0x1A4, "GYM6-LEADER");
    tagTrainer(trs, 0x1A3, "GYM7-LEADER");
    tagTrainer(trs, 0x15E, "GYM8-LEADER");
    
    // Giovanni
    tagTrainer(trs, 0x15C, "GIO1-LEADER");
    tagTrainer(trs, 0x15D, "GIO2-LEADER");
    
    // E4 Round 1
    tagTrainer(trs, 0x19A, "ELITE1-1");
    tagTrainer(trs, 0x19B, "ELITE2-1");
    tagTrainer(trs, 0x19C, "ELITE3-1");
    tagTrainer(trs, 0x19D, "ELITE4-1");
    
    // E4 Round 2
    tagTrainer(trs, 0x2DF, "ELITE1-2");
    tagTrainer(trs, 0x2E0, "ELITE2-2");
    tagTrainer(trs, 0x2E1, "ELITE3-2");
    tagTrainer(trs, 0x2E2, "ELITE4-2");
    
    // Rival Battles
    
    // Initial Rival
    tagTrainer(trs, 0x148, "RIVAL1-0");
    tagTrainer(trs, 0x146, "RIVAL1-1");
    tagTrainer(trs, 0x147, "RIVAL1-2");
    
    // Route 22 (weak)
    tagTrainer(trs, 0x14B, "RIVAL2-0");
    tagTrainer(trs, 0x149, "RIVAL2-1");
    tagTrainer(trs, 0x14A, "RIVAL2-2");
    
    // Cerulean
    tagTrainer(trs, 0x14E, "RIVAL3-0");
    tagTrainer(trs, 0x14C, "RIVAL3-1");
    tagTrainer(trs, 0x14D, "RIVAL3-2");
    
    // SS Anne
    tagTrainer(trs, 0x1AC, "RIVAL4-0");
    tagTrainer(trs, 0x1AA, "RIVAL4-1");
    tagTrainer(trs, 0x1AB, "RIVAL4-2");
    
    // Pokemon Tower
    tagTrainer(trs, 0x1AF, "RIVAL5-0");
    tagTrainer(trs, 0x1AD, "RIVAL5-1");
    tagTrainer(trs, 0x1AE, "RIVAL5-2");
    
    // Silph Co
    tagTrainer(trs, 0x1B2, "RIVAL6-0");
    tagTrainer(trs, 0x1B0, "RIVAL6-1");
    tagTrainer(trs, 0x1B1, "RIVAL6-2");
    
    // Route 22 (strong)
    tagTrainer(trs, 0x1B5, "RIVAL7-0");
    tagTrainer(trs, 0x1B3, "RIVAL7-1");
    tagTrainer(trs, 0x1B4, "RIVAL7-2");
    
    // E4 Round 1
    tagTrainer(trs, 0x1B8, "RIVAL8-0");
    tagTrainer(trs, 0x1B6, "RIVAL8-1");
    tagTrainer(trs, 0x1B7, "RIVAL8-2");
    
    // E4 Round 2
    tagTrainer(trs, 0x2E5, "RIVAL9-0");
    tagTrainer(trs, 0x2E3, "RIVAL9-1");
    tagTrainer(trs, 0x2E4, "RIVAL9-2");
    
}

function tagTrainer(trainers: any[], trainerNum: number, tag: string): void {
    trainers[trainerNum - 1].tag = tag;
}

function tag(allTrainers: any[], tag: string, ...numbers: number[]): void {
    for (const num of numbers) {
    allTrainers[num - 1].tag = tag;
    }
}

export function setMultiBattleStatusEm(trs: any[]): void {
    // 25 + 569: Double Battle with Team Aqua Grunts on Mt. Pyre
    // 105 + 237: Double Battle with Hex Maniac Patricia and Psychic Joshua
    // 397 + 508: Double Battle with Dragon Tamer Aaron and Cooltrainer Marley
    // 404 + 654: Double Battle with Bird Keeper Edwardo and Camper Flint
    // 504 + 505: Double Battle with Ninja Boy Jonas and Parasol Lady Kayley
    // 514 + 734: Double Battle with Tabitha and Maxie in Mossdeep Space Center
    // 572 + 573: Double Battle with Sailor Brenden and Battle Girl Lilith
    // 721 + 730: Double Battle with Team Magma Grunts in Team Magma Hideout
    // 848 + 850: Double Battle with Psychic Mariela and Gentleman Everett
    setMultiBattleStatus(trs, MultiBattleStatus.ALWAYS, 25, 105, 237, 397, 404, 504, 505, 508, 514,
    569, 572, 573, 654, 721, 730, 734, 848, 850
    );
    
    // 1 + 124: Potential Double Battle with Hiker Sawyer and Beauty Melissa
    // 3 + 192: Potential Double Battle with Team Aqua Grunts in Team Aqua Hideout
    // 8 + 14: Potential Double Battle with Team Aqua Grunts in Seafloor Cavern
    // 9 + 236 + 247: Potential Double Battle with Pokemon Breeder Gabrielle, Psychic William, and Psychic Kayla
    // 11 + 767: Potential Double Battle with Cooltrainer Marcel and Cooltrainer Cristin
    // 12 + 195: Potential Double Battle with Bird Keeper Alberto and Guitarist Fernando
    // 13 + 106: Potential Double Battle with Collector Ed and Hex Maniac Kindra
    // 15 + 450: Potential Double Battle with Swimmer Declan and Swimmer Grace
    // 18 + 596: Potential Double Battle with Team Aqua Grunts in Weather Institute
    // 28 + 193: Potential Double Battle with Team Aqua Grunts in Team Aqua Hideout
    // 29 + 249: Potential Double Battle with Expert Fredrick and Psychic Jacki
    // 31 + 35 + 145: Potential Double Battles with Black Belt Zander, Hex Maniac Leah, and PokéManiac Mark
    // 33 + 567: Potential Double Battle with Shelly and Team Aqua Grunt in Seafloor Cavern
    // 37 + 715: Potential Double Battle with Aroma Lady Rose and Youngster Deandre
    // 38 + 417: Potential Double Battle with Cooltrainer Felix and Cooltrainer Dianne
    // 57 + 698: Potential Double Battle with Tuber Lola and Tuber Chandler
    // 64 + 491 + 697: Potential Double Battles with Tuber Ricky, Sailor Edmond, and Tuber Hailey
    // 107 + 764: Potential Double Battle with Hex Maniac Tammy and Bug Maniac Cale
    // 108 + 475: Potential Double Battle with Hex Maniac Valerie and Psychic Cedric
    // 115 + 502: Potential Double Battle with Lady Daphne and Pokéfan Annika
    // 118 + 129: Potential Double Battle with Lady Brianna and Beauty Bridget
    // 130 + 301: Potential Double Battle with Beauty Olivia and Pokéfan Bethany
    // 131 + 614: Potential Double Battle with Beauty Tiffany and Lass Crissy
    // 137 + 511: Potential Double Battle with Expert Mollie and Expert Conor
    // 144 + 375: Potential Double Battle with Beauty Thalia and Youngster Demetrius
    // 146 + 579: Potential Double Battle with Team Magma Grunts on Mt. Chimney
    // 160 + 595: Potential Double Battle with Swimmer Roland and Triathlete Isabella
    // 168 + 455: Potential Double Battle with Swimmer Santiago and Swimmer Katie
    // 170 + 460: Potential Double Battle with Swimmer Franklin and Swimmer Debra
    // 171 + 385: Potential Double Battle with Swimmer Kevin and Triathlete Taila
    // 180 + 509: Potential Double Battle with Black Belt Hitoshi and Battle Girl Reyna
    // 182 + 307 + 748 + 749: Potential Double Battles with Black Belt Koichi, Expert Timothy, Triathlete Kyra, and Ninja Boy Jaiden
    // 191 + 649: Potential Double Battle with Guitarist Kirk and Battle Girl Vivian
    // 194 + 802: Potential Double Battle with Guitarist Shawn and Bug Maniac Angelo
    // 201 + 648: Potential Double Battle with Kindler Cole and Cooltrainer Gerald
    // 204 + 501: Potential Double Battle with Kindler Jace and Hiker Eli
    // 217 + 566: Potential Double Battle with Picnicker Autumn and Triathlete Julio
    // 232 + 701: Potential Double Battle with Psychic Edward and Triathlete Alyssa
    // 233 + 246: Potential Double Battle with Psychic Preston and Psychic Maura
    // 234 + 244 + 575 + 582: Potential Double Battles with Psychic Virgil, Psychic Hannah, Hex Maniac Sylvia, and Gentleman Nate
    // 235 + 245: Potential Double Battle with Psychic Blake and Psychic Samantha
    // 248 + 849: Potential Double Battle with Psychic Alexis and Psychic Alvaro
    // 273 + 605: Potential Double Battle with School Kid Jerry and Lass Janice
    // 302 + 699: Potential Double Battle with Pokéfan Isabel and Pokéfan Kaleb
    // 321 + 571: Potential Double Battle with Youngster Tommy and Hiker Marc
    // 324 + 325: Potential Double Battle with Cooltrainer Quincy and Cooltrainer Katelynn
    // 345 + 742: Potential Double Battle with Fisherman Carter and Bird Keeper Elijah
    // 377 + 459: Potential Double Battle with Triathlete Pablo and Swimmer Sienna
    // 383 + 576: Potential Double Battle with Triathlete Isobel and Swimmer Leonardo
    // 400 + 761: Potential Double Battle with Bird Keeper Phil and Parasol Lady Rachel
    // 401 + 655: Potential Double Battle with Bird Keeper Jared and Picnicker Ashley
    // 403 + 506: Potential Double Battle with Bird Keeper Presley and Expert Auron
    // 413 + 507: Potential Double Battle with Bird Keeper Alex and Sailor Kelvin
    // 415 + 759: Potential Double Battle with Ninja Boy Yasu and Guitarist Fabian
    // 416 + 760: Potential Double Battle with Ninja Boy Takashi and Kindler Dayton
    // 418 + 547: Potential Double Battle with Tuber Jani and Ruin Maniac Garrison
    // 420 + 710 + 711: Potential Double Battles with Ninja Boy Lung, Camper Lawrence, and PokéManiac Wyatt
    // 436 + 762: Potential Double Battle with Parasol Lady Angelica and Cooltrainer Leonel
    // 445 + 739: Potential Double Battle with Swimmer Beth and Triathlete Camron
    // 464 + 578: Potential Double Battle with Swimmer Carlee and Swimmer Harrison
    // 494 + 495: Potential Double Battle with Sailor Phillip and Sailor Leonard (S.S. Tidal)
    // 503 + 539: Potential Double Battle with Cooltrainer Jazmyn and Bug Catcher Davis
    // 512 + 700: Potential Double Battle with Collector Edwin and Guitarist Joseph
    // 513 + 752: Potential Double Battle with Collector Hector and Psychic Marlene
    // 540 + 546: Potential Double Battle with Cooltrainer Mitchell and Cooltrainer Halle
    // 577 + 674: Potential Double Battle with Cooltrainer Athena and Bird Keeper Aidan
    // 580 + 676: Potential Double Battle with Swimmer Clarence and Swimmer Tisha
    // 583 + 584 + 585 + 591: Potential Double Battles with Hex Maniac Kathleen, Gentleman Clifford, Psychic Nicholas, and Psychic Macey
    // 594 + 733: Potential Double Battle with Expert Paxton and Cooltrainer Darcy
    // 598 + 758: Potential Double Battle with Cooltrainer Jonathan and Expert Makayla
    // 629 + 712: Potential Double Battle with Hiker Lucas and Picnicker Angelina
    // 631 + 753 + 754: Potential Double Battles with Hiker Clark, Hiker Devan, and Youngster Johnson
    // 653 + 763: Potential Double Battle with Ninja Boy Riley and Battle Girl Callie
    // 694 + 695: Potential Double Battle with Rich Boy Dawson and Lady Sarah
    // 702 + 703: Potential Double Battle with Guitarist Marcos and Black Belt Rhett
    // 704 + 705: Potential Double Battle with Camper Tyron and Aroma Lady Celina
    // 706 + 707: Potential Double Battle with Picnicker Bianca and Kindler Hayden
    // 708 + 709: Potential Double Battle with Picnicker Sophie and Bird Keeper Coby
    // 713 + 714: Potential Double Battle with Fisherman Kai and Picnicker Charlotte
    // 719 + 720: Potential Double Battle with Team Magma Grunts in Team Magma Hideout
    // 727 + 728: Potential Double Battle with Team Magma Grunts in Team Magma Hideout
    // 735 + 736: Potential Double Battle with Swimmer Pete and Swimmer Isabelle
    // 737 + 738: Potential Double Battle with Ruin Maniac Andres and Bird Keeper Josue
    // 740 + 741: Potential Double Battle with Sailor Cory and Cooltrainer Carolina
    // 743 + 744 + 745: Potential Double Battles with Picnicker Celia, Ruin Maniac Bryan, and Camper Branden
    // 746 + 747: Potential Double Battle with Kindler Bryant and Aroma Lady Shayla
    // 750 + 751: Potential Double Battle with Psychic Alix and Battle Girl Helene
    // 755 + 756 + 757: Potential Double Battles with Triathlete Melina, Psychic Brandi, and Battle Girl Aisha
    // 765 + 766: Potential Double Battle with Pokémon Breeder Myles and Pokémon Breeder Pat
    setMultiBattleStatus(trs, MultiBattleStatus.POTENTIAL, 1, 3, 8, 9, 11, 12, 13, 14, 15, 18, 28,
    29, 31, 33, 35, 37, 38, 57, 64, 106, 107, 108, 115, 118, 124, 129, 130, 131, 137, 144, 145, 146, 160,
    168, 170, 171, 180, 182, 191, 192, 193, 194, 195, 201, 204, 217, 232, 233, 234, 235, 236, 244, 245, 246,
    247, 248, 249, 273, 301, 302, 307, 321, 324, 325, 345, 375, 377, 383, 385, 400, 401, 403, 413, 415, 416,
    417, 418, 420, 436, 445, 450, 455, 459, 460, 464, 475, 491, 494, 495, 501, 502, 503, 506, 507, 509, 511,
    512, 513, 539, 540, 546, 547, 566, 567, 571, 575, 576, 577, 578, 579, 580, 582, 583, 584, 585, 591, 594,
    595, 596, 598, 605, 614, 629, 631, 648, 649, 653, 655, 674, 676, 694, 695, 697, 698, 699, 700, 701, 702,
    703, 704, 705, 706, 707, 708, 709, 710, 711, 712, 713, 714, 715, 719, 720, 727, 728, 733, 735, 736, 737,
    738, 739, 740, 741, 742, 743, 744, 745, 746, 747, 748, 749, 750, 751, 752, 753, 754, 755, 756, 757, 758,
    759, 760, 761, 762, 763, 764, 765, 766, 767, 802, 849
    );
}

function setMultiBattleStatus(allTrainers: any[], status: MultiBattleStatus, ...numbers: number[]): void {
    for (const num of numbers) {
    if (allTrainers.length > (num - 1)) {
    allTrainers[num - 1].multiBattleStatus = status;
    }
    }
}

export const balancedItemPrices: Map<number, number> = new Map<number, number>([
    // Skip item index 0. All prices divided by 10
    [Gen3Items.masterBall, 300], [Gen3Items.ultraBall, 120], [Gen3Items.greatBall, 60],
    [Gen3Items.pokeBall, 20], [Gen3Items.safariBall, 50], [Gen3Items.netBall, 100],
    [Gen3Items.diveBall, 100], [Gen3Items.nestBall, 100], [Gen3Items.repeatBall, 100],
    [Gen3Items.timerBall, 100], [Gen3Items.luxuryBall, 100], [Gen3Items.premierBall, 20],
    [Gen3Items.potion, 30], [Gen3Items.antidote, 10], [Gen3Items.burnHeal, 25],
    [Gen3Items.iceHeal, 25], [Gen3Items.awakening, 25], [Gen3Items.parlyzHeal, 20],
    [Gen3Items.fullRestore, 300], [Gen3Items.maxPotion, 250], [Gen3Items.hyperPotion, 120],
    [Gen3Items.superPotion, 70], [Gen3Items.fullHeal, 60], [Gen3Items.revive, 150],
    [Gen3Items.maxRevive, 400], [Gen3Items.freshWater, 40], [Gen3Items.sodaPop, 60],
    [Gen3Items.lemonade, 70], [Gen3Items.moomooMilk, 80], [Gen3Items.energyPowder, 40],
    [Gen3Items.energyRoot, 110], [Gen3Items.healPowder, 45], [Gen3Items.revivalHerb, 280],
    [Gen3Items.ether, 300], [Gen3Items.maxEther, 450], [Gen3Items.elixir, 1500],
    [Gen3Items.maxElixir, 1800], [Gen3Items.lavaCookie, 45], [Gen3Items.blueFlute, 2],
    [Gen3Items.yellowFlute, 2], [Gen3Items.redFlute, 2], [Gen3Items.blackFlute, 2],
    [Gen3Items.whiteFlute, 2], [Gen3Items.berryJuice, 10], [Gen3Items.sacredAsh, 1000],
    [Gen3Items.shoalSalt, 2], [Gen3Items.shoalShell, 2], [Gen3Items.redShard, 40],
    [Gen3Items.blueShard, 40], [Gen3Items.yellowShard, 40], [Gen3Items.greenShard, 40],
    [Gen3Items.hpUp, 980], [Gen3Items.protein, 980], [Gen3Items.iron, 980],
    [Gen3Items.carbos, 980], [Gen3Items.calcium, 980], [Gen3Items.rareCandy, 1000],
    [Gen3Items.ppUp, 980], [Gen3Items.zinc, 980], [Gen3Items.ppMax, 2490],
    [Gen3Items.guardSpec, 70], [Gen3Items.direHit, 65], [Gen3Items.xAttack, 50],
    [Gen3Items.xDefend, 55], [Gen3Items.xSpeed, 35], [Gen3Items.xAccuracy, 95],
    [Gen3Items.xSpecial, 35], [Gen3Items.pokeDoll, 100], [Gen3Items.fluffyTail, 100],
    [Gen3Items.superRepel, 50], [Gen3Items.maxRepel, 70], [Gen3Items.escapeRope, 55],
    [Gen3Items.repel, 35], [Gen3Items.sunStone, 300], [Gen3Items.moonStone, 300],
    [Gen3Items.fireStone, 300], [Gen3Items.thunderstone, 300], [Gen3Items.waterStone, 300],
    [Gen3Items.leafStone, 300], [Gen3Items.tinyMushroom, 50], [Gen3Items.bigMushroom, 500],
    [Gen3Items.pearl, 140], [Gen3Items.bigPearl, 750], [Gen3Items.stardust, 200],
    [Gen3Items.starPiece, 980], [Gen3Items.nugget, 1000], [Gen3Items.heartScale, 500],
    [Gen3Items.orangeMail, 5], [Gen3Items.harborMail, 5], [Gen3Items.glitterMail, 5],
    [Gen3Items.mechMail, 5], [Gen3Items.woodMail, 5], [Gen3Items.waveMail, 5],
    [Gen3Items.beadMail, 5], [Gen3Items.shadowMail, 5], [Gen3Items.tropicMail, 5],
    [Gen3Items.dreamMail, 5], [Gen3Items.fabMail, 5], [Gen3Items.retroMail, 5],
    [Gen3Items.cheriBerry, 20], [Gen3Items.chestoBerry, 25], [Gen3Items.pechaBerry, 10],
    [Gen3Items.rawstBerry, 25], [Gen3Items.aspearBerry, 25], [Gen3Items.leppaBerry, 300],
    [Gen3Items.oranBerry, 5], [Gen3Items.persimBerry, 20], [Gen3Items.lumBerry, 50],
    [Gen3Items.sitrusBerry, 50], [Gen3Items.figyBerry, 10], [Gen3Items.wikiBerry, 10],
    [Gen3Items.magoBerry, 10], [Gen3Items.aguavBerry, 10], [Gen3Items.iapapaBerry, 10],
    [Gen3Items.razzBerry, 50], [Gen3Items.blukBerry, 50], [Gen3Items.nanabBerry, 50],
    [Gen3Items.wepearBerry, 50], [Gen3Items.pinapBerry, 50], [Gen3Items.pomegBerry, 50],
    [Gen3Items.kelpsyBerry, 50], [Gen3Items.qualotBerry, 50], [Gen3Items.hondewBerry, 50],
    [Gen3Items.grepaBerry, 50], [Gen3Items.tamatoBerry, 50], [Gen3Items.cornnBerry, 50],
    [Gen3Items.magostBerry, 50], [Gen3Items.rabutaBerry, 50], [Gen3Items.nomelBerry, 50],
    [Gen3Items.spelonBerry, 50], [Gen3Items.pamtreBerry, 50], [Gen3Items.watmelBerry, 50],
    [Gen3Items.durinBerry, 50], [Gen3Items.belueBerry, 50], [Gen3Items.liechiBerry, 100],
    [Gen3Items.ganlonBerry, 100], [Gen3Items.salacBerry, 100], [Gen3Items.petayaBerry, 100],
    [Gen3Items.apicotBerry, 100], [Gen3Items.lansatBerry, 100], [Gen3Items.starfBerry, 100],
    [Gen3Items.enigmaBerry, 100], [Gen3Items.brightPowder, 300], [Gen3Items.whiteHerb, 100],
    [Gen3Items.machoBrace, 300], [Gen3Items.expShare, 600], [Gen3Items.quickClaw, 450],
    [Gen3Items.sootheBell, 100], [Gen3Items.mentalHerb, 100], [Gen3Items.choiceBand, 1000],
    [Gen3Items.kingsRock, 500], [Gen3Items.silverPowder, 200], [Gen3Items.amuletCoin, 1500],
    [Gen3Items.cleanseTag, 100], [Gen3Items.soulDew, 20], [Gen3Items.deepSeaTooth, 300],
    [Gen3Items.deepSeaScale, 300], [Gen3Items.smokeBall, 20], [Gen3Items.everstone, 20],
    [Gen3Items.focusBand, 300], [Gen3Items.luckyEgg, 1000], [Gen3Items.scopeLens, 500],
    [Gen3Items.metalCoat, 300], [Gen3Items.leftovers, 1000], [Gen3Items.dragonScale, 300],
    [Gen3Items.lightBall, 10], [Gen3Items.softSand, 200], [Gen3Items.hardStone, 200],
    [Gen3Items.miracleSeed, 200], [Gen3Items.blackGlasses, 200], [Gen3Items.blackBelt, 200],
    [Gen3Items.magnet, 200], [Gen3Items.mysticWater, 200], [Gen3Items.sharpBeak, 200],
    [Gen3Items.poisonBarb, 200], [Gen3Items.neverMeltIce, 200], [Gen3Items.spellTag, 200],
    [Gen3Items.twistedSpoon, 200], [Gen3Items.charcoal, 200], [Gen3Items.dragonFang, 200],
    [Gen3Items.silkScarf, 200], [Gen3Items.upGrade, 300], [Gen3Items.shellBell, 600],
    [Gen3Items.seaIncense, 200], [Gen3Items.laxIncense, 300], [Gen3Items.luckyPunch, 1],
    [Gen3Items.metalPowder, 1], [Gen3Items.thickClub, 50], [Gen3Items.stick, 20],
    [Gen3Items.redScarf, 10], [Gen3Items.blueScarf, 10], [Gen3Items.pinkScarf, 10],
    [Gen3Items.greenScarf, 10], [Gen3Items.yellowScarf, 10],
    [Gen3Items.tm01, 300], [Gen3Items.tm02, 300], [Gen3Items.tm03, 300],
    [Gen3Items.tm04, 150], [Gen3Items.tm05, 100], [Gen3Items.tm06, 300],
    [Gen3Items.tm07, 200], [Gen3Items.tm08, 150], [Gen3Items.tm09, 200],
    [Gen3Items.tm10, 200], [Gen3Items.tm11, 200], [Gen3Items.tm12, 150],
    [Gen3Items.tm13, 300], [Gen3Items.tm14, 550], [Gen3Items.tm15, 750],
    [Gen3Items.tm16, 200], [Gen3Items.tm17, 200], [Gen3Items.tm18, 200],
    [Gen3Items.tm19, 300], [Gen3Items.tm20, 200], [Gen3Items.tm21, 100],
    [Gen3Items.tm22, 300], [Gen3Items.tm23, 300], [Gen3Items.tm24, 300],
    [Gen3Items.tm25, 550], [Gen3Items.tm26, 300], [Gen3Items.tm27, 100],
    [Gen3Items.tm28, 200], [Gen3Items.tm29, 300], [Gen3Items.tm30, 300],
    [Gen3Items.tm31, 300], [Gen3Items.tm32, 100], [Gen3Items.tm33, 200],
    [Gen3Items.tm34, 300], [Gen3Items.tm35, 300], [Gen3Items.tm36, 300],
    [Gen3Items.tm37, 200], [Gen3Items.tm38, 550], [Gen3Items.tm39, 200],
    [Gen3Items.tm40, 300], [Gen3Items.tm41, 150], [Gen3Items.tm42, 300],
    [Gen3Items.tm43, 200], [Gen3Items.tm44, 300], [Gen3Items.tm45, 300],
    [Gen3Items.tm46, 200], [Gen3Items.tm47, 300], [Gen3Items.tm48, 300],
    [Gen3Items.tm49, 150], [Gen3Items.tm50, 550],
]);
