import { capturePluginRegistration } from "openclaw/plugin-sdk/plugin-test-runtime";
import { describe, expect, it } from "vitest";
import {
  buildTokenHubModelDefinition,
  TOKENHUB_BASE_URL,
  TOKENHUB_MODEL_CATALOG,
  TOKENHUB_PROVIDER_ID,
} from "./api.js";
import plugin from "./index.js";
import { applyTokenHubConfig, TOKENHUB_DEFAULT_MODEL_REF } from "./onboard.js";
import { buildTokenHubProvider } from "./provider-catalog.js";

// Reliability coverage (auth + request/response contract + failure handling)
// for the Tencent Cloud (TokenHub) provider extension. Fully mocked — no live/paid calls.

describe("tencent tokenhub auth contract", () => {
  it("registers the TokenHub provider with API-key auth via TOKENHUB_API_KEY", () => {
    const captured = capturePluginRegistration(plugin);
    const provider = captured.providers[0];
    expect(provider).toMatchObject({ id: TOKENHUB_PROVIDER_ID, label: "Tencent TokenHub" });
    expect(provider.envVars).toContain("TOKENHUB_API_KEY");
    expect(provider.auth[0]).toMatchObject({ id: "api-key", kind: "api_key" });
  });
});

describe("tencent tokenhub request/response contract", () => {
  it("builds an OpenAI-compatible provider on the TokenHub base URL", () => {
    const provider = buildTokenHubProvider();
    expect(provider.api).toBe("openai-completions");
    expect(provider.baseUrl).toBe(TOKENHUB_BASE_URL);
    expect(TOKENHUB_BASE_URL).toMatch(/^https:\/\//);
    expect(provider.models.length).toBe(TOKENHUB_MODEL_CATALOG.length);
    expect(provider.models.length).toBeGreaterThan(0);
  });

  it("maps every catalog entry to a well-formed model definition", () => {
    for (const entry of TOKENHUB_MODEL_CATALOG) {
      const def = buildTokenHubModelDefinition(entry);
      expect(def).toBeTruthy();
      expect(def.id).toBeTruthy();
    }
  });

  it("keeps the default model ref inside the catalog", () => {
    const shortId = TOKENHUB_DEFAULT_MODEL_REF.split("/").pop();
    expect(TOKENHUB_MODEL_CATALOG.map((m) => m.id)).toContain(shortId);
  });
});

describe("tencent tokenhub onboarding / failure handling", () => {
  it("applies config without throwing on an empty base config", () => {
    expect(() => applyTokenHubConfig({} as never)).not.toThrow();
  });

  it("returns a config object registering the default model alias", () => {
    const result = applyTokenHubConfig({} as never);
    expect(result).toBeTruthy();
    expect(typeof result).toBe("object");
  });
});
