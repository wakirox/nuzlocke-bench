// The direct API session: MCP blocks and OpenAI messages converted both ways, model calls, turns, compaction and exit.

import { describe, expect, it, vi } from "vitest";
// @ts-expect-error plain ESM module without type declarations
import { DirectSession, afterCompaction, callModel, contextTokens, fromOpenAI, mcpToBlocks, postNoTimeout, toOpenAI } from "../../mcp-server/direct-session.mjs";
import { createServer } from "node:http";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** The request body as the tests read it: the JSON the session sent. */
type SentBody = { [key: string]: unknown };

/** An event the session emits, as the tests read it. */
interface SessionEvent {
  type: string;
  subtype?: string;
  tools?: string[];
  message: { content: unknown[] };
  [key: string]: unknown;
}

/** A fake fetch that answers each call with the next reply, and records what was sent. */
function fakeFetch(replies: unknown[]) {
  const calls: { url: string; body: SentBody; headers: Record<string, string> }[] = [];
  let i = 0;
  const fn = async (url: string, init: { body: string; headers: Record<string, string> }) => {
    calls.push({ url, body: JSON.parse(init.body), headers: init.headers });
    return json(replies[i++]);
  };
  return { fn, calls };
}

const toolCallReply = {
  id: "r1",
  choices: [{ message: { content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "get_rules", arguments: "{}" } }] } }],
  usage: { prompt_tokens: 20, completion_tokens: 5 },
};
const textReply = (text: string, promptTokens = 30) => ({
  id: "r2",
  choices: [{ message: { content: text } }],
  usage: { prompt_tokens: promptTokens, completion_tokens: 2 },
});

/** A fake MCP client with one tool, get_rules. */
function fakeClient() {
  return {
    listTools: async () => ({ tools: [{ name: "get_rules", description: "", inputSchema: { type: "object" } }] }),
    callTool: vi.fn(async () => ({ content: [{ type: "text", text: "ok" }] })),
    close: vi.fn(async () => {}),
  };
}

describe("direct session", () => {
  describe("MCP results as content blocks", () => {
    it("turns text and image content into Anthropic blocks", () => {
      expect(mcpToBlocks({ content: [{ type: "text", text: "hi" }, { type: "image", data: "AAA", mimeType: "image/jpeg" }] })).toEqual([
        { type: "text", text: "hi" },
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "AAA" } },
      ]);
    });

    it("defaults an image without a mime type to PNG", () => {
      expect(mcpToBlocks({ content: [{ type: "image", data: "BBB" }] })).toEqual([
        { type: "image", source: { type: "base64", media_type: "image/png", data: "BBB" } },
      ]);
    });

    it("drops content types it doesn't know", () => {
      expect(mcpToBlocks({ content: [{ type: "resource", resource: {} }, { type: "text", text: "kept" }] })).toEqual([{ type: "text", text: "kept" }]);
    });

    it("gives no blocks when the result has no content", () => {
      expect(mcpToBlocks({})).toEqual([]);
      expect(mcpToBlocks(undefined)).toEqual([]);
    });
  });

  describe("conversation as OpenAI messages", () => {
    it("sends an assistant turn of only thinking as empty text, never null (Ollama rejects null)", () => {
      expect(toOpenAI([{ role: "assistant", content: [] }])).toEqual([{ role: "assistant", content: "" }]);
    });

    it("sends a user string as the message content", () => {
      expect(toOpenAI([{ role: "user", content: "hi" }])).toEqual([{ role: "user", content: "hi" }]);
    });

    it("sends assistant text as content and tool calls with JSON arguments", () => {
      const out = toOpenAI([
        { role: "assistant", content: [{ type: "text", text: "let me look" }, { type: "tool_use", id: "t1", name: "get_rules", input: { a: 1 } }] },
      ]);
      expect(out).toEqual([
        {
          role: "assistant",
          content: "let me look",
          tool_calls: [{ id: "t1", type: "function", function: { name: "get_rules", arguments: '{"a":1}' } }],
        },
      ]);
    });

    it("sends a tool result as a tool message with its text joined", () => {
      const out = toOpenAI([
        { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: [{ type: "text", text: "a" }, { type: "text", text: "b" }] }] },
      ]);
      expect(out).toEqual([{ role: "tool", tool_call_id: "t1", content: "a\nb" }]);
    });

    it("sends a tool result's images in a user message after it, as data URIs", () => {
      const out = toOpenAI([
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "t1",
              content: [{ type: "text", text: "look" }, { type: "image", source: { type: "base64", media_type: "image/png", data: "ZZ" } }],
            },
          ],
        },
      ]);
      expect(out).toEqual([
        { role: "tool", tool_call_id: "t1", content: "look" },
        { role: "user", content: [{ type: "image_url", image_url: { url: "data:image/png;base64,ZZ" } }] },
      ]);
    });

    it("doesn't send thinking blocks back", () => {
      const out = toOpenAI([
        { role: "assistant", content: [{ type: "thinking", thinking: "hmm", signature: "s" }, { type: "text", text: "ok" }] },
      ]);
      expect(out).toEqual([{ role: "assistant", content: "ok" }]);
    });
  });

  describe("OpenAI replies as Anthropic-shaped messages", () => {
    it("maps reasoning to thinking, content to text and tool calls to tool_use with parsed input", () => {
      const reply = fromOpenAI({
        id: "r1",
        choices: [
          {
            message: {
              reasoning: "think",
              content: "hello",
              tool_calls: [{ id: "c1", type: "function", function: { name: "get_rules", arguments: '{"q":"x"}' } }],
            },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 4 },
      });
      expect(reply).toEqual({
        id: "r1",
        content: [
          { type: "thinking", thinking: "think" },
          { type: "text", text: "hello" },
          { type: "tool_use", id: "c1", name: "get_rules", input: { q: "x" } },
        ],
        usage: { input_tokens: 10, output_tokens: 4 },
      });
    });

    it("keeps arguments that aren't valid JSON as _unparsed", () => {
      const reply = fromOpenAI({
        id: "r1",
        choices: [{ message: { tool_calls: [{ id: "c1", type: "function", function: { name: "get_rules", arguments: "{oops" } }] } }],
      });
      expect(reply.content).toEqual([{ type: "tool_use", id: "c1", name: "get_rules", input: { _unparsed: "{oops" } }]);
    });
  });

  describe("context size", () => {
    it("adds input, cache read and cache creation tokens", () => {
      expect(contextTokens({ input_tokens: 10, cache_read_input_tokens: 20, cache_creation_input_tokens: 5 })).toBe(35);
    });

    it("counts missing fields as zero", () => {
      expect(contextTokens({ input_tokens: 7 })).toBe(7);
      expect(contextTokens(undefined)).toBe(0);
    });
  });

  describe("posting without a time limit", () => {
    it("posts the body with its headers and returns status, text and JSON, also for an error", async () => {
      const server = createServer((req, res) => {
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", () => setTimeout(() => {
          res.writeHead(req.url === "/bad" ? 500 : 200, { "content-type": "application/json" });
          res.end(JSON.stringify({ got: JSON.parse(body), auth: req.headers.authorization ?? null }));
        }, 200));
      });
      await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
      const { port } = server.address() as { port: number };
      try {
        const ok = await postNoTimeout(`http://127.0.0.1:${port}/v1`, { headers: { authorization: "Bearer k" }, body: JSON.stringify({ a: "é" }) });
        expect(ok.ok).toBe(true);
        expect(await ok.json()).toEqual({ got: { a: "é" }, auth: "Bearer k" });
        const bad = await postNoTimeout(`http://127.0.0.1:${port}/bad`, { body: "{}" });
        expect([bad.ok, bad.status]).toEqual([false, 500]);
        expect(await bad.text()).toContain('"got":{}');
      } finally {
        server.close();
      }
    });

    it("stops when aborted", async () => {
      const server = createServer(() => {}); // never answers
      await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
      const { port } = server.address() as { port: number };
      const abort = new AbortController();
      const posted = postNoTimeout(`http://127.0.0.1:${port}/`, { body: "{}", signal: abort.signal });
      setTimeout(() => abort.abort(), 100);
      await expect(posted).rejects.toThrow();
      server.closeAllConnections();
      server.close();
    });
  });

  describe("model calls", () => {
    const messages = [{ role: "user", content: [{ type: "text", text: "go" }] }];
    const tools = [{ name: "get_rules", description: "Rules", inputSchema: { type: "object" } }];

    it("keeps the tools but sets tool_choice none for a text-only Anthropic request", async () => {
      const fake = fakeFetch([{ id: "m1", content: [{ type: "text", text: "sum" }], usage: {} }]);
      await callModel({
        api: "anthropic", baseUrl: "https://api.example", apiKey: "k", model: "claude-x", maxOutput: 100,
        messages, tools, textOnly: true, fetchImpl: fake.fn,
      });
      expect(fake.calls[0].body.tools).toHaveLength(1);
      expect(fake.calls[0].body.tool_choice).toEqual({ type: "none" });
    });

    it("posts an Anthropic request to /v1/messages with the key and tools as input_schema", async () => {
      const fake = fakeFetch([{ id: "m1", content: [{ type: "text", text: "hi" }], usage: { input_tokens: 3 } }]);
      const reply = await callModel({
        api: "anthropic", baseUrl: "https://api.example", apiKey: "sk-test", model: "claude-x", maxOutput: 100,
        messages, tools, fetchImpl: fake.fn,
      });
      expect(fake.calls[0].url).toBe("https://api.example/v1/messages");
      expect(fake.calls[0].headers["x-api-key"]).toBe("sk-test");
      expect(fake.calls[0].body).toMatchObject({
        model: "claude-x",
        max_tokens: 100,
        messages,
        tools: [{ name: "get_rules", description: "Rules", input_schema: { type: "object" } }],
      });
      expect(reply).toEqual({ id: "m1", content: [{ type: "text", text: "hi" }], usage: { input_tokens: 3 } });
    });

    it("posts an OpenAI request to /chat/completions with a Bearer key", async () => {
      const fake = fakeFetch([textReply("hi")]);
      const reply = await callModel({
        api: "openai", baseUrl: "http://localhost:11434/v1", apiKey: "sk-local", model: "m", maxOutput: 100,
        messages, tools, fetchImpl: fake.fn,
      });
      expect(fake.calls[0].url).toBe("http://localhost:11434/v1/chat/completions");
      expect(fake.calls[0].headers.authorization).toBe("Bearer sk-local");
      expect(fake.calls[0].body.tools).toEqual([{ type: "function", function: { name: "get_rules", description: "Rules", parameters: { type: "object" } } }]);
      expect(reply.content).toEqual([{ type: "text", text: "hi" }]);
    });

    it("throws with the status when the API answers with an error", async () => {
      const failing = async () => new Response("overloaded", { status: 529 });
      await expect(callModel({ api: "anthropic", baseUrl: "http://x", model: "m", maxOutput: 1, messages, tools, fetchImpl: failing }))
        .rejects.toThrow(/^529 overloaded/);
      await expect(callModel({ api: "openai", baseUrl: "http://x", model: "m", maxOutput: 1, messages, tools, fetchImpl: failing }))
        .rejects.toThrow(/^529 overloaded/);
    });
  });

  describe("session turns", () => {
    it("plays a tool call, then a text answer, and emits the stream-json events in order", async () => {
      const fake = fakeFetch([toolCallReply, textReply("Done.")]);
      const client = fakeClient();
      const session = new DirectSession({
        api: "openai", baseUrl: "http://fake", apiKey: "k", model: "m", server: {},
        connect: async () => client, fetchImpl: fake.fn,
      });
      const events: SessionEvent[] = [];
      const finished = new Promise<SessionEvent>((resolve) => {
        session.on("event", (e: SessionEvent) => {
          events.push(e);
          if (e.type === "result") resolve(e);
        });
      });

      await session.start();
      session.send("go");
      const result = await finished;

      expect(events.map((e) => `${e.type}${e.subtype ? `:${e.subtype}` : ""}`)).toEqual([
        "system:init", "assistant", "user", "assistant", "result:success",
      ]);
      expect(events[0].tools).toEqual(["get_rules"]);
      expect(events[1].message.content).toEqual([{ type: "tool_use", id: "c1", name: "get_rules", input: {} }]);
      expect(events[2].message.content).toEqual([
        { type: "tool_result", tool_use_id: "c1", content: [{ type: "text", text: "ok" }] },
      ]);
      expect(events[3].message.content).toEqual([{ type: "text", text: "Done." }]);
      expect(result).toMatchObject({ is_error: false, result: "Done." });
      expect(client.callTool).toHaveBeenCalledWith({ name: "get_rules", arguments: {} }, undefined, expect.any(Object));
      expect(fake.calls).toHaveLength(2);
    });
  });

  describe("compaction", () => {
    it("replaces the conversation with the opening prompt and the model's summary when the context is full", async () => {
      // Reply 1: a tool call that reads 150 tokens (over the window of 100). Reply 2: the summary. Reply 3: the text after compacting.
      const summaryReply = { id: "r3", choices: [{ message: { content: "Summary: at Route 1." } }], usage: { prompt_tokens: 40, completion_tokens: 6 } };
      const fake = fakeFetch([{ ...toolCallReply, usage: { prompt_tokens: 150, completion_tokens: 5 } }, summaryReply, textReply("Done.")]);
      const session = new DirectSession({
        api: "openai", baseUrl: "http://fake", apiKey: "k", model: "m", server: {}, compactWindow: 100,
        connect: async () => fakeClient(), fetchImpl: fake.fn,
      });

      let boundary: SessionEvent | undefined;
      let messagesAtBoundary: { role: string; content: { text: string }[] }[] = [];
      const finished = new Promise<SessionEvent>((resolve) => {
        session.on("event", (e: SessionEvent) => {
          if (e.type === "system" && e.subtype === "compact_boundary") {
            boundary = e;
            messagesAtBoundary = JSON.parse(JSON.stringify(session.messages));
          }
          if (e.type === "result") resolve(e);
        });
      });

      await session.start();
      session.send("go");
      await finished;

      expect(boundary).toMatchObject({
        compact_metadata: { trigger: "auto", pre_tokens: 150 },
        summary: "Summary: at Route 1.",
      });
      expect(messagesAtBoundary).toHaveLength(1);
      expect(messagesAtBoundary[0].role).toBe("user");
      const text = messagesAtBoundary[0].content[0].text;
      expect(text).toBe(afterCompaction("go", "Summary: at Route 1."));
      expect(text).toContain("go");
      expect(text).toContain("Summary: at Route 1.");
      // The summary request went out with the compaction prompt appended to the tool results.
      const compactMessages = fake.calls[1].body.messages as unknown[];
      expect(JSON.stringify(compactMessages.at(-1))).toContain("Your context is full");
    });

    it("asks for the summary without tools, and again when the reply has no text", async () => {
      const empty = { id: "e", choices: [{ message: { content: "" } }], usage: { prompt_tokens: 40, completion_tokens: 1 } };
      const summaryReply = { id: "s", choices: [{ message: { content: "Summary: in the lab." } }], usage: { prompt_tokens: 40, completion_tokens: 6 } };
      const fake = fakeFetch([{ ...toolCallReply, usage: { prompt_tokens: 150, completion_tokens: 5 } }, empty, summaryReply, textReply("Done.")]);
      const session = new DirectSession({
        api: "openai", baseUrl: "http://fake", apiKey: "k", model: "m", server: {}, compactWindow: 100,
        connect: async () => fakeClient(), fetchImpl: fake.fn,
      });
      let boundary: SessionEvent | undefined;
      const finished = new Promise<void>((resolve) => {
        session.on("event", (e: SessionEvent) => {
          if (e.type === "system" && e.subtype === "compact_boundary") boundary = e;
          if (e.type === "result") resolve();
        });
      });
      await session.start();
      session.send("go");
      await finished;

      expect(fake.calls[0].body.tools).toBeDefined();
      expect(fake.calls[1].body.tools).toBeUndefined();
      expect(fake.calls[2].body.tools).toBeUndefined();
      expect(boundary?.summary).toBe("Summary: in the lab.");
      expect(fake.calls[3].body.tools).toBeDefined();
    });
  });

  describe("ending", () => {
    it("emits exit with code 0 and closes the MCP client", async () => {
      const client = fakeClient();
      const session = new DirectSession({
        api: "anthropic", baseUrl: "http://fake", model: "m", server: {}, connect: async () => client, fetchImpl: fakeFetch([]).fn,
      });
      await session.start();
      const exited = new Promise<number>((resolve) => session.on("exit", resolve));
      session.end();
      expect(await exited).toBe(0);
      expect(client.close).toHaveBeenCalledTimes(1);
    });
  });
});
