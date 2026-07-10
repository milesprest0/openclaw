import { r as resolveProviderRequestCapabilities } from "./provider-attribution-SP5uub3O.js";
import {
  i as stripSystemPromptCacheBoundary,
  r as splitSystemPromptCacheBoundary,
} from "./system-prompt-cache-boundary-Cq7GvFY6.js";
//#region src/agents/anthropic-payload-policy.ts
function resolveBaseUrlHostname(baseUrl) {
  try {
    return new URL(baseUrl).hostname;
  } catch {
    return;
  }
}
function isLongTtlEligibleEndpoint(baseUrl) {
  if (typeof baseUrl !== "string") return false;
  const hostname = resolveBaseUrlHostname(baseUrl);
  if (!hostname) return false;
  return (
    hostname === "api.anthropic.com" ||
    hostname === "aiplatform.googleapis.com" ||
    hostname.endsWith("-aiplatform.googleapis.com")
  );
}
function resolveAnthropicEphemeralCacheControl(baseUrl, cacheRetention) {
  const retention =
    cacheRetention ?? (process.env.PI_CACHE_RETENTION === "long" ? "long" : "short");
  if (retention === "none") return;
  const ttl =
    retention === "long" && (cacheRetention === "long" || isLongTtlEligibleEndpoint(baseUrl))
      ? "1h"
      : void 0;
  return {
    type: "ephemeral",
    ...(ttl ? { ttl } : {}),
  };
}
function applyAnthropicCacheControlToSystem(system, cacheControl) {
  if (!Array.isArray(system)) return;
  const normalizedBlocks = [];
  for (const block of system) {
    if (!block || typeof block !== "object") {
      normalizedBlocks.push(block);
      continue;
    }
    const record = block;
    if (record.type !== "text" || typeof record.text !== "string") {
      normalizedBlocks.push(block);
      continue;
    }
    const split = splitSystemPromptCacheBoundary(record.text);
    if (!split) {
      if (record.cache_control === void 0) record.cache_control = cacheControl;
      normalizedBlocks.push(record);
      continue;
    }
    const { cache_control: existingCacheControl, ...rest } = record;
    if (split.stablePrefix)
      normalizedBlocks.push({
        ...rest,
        text: split.stablePrefix,
        cache_control: existingCacheControl ?? cacheControl,
      });
    if (split.dynamicSuffix)
      normalizedBlocks.push({
        ...rest,
        text: split.dynamicSuffix,
      });
  }
  system.splice(0, system.length, ...normalizedBlocks);
}
function stripAnthropicSystemPromptBoundary(system) {
  if (!Array.isArray(system)) return;
  for (const block of system) {
    if (!block || typeof block !== "object") continue;
    const record = block;
    if (record.type === "text" && typeof record.text === "string")
      record.text = stripSystemPromptCacheBoundary(record.text);
  }
}
function applyAnthropicCacheControlToMessages(messages, cacheControl, options) {
  if (!Array.isArray(messages) || messages.length === 0) return;
  const historyMode = options?.historyBreakpoints ?? "off";
  if (
    historyMode !== "off" &&
    applyHistoryCacheBreakpoints({
      messages,
      cacheControl,
      mode: historyMode,
      onComputed: options?.onHistoryBreakpointsComputed,
    })
  )
    return;
  const lastMessage = messages[messages.length - 1];
  if (!lastMessage || typeof lastMessage !== "object") return;
  const record = lastMessage;
  if (record.role !== "user") return;
  const content = record.content;
  if (Array.isArray(content)) {
    const lastBlock = content[content.length - 1];
    if (!lastBlock || typeof lastBlock !== "object") return;
    const lastBlockRecord = lastBlock;
    if (
      lastBlockRecord.type === "text" ||
      lastBlockRecord.type === "image" ||
      lastBlockRecord.type === "tool_result"
    )
      lastBlockRecord.cache_control = cacheControl;
    return;
  }
  if (typeof content === "string")
    record.content = [
      {
        type: "text",
        text: content,
        cache_control: cacheControl,
      },
    ];
}
function resolveAnthropicPayloadPolicy(input) {
  return {
    allowsServiceTier: resolveProviderRequestCapabilities({
      provider: input.provider,
      api: input.api,
      baseUrl: input.baseUrl,
      capability: "llm",
      transport: "stream",
    }).allowsAnthropicServiceTier,
    cacheControl:
      input.enableCacheControl === true
        ? resolveAnthropicEphemeralCacheControl(input.baseUrl, input.cacheRetention)
        : void 0,
    serviceTier: input.serviceTier,
  };
}
function applyAnthropicPayloadPolicyToParams(payloadObj, policy, options) {
  if (
    policy.allowsServiceTier &&
    policy.serviceTier !== void 0 &&
    payloadObj.service_tier === void 0
  )
    payloadObj.service_tier = policy.serviceTier;
  if (policy.cacheControl)
    applyAnthropicCacheControlToSystem(payloadObj.system, policy.cacheControl);
  else stripAnthropicSystemPromptBoundary(payloadObj.system);
  if (!policy.cacheControl) return;
  applyAnthropicCacheControlToMessages(payloadObj.messages, policy.cacheControl, options);
}
/**
 * Build the ephemeral cache_control value for the OpenRouter marker path.
 * Short (5m) by default; long (1h) only when explicitly requested.
 */
function buildEphemeralCacheControl(options) {
  return options?.ttl === "1h"
    ? {
        type: "ephemeral",
        ttl: "1h",
      }
    : { type: "ephemeral" };
}
/**
 * Honor the `<!-- OPENCLAW_CACHE_BOUNDARY -->` split for an OpenRouter
 * system/developer text payload. Given the message content (string or array),
 * if a boundary marker is present in a single text block, returns a 2-block
 * array: a cached stable-prefix block carrying cache_control, followed by an
 * uncached dynamic-suffix block (boundary stripped from both). Returns
 * undefined when no boundary split applies (caller falls back to legacy
 * last-block marking). This mirrors the Anthropic-direct boundary behavior so
 * daily-churn context (MEMORY.md, etc.) below the boundary stops invalidating
 * the large stable identity/tools prefix above it. (2026-05-28, Phase 1)
 */
function splitSystemContentOnCacheBoundary(content, cacheControl) {
  let text;
  let baseRecord;
  if (typeof content === "string") {
    text = content;
    baseRecord = { type: "text" };
  } else if (Array.isArray(content) && content.length === 1) {
    const only = content[0];
    if (only && typeof only === "object") {
      const record = only;
      if (record.type === "text" && typeof record.text === "string") {
        text = record.text;
        const { cache_control: _drop, text: _t, ...rest } = record;
        baseRecord = {
          ...rest,
          type: "text",
        };
      }
    }
  }
  if (text === void 0 || baseRecord === void 0) return;
  const split = splitSystemPromptCacheBoundary(text);
  if (!split) return;
  const blocks = [];
  if (split.stablePrefix)
    blocks.push({
      ...baseRecord,
      text: stripSystemPromptCacheBoundary(split.stablePrefix),
      cache_control: cacheControl,
    });
  if (split.dynamicSuffix)
    blocks.push({
      ...baseRecord,
      text: stripSystemPromptCacheBoundary(split.dynamicSuffix),
    });
  if (blocks.length === 1 && !split.stablePrefix) blocks[0].cache_control = cacheControl;
  return blocks.length > 0 ? blocks : void 0;
}
/**
 * Phase 3 (multi-breakpoint): cache the tool-definitions block by placing a
 * cache_control marker on the LAST tool. In Anthropic's cache hierarchy
 * (tools -> system -> messages), this caches the large, stable tool schema
 * independently of system/conversation churn, and survives even when the
 * system suffix or message tail changes. Verified live on OpenRouter:
 * marking the last OpenAI-format tool produced a tools+system cache hit
 * (~90% read discount). Handles both OpenAI-completions tool shape
 * ({ type:"function", function:{...} }) and Anthropic-native ({ name, ... }).
 * Idempotent: only the last tool carries the marker; earlier tools are
 * cleaned to avoid exceeding Anthropic's 4-breakpoint budget. (2026-05-28)
 */
function applyToolDefinitionsCacheControl(payloadObj, cacheControl) {
  const tools = payloadObj.tools;
  if (!Array.isArray(tools) || tools.length === 0) return;
  for (let i = 0; i < tools.length - 1; i++) {
    const tool = tools[i];
    if (tool && typeof tool === "object") delete tool.cache_control;
  }
  const last = tools[tools.length - 1];
  if (last && typeof last === "object") last.cache_control = cacheControl;
}
function isThinkingType(type) {
  return type === "thinking" || type === "redacted_thinking";
}
function isFrozenMessage(record) {
  if (record.frozen === true) return true;
  const content = record.content;
  if (!Array.isArray(content) || content.length === 0) return false;
  const last = content[content.length - 1];
  return !!last && typeof last === "object" && last.frozen === true;
}
function findLastNonThinkingBlockIndex(content) {
  for (let i = content.length - 1; i >= 0; i -= 1) {
    const block = content[i];
    if (!block || typeof block !== "object") continue;
    if (!isThinkingType(block.type)) return i;
  }
  return -1;
}
function clearHistoryCacheControlMarkers(messages) {
  for (const message of messages) {
    if (!message || typeof message !== "object") continue;
    const messageRecord = message;
    if (messageRecord.role === "system" || messageRecord.role === "developer") continue;
    const content = messageRecord.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) if (block && typeof block === "object") delete block.cache_control;
  }
}
function resolveHistoryCacheBreakpointIndices(messages) {
  let lastFrozenIdx = null;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (!message || typeof message !== "object") continue;
    if (isFrozenMessage(message)) {
      lastFrozenIdx = i;
      break;
    }
  }
  if (lastFrozenIdx === null)
    return {
      hasFrozenBoundary: false,
      lastFrozenIdx: null,
      lastStableWarmIdx: null,
    };
  let lastStableWarmIdx = null;
  for (let i = messages.length - 2; i >= 0; i -= 1) {
    const message = messages[i];
    if (!message || typeof message !== "object") continue;
    const messageRecord = message;
    if (messageRecord.role === "system" || messageRecord.role === "developer") continue;
    if (isFrozenMessage(messageRecord)) continue;
    lastStableWarmIdx = i;
    break;
  }
  return {
    hasFrozenBoundary: true,
    lastFrozenIdx,
    lastStableWarmIdx,
  };
}
function applyHistoryCacheBreakpointMarker(params) {
  if (params.targetIndex === null) return;
  const message = params.messages[params.targetIndex];
  if (!message || typeof message !== "object") return;
  const messageRecord = message;
  const content = messageRecord.content;
  if (Array.isArray(content)) {
    const blockIndex = findLastNonThinkingBlockIndex(content);
    if (blockIndex < 0) return;
    const block = content[blockIndex];
    if (!block || typeof block !== "object") return;
    block.cache_control = params.cacheControl;
    return;
  }
  if (typeof content === "string")
    messageRecord.content = [
      {
        type: "text",
        text: content,
        cache_control: params.cacheControl,
      },
    ];
}
function applyHistoryCacheBreakpoints(params) {
  const resolved = resolveHistoryCacheBreakpointIndices(params.messages);
  params.onComputed?.({
    lastFrozenIdx: resolved.lastFrozenIdx,
    lastStableWarmIdx: resolved.lastStableWarmIdx,
  });
  if (!resolved.hasFrozenBoundary || params.mode !== "on") return false;
  clearHistoryCacheControlMarkers(params.messages);
  applyHistoryCacheBreakpointMarker({
    messages: params.messages,
    targetIndex: resolved.lastFrozenIdx,
    cacheControl: params.cacheControl,
  });
  applyHistoryCacheBreakpointMarker({
    messages: params.messages,
    targetIndex: resolved.lastStableWarmIdx,
    cacheControl: params.cacheControl,
  });
  return true;
}
function applyAnthropicEphemeralCacheControlMarkers(payloadObj, options) {
  const messages = payloadObj.messages;
  if (!Array.isArray(messages)) return;
  const cacheControl = buildEphemeralCacheControl(options);
  applyToolDefinitionsCacheControl(payloadObj, cacheControl);
  for (const message of messages) {
    if (message.role === "system" || message.role === "developer") {
      const splitBlocks = splitSystemContentOnCacheBoundary(message.content, cacheControl);
      if (splitBlocks) {
        message.content = splitBlocks;
        continue;
      }
      if (typeof message.content === "string") {
        message.content = [
          {
            type: "text",
            text: message.content,
            cache_control: cacheControl,
          },
        ];
        continue;
      }
      if (Array.isArray(message.content) && message.content.length > 0) {
        for (const block of message.content)
          if (block && typeof block === "object") {
            const record = block;
            if (record.type === "text" && typeof record.text === "string")
              record.text = stripSystemPromptCacheBoundary(record.text);
          }
        const last = message.content[message.content.length - 1];
        if (last && typeof last === "object") {
          const record = last;
          if (!isThinkingType(record.type)) record.cache_control = cacheControl;
        }
      }
      continue;
    }
    if (message.role === "assistant" && Array.isArray(message.content))
      for (const block of message.content) {
        if (!block || typeof block !== "object") continue;
        const record = block;
        if (isThinkingType(record.type)) delete record.cache_control;
      }
  }
  const historyMode = options?.historyBreakpoints ?? "off";
  if (historyMode === "off") return;
  applyHistoryCacheBreakpoints({
    messages,
    cacheControl,
    mode: historyMode,
    onComputed: options?.onHistoryBreakpointsComputed,
  });
}
//#endregion
export {
  applyAnthropicPayloadPolicyToParams as n,
  resolveAnthropicPayloadPolicy as r,
  applyAnthropicEphemeralCacheControlMarkers as t,
};
