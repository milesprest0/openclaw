import { resolveProviderRequestCapabilities } from "./provider-attribution.js";
import {
  splitSystemPromptCacheBoundary,
  stripSystemPromptCacheBoundary,
} from "./system-prompt-cache-boundary.js";

export type AnthropicServiceTier = "auto" | "standard_only";

export type AnthropicEphemeralCacheControl = {
  type: "ephemeral";
  ttl?: "1h";
};

type AnthropicPayloadPolicyInput = {
  api?: string;
  baseUrl?: string;
  cacheRetention?: "short" | "long" | "none";
  enableCacheControl?: boolean;
  provider?: string;
  serviceTier?: AnthropicServiceTier;
};

export type AnthropicPayloadPolicy = {
  allowsServiceTier: boolean;
  cacheControl: AnthropicEphemeralCacheControl | undefined;
  serviceTier: AnthropicServiceTier | undefined;
};

function resolveBaseUrlHostname(baseUrl: string): string | undefined {
  try {
    return new URL(baseUrl).hostname;
  } catch {
    return undefined;
  }
}

function isLongTtlEligibleEndpoint(baseUrl: string | undefined): boolean {
  if (typeof baseUrl !== "string") {
    return false;
  }
  const hostname = resolveBaseUrlHostname(baseUrl);
  if (!hostname) {
    return false;
  }
  return (
    hostname === "api.anthropic.com" ||
    hostname === "aiplatform.googleapis.com" ||
    hostname.endsWith("-aiplatform.googleapis.com")
  );
}

function resolveAnthropicEphemeralCacheControl(
  baseUrl: string | undefined,
  cacheRetention: AnthropicPayloadPolicyInput["cacheRetention"],
): AnthropicEphemeralCacheControl | undefined {
  const retention =
    cacheRetention ?? (process.env.PI_CACHE_RETENTION === "long" ? "long" : "short");
  if (retention === "none") {
    return undefined;
  }
  // Trust explicit long-retention opt-ins for Anthropic-compatible custom providers.
  // Keep hostname gating for implicit/env-driven long retention so defaults stay conservative.
  const ttl =
    retention === "long" && (cacheRetention === "long" || isLongTtlEligibleEndpoint(baseUrl))
      ? "1h"
      : undefined;
  return { type: "ephemeral", ...(ttl ? { ttl } : {}) };
}

function applyAnthropicCacheControlToSystem(
  system: unknown,
  cacheControl: AnthropicEphemeralCacheControl,
): void {
  if (!Array.isArray(system)) {
    return;
  }

  const normalizedBlocks: Array<unknown> = [];
  for (const block of system) {
    if (!block || typeof block !== "object") {
      normalizedBlocks.push(block);
      continue;
    }
    const record = block as Record<string, unknown>;
    if (record.type !== "text" || typeof record.text !== "string") {
      normalizedBlocks.push(block);
      continue;
    }
    const split = splitSystemPromptCacheBoundary(record.text);
    if (!split) {
      if (record.cache_control === undefined) {
        record.cache_control = cacheControl;
      }
      normalizedBlocks.push(record);
      continue;
    }

    const { cache_control: existingCacheControl, ...rest } = record;
    if (split.stablePrefix) {
      normalizedBlocks.push({
        ...rest,
        text: split.stablePrefix,
        cache_control: existingCacheControl ?? cacheControl,
      });
    }
    if (split.dynamicSuffix) {
      normalizedBlocks.push({
        ...rest,
        text: split.dynamicSuffix,
      });
    }
  }

  system.splice(0, system.length, ...normalizedBlocks);
}

function stripAnthropicSystemPromptBoundary(system: unknown): void {
  if (!Array.isArray(system)) {
    return;
  }

  for (const block of system) {
    if (!block || typeof block !== "object") {
      continue;
    }
    const record = block as Record<string, unknown>;
    if (record.type === "text" && typeof record.text === "string") {
      record.text = stripSystemPromptCacheBoundary(record.text);
    }
  }
}

function applyAnthropicCacheControlToMessages(
  messages: unknown,
  cacheControl: AnthropicEphemeralCacheControl,
): void {
  if (!Array.isArray(messages) || messages.length === 0) {
    return;
  }

  const lastMessage = messages[messages.length - 1];
  if (!lastMessage || typeof lastMessage !== "object") {
    return;
  }

  const record = lastMessage as Record<string, unknown>;
  if (record.role !== "user") {
    return;
  }

  const content = record.content;
  if (Array.isArray(content)) {
    const lastBlock = content[content.length - 1];
    if (!lastBlock || typeof lastBlock !== "object") {
      return;
    }
    const lastBlockRecord = lastBlock as Record<string, unknown>;
    if (
      lastBlockRecord.type === "text" ||
      lastBlockRecord.type === "image" ||
      lastBlockRecord.type === "tool_result"
    ) {
      lastBlockRecord.cache_control = cacheControl;
    }
    return;
  }

  if (typeof content === "string") {
    record.content = [
      {
        type: "text",
        text: content,
        cache_control: cacheControl,
      },
    ];
  }
}

export function resolveAnthropicPayloadPolicy(
  input: AnthropicPayloadPolicyInput,
): AnthropicPayloadPolicy {
  const capabilities = resolveProviderRequestCapabilities({
    provider: input.provider,
    api: input.api,
    baseUrl: input.baseUrl,
    capability: "llm",
    transport: "stream",
  });

  return {
    allowsServiceTier: capabilities.allowsAnthropicServiceTier,
    cacheControl:
      input.enableCacheControl === true
        ? resolveAnthropicEphemeralCacheControl(input.baseUrl, input.cacheRetention)
        : undefined,
    serviceTier: input.serviceTier,
  };
}

export function applyAnthropicPayloadPolicyToParams(
  payloadObj: Record<string, unknown>,
  policy: AnthropicPayloadPolicy,
): void {
  if (
    policy.allowsServiceTier &&
    policy.serviceTier !== undefined &&
    payloadObj.service_tier === undefined
  ) {
    payloadObj.service_tier = policy.serviceTier;
  }

  if (policy.cacheControl) {
    applyAnthropicCacheControlToSystem(payloadObj.system, policy.cacheControl);
  } else {
    stripAnthropicSystemPromptBoundary(payloadObj.system);
  }

  if (!policy.cacheControl) {
    return;
  }

  // Preserve Anthropic cache-write scope by only tagging the trailing user turn.
  applyAnthropicCacheControlToMessages(payloadObj.messages, policy.cacheControl);
}

export type AnthropicEphemeralCacheMarkerOptions = {
  /**
   * When "1h", emit a long-retention ephemeral cache marker
   * ({ type: "ephemeral", ttl: "1h" }). Defaults to the short (5m) ephemeral
   * marker. Phase 2 (TTL alignment) threads this in per-surface; callers that
   * pass nothing keep the conservative 5m default.
   */
  ttl?: "1h";
};

/**
 * Build the ephemeral cache_control value for the OpenRouter marker path.
 * Short (5m) by default; long (1h) only when explicitly requested.
 */
function buildEphemeralCacheControl(
  options?: AnthropicEphemeralCacheMarkerOptions,
): AnthropicEphemeralCacheControl {
  return options?.ttl === "1h" ? { type: "ephemeral", ttl: "1h" } : { type: "ephemeral" };
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
function splitSystemContentOnCacheBoundary(
  content: unknown,
  cacheControl: AnthropicEphemeralCacheControl,
): Array<Record<string, unknown>> | undefined {
  let text: string | undefined;
  let baseRecord: Record<string, unknown> | undefined;

  if (typeof content === "string") {
    text = content;
    baseRecord = { type: "text" };
  } else if (Array.isArray(content) && content.length === 1) {
    const only = content[0];
    if (only && typeof only === "object") {
      const record = only as Record<string, unknown>;
      if (record.type === "text" && typeof record.text === "string") {
        text = record.text;
        const { cache_control: _drop, text: _t, ...rest } = record;
        baseRecord = { ...rest, type: "text" };
      }
    }
  }

  if (text === undefined || baseRecord === undefined) {
    return undefined;
  }

  const split = splitSystemPromptCacheBoundary(text);
  if (!split) {
    return undefined;
  }

  const blocks: Array<Record<string, unknown>> = [];
  if (split.stablePrefix) {
    blocks.push({
      ...baseRecord,
      text: stripSystemPromptCacheBoundary(split.stablePrefix),
      cache_control: cacheControl,
    });
  }
  if (split.dynamicSuffix) {
    blocks.push({
      ...baseRecord,
      text: stripSystemPromptCacheBoundary(split.dynamicSuffix),
    });
  }
  // Degenerate case: boundary present but no stable prefix — still cache the
  // suffix so we don't silently disable caching.
  if (blocks.length === 1 && !split.stablePrefix) {
    blocks[0].cache_control = cacheControl;
  }
  return blocks.length > 0 ? blocks : undefined;
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
function applyToolDefinitionsCacheControl(
  payloadObj: Record<string, unknown>,
  cacheControl: AnthropicEphemeralCacheControl,
): void {
  const tools = payloadObj.tools;
  if (!Array.isArray(tools) || tools.length === 0) {
    return;
  }
  // Clear any stray markers on non-final tools so we contribute exactly ONE
  // breakpoint (the tools-block boundary).
  for (let i = 0; i < tools.length - 1; i++) {
    const tool = tools[i];
    if (tool && typeof tool === "object") {
      delete (tool as Record<string, unknown>).cache_control;
    }
  }
  const last = tools[tools.length - 1];
  if (last && typeof last === "object") {
    (last as Record<string, unknown>).cache_control = cacheControl;
  }
}

export function applyAnthropicEphemeralCacheControlMarkers(
  payloadObj: Record<string, unknown>,
  options?: AnthropicEphemeralCacheMarkerOptions,
): void {
  const messages = payloadObj.messages;
  if (!Array.isArray(messages)) {
    return;
  }

  const cacheControl = buildEphemeralCacheControl(options);

  // Phase 3: cache the stable tool-definitions block (one breakpoint).
  applyToolDefinitionsCacheControl(payloadObj, cacheControl);

  for (const message of messages as Array<{ role?: string; content?: unknown }>) {
    if (message.role === "system" || message.role === "developer") {
      // Phase 1: honor the OPENCLAW_CACHE_BOUNDARY split when present so the
      // volatile suffix (below the boundary) does not bust the stable prefix.
      const splitBlocks = splitSystemContentOnCacheBoundary(message.content, cacheControl);
      if (splitBlocks) {
        message.content = splitBlocks;
        continue;
      }
      if (typeof message.content === "string") {
        message.content = [{ type: "text", text: message.content, cache_control: cacheControl }];
        continue;
      }
      if (Array.isArray(message.content) && message.content.length > 0) {
        // Strip any inert boundary marker text from multi-block system content
        // so it never leaks into the model prompt.
        for (const block of message.content) {
          if (block && typeof block === "object") {
            const record = block as Record<string, unknown>;
            if (record.type === "text" && typeof record.text === "string") {
              record.text = stripSystemPromptCacheBoundary(record.text);
            }
          }
        }
        const last = message.content[message.content.length - 1];
        if (last && typeof last === "object") {
          const record = last as Record<string, unknown>;
          if (record.type !== "thinking" && record.type !== "redacted_thinking") {
            record.cache_control = cacheControl;
          }
        }
      }
      continue;
    }

    if (message.role === "assistant" && Array.isArray(message.content)) {
      for (const block of message.content) {
        if (!block || typeof block !== "object") {
          continue;
        }
        const record = block as Record<string, unknown>;
        if (record.type === "thinking" || record.type === "redacted_thinking") {
          delete record.cache_control;
        }
      }
    }
  }
}
