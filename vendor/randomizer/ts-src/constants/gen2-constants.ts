import * as Gen2Items from './gen2-items';
import * as Items from './items';
import * as Moves from './moves';
import { ItemList } from '../pokemon/item-list';

export const vietCrystalCheckOffset = 0x63;

export const vietCrystalCheckValue = 0xF5;

export const vietCrystalROMName = "Pokemon VietCrystal";

export const pokemonCount = 251;
export const moveCount = 251;

export const baseStatsEntrySize = 0x20;

export const typeTable: (string | null)[] = constructTypeTable();

export const bsHPOffset = 1;
export const bsAttackOffset = 2;
export const bsDefenseOffset = 3;
export const bsSpeedOffset = 4;
export const bsSpAtkOffset = 5;
export const bsSpDefOffset = 6;
export const bsPrimaryTypeOffset = 7;
export const bsSecondaryTypeOffset = 8;
export const bsCatchRateOffset = 9;
export const bsCommonHeldItemOffset = 11;
export const bsRareHeldItemOffset = 12;
export const bsPicDimensionsOffset = 17;
export const bsGrowthCurveOffset = 22;
export const bsTMHMCompatOffset = 24;
export const bsMTCompatOffset = 31;

export const starterNames: string[] = [ "CYNDAQUIL", "TOTODILE", "CHIKORITA" ];

export const fishingGroupCount = 12;
export const pokesPerFishingGroup = 11;
export const fishingGroupEntryLength = 3;
export const timeSpecificFishingGroupCount = 11;
export const pokesPerTSFishingGroup = 4;

export const landEncounterSlots = 7;
export const seaEncounterSlots = 3;

export const oddEggPokemonCount = 14;

export const tmCount = 50;
export const hmCount = 7;

export const mtMenuCancelString = "CANCEL";

export const mtMenuInitByte = 0x80;

export const maxTrainerNameLength = 17;

export const fleeingSetTwoOffset = 0xE;
export const fleeingSetThreeOffset = 0x17;

export const mapGroupCount = 26;
export const mapsInLastGroup = 11;

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
export const damageRecoilEffect = 48;
export const noDamageConfusionEffect = 49;
export const noDamageAtkPlusTwoEffect = 50;
export const noDamageDefPlusTwoEffect = 51;
export const noDamageSpePlusTwoEffect = 52;
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
export const damageSpDefMinusOneEffect = 72;
export const damageAccuracyMinusOneEffect = 73;
export const skyAttackEffect = 75;
export const damageConfusionEffect = 76;
export const twineedleEffect = 77;
export const hyperBeamEffect = 80;
export const snoreEffect = 92;
export const flailAndReversalEffect = 102;
export const trappingEffect = 106;
export const swaggerEffect = 118;
export const damageBurnAndThawUserEffect = 125;
export const damageUserDefPlusOneEffect = 138;
export const damageUserAtkPlusOneEffect = 139;
export const damageUserAllPlusOneEffect = 140;
export const skullBashEffect = 145;
export const twisterEffect = 146;
export const futureSightEffect = 148;
export const stompEffect = 150;
export const solarbeamEffect = 151;
export const thunderEffect = 152;
export const semiInvulnerableEffect = 155;
export const defenseCurlEffect = 156;

// Taken from critical_hit_moves.asm; we could read this from the ROM, but it's easier to hardcode it.
export const increasedCritMoves: number[] = [Moves.karateChop, Moves.razorWind, Moves.razorLeaf, Moves.crabhammer, Moves.slash, Moves.aeroblast, Moves.crossChop];

export const requiredFieldTMs: number[] = [4, 20, 22, 26, 28, 34, 35, 39, 40, 43, 44, 46];

export const fieldMoves: number[] = [ Moves.cut, Moves.fly, Moves.surf, Moves.strength, Moves.flash, Moves.dig, Moves.teleport, Moves.whirlpool, Moves.waterfall, Moves.rockSmash, Moves.headbutt, Moves.sweetScent];

export const earlyRequiredHMMoves: number[] = [Moves.cut];

// ban thief because trainers are broken with it (items are not returned).
// ban transform because of Transform assumption glitch
export const bannedLevelupMoves: number[] = [Moves.transform, Moves.thief];

export const brokenMoves: number[] = [ Moves.sonicBoom, Moves.dragonRage, Moves.hornDrill, Moves.fissure, Moves.guillotine];

export const illegalVietCrystalMoves: number[] = [ Moves.protect, Moves.rest, Moves.spikeCannon, Moves.detect];

export const tmBlockOneIndex = Gen2Items.tm01;
export const tmBlockOneSize = 4;
export const tmBlockTwoIndex = Gen2Items.tm05;
export const tmBlockTwoSize = 24;
export const tmBlockThreeIndex = Gen2Items.tm29;
export const tmBlockThreeSize = 22;

export const priorityHitEffectIndex = 0x67;
export const protectEffectIndex = 0x6F;
export const endureEffectIndex = 0x74;
export const forceSwitchEffectIndex = 0x1C;
export const counterEffectIndex = 0x59;
export const mirrorCoatEffectIndex = 0x90;

export const friendshipValueForEvoLocator = "FEDCDA";

function constructTypeTable(): (string | null)[] {
    const table: (string | null)[] = new Array(256).fill(null);
    table[0x00] = "NORMAL";
    table[0x01] = "FIGHTING";
    table[0x02] = "FLYING";
    table[0x03] = "POISON";
    table[0x04] = "GROUND";
    table[0x05] = "ROCK";
    table[0x07] = "BUG";
    table[0x08] = "GHOST";
    table[0x09] = "STEEL";
    table[0x14] = "FIRE";
    table[0x15] = "WATER";
    table[0x16] = "GRASS";
    table[0x17] = "ELECTRIC";
    table[0x18] = "PSYCHIC";
    table[0x19] = "ICE";
    table[0x1A] = "DRAGON";
    table[0x1B] = "DARK";
    return table;
}

export function typeToByte(type: string): number {
    if (type == null) {
    return 0x13; // ???-type
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
    return 0x07;
    case "GHOST":
    return 0x08;
    case "FIRE":
    return 0x14;
    case "WATER":
    return 0x15;
    case "GRASS":
    return 0x16;
    case "ELECTRIC":
    return 0x17;
    case "PSYCHIC":
    return 0x18;
    case "ICE":
    return 0x19;
    case "DRAGON":
    return 0x1A;
    case "STEEL":
    return 0x09;
    case "DARK":
    return 0x1B;
    default:
    return 0; // normal by default
    }
}

export let allowedItems: ItemList;
export let nonBadItems: ItemList;

setupAllowedItems();

function setupAllowedItems(): void {
    allowedItems = new ItemList(Gen2Items.hm07); // 250-255 are junk and cancel
    // Assorted key items
    allowedItems.banSingles(Gen2Items.bicycle, Gen2Items.coinCase, Gen2Items.itemfinder, Gen2Items.oldRod,
    Gen2Items.goodRod, Gen2Items.superRod, Gen2Items.gsBall, Gen2Items.blueCard, Gen2Items.basementKey,
    Gen2Items.pass, Gen2Items.squirtBottle, Gen2Items.rainbowWing);
    allowedItems.banRange(Gen2Items.redScale, 6);
    allowedItems.banRange(Gen2Items.cardKey, 4);
    // HMs
    allowedItems.banRange(Gen2Items.hm01, 7);
    // Unused items (Teru-Samas and dummy TMs)
    allowedItems.banSingles(Gen2Items.terusama6, Gen2Items.terusama25, Gen2Items.terusama45,
    Gen2Items.terusama50, Gen2Items.terusama56, Gen2Items.terusama90, Gen2Items.terusama100,
    Gen2Items.terusama120, Gen2Items.terusama135, Gen2Items.terusama136, Gen2Items.terusama137,
    Gen2Items.terusama141, Gen2Items.terusama142, Gen2Items.terusama145, Gen2Items.terusama147,
    Gen2Items.terusama148, Gen2Items.terusama149, Gen2Items.terusama153, Gen2Items.terusama154,
    Gen2Items.terusama155, Gen2Items.terusama162, Gen2Items.terusama171, Gen2Items.terusama176,
    Gen2Items.terusama179, Gen2Items.terusama190, Gen2Items.tm04Unused, Gen2Items.tm28Unused);
    // Real TMs
    allowedItems.tmRange(tmBlockOneIndex, tmBlockOneSize);
    allowedItems.tmRange(tmBlockTwoIndex, tmBlockTwoSize);
    allowedItems.tmRange(tmBlockThreeIndex, tmBlockThreeSize);
    
    // non-bad items
    // ban specific pokemon hold items, berries, apricorns, mail
    nonBadItems = allowedItems.copy();
    nonBadItems.banSingles(Gen2Items.luckyPunch, Gen2Items.metalPowder, Gen2Items.silverLeaf,
    Gen2Items.goldLeaf, Gen2Items.redApricorn, Gen2Items.bluApricorn, Gen2Items.whtApricorn,
    Gen2Items.blkApricorn, Gen2Items.pnkApricorn, Gen2Items.stick, Gen2Items.thickClub,
    Gen2Items.flowerMail, Gen2Items.lightBall, Gen2Items.berry, Gen2Items.brickPiece);
    nonBadItems.banRange(Gen2Items.ylwApricorn, 2);
    nonBadItems.banRange(Gen2Items.normalBox, 2);
    nonBadItems.banRange(Gen2Items.surfMail, 9);
}

export function universalTrainerTags(allTrainers: any[]): void {
    // Gym Leaders
    tbc(allTrainers, 1, 0, "GYM1");
    tbc(allTrainers, 3, 0, "GYM2");
    tbc(allTrainers, 2, 0, "GYM3");
    tbc(allTrainers, 4, 0, "GYM4");
    tbc(allTrainers, 7, 0, "GYM5");
    tbc(allTrainers, 6, 0, "GYM6");
    tbc(allTrainers, 5, 0, "GYM7");
    tbc(allTrainers, 8, 0, "GYM8");
    tbc(allTrainers, 17, 0, "GYM9");
    tbc(allTrainers, 18, 0, "GYM10");
    tbc(allTrainers, 19, 0, "GYM11");
    tbc(allTrainers, 21, 0, "GYM12");
    tbc(allTrainers, 26, 0, "GYM13");
    tbc(allTrainers, 35, 0, "GYM14");
    tbc(allTrainers, 46, 0, "GYM15");
    tbc(allTrainers, 64, 0, "GYM16");
    
    // Elite 4 & Red
    tbc(allTrainers, 11, 0, "ELITE1");
    tbc(allTrainers, 15, 0, "ELITE2");
    tbc(allTrainers, 13, 0, "ELITE3");
    tbc(allTrainers, 14, 0, "ELITE4");
    tbc(allTrainers, 16, 0, "CHAMPION");
    tbc(allTrainers, 63, 0, "UBER");
    
    // Silver
    // Order in rom is BAYLEEF, QUILAVA, CROCONAW teams
    // Starters go CYNDA, TOTO, CHIKO
    // So we want 0=CROCONAW/FERALI, 1=BAYLEEF/MEGAN, 2=QUILAVA/TYPHLO
    tbc(allTrainers, 9, 0, "RIVAL1-1");
    tbc(allTrainers, 9, 1, "RIVAL1-2");
    tbc(allTrainers, 9, 2, "RIVAL1-0");
    
    tbc(allTrainers, 9, 3, "RIVAL2-1");
    tbc(allTrainers, 9, 4, "RIVAL2-2");
    tbc(allTrainers, 9, 5, "RIVAL2-0");
    
    tbc(allTrainers, 9, 6, "RIVAL3-1");
    tbc(allTrainers, 9, 7, "RIVAL3-2");
    tbc(allTrainers, 9, 8, "RIVAL3-0");
    
    tbc(allTrainers, 9, 9, "RIVAL4-1");
    tbc(allTrainers, 9, 10, "RIVAL4-2");
    tbc(allTrainers, 9, 11, "RIVAL4-0");
    
    tbc(allTrainers, 9, 12, "RIVAL5-1");
    tbc(allTrainers, 9, 13, "RIVAL5-2");
    tbc(allTrainers, 9, 14, "RIVAL5-0");
    
    tbc(allTrainers, 42, 0, "RIVAL6-1");
    tbc(allTrainers, 42, 1, "RIVAL6-2");
    tbc(allTrainers, 42, 2, "RIVAL6-0");
    
    tbc(allTrainers, 42, 3, "RIVAL7-1");
    tbc(allTrainers, 42, 4, "RIVAL7-2");
    tbc(allTrainers, 42, 5, "RIVAL7-0");
    
    // Female Rocket Executive (Ariana)
    tbc(allTrainers, 55, 0, "THEMED:ARIANA");
    tbc(allTrainers, 55, 1, "THEMED:ARIANA");
    
    // others (unlabeled in this game, using HGSS names)
    tbc(allTrainers, 51, 2, "THEMED:PETREL");
    tbc(allTrainers, 51, 3, "THEMED:PETREL");
    
    tbc(allTrainers, 51, 1, "THEMED:PROTON");
    tbc(allTrainers, 31, 0, "THEMED:PROTON");
    
    // Sprout Tower
    tbc(allTrainers, 56, 0, "THEMED:SPROUTTOWER");
    tbc(allTrainers, 56, 1, "THEMED:SPROUTTOWER");
    tbc(allTrainers, 56, 2, "THEMED:SPROUTTOWER");
    tbc(allTrainers, 56, 3, "THEMED:SPROUTTOWER");
    tbc(allTrainers, 56, 6, "THEMED:SPROUTTOWER");
    tbc(allTrainers, 56, 7, "THEMED:SPROUTTOWER");
    tbc(allTrainers, 56, 8, "THEMED:SPROUTTOWER");
}

export function goldSilverTags(allTrainers: any[]): void {
    tbc(allTrainers, 24, 0, "GYM1");
    tbc(allTrainers, 24, 1, "GYM1");
    tbc(allTrainers, 36, 4, "GYM2");
    tbc(allTrainers, 36, 5, "GYM2");
    tbc(allTrainers, 36, 6, "GYM2");
    tbc(allTrainers, 61, 0, "GYM2");
    tbc(allTrainers, 61, 3, "GYM2");
    tbc(allTrainers, 25, 0, "GYM3");
    tbc(allTrainers, 25, 1, "GYM3");
    tbc(allTrainers, 29, 0, "GYM3");
    tbc(allTrainers, 29, 1, "GYM3");
    tbc(allTrainers, 56, 4, "GYM4");
    tbc(allTrainers, 56, 5, "GYM4");
    tbc(allTrainers, 57, 0, "GYM4");
    tbc(allTrainers, 57, 1, "GYM4");
    tbc(allTrainers, 50, 1, "GYM5");
    tbc(allTrainers, 50, 3, "GYM5");
    tbc(allTrainers, 50, 4, "GYM5");
    tbc(allTrainers, 50, 6, "GYM5");
    tbc(allTrainers, 58, 0, "GYM7");
    tbc(allTrainers, 58, 1, "GYM7");
    tbc(allTrainers, 58, 2, "GYM7");
    tbc(allTrainers, 33, 0, "GYM7");
    tbc(allTrainers, 33, 1, "GYM7");
    tbc(allTrainers, 27, 2, "GYM8");
    tbc(allTrainers, 27, 4, "GYM8");
    tbc(allTrainers, 27, 3, "GYM8");
    tbc(allTrainers, 28, 2, "GYM8");
    tbc(allTrainers, 28, 3, "GYM8");
    tbc(allTrainers, 54, 17, "GYM9");
    tbc(allTrainers, 38, 20, "GYM10");
    tbc(allTrainers, 39, 17, "GYM10");
    tbc(allTrainers, 39, 18, "GYM10");
    tbc(allTrainers, 49, 2, "GYM11");
    tbc(allTrainers, 43, 1, "GYM11");
    tbc(allTrainers, 32, 2, "GYM11");
    tbc(allTrainers, 61, 4, "GYM12");
    tbc(allTrainers, 61, 5, "GYM12");
    tbc(allTrainers, 25, 8, "GYM12");
    tbc(allTrainers, 53, 18, "GYM12");
    tbc(allTrainers, 29, 13, "GYM12");
    tbc(allTrainers, 25, 2, "GYM13");
    tbc(allTrainers, 25, 5, "GYM13");
    tbc(allTrainers, 53, 4, "GYM13");
    tbc(allTrainers, 54, 4, "GYM13");
    tbc(allTrainers, 57, 5, "GYM14");
    tbc(allTrainers, 57, 6, "GYM14");
    tbc(allTrainers, 52, 1, "GYM14");
    tbc(allTrainers, 52, 10, "GYM14");
}

export function crystalTags(allTrainers: any[]): void {
    tbc(allTrainers, 24, 0, "GYM1");
    tbc(allTrainers, 24, 1, "GYM1");
    tbc(allTrainers, 36, 4, "GYM2");
    tbc(allTrainers, 36, 5, "GYM2");
    tbc(allTrainers, 36, 6, "GYM2");
    tbc(allTrainers, 61, 0, "GYM2");
    tbc(allTrainers, 61, 3, "GYM2");
    tbc(allTrainers, 25, 0, "GYM3");
    tbc(allTrainers, 25, 1, "GYM3");
    tbc(allTrainers, 29, 0, "GYM3");
    tbc(allTrainers, 29, 1, "GYM3");
    tbc(allTrainers, 56, 4, "GYM4");
    tbc(allTrainers, 56, 5, "GYM4");
    tbc(allTrainers, 57, 0, "GYM4");
    tbc(allTrainers, 57, 1, "GYM4");
    tbc(allTrainers, 50, 1, "GYM5");
    tbc(allTrainers, 50, 3, "GYM5");
    tbc(allTrainers, 50, 4, "GYM5");
    tbc(allTrainers, 50, 6, "GYM5");
    tbc(allTrainers, 58, 0, "GYM7");
    tbc(allTrainers, 58, 1, "GYM7");
    tbc(allTrainers, 58, 2, "GYM7");
    tbc(allTrainers, 33, 0, "GYM7");
    tbc(allTrainers, 33, 1, "GYM7");
    tbc(allTrainers, 27, 2, "GYM8");
    tbc(allTrainers, 27, 4, "GYM8");
    tbc(allTrainers, 27, 3, "GYM8");
    tbc(allTrainers, 28, 2, "GYM8");
    tbc(allTrainers, 28, 3, "GYM8");
    tbc(allTrainers, 54, 17, "GYM9");
    tbc(allTrainers, 38, 20, "GYM10");
    tbc(allTrainers, 39, 17, "GYM10");
    tbc(allTrainers, 39, 18, "GYM10");
    tbc(allTrainers, 49, 2, "GYM11");
    tbc(allTrainers, 43, 1, "GYM11");
    tbc(allTrainers, 32, 2, "GYM11");
    tbc(allTrainers, 61, 4, "GYM12");
    tbc(allTrainers, 61, 5, "GYM12");
    tbc(allTrainers, 25, 8, "GYM12");
    tbc(allTrainers, 53, 18, "GYM12");
    tbc(allTrainers, 29, 13, "GYM12");
    tbc(allTrainers, 25, 2, "GYM13");
    tbc(allTrainers, 25, 5, "GYM13");
    tbc(allTrainers, 53, 4, "GYM13");
    tbc(allTrainers, 54, 4, "GYM13");
    tbc(allTrainers, 57, 5, "GYM14");
    tbc(allTrainers, 57, 6, "GYM14");
    tbc(allTrainers, 52, 1, "GYM14");
    tbc(allTrainers, 52, 10, "GYM14");
}

function tbc(allTrainers: any[], classNum: number, number: number, tag: string): void {
    let currnum = -1;
    for (const t of allTrainers) {
    // adjusted to not change the above but use 0-indexing properly
    if (t.trainerclass == classNum - 1) {
    currnum++;
    if (currnum == number) {
    t.tag = tag;
    return;
    }
    }
    }
}
