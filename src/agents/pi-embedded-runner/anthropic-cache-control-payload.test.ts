import { describe, expect, it, vi } from "vitest";
import { applyAnthropicEphemeralCacheControlMarkers } from "./anthropic-cache-control-payload.js";

function markerCount(payload: Record<string, unknown>): number {
  let count = 0;
  const tools = payload.tools;
  if (Array.isArray(tools)) {
    for (const tool of tools) {
      if (tool && typeof tool === "object" && Object.hasOwn(tool, "cache_control")) {
        count += 1;
      }
    }
  }
  const messages = payload.messages;
  if (Array.isArray(messages)) {
    for (const message of messages) {
      if (!message || typeof message !== "object") {
        continue;
      }
      const content = (message as { content?: unknown }).content;
      if (!Array.isArray(content)) {
        continue;
      }
      for (const block of content) {
        if (block && typeof block === "object" && Object.hasOwn(block, "cache_control")) {
          count += 1;
        }
      }
    }
  }
  return count;
}

describe("applyAnthropicEphemeralCacheControlMarkers", () => {
  it("off mode keeps the pre-phase payload shape (golden gate)", () => {
    const payload = {
      tools: [
        { type: "function", function: { name: "one" } },
        { type: "function", function: { name: "two" } },
      ],
      messages: [
        { role: "system", content: "system prompt" },
        { role: "user", content: [{ type: "text", text: "older" }] },
        { role: "assistant", content: [{ type: "text", text: "older reply" }], frozen: true },
        { role: "user", content: [{ type: "text", text: "tail user" }] },
        {
          role: "assistant",
          content: [
            { type: "thinking", text: "draft", cache_control: { type: "ephemeral" } },
            { type: "text", text: "answer" },
          ],
        },
      ],
    } satisfies Record<string, unknown>;

    applyAnthropicEphemeralCacheControlMarkers(payload);

    expect(payload).toEqual({
      tools: [
        { type: "function", function: { name: "one" } },
        {
          type: "function",
          function: { name: "two" },
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "system",
          content: [{ type: "text", text: "system prompt", cache_control: { type: "ephemeral" } }],
        },
        { role: "user", content: [{ type: "text", text: "older" }] },
        { role: "assistant", content: [{ type: "text", text: "older reply" }], frozen: true },
        { role: "user", content: [{ type: "text", text: "tail user" }] },
        {
          role: "assistant",
          content: [
            { type: "thinking", text: "draft" },
            { type: "text", text: "answer" },
          ],
        },
      ],
    });
  });

  it("shadow mode emits no markers but reports computed indices", () => {
    const payload = {
      tools: [{ type: "function", function: { name: "one" } }],
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: [{ type: "text", text: "warm 1" }] },
        { role: "assistant", frozen: true, content: [{ type: "text", text: "frozen" }] },
        { role: "user", content: [{ type: "text", text: "warm completed" }] },
        { role: "assistant", content: [{ type: "text", text: "live" }] },
      ],
    } satisfies Record<string, unknown>;
    const offPayload = structuredClone(payload);
    applyAnthropicEphemeralCacheControlMarkers(offPayload);
    const hook = vi.fn();

    applyAnthropicEphemeralCacheControlMarkers(payload, {
      historyBreakpoints: "shadow",
      onHistoryBreakpointsComputed: hook,
    });

    expect(payload).toEqual(offPayload);
    expect(hook).toHaveBeenCalledTimes(1);
    expect(hook).toHaveBeenCalledWith({
      lastFrozenIdx: 2,
      lastStableWarmIdx: 3,
    });
  });

  it("on mode marks frozen and completed warm boundaries, never the live tail", () => {
    const payload = {
      tools: [
        { type: "function", function: { name: "one" }, cache_control: { type: "ephemeral" } },
        { type: "function", function: { name: "two" } },
      ],
      messages: [
        { role: "system", content: "sys" },
        { role: "assistant", content: [{ type: "text", text: "frozen block", frozen: true }] },
        { role: "user", content: [{ type: "text", text: "warm stable" }] },
        { role: "assistant", content: [{ type: "text", text: "live tail" }] },
      ],
    } satisfies Record<string, unknown>;

    applyAnthropicEphemeralCacheControlMarkers(payload, { historyBreakpoints: "on" });

    const messages = payload.messages as Array<{ content?: unknown }>;
    expect((messages[1]?.content as Array<Record<string, unknown>>)[0]?.cache_control).toEqual({
      type: "ephemeral",
    });
    expect((messages[2]?.content as Array<Record<string, unknown>>)[0]?.cache_control).toEqual({
      type: "ephemeral",
    });
    expect((messages[3]?.content as Array<Record<string, unknown>>)[0]).not.toHaveProperty(
      "cache_control",
    );
  });

  it("on mode walks back from thinking tail blocks", () => {
    const payload = {
      tools: [{ type: "function", function: { name: "one" } }],
      messages: [
        { role: "system", content: "sys" },
        {
          role: "assistant",
          frozen: true,
          content: [
            { type: "text", text: "frozen body", frozen: true },
            { type: "thinking", text: "plan" },
          ],
        },
        {
          role: "user",
          content: [
            { type: "text", text: "warm body" },
            { type: "redacted_thinking", text: "hidden" },
          ],
        },
        { role: "assistant", content: [{ type: "text", text: "live" }] },
      ],
    } satisfies Record<string, unknown>;

    applyAnthropicEphemeralCacheControlMarkers(payload, { historyBreakpoints: "on" });

    const messages = payload.messages as Array<{ content?: unknown }>;
    const frozenBlocks = messages[1]?.content as Array<Record<string, unknown>>;
    const warmBlocks = messages[2]?.content as Array<Record<string, unknown>>;
    expect(frozenBlocks[0]?.cache_control).toEqual({ type: "ephemeral" });
    expect(frozenBlocks[1]).not.toHaveProperty("cache_control");
    expect(warmBlocks[0]?.cache_control).toEqual({ type: "ephemeral" });
    expect(warmBlocks[1]).not.toHaveProperty("cache_control");
  });

  it("on mode is a no-op when no frozen tags exist", () => {
    const payload = {
      tools: [{ type: "function", function: { name: "one" } }],
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: [{ type: "text", text: "warm 1" }] },
        { role: "assistant", content: [{ type: "text", text: "warm 2" }] },
      ],
    } satisfies Record<string, unknown>;
    const offPayload = structuredClone(payload);
    applyAnthropicEphemeralCacheControlMarkers(offPayload);

    applyAnthropicEphemeralCacheControlMarkers(payload, { historyBreakpoints: "on" });

    expect(payload).toEqual(offPayload);
  });

  it("keeps total cache_control markers within the four-breakpoint budget", () => {
    const payload = {
      tools: [
        { type: "function", function: { name: "one" }, cache_control: { type: "ephemeral" } },
        { type: "function", function: { name: "two" } },
      ],
      messages: [
        { role: "system", content: "sys" },
        {
          role: "assistant",
          content: [
            {
              type: "text",
              text: "frozen stable",
              frozen: true,
              cache_control: { type: "ephemeral" },
            },
            { type: "thinking", text: "tail" },
          ],
        },
        {
          role: "user",
          content: [
            { type: "text", text: "warm stable", cache_control: { type: "ephemeral" } },
            { type: "redacted_thinking", text: "tail" },
          ],
        },
        {
          role: "assistant",
          content: [
            { type: "text", text: "live" },
            { type: "thinking", text: "active", cache_control: { type: "ephemeral" } },
          ],
        },
      ],
    } satisfies Record<string, unknown>;

    applyAnthropicEphemeralCacheControlMarkers(payload, { historyBreakpoints: "on" });

    expect(markerCount(payload)).toBeLessThanOrEqual(4);
  });
});
