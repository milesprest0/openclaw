import { setCliSessionBinding, setCliSessionId } from "../../agents/cli-session.js";
import {
  deriveSessionTotalTokens,
  hasNonzeroUsage,
  providerFamily,
  sanitizePerCallCacheUsage,
  type NormalizedUsage,
} from "../../agents/usage.js";
import { getRuntimeConfig } from "../../config/config.js";
import {
  type SessionSystemPromptReport,
  type SessionEntry,
  updateSessionStoreEntry,
} from "../../config/sessions.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { logVerbose } from "../../globals.js";
import {
  buildPctFull,
  logPromptInstrumentationRecord,
  logTokenUsageRecord,
  type PromptInstrumentationRecord,
} from "../../logging/token-usage-log.js";
import { estimateUsageCost, resolveModelCostConfig } from "../../utils/usage-format.js";

function applyCliSessionIdToSessionPatch(
  params: {
    providerUsed?: string;
    cliSessionId?: string;
    cliSessionBinding?: import("../../config/sessions.js").CliSessionBinding;
  },
  entry: SessionEntry,
  patch: Partial<SessionEntry>,
): Partial<SessionEntry> {
  const cliProvider = params.providerUsed ?? entry.modelProvider;
  if (params.cliSessionBinding && cliProvider) {
    const nextEntry = { ...entry, ...patch };
    setCliSessionBinding(nextEntry, cliProvider, params.cliSessionBinding);
    return {
      ...patch,
      cliSessionIds: nextEntry.cliSessionIds,
      cliSessionBindings: nextEntry.cliSessionBindings,
      claudeCliSessionId: nextEntry.claudeCliSessionId,
    };
  }
  if (params.cliSessionId && cliProvider) {
    const nextEntry = { ...entry, ...patch };
    setCliSessionId(nextEntry, cliProvider, params.cliSessionId);
    return {
      ...patch,
      cliSessionIds: nextEntry.cliSessionIds,
      cliSessionBindings: nextEntry.cliSessionBindings,
      claudeCliSessionId: nextEntry.claudeCliSessionId,
    };
  }
  return patch;
}

function resolveNonNegativeNumber(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function estimateSessionRunCostUsd(params: {
  cfg: OpenClawConfig;
  usage?: NormalizedUsage;
  providerUsed?: string;
  modelUsed?: string;
}): number | undefined {
  if (!hasNonzeroUsage(params.usage)) {
    return undefined;
  }
  const cost = resolveModelCostConfig({
    provider: params.providerUsed,
    model: params.modelUsed,
    config: params.cfg,
  });
  return resolveNonNegativeNumber(estimateUsageCost({ usage: params.usage, cost }));
}

function resolveCallFamily(params: { provider?: string; model?: string }): string | undefined {
  const provider = params.provider?.trim();
  const model = params.model?.trim();
  if (!provider && !model) {
    return undefined;
  }
  return providerFamily(
    [provider, model].filter((value): value is string => Boolean(value)).join("/"),
  );
}

function buildPromptInstrumentationRecord(params: {
  sessionKey: string;
  sessionId: string;
  model?: string;
  provider?: string;
  promptTokens?: number;
  report: SessionSystemPromptReport;
}): PromptInstrumentationRecord {
  const injectedChars = params.report.injectedWorkspaceFiles.reduce(
    (sum, file) => sum + (file.injectedChars ?? 0),
    0,
  );
  return {
    generatedAt: new Date().toISOString(),
    sessionKey: params.sessionKey,
    sessionId: params.sessionId,
    model: params.model,
    provider: params.provider,
    promptTokens: params.promptTokens,
    systemPrompt: {
      chars: params.report.systemPrompt.chars,
      projectContextChars: params.report.systemPrompt.projectContextChars,
      nonProjectContextChars: params.report.systemPrompt.nonProjectContextChars,
    },
    tools: {
      schemaChars: params.report.tools.schemaChars,
    },
    skills: {
      promptChars: params.report.skills.promptChars,
    },
    injectedWorkspaceFiles: {
      count: params.report.injectedWorkspaceFiles.length,
      injectedChars,
    },
    // PHASE1-HOOK: attach per-turn retrieval hits once retrieval results are
    // available in this run context.
    retrieval: {
      available: false,
    },
    qualityProxy: {
      evalPassRate: null,
      regret: null,
    },
  };
}

export async function persistSessionUsageUpdate(params: {
  storePath?: string;
  sessionKey?: string;
  cfg?: OpenClawConfig;
  usage?: NormalizedUsage;
  /**
   * Usage from the last individual API call (not accumulated). When provided,
   * this is used for `totalTokens` instead of the accumulated `usage` so that
   * context-window utilization reflects the actual current context size rather
   * than the sum of input tokens across all API calls in the run.
   */
  lastCallUsage?: NormalizedUsage;
  modelUsed?: string;
  servedModelUsed?: string;
  providerUsed?: string;
  lastCallUsageFamily?: string;
  contextTokensUsed?: number;
  promptTokens?: number;
  usageIsContextSnapshot?: boolean;
  systemPromptReport?: SessionSystemPromptReport;
  cliSessionId?: string;
  cliSessionBinding?: import("../../config/sessions.js").CliSessionBinding;
  logLabel?: string;
}): Promise<void> {
  const { storePath, sessionKey } = params;
  if (!storePath || !sessionKey) {
    return;
  }

  const label = params.logLabel ? `${params.logLabel} ` : "";
  const cfg = params.cfg ?? getRuntimeConfig();
  const hasUsage = hasNonzeroUsage(params.usage);
  const hasPromptTokens =
    typeof params.promptTokens === "number" &&
    Number.isFinite(params.promptTokens) &&
    params.promptTokens > 0;
  const hasFreshContextSnapshot =
    Boolean(params.lastCallUsage) || hasPromptTokens || params.usageIsContextSnapshot === true;

  if (hasUsage || hasFreshContextSnapshot) {
    try {
      await updateSessionStoreEntry({
        storePath,
        sessionKey,
        update: async (entry) => {
          const resolvedContextTokens = params.contextTokensUsed ?? entry.contextTokens;
          // Use last-call usage for totalTokens when available. The accumulated
          // `usage.input` sums input tokens from every API call in the run
          // (tool-use loops, compaction retries), overstating actual context.
          // `lastCallUsage` reflects only the final API call — the true context.
          const usageForContext =
            params.lastCallUsage ??
            (params.usageIsContextSnapshot === true ? params.usage : undefined);
          const totalTokens = hasFreshContextSnapshot
            ? deriveSessionTotalTokens({
                usage: usageForContext,
                contextTokens: resolvedContextTokens,
                promptTokens: params.promptTokens,
              })
            : undefined;
          const runEstimatedCostUsd = estimateSessionRunCostUsd({
            cfg,
            usage: params.usage,
            providerUsed: params.providerUsed ?? entry.modelProvider,
            modelUsed: params.modelUsed ?? entry.model,
          });
          const safeLastCallUsage = sanitizePerCallCacheUsage({
            usage: params.lastCallUsage,
            promptTokens: params.promptTokens,
            onDroppedCacheRead: ({ cacheRead, promptTokens: currentPromptTokens }) => {
              logVerbose(
                `dropping untrusted last-call cacheRead=${cacheRead} promptTokens=${currentPromptTokens}`,
              );
            },
          });
          const callFamily = resolveCallFamily({
            provider: params.providerUsed ?? entry.modelProvider,
            model: params.modelUsed ?? entry.model,
          });
          const lastCallUsageFamily =
            typeof params.lastCallUsageFamily === "string" &&
            params.lastCallUsageFamily.trim().length > 0
              ? params.lastCallUsageFamily.trim().toLowerCase()
              : undefined;
          const shouldDropCrossFamilyCacheUsage =
            Boolean(lastCallUsageFamily) &&
            Boolean(callFamily) &&
            lastCallUsageFamily !== callFamily;
          const safeLastCallUsageForWrite = shouldDropCrossFamilyCacheUsage
            ? {
                ...safeLastCallUsage,
                cacheRead: undefined,
                cacheWrite: undefined,
              }
            : safeLastCallUsage;
          if (shouldDropCrossFamilyCacheUsage) {
            logVerbose(
              `dropping cross-family last-call cache usage family=${lastCallUsageFamily} callFamily=${callFamily}`,
            );
          }
          const patch: Partial<SessionEntry> = {
            modelProvider: params.providerUsed ?? entry.modelProvider,
            model: params.modelUsed ?? entry.model,
            servedModel: params.servedModelUsed ?? params.modelUsed ?? entry.model,
            contextTokens: resolvedContextTokens,
            systemPromptReport: params.systemPromptReport ?? entry.systemPromptReport,
            updatedAt: Date.now(),
          };
          if (hasUsage) {
            patch.inputTokens = params.usage?.input ?? 0;
            patch.outputTokens = params.usage?.output ?? 0;
            patch.cacheRead = safeLastCallUsageForWrite?.cacheRead ?? 0;
            patch.cacheWrite = safeLastCallUsageForWrite?.cacheWrite ?? 0;
          }
          // Snapshot cost like tokens (runEstimatedCostUsd is already computed from
          // cumulative run usage, so assign directly instead of accumulating).
          // Fixes #69347: cost was inflated 1x-72x by accumulating on every persist.
          if (runEstimatedCostUsd !== undefined) {
            patch.estimatedCostUsd = runEstimatedCostUsd;
          }
          // Missing a last-call snapshot (and promptTokens fallback) means
          // context utilization is stale/unknown.
          patch.totalTokens = totalTokens;
          patch.totalTokensFresh = typeof totalTokens === "number";
          // Per-call token observability: emit one JSONL record per usage
          // persist. Fire-and-forget; never blocks or breaks persistence.
          void logTokenUsageRecord(
            {
              ts: new Date().toISOString(),
              sessionKey,
              model: params.modelUsed ?? entry.model,
              provider: params.providerUsed ?? entry.modelProvider,
              promptTokens: params.promptTokens,
              lastCallInput: safeLastCallUsageForWrite?.input,
              lastCallOutput: safeLastCallUsageForWrite?.output,
              ...(typeof safeLastCallUsageForWrite?.cacheRead === "number"
                ? { cacheRead: safeLastCallUsageForWrite.cacheRead }
                : {}),
              ...(typeof safeLastCallUsageForWrite?.cacheWrite === "number"
                ? { cacheWrite: safeLastCallUsageForWrite.cacheWrite }
                : {}),
              accumInput: params.usage?.input,
              accumOutput: params.usage?.output,
              contextMax: resolvedContextTokens,
              totalTokens,
              pctFull: buildPctFull(totalTokens, resolvedContextTokens),
            },
            cfg,
          );
          const promptInstrumentationReport = params.systemPromptReport ?? entry.systemPromptReport;
          const promptInstrumentationEnabled =
            cfg.observability?.promptInstrumentation?.enabled === true;
          if (promptInstrumentationEnabled && hasUsage && promptInstrumentationReport) {
            void logPromptInstrumentationRecord(
              buildPromptInstrumentationRecord({
                sessionKey,
                sessionId: entry.sessionId,
                model: params.modelUsed ?? entry.model,
                provider: params.providerUsed ?? entry.modelProvider,
                promptTokens: params.promptTokens,
                report: promptInstrumentationReport,
              }),
              cfg,
            );
          }
          return applyCliSessionIdToSessionPatch(params, entry, patch);
        },
      });
    } catch (err) {
      logVerbose(`failed to persist ${label}usage update: ${String(err)}`);
    }
    return;
  }

  if (params.modelUsed || params.contextTokensUsed) {
    try {
      await updateSessionStoreEntry({
        storePath,
        sessionKey,
        update: async (entry) => {
          const patch: Partial<SessionEntry> = {
            modelProvider: params.providerUsed ?? entry.modelProvider,
            model: params.modelUsed ?? entry.model,
            servedModel: params.servedModelUsed ?? params.modelUsed ?? entry.model,
            contextTokens: params.contextTokensUsed ?? entry.contextTokens,
            systemPromptReport: params.systemPromptReport ?? entry.systemPromptReport,
            updatedAt: Date.now(),
          };
          return applyCliSessionIdToSessionPatch(params, entry, patch);
        },
      });
    } catch (err) {
      logVerbose(`failed to persist ${label}model/context update: ${String(err)}`);
    }
  }
}
