import type { StreamFn } from "@mariozechner/pi-agent-core";
import { describe, expect, it } from "vitest";
import { createOpenRouterSystemCacheWrapper } from "./proxy-stream-wrappers.js";

type StreamPayload = {
  messages: Array<{
    role: string;
    content: unknown;
  }>;
};

function runOpenRouterPayload(payload: StreamPayload, modelId: string) {
  const baseStreamFn: StreamFn = (model, _context, options) => {
    options?.onPayload?.(payload, model);
    return {} as ReturnType<StreamFn>;
  };
  const streamFn = createOpenRouterSystemCacheWrapper(baseStreamFn);
  void streamFn(
    {
      api: "openai-completions",
      provider: "openrouter",
      id: modelId,
    } as never,
    { messages: [] } as never,
    {},
  );
}

describe("extra-params: OpenRouter Anthropic cache_control", () => {
  it("injects cache_control into system message for OpenRouter Anthropic models", () => {
    const payload = {
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Hello" },
      ],
    };

    runOpenRouterPayload(payload, "anthropic/claude-opus-4-6");

    expect(payload.messages[0].content).toEqual([
      { type: "text", text: "You are a helpful assistant.", cache_control: { type: "ephemeral" } },
    ]);
    expect(payload.messages[1].content).toBe("Hello");
  });

  it("injects cache_control for OpenRouter always-latest tilde alias (~anthropic/...)", () => {
    // Regression: migrating the pin to OpenRouter's always-latest alias
    // "~anthropic/claude-opus-latest" must NOT disable prompt caching. The
    // leading tilde is OpenRouter's floor/always-latest routing selector and
    // is sent verbatim, but the Anthropic family must still be recognized.
    const payload = {
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Hello" },
      ],
    };

    runOpenRouterPayload(payload, "~anthropic/claude-opus-latest");

    expect(payload.messages[0].content).toEqual([
      { type: "text", text: "You are a helpful assistant.", cache_control: { type: "ephemeral" } },
    ]);
    expect(payload.messages[1].content).toBe("Hello");
  });

  it("adds cache_control to last content block when system message is already array", () => {
    const payload = {
      messages: [
        {
          role: "system",
          content: [
            { type: "text", text: "Part 1" },
            { type: "text", text: "Part 2" },
          ],
        },
      ],
    };

    runOpenRouterPayload(payload, "anthropic/claude-opus-4-6");

    const content = payload.messages[0].content as Array<Record<string, unknown>>;
    expect(content[0]).toEqual({ type: "text", text: "Part 1" });
    expect(content[1]).toEqual({
      type: "text",
      text: "Part 2",
      cache_control: { type: "ephemeral" },
    });
  });

  it("splits system content on OPENCLAW_CACHE_BOUNDARY: stable prefix cached, dynamic suffix not", () => {
    // Phase 1 (2026-05-28): the OpenRouter path must honor the cache boundary
    // so the volatile suffix (e.g. MEMORY.md / HEARTBEAT.md churn) below the
    // boundary does not invalidate the large stable identity/tools prefix.
    const boundary = "\n<!-- OPENCLAW_CACHE_BOUNDARY -->\n";
    const payload = {
      messages: [
        {
          role: "system",
          content: `Stable identity and tools prefix${boundary}Volatile MEMORY suffix`,
        },
        { role: "user", content: "Hello" },
      ],
    };

    runOpenRouterPayload(payload, "~anthropic/claude-opus-latest");

    expect(payload.messages[0].content).toEqual([
      {
        type: "text",
        text: "Stable identity and tools prefix",
        cache_control: { type: "ephemeral" },
      },
      { type: "text", text: "Volatile MEMORY suffix" },
    ]);
    expect(payload.messages[1].content).toBe("Hello");
  });

  it("strips an inert boundary marker from multi-block system content", () => {
    const boundary = "\n<!-- OPENCLAW_CACHE_BOUNDARY -->\n";
    const payload = {
      messages: [
        {
          role: "system",
          content: [
            { type: "text", text: "Part 1" },
            { type: "text", text: `Part 2${boundary}tail` },
          ],
        },
      ],
    };

    runOpenRouterPayload(payload, "anthropic/claude-opus-4-6");

    const content = payload.messages[0].content as Array<Record<string, unknown>>;
    expect(content[0]).toEqual({ type: "text", text: "Part 1" });
    // boundary collapsed to a newline; last block still gets the marker
    expect(content[1]).toEqual({
      type: "text",
      text: "Part 2\ntail",
      cache_control: { type: "ephemeral" },
    });
  });

  it("does not inject cache_control for OpenRouter non-Anthropic models", () => {
    const payload = {
      messages: [{ role: "system", content: "You are a helpful assistant." }],
    };

    runOpenRouterPayload(payload, "google/gemini-3-pro");

    expect(payload.messages[0].content).toBe("You are a helpful assistant.");
  });

  it("leaves payload unchanged when no system message exists", () => {
    const payload = {
      messages: [{ role: "user", content: "Hello" }],
    };

    runOpenRouterPayload(payload, "anthropic/claude-opus-4-6");

    expect(payload.messages[0].content).toBe("Hello");
  });

  it("does not inject cache_control into thinking blocks", () => {
    const payload = {
      messages: [
        {
          role: "system",
          content: [
            { type: "text", text: "Part 1" },
            { type: "thinking", thinking: "internal", thinkingSignature: "sig_1" },
          ],
        },
      ],
    };

    runOpenRouterPayload(payload, "anthropic/claude-opus-4-6");

    expect(payload.messages[0].content).toEqual([
      { type: "text", text: "Part 1" },
      { type: "thinking", thinking: "internal", thinkingSignature: "sig_1" },
    ]);
  });

  it("removes pre-existing cache_control from assistant thinking blocks", () => {
    const payload = {
      messages: [
        {
          role: "assistant",
          content: [
            {
              type: "thinking",
              thinking: "internal",
              thinkingSignature: "sig_1",
              cache_control: { type: "ephemeral" },
            },
            { type: "text", text: "visible" },
          ],
        },
      ],
    };

    runOpenRouterPayload(payload, "anthropic/claude-opus-4-6");

    expect(payload.messages[0].content).toEqual([
      { type: "thinking", thinking: "internal", thinkingSignature: "sig_1" },
      { type: "text", text: "visible" },
    ]);
  });
});
