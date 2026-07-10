type CacheRetention = "none" | "short" | "long";
export declare function isGooglePromptCacheEligible(params: {
  modelApi?: string;
  modelId?: string;
}): boolean;
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
export declare function isOpenRouterGoogleCacheEligible(params: {
  provider?: string;
  modelId?: string;
}): boolean;
/**
 * Returns true for OpenAI/GPT models routed via OpenRouter, where OpenAI
 * automatically applies implicit prefix caching on inputs ≥ 1,024 tokens.
 * Recognises both plain OpenAI provider references and OpenRouter-proxied
 * GPT model IDs (including the `~openai/` always-latest alias form).
 */
export declare function isOpenAIPromptCacheEligible(params: {
  provider?: string;
  modelApi?: string;
  modelId?: string;
}): boolean;
export declare function resolveCacheRetention(
  extraParams: Record<string, unknown> | undefined,
  provider: string,
  modelApi?: string,
  modelId?: string,
): CacheRetention | undefined;
export {};
