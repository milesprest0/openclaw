import type { AssistantMessage } from "@mariozechner/pi-ai";
import { describe, expect, it } from "vitest";
import { createUsageAccumulator, mergeUsageIntoAccumulator } from "../usage-accumulator.js";
import {
  buildUsageAgentMetaFields,
  resolveFinalAssistantRawText,
  resolveFinalAssistantVisibleText,
} from "./helpers.js";

function makeAssistantMessage(
  content: AssistantMessage["content"],
  phase?: string,
): AssistantMessage {
  return {
    api: "responses",
    provider: "openai",
    model: "gpt-5.4",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    role: "assistant",
    content,
    timestamp: Date.now(),
    stopReason: "stop",
    ...(phase ? { phase } : {}),
  };
}

describe("resolveFinalAssistantVisibleText", () => {
  it("prefers final_answer text over commentary blocks", () => {
    const lastAssistant = makeAssistantMessage([
      {
        type: "text",
        text: "Working...",
        textSignature: JSON.stringify({ v: 1, id: "item_commentary", phase: "commentary" }),
      },
      {
        type: "text",
        text: "Section 1\nSection 2",
        textSignature: JSON.stringify({ v: 1, id: "item_final", phase: "final_answer" }),
      },
    ]);

    expect(resolveFinalAssistantVisibleText(lastAssistant)).toBe("Section 1\nSection 2");
  });

  it("returns undefined when the final visible text is empty", () => {
    const lastAssistant = makeAssistantMessage([
      {
        type: "text",
        text: "Working...",
        textSignature: JSON.stringify({ v: 1, id: "item_commentary", phase: "commentary" }),
      },
      {
        type: "text",
        text: "   ",
        textSignature: JSON.stringify({ v: 1, id: "item_final", phase: "final_answer" }),
      },
    ]);

    expect(resolveFinalAssistantVisibleText(lastAssistant)).toBeUndefined();
  });

  it("preserves raw final answer text without visible-text sanitization", () => {
    const lastAssistant = makeAssistantMessage([
      {
        type: "text",
        text: "<final>keep this</final>",
        textSignature: JSON.stringify({ v: 1, id: "item_final", phase: "final_answer" }),
      },
    ]);

    expect(resolveFinalAssistantRawText(lastAssistant)).toBe("<final>keep this</final>");
  });
});

describe("buildUsageAgentMetaFields", () => {
  it("does not carry cacheRead forward from the run accumulator", () => {
    const usageAccumulator = createUsageAccumulator();
    mergeUsageIntoAccumulator(usageAccumulator, {
      input: 100,
      output: 30,
      cacheRead: 21_443,
      total: 21_573,
    });

    const usageMeta = buildUsageAgentMetaFields({
      usageAccumulator,
      lastAssistantUsage: {
        input: 40,
        output: 10,
      },
      lastRunPromptUsage: {
        input: 40,
      },
      lastTurnTotal: 50,
    });

    expect(usageMeta.lastCallUsage).toEqual({
      input: 40,
      output: 10,
      cacheRead: undefined,
      cacheWrite: undefined,
      total: undefined,
    });
  });

  it("keeps live last-call cache usage when present", () => {
    const usageMeta = buildUsageAgentMetaFields({
      usageAccumulator: createUsageAccumulator(),
      lastAssistantUsage: {
        input: 300,
        output: 50,
        cacheRead: 120,
      },
      lastRunPromptUsage: {
        input: 300,
        cacheRead: 120,
      },
      lastTurnTotal: 470,
    });

    expect(usageMeta.lastCallUsage).toEqual({
      input: 300,
      output: 50,
      cacheRead: 120,
      cacheWrite: undefined,
      total: undefined,
    });
  });

  it("drops untrusted last-call cacheRead when it exceeds call prompt tokens", () => {
    const usageMeta = buildUsageAgentMetaFields({
      usageAccumulator: createUsageAccumulator(),
      lastAssistantUsage: {
        input: 20,
        output: 5,
        cacheRead: 21_443,
      },
      lastRunPromptUsage: {
        input: 20,
      },
      lastTurnTotal: 21_468,
    });

    expect(usageMeta.lastCallUsage).toEqual({
      input: 20,
      output: 5,
      cacheRead: 0,
      cacheWrite: undefined,
      total: undefined,
    });
  });
});
