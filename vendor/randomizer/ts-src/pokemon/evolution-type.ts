export enum EvolutionType {
  LEVEL,
  STONE,
  TRADE,
  TRADE_ITEM,
  HAPPINESS,
  HAPPINESS_DAY,
  HAPPINESS_NIGHT,
  LEVEL_ATTACK_HIGHER,
  LEVEL_DEFENSE_HIGHER,
  LEVEL_ATK_DEF_SAME,
  LEVEL_LOW_PV,
  LEVEL_HIGH_PV,
  LEVEL_CREATE_EXTRA,
  LEVEL_IS_EXTRA,
  LEVEL_HIGH_BEAUTY,
  STONE_MALE_ONLY,
  STONE_FEMALE_ONLY,
  LEVEL_ITEM_DAY,
  LEVEL_ITEM_NIGHT,
  LEVEL_WITH_MOVE,
  LEVEL_WITH_OTHER,
  LEVEL_MALE_ONLY,
  LEVEL_FEMALE_ONLY,
  LEVEL_ELECTRIFIED_AREA,
  LEVEL_MOSS_ROCK,
  LEVEL_ICY_ROCK,
  TRADE_SPECIAL,
  FAIRY_AFFECTION,
  LEVEL_WITH_DARK,
  LEVEL_UPSIDE_DOWN,
  LEVEL_RAIN,
  LEVEL_DAY,
  LEVEL_NIGHT,
  LEVEL_FEMALE_ESPURR,
  LEVEL_GAME,
  LEVEL_DAY_GAME,
  LEVEL_NIGHT_GAME,
  LEVEL_SNOWY,
  LEVEL_DUSK,
  LEVEL_NIGHT_ULTRA,
  STONE_ULTRA,
  NONE,
}

// Index numbers per generation (gen 1 through gen 7)
const indexNumbers: Map<EvolutionType, number[]> = new Map([
  [EvolutionType.LEVEL, [1, 1, 4, 4, 4, 4, 4]],
  [EvolutionType.STONE, [2, 2, 7, 7, 8, 8, 8]],
  [EvolutionType.TRADE, [3, 3, 5, 5, 5, 5, 5]],
  [EvolutionType.TRADE_ITEM, [-1, 3, 6, 6, 6, 6, 6]],
  [EvolutionType.HAPPINESS, [-1, 4, 1, 1, 1, 1, 1]],
  [EvolutionType.HAPPINESS_DAY, [-1, 4, 2, 2, 2, 2, 2]],
  [EvolutionType.HAPPINESS_NIGHT, [-1, 4, 3, 3, 3, 3, 3]],
  [EvolutionType.LEVEL_ATTACK_HIGHER, [-1, 5, 8, 8, 9, 9, 9]],
  [EvolutionType.LEVEL_DEFENSE_HIGHER, [-1, 5, 10, 10, 11, 11, 11]],
  [EvolutionType.LEVEL_ATK_DEF_SAME, [-1, 5, 9, 9, 10, 10, 10]],
  [EvolutionType.LEVEL_LOW_PV, [-1, -1, 11, 11, 12, 12, 12]],
  [EvolutionType.LEVEL_HIGH_PV, [-1, -1, 12, 12, 13, 13, 13]],
  [EvolutionType.LEVEL_CREATE_EXTRA, [-1, -1, 13, 13, 14, 14, 14]],
  [EvolutionType.LEVEL_IS_EXTRA, [-1, -1, 14, 14, 15, 15, 15]],
  [EvolutionType.LEVEL_HIGH_BEAUTY, [-1, -1, 15, 15, 16, 16, 16]],
  [EvolutionType.STONE_MALE_ONLY, [-1, -1, -1, 16, 17, 17, 17]],
  [EvolutionType.STONE_FEMALE_ONLY, [-1, -1, -1, 17, 18, 18, 18]],
  [EvolutionType.LEVEL_ITEM_DAY, [-1, -1, -1, 18, 19, 19, 19]],
  [EvolutionType.LEVEL_ITEM_NIGHT, [-1, -1, -1, 19, 20, 20, 20]],
  [EvolutionType.LEVEL_WITH_MOVE, [-1, -1, -1, 20, 21, 21, 21]],
  [EvolutionType.LEVEL_WITH_OTHER, [-1, -1, -1, 21, 22, 22, 22]],
  [EvolutionType.LEVEL_MALE_ONLY, [-1, -1, -1, 22, 23, 23, 23]],
  [EvolutionType.LEVEL_FEMALE_ONLY, [-1, -1, -1, 23, 24, 24, 24]],
  [EvolutionType.LEVEL_ELECTRIFIED_AREA, [-1, -1, -1, 24, 25, 25, 25]],
  [EvolutionType.LEVEL_MOSS_ROCK, [-1, -1, -1, 25, 26, 26, 26]],
  [EvolutionType.LEVEL_ICY_ROCK, [-1, -1, -1, 26, 27, 27, 27]],
  [EvolutionType.TRADE_SPECIAL, [-1, -1, -1, -1, 7, 7, 7]],
  [EvolutionType.FAIRY_AFFECTION, [-1, -1, -1, -1, -1, 29, 29]],
  [EvolutionType.LEVEL_WITH_DARK, [-1, -1, -1, -1, -1, 30, 30]],
  [EvolutionType.LEVEL_UPSIDE_DOWN, [-1, -1, -1, -1, -1, 28, 28]],
  [EvolutionType.LEVEL_RAIN, [-1, -1, -1, -1, -1, 31, 31]],
  [EvolutionType.LEVEL_DAY, [-1, -1, -1, -1, -1, 32, 32]],
  [EvolutionType.LEVEL_NIGHT, [-1, -1, -1, -1, -1, 33, 33]],
  [EvolutionType.LEVEL_FEMALE_ESPURR, [-1, -1, -1, -1, -1, 34, 34]],
  [EvolutionType.LEVEL_GAME, [-1, -1, -1, -1, -1, -1, 36]],
  [EvolutionType.LEVEL_DAY_GAME, [-1, -1, -1, -1, -1, -1, 37]],
  [EvolutionType.LEVEL_NIGHT_GAME, [-1, -1, -1, -1, -1, -1, 38]],
  [EvolutionType.LEVEL_SNOWY, [-1, -1, -1, -1, -1, -1, 39]],
  [EvolutionType.LEVEL_DUSK, [-1, -1, -1, -1, -1, -1, 40]],
  [EvolutionType.LEVEL_NIGHT_ULTRA, [-1, -1, -1, -1, -1, -1, 41]],
  [EvolutionType.STONE_ULTRA, [-1, -1, -1, -1, -1, -1, 42]],
  [EvolutionType.NONE, [-1, -1, -1, -1, -1, -1, -1]],
]);

// Build reverse indexes: reverseIndexes[genIndex][indexNumber] = EvolutionType
const reverseIndexes: (EvolutionType | null)[][] = Array.from(
  { length: 7 },
  () => new Array<EvolutionType | null>(50).fill(null)
);

for (const [et, indexes] of indexNumbers.entries()) {
  for (let i = 0; i < indexes.length; i++) {
    if (indexes[i] > 0 && reverseIndexes[i][indexes[i]] === null) {
      reverseIndexes[i][indexes[i]] = et;
    }
  }
}

export function evolutionTypeToIndex(
  type: EvolutionType,
  generation: number
): number {
  const indexes = indexNumbers.get(type);
  return indexes ? indexes[generation - 1] : -1;
}

export function evolutionTypeFromIndex(
  generation: number,
  index: number
): EvolutionType | null {
  return reverseIndexes[generation - 1][index] ?? null;
}

export function usesLevel(type: EvolutionType): boolean {
  return (
    type === EvolutionType.LEVEL ||
    type === EvolutionType.LEVEL_ATTACK_HIGHER ||
    type === EvolutionType.LEVEL_DEFENSE_HIGHER ||
    type === EvolutionType.LEVEL_ATK_DEF_SAME ||
    type === EvolutionType.LEVEL_LOW_PV ||
    type === EvolutionType.LEVEL_HIGH_PV ||
    type === EvolutionType.LEVEL_CREATE_EXTRA ||
    type === EvolutionType.LEVEL_IS_EXTRA ||
    type === EvolutionType.LEVEL_MALE_ONLY ||
    type === EvolutionType.LEVEL_FEMALE_ONLY ||
    type === EvolutionType.LEVEL_WITH_DARK ||
    type === EvolutionType.LEVEL_UPSIDE_DOWN ||
    type === EvolutionType.LEVEL_RAIN ||
    type === EvolutionType.LEVEL_DAY ||
    type === EvolutionType.LEVEL_NIGHT ||
    type === EvolutionType.LEVEL_FEMALE_ESPURR ||
    type === EvolutionType.LEVEL_GAME ||
    type === EvolutionType.LEVEL_DAY_GAME ||
    type === EvolutionType.LEVEL_NIGHT_GAME ||
    type === EvolutionType.LEVEL_SNOWY ||
    type === EvolutionType.LEVEL_DUSK ||
    type === EvolutionType.LEVEL_NIGHT_ULTRA
  );
}

export function skipSplitEvo(type: EvolutionType): boolean {
  return (
    type === EvolutionType.LEVEL_HIGH_BEAUTY ||
    type === EvolutionType.LEVEL_NIGHT_ULTRA ||
    type === EvolutionType.STONE_ULTRA
  );
}
