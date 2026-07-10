import type { NormalizedUsage } from "../usage.js";
export type PromptCacheChangeCode =
  | "cacheRetention"
  | "model"
  | "streamStrategy"
  | "systemPrompt"
  | "tools"
  | "transport";
export type PromptCacheChange = {
  code: PromptCacheChangeCode;
  detail: string;
};
export type PromptCacheSnapshot = {
  provider: string;
  modelId: string;
  modelApi?: string | null;
  cacheRetention?: "none" | "short" | "long";
  streamStrategy: string;
  transport?: string;
  systemPromptDigest: string;
  toolDigest: string;
  toolCount: number;
  toolNames: string[];
};
export type PromptCacheObservationStart = {
  snapshot: PromptCacheSnapshot;
  changes: PromptCacheChange[] | null;
  previousCacheRead: number | null;
};
export type PromptCacheBreak = {
  previousCacheRead: number;
  cacheRead: number;
  changes: PromptCacheChange[] | null;
};
export type GeminiImplicitCacheTelemetry = {
  provider: string;
  modelId: string;
  inputTokens: number;
  cachedReadTokens: number;
  cacheHitRatio: number;
  sessionKey: string;
};
export declare function collectPromptCacheToolNames(
  tools: Array<{
    name?: string;
  }>,
): string[];
export declare function emitGeminiImplicitCacheTelemetry(params: {
  provider: string;
  modelId: string;
  usage?: NormalizedUsage;
  sessionKey: string;
  debug: (message: string, fields: GeminiImplicitCacheTelemetry) => void;
}): GeminiImplicitCacheTelemetry | null;
export declare function beginPromptCacheObservation(params: {
  sessionId: string;
  sessionKey?: string;
  provider: string;
  modelId: string;
  modelApi?: string | null;
  cacheRetention?: "none" | "short" | "long";
  streamStrategy: string;
  transport?: string;
  systemPrompt: string;
  toolNames: string[];
}): PromptCacheObservationStart;
export declare function completePromptCacheObservation(params: {
  sessionId: string;
  sessionKey?: string;
  usage?: NormalizedUsage;
}): PromptCacheBreak | null;
export declare function resetPromptCacheObservabilityForTest(): void;
