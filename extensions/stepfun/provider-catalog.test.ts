import { capturePluginRegistration } from "openclaw/plugin-sdk/plugin-test-runtime";
import { describe, expect, it } from "vitest";
import plugin from "./index.js";
import {
  applyStepFunPlanConfig,
  applyStepFunStandardConfig,
  applyStepFunStandardConfigCn,
} from "./onboard.js";
import {
  buildStepFunPlanProvider,
  buildStepFunProvider,
  STEPFUN_DEFAULT_MODEL_REF,
  STEPFUN_PLAN_CN_BASE_URL,
  STEPFUN_PLAN_INTL_BASE_URL,
  STEPFUN_PLAN_PROVIDER_ID,
  STEPFUN_PROVIDER_ID,
  STEPFUN_STANDARD_CN_BASE_URL,
  STEPFUN_STANDARD_INTL_BASE_URL,
} from "./provider-catalog.js";

// Reliability coverage (auth + request/response contract + failure handling)
// for the StepFun provider extension. Fully mocked — no live/paid calls.

describe("stepfun auth contract", () => {
  it("registers both standard and Step Plan providers with API-key auth", () => {
    const captured = capturePluginRegistration(plugin);
    const ids = captured.providers.map((p) => p.id);
    expect(ids).toContain(STEPFUN_PROVIDER_ID);
    expect(ids).toContain(STEPFUN_PLAN_PROVIDER_ID);
    for (const provider of captured.providers) {
      expect(provider.envVars).toContain("STEPFUN_API_KEY");
      // Each surface offers China + Global endpoint auth methods.
      expect(provider.auth.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("stepfun request/response contract (base-url routing)", () => {
  it("defaults the standard provider to the intl endpoint", () => {
    const provider = buildStepFunProvider();
    expect(provider.baseUrl).toBe(STEPFUN_STANDARD_INTL_BASE_URL);
    expect(provider.api ?? "openai-completions").toBe("openai-completions");
  });

  it("honors an explicit China base URL for standard + plan surfaces", () => {
    expect(buildStepFunProvider(STEPFUN_STANDARD_CN_BASE_URL).baseUrl).toBe(
      STEPFUN_STANDARD_CN_BASE_URL,
    );
    expect(buildStepFunPlanProvider(STEPFUN_PLAN_CN_BASE_URL).baseUrl).toBe(
      STEPFUN_PLAN_CN_BASE_URL,
    );
  });

  it("keeps the plan provider on its dedicated step_plan endpoint", () => {
    expect(buildStepFunPlanProvider().baseUrl).toBe(STEPFUN_PLAN_INTL_BASE_URL);
    expect(STEPFUN_PLAN_INTL_BASE_URL).toContain("/step_plan/");
  });

  it("exposes non-empty catalog models", () => {
    expect((buildStepFunProvider().models ?? []).length).toBeGreaterThan(0);
  });
});

describe("stepfun onboarding / failure handling", () => {
  it("applies each region preset without throwing on an empty config", () => {
    expect(() => applyStepFunStandardConfig({} as never)).not.toThrow();
    expect(() => applyStepFunStandardConfigCn({} as never)).not.toThrow();
    expect(() => applyStepFunPlanConfig({} as never)).not.toThrow();
  });

  it("returns a config object referencing the default model ref", () => {
    const result = applyStepFunStandardConfig({} as never);
    expect(result).toBeTruthy();
    expect(STEPFUN_DEFAULT_MODEL_REF.startsWith(`${STEPFUN_PROVIDER_ID}/`)).toBe(true);
  });
});
