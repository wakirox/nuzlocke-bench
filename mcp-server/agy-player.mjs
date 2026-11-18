// Runs through the Antigravity CLI (agy): official with these limits (docs/benchmark.md, "Official results").
// agy can't be started with only the game's tools: it always lists its built-in ones (files, commands, the web,
// a browser, subagents). So the runner denies every built-in action in the session's settings, gives agy one MCP
// server, the game's, in a workspace of its own, and checks every call the model makes: a call to anything but
// the game stops the run, and the transcript (agy's events, put in Claude Code's shape for the reports) shows it.
//
// agy's stream-json (agy 1.5.11): stdin takes {"event":"user","message":{"content":"…"}} lines, one turn each;
// stdout gives one "init" event, then "step_update" events (step_type user_input, agent_response, tool…, each
// ACTIVE then DONE), then a "result" event per turn, with the session's usage so far.

/** The game's server name in agy's workspace: its tools reach the model as mcp_bench_<tool>. */
export const AGY_SERVER = "bench";

/** Every built-in action agy has a permission for, denied (agy's settings: action(target), deny wins). */
export const AGY_DENIED = [
  "command(*)",
  "read_file(*)",
  "write_file(*)",
  "read_url(*)",
  "execute_url(*)",
  "download_url(*)",
  "unsandboxed(*)",
];

/** The session's settings (agy --settings): the built-ins denied, the game's server allowed. */
export const agySettings = () => ({ permissions: { deny: AGY_DENIED, allow: [`mcp(${AGY_SERVER}/*)`] } });

/**
 * agy's arguments: turns as stream-json on stdin, events on stdout, the settings above.
 * @param {{ model: string, effort?: string | null }} opts
 */
export function agyArgs({ model, effort = null }) {
  return [
    "--input-format", "stream-json",
    "--output-format", "stream-json",
    "--model", model,
    ...(effort ? ["--effort", effort] : []),
    "--settings", JSON.stringify(agySettings()),
  ];
}

/** A user turn on agy's stream-json stdin. */
export const agyTurn = (text) => JSON.stringify({ event: "user", message: { content: text } }) + "\n";

/**
 * The workspace's MCP config (.agents/mcp_config.json): the game's server only, each tool registered
 * directly ("eager") so the model calls it by name, not through agy's lazy call_mcp_tool.
 */
export function agyWorkspaceConfig(server, toolNames) {
  const { command, args, env } = server;
  return { mcpServers: { [AGY_SERVER]: { command, args, env, tools: Object.fromEntries(toolNames.map((t) => [t, { eager: true }])) } } };
}

/** agy's name for a game tool (mcp_bench_get_state) as Claude Code names it (mcp__nuzlocke-bench__get_state); null if it isn't one. */
export function gameToolName(agyName) {
  const prefix = `mcp_${AGY_SERVER}_`;
  return typeof agyName === "string" && agyName.startsWith(prefix) && agyName.length > prefix.length
    ? `mcp__nuzlocke-bench__${agyName.slice(prefix.length)}`
    : null;
}

/** agy starts a tool's output with when it ran: not part of what the game returned. */
export const withoutTimes = (output) => String(output ?? "").replace(/^Created At: [^\n]*\n(?:Completed At: [^\n]*\n)?/, "");

const tokensOf = (u) => ({
  input: u?.input_tokens ?? 0,
  output: (u?.output_tokens ?? 0) + (u?.thinking_tokens ?? 0),
  cacheRead: u?.cache_read_tokens ?? 0,
});

/**
 * Puts agy's events in Claude Code's stream-json shape, which the runner and the reports read: the init
 * (agy's own tool list kept as it is, marked via "agy"), the model's text and tool calls as assistant
 * events, the game's results as user events, and a result per turn with that turn's tokens.
 * `translate` returns those events and, when the model reached for anything but the game, its name.
 */
export class AgyTranslator {
  constructor({ denied = AGY_DENIED } = {}) {
    this.denied = denied;
    this.texts = new Map(); // agent_response step → its text so far
    this.session = { input: 0, output: 0, cacheRead: 0 }; // agy's usage at the last result (it adds up)
    this.responses = 0; // the model's replies since the last result: its API calls this turn
  }

  /** @returns {{ events: any[], forbidden: string | null }} */
  translate(ev) {
    if (ev?.event === "init") {
      const i = ev.init ?? {};
      return {
        events: [{
          type: "system", subtype: "init", via: "agy",
          session_id: ev.conversation_id ?? null, model: i.model ?? null, cwd: i.cwd ?? null,
          // agy lists its built-ins whatever is denied: the record is the calls (report.mjs, otherToolsOf).
          tools: i.tools ?? [], permission_mode: i.permission_mode ?? null, denied: this.denied,
          mcp_servers: [{ name: "nuzlocke-bench", status: "connected" }],
        }],
        forbidden: null,
      };
    }
    if (ev?.event === "result") return { events: [this.#result(ev.result ?? {})], forbidden: null };
    if (ev?.event !== "step_update") return { events: [], forbidden: null };
    const s = ev.step_update ?? {};
    const key = `${s.conversation_id ?? ""}:${s.step_index}`;
    if (s.subagent_info) return { events: [], forbidden: "a subagent" };
    if (s.step_type === "agent_response") {
      this.texts.set(key, (this.texts.get(key) ?? "") + (s.text_delta ?? ""));
      if (s.state !== "DONE") return { events: [], forbidden: null };
      const text = this.texts.get(key);
      this.texts.delete(key);
      this.responses++;
      const t = tokensOf(s.usage);
      return {
        events: [{
          type: "assistant",
          message: {
            id: `agy-${key}`, role: "assistant", content: text ? [{ type: "text", text }] : [],
            usage: { input_tokens: t.input, output_tokens: t.output, cache_read_input_tokens: t.cacheRead },
          },
        }],
        forbidden: null,
      };
    }
    if (s.step_type !== "tool") return { events: [], forbidden: null };
    const agyName = s.tool_name ?? s.tool_info?.name ?? "unknown tool";
    const game = gameToolName(agyName);
    // Caught as it starts: the runner stops agy before a built-in tool gets far.
    if (s.state !== "DONE") return { events: [], forbidden: game ? null : agyName };
    const info = s.tool_info ?? {};
    const id = `agy-${key}`;
    const result = info.error ? String(info.error.message ?? info.error.type ?? "error") : withoutTimes(info.output);
    return {
      events: [
        { type: "assistant", message: { id: `${id}-call`, role: "assistant", content: [{ type: "tool_use", id, name: game ?? agyName, input: info.parameters ?? {} }] } },
        { type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content: result, ...(info.error ? { is_error: true } : {}) }] } },
      ],
      forbidden: game ? null : agyName,
    };
  }

  #result(r) {
    const now = tokensOf(r.usage);
    const turn = { input: now.input - this.session.input, output: now.output - this.session.output, cacheRead: now.cacheRead - this.session.cacheRead };
    this.session = now;
    const responses = this.responses;
    this.responses = 0;
    const ok = r.status === "SUCCESS";
    return {
      type: "result",
      subtype: ok ? "success" : `error_${String(r.status ?? "unknown").toLowerCase()}`,
      is_error: !ok,
      result: ok ? (r.response ?? "") : String(r.error ?? r.status ?? "error"),
      num_turns: responses,
      session_id: r.conversation_id ?? null,
      duration_ms: Math.round((r.duration_seconds ?? 0) * 1000),
      usage: { input_tokens: Math.max(0, turn.input), output_tokens: Math.max(0, turn.output), cache_read_input_tokens: Math.max(0, turn.cacheRead) },
    };
  }
}
