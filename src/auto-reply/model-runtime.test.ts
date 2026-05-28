import { describe, expect, test } from "vitest";
import { resolveSelectedAndActiveModel } from "./model-runtime.js";

describe("resolveSelectedAndActiveModel — always-latest alias guard", () => {
  test("recorded concrete model does NOT shadow an always-latest alias selection (~ sigil on provider)", () => {
    const r = resolveSelectedAndActiveModel({
      selectedProvider: "openrouter",
      selectedModel: "~anthropic/claude-opus-latest",
      sessionEntry: { modelProvider: "anthropic", model: "claude-opus-4-7" },
    });
    // active must track the alias selection, not the stale concrete snapshot
    expect(r.active.label.toLowerCase()).toContain("latest");
    expect(r.active.label).not.toContain("4-7");
    expect(r.activeDiffers).toBe(false);
  });

  test("recorded concrete model does NOT shadow a `-latest` suffix selection", () => {
    const r = resolveSelectedAndActiveModel({
      selectedProvider: "anthropic",
      selectedModel: "claude-opus-latest",
      sessionEntry: { modelProvider: "anthropic", model: "claude-opus-4-7" },
    });
    expect(r.active.model).toBe("claude-opus-latest");
    expect(r.active.model).not.toContain("4-7");
    expect(r.activeDiffers).toBe(false);
  });

  test("embedded `/~` always-latest ref is detected", () => {
    const r = resolveSelectedAndActiveModel({
      selectedProvider: "openrouter",
      selectedModel: "openrouter/~anthropic/claude-opus-latest",
      sessionEntry: { modelProvider: "anthropic", model: "claude-opus-4-6" },
    });
    expect(r.active.label.toLowerCase()).toContain("latest");
    expect(r.active.label).not.toContain("4-6");
  });

  test("plain `latest` model id is treated as always-latest", () => {
    const r = resolveSelectedAndActiveModel({
      selectedProvider: "anthropic",
      selectedModel: "latest",
      sessionEntry: { modelProvider: "anthropic", model: "claude-opus-4-7" },
    });
    expect(r.active.model).toBe("latest");
  });
});

describe("resolveSelectedAndActiveModel — legacy concrete behavior preserved", () => {
  test("recorded runtime model STILL becomes active for a concrete (non-latest) selection", () => {
    // This is the original behavior and must be preserved: a heartbeat/fallback
    // that left the session on a different concrete model should still surface
    // as the active model when the selection itself is concrete.
    const r = resolveSelectedAndActiveModel({
      selectedProvider: "openrouter",
      selectedModel: "anthropic/claude-opus-4-7",
      sessionEntry: { modelProvider: "google", model: "gemini-3.1-pro-preview" },
    });
    expect(r.active.model).toBe("gemini-3.1-pro-preview");
    expect(r.active.provider).toBe("google");
    expect(r.activeDiffers).toBe(true);
  });

  test("no recorded runtime model -> active falls back to selected (concrete)", () => {
    const r = resolveSelectedAndActiveModel({
      selectedProvider: "anthropic",
      selectedModel: "claude-opus-4-7",
      sessionEntry: undefined,
    });
    expect(r.active.model).toBe("claude-opus-4-7");
    expect(r.activeDiffers).toBe(false);
  });

  test("no recorded runtime model -> active falls back to selected (always-latest)", () => {
    const r = resolveSelectedAndActiveModel({
      selectedProvider: "openrouter",
      selectedModel: "~anthropic/claude-opus-latest",
      sessionEntry: { modelProvider: undefined, model: undefined },
    });
    expect(r.active.label.toLowerCase()).toContain("latest");
    expect(r.activeDiffers).toBe(false);
  });

  test("concrete selection with matching recorded runtime model -> activeDiffers false", () => {
    const r = resolveSelectedAndActiveModel({
      selectedProvider: "anthropic",
      selectedModel: "claude-opus-4-7",
      sessionEntry: { modelProvider: "anthropic", model: "claude-opus-4-7" },
    });
    expect(r.active.model).toBe("claude-opus-4-7");
    expect(r.activeDiffers).toBe(false);
  });
});
