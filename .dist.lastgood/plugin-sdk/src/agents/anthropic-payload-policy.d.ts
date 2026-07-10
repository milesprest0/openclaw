export type AnthropicServiceTier = "auto" | "standard_only";
export type AnthropicEphemeralCacheControl = {
  type: "ephemeral";
  ttl?: "1h";
};
export type AnthropicHistoryCacheBreakpointsMode = "off" | "shadow" | "on";
export type AnthropicHistoryCacheBreakpointsDiagnostics = {
  lastFrozenIdx: number | null;
  lastStableWarmIdx: number | null;
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
export declare function resolveAnthropicPayloadPolicy(
  input: AnthropicPayloadPolicyInput,
): AnthropicPayloadPolicy;
export declare function applyAnthropicPayloadPolicyToParams(
  payloadObj: Record<string, unknown>,
  policy: AnthropicPayloadPolicy,
  options?: AnthropicEphemeralCacheMarkerOptions,
): void;
export type AnthropicEphemeralCacheMarkerOptions = {
  /**
   * When "1h", emit a long-retention ephemeral cache marker
   * ({ type: "ephemeral", ttl: "1h" }). Defaults to the short (5m) ephemeral
   * marker. Phase 2 (TTL alignment) threads this in per-surface; callers that
   * pass nothing keep the conservative 5m default.
   */
  ttl?: "1h";
  /**
   * Phase 2a history cache breakpoints.
   * - off (default): no history marker changes.
   * - shadow: compute [3]/[4] candidates and emit diagnostics only.
   * - on: place [3]/[4] when a frozen boundary is present.
   */
  historyBreakpoints?: AnthropicHistoryCacheBreakpointsMode;
  onHistoryBreakpointsComputed?: (diagnostics: AnthropicHistoryCacheBreakpointsDiagnostics) => void;
};
export declare function applyAnthropicEphemeralCacheControlMarkers(
  payloadObj: Record<string, unknown>,
  options?: AnthropicEphemeralCacheMarkerOptions,
): void;
export {};
