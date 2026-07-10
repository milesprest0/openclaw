import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { describe, expect, it } from "vitest";
import { applyContextBudgetGuard } from "./context-budget.js";

function makeUser(content: string): AgentMessage {
  return { role: "user", content, timestamp: 0 } as AgentMessage;
}

function makeAssistantToolUse(params: {
  id: string;
  name: string;
  input: Record<string, unknown>;
}): AgentMessage {
  return {
    role: "assistant",
    content: [
      {
        type: "tool_use",
        id: params.id,
        name: params.name,
        input: params.input,
      },
    ],
    timestamp: 0,
  } as unknown as AgentMessage;
}

function makeToolResult(text: string, toolName: string, toolCallId: string): AgentMessage {
  return {
    role: "toolResult",
    toolName,
    toolCallId,
    content: [{ type: "text", text }],
    timestamp: 0,
  } as AgentMessage;
}

function firstBlock(message: AgentMessage): Record<string, unknown> {
  const content = (message as { content?: unknown }).content;
  if (!Array.isArray(content) || content.length === 0) {
    throw new Error("expected block content");
  }
  return content[0] as Record<string, unknown>;
}

function runFrozen(messages: AgentMessage[], persistedHistoryFrozenWatermark?: number) {
  return applyContextBudgetGuard({
    messages,
    cfg: {
      agents: {
        defaults: {
          historyOptimization: {
            digestOldToolResults: true,
            freezeMode: "frozen",
            compactToolCallArgs: true,
            keepRawTurns: 1,
            oldToolResultMaxChars: 220,
          },
          contextBudget: {
            enabled: true,
            maxAssembledTokens: 500_000,
            reserveTokens: 1,
          },
        },
      },
    },
    contextWindowTokens: 500_000,
    persistedHistoryFrozenWatermark,
  });
}

describe("context-budget tool-call arg compaction", () => {
  it("compacts frozen tool_use args while preserving tool_use envelope", () => {
    const messages: AgentMessage[] = [
      makeUser("turn-1"),
      makeAssistantToolUse({
        id: "read-1",
        name: "read_file",
        input: {
          path: "/var/tmp/reports/case-9931.log",
          deep: "x".repeat(1800),
        },
      }),
      makeToolResult("ok", "read_file", "read-1"),
      makeUser("turn-2"),
      makeAssistantToolUse({
        id: "read-2",
        name: "read_file",
        input: {
          path: "/var/tmp/reports/recent.log",
        },
      }),
    ];

    const result = runFrozen(messages);
    const frozenToolUse = firstBlock(result.messages[1]);

    expect(frozenToolUse.type).toBe("tool_use");
    expect(frozenToolUse.id).toBe("read-1");
    expect(frozenToolUse.name).toBe("read_file");
    expect(frozenToolUse.frozen).toBe(true);
    expect(frozenToolUse.input).toMatchObject({
      name: "read_file",
    });
    expect(JSON.stringify(frozenToolUse.input).length).toBeLessThan(
      JSON.stringify(firstBlock(messages[1]).input).length,
    );
  });

  it("preserves identifiers from frozen tool-call args in idsPreserved", () => {
    const messages: AgentMessage[] = [
      makeUser("turn-1"),
      makeAssistantToolUse({
        id: "case-1",
        name: "read_file",
        input: {
          path: "/var/tmp/reports/case-9931.log",
          case: "CASE-848393",
          ticket: "123456",
          url: "https://api.example.com/items/848393",
          deep: "z".repeat(1500),
        },
      }),
      makeToolResult("ok", "read_file", "case-1"),
      makeUser("turn-2"),
      makeAssistantToolUse({ id: "case-2", name: "read_file", input: { path: "/tmp/recent.log" } }),
    ];

    const result = runFrozen(messages);
    const frozenInput = firstBlock(result.messages[1]).input as { idsPreserved?: string[] };
    expect(frozenInput.idsPreserved).toContain("/var/tmp/reports/case-9931.log");
    expect(frozenInput.idsPreserved).toContain("CASE-848393");
    expect(frozenInput.idsPreserved).toContain("123456");
    expect(
      frozenInput.idsPreserved?.some((id) => id.includes("https://api.example.com/items/848393")),
    ).toBe(true);
  });

  it("keeps warm most-recent tool_use args untouched", () => {
    const messages: AgentMessage[] = [
      makeUser("turn-1"),
      makeAssistantToolUse({
        id: "old-1",
        name: "read_file",
        input: { payload: "x".repeat(1200) },
      }),
      makeToolResult("old", "read_file", "old-1"),
      makeUser("turn-2"),
      makeAssistantToolUse({
        id: "warm-2",
        name: "read_file",
        input: { payload: "recent raw args" },
      }),
    ];

    const result = runFrozen(messages);
    expect(firstBlock(result.messages[1]).input).not.toEqual(firstBlock(messages[1]).input);
    expect(firstBlock(result.messages[4]).input).toEqual(firstBlock(messages[4]).input);
  });

  it("is idempotent across repeated frozen passes", () => {
    const messages: AgentMessage[] = [
      makeUser("turn-1"),
      makeAssistantToolUse({
        id: "idem-1",
        name: "read_file",
        input: { payload: "x".repeat(1400), path: "/tmp/idem.log" },
      }),
      makeToolResult("ok", "read_file", "idem-1"),
      makeUser("turn-2"),
      makeAssistantToolUse({ id: "idem-2", name: "read_file", input: { payload: "warm" } }),
    ];

    const first = runFrozen(messages);
    const second = runFrozen(first.messages, first.historyFrozenWatermark);

    expect(JSON.stringify(second.messages)).toBe(JSON.stringify(first.messages));
  });

  it("keeps tool_use/tool_result pairing intact after compaction", () => {
    const messages: AgentMessage[] = [
      makeUser("turn-1"),
      makeAssistantToolUse({
        id: "pair-1",
        name: "read_file",
        input: { payload: "x".repeat(1300), path: "/tmp/pair.log" },
      }),
      makeToolResult("pair result", "read_file", "pair-1"),
      makeUser("turn-2"),
      makeAssistantToolUse({ id: "pair-2", name: "read_file", input: { payload: "warm" } }),
    ];

    const result = runFrozen(messages);
    const frozenToolUse = firstBlock(result.messages[1]);
    const pairedToolResult = result.messages.find(
      (message) =>
        (message as { role?: unknown }).role === "toolResult" &&
        (message as { toolCallId?: unknown }).toolCallId === "pair-1",
    );

    expect(frozenToolUse.type).toBe("tool_use");
    expect(frozenToolUse.id).toBe("pair-1");
    expect(pairedToolResult).toBeDefined();
    expect((pairedToolResult as { toolCallId?: string }).toolCallId).toBe("pair-1");
  });
});
