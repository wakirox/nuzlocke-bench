// Playtest only (NUZLOCKE_PLAYTEST=1): the bench's maintainer talks to the model playing. A message
// written to the inbox file is handed to the model in its next tool result; it answers with
// report_issue. A benchmark run never has an inbox, so nothing here reaches what it sees.

import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";

/**
 * Takes the message waiting in `file` (emptying it, and keeping what was delivered in
 * `<file>.delivered`), or null when there's none.
 * @param {string} file
 * @returns {() => string | null}
 */
export function createInbox(file) {
  return () => {
    // Read after the tool's own action ran: a file trouble here (deleted or replaced mid-read, a
    // failed write) mustn't fail that call, so the message just waits for a later one.
    try {
      if (!existsSync(file)) return null;
      const text = readFileSync(file, "utf8").trim();
      if (!text) return null;
      writeFileSync(file, "");
      appendFileSync(`${file}.delivered`, `${new Date().toISOString()} ${text.replace(/\r?\n/g, " ")}\n`);
      return text;
    } catch {
      return null;
    }
  };
}

/** How the message reads in the result: who it's from, and how to answer. */
export const inboxText = (message) =>
  `📨 From the bench's maintainer (this run is a playtest): ${message}\n` +
  "To answer, call report_issue with did: \"reply to the maintainer\", expected: \"-\" and your answer in happened " +
  "(it doesn't use up a call); then keep playing.";

/**
 * A tool handler that adds a waiting message to its result. `take` is createInbox's; with none
 * (every run but a playtest with an inbox), the handler as it was.
 * @param {(() => string | null) | null} take
 * @param {(...args: any[]) => Promise<any>} handler
 */
export function withInbox(take, handler) {
  if (!take) return handler;
  return async (...args) => {
    const result = await handler(...args);
    const message = take();
    return message ? { ...result, content: [...(result?.content ?? []), { type: "text", text: inboxText(message) }] } : result;
  };
}
