export enum Type {
  NORMAL,
  FIGHTING,
  FLYING,
  GRASS,
  WATER,
  FIRE,
  ROCK,
  GROUND,
  PSYCHIC,
  BUG,
  DRAGON,
  ELECTRIC,
  GHOST,
  POISON,
  ICE,
  STEEL,
  DARK,
  FAIRY,
  GAS,
  WOOD,
  ABNORMAL,
  WIND,
  SOUND,
  LIGHT,
  TRI,
}

const hackOnlyTypes: ReadonlySet<Type> = new Set([
  Type.GAS,
  Type.WOOD,
  Type.ABNORMAL,
  Type.WIND,
  Type.SOUND,
  Type.LIGHT,
  Type.TRI,
]);

export function isHackOnly(type: Type): boolean {
  return hackOnlyTypes.has(type);
}

const ALL_VALUES: readonly Type[] = Object.values(Type).filter(
  (v) => typeof v === "number"
) as Type[];

export const GEN1: readonly Type[] = ALL_VALUES.slice(0, Type.ICE + 1);
export const GEN2THROUGH5: readonly Type[] = ALL_VALUES.slice(
  0,
  Type.DARK + 1
);
export const GEN6PLUS: readonly Type[] = ALL_VALUES.slice(0, Type.FAIRY + 1);

export function getAllTypes(generation: number): readonly Type[] {
  switch (generation) {
    case 1:
      return GEN1;
    case 2:
    case 3:
    case 4:
    case 5:
      return GEN2THROUGH5;
    default:
      return GEN6PLUS;
  }
}

export function randomType(random: () => number): Type {
  return ALL_VALUES[Math.floor(random() * ALL_VALUES.length)];
}

export function camelCase(str: string): string {
  const chars = str.toLowerCase().split("");
  let doCap = true;
  for (let j = 0; j < chars.length; j++) {
    const current = chars[j];
    if (doCap && /[a-zA-Z]/.test(current)) {
      chars[j] = current.toUpperCase();
      doCap = false;
    } else {
      if (!doCap && !/[a-zA-Z]/.test(current) && current !== "'" && current !== "\u2019") {
        doCap = true;
      }
    }
  }
  return chars.join("");
}

export function typeCamelCase(type: Type): string {
  return camelCase(Type[type]);
}
