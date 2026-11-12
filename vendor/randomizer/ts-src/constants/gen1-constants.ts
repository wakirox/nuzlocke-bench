import * as Gen1Items from './gen1-items';
import * as Items from './items';
import * as Moves from './moves';
import { ItemList } from '../pokemon/item-list';

export const baseStatsEntrySize = 0x1C;

export const bsHPOffset = 1;
export const bsAttackOffset = 2;
export const bsDefenseOffset = 3;
export const bsSpeedOffset = 4;
export const bsSpecialOffset = 5;
export const bsPrimaryTypeOffset = 6;
export const bsSecondaryTypeOffset = 7;
export const bsCatchRateOffset = 8;
export const bsExpYieldOffset = 9;
export const bsFrontSpriteOffset = 11;
export const bsLevel1MovesOffset = 15;
export const bsGrowthCurveOffset = 19;
export const bsTMHMCompatOffset = 20;

export const encounterTableEnd = 0xFFFF;
export const encounterTableSize = 10;
export const yellowSuperRodTableSize = 4;

export const trainerClassCount = 47;

export const champRivalOffsetFromGymLeaderMoves = 0x44;

export const tmCount = 50;
export const hmCount = 5;

export const gymLeaderTMs: number[] = [ 34, 11, 24, 21, 6, 46, 38, 27 ];

export const tclassesCounts: number[] = [ 21, 47 ];

export const singularTrainers: number[] = [28, 32, 33, 34, 35, 36, 37, 38, 39, 43, 45, 46];

export const bannedMovesWithXAccBanned: number[] = [ Moves.sonicBoom, Moves.dragonRage, Moves.spore];

export const bannedMovesWithoutXAccBanned: number[] = [ Moves.sonicBoom, Moves.dragonRage, Moves.spore, Moves.hornDrill, Moves.fissure, Moves.guillotine];

// ban transform because of Transform assumption glitch
export const bannedLevelupMoves: number[] = [Moves.transform];

export const fieldMoves: number[] = [ Moves.cut, Moves.fly, Moves.surf, Moves.strength, Moves.flash, Moves.dig, Moves.teleport];

export const damagePoison20PercentEffect = 2;
export const damageAbsorbEffect = 3;
export const damageBurn10PercentEffect = 4;
export const damageFreeze10PercentEffect = 5;
export const damageParalyze10PercentEffect = 6;
export const dreamEaterEffect = 8;
export const noDamageAtkPlusOneEffect = 10;
export const noDamageDefPlusOneEffect = 11;
export const noDamageSpecialPlusOneEffect = 13;
export const noDamageEvasionPlusOneEffect = 15;
export const noDamageAtkMinusOneEffect = 18;
export const noDamageDefMinusOneEffect = 19;
export const noDamageSpeMinusOneEffect = 20;
export const noDamageAccuracyMinusOneEffect = 22;
export const flinch10PercentEffect = 31;
export const noDamageSleepEffect = 32;
export const damagePoison40PercentEffect = 33;
export const damageBurn30PercentEffect = 34;
export const damageFreeze30PercentEffect = 35;
export const damageParalyze30PercentEffect = 36;
export const flinch30PercentEffect = 37;
export const chargeEffect = 39;
export const flyEffect = 43;
export const damageRecoilEffect = 48;
export const noDamageConfusionEffect = 49;
export const noDamageAtkPlusTwoEffect = 50;
export const noDamageDefPlusTwoEffect = 51;
export const noDamageSpePlusTwoEffect = 52;
export const noDamageSpecialPlusTwoEffect = 53;
export const noDamageDefMinusTwoEffect = 59;
export const noDamagePoisonEffect = 66;
export const noDamageParalyzeEffect = 67;
export const damageAtkMinusOneEffect = 68;
export const damageDefMinusOneEffect = 69;
export const damageSpeMinusOneEffect = 70;
export const damageSpecialMinusOneEffect = 71;
export const damageConfusionEffect = 76;
export const twineedleEffect = 77;
export const hyperBeamEffect = 80;

// Taken from critical_hit_moves.asm; we could read this from the ROM, but it's easier to hardcode it.
export const increasedCritMoves: number[] = [Moves.karateChop, Moves.razorLeaf, Moves.crabhammer, Moves.slash];

export const earlyRequiredHMs: number[] = [Moves.cut];

export const hmsStartIndex = Gen1Items.hm01;
export const tmsStartIndex = Gen1Items.tm01;

export const requiredFieldTMs: number[] = [3, 4, 8, 10, 12, 14, 16, 19, 20, 22, 25, 26, 30, 40, 43, 44, 45, 47];

export const towerMapsStartIndex = 0x90;
export const towerMapsEndIndex = 0x94;

export const guaranteedCatchPrefix = "CF7EFE01";

export const typeTable: (string | null)[] = constructTypeTable();

function constructTypeTable(): (string | null)[] {
    const table: (string | null)[] = new Array(0x20).fill(null);
    table[0x00] = "NORMAL";
    table[0x01] = "FIGHTING";
    table[0x02] = "FLYING";
    table[0x03] = "POISON";
    table[0x04] = "GROUND";
    table[0x05] = "ROCK";
    table[0x07] = "BUG";
    table[0x08] = "GHOST";
    table[0x14] = "FIRE";
    table[0x15] = "WATER";
    table[0x16] = "GRASS";
    table[0x17] = "ELECTRIC";
    table[0x18] = "PSYCHIC";
    table[0x19] = "ICE";
    table[0x1A] = "DRAGON";
    return table;
}

export function typeToByte(type: string): number {
    for (let i = 0; i < typeTable.length; i++) {
        if (typeTable[i] == type) {
            return i;
        }
    }
    return 0;
}

// (nuzlocke-bench: wired up — Gen1RomHandler returned an empty list, which hung field-item randomization.)

export function setupAllowedItems(): ItemList {
    const allowedItems: any = new ItemList(Gen1Items.tm50); // 251-255 are junk TMs
    // Assorted key items & junk
    // 23/01/2014: ban fake PP Up
    allowedItems.banSingles(Gen1Items.townMap, Gen1Items.bicycle, Gen1Items.questionMark7,
    Gen1Items.safariBall, Gen1Items.pokedex, Gen1Items.oldAmber, Gen1Items.cardKey, Gen1Items.ppUpGlitch,
    Gen1Items.coin, Gen1Items.ssTicket, Gen1Items.goldTeeth);
    allowedItems.banRange(Gen1Items.boulderBadge, 8);
    allowedItems.banRange(Gen1Items.domeFossil, 5);
    allowedItems.banRange(Gen1Items.coinCase, 10);
    // Unused
    allowedItems.banRange(Gen1Items.unused84, 112);
    // HMs
    allowedItems.banRange(hmsStartIndex, hmCount);
    // Real TMs
    allowedItems.tmRange(tmsStartIndex, tmCount);
    return allowedItems;
}

export function tagTrainersUniversal(trs: any[]): void {
    // Gym Leaders
    tbc(trs, 34, 0, "GYM1");
    tbc(trs, 35, 0, "GYM2");
    tbc(trs, 36, 0, "GYM3");
    tbc(trs, 37, 0, "GYM4");
    tbc(trs, 38, 0, "GYM5");
    tbc(trs, 40, 0, "GYM6");
    tbc(trs, 39, 0, "GYM7");
    tbc(trs, 29, 2, "GYM8");
    
    // Other giovanni teams
    tbc(trs, 29, 0, "GIO1");
    tbc(trs, 29, 1, "GIO2");
    
    // Elite 4
    tbc(trs, 44, 0, "ELITE1");
    tbc(trs, 33, 0, "ELITE2");
    tbc(trs, 46, 0, "ELITE3");
    tbc(trs, 47, 0, "ELITE4");
}

export function tagTrainersRB(trs: any[]): void {
    // Gary Battles
    tbc(trs, 25, 0, "RIVAL1-0");
    tbc(trs, 25, 1, "RIVAL1-1");
    tbc(trs, 25, 2, "RIVAL1-2");
    
    tbc(trs, 25, 3, "RIVAL2-0");
    tbc(trs, 25, 4, "RIVAL2-1");
    tbc(trs, 25, 5, "RIVAL2-2");
    
    tbc(trs, 25, 6, "RIVAL3-0");
    tbc(trs, 25, 7, "RIVAL3-1");
    tbc(trs, 25, 8, "RIVAL3-2");
    
    tbc(trs, 42, 0, "RIVAL4-0");
    tbc(trs, 42, 1, "RIVAL4-1");
    tbc(trs, 42, 2, "RIVAL4-2");
    
    tbc(trs, 42, 3, "RIVAL5-0");
    tbc(trs, 42, 4, "RIVAL5-1");
    tbc(trs, 42, 5, "RIVAL5-2");
    
    tbc(trs, 42, 6, "RIVAL6-0");
    tbc(trs, 42, 7, "RIVAL6-1");
    tbc(trs, 42, 8, "RIVAL6-2");
    
    tbc(trs, 42, 9, "RIVAL7-0");
    tbc(trs, 42, 10, "RIVAL7-1");
    tbc(trs, 42, 11, "RIVAL7-2");
    
    tbc(trs, 43, 0, "RIVAL8-0");
    tbc(trs, 43, 1, "RIVAL8-1");
    tbc(trs, 43, 2, "RIVAL8-2");
    
    // Gym Trainers
    tbc(trs, 5, 0, "GYM1");
    
    tbc(trs, 15, 0, "GYM2");
    tbc(trs, 6, 0, "GYM2");
    
    tbc(trs, 4, 7, "GYM3");
    tbc(trs, 20, 0, "GYM3");
    tbc(trs, 41, 2, "GYM3");
    
    tbc(trs, 3, 16, "GYM4");
    tbc(trs, 3, 17, "GYM4");
    tbc(trs, 6, 10, "GYM4");
    tbc(trs, 18, 0, "GYM4");
    tbc(trs, 18, 1, "GYM4");
    tbc(trs, 18, 2, "GYM4");
    tbc(trs, 32, 0, "GYM4");
    
    tbc(trs, 21, 2, "GYM5");
    tbc(trs, 21, 3, "GYM5");
    tbc(trs, 21, 6, "GYM5");
    tbc(trs, 21, 7, "GYM5");
    tbc(trs, 22, 0, "GYM5");
    tbc(trs, 22, 1, "GYM5");
    
    tbc(trs, 19, 0, "GYM6");
    tbc(trs, 19, 1, "GYM6");
    tbc(trs, 19, 2, "GYM6");
    tbc(trs, 19, 3, "GYM6");
    tbc(trs, 45, 21, "GYM6");
    tbc(trs, 45, 22, "GYM6");
    tbc(trs, 45, 23, "GYM6");
    
    tbc(trs, 8, 8, "GYM7");
    tbc(trs, 8, 9, "GYM7");
    tbc(trs, 8, 10, "GYM7");
    tbc(trs, 8, 11, "GYM7");
    tbc(trs, 11, 3, "GYM7");
    tbc(trs, 11, 4, "GYM7");
    tbc(trs, 11, 5, "GYM7");
    
    tbc(trs, 22, 2, "GYM8");
    tbc(trs, 22, 3, "GYM8");
    tbc(trs, 24, 5, "GYM8");
    tbc(trs, 24, 6, "GYM8");
    tbc(trs, 24, 7, "GYM8");
    tbc(trs, 31, 0, "GYM8");
    tbc(trs, 31, 8, "GYM8");
    tbc(trs, 31, 9, "GYM8");
}

export function tagTrainersYellow(trs: any[]): void {
    // Rival Battles
    tbc(trs, 25, 0, "IRIVAL");
    
    tbc(trs, 25, 1, "RIVAL1-0");
    
    tbc(trs, 25, 2, "RIVAL2-0");
    
    tbc(trs, 42, 0, "RIVAL3-0");
    
    tbc(trs, 42, 1, "RIVAL4-0");
    tbc(trs, 42, 2, "RIVAL4-1");
    tbc(trs, 42, 3, "RIVAL4-2");
    
    tbc(trs, 42, 4, "RIVAL5-0");
    tbc(trs, 42, 5, "RIVAL5-1");
    tbc(trs, 42, 6, "RIVAL5-2");
    
    tbc(trs, 42, 7, "RIVAL6-0");
    tbc(trs, 42, 8, "RIVAL6-1");
    tbc(trs, 42, 9, "RIVAL6-2");
    
    tbc(trs, 43, 0, "RIVAL7-0");
    tbc(trs, 43, 1, "RIVAL7-1");
    tbc(trs, 43, 2, "RIVAL7-2");
    
    // Rocket Jessie & James
    tbc(trs, 30, 41, "THEMED:JESSIE&JAMES");
    tbc(trs, 30, 42, "THEMED:JESSIE&JAMES");
    tbc(trs, 30, 43, "THEMED:JESSIE&JAMES");
    tbc(trs, 30, 44, "THEMED:JESSIE&JAMES");
    
    // Gym Trainers
    tbc(trs, 5, 0, "GYM1");
    
    tbc(trs, 6, 0, "GYM2");
    tbc(trs, 15, 0, "GYM2");
    
    tbc(trs, 4, 7, "GYM3");
    tbc(trs, 20, 0, "GYM3");
    tbc(trs, 41, 2, "GYM3");
    
    tbc(trs, 3, 16, "GYM4");
    tbc(trs, 3, 17, "GYM4");
    tbc(trs, 6, 10, "GYM4");
    tbc(trs, 18, 0, "GYM4");
    tbc(trs, 18, 1, "GYM4");
    tbc(trs, 18, 2, "GYM4");
    tbc(trs, 32, 0, "GYM4");
    
    tbc(trs, 21, 2, "GYM5");
    tbc(trs, 21, 3, "GYM5");
    tbc(trs, 21, 6, "GYM5");
    tbc(trs, 21, 7, "GYM5");
    tbc(trs, 22, 0, "GYM5");
    tbc(trs, 22, 1, "GYM5");
    
    tbc(trs, 19, 0, "GYM6");
    tbc(trs, 19, 1, "GYM6");
    tbc(trs, 19, 2, "GYM6");
    tbc(trs, 19, 3, "GYM6");
    tbc(trs, 45, 21, "GYM6");
    tbc(trs, 45, 22, "GYM6");
    tbc(trs, 45, 23, "GYM6");
    
    tbc(trs, 8, 8, "GYM7");
    tbc(trs, 8, 9, "GYM7");
    tbc(trs, 8, 10, "GYM7");
    tbc(trs, 8, 11, "GYM7");
    tbc(trs, 11, 3, "GYM7");
    tbc(trs, 11, 4, "GYM7");
    tbc(trs, 11, 5, "GYM7");
    
    tbc(trs, 22, 2, "GYM8");
    tbc(trs, 22, 3, "GYM8");
    tbc(trs, 24, 5, "GYM8");
    tbc(trs, 24, 6, "GYM8");
    tbc(trs, 24, 7, "GYM8");
    tbc(trs, 31, 0, "GYM8");
    tbc(trs, 31, 8, "GYM8");
    tbc(trs, 31, 9, "GYM8");
}

function tbc(allTrainers: any[], classNum: number, number: number, tag: string): void {
    let currnum = -1;
    for (const t of allTrainers) {
    if (t.trainerclass == classNum) {
    currnum++;
    if (currnum == number) {
    t.tag = tag;
    return;
    }
    }
    }
}
