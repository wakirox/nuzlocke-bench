/**
 * Type ids as the battle structs hold them (pret's constants/type_constants.asm; Gen 1 has no STEEL
 * or DARK, and its ids are the same for the rest). A battler's types in battle can differ from its
 * species' (some moves change them): the battle struct has the ones in force.
 */
const TYPE_NAMES: Record<number, string> = {
  0x00: "NORMAL", 0x01: "FIGHTING", 0x02: "FLYING", 0x03: "POISON", 0x04: "GROUND", 0x05: "ROCK",
  0x07: "BUG", 0x08: "GHOST", 0x09: "STEEL",
  0x14: "FIRE", 0x15: "WATER", 0x16: "GRASS", 0x17: "ELECTRIC", 0x18: "PSYCHIC", 0x19: "ICE", 0x1a: "DRAGON", 0x1b: "DARK",
};

/** The battler's types from its two type bytes (one type is stored twice), or undefined if a byte isn't a type. */
export function battleTypes(t1: number, t2: number): string[] | undefined {
  const a = TYPE_NAMES[t1];
  const b = TYPE_NAMES[t2];
  if (!a || !b) return undefined;
  return a === b ? [a] : [a, b];
}
