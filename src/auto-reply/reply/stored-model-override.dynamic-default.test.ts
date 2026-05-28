import { describe, it, expect } from "vitest";
import type { SessionEntry } from "../../config/sessions/types.js";
import {
  isModelOverrideStillAuthoritative,
  resolveStoredModelOverride,
  MODEL_OVERRIDE_AUTO_TTL_MS,
} from "./stored-model-override.js";

const NOW = 1_780_000_000_000;

function entry(partial: Partial<SessionEntry>): SessionEntry {
  return partial as SessionEntry;
}

describe("isModelOverrideStillAuthoritative (dynamic default resolution)", () => {
  it("treats a user override as always authoritative (never expires)", () => {
    expect(
      isModelOverrideStillAuthoritative({
        modelOverride: "openrouter/~anthropic/claude-opus-latest",
        modelOverrideSource: "user",
        modelOverrideAt: NOW - 10 * MODEL_OVERRIDE_AUTO_TTL_MS,
        nowMs: NOW,
      }),
    ).toBe(true);
  });

  it("treats a legacy (untracked-source) override as user-driven", () => {
    expect(
      isModelOverrideStillAuthoritative({
        modelOverride: "openrouter/openai/gpt-5.5",
        modelOverrideSource: undefined,
        nowMs: NOW,
      }),
    ).toBe(true);
  });

  it("keeps a FRESH auto pin authoritative within the TTL window", () => {
    expect(
      isModelOverrideStillAuthoritative({
        modelOverride: "openrouter/x-ai/grok-4.3",
        modelOverrideSource: "auto",
        modelOverrideAt: NOW - 5 * 60 * 1000, // 5 min ago
        nowMs: NOW,
      }),
    ).toBe(true);
  });

  it("EXPIRES a stale auto pin past the TTL window (re-resolve default)", () => {
    expect(
      isModelOverrideStillAuthoritative({
        modelOverride: "openrouter/anthropic/claude-opus-4-7",
        modelOverrideSource: "auto",
        modelOverrideAt: NOW - (MODEL_OVERRIDE_AUTO_TTL_MS + 60_000), // just past TTL
        nowMs: NOW,
      }),
    ).toBe(false);
  });

  it("EXPIRES a legacy auto pin with no timestamp (re-resolve default)", () => {
    expect(
      isModelOverrideStillAuthoritative({
        modelOverride: "openrouter/anthropic/claude-opus-4-7",
        modelOverrideSource: "auto",
        modelOverrideAt: undefined,
        nowMs: NOW,
      }),
    ).toBe(false);
  });

  it("with ttlMs=0 always re-resolves auto pins", () => {
    expect(
      isModelOverrideStillAuthoritative({
        modelOverride: "openrouter/anthropic/claude-opus-4-7",
        modelOverrideSource: "auto",
        modelOverrideAt: NOW, // brand new
        nowMs: NOW,
        ttlMs: 0,
      }),
    ).toBe(false);
  });

  it("returns false when there is no override at all", () => {
    expect(isModelOverrideStillAuthoritative({ modelOverride: undefined, nowMs: NOW })).toBe(false);
  });
});

describe("resolveStoredModelOverride honors the auto-pin TTL", () => {
  it("returns null for a stale auto pin so the live default is used", () => {
    const stale = entry({
      modelOverride: "openrouter/anthropic/claude-opus-4-7",
      providerOverride: "openrouter",
      modelOverrideSource: "auto",
      modelOverrideAt: NOW - 10 * MODEL_OVERRIDE_AUTO_TTL_MS,
    });
    const result = resolveStoredModelOverride({
      sessionEntry: stale,
      defaultProvider: "openrouter",
    });
    expect(result).toBeNull();
  });

  it("returns the override for a user pin even if very old", () => {
    const userPin = entry({
      modelOverride: "anthropic/claude-opus-latest",
      providerOverride: "openrouter",
      modelOverrideSource: "user",
      modelOverrideAt: NOW - 10 * MODEL_OVERRIDE_AUTO_TTL_MS,
    });
    const result = resolveStoredModelOverride({
      sessionEntry: userPin,
      defaultProvider: "openrouter",
    });
    expect(result?.model).toBeTruthy();
    expect(result?.source).toBe("session");
  });
});
