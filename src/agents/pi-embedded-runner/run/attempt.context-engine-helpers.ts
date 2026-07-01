import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { AssistantMessage } from "@mariozechner/pi-ai";
import type { ContextEngine } from "../../../context-engine/types.js";
import type { BootstrapMode } from "../../bootstrap-mode.js";
import { normalizeUsage, providerFamily, type NormalizedUsage } from "../../usage.js";
import type { PromptCacheChange } from "../prompt-cache-observability.js";
import type { EmbeddedRunAttemptResult } from "./types.js";
export {
  assembleHarnessContextEngine as assembleAttemptContextEngine,
  bootstrapHarnessContextEngine as runAttemptContextEngineBootstrap,
  finalizeHarnessContextEngineTurn as finalizeAttemptContextEngineTurn,
} from "../../harness/context-engine-lifecycle.js";

export type AttemptContextEngine = ContextEngine;

export type AttemptBootstrapContext<TBootstrapFile = unknown, TContextFile = unknown> = {
  bootstrapFiles: TBootstrapFile[];
  contextFiles: TContextFile[];
};

export async function resolveAttemptBootstrapContext<TBootstrapFile, TContextFile>(params: {
  contextInjectionMode: "always" | "continuation-skip" | "never";
  bootstrapContextMode?: string;
  bootstrapContextRunKind?: string;
  bootstrapMode?: BootstrapMode;
  sessionFile: string;
  hasCompletedBootstrapTurn: (sessionFile: string) => Promise<boolean>;
  resolveBootstrapContextForRun: () => Promise<
    AttemptBootstrapContext<TBootstrapFile, TContextFile>
  >;
}): Promise<
  AttemptBootstrapContext<TBootstrapFile, TContextFile> & {
    isContinuationTurn: boolean;
    shouldRecordCompletedBootstrapTurn: boolean;
  }
> {
  const isContinuationTurn =
    params.bootstrapMode !== "full" &&
    params.contextInjectionMode === "continuation-skip" &&
    params.bootstrapContextRunKind !== "heartbeat" &&
    (await params.hasCompletedBootstrapTurn(params.sessionFile));
  const shouldSkipBootstrapInjection =
    params.contextInjectionMode === "never" || isContinuationTurn;
  const shouldRecordCompletedBootstrapTurn =
    !shouldSkipBootstrapInjection &&
    params.bootstrapContextMode !== "lightweight" &&
    params.bootstrapContextRunKind !== "heartbeat" &&
    params.bootstrapMode === "full";

  const context = shouldSkipBootstrapInjection
    ? { bootstrapFiles: [], contextFiles: [] }
    : await params.resolveBootstrapContextForRun();

  return {
    ...context,
    isContinuationTurn,
    shouldRecordCompletedBootstrapTurn,
  };
}

export function buildContextEnginePromptCacheInfo(params: {
  retention?: "none" | "short" | "long";
  lastCallUsage?: NormalizedUsage;
  observation?:
    | {
        broke: boolean;
        previousCacheRead?: number;
        cacheRead?: number;
        changes?: PromptCacheChange[] | null;
      }
    | undefined;
  lastCacheTouchAt?: number | null;
}): EmbeddedRunAttemptResult["promptCache"] {
  const promptCache: NonNullable<EmbeddedRunAttemptResult["promptCache"]> = {};
  if (params.retention) {
    promptCache.retention = params.retention;
  }
  if (params.lastCallUsage) {
    promptCache.lastCallUsage = { ...params.lastCallUsage };
  }
  if (params.observation) {
    promptCache.observation = {
      broke: params.observation.broke,
      ...(typeof params.observation.previousCacheRead === "number"
        ? { previousCacheRead: params.observation.previousCacheRead }
        : {}),
      ...(typeof params.observation.cacheRead === "number"
        ? { cacheRead: params.observation.cacheRead }
        : {}),
      ...(params.observation.changes && params.observation.changes.length > 0
        ? {
            changes: params.observation.changes.map((change) => ({
              code: change.code,
              detail: change.detail,
            })),
          }
        : {}),
    };
  }
  if (typeof params.lastCacheTouchAt === "number" && Number.isFinite(params.lastCacheTouchAt)) {
    promptCache.lastCacheTouchAt = params.lastCacheTouchAt;
  }
  return Object.keys(promptCache).length > 0 ? promptCache : undefined;
}

export function findCurrentAttemptAssistantMessage(params: {
  messagesSnapshot: AgentMessage[];
  prePromptMessageCount: number;
}): AssistantMessage | undefined {
  const latest = findLatestAssistantMessage(params.messagesSnapshot);
  if (!latest) {
    return undefined;
  }
  return latest.index >= Math.max(0, params.prePromptMessageCount) ? latest.message : undefined;
}

export function findLatestAssistantMessage(messagesSnapshot: AgentMessage[]):
  | {
      message: AssistantMessage;
      index: number;
    }
  | undefined {
  for (let index = messagesSnapshot.length - 1; index >= 0; index -= 1) {
    const message = messagesSnapshot[index];
    if (message.role === "assistant") {
      return {
        message,
        index,
      };
    }
  }
  return undefined;
}

function hasProviderOrModelTag(assistant: AssistantMessage | undefined): boolean {
  if (!assistant) {
    return false;
  }
  const maybeAssistant = assistant as {
    provider?: unknown;
    model?: unknown;
    metadata?: { provider?: unknown; model?: unknown };
    meta?: { provider?: unknown; model?: unknown };
  };
  return [
    maybeAssistant.provider,
    maybeAssistant.model,
    maybeAssistant.metadata?.provider,
    maybeAssistant.metadata?.model,
    maybeAssistant.meta?.provider,
    maybeAssistant.meta?.model,
  ].some((value) => typeof value === "string" && value.trim().length > 0);
}

function resolveFamilyFromAssistantMessage(
  assistant: AssistantMessage | undefined,
): string | undefined {
  if (!assistant) {
    return undefined;
  }
  const maybeAssistant = assistant as {
    provider?: unknown;
    model?: unknown;
    metadata?: { provider?: unknown; model?: unknown };
    meta?: { provider?: unknown; model?: unknown };
  };
  const provider =
    typeof maybeAssistant.provider === "string" && maybeAssistant.provider.trim().length > 0
      ? maybeAssistant.provider.trim()
      : typeof maybeAssistant.metadata?.provider === "string" &&
          maybeAssistant.metadata.provider.trim().length > 0
        ? maybeAssistant.metadata.provider.trim()
        : typeof maybeAssistant.meta?.provider === "string" &&
            maybeAssistant.meta.provider.trim().length > 0
          ? maybeAssistant.meta.provider.trim()
          : undefined;
  const model =
    typeof maybeAssistant.model === "string" && maybeAssistant.model.trim().length > 0
      ? maybeAssistant.model.trim()
      : typeof maybeAssistant.metadata?.model === "string" &&
          maybeAssistant.metadata.model.trim().length > 0
        ? maybeAssistant.metadata.model.trim()
        : typeof maybeAssistant.meta?.model === "string" &&
            maybeAssistant.meta.model.trim().length > 0
          ? maybeAssistant.meta.model.trim()
          : undefined;
  if (!provider && !model) {
    return undefined;
  }
  const ref = [provider, model].filter((value): value is string => Boolean(value)).join("/");
  return providerFamily(ref);
}

function resolveFamilyFromCallRef(params: {
  provider?: string;
  model?: string;
}): string | undefined {
  const provider = params.provider?.trim();
  const model = params.model?.trim();
  if (!provider && !model) {
    return undefined;
  }
  const ref = [provider, model].filter((value): value is string => Boolean(value)).join("/");
  return providerFamily(ref);
}

function dropCacheFields(usage: NormalizedUsage | undefined): NormalizedUsage | undefined {
  if (!usage) {
    return undefined;
  }
  return {
    ...usage,
    cacheRead: undefined,
    cacheWrite: undefined,
  };
}

export function resolveSafeLastCallUsage(params: {
  assistant?: AssistantMessage;
  assistantIndex: number;
  prePromptMessageCount: number;
  provider?: string;
  model?: string;
}): NormalizedUsage | undefined {
  const usage = normalizeUsage(params.assistant?.usage);
  if (!usage) {
    return undefined;
  }
  const isPositionallyFresh = params.assistantIndex >= Math.max(0, params.prePromptMessageCount);
  if (!isPositionallyFresh) {
    return dropCacheFields(usage);
  }
  if (!hasProviderOrModelTag(params.assistant)) {
    return usage;
  }
  const assistantFamily = resolveFamilyFromAssistantMessage(params.assistant);
  const callFamily = resolveFamilyFromCallRef({ provider: params.provider, model: params.model });
  if (assistantFamily && callFamily && assistantFamily !== callFamily) {
    return dropCacheFields(usage);
  }
  return usage;
}

function parsePromptCacheTouchTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

/** Resolve the effective prompt-cache touch timestamp for the current assistant turn. */
export function resolvePromptCacheTouchTimestamp(params: {
  lastCallUsage?: NormalizedUsage;
  assistantTimestamp?: unknown;
  fallbackLastCacheTouchAt?: number | null;
}): number | null {
  const hasCacheUsage =
    typeof params.lastCallUsage?.cacheRead === "number" ||
    typeof params.lastCallUsage?.cacheWrite === "number";
  if (!hasCacheUsage) {
    return params.fallbackLastCacheTouchAt ?? null;
  }
  return (
    parsePromptCacheTouchTimestamp(params.assistantTimestamp) ??
    params.fallbackLastCacheTouchAt ??
    null
  );
}

export function buildLoopPromptCacheInfo(params: {
  messagesSnapshot: AgentMessage[];
  prePromptMessageCount: number;
  retention?: "none" | "short" | "long";
  fallbackLastCacheTouchAt?: number | null;
  provider?: string;
  model?: string;
}): EmbeddedRunAttemptResult["promptCache"] {
  const latestAssistant = findLatestAssistantMessage(params.messagesSnapshot);
  const currentAttemptAssistant =
    latestAssistant && latestAssistant.index >= Math.max(0, params.prePromptMessageCount)
      ? latestAssistant.message
      : undefined;
  const lastCallUsage = resolveSafeLastCallUsage({
    assistant: latestAssistant?.message,
    assistantIndex: latestAssistant?.index ?? -1,
    prePromptMessageCount: params.prePromptMessageCount,
    provider: params.provider,
    model: params.model,
  });

  return buildContextEnginePromptCacheInfo({
    retention: params.retention,
    lastCallUsage,
    lastCacheTouchAt: resolvePromptCacheTouchTimestamp({
      lastCallUsage,
      assistantTimestamp: currentAttemptAssistant?.timestamp,
      fallbackLastCacheTouchAt: params.fallbackLastCacheTouchAt,
    }),
  });
}
