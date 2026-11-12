import * as Abilities from './abilities';
import * as Items from './items';
import * as Moves from './moves';
import * as Species from './species';

export const bannedRandomMoves = new Array<boolean>(827).fill(false);
export const bannedForDamagingMove = new Array<boolean>(827).fill(false);
bannedRandomMoves[Moves.struggle] = true; //  self explanatory

bannedForDamagingMove[Moves.selfDestruct] = true;
bannedForDamagingMove[Moves.dreamEater] = true;
bannedForDamagingMove[Moves.explosion] = true;
bannedForDamagingMove[Moves.snore] = true;
bannedForDamagingMove[Moves.falseSwipe] = true;
bannedForDamagingMove[Moves.futureSight] = true;
bannedForDamagingMove[Moves.fakeOut] = true;
bannedForDamagingMove[Moves.focusPunch] = true;
bannedForDamagingMove[Moves.doomDesire] = true;
bannedForDamagingMove[Moves.feint] = true;
bannedForDamagingMove[Moves.lastResort] = true;
bannedForDamagingMove[Moves.suckerPunch] = true;
bannedForDamagingMove[Moves.constrict] = true; // overly weak
bannedForDamagingMove[Moves.rage] = true; // lock-in in gen1
bannedForDamagingMove[Moves.rollout] = true; // lock-in
bannedForDamagingMove[Moves.iceBall] = true; // Rollout clone
bannedForDamagingMove[Moves.synchronoise] = true; // hard to use
bannedForDamagingMove[Moves.shellTrap] = true; // hard to use
bannedForDamagingMove[Moves.foulPlay] = true; // doesn't depend on your own attacking stat
bannedForDamagingMove[Moves.spitUp] = true; // hard to use

// make sure these cant roll
bannedForDamagingMove[Moves.sonicBoom] = true;
bannedForDamagingMove[Moves.dragonRage] = true;
bannedForDamagingMove[Moves.hornDrill] = true;
bannedForDamagingMove[Moves.guillotine] = true;
bannedForDamagingMove[Moves.fissure] = true;
bannedForDamagingMove[Moves.sheerCold] = true;

export const normalMultihitMoves: number[] = [ Moves.armThrust, Moves.barrage, Moves.boneRush, Moves.bulletSeed, Moves.cometPunch, Moves.doubleSlap, Moves.furyAttack, Moves.furySwipes, Moves.icicleSpear, Moves.pinMissile, Moves.rockBlast, Moves.spikeCannon, Moves.tailSlap, Moves.waterShuriken];

export const doubleHitMoves: number[] = [ Moves.bonemerang, Moves.doubleHit, Moves.doubleIronBash, Moves.doubleKick, Moves.dragonDarts, Moves.dualChop, Moves.gearGrind, Moves.twineedle];

export const varyingPowerZMoves: number[] = [ Moves.breakneckBlitzPhysical, Moves.breakneckBlitzSpecial, Moves.allOutPummelingPhysical, Moves.allOutPummelingSpecial, Moves.supersonicSkystrikePhysical, Moves.supersonicSkystrikeSpecial, Moves.acidDownpourPhysical, Moves.acidDownpourSpecial, Moves.tectonicRagePhysical, Moves.tectonicRageSpecial, Moves.continentalCrushPhysical, Moves.continentalCrushSpecial, Moves.savageSpinOutPhysical, Moves.savageSpinOutSpecial, Moves.neverEndingNightmarePhysical, Moves.neverEndingNightmareSpecial, Moves.corkscrewCrashPhysical, Moves.corkscrewCrashSpecial, Moves.infernoOverdrivePhysical, Moves.infernoOverdriveSpecial, Moves.hydroVortexPhysical, Moves.hydroVortexSpecial, Moves.bloomDoomPhysical, Moves.bloomDoomSpecial, Moves.gigavoltHavocPhysical, Moves.gigavoltHavocSpecial, Moves.shatteredPsychePhysical, Moves.shatteredPsycheSpecial, Moves.subzeroSlammerPhysical, Moves.subzeroSlammerSpecial, Moves.devastatingDrakePhysical, Moves.devastatingDrakeSpecial, Moves.blackHoleEclipsePhysical, Moves.blackHoleEclipseSpecial, Moves.twinkleTacklePhysical, Moves.twinkleTackleSpecial];

export const fixedPowerZMoves: number[] = [ Moves.catastropika, Moves.sinisterArrowRaid, Moves.maliciousMoonsault, Moves.oceanicOperetta, Moves.guardianOfAlola, Moves.soulStealing7StarStrike, Moves.stokedSparksurfer, Moves.pulverizingPancake, Moves.extremeEvoboost, Moves.genesisSupernova, Moves.tenMillionVoltThunderbolt, Moves.lightThatBurnsTheSky, Moves.searingSunrazeSmash, Moves.menacingMoonrazeMaelstrom, Moves.letsSnuggleForever, Moves.splinteredStormshards, Moves.clangorousSoulblaze];

export const zMoves: number[] = [...fixedPowerZMoves, ...varyingPowerZMoves];

export interface StatChange {
    stat: number;
    values: number[];
}

export const Stat = {
    HP: 1,
    ATK: 1 << 1,
    DEF: 1 << 2,
    SPATK: 1 << 3,
    SPDEF: 1 << 4,
    SPEED: 1 << 5,
    SPECIAL: 1 << 6,
    POWER: 1 << 7,
    ACCURACY: 1 << 8,
    PP: 1 << 9,
    TYPE: 1 << 10,
    CATEGORY: 1 << 11,
} as const;

function sc(stat: number, ...values: number[]): StatChange {
    return { stat, values };
}

export function getStatChanges(generation: number): Map<number, StatChange> {
    const map = new Map<number, StatChange>();

    switch (generation) {
        case 6:
            map.set(Species.butterfree, sc(Stat.SPATK, 90));
            map.set(Species.beedrill, sc(Stat.ATK, 90));
            map.set(Species.pidgeot, sc(Stat.SPEED, 101));
            map.set(Species.pikachu, sc(Stat.DEF | Stat.SPDEF, 40, 50));
            map.set(Species.raichu, sc(Stat.SPEED, 110));
            map.set(Species.nidoqueen, sc(Stat.ATK, 92));
            map.set(Species.nidoking, sc(Stat.ATK, 102));
            map.set(Species.clefable, sc(Stat.SPATK, 95));
            map.set(Species.wigglytuff, sc(Stat.SPATK, 85));
            map.set(Species.vileplume, sc(Stat.SPATK, 110));
            map.set(Species.poliwrath, sc(Stat.ATK, 95));
            map.set(Species.alakazam, sc(Stat.SPDEF, 95));
            map.set(Species.victreebel, sc(Stat.SPDEF, 70));
            map.set(Species.golem, sc(Stat.ATK, 120));
            map.set(Species.ampharos, sc(Stat.DEF, 85));
            map.set(Species.bellossom, sc(Stat.DEF, 95));
            map.set(Species.azumarill, sc(Stat.SPATK, 60));
            map.set(Species.jumpluff, sc(Stat.SPDEF, 95));
            map.set(Species.beautifly, sc(Stat.SPATK, 100));
            map.set(Species.exploud, sc(Stat.SPDEF, 73));
            map.set(Species.staraptor, sc(Stat.SPDEF, 60));
            map.set(Species.roserade, sc(Stat.DEF, 65));
            map.set(Species.stoutland, sc(Stat.ATK, 110));
            map.set(Species.unfezant, sc(Stat.ATK, 115));
            map.set(Species.gigalith, sc(Stat.SPDEF, 80));
            map.set(Species.seismitoad, sc(Stat.ATK, 95));
            map.set(Species.leavanny, sc(Stat.SPDEF, 80));
            map.set(Species.scolipede, sc(Stat.ATK, 100));
            map.set(Species.krookodile, sc(Stat.DEF, 80));
            break;
        case 7:
            map.set(Species.arbok, sc(Stat.ATK, 95));
            map.set(Species.dugtrio, sc(Stat.ATK, 100));
            map.set(Species.farfetchd, sc(Stat.ATK, 90));
            map.set(Species.dodrio, sc(Stat.SPEED, 110));
            map.set(Species.electrode, sc(Stat.SPEED, 150));
            map.set(Species.exeggutor, sc(Stat.SPDEF, 75));
            map.set(Species.noctowl, sc(Stat.SPATK, 86));
            map.set(Species.ariados, sc(Stat.SPDEF, 70));
            map.set(Species.qwilfish, sc(Stat.DEF, 85));
            map.set(Species.magcargo, sc(Stat.HP | Stat.SPATK, 60, 90));
            map.set(Species.corsola, sc(Stat.HP | Stat.DEF | Stat.SPDEF, 65, 95, 95));
            map.set(Species.mantine, sc(Stat.HP, 85));
            map.set(Species.swellow, sc(Stat.SPATK, 75));
            map.set(Species.pelipper, sc(Stat.SPATK, 95));
            map.set(Species.masquerain, sc(Stat.SPATK | Stat.SPEED, 100, 80));
            map.set(Species.delcatty, sc(Stat.SPEED, 90));
            map.set(Species.volbeat, sc(Stat.DEF | Stat.SPDEF, 75, 85));
            map.set(Species.illumise, sc(Stat.DEF | Stat.SPDEF, 75, 85));
            map.set(Species.lunatone, sc(Stat.HP, 90));
            map.set(Species.solrock, sc(Stat.HP, 90));
            map.set(Species.chimecho, sc(Stat.HP | Stat.DEF | Stat.SPDEF, 75, 80, 90));
            map.set(Species.woobat, sc(Stat.HP, 65));
            map.set(Species.crustle, sc(Stat.ATK, 105));
            map.set(Species.beartic, sc(Stat.ATK, 130));
            map.set(Species.cryogonal, sc(Stat.HP | Stat.DEF, 80, 50));
            break;
        case 8:
            map.set(Species.aegislash, sc(Stat.DEF | Stat.SPDEF, 140, 140));
            break;
        case 9:
            map.set(Species.cresselia, sc(Stat.DEF | Stat.SPDEF, 110, 120));
            map.set(Species.zacian, sc(Stat.ATK, 120));
            map.set(Species.zamazenta, sc(Stat.ATK, 120));
            break;
    }
    return map;
}

export const xItems: number[] = [Items.guardSpec, Items.direHit, Items.xAttack, Items.xDefense, Items.xSpeed, Items.xAccuracy, Items.xSpAtk, Items.xSpDef];

export const battleTrappingAbilities: number[] = [Abilities.shadowTag, Abilities.magnetPull, Abilities.arenaTrap];

export const negativeAbilities: number[] = [ Abilities.defeatist, Abilities.slowStart, Abilities.truant, Abilities.klutz, Abilities.stall ];

export const badAbilities: number[] = [ Abilities.minus, Abilities.plus, Abilities.anticipation, Abilities.forewarn, Abilities.frisk, Abilities.honeyGather, Abilities.auraBreak, Abilities.receiver, Abilities.powerOfAlchemy ];

export const doubleBattleAbilities: number[] = [ Abilities.friendGuard, Abilities.healer, Abilities.telepathy, Abilities.symbiosis, Abilities.battery ];

export const duplicateAbilities: number[] = [ Abilities.vitalSpirit, Abilities.whiteSmoke, Abilities.purePower, Abilities.shellArmor, Abilities.airLock, Abilities.solidRock, Abilities.ironBarbs, Abilities.turboblaze, Abilities.teravolt, Abilities.emergencyExit, Abilities.dazzling, Abilities.tanglingHair, Abilities.powerOfAlchemy, Abilities.fullMetalBody, Abilities.shadowShield, Abilities.prismArmor, Abilities.libero, Abilities.stalwart ];

export const noPowerNonStatusMoves: number[] = [ Moves.guillotine, Moves.hornDrill, Moves.sonicBoom, Moves.lowKick, Moves.counter, Moves.seismicToss, Moves.dragonRage, Moves.fissure, Moves.nightShade, Moves.bide, Moves.psywave, Moves.superFang, Moves.flail, Moves.revenge, Moves.returnTheMoveNotTheKeyword, Moves.present, Moves.frustration, Moves.magnitude, Moves.mirrorCoat, Moves.beatUp, Moves.spitUp, Moves.sheerCold ];

export const cannotBeObsoletedMoves: number[] = [ Moves.returnTheMoveNotTheKeyword, Moves.frustration, Moves.endeavor, Moves.flail, Moves.reversal, Moves.hiddenPower, Moves.storedPower, Moves.smellingSalts, Moves.fling, Moves.powerTrip, Moves.counter, Moves.mirrorCoat, Moves.superFang ];

export const cannotObsoleteMoves: number[] = [ Moves.gearUp, Moves.magneticFlux, Moves.focusPunch, Moves.explosion, Moves.selfDestruct, Moves.geomancy, Moves.venomDrench ];

export const doubleBattleMoves: number[] = [ Moves.followMe, Moves.helpingHand, Moves.ragePowder, Moves.afterYou, Moves.allySwitch, Moves.healPulse, Moves.quash, Moves.ionDeluge, Moves.matBlock, Moves.aromaticMist, Moves.electrify, Moves.instruct, Moves.spotlight, Moves.decorate, Moves.lifeDew, Moves.coaching ];

export const uselessMoves: number[] = [
    Moves.splash, Moves.celebrate, Moves.holdHands, Moves.teleport,
    Moves.reflectType       // the AI does not know how to use this move properly
];

export const requiresOtherMove: number[] = [ Moves.spitUp, Moves.swallow, Moves.dreamEater, Moves.nightmare ];

export const MIN_DAMAGING_MOVE_POWER = 50;

export const HIGHEST_POKEMON_GEN = 9;

// Eevee has 8 potential evolutions
export const LARGEST_NUMBER_OF_SPLIT_EVOS = 8;
