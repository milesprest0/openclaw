import { afterEach, describe, expect, it } from "vitest";
import {
  makeIsolatedAttributionForTest,
  PREST0N_ATTRIBUTION_MARKER,
} from "./prest0n-egress-attribution.js";

// Native port of the fork patch 024 helper suite (tests/unit-egress-attribution.test.cjs
// in milesprest0/project). Every case asserts the RECEIVER contract of
// fleetModelProxy.extractAndStripBodyAttribution — keep both sides in lockstep.

afterEach(() => {
  delete process.env.PREST0N_ATTR_KIND_PATTERNS;
  delete process.env.PREST0N_ATTR_AMBIENT;
});

describe("prest0n egress attribution (native 024 port)", () => {
  it("exports the 024 marker unchanged (dist-patch interop key)", () => {
    expect(PREST0N_ATTRIBUTION_MARKER).toBe("PREST0N_EGRESS_ATTR_FORK_PATCH_024");
  });

  it("subagent id derives kind/label/turn-class defaults", () => {
    const api = makeIsolatedAttributionForTest();
    const h = api.headersFor({ sessionId: "agent:main:subagent:ab1a3c69" });
    expect(h["X-Prest0n-Session-Id"]).toBe("agent:main:subagent:ab1a3c69");
    expect(h["X-Prest0n-Session-Kind"]).toBe("subagent");
    expect(h["X-Prest0n-Task-Label"]).toBe("subagent-default");
    expect(h["X-Prest0n-Turn-Class"]).toBe("interactive");
  });

  it("orchestrator main derives vm-orchestrator (subagent pattern checked BEFORE main)", () => {
    const api = makeIsolatedAttributionForTest();
    expect(api.headersFor({ sessionId: "agent:main:main" })["X-Prest0n-Task-Label"]).toBe(
      "vm-orchestrator",
    );
    // `agent:main:subagent:x` contains `main` but must classify subagent.
    expect(api.deriveKind("agent:main:subagent:x")).toBe("subagent");
  });

  it("cron and heartbeat ids map their kinds and turn classes", () => {
    const api = makeIsolatedAttributionForTest();
    const cron = api.headersFor({ sessionId: "agent:main:cron:daily" });
    expect(cron["X-Prest0n-Session-Kind"]).toBe("cron");
    expect(cron["X-Prest0n-Turn-Class"]).toBe("cron");
    const hb = api.headersFor({ sessionId: "heartbeat-runner" });
    expect(hb["X-Prest0n-Session-Kind"]).toBe("heartbeat");
    expect(hb["X-Prest0n-Task-Label"]).toBe("vm-heartbeat");
    expect(hb["X-Prest0n-Turn-Class"]).toBe("heartbeat");
  });

  it("indeterminate id shape → session id only, no kind/label guesses", () => {
    const api = makeIsolatedAttributionForTest();
    const h = api.headersFor({ sessionId: "3f7c9a2e-1b40-4b1c-9a11-000000000001" });
    expect(h["X-Prest0n-Session-Id"]).toBe("3f7c9a2e-1b40-4b1c-9a11-000000000001");
    expect("X-Prest0n-Session-Kind" in h).toBe(false);
    expect("X-Prest0n-Task-Label" in h).toBe(false);
  });

  it("no sessionId → {} (ambient slot never engages without opt-in)", () => {
    const api = makeIsolatedAttributionForTest();
    api.noteCurrentSession("agent:main:main");
    expect(api.headersFor({})).toEqual({});
    expect(api.headersFor(undefined)).toEqual({});
  });

  it("ambient fallback engages only under PREST0N_ATTR_AMBIENT=1", () => {
    const api = makeIsolatedAttributionForTest();
    api.noteCurrentSession("agent:main:main");
    process.env.PREST0N_ATTR_AMBIENT = "1";
    expect(api.headersFor({})["X-Prest0n-Task-Label"]).toBe("vm-orchestrator");
  });

  it("noteCurrentSession is an identity passthrough incl. non-strings", () => {
    const api = makeIsolatedAttributionForTest();
    expect(api.noteCurrentSession("s-1")).toBe("s-1");
    expect(api.noteCurrentSession(undefined)).toBe(undefined);
    const o = { x: 1 };
    expect(api.noteCurrentSession(o)).toBe(o);
  });

  it("registerSession label wins over kind default; merge semantics on re-register", () => {
    const api = makeIsolatedAttributionForTest();
    expect(api.registerSession({ sessionId: "agent:main:subagent:d34db33f", taskLabel: "deep-research" })).toBe(true);
    expect(api.headersFor({ sessionId: "agent:main:subagent:d34db33f" })["X-Prest0n-Task-Label"]).toBe("deep-research");
    api.registerSession({ sessionId: "agent:main:subagent:d34db33f", turnClass: "cron" });
    const h = api.headersFor({ sessionId: "agent:main:subagent:d34db33f" });
    expect(h["X-Prest0n-Task-Label"]).toBe("deep-research"); // merged, not replaced
    expect(h["X-Prest0n-Turn-Class"]).toBe("cron");
  });

  it("registered kind wins for shape-indeterminate ids (transcript UUIDs) and drives label defaults", () => {
    // The embedded runner registers the routing-key-derived kind under the
    // transcript UUID (attempt.ts run start) — transports only see the UUID.
    const api = makeIsolatedAttributionForTest();
    const uuid = "0198d2f0-1111-7000-8000-00000000abcd";
    expect(api.deriveKind(uuid)).toBeUndefined(); // UUID matches no pattern
    api.registerSession({ sessionId: uuid, kind: "orchestrator" });
    const h = api.headersFor({ sessionId: uuid });
    expect(h["X-Prest0n-Session-Id"]).toBe(uuid);
    expect(h["X-Prest0n-Session-Kind"]).toBe("orchestrator");
    expect(h["X-Prest0n-Task-Label"]).toBe("vm-orchestrator"); // kind-default label
    const f = api.bodyFieldsFor({ sessionId: uuid });
    expect(f.prest0n_session_kind).toBe("orchestrator");
  });

  it("registry substring lookup matches key↔id containment (longest key wins), short keys excluded", () => {
    const api = makeIsolatedAttributionForTest();
    api.registerSession({ sessionId: "subagent:ab1a3c69", taskLabel: "short-key-label" });
    expect(api.headersFor({ sessionId: "agent:main:subagent:ab1a3c69" })["X-Prest0n-Task-Label"]).toBe(
      "short-key-label",
    );
    api.registerSession({ sessionId: "main:s", taskLabel: "too-short" }); // 6 chars — below the 8-char witness floor
    expect(api.headersFor({ sessionId: "agent:main:subagent:zz" })["X-Prest0n-Task-Label"]).toBe(
      "subagent-default",
    );
  });

  it("non-conforming values are OMITTED, never sanitized (charset + length caps)", () => {
    const api = makeIsolatedAttributionForTest();
    api.registerSession({ sessionId: "agent:main:subagent:bad1", taskLabel: "has spaces!" });
    const h = api.headersFor({ sessionId: "agent:main:subagent:bad1" });
    expect("X-Prest0n-Task-Label" in h).toBe(false);
    const longId = `agent:main:subagent:${"x".repeat(64)}`; // > 64 total
    expect("X-Prest0n-Session-Id" in api.headersFor({ sessionId: longId })).toBe(false);
  });

  it("registry evicts oldest past the 1024 cap", () => {
    const api = makeIsolatedAttributionForTest();
    for (let i = 0; i < 1030; i += 1) {
      api.registerSession({ sessionId: `agent:main:subagent:cap-${String(i).padStart(4, "0")}`, taskLabel: "capped" });
    }
    expect(api._state.registry.size).toBe(1024);
    expect(api._state.registry.has("agent:main:subagent:cap-0000")).toBe(false);
    expect(api._state.registry.has("agent:main:subagent:cap-1029")).toBe(true);
  });

  it("eviction is least-recently-USED, so a hot long-lived session survives the cap", () => {
    const api = makeIsolatedAttributionForTest();
    const hot = "agent:main:subagent:hot-00000001";
    api.registerSession({ sessionId: hot, taskLabel: "long-lived" });
    for (let i = 0; i < 1023; i += 1) {
      api.registerSession({
        sessionId: `agent:main:subagent:fill-${String(i).padStart(4, "0")}`,
        taskLabel: "filler",
      });
      // Keep the first-registered session hot; FIFO would still evict it first.
      api.headersFor({ sessionId: hot });
    }
    api.registerSession({ sessionId: "agent:main:subagent:overflow-1", taskLabel: "last" });
    expect(api._state.registry.size).toBe(1024);
    expect(api._state.registry.has(hot)).toBe(true);
    expect(api.headersFor({ sessionId: hot })["X-Prest0n-Task-Label"]).toBe("long-lived");
  });

  it("env kind patterns prepend and validate; bad JSON ignored", () => {
    process.env.PREST0N_ATTR_KIND_PATTERNS = JSON.stringify([
      { pattern: "^voice-", kind: "cron" },
      { pattern: "^bogus", kind: "not-a-kind" },
    ]);
    const api = makeIsolatedAttributionForTest();
    expect(api.deriveKind("voice-session-7")).toBe("cron");
    expect(api.deriveKind("bogus-1")).toBeUndefined();
    process.env.PREST0N_ATTR_KIND_PATTERNS = "not json";
    const api2 = makeIsolatedAttributionForTest();
    expect(api2.deriveKind("agent:main:main")).toBe("orchestrator"); // builtin patterns still active
  });

  it("bodyFieldsFor mirrors headersFor as prest0n_* body keys", () => {
    const api = makeIsolatedAttributionForTest();
    const f = api.bodyFieldsFor({ sessionId: "agent:main:main" });
    expect(f).toEqual({
      prest0n_session_id: "agent:main:main",
      prest0n_session_kind: "orchestrator",
      prest0n_task_label: "vm-orchestrator",
      prest0n_turn_class: "interactive",
    });
    for (const v of Object.values(f)) expect(typeof v).toBe("string"); // OpenAI metadata: string→string
  });

  it("stampBody mutates metadata in place, preserves existing keys, returns the SAME object", () => {
    const api = makeIsolatedAttributionForTest();
    const body = { model: "m", metadata: { user_id: "u-1" } as Record<string, string> };
    const out = api.stampBody(body, { sessionId: "agent:main:main" });
    expect(out).toBe(body);
    expect(body.metadata.user_id).toBe("u-1");
    expect(body.metadata.prest0n_task_label).toBe("vm-orchestrator");
  });

  it("stampBody with no derivable fields returns the body UNTOUCHED (no empty metadata created)", () => {
    const api = makeIsolatedAttributionForTest();
    const body: { model: string; metadata?: Record<string, string> } = { model: "m" };
    expect(api.stampBody(body, {})).toBe(body);
    expect("metadata" in body).toBe(false);
  });

  it("stampBody fail-open on non-object bodies and clobbered metadata shapes", () => {
    const api = makeIsolatedAttributionForTest();
    expect(api.stampBody(null as never, { sessionId: "agent:main:main" })).toBe(null);
    expect(api.stampBody("str" as never, { sessionId: "agent:main:main" })).toBe("str");
    const arr: unknown[] = [];
    expect(api.stampBody(arr as never, { sessionId: "agent:main:main" })).toBe(arr);
    const weird = { model: "m", metadata: [1, 2] as unknown };
    api.stampBody(weird as never, { sessionId: "agent:main:main" });
    expect(Array.isArray(weird.metadata)).toBe(false); // replaced with a proper map, then stamped
    expect((weird.metadata as Record<string, string>).prest0n_task_label).toBe("vm-orchestrator");
  });
});
