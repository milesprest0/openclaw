import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { describe, expect, it } from "vitest";
import {
  CONTEXT_BUDGET_IMAGE_PLACEHOLDER,
  applyContextBudgetGuard,
  resolveContextBudget,
} from "./context-budget.js";

function makeUserMessage(content: AgentMessage["content"]): AgentMessage {
  return {
    role: "user",
    content,
    timestamp: 0,
  } as AgentMessage;
}

function makeAssistantMessage(text: string): AgentMessage {
  return {
    role: "assistant",
    content: text,
    timestamp: 0,
  } as AgentMessage;
}

describe("context budget guard", () => {
  it("trims a large transcript under budget before reserve", () => {
    const hugeChunk = "A".repeat(140_000);
    const messages: AgentMessage[] = [];
    for (let i = 0; i < 100; i += 1) {
      messages.push(
        makeUserMessage([
          { type: "text", text: `turn-${i} ${hugeChunk}` },
          { type: "image", data: "x".repeat(8_000), mimeType: "image/png" },
        ] as unknown as AgentMessage["content"]),
      );
      messages.push(makeAssistantMessage(`ack-${i}`));
    }

    const result = applyContextBudgetGuard({
      messages,
      cfg: {
        agents: {
          defaults: {
            contextBudget: {
              enabled: true,
              maxAssembledTokens: 220_000,
              reserveTokens: 20_000,
              perThreadMaxImages: 8,
            },
          },
        },
      },
      contextWindowTokens: 1_000_000,
      prompt: "new prompt",
    });

    expect(result.applied).toBe(true);
    expect(result.estimatedTokens).toBeLessThanOrEqual(result.budgetBeforeReserve);
    expect(result.droppedTurns).toBeGreaterThan(0);
    expect(result.imageBlocksPruned).toBeGreaterThan(0);
  });

  it("replaces oldest inline images with placeholders and keeps newest images", () => {
    const messages: AgentMessage[] = [];
    for (let i = 0; i < 12; i += 1) {
      messages.push(
        makeUserMessage([
          { type: "text", text: `image-${i}` },
          { type: "image", data: `img-${i}`, mimeType: "image/png" },
        ] as unknown as AgentMessage["content"]),
      );
      messages.push(makeAssistantMessage(`ok-${i}`));
    }

    const result = applyContextBudgetGuard({
      messages,
      cfg: {
        agents: {
          defaults: {
            contextBudget: {
              enabled: true,
              maxAssembledTokens: 1_000_000,
              reserveTokens: 1,
              perThreadMaxImages: 8,
            },
          },
        },
      },
      contextWindowTokens: 1_000_000,
    });

    const flattenedBlocks = result.messages.flatMap((message) => {
      const content = (message as { content?: unknown }).content;
      return Array.isArray(content) ? content : [];
    });
    const imageBlocks = flattenedBlocks.filter(
      (block) =>
        block && typeof block === "object" && (block as { type?: string }).type === "image",
    );
    const placeholderBlocks = flattenedBlocks.filter(
      (block) =>
        block &&
        typeof block === "object" &&
        (block as { type?: string }).type === "text" &&
        (block as { text?: string }).text === CONTEXT_BUDGET_IMAGE_PLACEHOLDER,
    );

    expect(imageBlocks).toHaveLength(8);
    expect(placeholderBlocks).toHaveLength(4);

    const firstUserContent = (result.messages[0] as { content?: unknown }).content as Array<{
      type?: string;
      text?: string;
    }>;
    expect(firstUserContent[1]).toMatchObject({
      type: "text",
      text: CONTEXT_BUDGET_IMAGE_PLACEHOLDER,
    });
  });

  it("uses default budget values when unset and honors tenant overrides", () => {
    const defaults = resolveContextBudget({ contextWindowTokens: 200_000 });
    expect(defaults.enabled).toBe(true);
    expect(defaults.maxAssembledTokens).toBe(120_000);
    expect(defaults.reserveTokens).toBe(20_000);
    expect(defaults.perThreadMaxImages).toBe(8);

    const overridden = resolveContextBudget({
      contextWindowTokens: 200_000,
      accountId: "tenant-b",
      cfg: {
        agents: {
          defaults: {
            contextBudget: {
              maxAssembledTokens: 120_000,
              reserveTokens: 20_000,
              perThreadMaxImages: 8,
              overrides: {
                "tenant-b": {
                  maxAssembledTokens: 90_000,
                  reserveTokens: 10_000,
                  perThreadMaxImages: 4,
                },
              },
            },
          },
        },
      },
    });
    expect(overridden.maxAssembledTokens).toBe(90_000);
    expect(overridden.reserveTokens).toBe(10_000);
    expect(overridden.perThreadMaxImages).toBe(4);
    expect(overridden.overrideKey).toBe("tenant-b");
  });
});
