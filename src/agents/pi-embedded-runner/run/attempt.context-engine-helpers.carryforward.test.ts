import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { describe, expect, it } from "vitest";
import {
  findLatestAssistantMessage,
  resolveSafeLastCallUsage,
} from "./attempt.context-engine-helpers.js";

function assistantMessage(params: {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  provider?: string;
  model?: string;
}): AgentMessage {
  return {
    role: "assistant",
    content: "ok",
    usage: {
      input: params.input,
      output: params.output,
      cacheRead: params.cacheRead,
      cacheWrite: params.cacheWrite,
    },
    ...(params.provider ? { provider: params.provider } : {}),
    ...(params.model ? { model: params.model } : {}),
  } as unknown as AgentMessage;
}

describe("resolveSafeLastCallUsage", () => {
  it("preserves cache usage for fresh same-family assistants", () => {
    const messages: AgentMessage[] = [
      { role: "user", content: "hello" } as unknown as AgentMessage,
      assistantMessage({
        input: 120,
        output: 10,
        cacheRead: 80,
        cacheWrite: 5,
        provider: "openai",
      }),
    ];
    const latest = findLatestAssistantMessage(messages);

    const usage = resolveSafeLastCallUsage({
      assistant: latest?.message,
      assistantIndex: latest?.index ?? -1,
      prePromptMessageCount: 1,
      provider: "openai",
      model: "gpt-5.5",
    });

    expect(usage).toEqual(
      expect.objectContaining({
        input: 120,
        output: 10,
        cacheRead: 80,
        cacheWrite: 5,
      }),
    );
  });

  it("drops cache fields when assistant family differs from current call family", () => {
    const messages: AgentMessage[] = [
      { role: "user", content: "hello" } as unknown as AgentMessage,
      assistantMessage({
        input: 90,
        output: 6,
        cacheRead: 21_443,
        cacheWrite: 8,
        provider: "anthropic",
        model: "claude-opus-4-6",
      }),
    ];
    const latest = findLatestAssistantMessage(messages);

    const usage = resolveSafeLastCallUsage({
      assistant: latest?.message,
      assistantIndex: latest?.index ?? -1,
      prePromptMessageCount: 1,
      provider: "openai",
      model: "gpt-5.5",
    });

    expect(usage?.input).toBe(90);
    expect(usage?.output).toBe(6);
    expect(usage?.cacheRead).toBeUndefined();
    expect(usage?.cacheWrite).toBeUndefined();
  });

  it("drops cache fields for positionally stale assistants", () => {
    const messages: AgentMessage[] = [assistantMessage({ input: 50, output: 4, cacheRead: 999 })];
    const latest = findLatestAssistantMessage(messages);

    const usage = resolveSafeLastCallUsage({
      assistant: latest?.message,
      assistantIndex: latest?.index ?? -1,
      prePromptMessageCount: 1,
      provider: "openai",
      model: "gpt-5.5",
    });

    expect(usage?.input).toBe(50);
    expect(usage?.output).toBe(4);
    expect(usage?.cacheRead).toBeUndefined();
    expect(usage?.cacheWrite).toBeUndefined();
  });
});
