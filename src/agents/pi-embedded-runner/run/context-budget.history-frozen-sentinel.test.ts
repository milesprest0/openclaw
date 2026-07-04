import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { describe, expect, it } from "vitest";
import {
  applyContextBudgetGuard,
  appendHistoryFrozenSentinel,
  HISTORY_FROZEN_BOUNDARY_SENTINEL,
} from "./context-budget.js";

function makeUser(text: string): AgentMessage {
  return { role: "user", content: text, timestamp: 0 } as unknown as AgentMessage;
}

function makeAssistant(text: string): AgentMessage {
  return { role: "assistant", content: text, timestamp: 0 } as unknown as AgentMessage;
}

function buildConfig(params: {
  freezeMode?: "off" | "sliding" | "frozen";
  historyCacheBreakpoints?: "off" | "shadow" | "on";
  includeHistoryCacheBreakpoints?: boolean;
}) {
  const includeHistoryCacheBreakpoints = params.includeHistoryCacheBreakpoints !== false;
  return {
    agents: {
      defaults: {
        historyOptimization: {
          digestOldToolResults: false,
          freezeMode: params.freezeMode ?? "frozen",
          keepRawTurns: 1,
          oldToolResultMaxChars: 180,
        },
        contextBudget: {
          enabled: true,
          maxAssembledTokens: 500_000,
          reserveTokens: 1,
        },
        experimental:
          includeHistoryCacheBreakpoints && params.historyCacheBreakpoints !== undefined
            ? { historyCacheBreakpoints: params.historyCacheBreakpoints }
            : includeHistoryCacheBreakpoints
              ? {}
              : undefined,
      },
    },
  };
}

function countSentinel(messages: AgentMessage[]): number {
  let total = 0;
  for (const message of messages) {
    const content = (message as { content?: unknown }).content;
    if (typeof content === "string") {
      total += content.includes(HISTORY_FROZEN_BOUNDARY_SENTINEL) ? 1 : 0;
      continue;
    }
    if (!Array.isArray(content)) {
      continue;
    }
    for (const block of content) {
      if (!block || typeof block !== "object") {
        continue;
      }
      const text = (block as { text?: unknown }).text;
      if (typeof text === "string" && text.includes(HISTORY_FROZEN_BOUNDARY_SENTINEL)) {
        total += 1;
      }
    }
  }
  return total;
}

function makeFrozenBoundaryMessages(): AgentMessage[] {
  return [
    { ...makeUser("old frozen"), frozen: true } as unknown as AgentMessage,
    {
      role: "assistant",
      content: [{ type: "text", text: "stable boundary" }],
      timestamp: 0,
      frozen: true,
    } as unknown as AgentMessage,
    {
      role: "assistant",
      content: [
        { type: "tool_result", text: "digest", frozen: true },
        { type: "text", text: "last frozen text" },
      ],
      timestamp: 0,
    } as unknown as AgentMessage,
    makeUser("warm"),
    makeAssistant("live"),
  ];
}

describe("context-budget history frozen sentinel", () => {
  it("keeps bytes identical when history breakpoints are absent/off/shadow", () => {
    const messages = makeFrozenBoundaryMessages();

    const absent = applyContextBudgetGuard({
      messages,
      cfg: buildConfig({ includeHistoryCacheBreakpoints: false }),
      contextWindowTokens: 500_000,
    });
    const off = applyContextBudgetGuard({
      messages,
      cfg: buildConfig({ historyCacheBreakpoints: "off" }),
      contextWindowTokens: 500_000,
    });
    const shadow = applyContextBudgetGuard({
      messages,
      cfg: buildConfig({ historyCacheBreakpoints: "shadow" }),
      contextWindowTokens: 500_000,
    });

    expect(JSON.stringify(off.messages)).toBe(JSON.stringify(absent.messages));
    expect(JSON.stringify(shadow.messages)).toBe(JSON.stringify(absent.messages));
    expect(countSentinel(absent.messages)).toBe(0);
  });

  it("does not append sentinel when freezeMode is sliding", () => {
    const result = applyContextBudgetGuard({
      messages: makeFrozenBoundaryMessages(),
      cfg: buildConfig({ freezeMode: "sliding", historyCacheBreakpoints: "on" }),
      contextWindowTokens: 500_000,
    });

    expect(countSentinel(result.messages)).toBe(0);
  });

  it("appends exactly one sentinel to the last frozen message when on+frozen", () => {
    const result = applyContextBudgetGuard({
      messages: makeFrozenBoundaryMessages(),
      cfg: buildConfig({ freezeMode: "frozen", historyCacheBreakpoints: "on" }),
      contextWindowTokens: 500_000,
    });

    expect(countSentinel(result.messages)).toBe(1);
    const boundaryMessage = result.messages[2] as { content?: unknown };
    const content = boundaryMessage.content as Array<Record<string, unknown>>;
    const lastTextBlock = content[1] as { text?: string };
    expect(lastTextBlock.text).toBe(`last frozen text${HISTORY_FROZEN_BOUNDARY_SENTINEL}`);
  });

  it("is idempotent when applied multiple times", () => {
    const once = applyContextBudgetGuard({
      messages: makeFrozenBoundaryMessages(),
      cfg: buildConfig({ freezeMode: "frozen", historyCacheBreakpoints: "on" }),
      contextWindowTokens: 500_000,
    });
    const twice = applyContextBudgetGuard({
      messages: once.messages,
      cfg: buildConfig({ freezeMode: "frozen", historyCacheBreakpoints: "on" }),
      contextWindowTokens: 500_000,
    });

    expect(countSentinel(once.messages)).toBe(1);
    expect(countSentinel(twice.messages)).toBe(1);
    expect(JSON.stringify(twice.messages)).toBe(JSON.stringify(once.messages));
  });

  it("no-ops when no frozen messages exist", () => {
    const messages = [makeUser("u1"), makeAssistant("a1")];
    const withSentinel = appendHistoryFrozenSentinel(messages, "on", "frozen");

    expect(withSentinel).toBe(messages);
    expect(countSentinel(withSentinel)).toBe(0);
  });
});
