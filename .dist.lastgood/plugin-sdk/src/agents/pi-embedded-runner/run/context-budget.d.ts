import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { OpenClawConfig } from "../../../config/types.openclaw.js";
import type { AnthropicHistoryCacheBreakpointsMode } from "../../anthropic-payload-policy.js";
export declare const HISTORY_FROZEN_WATERMARK_SESSION_KEY = "openclaw.history-frozen-watermark";
export declare const HISTORY_FROZEN_BOUNDARY_SENTINEL =
  "\n<!-- OPENCLAW_HISTORY_FROZEN_BOUNDARY -->\n";
export declare const CONTEXT_BUDGET_IMAGE_PLACEHOLDER =
  "[image data removed - context budget image cap]";
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
export declare function appendHistoryFrozenSentinel(
  messages: AgentMessage[],
  mode: AnthropicHistoryCacheBreakpointsMode | undefined,
  freezeMode: "off" | "sliding" | "frozen",
): AgentMessage[];
export declare function parseHistoryFrozenWatermark(value: unknown): number | undefined;
export declare function digestOldToolResults(
  messages: AgentMessage[],
  opts: {
    keepRawTurns: number;
    oldToolResultMaxChars: number;
  },
): AgentMessage[];
export declare function resolveContextBudget(params: {
  cfg?: OpenClawConfig;
  contextWindowTokens: number;
  accountId?: string | null;
  overrideKey?: string;
}): ResolvedContextBudget;
export declare function applyContextBudgetGuard(params: {
  messages: AgentMessage[];
  cfg?: OpenClawConfig;
  contextWindowTokens: number;
  accountId?: string | null;
  overrideKey?: string;
  systemPrompt?: string;
  prompt?: string;
  promptImages?: readonly PromptInlineImage[];
  persistedHistoryFrozenWatermark?: number;
}): ContextBudgetGuardResult;
export declare function isLikelyOverBudget(params: {
  budget: Pick<ResolvedContextBudget, "enabled" | "budgetBeforeReserve">;
  approxTranscriptTokens: number;
}): boolean;
export {};
