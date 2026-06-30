import { createHash } from "node:crypto";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { estimateTokens } from "@mariozechner/pi-coding-agent";
import type {
  AgentContextBudgetConfig,
  AgentContextBudgetOverrideConfig,
  AgentHistoryOptimizationConfig,
  AgentContextBudgetTargetBandConfig,
} from "../../../config/types.agent-defaults.js";
import type { OpenClawConfig } from "../../../config/types.openclaw.js";
import { normalizeOptionalAccountId } from "../../../routing/session-key.js";
import { normalizeOptionalString } from "../../../shared/string-coerce.js";
import type { AnthropicHistoryCacheBreakpointsMode } from "../../anthropic-payload-policy.js";
import { SAFETY_MARGIN, estimateMessagesTokens } from "../../compaction.js";
import { log } from "../logger.js";
import { truncateToolResultText } from "../tool-result-truncation.js";

const DEFAULT_MAX_ASSEMBLED_RATIO = 0.6;
const DEFAULT_PER_THREAD_MAX_IMAGES = 8;
const DEFAULT_RESERVE_TOKENS = 20_000;
const DEFAULT_HISTORY_KEEP_RAW_TURNS = 3;
const DEFAULT_OLD_TOOL_RESULT_MAX_CHARS = 2_000;
const DEFAULT_HISTORY_FREEZE_MODE = "sliding";

export const HISTORY_FROZEN_WATERMARK_SESSION_KEY = "openclaw.history-frozen-watermark";
export const HISTORY_FROZEN_BOUNDARY_SENTINEL = "\n<!-- OPENCLAW_HISTORY_FROZEN_BOUNDARY -->\n";

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
  targetBand?: {
    min: number;
    max: number;
  };
  overrideKey?: string;
};

export type ContextBudgetGuardResult = {
  messages: AgentMessage[];
  estimatedTokens: number;
  budgetBeforeReserve: number;
  maxAssembledTokens: number;
  reserveTokens: number;
  imageBlocksPruned: number;
  droppedTurns: number;
  targetBandEnabled: boolean;
  historyDigestEnabled: boolean;
  historyDigested: boolean;
  historyBeforeChars: number;
  historyAfterChars: number;
  digestedToolResults: number;
  keepRawTurns: number;
  oldToolResultMaxChars: number;
  historyFrozenWatermark?: number;
  applied: boolean;
};

type ResolvedHistoryOptimization = {
  digestOldToolResults: boolean;
  keepRawTurns: number;
  oldToolResultMaxChars: number;
  freezeMode: "off" | "sliding" | "frozen";
  compactToolCallArgs: boolean;
};

type HistoryDigestStats = {
  messages: AgentMessage[];
  beforeChars: number;
  afterChars: number;
  digestedToolResults: number;
  frozenWatermark?: number;
};

function normalizeHistoryFreezeMode(value: unknown): "off" | "sliding" | "frozen" {
  if (value === "off" || value === "sliding" || value === "frozen") {
    return value;
  }
  return DEFAULT_HISTORY_FREEZE_MODE;
}

function normalizeHistoryCacheBreakpoints(
  value: unknown,
): AnthropicHistoryCacheBreakpointsMode | undefined {
  return value === "off" || value === "shadow" || value === "on" ? value : undefined;
}

function messageHasFrozenContentBlock(message: AgentMessage): boolean {
  const content = (message as { content?: unknown }).content;
  if (!Array.isArray(content)) {
    return false;
  }
  return content.some(
    (block) =>
      block && typeof block === "object" && (block as { frozen?: unknown }).frozen === true,
  );
}

function resolveLastFrozenMessageIndex(messages: AgentMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (!message) {
      continue;
    }
    if (
      (message as { frozen?: unknown }).frozen === true ||
      messageHasFrozenContentBlock(message)
    ) {
      return i;
    }
  }
  return -1;
}

export function appendHistoryFrozenSentinel(
  messages: AgentMessage[],
  mode: AnthropicHistoryCacheBreakpointsMode | undefined,
  freezeMode: "off" | "sliding" | "frozen",
): AgentMessage[] {
  if (mode !== "on" || freezeMode !== "frozen" || messages.length === 0) {
    return messages;
  }
  const boundaryIndex = resolveLastFrozenMessageIndex(messages);
  if (boundaryIndex < 0) {
    return messages;
  }
  const boundary = messages[boundaryIndex];
  if (!boundary) {
    return messages;
  }

  const content = (boundary as { content?: unknown }).content;
  if (typeof content === "string") {
    if (content.endsWith(HISTORY_FROZEN_BOUNDARY_SENTINEL)) {
      return messages;
    }
    const nextMessages = messages.slice();
    nextMessages[boundaryIndex] = {
      ...boundary,
      content: `${content}${HISTORY_FROZEN_BOUNDARY_SENTINEL}`,
    } as AgentMessage;
    return nextMessages;
  }

  if (!Array.isArray(content)) {
    const nextMessages = messages.slice();
    nextMessages[boundaryIndex] = {
      ...boundary,
      content: [{ type: "text", text: HISTORY_FROZEN_BOUNDARY_SENTINEL }],
    } as AgentMessage;
    return nextMessages;
  }

  let lastTextBlockIndex = -1;
  for (let i = content.length - 1; i >= 0; i -= 1) {
    const block = content[i];
    if (!block || typeof block !== "object") {
      continue;
    }
    const blockType = (block as { type?: unknown }).type;
    const text = (block as { text?: unknown }).text;
    if (blockType !== "text" || typeof text !== "string") {
      continue;
    }
    lastTextBlockIndex = i;
    break;
  }

  const nextContent = content.slice();
  if (lastTextBlockIndex >= 0) {
    const lastTextBlock = content[lastTextBlockIndex] as { text: string } & Record<string, unknown>;
    if (lastTextBlock.text.endsWith(HISTORY_FROZEN_BOUNDARY_SENTINEL)) {
      return messages;
    }
    nextContent[lastTextBlockIndex] = {
      ...lastTextBlock,
      text: `${lastTextBlock.text}${HISTORY_FROZEN_BOUNDARY_SENTINEL}`,
    };
  } else {
    nextContent.push({ type: "text", text: HISTORY_FROZEN_BOUNDARY_SENTINEL });
  }

  const nextMessages = messages.slice();
  nextMessages[boundaryIndex] = {
    ...boundary,
    content: nextContent,
  } as AgentMessage;
  return nextMessages;
}

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

function resolveHistoryOptimization(cfg?: OpenClawConfig): ResolvedHistoryOptimization {
  const optimization: AgentHistoryOptimizationConfig | undefined =
    cfg?.agents?.defaults?.historyOptimization;
  return {
    digestOldToolResults: optimization?.digestOldToolResults === true,
    keepRawTurns:
      normalizeNonNegativeInt(optimization?.keepRawTurns) ?? DEFAULT_HISTORY_KEEP_RAW_TURNS,
    oldToolResultMaxChars:
      normalizePositiveInt(optimization?.oldToolResultMaxChars) ??
      DEFAULT_OLD_TOOL_RESULT_MAX_CHARS,
    freezeMode: normalizeHistoryFreezeMode(optimization?.freezeMode),
    compactToolCallArgs: optimization?.compactToolCallArgs === true,
  };
}

function readFrozenWatermark(value: unknown): number {
  return normalizeNonNegativeInt(value) ?? 0;
}

export function parseHistoryFrozenWatermark(value: unknown): number | undefined {
  return normalizeNonNegativeInt(value);
}

function getMessageText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  const chunks: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") {
      continue;
    }
    const blockType = (block as { type?: unknown }).type;
    if (blockType !== "text") {
      continue;
    }
    const text = (block as { text?: unknown }).text;
    if (typeof text === "string" && text.length > 0) {
      chunks.push(text);
    }
  }
  return chunks.join("\n");
}

function collectIdentifiers(text: string): string[] {
  const matches = text.match(
    /https?:\/\/\S+|(?:\/|[A-Za-z]:\\)[^\s"')]+|\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b|\b[A-Z]{2,}-\d+\b|\b\d{5,}\b/giu,
  );
  if (!matches) {
    return [];
  }
  return Array.from(new Set(matches.map((value) => value.trim()).filter(Boolean))).slice(0, 24);
}

function digestToolResultText(params: {
  text: string;
  toolName?: string;
  argsSeed?: string;
  maxChars: number;
}): string {
  const compact = params.text.replace(/\s+/gu, " ").trim();
  const idsPreserved = collectIdentifiers(params.text);
  const argsHash = createHash("sha1")
    .update(params.argsSeed ?? compact)
    .digest("hex")
    .slice(0, 10);
  const keyFacts = truncateToolResultText(
    compact,
    Math.max(120, Math.floor(params.maxChars * 0.5)),
  );
  const outcome = /\b(error|failed|exception|fatal|traceback)\b/iu.test(compact) ? "error" : "ok";
  const digest = {
    tool: params.toolName ?? "unknown",
    argsHash,
    outcome,
    keyFacts,
    idsPreserved,
  };
  const rendered = JSON.stringify(digest);
  if (rendered.length <= params.maxChars) {
    return rendered;
  }
  const preservedPrefix = JSON.stringify({
    tool: digest.tool,
    argsHash: digest.argsHash,
    outcome: digest.outcome,
    idsPreserved: digest.idsPreserved,
  });
  const remaining = Math.max(16, params.maxChars - preservedPrefix.length - 32);
  const keyFactsBounded = truncateToolResultText(keyFacts, remaining);
  return JSON.stringify({
    tool: digest.tool,
    argsHash: digest.argsHash,
    outcome: digest.outcome,
    keyFacts: keyFactsBounded,
    idsPreserved: digest.idsPreserved,
  });
}

function digestToolCallArgs(params: {
  input: unknown;
  toolName?: string;
  toolCallId?: string;
  maxChars: number;
}): { name: string; argsHash: string; idsPreserved: string[]; keyArgs?: string } {
  const raw = JSON.stringify(params.input) ?? "";
  const compact = raw.replace(/\s+/gu, " ").trim();
  const idsPreserved = collectIdentifiers(raw);
  const argsHash = createHash("sha1")
    .update(params.toolCallId ?? raw)
    .digest("hex")
    .slice(0, 10);
  const keyArgs = truncateToolResultText(compact, Math.max(120, Math.floor(params.maxChars * 0.5)));
  const digest = {
    name: params.toolName ?? "unknown",
    argsHash,
    idsPreserved,
    keyArgs,
  };
  const rendered = JSON.stringify(digest);
  if (rendered.length <= params.maxChars) {
    return digest;
  }
  return {
    name: digest.name,
    argsHash: digest.argsHash,
    idsPreserved: digest.idsPreserved,
  };
}

function resolveDigestCutoffIndex(messages: AgentMessage[], keepRawTurns: number): number {
  const userIndexes: number[] = [];
  for (let i = 0; i < messages.length; i += 1) {
    if (messages[i]?.role === "user") {
      userIndexes.push(i);
    }
  }
  if (userIndexes.length === 0) {
    return -1;
  }
  const lastUserIndex = userIndexes[userIndexes.length - 1] ?? -1;
  if (lastUserIndex < 0) {
    return -1;
  }
  if (keepRawTurns <= 0) {
    return lastUserIndex;
  }
  const keepStartUserIndex =
    userIndexes[Math.max(0, userIndexes.length - keepRawTurns)] ?? lastUserIndex;
  return Math.min(lastUserIndex, keepStartUserIndex);
}

function digestOldToolResultsWithStats(
  messages: AgentMessage[],
  opts: {
    keepRawTurns: number;
    oldToolResultMaxChars: number;
    freezeMode: "off" | "sliding" | "frozen";
    persistedFrozenWatermark?: number;
    compactToolCallArgs: boolean;
  },
): HistoryDigestStats {
  if (messages.length === 0) {
    return {
      messages,
      beforeChars: 0,
      afterChars: 0,
      digestedToolResults: 0,
      ...(opts.freezeMode === "frozen"
        ? { frozenWatermark: readFrozenWatermark(opts.persistedFrozenWatermark) }
        : {}),
    };
  }
  const slidingCutoffIndex = resolveDigestCutoffIndex(messages, opts.keepRawTurns);
  const frozenWatermark =
    opts.freezeMode === "frozen"
      ? Math.max(readFrozenWatermark(opts.persistedFrozenWatermark), slidingCutoffIndex)
      : undefined;
  const cutoffIndex =
    opts.freezeMode === "frozen"
      ? Math.min(messages.length, frozenWatermark ?? 0)
      : slidingCutoffIndex;
  if (cutoffIndex <= 0) {
    return {
      messages,
      beforeChars: 0,
      afterChars: 0,
      digestedToolResults: 0,
      ...(opts.freezeMode === "frozen" ? { frozenWatermark } : {}),
    };
  }

  let nextMessages: AgentMessage[] | undefined;
  let beforeChars = 0;
  let afterChars = 0;
  let digestedToolResults = 0;

  for (let i = 0; i < cutoffIndex; i += 1) {
    const message = messages[i];
    if (!message) {
      continue;
    }
    if ((message as { role?: unknown }).role === "toolResult") {
      if (opts.freezeMode === "frozen" && (message as { frozen?: unknown }).frozen === true) {
        continue;
      }
      const text = getMessageText((message as { content?: unknown }).content);
      if (!text) {
        continue;
      }
      const digestText = digestToolResultText({
        text,
        toolName: (message as { toolName?: unknown }).toolName as string | undefined,
        argsSeed: JSON.stringify((message as { toolCallId?: unknown }).toolCallId ?? text),
        maxChars: opts.oldToolResultMaxChars,
      });
      beforeChars += text.length;
      afterChars += digestText.length;
      digestedToolResults += 1;
      nextMessages ??= messages.slice();
      nextMessages[i] = {
        ...message,
        content: [{ type: "text", text: digestText }],
        ...(opts.freezeMode === "frozen" ? { frozen: true } : {}),
      } as AgentMessage;
      continue;
    }

    const content = (message as { content?: unknown }).content;
    if (!Array.isArray(content) || content.length === 0) {
      continue;
    }
    let nextContent: unknown[] | undefined;
    for (let blockIndex = 0; blockIndex < content.length; blockIndex += 1) {
      const block = content[blockIndex];
      if (!block || typeof block !== "object") {
        continue;
      }
      const blockType = (block as { type?: unknown }).type;
      if (
        (blockType === "tool_use" || blockType === "toolCall") &&
        opts.freezeMode === "frozen" &&
        opts.compactToolCallArgs === true
      ) {
        if ((block as { frozen?: unknown }).frozen === true) {
          continue;
        }
        const input = (block as { input?: unknown }).input;
        if (!input || typeof input !== "object") {
          continue;
        }
        const rawInput = JSON.stringify(input) ?? "";
        if (!rawInput || rawInput === "{}" || rawInput === "[]") {
          continue;
        }
        const digestInput = digestToolCallArgs({
          input,
          toolName: (block as { name?: unknown }).name as string | undefined,
          toolCallId: (block as { id?: unknown }).id as string | undefined,
          maxChars: opts.oldToolResultMaxChars,
        });
        const digestInputText = JSON.stringify(digestInput) ?? "";
        beforeChars += rawInput.length;
        afterChars += digestInputText.length;
        nextContent ??= content.slice();
        nextContent[blockIndex] = {
          ...block,
          input: digestInput,
          frozen: true,
        };
        continue;
      }
      if (
        blockType !== "tool_result" &&
        blockType !== "tool-result" &&
        blockType !== "toolResult"
      ) {
        continue;
      }
      if (opts.freezeMode === "frozen" && (block as { frozen?: unknown }).frozen === true) {
        continue;
      }
      const rawText = (() => {
        const text = (block as { text?: unknown }).text;
        if (typeof text === "string") {
          return text;
        }
        const contentValue = (block as { content?: unknown }).content;
        return typeof contentValue === "string" ? contentValue : "";
      })();
      if (!rawText) {
        continue;
      }
      const digestText = digestToolResultText({
        text: rawText,
        toolName: (block as { toolName?: unknown }).toolName as string | undefined,
        argsSeed: JSON.stringify((block as { toolCallId?: unknown }).toolCallId ?? rawText),
        maxChars: opts.oldToolResultMaxChars,
      });
      beforeChars += rawText.length;
      afterChars += digestText.length;
      digestedToolResults += 1;
      nextContent ??= content.slice();
      nextContent[blockIndex] =
        opts.freezeMode === "frozen"
          ? { type: "text", text: digestText, frozen: true }
          : { type: "text", text: digestText };
    }
    if (!nextContent) {
      continue;
    }
    nextMessages ??= messages.slice();
    nextMessages[i] = { ...message, content: nextContent } as AgentMessage;
  }

  return {
    messages: nextMessages ?? messages,
    beforeChars,
    afterChars,
    digestedToolResults,
    ...(opts.freezeMode === "frozen" ? { frozenWatermark } : {}),
  };
}

export function digestOldToolResults(
  messages: AgentMessage[],
  opts: { keepRawTurns: number; oldToolResultMaxChars: number },
): AgentMessage[] {
  return digestOldToolResultsWithStats(messages, {
    ...opts,
    freezeMode: "sliding",
    compactToolCallArgs: false,
  }).messages;
}

function normalizeTargetBand(value: AgentContextBudgetTargetBandConfig | undefined):
  | {
      min: number;
      max: number;
    }
  | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const min = normalizePositiveInt(value.min);
  const max = normalizePositiveInt(value.max);
  if (!min || !max || max < min) {
    return undefined;
  }
  return { min, max };
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
    ...configured,
    ...override,
  };

  const enabled = merged.enabled ?? true;
  const targetBand = normalizeTargetBand(merged.targetBand);
  const maxAssembledTokens = Math.min(
    contextWindowTokens,
    targetBand?.max ??
      normalizePositiveInt(merged.maxAssembledTokens) ??
      Math.max(1, Math.floor(contextWindowTokens * DEFAULT_MAX_ASSEMBLED_RATIO)),
  );
  const defaultReserveTokens = (() => {
    if (!targetBand) {
      return DEFAULT_RESERVE_TOKENS;
    }
    const targetBudgetBeforeReserve = Math.max(
      1,
      Math.min(maxAssembledTokens - 1, Math.floor(targetBand.max * 0.875)),
    );
    return Math.max(0, maxAssembledTokens - targetBudgetBeforeReserve);
  })();
  const reserveTokens = Math.max(
    0,
    Math.min(
      maxAssembledTokens - 1,
      normalizeNonNegativeInt(merged.reserveTokens) ?? defaultReserveTokens,
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
    ...(targetBand ? { targetBand } : {}),
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
  persistedHistoryFrozenWatermark?: number;
}): ContextBudgetGuardResult {
  const budget = resolveContextBudget({
    cfg: params.cfg,
    contextWindowTokens: params.contextWindowTokens,
    accountId: params.accountId,
    overrideKey: params.overrideKey,
  });
  let currentMessages = params.messages;
  let droppedTurns = 0;
  const historyOptimization = resolveHistoryOptimization(params.cfg);
  const aged = ageOutOldestInlineImages({
    messages: currentMessages,
    perThreadMaxImages: budget.perThreadMaxImages,
  });
  currentMessages = aged.messages;
  const digested = historyOptimization.digestOldToolResults
    ? digestOldToolResultsWithStats(currentMessages, {
        keepRawTurns: historyOptimization.keepRawTurns,
        oldToolResultMaxChars: historyOptimization.oldToolResultMaxChars,
        freezeMode: historyOptimization.freezeMode,
        persistedFrozenWatermark: params.persistedHistoryFrozenWatermark,
        compactToolCallArgs: historyOptimization.compactToolCallArgs,
      })
    : {
        messages: currentMessages,
        beforeChars: 0,
        afterChars: 0,
        digestedToolResults: 0,
        frozenWatermark: undefined,
      };
  currentMessages = digested.messages;
  const historyCacheBreakpoints = normalizeHistoryCacheBreakpoints(
    params.cfg?.agents?.defaults?.experimental?.historyCacheBreakpoints,
  );
  currentMessages = appendHistoryFrozenSentinel(
    currentMessages,
    historyCacheBreakpoints,
    historyOptimization.freezeMode,
  );
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
      maxAssembledTokens: budget.maxAssembledTokens,
      reserveTokens: budget.reserveTokens,
      imageBlocksPruned: aged.prunedCount,
      droppedTurns,
      targetBandEnabled: !!budget.targetBand,
      historyDigestEnabled: historyOptimization.digestOldToolResults,
      historyDigested: digested.digestedToolResults > 0,
      historyBeforeChars: digested.beforeChars,
      historyAfterChars: digested.afterChars,
      digestedToolResults: digested.digestedToolResults,
      keepRawTurns: historyOptimization.keepRawTurns,
      oldToolResultMaxChars: historyOptimization.oldToolResultMaxChars,
      historyFrozenWatermark: digested.frozenWatermark,
      applied: aged.prunedCount > 0 || digested.digestedToolResults > 0,
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
    maxAssembledTokens: budget.maxAssembledTokens,
    reserveTokens: budget.reserveTokens,
    imageBlocksPruned: aged.prunedCount,
    droppedTurns,
    targetBandEnabled: !!budget.targetBand,
    historyDigestEnabled: historyOptimization.digestOldToolResults,
    historyDigested: digested.digestedToolResults > 0,
    historyBeforeChars: digested.beforeChars,
    historyAfterChars: digested.afterChars,
    digestedToolResults: digested.digestedToolResults,
    keepRawTurns: historyOptimization.keepRawTurns,
    oldToolResultMaxChars: historyOptimization.oldToolResultMaxChars,
    historyFrozenWatermark: digested.frozenWatermark,
    applied: aged.prunedCount > 0 || droppedTurns > 0 || digested.digestedToolResults > 0,
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
