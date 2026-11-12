// What to look for on screen when the model names a menu option. Results show a shop line as
// "ITEM A ¥200" and a bag line as "ITEM B × 1", but on the Game Boy's screen the price or
// quantity sits apart from the name, so only the name can be matched.

/** The option without a trailing price or quantity (or scroll arrow), as copied from a result. */
export function menuLabel(option: string): string {
  const name = option.replace(/[▼▲\s]+$/, "").replace(/\s*(?:¥\s*\d+|×\s*\d+)$/, "").trim();
  return name || option;
}
