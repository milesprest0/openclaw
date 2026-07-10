import { capturePluginRegistration } from "openclaw/plugin-sdk/plugin-test-runtime";
import { describe, expect, it, vi } from "vitest";
import plugin from "./index.js";

// Reliability coverage for the Copilot Proxy (local VS Code LM) provider.
// Fully mocked — exercises the local-auth onboarding contract without any network.

function findLocalAuth() {
  const captured = capturePluginRegistration(plugin);
  const provider = captured.providers.find((p) => p.id === "copilot-proxy");
  expect(provider, "copilot-proxy provider should be registered").toBeTruthy();
  const method = provider!.auth.find((a: { id: string }) => a.id === "local");
  expect(method, "local auth method should exist").toBeTruthy();
  return method as { kind: string; run: (ctx: unknown) => Promise<Record<string, unknown>> };
}

function makePrompter(baseUrl: string, models: string) {
  const answers = [baseUrl, models];
  let call = 0;
  return {
    prompter: {
      text: vi.fn(async (opts: { validate?: (v: string) => string | undefined }) => {
        const value = answers[call++];
        // Exercise the provided validators to lock the request contract.
        if (opts.validate) expect(opts.validate(value)).toBeUndefined();
        return value;
      }),
    },
  };
}

describe("copilot-proxy auth contract", () => {
  it("registers a local (custom-kind) auth method", () => {
    const method = findLocalAuth();
    expect(method.kind).toBe("custom");
  });
});

describe("copilot-proxy request/response contract", () => {
  it("normalizes the base URL to include /v1 and parses comma-separated models", async () => {
    const method = findLocalAuth();
    const result = await method.run(makePrompter("http://localhost:8080", "modelA, modelB"));
    const patch = result.configPatch as {
      models: {
        providers: { "copilot-proxy": { baseUrl: string; api: string; models: unknown[] } };
      };
    };
    const cfg = patch.models.providers["copilot-proxy"];
    expect(cfg.baseUrl).toBe("http://localhost:8080/v1");
    expect(cfg.api).toBe("openai-completions");
    expect(cfg.models.length).toBe(2);
    expect(result.defaultModel).toBe("copilot-proxy/modelA");
  });

  it("dedupes duplicate model ids from the input", async () => {
    const method = findLocalAuth();
    const result = await method.run(makePrompter("http://host/v1/", "dup, dup, other"));
    const patch = result.configPatch as {
      models: { providers: { "copilot-proxy": { baseUrl: string; models: unknown[] } } };
    };
    expect(patch.models.providers["copilot-proxy"].models.length).toBe(2);
    // Trailing slash normalized, /v1 preserved.
    expect(patch.models.providers["copilot-proxy"].baseUrl).toBe("http://host/v1");
  });
});

describe("copilot-proxy failure handling", () => {
  it("issues an offline credential token and includes startup notes", async () => {
    const method = findLocalAuth();
    const result = await method.run(makePrompter("http://localhost:3000", "gpt-5.2"));
    const profiles = result.profiles as Array<{ credential: { token: string } }>;
    expect(profiles[0].credential.token).toBe("n/a");
    expect((result.notes as string[]).some((n) => n.includes("/v1"))).toBe(true);
  });
});
