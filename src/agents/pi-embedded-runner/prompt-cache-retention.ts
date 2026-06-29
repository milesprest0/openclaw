import {
  normalizeLowercaseStringOrEmpty,
  normalizeOptionalLowercaseString,
} from "../../shared/string-coerce.js";
import { resolveAnthropicCacheRetentionFamily } from "./anthropic-family-cache-semantics.js";

type CacheRetention = "none" | "short" | "long";

export function isGooglePromptCacheEligible(params: {
  modelApi?: string;
  modelId?: string;
}): boolean {
  if (params.modelApi !== "google-generative-ai") {
    return false;
  }
  const normalizedModelId = normalizeLowercaseStringOrEmpty(params.modelId);
  return normalizedModelId.startsWith("gemini-2.5") || normalizedModelId.startsWith("gemini-3");
}

/**
 * Returns true for Google/Gemini models routed via OpenRouter, where Gemini
 * does NOT perform implicit prefix caching and therefore needs explicit
 * `cache_control` breakpoint markers (OpenRouter's universal cache protocol)
 * to cache a stable prefix. Distinct from {@link isGooglePromptCacheEligible},
 * which targets the native google-generative-ai route; here the route is
 * OpenRouter (api=openai-completions), so we gate on provider + model family
 * rather than modelApi. Recognises the `~` always-latest alias prefix.
 * (2026-06-29 — verified via live OpenRouter cold/warm probe: markers required
 * for any Gemini cache hit over OpenRouter.)
 */
export function isOpenRouterGoogleCacheEligible(params: {
  provider?: string;
  modelId?: string;
}): boolean {
  if (normalizeOptionalLowercaseString(params.provider) !== "openrouter") {
    return false;
  }
  const modelId = normalizeLowercaseStringOrEmpty(params.modelId).replace(/^~/, "");
  const bare = modelId.startsWith("google/") ? modelId.slice("google/".length) : modelId;
  return bare.startsWith("gemini-2.5") || bare.startsWith("gemini-3");
}

/**
 * Returns true for OpenAI/GPT models routed via OpenRouter, where OpenAI
 * automatically applies implicit prefix caching on inputs ≥ 1,024 tokens.
 * Recognises both plain OpenAI provider references and OpenRouter-proxied
 * GPT model IDs (including the `~openai/` always-latest alias form).
 */
export function isOpenAIPromptCacheEligible(params: {
  provider?: string;
  modelApi?: string;
  modelId?: string;
}): boolean {
  const provider = normalizeOptionalLowercaseString(params.provider);
  // Direct OpenAI provider path
  if (provider === "openai") {
    return true;
  }
  // OpenRouter-proxied OpenAI models (e.g. openrouter/openai/gpt-5.5,
  // openrouter/~openai/gpt-latest,
  // openrouter/~openai/gpt-mini-latest)
  if (provider === "openrouter") {
    const modelId = normalizeLowercaseStringOrEmpty(params.modelId).replace(/^~/, "");
    return (
      modelId.startsWith("openai/") || modelId.startsWith("gpt-") || modelId.includes("gpt-latest")
    );
  }
  return false;
}

export function resolveCacheRetention(
  extraParams: Record<string, unknown> | undefined,
  provider: string,
  modelApi?: string,
  modelId?: string,
): CacheRetention | undefined {
  const hasExplicitCacheConfig =
    extraParams?.cacheRetention !== undefined || extraParams?.cacheControlTtl !== undefined;
  const family = resolveAnthropicCacheRetentionFamily({
    provider,
    modelApi,
    modelId,
    hasExplicitCacheConfig,
  });
  const googleEligible = isGooglePromptCacheEligible({ modelApi, modelId });
  const openaiEligible = isOpenAIPromptCacheEligible({ provider, modelApi, modelId });

  if (!family && !googleEligible && !openaiEligible) {
    return undefined;
  }

  const newVal = extraParams?.cacheRetention;
  if (newVal === "none" || newVal === "short" || newVal === "long") {
    return newVal;
  }

  const legacy = extraParams?.cacheControlTtl;
  if (legacy === "5m") {
    return "short";
  }
  if (legacy === "1h") {
    return "long";
  }

  // For anthropic-direct, default to short (5m ephemeral breakpoint).
  // For OpenAI implicit caching, default to "short" so surfaces that
  // declare cacheRetention: "long" (e.g. long-lived internal sessions)
  // can receive the longer hint once the infrastructure layer supports it.
  // OpenAI's automatic prefix cache is already active at ≥1,024 tokens —
  // this value is advisory; it does not disable the implicit cache.
  if (family === "anthropic-direct" || openaiEligible) {
    return "short";
  }
  return undefined;
}
