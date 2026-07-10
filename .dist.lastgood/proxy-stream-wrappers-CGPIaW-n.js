import { streamSimple } from "@mariozechner/pi-ai";
import { t as applyAnthropicEphemeralCacheControlMarkers } from "./anthropic-payload-policy-rzH8F_Im.js";
import {
  a as resolveCodexNativeSearchActivation,
  i as patchCodexNativeWebSearchPayload,
} from "./codex-native-web-search-core-C0P5WyR_.js";
import { t as log } from "./logger-Ce0PtXjG.js";
import {
  C as resolveOpenAIReasoningEffortForModel,
  a as applyOpenAIResponsesPayloadPolicy,
  i as createOpenAIResponsesTransportStreamFn,
  o as resolveOpenAIResponsesPayloadPolicy,
  s as flattenCompletionMessagesToStringContent,
} from "./openai-transport-stream-BLrUwHeX.js";
import { i as resolveProviderRequestPolicy } from "./provider-attribution-SP5uub3O.js";
import { _ as streamWithPayloadPatch } from "./provider-model-shared-CmD-CscC.js";
import { l as resolveProviderRequestPolicyConfig } from "./provider-request-config-B-kAAqy2.js";
import {
  O as isAnthropicModelRef,
  k as resolveAnthropicCacheRetentionFamily,
} from "./provider-stream-shared-wxMuvsGy.js";
import {
  a as normalizeLowercaseStringOrEmpty,
  f as readStringValue,
  s as normalizeOptionalLowercaseString,
} from "./string-coerce-BdEutqX5.js";
//#region src/agents/openai-text-verbosity.ts
function normalizeOpenAITextVerbosity(value) {
  if (typeof value !== "string") return;
  const normalized = normalizeOptionalLowercaseString(value);
  if (normalized === "low" || normalized === "medium" || normalized === "high") return normalized;
}
function resolveOpenAITextVerbosity(extraParams) {
  const raw = extraParams?.textVerbosity ?? extraParams?.text_verbosity;
  const normalized = normalizeOpenAITextVerbosity(raw);
  if (raw !== void 0 && normalized === void 0) {
    const rawSummary = typeof raw === "string" ? raw : typeof raw;
    log.warn(`ignoring invalid OpenAI text verbosity param: ${rawSummary}`);
  }
  return normalized;
}
//#endregion
//#region src/agents/pi-embedded-runner/prompt-cache-retention.ts
function isGooglePromptCacheEligible(params) {
  if (params.modelApi !== "google-generative-ai") return false;
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
function isOpenRouterGoogleCacheEligible(params) {
  if (normalizeOptionalLowercaseString(params.provider) !== "openrouter") return false;
  const modelId = normalizeLowercaseStringOrEmpty(params.modelId).replace(/^~/, "");
  const bare = modelId.startsWith("google/") ? modelId.slice(7) : modelId;
  return bare.startsWith("gemini-2.5") || bare.startsWith("gemini-3");
}
/**
 * Returns true for OpenAI/GPT models routed via OpenRouter, where OpenAI
 * automatically applies implicit prefix caching on inputs ≥ 1,024 tokens.
 * Recognises both plain OpenAI provider references and OpenRouter-proxied
 * GPT model IDs (including the `~openai/` always-latest alias form).
 */
function isOpenAIPromptCacheEligible(params) {
  const provider = normalizeOptionalLowercaseString(params.provider);
  if (provider === "openai") return true;
  if (provider === "openrouter") {
    const modelId = normalizeLowercaseStringOrEmpty(params.modelId).replace(/^~/, "");
    return (
      modelId.startsWith("openai/") || modelId.startsWith("gpt-") || modelId.includes("gpt-latest")
    );
  }
  return false;
}
function resolveCacheRetention(extraParams, provider, modelApi, modelId) {
  const family = resolveAnthropicCacheRetentionFamily({
    provider,
    modelApi,
    modelId,
    hasExplicitCacheConfig:
      extraParams?.cacheRetention !== void 0 || extraParams?.cacheControlTtl !== void 0,
  });
  const googleEligible = isGooglePromptCacheEligible({
    modelApi,
    modelId,
  });
  const openaiEligible = isOpenAIPromptCacheEligible({
    provider,
    modelApi,
    modelId,
  });
  if (!family && !googleEligible && !openaiEligible) return;
  const newVal = extraParams?.cacheRetention;
  if (newVal === "none" || newVal === "short" || newVal === "long") return newVal;
  const legacy = extraParams?.cacheControlTtl;
  if (legacy === "5m") return "short";
  if (legacy === "1h") return "long";
  if (family === "anthropic-direct" || openaiEligible) return "short";
}
//#endregion
//#region src/agents/pi-embedded-runner/minimax-stream-wrappers.ts
const MINIMAX_FAST_MODEL_IDS = new Map([["MiniMax-M2.7", "MiniMax-M2.7-highspeed"]]);
function resolveMinimaxFastModelId(modelId) {
  if (typeof modelId !== "string") return;
  return MINIMAX_FAST_MODEL_IDS.get(modelId.trim());
}
function isMinimaxAnthropicMessagesModel(model) {
  return (
    model.api === "anthropic-messages" &&
    (model.provider === "minimax" || model.provider === "minimax-portal")
  );
}
function createMinimaxFastModeWrapper(baseStreamFn, fastMode) {
  const underlying = baseStreamFn ?? streamSimple;
  return (model, context, options) => {
    if (
      !fastMode ||
      model.api !== "anthropic-messages" ||
      (model.provider !== "minimax" && model.provider !== "minimax-portal")
    )
      return underlying(model, context, options);
    const fastModelId = resolveMinimaxFastModelId(model.id);
    if (!fastModelId) return underlying(model, context, options);
    return underlying(
      {
        ...model,
        id: fastModelId,
      },
      context,
      options,
    );
  };
}
/**
 * MiniMax's Anthropic-compatible streaming endpoint returns reasoning_content
 * in OpenAI-style delta chunks ({delta: {content: "", reasoning_content: "..."}})
 * rather than the native Anthropic thinking block format. Pi-ai's Anthropic
 * provider cannot process this format and leaks the reasoning text as visible
 * content. Disable thinking in the outgoing payload so MiniMax does not produce
 * reasoning_content deltas during streaming.
 */
function createMinimaxThinkingDisabledWrapper(baseStreamFn) {
  const underlying = baseStreamFn ?? streamSimple;
  return (model, context, options) => {
    if (!isMinimaxAnthropicMessagesModel(model)) return underlying(model, context, options);
    const originalOnPayload = options?.onPayload;
    return underlying(model, context, {
      ...options,
      onPayload: (payload) => {
        if (payload && typeof payload === "object") {
          const payloadObj = payload;
          if (payloadObj.thinking === void 0) payloadObj.thinking = { type: "disabled" };
        }
        return originalOnPayload?.(payload, model);
      },
    });
  };
}
//#endregion
//#region src/agents/pi-embedded-runner/reasoning-effort-utils.ts
function mapThinkingLevelToReasoningEffort(thinkingLevel) {
  if (thinkingLevel === "off") return "none";
  if (thinkingLevel === "adaptive") return "medium";
  if (thinkingLevel === "max") return "xhigh";
  return thinkingLevel;
}
//#endregion
//#region src/agents/pi-embedded-runner/openai-stream-wrappers.ts
function resolveOpenAITextVerbosityForModel(model, verbosity) {
  const api = normalizeOptionalLowercaseString(model.api);
  const provider = normalizeOptionalLowercaseString(model.provider);
  const id = normalizeOptionalLowercaseString(model.id);
  if (api === "openai-responses" && provider === "openai" && id === "chat-latest") return "medium";
  return verbosity;
}
function resolveOpenAIRequestCapabilities(model) {
  const compat = model.compat && typeof model.compat === "object" ? model.compat : void 0;
  return resolveProviderRequestPolicyConfig({
    provider: readStringValue(model.provider),
    api: readStringValue(model.api),
    baseUrl: readStringValue(model.baseUrl),
    compat,
    capability: "llm",
    transport: "stream",
  }).capabilities;
}
function shouldApplyOpenAIAttributionHeaders(model) {
  const attributionProvider = resolveOpenAIRequestCapabilities(model).attributionProvider;
  return attributionProvider === "openai" || attributionProvider === "openai-codex"
    ? attributionProvider
    : void 0;
}
function shouldApplyOpenAIServiceTier(model) {
  return resolveOpenAIResponsesPayloadPolicy(model, { storeMode: "disable" }).allowsServiceTier;
}
function shouldApplyOpenAIReasoningCompatibility(model) {
  const api = readStringValue(model.api);
  const provider = readStringValue(model.provider);
  if (!api || !provider) return false;
  return resolveOpenAIRequestCapabilities(model).supportsOpenAIReasoningCompatPayload;
}
function shouldFlattenOpenAICompletionMessages(model) {
  const compat = model.compat && typeof model.compat === "object" ? model.compat : void 0;
  return model.api === "openai-completions" && compat?.requiresStringContent === true;
}
function shouldStripOpenAICompletionTools(model) {
  const compat = model.compat && typeof model.compat === "object" ? model.compat : void 0;
  return model.api === "openai-completions" && compat?.supportsTools === false;
}
function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
function hasResponsesWebSearchTool(tools) {
  if (!Array.isArray(tools)) return false;
  return tools.some((tool) => {
    if (!isRecord(tool)) return false;
    if (tool.type === "web_search") return true;
    if (tool.type === "function" && tool.name === "web_search") return true;
    const fn = tool.function;
    return isRecord(fn) && fn.name === "web_search";
  });
}
function resolveOpenAIThinkingPayloadEffort(params) {
  const mapped = mapThinkingLevelToReasoningEffort(params.thinkingLevel);
  if (mapped !== "minimal" || !hasResponsesWebSearchTool(params.payloadObj.tools)) return mapped;
  return (
    resolveOpenAIReasoningEffortForModel({
      model: params.model,
      effort: "low",
    }) ?? mapped
  );
}
function raiseMinimalReasoningForResponsesWebSearchPayload(params) {
  const reasoning = params.payloadObj.reasoning;
  if (!isRecord(reasoning) || reasoning.effort !== "minimal") return;
  if (!hasResponsesWebSearchTool(params.payloadObj.tools)) return;
  const nextEffort = resolveOpenAIReasoningEffortForModel({
    model: params.model,
    effort: "low",
  });
  if (nextEffort && nextEffort !== "minimal" && nextEffort !== "none")
    reasoning.effort = nextEffort;
}
function normalizeOpenAIServiceTier(value) {
  if (typeof value !== "string") return;
  const normalized = normalizeOptionalLowercaseString(value);
  if (
    normalized === "auto" ||
    normalized === "default" ||
    normalized === "flex" ||
    normalized === "priority"
  )
    return normalized;
}
function resolveOpenAIServiceTier(extraParams) {
  const raw = extraParams?.serviceTier ?? extraParams?.service_tier;
  const normalized = normalizeOpenAIServiceTier(raw);
  if (raw !== void 0 && normalized === void 0) {
    const rawSummary = typeof raw === "string" ? raw : typeof raw;
    log.warn(`ignoring invalid OpenAI service tier param: ${rawSummary}`);
  }
  return normalized;
}
function normalizeOpenAIFastMode(value) {
  if (typeof value === "boolean") return value;
  const normalized = normalizeOptionalLowercaseString(value);
  if (!normalized) return;
  if (
    normalized === "on" ||
    normalized === "true" ||
    normalized === "yes" ||
    normalized === "1" ||
    normalized === "fast"
  )
    return true;
  if (
    normalized === "off" ||
    normalized === "false" ||
    normalized === "no" ||
    normalized === "0" ||
    normalized === "normal"
  )
    return false;
}
function resolveOpenAIFastMode(extraParams) {
  const raw = extraParams?.fastMode ?? extraParams?.fast_mode;
  const normalized = normalizeOpenAIFastMode(raw);
  if (raw !== void 0 && normalized === void 0) {
    const rawSummary = typeof raw === "string" ? raw : typeof raw;
    log.warn(`ignoring invalid OpenAI fast mode param: ${rawSummary}`);
  }
  return normalized;
}
function applyOpenAIFastModePayloadOverrides(params) {
  if (params.payloadObj.service_tier === void 0 && shouldApplyOpenAIServiceTier(params.model))
    params.payloadObj.service_tier = "priority";
}
function createOpenAIResponsesContextManagementWrapper(baseStreamFn, extraParams) {
  const underlying = baseStreamFn ?? streamSimple;
  return (model, context, options) => {
    const policy = resolveOpenAIResponsesPayloadPolicy(model, {
      extraParams,
      enablePromptCacheStripping: true,
      enableServerCompaction: true,
      storeMode: "provider-policy",
    });
    if (
      policy.explicitStore === void 0 &&
      !policy.useServerCompaction &&
      !policy.shouldStripStore &&
      !policy.shouldStripPromptCache &&
      !policy.shouldStripDisabledReasoningPayload
    )
      return underlying(model, context, options);
    const originalOnPayload = options?.onPayload;
    return underlying(model, context, {
      ...options,
      onPayload: (payload) => {
        if (payload && typeof payload === "object")
          applyOpenAIResponsesPayloadPolicy(payload, policy);
        return originalOnPayload?.(payload, model);
      },
    });
  };
}
function createOpenAIReasoningCompatibilityWrapper(baseStreamFn) {
  const underlying = baseStreamFn ?? streamSimple;
  return (model, context, options) => {
    if (!shouldApplyOpenAIReasoningCompatibility(model)) return underlying(model, context, options);
    return streamWithPayloadPatch(underlying, model, context, options, (payloadObj) => {
      applyOpenAIResponsesPayloadPolicy(
        payloadObj,
        resolveOpenAIResponsesPayloadPolicy(model, { storeMode: "preserve" }),
      );
    });
  };
}
function createOpenAIStringContentWrapper(baseStreamFn) {
  const underlying = baseStreamFn ?? streamSimple;
  return (model, context, options) => {
    if (!shouldFlattenOpenAICompletionMessages(model)) return underlying(model, context, options);
    return streamWithPayloadPatch(underlying, model, context, options, (payloadObj) => {
      if (!Array.isArray(payloadObj.messages)) return;
      payloadObj.messages = flattenCompletionMessagesToStringContent(payloadObj.messages);
    });
  };
}
function createOpenAICompletionsToolsCompatWrapper(baseStreamFn) {
  const underlying = baseStreamFn ?? streamSimple;
  return (model, context, options) => {
    if (!shouldStripOpenAICompletionTools(model)) return underlying(model, context, options);
    return streamWithPayloadPatch(underlying, model, context, options, (payloadObj) => {
      delete payloadObj.tools;
      delete payloadObj.tool_choice;
      delete payloadObj.parallel_tool_calls;
    });
  };
}
function createOpenAIThinkingLevelWrapper(baseStreamFn, thinkingLevel) {
  const underlying = baseStreamFn ?? streamSimple;
  if (!thinkingLevel) return underlying;
  return (model, context, options) => {
    if (!shouldApplyOpenAIReasoningCompatibility(model)) {
      if (thinkingLevel === "off") return underlying(model, context, options);
      return streamWithPayloadPatch(underlying, model, context, options, (payloadObj) => {
        raiseMinimalReasoningForResponsesWebSearchPayload({
          model,
          payloadObj,
        });
      });
    }
    return streamWithPayloadPatch(underlying, model, context, options, (payloadObj) => {
      const existingReasoning = payloadObj.reasoning;
      if (thinkingLevel === "off") {
        if (existingReasoning !== void 0) delete payloadObj.reasoning;
        return;
      }
      const reasoningEffort = resolveOpenAIThinkingPayloadEffort({
        model,
        payloadObj,
        thinkingLevel,
      });
      if (existingReasoning === "none") {
        payloadObj.reasoning = { effort: reasoningEffort };
        return;
      }
      if (
        existingReasoning &&
        typeof existingReasoning === "object" &&
        !Array.isArray(existingReasoning)
      ) {
        existingReasoning.effort = reasoningEffort;
        raiseMinimalReasoningForResponsesWebSearchPayload({
          model,
          payloadObj,
        });
      }
    });
  };
}
function createOpenAIFastModeWrapper(baseStreamFn) {
  const underlying = baseStreamFn ?? streamSimple;
  return (model, context, options) => {
    if (
      (model.api !== "openai-responses" &&
        model.api !== "openai-codex-responses" &&
        model.api !== "azure-openai-responses") ||
      (model.provider !== "openai" && model.provider !== "openai-codex")
    )
      return underlying(model, context, options);
    const originalOnPayload = options?.onPayload;
    return underlying(model, context, {
      ...options,
      onPayload: (payload) => {
        if (payload && typeof payload === "object")
          applyOpenAIFastModePayloadOverrides({
            payloadObj: payload,
            model,
          });
        return originalOnPayload?.(payload, model);
      },
    });
  };
}
function createOpenAIServiceTierWrapper(baseStreamFn, serviceTier) {
  const underlying = baseStreamFn ?? streamSimple;
  return (model, context, options) => {
    if (!shouldApplyOpenAIServiceTier(model)) return underlying(model, context, options);
    return streamWithPayloadPatch(underlying, model, context, options, (payloadObj) => {
      if (payloadObj.service_tier === void 0) payloadObj.service_tier = serviceTier;
    });
  };
}
function createOpenAITextVerbosityWrapper(baseStreamFn, verbosity) {
  const underlying = baseStreamFn ?? streamSimple;
  return (model, context, options) => {
    if (model.api !== "openai-responses" && model.api !== "openai-codex-responses")
      return underlying(model, context, options);
    const resolvedVerbosity = resolveOpenAITextVerbosityForModel(model, verbosity);
    const shouldOverrideExistingVerbosity =
      model.api === "openai-codex-responses" || resolvedVerbosity !== verbosity;
    const originalOnPayload = options?.onPayload;
    return underlying(model, context, {
      ...options,
      onPayload: (payload) => {
        if (payload && typeof payload === "object") {
          const payloadObj = payload;
          const existingText =
            payloadObj.text && typeof payloadObj.text === "object" ? payloadObj.text : {};
          if (shouldOverrideExistingVerbosity || existingText.verbosity === void 0)
            payloadObj.text = {
              ...existingText,
              verbosity: resolvedVerbosity,
            };
        }
        return originalOnPayload?.(payload, model);
      },
    });
  };
}
function createCodexNativeWebSearchWrapper(baseStreamFn, params) {
  const underlying = baseStreamFn ?? streamSimple;
  return (model, context, options) => {
    const activation = resolveCodexNativeSearchActivation({
      config: params.config,
      modelProvider: readStringValue(model.provider),
      modelApi: readStringValue(model.api),
      agentDir: params.agentDir,
    });
    if (activation.state !== "native_active") {
      if (activation.codexNativeEnabled)
        log.debug(
          `skipping Codex native web search (${activation.inactiveReason ?? "inactive"}) for ${model.provider ?? "unknown"}/${model.id ?? "unknown"}`,
        );
      return underlying(model, context, options);
    }
    log.debug(
      `activating Codex native web search (${activation.codexMode}) for ${model.provider ?? "unknown"}/${model.id ?? "unknown"}`,
    );
    const originalOnPayload = options?.onPayload;
    return underlying(model, context, {
      ...options,
      onPayload: (payload) => {
        const result = patchCodexNativeWebSearchPayload({
          payload,
          config: params.config,
        });
        if (result.status === "payload_not_object")
          log.debug(
            "Skipping Codex native web search injection because provider payload is not an object",
          );
        else if (result.status === "native_tool_already_present")
          log.debug("Codex native web search tool already present in provider payload");
        else if (result.status === "injected")
          log.debug("Injected Codex native web search tool into provider payload");
        return originalOnPayload?.(payload, model);
      },
    });
  };
}
function createOpenAIDefaultTransportWrapper(baseStreamFn) {
  const underlying = baseStreamFn ?? streamSimple;
  return (model, context, options) => {
    const typedOptions = options;
    return underlying(model, context, {
      ...options,
      transport: options?.transport ?? "auto",
      openaiWsWarmup: typedOptions?.openaiWsWarmup ?? true,
    });
  };
}
function createOpenAIAttributionHeadersWrapper(baseStreamFn, opts) {
  const underlying = baseStreamFn ?? streamSimple;
  return (model, context, options) => {
    const attributionProvider = shouldApplyOpenAIAttributionHeaders(model);
    if (!attributionProvider) return underlying(model, context, options);
    return (
      attributionProvider === "openai-codex" &&
        (baseStreamFn === void 0 || baseStreamFn === streamSimple)
        ? (opts?.codexNativeTransportStreamFn ?? createOpenAIResponsesTransportStreamFn())
        : underlying
    )(model, context, {
      ...options,
      headers: resolveProviderRequestPolicyConfig({
        provider: attributionProvider,
        api: readStringValue(model.api),
        baseUrl: readStringValue(model.baseUrl),
        capability: "llm",
        transport: "stream",
        callerHeaders: options?.headers,
        precedence: "defaults-win",
      }).headers,
    });
  };
}
//#endregion
//#region src/agents/pi-embedded-runner/proxy-stream-wrappers.ts
const KILOCODE_FEATURE_HEADER = "X-KILOCODE-FEATURE";
const KILOCODE_FEATURE_DEFAULT = "openclaw";
const KILOCODE_FEATURE_ENV_VAR = "KILOCODE_FEATURE";
function resolveKilocodeAppHeaders() {
  const feature = process.env[KILOCODE_FEATURE_ENV_VAR]?.trim() || KILOCODE_FEATURE_DEFAULT;
  return { [KILOCODE_FEATURE_HEADER]: feature };
}
function readExtraParam(extraParams, keys) {
  if (!extraParams) return;
  for (const key of keys) if (Object.hasOwn(extraParams, key)) return extraParams[key];
}
function resolveBooleanParam(value) {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return;
  const normalized = normalizeOptionalLowercaseString(value);
  if (!normalized) return;
  if (["1", "true", "yes", "on", "enable", "enabled"].includes(normalized)) return true;
  if (["0", "false", "no", "off", "disable", "disabled"].includes(normalized)) return false;
}
function resolveOpenRouterResponseCacheTtlSeconds(value) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value.trim())
        : NaN;
  if (!Number.isFinite(parsed)) return;
  return String(Math.max(1, Math.min(86400, Math.trunc(parsed))));
}
function shouldApplyOpenRouterResponseCacheHeaders(model) {
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
function resolveOpenRouterResponseCacheHeaders(model, extraParams) {
  if (!shouldApplyOpenRouterResponseCacheHeaders(model)) return;
  const configuredCache = resolveBooleanParam(
    readExtraParam(extraParams, ["responseCache", "response_cache"]),
  );
  const clearCache = resolveBooleanParam(
    readExtraParam(extraParams, ["responseCacheClear", "response_cache_clear"]),
  );
  const cacheEnabled = configuredCache ?? (clearCache ? true : void 0);
  if (cacheEnabled === void 0) return;
  const headers = { "X-OpenRouter-Cache": cacheEnabled ? "true" : "false" };
  if (!cacheEnabled) return headers;
  const ttl = resolveOpenRouterResponseCacheTtlSeconds(
    readExtraParam(extraParams, [
      "responseCacheTtlSeconds",
      "response_cache_ttl_seconds",
      "responseCacheTtl",
      "response_cache_ttl",
    ]),
  );
  if (ttl) headers["X-OpenRouter-Cache-TTL"] = ttl;
  if (clearCache) headers["X-OpenRouter-Cache-Clear"] = "true";
  return headers;
}
function normalizeProxyReasoningPayload(payload, thinkingLevel) {
  if (!payload || typeof payload !== "object") return;
  const payloadObj = payload;
  delete payloadObj.reasoning_effort;
  if (!thinkingLevel || thinkingLevel === "off") return;
  const existingReasoning = payloadObj.reasoning;
  if (
    existingReasoning &&
    typeof existingReasoning === "object" &&
    !Array.isArray(existingReasoning)
  ) {
    const reasoningObj = existingReasoning;
    if (!("max_tokens" in reasoningObj) && !("effort" in reasoningObj))
      reasoningObj.effort = mapThinkingLevelToReasoningEffort(thinkingLevel);
  } else if (!existingReasoning)
    payloadObj.reasoning = { effort: mapThinkingLevelToReasoningEffort(thinkingLevel) };
}
/**
 * Resolve the OpenRouter cache retention from explicit config first, then the
 * PI_CACHE_RETENTION env (matching the Anthropic-direct path), defaulting to
 * short. Kept conservative: only an explicit "long" produces a 1h TTL.
 */
function resolveOpenRouterCacheRetention(options) {
  if (options?.cacheRetention === "none") return "none";
  if (options?.cacheRetention === "long") return "long";
  if (options?.cacheRetention === "short") return "short";
  return process.env.PI_CACHE_RETENTION === "long" ? "long" : "short";
}
function createOpenRouterSystemCacheWrapper(baseStreamFn, wrapperOptions) {
  const underlying = baseStreamFn ?? streamSimple;
  const retention = resolveOpenRouterCacheRetention(wrapperOptions);
  const googleMarkers = wrapperOptions?.googleMarkers === true;
  const historyCacheBreakpoints = wrapperOptions?.historyCacheBreakpoints;
  const markerOptions =
    retention === "long" || historyCacheBreakpoints
      ? {
          ...(retention === "long" ? { ttl: "1h" } : {}),
          ...(historyCacheBreakpoints ? { historyBreakpoints: historyCacheBreakpoints } : {}),
        }
      : void 0;
  return (model, context, options) => {
    const provider = readStringValue(model.provider);
    const modelId = readStringValue(model.id);
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
        (googleMarkers &&
          isOpenRouterGoogleCacheEligible({
            provider,
            modelId,
          })));
    if (
      retention === "none" ||
      !familyEligible ||
      !(
        endpointClass === "openrouter" ||
        (endpointClass === "default" && normalizeOptionalLowercaseString(provider) === "openrouter")
      )
    )
      return underlying(model, context, options);
    return streamWithPayloadPatch(underlying, model, context, options, (payloadObj) => {
      applyAnthropicEphemeralCacheControlMarkers(payloadObj, markerOptions);
    });
  };
}
function createOpenRouterWrapper(baseStreamFn, thinkingLevel, extraParams) {
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
function isProxyReasoningUnsupported(modelId) {
  const trimmed = normalizeOptionalLowercaseString(modelId);
  const slashIndex = trimmed?.indexOf("/") ?? -1;
  return slashIndex > 0 && trimmed?.slice(0, slashIndex) === "x-ai";
}
function createKilocodeWrapper(baseStreamFn, thinkingLevel) {
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
//#endregion
export {
  resolveOpenAITextVerbosity as S,
  resolveOpenAIServiceTier as _,
  createCodexNativeWebSearchWrapper as a,
  isGooglePromptCacheEligible as b,
  createOpenAIDefaultTransportWrapper as c,
  createOpenAIResponsesContextManagementWrapper as d,
  createOpenAIServiceTierWrapper as f,
  resolveOpenAIFastMode as g,
  createOpenAIThinkingLevelWrapper as h,
  isProxyReasoningUnsupported as i,
  createOpenAIFastModeWrapper as l,
  createOpenAITextVerbosityWrapper as m,
  createOpenRouterSystemCacheWrapper as n,
  createOpenAIAttributionHeadersWrapper as o,
  createOpenAIStringContentWrapper as p,
  createOpenRouterWrapper as r,
  createOpenAICompletionsToolsCompatWrapper as s,
  createKilocodeWrapper as t,
  createOpenAIReasoningCompatibilityWrapper as u,
  createMinimaxFastModeWrapper as v,
  resolveCacheRetention as x,
  createMinimaxThinkingDisabledWrapper as y,
};
