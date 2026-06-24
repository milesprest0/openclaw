import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { describe, expect, it } from "vitest";
import {
  CONTEXT_BUDGET_IMAGE_PLACEHOLDER,
  applyContextBudgetGuard,
  resolveContextBudget,
} from "./context-budget.js";

function makeUserMessage(content: string | unknown[]): AgentMessage {
  return {
    role: "user",
    content,
    timestamp: 0,
  } as unknown as AgentMessage;
}

function makeAssistantMessage(text: string): AgentMessage {
  return {
    role: "assistant",
    content: text,
    timestamp: 0,
  } as unknown as AgentMessage;
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
        ] as unknown[]),
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
        ] as unknown[]),
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
    expect(defaults.targetBand).toBeUndefined();

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

  it("maps targetBand max=32000 to deterministic guard budgets", () => {
    const resolved = resolveContextBudget({
      contextWindowTokens: 200_000,
      cfg: {
        agents: {
          defaults: {
            contextBudget: {
              targetBand: {
                min: 16_000,
                max: 32_000,
              },
            },
          },
        },
      },
    });

    expect(resolved.targetBand).toEqual({ min: 16_000, max: 32_000 });
    expect(resolved.maxAssembledTokens).toBe(32_000);
    expect(resolved.reserveTokens).toBe(4_000);
    expect(resolved.budgetBeforeReserve).toBe(28_000);
  });

  it("keeps default-off behavior byte-identical when targetBand is absent", () => {
    const withoutBand = resolveContextBudget({
      contextWindowTokens: 200_000,
      cfg: {
        agents: {
          defaults: {
            contextBudget: {
              enabled: true,
              maxAssembledTokens: 120_000,
              reserveTokens: 20_000,
              perThreadMaxImages: 8,
            },
          },
        },
      },
    });

    expect(JSON.stringify(withoutBand)).toBe(
      JSON.stringify({
        enabled: true,
        maxAssembledTokens: 120_000,
        reserveTokens: 20_000,
        budgetBeforeReserve: 100_000,
        perThreadMaxImages: 8,
      }),
    );
  });

  it("preserves a single oversized current turn instead of dropping to empty", () => {
    const messages: AgentMessage[] = [makeUserMessage(`current-turn ${"Z".repeat(250_000)}`)];

    const result = applyContextBudgetGuard({
      messages,
      cfg: {
        agents: {
          defaults: {
            contextBudget: {
              enabled: true,
              maxAssembledTokens: 1_000,
              reserveTokens: 1,
            },
          },
        },
      },
      contextWindowTokens: 1_000,
      prompt: "new prompt",
    });

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]?.role).toBe("user");
    expect((result.messages[0] as { content?: unknown })?.content).toBe(
      (messages[0] as { content?: unknown })?.content,
    );
    expect(result.droppedTurns).toBe(0);
  });

  it("always keeps the most recent turn under aggressive budget pressure", () => {
    const messages: AgentMessage[] = [
      makeUserMessage("old-turn-1"),
      makeAssistantMessage("old-ack-1"),
      makeUserMessage("old-turn-2"),
      makeAssistantMessage("old-ack-2"),
      makeUserMessage(`current-turn ${"Y".repeat(200_000)}`),
      makeAssistantMessage("current-ack"),
    ];

    const result = applyContextBudgetGuard({
      messages,
      cfg: {
        agents: {
          defaults: {
            contextBudget: {
              enabled: true,
              maxAssembledTokens: 1_000,
              reserveTokens: 1,
            },
          },
        },
      },
      contextWindowTokens: 1_000,
      prompt: "new prompt",
    });

    const latestUser = result.messages.find((message) => message.role === "user");
    expect((latestUser as { content?: unknown })?.content).toBe(
      (messages[4] as { content?: unknown })?.content,
    );
    expect((result.messages.at(-1) as { content?: unknown })?.content).toBe("current-ack");
    expect(result.messages).not.toHaveLength(0);
  });

  it("keeps p99 assembled tokens at or below 32000 with targetBand enabled", () => {
    const tokenEstimates: number[] = [];

    for (let run = 0; run < 50; run += 1) {
      const messages: AgentMessage[] = [];
      for (let i = 0; i < 48; i += 1) {
        const burst = "X".repeat(1_800 + ((run + i) % 11) * 320);
        messages.push(makeUserMessage(`turn-${run}-${i} ${burst}`));
        messages.push(makeAssistantMessage(`ack-${run}-${i} ${burst.slice(0, 240)}`));
      }

      const result = applyContextBudgetGuard({
        messages,
        cfg: {
          agents: {
            defaults: {
              contextBudget: {
                enabled: true,
                targetBand: {
                  min: 16_000,
                  max: 32_000,
                },
              },
            },
          },
        },
        contextWindowTokens: 200_000,
        prompt: "follow-up prompt",
      });

      tokenEstimates.push(result.estimatedTokens);
      const latestUser = result.messages.filter((message) => message.role === "user").at(-1);
      expect(latestUser?.content).toBe(
        messages.filter((message) => message.role === "user").at(-1)?.content,
      );
    }

    const sorted = [...tokenEstimates].sort((a, b) => a - b);
    const p99Index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.99) - 1);
    const p99 = sorted[p99Index] ?? 0;
    expect(p99).toBeLessThanOrEqual(32_000);
  });
});
