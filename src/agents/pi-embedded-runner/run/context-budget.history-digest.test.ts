import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { describe, expect, it } from "vitest";
import { applyContextBudgetGuard } from "./context-budget.js";

function makeUser(content: string): AgentMessage {
  return { role: "user", content, timestamp: 0 } as unknown as AgentMessage;
}

function makeAssistant(content: string): AgentMessage {
  return { role: "assistant", content, timestamp: 0 } as unknown as AgentMessage;
}

function makeToolResult(content: string, toolName = "read"): AgentMessage {
  return {
    role: "toolResult",
    toolName,
    toolCallId: `${toolName}-call`,
    content: [{ type: "text", text: content }],
    timestamp: 0,
  } as AgentMessage;
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

function toolText(message: AgentMessage): string {
  const content = (message as { content?: unknown }).content;
  if (!Array.isArray(content)) {
    return "";
  }
  const first = content[0] as { text?: string } | undefined;
  return typeof first?.text === "string" ? first.text : "";
}

function firstBlockInput(message: AgentMessage): unknown {
  const content = (message as { content?: unknown }).content;
  if (!Array.isArray(content)) {
    return undefined;
  }
  const first = content[0] as { input?: unknown } | undefined;
  return first?.input;
}

describe("context-budget history digest", () => {
  it("keeps messages byte-identical when digestOldToolResults is off", () => {
    const messages: AgentMessage[] = [
      makeUser("turn-1"),
      makeAssistant("working"),
      makeToolResult("raw output /tmp/a.log CASE-100001 https://example.com/r/1"),
      makeUser("turn-2"),
      makeAssistant("done"),
    ];

    const result = applyContextBudgetGuard({
      messages,
      cfg: {
        agents: {
          defaults: {
            historyOptimization: {
              digestOldToolResults: false,
              keepRawTurns: 1,
              oldToolResultMaxChars: 120,
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
    });

    expect(result.messages).toEqual(messages);
    expect(result.historyDigestEnabled).toBe(false);
    expect(result.historyDigested).toBe(false);
  });

  it("digests older tool results and preserves ids/paths verbatim", () => {
    const rawOld =
      "Large tool output for /var/tmp/reports/case-9931.log and CASE-848393 plus https://api.example.com/items/848393 and details " +
      "x".repeat(4_000);
    const messages: AgentMessage[] = [
      makeUser("turn-1"),
      makeAssistant("running tool"),
      makeToolResult(rawOld, "read"),
      makeUser("turn-2"),
      makeAssistant("new turn"),
    ];

    const result = applyContextBudgetGuard({
      messages,
      cfg: {
        agents: {
          defaults: {
            historyOptimization: {
              digestOldToolResults: true,
              keepRawTurns: 1,
              oldToolResultMaxChars: 320,
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
    });

    const digestedText = toolText(result.messages[2]);
    expect(digestedText.length).toBeLessThan(rawOld.length);
    expect(digestedText).toContain("/var/tmp/reports/case-9931.log");
    expect(digestedText).toContain("CASE-848393");
    expect(digestedText).toContain("https://api.example.com/items/848393");
    expect(result.historyDigestEnabled).toBe(true);
    expect(result.historyDigested).toBe(true);
    expect(result.digestedToolResults).toBeGreaterThan(0);
  });

  it("keeps assistant tool_call args byte-identical when compactToolCallArgs is off", () => {
    const messages: AgentMessage[] = [
      makeUser("turn-1"),
      makeAssistantToolUse({
        id: "call-read-1",
        name: "read",
        input: {
          path: "/var/tmp/reports/case-9931.log",
          case: "CASE-848393",
          url: "https://api.example.com/items/848393",
        },
      }),
      makeToolResult("tool output alpha", "read"),
      makeUser("turn-2"),
      makeAssistant("ack"),
    ];

    const run = (freezeMode: "off" | "sliding" | "frozen", compactToolCallArgs?: boolean) =>
      applyContextBudgetGuard({
        messages,
        cfg: {
          agents: {
            defaults: {
              historyOptimization: {
                digestOldToolResults: true,
                freezeMode,
                keepRawTurns: 1,
                oldToolResultMaxChars: 180,
                ...(compactToolCallArgs === undefined ? {} : { compactToolCallArgs }),
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
      });

    const offDefault = run("off");
    const offFalse = run("off", false);
    const slidingDefault = run("sliding");
    const slidingFalse = run("sliding", false);
    const frozenDefault = run("frozen");
    const frozenFalse = run("frozen", false);

    expect(JSON.stringify(offFalse.messages)).toBe(JSON.stringify(offDefault.messages));
    expect(JSON.stringify(slidingFalse.messages)).toBe(JSON.stringify(slidingDefault.messages));
    expect(JSON.stringify(frozenFalse.messages)).toBe(JSON.stringify(frozenDefault.messages));

    const toolUseOff = (
      (offDefault.messages[1] as { content?: unknown }).content as Array<Record<string, unknown>>
    )[0];
    const toolUseSliding = (
      (slidingDefault.messages[1] as { content?: unknown }).content as Array<
        Record<string, unknown>
      >
    )[0];
    const toolUseFrozen = (
      (frozenDefault.messages[1] as { content?: unknown }).content as Array<Record<string, unknown>>
    )[0];
    expect(toolUseOff.input).toEqual(firstBlockInput(messages[1]));
    expect(toolUseSliding.input).toEqual(toolUseOff.input);
    expect(toolUseFrozen.input).toEqual(toolUseOff.input);
  });

  it("keeps most recent N turns raw", () => {
    const old = "old tool output " + "x".repeat(2_000);
    const recentA = "recent A tool output " + "y".repeat(200);
    const recentB = "recent B tool output " + "z".repeat(200);
    const messages: AgentMessage[] = [
      makeUser("turn-1"),
      makeToolResult(old),
      makeUser("turn-2"),
      makeToolResult(recentA),
      makeUser("turn-3"),
      makeToolResult(recentB),
      makeAssistant("latest ack"),
    ];

    const result = applyContextBudgetGuard({
      messages,
      cfg: {
        agents: {
          defaults: {
            historyOptimization: {
              digestOldToolResults: true,
              keepRawTurns: 2,
              oldToolResultMaxChars: 180,
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
    });

    expect(toolText(result.messages[1])).not.toBe(old);
    expect(toolText(result.messages[3])).toBe(recentA);
    expect(toolText(result.messages[5])).toBe(recentB);
  });
});
