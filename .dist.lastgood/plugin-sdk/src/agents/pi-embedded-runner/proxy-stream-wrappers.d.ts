import type { StreamFn } from "@mariozechner/pi-agent-core";
import type { ThinkLevel } from "../../auto-reply/thinking.js";
import type { AnthropicHistoryCacheBreakpointsMode } from "../anthropic-payload-policy.js";
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
export declare function createOpenRouterSystemCacheWrapper(
  baseStreamFn: StreamFn | undefined,
  wrapperOptions?: OpenRouterSystemCacheWrapperOptions,
): StreamFn;
export declare function createOpenRouterWrapper(
  baseStreamFn: StreamFn | undefined,
  thinkingLevel?: ThinkLevel,
  extraParams?: Record<string, unknown>,
): StreamFn;
export declare function isProxyReasoningUnsupported(modelId: string): boolean;
export declare function createKilocodeWrapper(
  baseStreamFn: StreamFn | undefined,
  thinkingLevel?: ThinkLevel,
): StreamFn;
