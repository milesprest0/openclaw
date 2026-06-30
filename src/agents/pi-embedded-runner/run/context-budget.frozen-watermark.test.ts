import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { describe, expect, it } from "vitest";
import { applyContextBudgetGuard } from "./context-budget.js";
import { segmentHistory } from "./history-segments.js";

function makeUser(text: string): AgentMessage {
  return { role: "user", content: text, timestamp: 0 } as unknown as AgentMessage;
}

function makeAssistant(text: string): AgentMessage {
  return { role: "assistant", content: text, timestamp: 0 } as unknown as AgentMessage;
}

function makeToolResult(
  text: string,
  toolName = "read",
  toolCallId = `${toolName}-1`,
): AgentMessage {
  return {
    role: "toolResult",
    toolName,
    toolCallId,
    content: [{ type: "text", text }],
    timestamp: 0,
  } as unknown as AgentMessage;
}

function buildDigestConfig(freezeMode?: "off" | "sliding" | "frozen") {
  return {
    agents: {
      defaults: {
        historyOptimization: {
          digestOldToolResults: true,
          ...(freezeMode ? { freezeMode } : {}),
          keepRawTurns: 1,
          oldToolResultMaxChars: 180,
        },
        contextBudget: {
          enabled: true,
          maxAssembledTokens: 500_000,
          reserveTokens: 1,
        },
      },
    },
  };
}

describe("context-budget frozen watermark", () => {
  it("keeps sliding mode byte-identical to the existing behavior", () => {
    const messages: AgentMessage[] = [
      makeUser("turn-1"),
      makeToolResult("old output /tmp/a.log CASE-100001 https://example.com/r/1"),
      makeUser("turn-2"),
      makeToolResult("recent output should stay raw"),
      makeAssistant("done"),
    ];

    const baseline = applyContextBudgetGuard({
      messages,
      cfg: buildDigestConfig(),
      contextWindowTokens: 500_000,
    });
    const sliding = applyContextBudgetGuard({
      messages,
      cfg: buildDigestConfig("sliding"),
      contextWindowTokens: 500_000,
    });
    const off = applyContextBudgetGuard({
      messages,
      cfg: buildDigestConfig("off"),
      contextWindowTokens: 500_000,
    });

    expect(JSON.stringify(sliding.messages)).toBe(JSON.stringify(baseline.messages));
    expect(JSON.stringify(off.messages)).toBe(JSON.stringify(baseline.messages));
  });

  it("keeps below-watermark bytes frozen across successive guard runs", () => {
    const turnT: AgentMessage[] = [
      makeUser("turn-1"),
      makeToolResult("old payload alpha " + "x".repeat(1500), "read", "read-1"),
      makeUser("turn-2"),
      makeToolResult("fresh payload beta " + "y".repeat(400), "read", "read-2"),
      makeAssistant("ack-2"),
    ];

    const first = applyContextBudgetGuard({
      messages: turnT,
      cfg: buildDigestConfig("frozen"),
      contextWindowTokens: 500_000,
    });

    const watermark = first.historyFrozenWatermark ?? 0;
    expect(watermark).toBeGreaterThan(0);
    const frozenSliceAtT = JSON.stringify(first.messages.slice(0, watermark));

    const turnTPlusOne = [
      ...first.messages,
      makeUser("turn-3"),
      makeToolResult("new payload gamma " + "z".repeat(700), "read", "read-3"),
      makeAssistant("ack-3"),
    ];
    const second = applyContextBudgetGuard({
      messages: turnTPlusOne,
      cfg: buildDigestConfig("frozen"),
      contextWindowTokens: 500_000,
      persistedHistoryFrozenWatermark: watermark,
    });

    const frozenSliceAtTPlusOne = JSON.stringify(second.messages.slice(0, watermark));
    expect(frozenSliceAtTPlusOne).toBe(frozenSliceAtT);
  });

  it("advances watermark monotonically", () => {
    const base: AgentMessage[] = [
      makeUser("turn-1"),
      makeToolResult("alpha " + "x".repeat(800), "read", "read-a"),
      makeUser("turn-2"),
      makeToolResult("beta " + "y".repeat(800), "read", "read-b"),
      makeAssistant("ack"),
    ];

    const first = applyContextBudgetGuard({
      messages: base,
      cfg: buildDigestConfig("frozen"),
      contextWindowTokens: 500_000,
    });
    const watermark1 = first.historyFrozenWatermark ?? 0;

    const second = applyContextBudgetGuard({
      messages: [...base, makeUser("turn-3"), makeAssistant("ack-3")],
      cfg: buildDigestConfig("frozen"),
      contextWindowTokens: 500_000,
      persistedHistoryFrozenWatermark: watermark1,
    });
    const watermark2 = second.historyFrozenWatermark ?? 0;

    const third = applyContextBudgetGuard({
      messages: second.messages.slice(Math.max(0, second.messages.length - 2)),
      cfg: buildDigestConfig("frozen"),
      contextWindowTokens: 500_000,
      persistedHistoryFrozenWatermark: watermark2,
    });
    const watermark3 = third.historyFrozenWatermark ?? 0;

    expect(watermark2).toBeGreaterThanOrEqual(watermark1);
    expect(watermark3).toBeGreaterThanOrEqual(watermark2);
  });

  it("segments history deterministically and without side effects", () => {
    const messages: AgentMessage[] = [
      { ...makeUser("turn-1"), frozen: true } as unknown as AgentMessage,
      { ...makeToolResult("digest", "read", "read-1"), frozen: true } as unknown as AgentMessage,
      makeUser("turn-2"),
      makeAssistant("warm"),
      makeUser("turn-3"),
      makeAssistant("live"),
    ];

    const first = segmentHistory(messages, { warmTurns: 1, frozenMarkerKey: "frozen" });
    const second = segmentHistory(messages, { warmTurns: 1, frozenMarkerKey: "frozen" });

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(messages[0]).toMatchObject({ frozen: true, role: "user" });
    expect(first.frozen).toHaveLength(2);
    expect(first.live.at(0)?.role).toBe("user");
  });

  it("matches the golden default output for assembled messages", () => {
    const result = applyContextBudgetGuard({
      messages: [
        makeUser("turn-1"),
        makeToolResult(
          "old output /tmp/report-1.log CASE-42 https://example.com/1 " + "a".repeat(600),
        ),
        makeAssistant("ack-1"),
        makeUser("turn-2"),
        makeToolResult("new output should remain raw"),
      ],
      cfg: buildDigestConfig(),
      contextWindowTokens: 500_000,
    });

    expect(result.messages).toMatchInlineSnapshot(`
      [
        {
          "content": "turn-1",
          "role": "user",
          "timestamp": 0,
        },
        {
          "content": [
            {
              "text": "{"tool":"read","argsHash":"9c1e0c5c3d","outcome":"ok","keyFacts":"[... 120 more character","idsPreserved":["/tmp/report-1.log","CASE-42","https://example.com/1"]}",
              "type": "text",
            },
          ],
          "role": "toolResult",
          "timestamp": 0,
          "toolCallId": "read-1",
          "toolName": "read",
        },
        {
          "content": "ack-1",
          "role": "assistant",
          "timestamp": 0,
        },
        {
          "content": "turn-2",
          "role": "user",
          "timestamp": 0,
        },
        {
          "content": [
            {
              "text": "new output should remain raw",
              "type": "text",
            },
          ],
          "role": "toolResult",
          "timestamp": 0,
          "toolCallId": "read-1",
          "toolName": "read",
        },
      ]
    `);
  });
});
