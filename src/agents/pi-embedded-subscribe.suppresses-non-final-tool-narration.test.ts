import type { AssistantMessage } from "@mariozechner/pi-ai";
import { describe, expect, it, vi } from "vitest";
import {
  createSubscribedSessionHarness,
  extractTextPayloads,
} from "./pi-embedded-subscribe.e2e-harness.js";

describe("subscribeEmbeddedPiSession", () => {
  it("suppresses non-final assistant narration without phase metadata", async () => {
    const onBlockReply = vi.fn();
    const onPartialReply = vi.fn();
    const { emit, subscription } = createSubscribedSessionHarness({
      runId: "run",
      onBlockReply,
      onPartialReply,
      blockReplyBreak: "message_end",
    });

    const firstToolMessage = {
      role: "assistant",
      content: [
        { type: "text", text: "I'll pull the controlling deadlines and served folder now." },
        { type: "tool_use", id: "tool_1", name: "read", input: { path: "served-folder" } },
      ],
      stopReason: "toolUse",
    } as AssistantMessage;
    emit({ type: "message_start", message: firstToolMessage });
    emit({
      type: "message_update",
      message: firstToolMessage,
      assistantMessageEvent: {
        type: "text_delta",
        delta: "I'll pull the controlling deadlines and served folder now.",
      },
    });
    emit({ type: "message_end", message: firstToolMessage });

    emit({
      type: "tool_execution_start",
      toolName: "read",
      toolCallId: "tool_1",
      args: { path: "served-folder" },
    });
    emit({
      type: "tool_execution_end",
      toolName: "read",
      toolCallId: "tool_1",
      isError: false,
      result: { ok: true },
    });

    const secondToolMessage = {
      role: "assistant",
      content: [
        {
          type: "text",
          text: "The batch packager is for served folder prep. Confirmed this is a new matter.",
        },
        { type: "toolUse", id: "tool_2", name: "write", input: { path: "batch-packager" } },
      ],
      stopReason: "toolUse",
    } as AssistantMessage;
    emit({ type: "message_start", message: secondToolMessage });
    emit({
      type: "message_update",
      message: secondToolMessage,
      assistantMessageEvent: {
        type: "text_delta",
        delta: "The batch packager is for served folder prep. Confirmed this is a new matter.",
      },
    });
    emit({ type: "message_end", message: secondToolMessage });

    emit({
      type: "tool_execution_start",
      toolName: "write",
      toolCallId: "tool_2",
      args: { path: "batch-packager" },
    });
    emit({
      type: "tool_execution_end",
      toolName: "write",
      toolCallId: "tool_2",
      isError: false,
      result: { ok: true },
    });

    const finalMessage = {
      role: "assistant",
      content: [{ type: "text", text: "Here is your demand letter. [ATTORNEY REVIEW REQUIRED]" }],
      stopReason: "stop",
    } as AssistantMessage;
    emit({ type: "message_start", message: finalMessage });
    emit({
      type: "message_update",
      message: finalMessage,
      assistantMessageEvent: {
        type: "text_delta",
        delta: "Here is your demand letter. [ATTORNEY REVIEW REQUIRED]",
      },
    });
    emit({ type: "message_end", message: finalMessage });

    await Promise.resolve();

    const blockReplyTexts = extractTextPayloads(onBlockReply.mock.calls);
    const partialReplyTexts = extractTextPayloads(onPartialReply.mock.calls);

    expect(blockReplyTexts).toEqual(["Here is your demand letter. [ATTORNEY REVIEW REQUIRED]"]);
    expect(partialReplyTexts).toEqual([]);
    expect(subscription.assistantTexts).toContain(
      "Here is your demand letter. [ATTORNEY REVIEW REQUIRED]",
    );

    const visiblePayload = blockReplyTexts.join("\n");
    const denylist = [
      "I'll pull",
      "batch packager",
      "served folder",
      "Confirmed this is a new matter",
    ];
    for (const phrase of denylist) {
      expect(visiblePayload).not.toContain(phrase);
    }
  });

  it("still delivers terminal no-tool turns without phase metadata", async () => {
    const onBlockReply = vi.fn();
    const onPartialReply = vi.fn();
    const { emit } = createSubscribedSessionHarness({
      runId: "run",
      onBlockReply,
      onPartialReply,
      blockReplyBreak: "message_end",
    });

    const finalMessage = {
      role: "assistant",
      content: [{ type: "text", text: "Direct answer without tool calls." }],
      stopReason: "stop",
    } as AssistantMessage;
    emit({ type: "message_start", message: finalMessage });
    emit({
      type: "message_update",
      message: finalMessage,
      assistantMessageEvent: {
        type: "text_delta",
        delta: "Direct answer without tool calls.",
      },
    });
    emit({ type: "message_end", message: finalMessage });

    await Promise.resolve();

    expect(extractTextPayloads(onBlockReply.mock.calls)).toEqual([
      "Direct answer without tool calls.",
    ]);
    expect(extractTextPayloads(onPartialReply.mock.calls)).toEqual([]);
  });
});
