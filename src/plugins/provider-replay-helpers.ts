import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { isGemma4ModelId } from "../shared/google-models.js";
import { sanitizeGoogleAssistantFirstOrdering } from "../shared/google-turn-ordering.js";
import { normalizeLowercaseStringOrEmpty } from "../shared/string-coerce.js";
import type {
  ProviderReasoningOutputMode,
  ProviderReplayPolicy,
  ProviderReplayPolicyContext,
  ProviderReplaySessionState,
  ProviderSanitizeReplayHistoryContext,
} from "./types.js";

export function buildOpenAICompatibleReplayPolicy(
  modelApi: string | null | undefined,
  options: { sanitizeToolCallIds?: boolean; modelId?: string | null } = {},
): ProviderReplayPolicy | undefined {
  if (
    modelApi !== "openai-completions" &&
    modelApi !== "openai-responses" &&
    modelApi !== "openai-codex-responses" &&
    modelApi !== "azure-openai-responses"
  ) {
    return undefined;
  }

  const sanitizeToolCallIds = options.sanitizeToolCallIds ?? true;

  return {
    ...(sanitizeToolCallIds
      ? { sanitizeToolCallIds: true, toolCallIdMode: "strict" as const }
      : {}),
    ...(modelApi === "openai-completions"
      ? {
          applyAssistantFirstOrderingFix: true,
          validateGeminiTurns: true,
          validateAnthropicTurns: true,
        }
      : {
          applyAssistantFirstOrderingFix: false,
          validateGeminiTurns: false,
          validateAnthropicTurns: false,
        }),
    ...(modelApi === "openai-completions" && isGemma4ModelId(options.modelId)
      ? { dropReasoningFromHistory: true }
      : {}),
  };
}

export function buildStrictAnthropicReplayPolicy(
  options: {
    dropThinkingBlocks?: boolean;
    sanitizeToolCallIds?: boolean;
    preserveNativeAnthropicToolUseIds?: boolean;
  } = {},
): ProviderReplayPolicy {
  const sanitizeToolCallIds = options.sanitizeToolCallIds ?? true;
  return {
    sanitizeMode: "full",
    ...(sanitizeToolCallIds
      ? {
          sanitizeToolCallIds: true,
          toolCallIdMode: "strict" as const,
          ...(options.preserveNativeAnthropicToolUseIds
            ? { preserveNativeAnthropicToolUseIds: true }
            : {}),
        }
      : {}),
    preserveSignatures: true,
    repairToolUseResultPairing: true,
    validateAnthropicTurns: true,
    allowSyntheticToolResults: true,
    ...(options.dropThinkingBlocks ? { dropThinkingBlocks: true } : {}),
  };
}

/**
 * Returns true for Claude models that preserve thinking blocks in context
 * natively (Opus 4.5+, Sonnet 4.5+, Haiku 4.5+). For these models, dropping
 * thinking blocks from prior turns breaks prompt cache prefix matching.
 *
 * See: https://platform.claude.com/docs/en/build-with-claude/extended-thinking#differences-in-thinking-across-model-versions
 */
export function shouldPreserveThinkingBlocks(modelId?: string): boolean {
  const id = normalizeLowercaseStringOrEmpty(modelId);
  if (!id.includes("claude")) {
    return false;
  }

  // Models that preserve thinking blocks natively (Claude 4.5+):
  // - claude-opus-4-x (opus-4-5, opus-4-6, ...)
  // - claude-sonnet-4-x (sonnet-4-5, sonnet-4-6, ...)
  //   Note: "sonnet-4" is safe — legacy "claude-3-5-sonnet" does not contain "sonnet-4"
  // - claude-haiku-4-x (haiku-4-5, ...)
  // Models that require dropping thinking blocks:
  // - claude-3-7-sonnet, claude-3-5-sonnet, and earlier
  if (id.includes("opus-4") || id.includes("sonnet-4") || id.includes("haiku-4")) {
    return true;
  }

  // Name-first Claude 5+ ids (e.g. "claude-sonnet-5", "anthropic/claude-opus-5",
  // "claude-sonnet-5-20260630"). Sonnet 5 (live 2026-07-01) preserves thinking
  // blocks natively; the version-first `/claude-[5-9]/` check below misses it
  // because the major digit follows the family name, not "claude-". Dropping
  // thinking here would break sonnet-5 prompt-cache prefix matching. The
  // `(?![0-9])` guard prevents an 8-digit date suffix (legacy
  // "claude-3-5-sonnet-20241022") from being read as a major version.
  if (/(?:opus|sonnet|haiku)-(?:[5-9]|\d{2})(?![0-9])/.test(id)) {
    return true;
  }

  // Always-latest aliases (e.g. "claude-opus-latest", "~anthropic/claude-sonnet-latest")
  // resolve to the current generation, which is 4.5+ and preserves thinking natively.
  // The version-number checks above miss these because the alias carries no digit, so
  // match the alias form explicitly to keep eviction off Claude cache-preserving paths.
  if (/(?:opus|sonnet|haiku)-latest/.test(id)) {
    return true;
  }

  // Future-proofing: version-first claude-5-x, claude-6-x etc. should also preserve
  if (/claude-[5-9]/.test(id) || /claude-\d{2,}/.test(id)) {
    return true;
  }

  return false;
}

export function buildAnthropicReplayPolicyForModel(modelId?: string): ProviderReplayPolicy {
  const isClaude = normalizeLowercaseStringOrEmpty(modelId).includes("claude");
  return buildStrictAnthropicReplayPolicy({
    dropThinkingBlocks: isClaude && !shouldPreserveThinkingBlocks(modelId),
  });
}

export function buildNativeAnthropicReplayPolicyForModel(modelId?: string): ProviderReplayPolicy {
  const isClaude = normalizeLowercaseStringOrEmpty(modelId).includes("claude");
  return buildStrictAnthropicReplayPolicy({
    dropThinkingBlocks: isClaude && !shouldPreserveThinkingBlocks(modelId),
    sanitizeToolCallIds: true,
    preserveNativeAnthropicToolUseIds: true,
  });
}

export function buildHybridAnthropicOrOpenAIReplayPolicy(
  ctx: ProviderReplayPolicyContext,
  options: { anthropicModelDropThinkingBlocks?: boolean } = {},
): ProviderReplayPolicy | undefined {
  if (ctx.modelApi === "anthropic-messages" || ctx.modelApi === "bedrock-converse-stream") {
    const isClaude = normalizeLowercaseStringOrEmpty(ctx.modelId).includes("claude");
    return buildStrictAnthropicReplayPolicy({
      dropThinkingBlocks:
        options.anthropicModelDropThinkingBlocks &&
        isClaude &&
        !shouldPreserveThinkingBlocks(ctx.modelId),
    });
  }

  return buildOpenAICompatibleReplayPolicy(ctx.modelApi, { modelId: ctx.modelId });
}

const GOOGLE_TURN_ORDERING_CUSTOM_TYPE = "google-turn-ordering-bootstrap";

function hasGoogleTurnOrderingMarker(sessionState: ProviderReplaySessionState): boolean {
  return sessionState
    .getCustomEntries()
    .some((entry) => entry.customType === GOOGLE_TURN_ORDERING_CUSTOM_TYPE);
}

function markGoogleTurnOrderingMarker(sessionState: ProviderReplaySessionState): void {
  sessionState.appendCustomEntry(GOOGLE_TURN_ORDERING_CUSTOM_TYPE, {
    timestamp: Date.now(),
  });
}

export function buildGoogleGeminiReplayPolicy(): ProviderReplayPolicy {
  return {
    sanitizeMode: "full",
    sanitizeToolCallIds: true,
    toolCallIdMode: "strict",
    sanitizeThoughtSignatures: {
      allowBase64Only: true,
      includeCamelCase: true,
    },
    repairToolUseResultPairing: true,
    applyAssistantFirstOrderingFix: true,
    validateGeminiTurns: true,
    validateAnthropicTurns: false,
    allowSyntheticToolResults: true,
  };
}

export function buildPassthroughGeminiSanitizingReplayPolicy(
  modelId?: string,
): ProviderReplayPolicy {
  const normalizedModelId = normalizeLowercaseStringOrEmpty(modelId);
  return {
    applyAssistantFirstOrderingFix: false,
    validateGeminiTurns: false,
    validateAnthropicTurns: false,
    ...(normalizedModelId.includes("gemini")
      ? {
          sanitizeThoughtSignatures: {
            allowBase64Only: true,
            includeCamelCase: true,
          },
        }
      : {}),
  };
}

export function sanitizeGoogleGeminiReplayHistory(
  ctx: ProviderSanitizeReplayHistoryContext,
): AgentMessage[] {
  const messages = sanitizeGoogleAssistantFirstOrdering(ctx.messages);
  if (
    messages !== ctx.messages &&
    ctx.sessionState &&
    !hasGoogleTurnOrderingMarker(ctx.sessionState)
  ) {
    markGoogleTurnOrderingMarker(ctx.sessionState);
  }
  return messages;
}

export function resolveTaggedReasoningOutputMode(): ProviderReasoningOutputMode {
  return "tagged";
}
