import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { describe, expect, it } from "vitest";
import { castAgentMessage } from "../../test-helpers/agent-message-fixtures.js";
import { dropReasoningFromHistory } from "../thinking.js";
import { resolveThinkingEvictionPlan } from "./thinking-eviction-plan.js";

describe("resolveThinkingEvictionPlan", () => {
  it("resolves the full mode/safety truth table", () => {
    expect(resolveThinkingEvictionPlan({ mode: "off", evictionSafe: true })).toEqual({
      apply: false,
      measure: false,
    });
    expect(resolveThinkingEvictionPlan({ mode: "off", evictionSafe: false })).toEqual({
      apply: false,
      measure: false,
    });
    expect(resolveThinkingEvictionPlan({ mode: "shadow", evictionSafe: true })).toEqual({
      apply: false,
      measure: true,
    });
    expect(resolveThinkingEvictionPlan({ mode: "shadow", evictionSafe: false })).toEqual({
      apply: false,
      measure: false,
    });
    expect(resolveThinkingEvictionPlan({ mode: "on", evictionSafe: true })).toEqual({
      apply: true,
      measure: true,
    });
    expect(resolveThinkingEvictionPlan({ mode: "on", evictionSafe: false })).toEqual({
      apply: false,
      measure: false,
    });
  });

  it("keeps active tool-call continuation transcripts byte-identical in on mode", () => {
    const messages: AgentMessage[] = [
      castAgentMessage({ role: "user", content: "look up the answer" }),
      castAgentMessage({
        role: "assistant",
        content: [
          { type: "thinking", thinking: "call the tool" },
          { type: "toolCall", id: "call123456", name: "lookup", arguments: {} },
        ],
      }),
      castAgentMessage({
        role: "toolResult",
        toolCallId: "call123456",
        toolName: "lookup",
        content: "42",
      }),
    ];

    const plan = resolveThinkingEvictionPlan({ mode: "on", evictionSafe: true });
    const sanitized = plan.apply ? dropReasoningFromHistory(messages) : messages;

    expect(sanitized).toBe(messages);
  });
});
