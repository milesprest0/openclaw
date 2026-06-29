import { describe, expect, it } from "vitest";
import {
  isGooglePromptCacheEligible,
  isOpenRouterGoogleCacheEligible,
  resolveCacheRetention,
} from "./prompt-cache-retention.js";

describe("prompt cache retention", () => {
  it("passes explicit cacheRetention through for direct Google models", () => {
    expect(
      resolveCacheRetention(
        { cacheRetention: "long" },
        "google",
        "google-generative-ai",
        "gemini-3.1-pro-preview",
      ),
    ).toBe("long");
  });

  it("maps legacy cacheControlTtl for direct Google models", () => {
    expect(
      resolveCacheRetention(
        { cacheControlTtl: "5m" },
        "google",
        "google-generative-ai",
        "gemini-2.5-flash",
      ),
    ).toBe("short");
  });

  it("does not default cacheRetention for direct Google models without explicit config", () => {
    expect(
      resolveCacheRetention(undefined, "google", "google-generative-ai", "gemini-3.1-pro-preview"),
    ).toBeUndefined();
  });

  it("identifies supported direct Google cache families", () => {
    expect(
      isGooglePromptCacheEligible({
        modelApi: "google-generative-ai",
        modelId: "gemini-3.1-pro-preview",
      }),
    ).toBe(true);
    expect(
      isGooglePromptCacheEligible({
        modelApi: "google-generative-ai",
        modelId: "gemini-2.5-flash",
      }),
    ).toBe(true);
    expect(
      isGooglePromptCacheEligible({
        modelApi: "google-generative-ai",
        modelId: "gemini-live-2.5-flash-preview",
      }),
    ).toBe(false);
  });

  describe("isOpenRouterGoogleCacheEligible", () => {
    it("matches OpenRouter-routed gemini-2.5 / gemini-3 families", () => {
      expect(
        isOpenRouterGoogleCacheEligible({
          provider: "openrouter",
          modelId: "google/gemini-3.5-flash",
        }),
      ).toBe(true);
      expect(
        isOpenRouterGoogleCacheEligible({
          provider: "openrouter",
          modelId: "google/gemini-2.5-pro",
        }),
      ).toBe(true);
    });

    it("tolerates the ~ always-latest alias prefix and bare gemini ids", () => {
      expect(
        isOpenRouterGoogleCacheEligible({
          provider: "openrouter",
          modelId: "~google/gemini-3-pro",
        }),
      ).toBe(true);
      expect(
        isOpenRouterGoogleCacheEligible({ provider: "openrouter", modelId: "gemini-3.5-flash" }),
      ).toBe(true);
    });

    it("rejects non-OpenRouter providers and non-Gemini / older families", () => {
      expect(
        isOpenRouterGoogleCacheEligible({ provider: "google", modelId: "google/gemini-3.5-flash" }),
      ).toBe(false);
      expect(
        isOpenRouterGoogleCacheEligible({
          provider: "openrouter",
          modelId: "google/gemini-1.5-flash",
        }),
      ).toBe(false);
      expect(
        isOpenRouterGoogleCacheEligible({ provider: "openrouter", modelId: "openai/gpt-5.5" }),
      ).toBe(false);
      expect(isOpenRouterGoogleCacheEligible({})).toBe(false);
    });
  });
});
