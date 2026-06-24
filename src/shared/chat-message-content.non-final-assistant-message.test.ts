import { describe, expect, it } from "vitest";
import { isNonFinalAssistantMessage } from "./chat-message-content.js";

describe("isNonFinalAssistantMessage", () => {
  it("returns true for supported structured tool-call block types", () => {
    const blockTypes = [
      "toolCall",
      "toolUse",
      "tool_call",
      "tool_use",
      "functionCall",
      "function_call",
    ];

    for (const type of blockTypes) {
      expect(
        isNonFinalAssistantMessage({
          role: "assistant",
          content: [{ type }],
          stopReason: "stop",
        }),
      ).toBe(true);
    }
  });

  it("returns true when tool call arrays are present", () => {
    expect(
      isNonFinalAssistantMessage({
        role: "assistant",
        content: [{ type: "text", text: "working", tool_calls: [{}] }],
        stopReason: "stop",
      }),
    ).toBe(true);
    expect(
      isNonFinalAssistantMessage({
        role: "assistant",
        toolCalls: [{ id: "tool_1" }],
        stopReason: "stop",
      }),
    ).toBe(true);
  });

  it("returns true when stopReason is toolUse", () => {
    expect(
      isNonFinalAssistantMessage({
        role: "assistant",
        content: [{ type: "text", text: "working" }],
        stopReason: "toolUse",
      }),
    ).toBe(true);
  });

  it("returns false for terminal assistant messages", () => {
    expect(
      isNonFinalAssistantMessage({
        role: "assistant",
        content: [{ type: "text", text: "final" }],
        stopReason: "stop",
      }),
    ).toBe(false);
    expect(isNonFinalAssistantMessage({ role: "assistant", content: [] })).toBe(false);
    expect(isNonFinalAssistantMessage(undefined)).toBe(false);
  });
});
