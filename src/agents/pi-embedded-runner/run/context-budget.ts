import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { estimateTokens } from "@mariozechner/pi-coding-agent";
import type {
  AgentContextBudgetConfig,
  AgentContextBudgetOverrideConfig,
} from "../../../config/types.agent-defaults.js";
import type { OpenClawConfig } from "../../../config/types.openclaw.js";
import { normalizeOptionalAccountId } from "../../../routing/session-key.js";
import { normalizeOptionalString } from "../../../shared/string-coerce.js";
import { SAFETY_MARGIN, estimateMessagesTokens } from "../../compaction.js";
import { log } from "../logger.js";

const DEFAULT_MAX_ASSEMBLED_RATIO = 0.6;
const DEFAULT_PER_THREAD_MAX_IMAGES = 8;
const DEFAULT_RESERVE_TOKENS = 20_000;

export const CONTEXT_BUDGET_IMAGE_PLACEHOLDER = "[image data removed - context budget image cap]";

type PromptInlineImage = {
  type: "image";
  data: string;
  mimeType?: string;
};

export type ResolvedContextBudget = {
  enabled: boolean;
  maxAssembledTokens: number;
  reserveTokens: number;
  budgetBeforeReserve: number;
  perThreadMaxImages: number;
  overrideKey?: string;
};

export type ContextBudgetGuardResult = {
  messages: AgentMessage[];
  estimatedTokens: number;
  budgetBeforeReserve: number;
  imageBlocksPruned: number;
  droppedTurns: number;
  applied: boolean;
};

function normalizePositiveInt(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  const next = Math.floor(value);
  return next > 0 ? next : undefined;
}

function normalizeNonNegativeInt(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  const next = Math.floor(value);
  return next >= 0 ? next : undefined;
}

function resolveTenantOverride(params: {
  contextBudget?: AgentContextBudgetConfig;
  accountId?: string | null;
  overrideKey?: string;
}): { override?: AgentContextBudgetOverrideConfig; overrideKey?: string } {
  const configured = params.contextBudget;
  const explicitKey = normalizeOptionalString(params.overrideKey);
  const configKey = normalizeOptionalString(configured?.overrideKey);
  const accountKey = normalizeOptionalAccountId(params.accountId);
  const key = explicitKey ?? configKey ?? accountKey;
  if (!key) {
    return {};
  }
  const override = configured?.overrides?.[key];
  if (!override || typeof override !== "object") {
    return {};
  }
  return { override, overrideKey: key };
}

export function resolveContextBudget(params: {
  cfg?: OpenClawConfig;
  contextWindowTokens: number;
  accountId?: string | null;
  overrideKey?: string;
}): ResolvedContextBudget {
  const contextWindowTokens = Math.max(1, Math.floor(params.contextWindowTokens));
  const configured = params.cfg?.agents?.defaults?.contextBudget;
  const { override, overrideKey } = resolveTenantOverride({
    contextBudget: configured,
    accountId: params.accountId,
    overrideKey: params.overrideKey,
  });
  const merged: AgentContextBudgetOverrideConfig = {
    ...(configured ?? {}),
    ...(override ?? {}),
  };

  const enabled = merged.enabled ?? true;
  const maxAssembledTokens = Math.min(
    contextWindowTokens,
    normalizePositiveInt(merged.maxAssembledTokens) ??
      Math.max(1, Math.floor(contextWindowTokens * DEFAULT_MAX_ASSEMBLED_RATIO)),
  );
  const reserveTokens = Math.max(
    0,
    Math.min(
      maxAssembledTokens - 1,
      normalizeNonNegativeInt(merged.reserveTokens) ?? DEFAULT_RESERVE_TOKENS,
    ),
  );
  const budgetBeforeReserve = Math.max(1, maxAssembledTokens - reserveTokens);
  const perThreadMaxImages =
    normalizeNonNegativeInt(merged.perThreadMaxImages) ?? DEFAULT_PER_THREAD_MAX_IMAGES;

  return {
    enabled,
    maxAssembledTokens,
    reserveTokens,
    budgetBeforeReserve,
    perThreadMaxImages,
    overrideKey,
  };
}

function estimateAssembledTokens(params: {
  messages: AgentMessage[];
  systemPrompt?: string;
  prompt?: string;
  promptImages?: readonly PromptInlineImage[];
}): number {
  let estimated = estimateMessagesTokens(params.messages);
  const systemPrompt = normalizeOptionalString(params.systemPrompt);
  if (systemPrompt) {
    estimated += estimateTokens({
      role: "system",
      content: systemPrompt,
      timestamp: 0,
    } as unknown as AgentMessage);
  }

  const promptText = normalizeOptionalString(params.prompt) ?? "";
  const promptImages = Array.isArray(params.promptImages)
    ? params.promptImages.filter((img) => img?.type === "image")
    : [];
  if (promptText.length > 0 || promptImages.length > 0) {
    const content =
      promptImages.length > 0
        ? ([
            ...(promptText.length > 0 ? [{ type: "text", text: promptText }] : []),
            ...promptImages,
          ] as unknown)
        : promptText;
    estimated += estimateTokens({
      role: "user",
      content,
      timestamp: 0,
    } as unknown as AgentMessage);
  }

  return Math.max(0, Math.ceil(estimated * SAFETY_MARGIN));
}

function ageOutOldestInlineImages(params: {
  messages: AgentMessage[];
  perThreadMaxImages: number;
}): { messages: AgentMessage[]; prunedCount: number } {
  if (params.perThreadMaxImages < 0 || params.messages.length === 0) {
    return { messages: params.messages, prunedCount: 0 };
  }
  let seenImages = 0;
  let prunedCount = 0;
  let nextMessages: AgentMessage[] | undefined;

  for (let messageIndex = params.messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = params.messages[messageIndex];
    const content = (message as { content?: unknown }).content;
    if (!Array.isArray(content) || content.length === 0) {
      continue;
    }
    let nextContent: unknown[] | undefined;
    for (let blockIndex = content.length - 1; blockIndex >= 0; blockIndex -= 1) {
      const block = content[blockIndex];
      if (!block || typeof block !== "object") {
        continue;
      }
      if ((block as { type?: unknown }).type !== "image") {
        continue;
      }
      seenImages += 1;
      if (seenImages <= params.perThreadMaxImages) {
        continue;
      }
      prunedCount += 1;
      nextContent ??= content.slice();
      nextContent[blockIndex] = { type: "text", text: CONTEXT_BUDGET_IMAGE_PLACEHOLDER };
    }
    if (!nextContent) {
      continue;
    }
    nextMessages ??= params.messages.slice();
    nextMessages[messageIndex] = { ...message, content: nextContent } as AgentMessage;
  }

  return { messages: nextMessages ?? params.messages, prunedCount };
}

function resolveDropCountForOldestTurn(messages: AgentMessage[]): number {
  if (messages.length === 0) {
    return 0;
  }
  const firstUserIndex = messages.findIndex((message) => message.role === "user");
  if (firstUserIndex < 0) {
    return 1;
  }
  for (let i = firstUserIndex + 1; i < messages.length; i += 1) {
    if (messages[i]?.role === "user") {
      return i;
    }
  }
  return messages.length;
}

function resolveLastUserMessageIndex(messages: AgentMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "user") {
      return i;
    }
  }
  return -1;
}

export function applyContextBudgetGuard(params: {
  messages: AgentMessage[];
  cfg?: OpenClawConfig;
  contextWindowTokens: number;
  accountId?: string | null;
  overrideKey?: string;
  systemPrompt?: string;
  prompt?: string;
  promptImages?: readonly PromptInlineImage[];
}): ContextBudgetGuardResult {
  const budget = resolveContextBudget({
    cfg: params.cfg,
    contextWindowTokens: params.contextWindowTokens,
    accountId: params.accountId,
    overrideKey: params.overrideKey,
  });
  let currentMessages = params.messages;
  let droppedTurns = 0;
  const aged = ageOutOldestInlineImages({
    messages: currentMessages,
    perThreadMaxImages: budget.perThreadMaxImages,
  });
  currentMessages = aged.messages;
  let estimatedTokens = estimateAssembledTokens({
    messages: currentMessages,
    systemPrompt: params.systemPrompt,
    prompt: params.prompt,
    promptImages: params.promptImages,
  });
  if (!budget.enabled) {
    return {
      messages: currentMessages,
      estimatedTokens,
      budgetBeforeReserve: budget.budgetBeforeReserve,
      imageBlocksPruned: aged.prunedCount,
      droppedTurns,
      applied: aged.prunedCount > 0,
    };
  }

  while (estimatedTokens > budget.budgetBeforeReserve && currentMessages.length > 0) {
    const dropCount = resolveDropCountForOldestTurn(currentMessages);
    if (dropCount <= 0) {
      break;
    }
    const lastUserIndex = resolveLastUserMessageIndex(currentMessages);
    const maxDropCount =
      lastUserIndex >= 0 ? lastUserIndex : Math.max(0, currentMessages.length - 1);
    if (maxDropCount <= 0) {
      log.info(
        `[context-budget] drop floor hit; preserving most recent turn ` +
          `estimated=${estimatedTokens} budget=${budget.budgetBeforeReserve} ` +
          `messages=${currentMessages.length}`,
      );
      break;
    }
    currentMessages = currentMessages.slice(Math.min(dropCount, maxDropCount));
    droppedTurns += 1;
    estimatedTokens = estimateAssembledTokens({
      messages: currentMessages,
      systemPrompt: params.systemPrompt,
      prompt: params.prompt,
      promptImages: params.promptImages,
    });
  }

  return {
    messages: currentMessages,
    estimatedTokens,
    budgetBeforeReserve: budget.budgetBeforeReserve,
    imageBlocksPruned: aged.prunedCount,
    droppedTurns,
    applied: aged.prunedCount > 0 || droppedTurns > 0,
  };
}

export function isLikelyOverBudget(params: {
  budget: Pick<ResolvedContextBudget, "enabled" | "budgetBeforeReserve">;
  approxTranscriptTokens: number;
}): boolean {
  if (!params.budget.enabled) {
    return false;
  }
  return Math.max(0, Math.floor(params.approxTranscriptTokens)) > params.budget.budgetBeforeReserve;
}
