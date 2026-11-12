// A session that plays through a model's API directly, without Claude Code (bench-run.mjs --api):
// no system prompt, no tools but the game's, nothing added to what the model reads. It speaks the
// Anthropic Messages API (Claude, or Ollama's /v1/messages) or the OpenAI chat completions API
// (Ollama, vLLM, OpenRouter…), and writes the same stream-json events as claude -p, so the runner,
// the transcript, the report and the page's model log treat both alike.

import { EventEmitter } from "node:events";
import http from "node:http";
import https from "node:https";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

/**
 * Sent when the context is full (the conversation's input reached the compact window), like Claude
 * Code's compaction: the model writes its own summary, which replaces the conversation.
 */
export const COMPACT_PROMPT =
  "Your context is full and the conversation will be cleared. Write a summary that lets you continue the run: " +
  "where you are, your team, what you were doing and what you planned next. It will replace the conversation.";

/** The first user turn after a compaction: the opening prompt again, with the model's summary. */
export const afterCompaction = (firstTurn, summary) =>
  `${firstTurn}\n\nThe conversation so far was cleared because the context was full. Your summary of it:\n\n${summary}`;

/** Summary requests made before a compaction goes on without one. */
export const SUMMARY_TRIES = 2;

/**
 * A POST like fetch's, with no time limit. fetch gives up when a response hasn't started after
 * 5 minutes, and a non-streamed reply starts only when it's done: a model running partly on
 * the CPU can think longer than that.
 */
export function postNoTimeout(url, { method = "POST", headers = {}, body, signal } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = (u.protocol === "https:" ? https : http).request(u, { method, headers: { ...headers, "content-length": Buffer.byteLength(body ?? "") }, signal }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("error", reject);
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, text: async () => text, json: async () => JSON.parse(text) });
      });
    });
    req.on("error", reject);
    req.end(body);
  });
}

/** API errors retried this many times (2 s, 4 s, 8 s…) before the session ends. */
export const RETRIES = 5;

/** An MCP tool result as Anthropic content blocks (text and images). */
export function mcpToBlocks(result) {
  return (result?.content ?? []).flatMap((c) =>
    c.type === "text" ? [{ type: "text", text: c.text }]
      : c.type === "image" ? [{ type: "image", source: { type: "base64", media_type: c.mimeType ?? "image/png", data: c.data } }]
        : []);
}

/** The game's MCP tools for each API. */
export const anthropicTools = (tools) => tools.map((t) => ({ name: t.name, description: t.description ?? "", input_schema: t.inputSchema }));
export const openaiTools = (tools) =>
  tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description ?? "", parameters: t.inputSchema } }));

/**
 * The conversation (kept in Anthropic's shape) as OpenAI chat messages. Tool results are text in
 * that API, so their images follow them in a user message.
 */
export function toOpenAI(messages) {
  const out = [];
  for (const m of messages) {
    const blocks = typeof m.content === "string" ? [{ type: "text", text: m.content }] : m.content;
    if (m.role === "assistant") {
      const text = blocks.filter((b) => b.type === "text").map((b) => b.text).join("\n");
      const calls = blocks.filter((b) => b.type === "tool_use")
        .map((b) => ({ id: b.id, type: "function", function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } }));
      // Never null: Ollama rejects it, and a turn of only thinking has no text and no calls.
      out.push({ role: "assistant", content: text, ...(calls.length ? { tool_calls: calls } : {}) });
      continue;
    }
    const images = [];
    const texts = [];
    for (const b of blocks) {
      if (b.type === "tool_result") {
        const parts = typeof b.content === "string" ? [{ type: "text", text: b.content }] : b.content ?? [];
        out.push({ role: "tool", tool_call_id: b.tool_use_id, content: parts.filter((p) => p.type === "text").map((p) => p.text).join("\n") });
        images.push(...parts.filter((p) => p.type === "image"));
      } else if (b.type === "text") texts.push({ type: "text", text: b.text });
      else if (b.type === "image") images.push(b);
    }
    const imageParts = images.map((i) => ({ type: "image_url", image_url: { url: `data:${i.source.media_type};base64,${i.source.data}` } }));
    if (texts.length || imageParts.length) {
      out.push({ role: "user", content: !imageParts.length && texts.length === 1 ? texts[0].text : [...texts, ...imageParts] });
    }
  }
  return out;
}

/** An OpenAI chat completion as an Anthropic-shaped message: content blocks and usage. */
export function fromOpenAI(resp) {
  const msg = resp.choices?.[0]?.message ?? {};
  const content = [];
  const reasoning = msg.reasoning ?? msg.reasoning_content;
  if (reasoning?.trim()) content.push({ type: "thinking", thinking: reasoning });
  if (msg.content?.trim()) content.push({ type: "text", text: msg.content });
  for (const c of msg.tool_calls ?? []) {
    let input = {};
    try {
      input = c.function?.arguments ? JSON.parse(c.function.arguments) : {};
    } catch {
      input = { _unparsed: c.function.arguments };
    }
    content.push({ type: "tool_use", id: c.id, name: c.function?.name, input });
  }
  return {
    id: resp.id,
    content,
    usage: { input_tokens: resp.usage?.prompt_tokens ?? 0, output_tokens: resp.usage?.completion_tokens ?? 0 },
  };
}

/** The input a turn read: what decides when the context is full. */
export const contextTokens = (usage) =>
  (usage?.input_tokens ?? 0) + (usage?.cache_read_input_tokens ?? 0) + (usage?.cache_creation_input_tokens ?? 0);

/**
 * One model call. `api` is "anthropic" or "openai"; the reply is Anthropic-shaped either way.
 * Thinking blocks from the OpenAI API are shown in the transcript but not sent back. With `textOnly`
 * the model can't call a tool: the Anthropic API keeps the tools (a conversation with tool calls needs
 * them) with tool_choice none; the OpenAI API gets none, which Ollama honours where tool_choice isn't.
 */
export async function callModel({ api, baseUrl, apiKey, model, maxOutput, messages, tools, textOnly = false, fetchImpl = postNoTimeout, signal }) {
  if (api === "anthropic") {
    const res = await fetchImpl(`${baseUrl}/v1/messages`, {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", "anthropic-version": "2023-06-01", ...(apiKey ? { "x-api-key": apiKey } : {}) },
      body: JSON.stringify({
        model, max_tokens: maxOutput, messages,
        ...(tools.length ? { tools: anthropicTools(tools), ...(textOnly ? { tool_choice: { type: "none" } } : {}) } : {}),
      }),
    });
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 300)}`);
    const body = await res.json();
    return { id: body.id, content: body.content ?? [], usage: body.usage ?? {} };
  }
  const res = await fetchImpl(`${baseUrl}/chat/completions`, {
    method: "POST",
    signal,
    headers: { "content-type": "application/json", ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
    body: JSON.stringify({ model, max_tokens: maxOutput, messages: toOpenAI(messages), ...(tools.length && !textOnly ? { tools: openaiTools(tools) } : {}) }),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 300)}`);
  return fromOpenAI(await res.json());
}

/**
 * The model's thinking isn't sent back through the OpenAI API, and an Anthropic thinking block
 * goes back as it came (with its signature).
 */
const forHistory = (api, content) => (api === "openai" ? content.filter((b) => b.type !== "thinking") : content);

/**
 * Plays turns through the API: send(text) starts a user turn; the model's tool calls go to the
 * game's MCP server until it answers without one. Emits "event" (stream-json shaped: assistant,
 * user, system compact_boundary, result) and "exit" (code), like the claude process.
 */
export class DirectSession extends EventEmitter {
  constructor({ api, baseUrl, apiKey, model, server, compactWindow, maxOutput = 16384, connect = connectMcp, fetchImpl = postNoTimeout }) {
    super();
    Object.assign(this, { api, baseUrl: baseUrl.replace(/\/$/, ""), apiKey, model, server, compactWindow, maxOutput, connect, fetchImpl });
    this.messages = [];
    this.firstTurn = null;
    this.turns = 0;
    this.queue = Promise.resolve();
    this.abort = new AbortController();
    this.closed = false;
  }

  async start() {
    this.mcp = await this.connect(this.server);
    this.tools = (await this.mcp.listTools()).tools;
    this.emit("event", { type: "system", subtype: "init", model: this.model, tools: this.tools.map((t) => t.name) });
  }

  send(text) {
    this.firstTurn ??= text;
    this.queue = this.queue.then(() => this.turn(text)).catch((e) => this.finish(1, e));
  }

  /** No more turns: close once the current one is done. */
  end() {
    this.queue = this.queue.then(() => this.finish(0));
  }

  kill() {
    this.abort.abort();
    this.queue = this.queue.then(() => this.finish(143));
  }

  async finish(code, error) {
    if (this.closed) return;
    this.closed = true;
    if (error && !this.abort.signal.aborted) {
      this.emit("event", { type: "result", subtype: "success", is_error: true, result: String(error.message ?? error), num_turns: this.turns });
    }
    await this.mcp?.close().catch(() => {});
    this.emit("exit", code);
  }

  async ask(tools, textOnly = false) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await callModel({ ...this, messages: this.messages, tools, textOnly, signal: this.abort.signal });
      } catch (e) {
        if (this.abort.signal.aborted || attempt >= RETRIES) throw e;
        await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
      }
    }
  }

  async turn(text) {
    if (this.closed) return;
    this.messages.push({ role: "user", content: [{ type: "text", text }] });
    let lastText = "";
    for (;;) {
      const reply = await this.ask(this.tools);
      this.turns++;
      this.messages.push({ role: "assistant", content: forHistory(this.api, reply.content) });
      this.emit("event", { type: "assistant", message: { id: reply.id ?? `turn-${this.turns}`, model: this.model, content: reply.content, usage: reply.usage } });
      const calls = reply.content.filter((b) => b.type === "tool_use");
      const said = reply.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
      if (said) lastText = said;
      if (!calls.length) {
        this.emit("event", { type: "result", subtype: "success", is_error: false, result: lastText, num_turns: this.turns });
        return;
      }
      const results = [];
      for (const c of calls) {
        let block;
        try {
          // Some game tools (hunt, a whole battle) run for minutes: the SDK's 60 s default is too short.
          const r = await this.mcp.callTool({ name: c.name, arguments: c.input ?? {} }, undefined, { timeout: 30 * 60_000 });
          block = { type: "tool_result", tool_use_id: c.id, content: mcpToBlocks(r), ...(r.isError ? { is_error: true } : {}) };
        } catch (e) {
          block = { type: "tool_result", tool_use_id: c.id, content: [{ type: "text", text: String(e.message ?? e) }], is_error: true };
        }
        results.push(block);
      }
      this.messages.push({ role: "user", content: results });
      this.emit("event", { type: "user", message: { role: "user", content: results } });
      if (this.compactWindow && contextTokens(reply.usage) >= this.compactWindow) await this.compact(contextTokens(reply.usage));
      if (this.closed) return;
    }
  }

  /**
   * The model summarizes the run; the summary, after the opening prompt, replaces the conversation.
   * It can't call a tool meanwhile, and a reply without text is asked for again.
   */
  async compact(preTokens) {
    this.messages.at(-1).content.push({ type: "text", text: COMPACT_PROMPT });
    let summary = "";
    for (let i = 0; i < SUMMARY_TRIES && !summary; i++) {
      const reply = await this.ask(this.tools, true);
      this.turns++;
      this.emit("event", { type: "assistant", message: { id: reply.id ?? `turn-${this.turns}`, model: this.model, content: reply.content, usage: reply.usage } });
      summary = reply.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    }
    summary ||= "(no summary)";
    this.messages = [{ role: "user", content: [{ type: "text", text: afterCompaction(this.firstTurn, summary) }] }];
    this.emit("event", { type: "system", subtype: "compact_boundary", compact_metadata: { trigger: "auto", pre_tokens: preTokens }, summary });
  }
}

/** The game's MCP server over stdio, from its config entry ({ command, args, env }). */
export async function connectMcp({ command, args, env }) {
  const client = new Client({ name: "nuzlocke-bench-runner", version: "1.0.0" });
  await client.connect(new StdioClientTransport({ command, args, env: { ...process.env, ...env }, stderr: "inherit" }));
  return client;
}
