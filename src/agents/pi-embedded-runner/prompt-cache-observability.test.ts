import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  beginPromptCacheObservation,
  collectPromptCacheToolNames,
  completePromptCacheObservation,
  emitGeminiImplicitCacheTelemetry,
  resetPromptCacheObservabilityForTest,
} from "./prompt-cache-observability.js";

describe("prompt cache observability", () => {
  beforeEach(() => {
    resetPromptCacheObservabilityForTest();
  });

  it("collects trimmed tool names only", () => {
    expect(
      collectPromptCacheToolNames([{ name: " read " }, { name: "" }, {}, { name: "write" }]),
    ).toEqual(["read", "write"]);
  });

  it("tracks cache-relevant changes and reports a real cache-read drop", () => {
    const first = beginPromptCacheObservation({
      sessionId: "session-1",
      sessionKey: "agent:main",
      provider: "openai",
      modelId: "gpt-5.4",
      modelApi: "openai-responses",
      cacheRetention: "long",
      streamStrategy: "boundary-aware:openai-responses",
      transport: "sse",
      systemPrompt: "stable system",
      toolNames: ["read", "write"],
    });

    expect(first.changes).toBeNull();
    expect(
      completePromptCacheObservation({
        sessionId: "session-1",
        sessionKey: "agent:main",
        usage: { cacheRead: 8_000 },
      }),
    ).toBeNull();

    const second = beginPromptCacheObservation({
      sessionId: "session-1",
      sessionKey: "agent:main",
      provider: "openai",
      modelId: "gpt-5.4",
      modelApi: "openai-responses",
      cacheRetention: "short",
      streamStrategy: "boundary-aware:openai-responses",
      transport: "websocket",
      systemPrompt: "stable system with hook change",
      toolNames: ["read", "write"],
    });

    expect(second.changes?.map((change) => change.code)).toEqual([
      "cacheRetention",
      "transport",
      "systemPrompt",
    ]);

    expect(
      completePromptCacheObservation({
        sessionId: "session-1",
        sessionKey: "agent:main",
        usage: { cacheRead: 2_000 },
      }),
    ).toEqual({
      previousCacheRead: 8_000,
      cacheRead: 2_000,
      changes: [
        { code: "cacheRetention", detail: "long -> short" },
        { code: "transport", detail: "sse -> websocket" },
        { code: "systemPrompt", detail: "system prompt digest changed" },
      ],
    });
  });

  it("suppresses cache-break events for small drops", () => {
    beginPromptCacheObservation({
      sessionId: "session-1",
      provider: "anthropic",
      modelId: "claude-sonnet-4-6",
      modelApi: "anthropic-messages",
      streamStrategy: "boundary-aware:anthropic-messages",
      systemPrompt: "stable system",
      toolNames: ["read"],
    });
    completePromptCacheObservation({
      sessionId: "session-1",
      usage: { cacheRead: 5_000 },
    });

    beginPromptCacheObservation({
      sessionId: "session-1",
      provider: "anthropic",
      modelId: "claude-sonnet-4-6",
      modelApi: "anthropic-messages",
      streamStrategy: "boundary-aware:anthropic-messages",
      systemPrompt: "stable system",
      toolNames: ["read"],
    });

    expect(
      completePromptCacheObservation({
        sessionId: "session-1",
        usage: { cacheRead: 4_600 },
      }),
    ).toBeNull();
  });

  it("treats reordered tool lists as the same diagnostics tool set", () => {
    beginPromptCacheObservation({
      sessionId: "session-1",
      provider: "openai",
      modelId: "gpt-5.4",
      modelApi: "openai-responses",
      streamStrategy: "boundary-aware:openai-responses",
      systemPrompt: "stable system",
      toolNames: ["read", "write"],
    });
    completePromptCacheObservation({
      sessionId: "session-1",
      usage: { cacheRead: 8_000 },
    });

    const second = beginPromptCacheObservation({
      sessionId: "session-1",
      provider: "openai",
      modelId: "gpt-5.4",
      modelApi: "openai-responses",
      streamStrategy: "boundary-aware:openai-responses",
      systemPrompt: "stable system",
      toolNames: ["write", "read"],
    });

    expect(second.changes).toBeNull();
  });

  it("evicts old tracker entries when the tracker map grows past the soft cap", () => {
    beginPromptCacheObservation({
      sessionId: "session-0",
      provider: "openai",
      modelId: "gpt-5.4",
      modelApi: "openai-responses",
      streamStrategy: "boundary-aware:openai-responses",
      systemPrompt: "stable system",
      toolNames: ["read"],
    });
    completePromptCacheObservation({
      sessionId: "session-0",
      usage: { cacheRead: 8_000 },
    });

    for (let index = 1; index <= 513; index += 1) {
      beginPromptCacheObservation({
        sessionId: `session-${index}`,
        provider: "openai",
        modelId: "gpt-5.4",
        modelApi: "openai-responses",
        streamStrategy: "boundary-aware:openai-responses",
        systemPrompt: `stable system ${index}`,
        toolNames: ["read"],
      });
    }

    const restarted = beginPromptCacheObservation({
      sessionId: "session-0",
      provider: "openai",
      modelId: "gpt-5.4",
      modelApi: "openai-responses",
      streamStrategy: "boundary-aware:openai-responses",
      systemPrompt: "stable system",
      toolNames: ["read"],
    });

    expect(restarted.previousCacheRead).toBeNull();
    expect(restarted.changes).toBeNull();
  });

  it("ignores missing usage and preserves the previous cache-read baseline", () => {
    beginPromptCacheObservation({
      sessionId: "session-1",
      sessionKey: "agent:main",
      provider: "openai",
      modelId: "gpt-5.4",
      modelApi: "openai-responses",
      cacheRetention: "long",
      streamStrategy: "boundary-aware:openai-responses",
      transport: "sse",
      systemPrompt: "stable system",
      toolNames: ["read"],
    });
    completePromptCacheObservation({
      sessionId: "session-1",
      sessionKey: "agent:main",
      usage: { cacheRead: 8_000 },
    });

    beginPromptCacheObservation({
      sessionId: "session-1",
      sessionKey: "agent:main",
      provider: "openai",
      modelId: "gpt-5.4",
      modelApi: "openai-responses",
      cacheRetention: "short",
      streamStrategy: "boundary-aware:openai-responses",
      transport: "websocket",
      systemPrompt: "stable system with hook change",
      toolNames: ["read"],
    });

    expect(
      completePromptCacheObservation({
        sessionId: "session-1",
        sessionKey: "agent:main",
      }),
    ).toBeNull();

    const resumed = beginPromptCacheObservation({
      sessionId: "session-1",
      sessionKey: "agent:main",
      provider: "openai",
      modelId: "gpt-5.4",
      modelApi: "openai-responses",
      cacheRetention: "short",
      streamStrategy: "boundary-aware:openai-responses",
      transport: "websocket",
      systemPrompt: "stable system with hook change",
      toolNames: ["read"],
    });

    expect(resumed.previousCacheRead).toBe(8_000);
    expect(resumed.changes).toBeNull();

    expect(
      completePromptCacheObservation({
        sessionId: "session-1",
        sessionKey: "agent:main",
        usage: { cacheRead: 2_000 },
      }),
    ).toEqual({
      previousCacheRead: 8_000,
      cacheRead: 2_000,
      changes: null,
    });
  });

  it("emits Phase 0 Gemini implicit-cache telemetry with cache hit ratio", () => {
    const debug = vi.fn();

    const telemetry = emitGeminiImplicitCacheTelemetry({
      provider: "openrouter",
      modelId: "openrouter/google/gemini-2.5-pro",
      usage: { input: 2_000, cacheRead: 500 },
      sessionKey: "agent:main",
      debug,
    });

    expect(telemetry).toEqual({
      provider: "openrouter",
      modelId: "openrouter/google/gemini-2.5-pro",
      inputTokens: 2_000,
      cachedReadTokens: 500,
      cacheHitRatio: 0.25,
      sessionKey: "agent:main",
    });
    expect(debug).toHaveBeenCalledTimes(1);
    expect(debug).toHaveBeenCalledWith("gemini implicit prompt-cache telemetry", telemetry);
  });

  it("does not emit Gemini implicit-cache telemetry for non-Gemini providers", () => {
    const debug = vi.fn();

    const telemetry = emitGeminiImplicitCacheTelemetry({
      provider: "openai",
      modelId: "gpt-5.5",
      usage: { input: 2_000, cacheRead: 500 },
      sessionKey: "agent:main",
      debug,
    });

    expect(telemetry).toBeNull();
    expect(debug).not.toHaveBeenCalled();
  });
});
