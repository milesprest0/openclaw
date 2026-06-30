import type { StreamFn } from "@mariozechner/pi-agent-core";
import { streamSimple } from "@mariozechner/pi-ai";
import type { ThinkLevel } from "../../auto-reply/thinking.js";
import { normalizeOptionalLowercaseString, readStringValue } from "../../shared/string-coerce.js";
import type { AnthropicHistoryCacheBreakpointsMode } from "../anthropic-payload-policy.js";
import { resolveProviderRequestPolicy } from "../provider-attribution.js";
import { resolveProviderRequestPolicyConfig } from "../provider-request-config.js";
import { applyAnthropicEphemeralCacheControlMarkers } from "./anthropic-cache-control-payload.js";
import { isAnthropicModelRef } from "./anthropic-family-cache-semantics.js";
import { isOpenRouterGoogleCacheEligible } from "./prompt-cache-retention.js";
import { mapThinkingLevelToReasoningEffort } from "./reasoning-effort-utils.js";
import { streamWithPayloadPatch } from "./stream-payload-utils.js";
const KILOCODE_FEATURE_HEADER = "X-KILOCODE-FEATURE";
const KILOCODE_FEATURE_DEFAULT = "openclaw";
const KILOCODE_FEATURE_ENV_VAR = "KILOCODE_FEATURE";

function resolveKilocodeAppHeaders(): Record<string, string> {
  const feature = process.env[KILOCODE_FEATURE_ENV_VAR]?.trim() || KILOCODE_FEATURE_DEFAULT;
  return { [KILOCODE_FEATURE_HEADER]: feature };
}

function readExtraParam(
  extraParams: Record<string, unknown> | undefined,
  keys: readonly string[],
): unknown {
  if (!extraParams) {
    return undefined;
  }
  for (const key of keys) {
    if (Object.hasOwn(extraParams, key)) {
      return extraParams[key];
    }
  }
  return undefined;
}

function resolveBooleanParam(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = normalizeOptionalLowercaseString(value);
  if (!normalized) {
    return undefined;
  }
  if (["1", "true", "yes", "on", "enable", "enabled"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off", "disable", "disabled"].includes(normalized)) {
    return false;
  }
  return undefined;
}

function resolveOpenRouterResponseCacheTtlSeconds(value: unknown): string | undefined {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value.trim())
        : Number.NaN;
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return String(Math.max(1, Math.min(86400, Math.trunc(parsed))));
}

function shouldApplyOpenRouterResponseCacheHeaders(model: Parameters<StreamFn>[0]): boolean {
  const provider = readStringValue(model.provider);
  const endpointClass = resolveProviderRequestPolicy({
    provider,
    api: readStringValue(model.api),
    baseUrl: readStringValue(model.baseUrl),
    capability: "llm",
    transport: "stream",
  }).endpointClass;
  return (
    endpointClass === "openrouter" ||
    (endpointClass === "default" && normalizeOptionalLowercaseString(provider) === "openrouter")
  );
}

function resolveOpenRouterResponseCacheHeaders(
  model: Parameters<StreamFn>[0],
  extraParams: Record<string, unknown> | undefined,
): Record<string, string> | undefined {
  if (!shouldApplyOpenRouterResponseCacheHeaders(model)) {
    return undefined;
  }
  const configuredCache = resolveBooleanParam(
    readExtraParam(extraParams, ["responseCache", "response_cache"]),
  );
  const clearCache = resolveBooleanParam(
    readExtraParam(extraParams, ["responseCacheClear", "response_cache_clear"]),
  );
  const cacheEnabled = configuredCache ?? (clearCache ? true : undefined);
  if (cacheEnabled === undefined) {
    return undefined;
  }

  const headers: Record<string, string> = {
    "X-OpenRouter-Cache": cacheEnabled ? "true" : "false",
  };
  if (!cacheEnabled) {
    return headers;
  }

  const ttl = resolveOpenRouterResponseCacheTtlSeconds(
    readExtraParam(extraParams, [
      "responseCacheTtlSeconds",
      "response_cache_ttl_seconds",
      "responseCacheTtl",
      "response_cache_ttl",
    ]),
  );
  if (ttl) {
    headers["X-OpenRouter-Cache-TTL"] = ttl;
  }
  if (clearCache) {
    headers["X-OpenRouter-Cache-Clear"] = "true";
  }
  return headers;
}

function normalizeProxyReasoningPayload(payload: unknown, thinkingLevel?: ThinkLevel): void {
  if (!payload || typeof payload !== "object") {
    return;
  }

  const payloadObj = payload as Record<string, unknown>;
  delete payloadObj.reasoning_effort;
  if (!thinkingLevel || thinkingLevel === "off") {
    return;
  }

  const existingReasoning = payloadObj.reasoning;
  if (
    existingReasoning &&
    typeof existingReasoning === "object" &&
    !Array.isArray(existingReasoning)
  ) {
    const reasoningObj = existingReasoning as Record<string, unknown>;
    if (!("max_tokens" in reasoningObj) && !("effort" in reasoningObj)) {
      reasoningObj.effort = mapThinkingLevelToReasoningEffort(thinkingLevel);
    }
  } else if (!existingReasoning) {
    payloadObj.reasoning = {
      effort: mapThinkingLevelToReasoningEffort(thinkingLevel),
    };
  }
}

export type OpenRouterSystemCacheWrapperOptions = {
  /**
   * Cache retention for the OpenRouter Anthropic cache markers (Phase 2, TTL
   * alignment). "long" emits ttl:"1h" markers (best for high-prefix,
   * long-session surfaces); "none" disables marker injection entirely; the
   * default (undefined/"short") keeps the conservative 5m ephemeral marker.
   * Resolved per-surface; never implicitly upgraded.
   */
  cacheRetention?: "none" | "short" | "long";
  /**
   * When true, also stamp OpenRouter cache_control markers on OpenRouter-routed
   * Google/Gemini models (gemini-2.5 / gemini-3 family). Gemini does no implicit
   * prefix caching over OpenRouter, so without markers it never caches. Gated
   * OFF by default (config: agents.defaults.experimental.openRouterGoogleCache).
   * Anthropic marker behavior is unchanged regardless of this flag.
   * (2026-06-29, verified via live cold/warm probe.)
   */
  googleMarkers?: boolean;
  historyCacheBreakpoints?: AnthropicHistoryCacheBreakpointsMode;
};

/**
 * Resolve the OpenRouter cache retention from explicit config first, then the
 * PI_CACHE_RETENTION env (matching the Anthropic-direct path), defaulting to
 * short. Kept conservative: only an explicit "long" produces a 1h TTL.
 */
function resolveOpenRouterCacheRetention(
  options?: OpenRouterSystemCacheWrapperOptions,
): "none" | "short" | "long" {
  if (options?.cacheRetention === "none") {
    return "none";
  }
  if (options?.cacheRetention === "long") {
    return "long";
  }
  if (options?.cacheRetention === "short") {
    return "short";
  }
  return process.env.PI_CACHE_RETENTION === "long" ? "long" : "short";
}

export function createOpenRouterSystemCacheWrapper(
  baseStreamFn: StreamFn | undefined,
  wrapperOptions?: OpenRouterSystemCacheWrapperOptions,
): StreamFn {
  const underlying = baseStreamFn ?? streamSimple;
  const retention = resolveOpenRouterCacheRetention(wrapperOptions);
  const googleMarkers = wrapperOptions?.googleMarkers === true;
  const historyCacheBreakpoints = wrapperOptions?.historyCacheBreakpoints;
  const markerOptions =
    retention === "long" || historyCacheBreakpoints
      ? {
          ...(retention === "long" ? ({ ttl: "1h" } as const) : {}),
          ...(historyCacheBreakpoints ? { historyBreakpoints: historyCacheBreakpoints } : {}),
        }
      : undefined;
  return (model, context, options) => {
    const provider = readStringValue(model.provider);
    const modelId = readStringValue(model.id);
    // Keep OpenRouter-specific cache markers on verified OpenRouter routes
    // (or the provider's default route), but not on arbitrary OpenAI proxies.
    const endpointClass = resolveProviderRequestPolicy({
      provider,
      api: readStringValue(model.api),
      baseUrl: readStringValue(model.baseUrl),
      capability: "llm",
      transport: "stream",
    }).endpointClass;
    const familyEligible =
      !!modelId &&
      (isAnthropicModelRef(modelId) ||
        (googleMarkers && isOpenRouterGoogleCacheEligible({ provider, modelId })));
    if (
      retention === "none" ||
      !familyEligible ||
      !(
        endpointClass === "openrouter" ||
        (endpointClass === "default" && normalizeOptionalLowercaseString(provider) === "openrouter")
      )
    ) {
      return underlying(model, context, options);
    }

    return streamWithPayloadPatch(underlying, model, context, options, (payloadObj) => {
      applyAnthropicEphemeralCacheControlMarkers(payloadObj, markerOptions);
    });
  };
}

export function createOpenRouterWrapper(
  baseStreamFn: StreamFn | undefined,
  thinkingLevel?: ThinkLevel,
  extraParams?: Record<string, unknown>,
): StreamFn {
  const underlying = baseStreamFn ?? streamSimple;
  return (model, context, options) => {
    const providerHeaders = resolveOpenRouterResponseCacheHeaders(model, extraParams);
    const headers = resolveProviderRequestPolicyConfig({
      provider: readStringValue(model.provider) ?? "openrouter",
      api: readStringValue(model.api),
      baseUrl: readStringValue(model.baseUrl),
      capability: "llm",
      transport: "stream",
      callerHeaders: options?.headers,
      providerHeaders,
      precedence: "caller-wins",
    }).headers;
    return streamWithPayloadPatch(
      underlying,
      model,
      context,
      {
        ...options,
        headers,
      },
      (payload) => {
        normalizeProxyReasoningPayload(payload, thinkingLevel);
      },
    );
  };
}

export function isProxyReasoningUnsupported(modelId: string): boolean {
  const trimmed = normalizeOptionalLowercaseString(modelId);
  const slashIndex = trimmed?.indexOf("/") ?? -1;
  return slashIndex > 0 && trimmed?.slice(0, slashIndex) === "x-ai";
}

export function createKilocodeWrapper(
  baseStreamFn: StreamFn | undefined,
  thinkingLevel?: ThinkLevel,
): StreamFn {
  const underlying = baseStreamFn ?? streamSimple;
  return (model, context, options) => {
    const headers = resolveProviderRequestPolicyConfig({
      provider: readStringValue(model.provider) ?? "kilocode",
      api: readStringValue(model.api),
      baseUrl: readStringValue(model.baseUrl),
      capability: "llm",
      transport: "stream",
      callerHeaders: options?.headers,
      providerHeaders: resolveKilocodeAppHeaders(),
      precedence: "defaults-win",
    }).headers;
    return streamWithPayloadPatch(
      underlying,
      model,
      context,
      {
        ...options,
        headers,
      },
      (payload) => {
        normalizeProxyReasoningPayload(payload, thinkingLevel);
      },
    );
  };
}
