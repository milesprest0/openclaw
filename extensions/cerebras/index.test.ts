import { capturePluginRegistration } from "openclaw/plugin-sdk/plugin-test-runtime";
import { describe, expect, it } from "vitest";
import { buildCerebrasModelDefinition, CEREBRAS_BASE_URL, CEREBRAS_MODEL_CATALOG } from "./api.js";
import plugin from "./index.js";
import { applyCerebrasConfig, CEREBRAS_DEFAULT_MODEL_REF } from "./onboard.js";
import { buildCerebrasProvider } from "./provider-catalog.js";

// Reliability coverage (auth + request/response contract + failure handling)
// for the Cerebras provider extension. Fully mocked — no live/paid calls.
describe("cerebras provider registration (auth contract)", () => {
  it("registers the Cerebras provider with the API-key auth method", () => {
    const captured = capturePluginRegistration(plugin);
    const provider = captured.providers[0];
    expect(provider).toMatchObject({ id: "cerebras", label: "Cerebras" });
    // Authentication contract: API key via CEREBRAS_API_KEY env var.
    expect(JSON.stringify(provider)).toContain("CEREBRAS_API_KEY");
  });
});

describe("cerebras request/response contract", () => {
  it("builds an OpenAI-compatible provider pointed at the Cerebras base URL", () => {
    const provider = buildCerebrasProvider();
    expect(provider.api).toBe("openai-completions");
    expect(provider.baseUrl).toBe(CEREBRAS_BASE_URL);
    expect(CEREBRAS_BASE_URL).toMatch(/^https:\/\//);
    expect(provider.models.length).toBe(CEREBRAS_MODEL_CATALOG.length);
    expect(provider.models.length).toBeGreaterThan(0);
  });

  it("maps every catalog model to a well-formed model definition", () => {
    for (const model of CEREBRAS_MODEL_CATALOG) {
      const def = buildCerebrasModelDefinition(model);
      expect(def).toBeTruthy();
      expect(def.id).toBeTruthy();
    }
  });

  it("exposes the default model ref inside the catalog", () => {
    const shortId = CEREBRAS_DEFAULT_MODEL_REF.split("/").pop();
    const ids = CEREBRAS_MODEL_CATALOG.map((m) => m.id);
    expect(ids).toContain(shortId);
  });
});

describe("cerebras onboarding / failure handling", () => {
  it("applies preset config without throwing on an empty base config", () => {
    // Missing/empty upstream config must not crash the applier.
    expect(() => applyCerebrasConfig({} as never)).not.toThrow();
  });

  it("returns a config object rather than mutating undefined", () => {
    const result = applyCerebrasConfig({} as never);
    expect(result).toBeTruthy();
    expect(typeof result).toBe("object");
  });
});
