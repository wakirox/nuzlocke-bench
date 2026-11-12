import { Type, GEN1, GEN2THROUGH5, GEN6PLUS, getAllTypes } from "./type";

export enum Effectiveness {
  ZERO,
  HALF,
  NEUTRAL,
  DOUBLE,
  QUARTER,
  QUADRUPLE,
}

const Z = Effectiveness.ZERO;
const H = Effectiveness.HALF;
const N = Effectiveness.NEUTRAL;
const D = Effectiveness.DOUBLE;

export function against(
  primaryType: Type,
  secondaryType: Type | null,
  gen: number,
  effectivenessUpdated: boolean = false
): Map<Type, Effectiveness> | null {
  if (gen >= 2 && gen <= 5) {
    if (effectivenessUpdated) {
      return againstInternal(primaryType, secondaryType, gen6PlusTable, GEN2THROUGH5);
    } else {
      return againstInternal(primaryType, secondaryType, gen2Through5Table, GEN2THROUGH5);
    }
  }
  if (gen >= 6) {
    return againstInternal(primaryType, secondaryType, gen6PlusTable, GEN6PLUS);
  }
  return null;
}

function againstInternal(
  primaryType: Type,
  secondaryType: Type | null,
  effectivenesses: Effectiveness[][],
  allTypes: readonly Type[]
): Map<Type, Effectiveness> {
  const result = new Map<Type, Effectiveness>();
  for (const type of allTypes) {
    let effect = effectivenesses[type][primaryType];
    if (secondaryType != null) {
      effect = combine(effect, effectivenesses[type][secondaryType]);
    }
    result.set(type, effect);
  }
  return result;
}

export function notVeryEffective(
  attackingType: Type,
  generation: number,
  effectivenessUpdated: boolean
): Type[] {
  let effectivenesses: Effectiveness[][];
  if (generation === 1) {
    effectivenesses = effectivenessUpdated ? gen2Through5Table : gen1Table;
  } else if (generation >= 2 && generation <= 5) {
    effectivenesses = effectivenessUpdated ? gen6PlusTable : gen2Through5Table;
  } else {
    effectivenesses = gen6PlusTable;
  }
  const allTypes = getAllTypes(generation);

  return allTypes.filter(
    (defendingType) =>
      effectivenesses[attackingType][defendingType] === Effectiveness.HALF ||
      effectivenesses[attackingType][defendingType] === Effectiveness.ZERO
  );
}

export function superEffective(
  attackingType: Type,
  generation: number,
  effectivenessUpdated: boolean
): Type[] {
  let effectivenesses: Effectiveness[][];
  if (generation === 1) {
    effectivenesses = effectivenessUpdated ? gen2Through5Table : gen1Table;
  } else if (generation >= 2 && generation <= 5) {
    effectivenesses = effectivenessUpdated ? gen6PlusTable : gen2Through5Table;
  } else {
    effectivenesses = gen6PlusTable;
  }
  const allTypes = getAllTypes(generation);

  return allTypes.filter(
    (defendingType) =>
      effectivenesses[attackingType][defendingType] === Effectiveness.DOUBLE
  );
}

// Attacking type is the row, Defending type is the column. This corresponds to the ordinal of types.
const gen1Table: Effectiveness[][] = [
  /*            NORMAL,FIGHTING, FLYING,   GRASS ,   WATER,   FIRE ,   ROCK , GROUND,  PSYCHIC,   BUG  ,  DRAGON,ELECTRIC,   GHOST , POISON,   ICE  */
  /*NORMAL */ [N, N, N, N, N, N, H, N, N, N, N, N, Z, N, N],
  /*FIGHTING*/[D, N, H, N, N, N, D, N, N, H, N, N, Z, H, D],
  /*FLYING */ [N, D, N, D, N, N, H, N, N, D, N, H, N, N, N],
  /*GRASS  */ [N, N, H, H, D, H, D, D, N, H, H, N, N, H, N],
  /*WATER  */ [N, N, N, H, H, D, D, D, N, N, H, N, N, N, N],
  /*FIRE   */ [N, N, N, D, H, H, H, N, N, D, H, N, N, N, D],
  /*ROCK   */ [N, H, D, N, N, D, N, H, N, D, N, N, N, N, D],
  /*GROUND */ [N, N, Z, H, N, D, D, N, N, H, N, D, N, D, N],
  /*PSYCHIC*/ [N, D, N, N, N, N, N, N, H, N, N, N, N, D, N],
  /*BUG    */ [N, H, H, D, N, H, N, N, D, N, N, N, H, D, N],
  /*DRAGON */ [N, N, N, N, N, N, N, N, N, N, D, N, N, N, N],
  /*ELECTRIC*/[N, N, D, H, D, N, N, Z, N, N, H, H, N, N, N],
  /*GHOST  */ [Z, N, N, N, N, N, N, N, Z, N, N, N, D, N, N],
  /*POISON */ [N, N, N, D, N, N, H, H, N, D, N, N, H, H, N],
  /*ICE    */ [N, N, D, D, H, N, N, D, N, N, D, N, N, N, H],
];

const gen2Through5Table: Effectiveness[][] = [
  /*            NORMAL,FIGHTING, FLYING,   GRASS ,   WATER,   FIRE ,   ROCK , GROUND,  PSYCHIC,   BUG  ,  DRAGON,ELECTRIC,   GHOST , POISON,   ICE  ,  STEEL ,  DARK  */
  /*NORMAL */ [N, N, N, N, N, N, H, N, N, N, N, N, Z, N, N, H, N],
  /*FIGHTING*/[D, N, H, N, N, N, D, N, N, H, N, N, Z, H, D, D, D],
  /*FLYING */ [N, D, N, D, N, N, H, N, N, D, N, H, N, N, N, H, N],
  /*GRASS  */ [N, N, H, H, D, H, D, D, N, H, H, N, N, H, N, H, N],
  /*WATER  */ [N, N, N, H, H, D, D, D, N, N, H, N, N, N, N, N, N],
  /*FIRE   */ [N, N, N, D, H, H, H, N, N, D, H, N, N, N, D, D, N],
  /*ROCK   */ [N, H, D, N, N, D, N, H, N, D, N, N, N, N, D, H, N],
  /*GROUND */ [N, N, Z, H, N, D, D, N, N, H, N, D, N, D, N, D, N],
  /*PSYCHIC*/ [N, D, N, N, N, N, N, N, H, N, N, N, N, D, N, H, Z],
  /*BUG    */ [N, H, H, D, N, H, N, N, D, N, N, N, H, H, N, H, D],
  /*DRAGON */ [N, N, N, N, N, N, N, N, N, N, D, N, N, N, N, H, N],
  /*ELECTRIC*/[N, N, D, H, D, N, N, Z, N, N, H, H, N, N, N, N, N],
  /*GHOST  */ [Z, N, N, N, N, N, N, N, D, N, N, N, D, N, N, H, H],
  /*POISON */ [N, N, N, D, N, N, H, H, N, N, N, N, H, H, N, Z, N],
  /*ICE    */ [N, N, D, D, H, H, N, D, N, N, D, N, N, N, H, H, N],
  /*STEEL  */ [N, N, N, N, H, H, D, N, N, N, N, H, N, N, D, H, N],
  /*DARK   */ [N, H, N, N, N, N, N, N, D, N, N, N, D, N, N, H, H],
];

const gen6PlusTable: Effectiveness[][] = [
  /*            NORMAL,FIGHTING, FLYING,   GRASS ,   WATER,   FIRE ,   ROCK , GROUND,  PSYCHIC,   BUG  ,  DRAGON,ELECTRIC,   GHOST , POISON,   ICE  ,  STEEL ,  DARK  , FAIRY */
  /*NORMAL */ [N, N, N, N, N, N, H, N, N, N, N, N, Z, N, N, H, N, N],
  /*FIGHTING*/[D, N, H, N, N, N, D, N, N, H, N, N, Z, H, D, D, D, H],
  /*FLYING */ [N, D, N, D, N, N, H, N, N, D, N, H, N, N, N, H, N, N],
  /*GRASS  */ [N, N, H, H, D, H, D, D, N, H, H, N, N, H, N, H, N, N],
  /*WATER  */ [N, N, N, H, H, D, D, D, N, N, H, N, N, N, N, N, N, N],
  /*FIRE   */ [N, N, N, D, H, H, H, N, N, D, H, N, N, N, D, D, N, N],
  /*ROCK   */ [N, H, D, N, N, D, N, H, N, D, N, N, N, N, D, H, N, N],
  /*GROUND */ [N, N, Z, H, N, D, D, N, N, H, N, D, N, D, N, D, N, N],
  /*PSYCHIC*/ [N, D, N, N, N, N, N, N, H, N, N, N, N, D, N, H, Z, N],
  /*BUG    */ [N, H, H, D, N, H, N, N, D, N, N, N, H, H, N, H, D, H],
  /*DRAGON */ [N, N, N, N, N, N, N, N, N, N, D, N, N, N, N, H, N, Z],
  /*ELECTRIC*/[N, N, D, H, D, N, N, Z, N, N, H, H, N, N, N, N, N, N],
  /*GHOST  */ [Z, N, N, N, N, N, N, N, D, N, N, N, D, N, N, N, H, N],
  /*POISON */ [N, N, N, D, N, N, H, H, N, N, N, N, H, H, N, Z, N, D],
  /*ICE    */ [N, N, D, D, H, H, N, D, N, N, D, N, N, N, H, H, N, N],
  /*STEEL  */ [N, N, N, N, H, H, D, N, N, N, N, H, N, N, D, H, N, D],
  /*DARK   */ [N, H, N, N, N, N, N, N, D, N, N, N, D, N, N, N, H, H],
  /*FAIRY  */ [N, D, N, N, N, H, N, N, N, N, D, N, N, H, N, H, D, N],
];

// Allows easier calculation of combining a single type attacking a double typed pokemon.
const combineTable: Effectiveness[][] = [
  [Effectiveness.ZERO, Effectiveness.ZERO, Effectiveness.ZERO, Effectiveness.ZERO],
  [Effectiveness.ZERO, Effectiveness.QUARTER, Effectiveness.HALF, Effectiveness.NEUTRAL],
  [Effectiveness.ZERO, Effectiveness.HALF, Effectiveness.NEUTRAL, Effectiveness.DOUBLE],
  [Effectiveness.ZERO, Effectiveness.NEUTRAL, Effectiveness.DOUBLE, Effectiveness.QUADRUPLE],
];

function combine(a: Effectiveness, b: Effectiveness): Effectiveness {
  return combineTable[a][b];
}
