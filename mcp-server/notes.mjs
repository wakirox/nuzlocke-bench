// The model's own notes for a run: kept outside the conversation, so what it learned survives
// when a long run's context is summarized. Plain text in the run's saves folder
// (model-notes.txt: not a .json, so the page's backup restore doesn't pick it up), cleared
// when a new run starts.

import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const NOTES_MAX = 20_000;

/** The notes as a list of entries: one per line in the file. */
export const entriesOf = (text) => (text ? text.split("\n").filter((l) => l.trim()) : []);

/** The entries numbered from 1, the way the model sees them and refers to them. */
export const numbered = (entries) => entries.map((e, i) => `${i + 1}. ${e}`).join("\n");

/**
 * The notes after a write: `clear` empties the list, then `remove` takes out entries by number
 * (as last listed), then `add` puts new entries at the end. An entry is one line.
 */
export function updateNotes(current, { add, remove, clear } = {}) {
  let entries = clear ? [] : entriesOf(current);
  if (remove?.length) {
    const bad = remove.filter((n) => !Number.isInteger(n) || n < 1 || n > entries.length);
    if (bad.length) throw new Error(`No entry ${bad.join(", ")}: the notes have ${entries.length} entries.`);
    const gone = new Set(remove);
    entries = entries.filter((_, i) => !gone.has(i + 1));
  }
  const adds = add == null ? [] : Array.isArray(add) ? add : [add];
  entries = [...entries, ...adds.map((a) => String(a).replace(/\s*\n\s*/g, " / ").trim()).filter(Boolean)];
  const next = entries.join("\n");
  if (next.length > NOTES_MAX) throw new Error(`Notes are limited to ${NOTES_MAX} characters (these would be ${next.length}): remove or shorten entries.`);
  return next;
}

/** Notes kept in `dir`. */
export function notesStore(dir) {
  const file = join(dir, "model-notes.txt");
  return {
    read: () => (existsSync(file) ? readFileSync(file, "utf8") : ""),
    write: (text) => writeFileSync(file, text),
    clear: () => rmSync(file, { force: true }),
  };
}
