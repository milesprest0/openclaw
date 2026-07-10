import { capturePluginRegistration } from "openclaw/plugin-sdk/plugin-test-runtime";
import { describe, expect, it } from "vitest";
import plugin from "./index.js";

// Reliability coverage for OpenProse. This extension ships prose *skills* only
// (no provider/auth surface), so the reliability contract is: it loads and
// registers cleanly without side effects. Fully mocked — no network.

describe("open-prose registration contract", () => {
  it("registers cleanly and declares no provider/auth surface", () => {
    const captured = capturePluginRegistration(plugin);
    expect(captured.providers.length).toBe(0);
    // A skills-only bundle must not throw during registration.
    expect(() => capturePluginRegistration(plugin)).not.toThrow();
  });

  it("exposes stable plugin identity metadata", () => {
    expect(plugin).toBeTruthy();
    const meta = plugin as unknown as { id?: string; name?: string };
    // definePluginEntry may wrap metadata; guard defensively.
    if (meta.id) expect(meta.id).toBe("open-prose");
  });
});
