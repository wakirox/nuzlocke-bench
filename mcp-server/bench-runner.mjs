// Benchmark runner logic (scripts/bench-run.mjs runs it): one Claude Code session plays one
// run through the MCP server. Nobody answers the model, so when it ends its turn before the
// run is over (to ask for help, or to report it's stuck) it only gets a neutral nudge to keep
// playing — never a hint. How many nudges it needed is part of the result.

import { stateOutcome } from "./run-log.mjs";

/** The whole prompt: what to do, nothing about how. */
export const PROMPT =
  "You are playing a Pokémon benchmark run through the nuzlocke-bench tools. Start by reading the rules with get_rules, " +
  "then play until the run is over (won or lost). Every decision is yours; nobody will answer questions, so don't stop to ask — keep playing.";

/** The prompt for a run continued from another's saves (--resume): the same, plus where to look first. */
export const RESUME_PROMPT =
  "You are continuing a Pokémon benchmark run already in progress, through the nuzlocke-bench tools. Read the rules with get_rules, " +
  "see where things stand with get_state and your notes, then play until the run is over (won or lost). " +
  "Every decision is yours; nobody will answer questions, so don't stop to ask — keep playing.";

/**
 * Added to every run's first turn unless --no-report: report_issue is how the model tells us what in
 * the tools let it down (npm run bench:friction). A playtest asks for it more strongly instead.
 */
export const REPORT =
  " If a tool lets you down (a result that doesn't match the screen, a map that looks wrong, an error you don't understand, " +
  "something that takes many tries), say so with report_issue — it doesn't use up a tool call — then keep playing.";

/**
 * Added with --playtest: a run that tests the tools, not the model. It gets report_issue and is
 * asked to use it whenever a tool lets it down. Such runs aren't benchmark results.
 */
export const PLAYTEST =
  " This run is a playtest of the tools, not a scored run. Play toward the goal as usual, and whenever a tool lets you down, " +
  "call report_issue: a result that doesn't match what the screen shows, a map that looks wrong, a move that fails where it " +
  "looks like it should work, an error you don't understand, or something that takes many tries. Say what you did, what you " +
  "expected and what happened. Use get_screen to compare whenever it helps. Then keep playing.";

/** Added to the first turn of a run with the hint tool (preset option "hints"): where to look when lost. */
export const HINTS = " When you're not sure where to go next in the story, the hint tool tells you (each hint uses a tool call).";

/** Sent when the model stops before the run is over. */
export const NUDGE = "The run isn't over. Keep playing.";

/** True when a tool result says the run ended: format.mjs puts 🏁 RUN ENDED on it, get_state has it as run.outcome. */
export const runEnded = (toolResultText) => /🏁 RUN ENDED/.test(toolResultText ?? "") || !!stateOutcome(toolResultText ?? "");

/**
 * The preset a run log says it was played under (its newest session line), or null: what a run to
 * continue goes by when it left no agent.json (stopped by a reboot or a crash).
 */
export function loggedPreset(runLogText) {
  let id = null;
  for (const line of String(runLogText ?? "").split("\n")) {
    if (!line.startsWith('{"type":"session"')) continue;
    try {
      id = JSON.parse(line).benchmark?.id ?? id;
    } catch {
      /* a line cut short by the stop */
    }
  }
  return id;
}

/** Nudges a run gets, and nudges in a row answered without a tool call: past either, the model has given up and the run is over. */
export const GIVE_UP_AFTER = 3;

/**
 * After the model ends a turn: "nudge" to make it go on, or why the session stops.
 * `result` is the stream-json result event (subtype, total_cost_usd); `idleNudges` counts the
 * nudges in a row after which it made no tool call.
 */
export function nextStep({ ended, result, nudges, maxNudges, maxTokens = Infinity, tokens = 0, idleNudges = 0 }) {
  if (ended) return { stop: "the run is over" };
  // The turn failed (a usage or session limit, an API error): the model didn't stop, the session did.
  // The CLI reports it as subtype "success" with is_error set; nudging would only repeat it.
  if (result?.is_error) return { stop: `the session ended: ${String(result.result ?? result.subtype ?? "error").slice(0, 200)}` };
  if (idleNudges >= GIVE_UP_AFTER) return { stop: `gave up: ${GIVE_UP_AFTER} nudges in a row without playing`, gaveUp: true };
  if (result?.subtype && result.subtype !== "success") return { stop: `the session ended: ${result.subtype}` };
  if (tokens >= maxTokens) return { stop: `token limit reached (${mTokens(maxTokens)})` };
  if (nudges >= maxNudges) return { stop: `gave up: still not over after ${maxNudges} nudges`, gaveUp: true };
  return { nudge: true };
}

/** The game server's MCP config: headless, under the preset, with its own port, saves and run log. */
export function mcpConfig({ node, server, rom, preset, port, savesDir, runLog, headed, playtest, grid, effectiveness, report = true }) {
  return {
    mcpServers: {
      "nuzlocke-bench": {
        command: node,
        args: [server],
        env: {
          NUZLOCKE_HEADLESS: "1",
          ...(headed ? { NUZLOCKE_HEADED: headed === "fast" ? "fast" : "1" } : {}),
          ...(playtest ? { NUZLOCKE_PLAYTEST: "1" } : {}),
          ...(report || playtest ? {} : { NUZLOCKE_REPORT_ISSUE: "0" }),
          ...(grid ? { NUZLOCKE_GRID: grid } : {}),
          ...(effectiveness ? { NUZLOCKE_EFFECTIVENESS: effectiveness } : {}),
          NUZLOCKE_BENCHMARK: preset,
          NUZLOCKE_ROM: rom,
          NUZLOCKE_BRIDGE_PORT: String(port),
          NUZLOCKE_SAVES_DIR: savesDir,
          NUZLOCKE_RUN_LOG: runLog,
        },
      },
    },
  };
}

/**
 * claude -p arguments: only the game's tools, no settings or other MCP servers, no saved session
 * for a later run to find, turns fed on stdin. (The runner also turns auto-memory off and starts
 * claude in an empty folder: see runnerEnv and bench-run.mjs.)
 */
export function claudeArgs({ model, effort, configFile }) {
  return [
    "-p",
    "--model", model,
    ...(effort ? ["--effort", effort] : []),
    "--mcp-config", configFile,
    "--strict-mcp-config",
    "--setting-sources", "",
    "--tools", "",
    "--allowedTools", "mcp__nuzlocke-bench",
    "--permission-mode", "dontAsk",
    "--no-session-persistence",
    // No --max-budget-usd: Claude Code tells the model its dollar budget ("USD budget: $12/$25"), and
    // the models quit runs "to save budget" with most of their tool calls left. The runner's safety
    // stop is in tokens and the model isn't told; it only knows its tool-call budget, the same for all.
    "--input-format", "stream-json",
    "--output-format", "stream-json",
    "--verbose",
  ];
}

/**
 * The session's tokens and model turns (API calls), for the runner's safety stop and the record.
 * "Total" is every token the model processed: input, cache writes and reads, output.
 *
 * While a turn plays, the count comes from its assistant messages: a message's usage is repeated on
 * each of its content events, so it's counted once per message id. That count runs low (the output
 * figure on those events is an early one, and a compaction's own call isn't among them), so each
 * turn's result event replaces it with the session's own figures: modelUsage, which adds up over
 * the whole session, or else the turn's usage. A result with neither (a session on the model's API)
 * leaves the messages' count as it is.
 */
export class TokenMeter {
  constructor() {
    this.settled = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, turns: 0 };
    this.byMessage = new Map();
  }
  /** Feed every stream-json event. */
  add(ev) {
    if (ev.type === "assistant" && ev.message?.id && ev.message.usage) this.byMessage.set(ev.message.id, ev.message.usage);
    if (ev.type !== "result") return;
    const models = Object.values(ev.modelUsage ?? {});
    const turns = this.settled.turns + (ev.num_turns ?? this.byMessage.size);
    if (models.length) {
      const sum = (key) => models.reduce((n, m) => n + (m[key] ?? 0), 0);
      this.settled = { input: sum("inputTokens"), output: sum("outputTokens"), cacheWrite: sum("cacheCreationInputTokens"), cacheRead: sum("cacheReadInputTokens"), turns };
    } else if (ev.usage) {
      const u = ev.usage;
      this.settled = {
        input: this.settled.input + (u.input_tokens ?? 0), output: this.settled.output + (u.output_tokens ?? 0),
        cacheWrite: this.settled.cacheWrite + (u.cache_creation_input_tokens ?? 0), cacheRead: this.settled.cacheRead + (u.cache_read_input_tokens ?? 0), turns,
      };
    } else return;
    this.byMessage.clear();
  }
  totals() {
    const t = { ...this.settled, total: 0, turns: this.settled.turns + this.byMessage.size };
    for (const u of this.byMessage.values()) {
      t.input += u.input_tokens ?? 0;
      t.output += u.output_tokens ?? 0;
      t.cacheWrite += u.cache_creation_input_tokens ?? 0;
      t.cacheRead += u.cache_read_input_tokens ?? 0;
    }
    t.total = t.input + t.output + t.cacheWrite + t.cacheRead;
    return t;
  }
}

/** Tokens as "12.3M". */
export const mTokens = (n) => `${(n / 1e6).toFixed(1)}M`;

/**
 * The context window every model plays with, in tokens: Claude Code compacts the conversation when
 * it fills up (CLAUDE_CODE_AUTO_COMPACT_WINDOW). The same for every model, whatever its own window
 * (Haiku 5.5's is 1M, which a run never fills: the context only grew, and with it what each turn
 * re-reads, 270M tokens in one run). Notes and routes live in the harness and survive a compaction.
 */
export const COMPACT_WINDOW = 200_000;

/**
 * claude's environment for a run: no auto-memory, so nothing is read from or kept for other
 * sessions, and the compaction window (0: the model's own).
 */
export const runnerEnv = (env, compactWindow = COMPACT_WINDOW) => ({
  ...env,
  CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
  ...(compactWindow > 0 ? { CLAUDE_CODE_AUTO_COMPACT_WINDOW: String(compactWindow) } : {}),
});

/** A user turn on claude's stream-json stdin. */
export const userTurn = (text) => JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "text", text }] } }) + "\n";
