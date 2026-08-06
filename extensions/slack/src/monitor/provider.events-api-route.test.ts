/**
 * PRE-172 Phase 1 gap-closure tests.
 *
 * Verifies the Slack provider mounts the Events API HTTP handler
 * (and only the right handler) for each combination of
 * `channels.slack.eventsApi.enabled` and `channels.slack.mode`.
 *
 * Coverage:
 *  - eventsApi.enabled=true + mode=socket  → only Events API route mounted
 *  - eventsApi.enabled=true + mode=http    → only Events API route mounted
 *      AND a "shadowed" warning is logged
 *  - eventsApi.enabled=false + mode=http   → legacy Bolt receiver only
 *  - eventsApi.enabled=false + mode=socket → no HTTP route mounted
 *  - inbound POST flows through to the Events API handler, signature
 *    verification rejects bad signatures with HTTP 401, and good
 *    signatures yield HTTP 200.
 */

import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { computeSlackSignatureForTest } from "../events-api/signature.js";
import { handleSlackHttpRequest } from "../http/registry.js";
import {
  getSlackTestState,
  resetSlackTestState,
  startSlackMonitor,
  stopSlackMonitor,
} from "../monitor.test-helpers.js";

const { monitorSlackProvider } = await import("./provider.js");
const slackTestState = getSlackTestState();

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

type MockReq = IncomingMessage;

function makeReq(opts: {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: string;
}): MockReq {
  const emitter = new EventEmitter() as unknown as IncomingMessage;
  Object.assign(emitter, {
    method: opts.method ?? "POST",
    url: opts.url ?? "/slack/events",
    headers: opts.headers ?? {},
    socket: { destroyed: false },
  });
  // Schedule the body emission so the consumer (which attaches listeners
  // synchronously) sees the data.
  setImmediate(() => {
    if (opts.body !== undefined && opts.body.length > 0) {
      (emitter as unknown as EventEmitter).emit("data", Buffer.from(opts.body, "utf8"));
    }
    (emitter as unknown as EventEmitter).emit("end");
  });
  return emitter;
}

type MockRes = ServerResponse & {
  capturedStatus?: number;
  capturedBody?: string;
  capturedHeaders: Record<string, string>;
};

function makeRes(): MockRes {
  const headers: Record<string, string> = {};
  const res = {
    statusCode: 200,
    headersSent: false,
    writableEnded: false,
    capturedHeaders: headers,
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = value;
    },
    getHeader(name: string) {
      return headers[name.toLowerCase()];
    },
    end(body?: string) {
      (res as MockRes).capturedStatus = res.statusCode;
      (res as MockRes).capturedBody = body ?? "";
      res.writableEnded = true;
    },
  } as unknown as MockRes;
  return res;
}

// The provider's `auth.test` call uses the Slack client. Default mock returns
// {user_id: "bot-user"}, but for these tests we don't care about team_id.

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

// The Slack HTTP route registry lives on a global Symbol; clear it between
// tests so routes registered by a previous case don't leak.
function clearSlackHttpRoutes() {
  const SLACK_HTTP_ROUTES_GLOBAL_KEY = Symbol.for("openclaw.slack.httpRoutes.v1");
  const globalStore = globalThis as Record<PropertyKey, unknown>;
  const routes = globalStore[SLACK_HTTP_ROUTES_GLOBAL_KEY];
  if (routes instanceof Map) {
    routes.clear();
  }
}

beforeEach(() => {
  resetSlackTestState();
  clearSlackHttpRoutes();
});

describe("PRE-172 Phase 1 gap closure — Slack Events API route registration", () => {
  it("eventsApi.enabled=true + mode=socket → mounts Events API at default path", async () => {
    resetSlackTestState({
      messages: { responsePrefix: "PFX" },
      channels: {
        slack: {
          dm: { enabled: true, policy: "open", allowFrom: ["*"] },
          groupPolicy: "open",
          mode: "socket",
          signingSecret: "test-secret",
          eventsApi: { enabled: true },
        },
      },
    });
    const { controller, run } = startSlackMonitor(monitorSlackProvider);
    // Give the provider a tick to run synchronous setup.
    await new Promise((r) => setTimeout(r, 5));

    const req = makeReq({
      method: "GET",
      url: "/slack/events",
      headers: {},
      body: "",
    });
    const res = makeRes();
    const handled = await handleSlackHttpRequest(req, res);

    expect(handled).toBe(true);
    // GET → 405 (Events API only accepts POST).
    expect(res.capturedStatus).toBe(405);

    await stopSlackMonitor({ controller, run });
  });

  it("eventsApi.enabled=true + mode=http → eventsApi wins; warning is logged", async () => {
    resetSlackTestState({
      messages: { responsePrefix: "PFX" },
      channels: {
        slack: {
          dm: { enabled: true, policy: "open", allowFrom: ["*"] },
          groupPolicy: "open",
          mode: "http",
          signingSecret: "test-secret",
          eventsApi: { enabled: true },
        },
      },
    });

    // The provider routes its warning through runtime.log -> console.log.
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const { controller, run } = startSlackMonitor(monitorSlackProvider);
    await new Promise((r) => setTimeout(r, 5));

    // The Events API path should be mounted and responding.
    const req = makeReq({
      method: "GET",
      url: "/slack/events",
      body: "",
    });
    const res = makeRes();
    const handled = await handleSlackHttpRequest(req, res);

    expect(handled).toBe(true);
    expect(res.capturedStatus).toBe(405);

    // Look for the precedence-warning text emitted by the provider.
    const allLogCalls = logSpy.mock.calls.map((c) => String(c[0] ?? ""));
    const precedenceWarning = allLogCalls.find((msg) =>
      msg.includes(
        'eventsApi.enabled=true takes precedence over mode="http"; legacy Bolt HTTP receiver will NOT be mounted',
      ),
    );
    expect(precedenceWarning).toBeDefined();

    logSpy.mockRestore();
    await stopSlackMonitor({ controller, run });
  });

  it("eventsApi.enabled=false + mode=socket → no Events API route mounted at /slack/events", async () => {
    resetSlackTestState({
      messages: { responsePrefix: "PFX" },
      channels: {
        slack: {
          dm: { enabled: true, policy: "open", allowFrom: ["*"] },
          groupPolicy: "open",
          mode: "socket",
          eventsApi: { enabled: false },
        },
      },
    });

    const { controller, run } = startSlackMonitor(monitorSlackProvider);
    await new Promise((r) => setTimeout(r, 5));

    const req = makeReq({ method: "GET", url: "/slack/events", body: "" });
    const res = makeRes();
    const handled = await handleSlackHttpRequest(req, res);

    expect(handled).toBe(false);

    await stopSlackMonitor({ controller, run });
  });

  it("eventsApi unset + mode=http → legacy Bolt receiver mounted (Events API NOT mounted)", async () => {
    // We can't observe the legacy receiver behaviorally without a real Bolt
    // app, but we can verify a route IS registered at /slack/events and that
    // the Events API endpoint signature does NOT control it (signature
    // verification is delegated to Bolt, which in this test will reject the
    // malformed request — we only care that *something* is mounted).
    resetSlackTestState({
      messages: { responsePrefix: "PFX" },
      channels: {
        slack: {
          dm: { enabled: true, policy: "open", allowFrom: ["*"] },
          groupPolicy: "open",
          mode: "http",
          signingSecret: "test-secret",
          // eventsApi absent → legacy path
        },
      },
    });

    const { controller, run } = startSlackMonitor(monitorSlackProvider);
    await new Promise((r) => setTimeout(r, 5));

    const req = makeReq({ method: "GET", url: "/slack/events", body: "" });
    const res = makeRes();
    const handled = await handleSlackHttpRequest(req, res);

    // Legacy Bolt receiver IS mounted.
    expect(handled).toBe(true);
    // The legacy path is the Bolt receiver, so the response will NOT be the
    // Events API endpoint's 405 — it goes through Bolt. We only assert the
    // route exists.

    await stopSlackMonitor({ controller, run });
  });

  it("Events API handler verifies signing secret on inbound POST", async () => {
    const signingSecret = "shhhh";
    resetSlackTestState({
      messages: { responsePrefix: "PFX" },
      channels: {
        slack: {
          dm: { enabled: true, policy: "open", allowFrom: ["*"] },
          groupPolicy: "open",
          mode: "socket",
          signingSecret,
          eventsApi: { enabled: true },
        },
      },
    });

    const { controller, run } = startSlackMonitor(monitorSlackProvider);
    await new Promise((r) => setTimeout(r, 5));

    const body = JSON.stringify({
      type: "url_verification",
      challenge: "challenge-abc",
    });
    const ts = String(Math.floor(Date.now() / 1000));
    const goodSig = computeSlackSignatureForTest(signingSecret, ts, body);

    // -- 1. Bad signature → 401 ---------------------------------------------
    const badReq = makeReq({
      method: "POST",
      url: "/slack/events",
      headers: {
        "x-slack-signature": "v0=deadbeef",
        "x-slack-request-timestamp": ts,
        "content-type": "application/json",
      },
      body,
    });
    const badRes = makeRes();
    await handleSlackHttpRequest(badReq, badRes);
    expect(badRes.capturedStatus).toBe(401);

    // -- 2. Good signature + url_verification → 200 + echoed challenge ------
    const goodReq = makeReq({
      method: "POST",
      url: "/slack/events",
      headers: {
        "x-slack-signature": goodSig,
        "x-slack-request-timestamp": ts,
        "content-type": "application/json",
      },
      body,
    });
    const goodRes = makeRes();
    await handleSlackHttpRequest(goodReq, goodRes);
    expect(goodRes.capturedStatus).toBe(200);
    expect(JSON.parse(goodRes.capturedBody ?? "{}")).toEqual({
      challenge: "challenge-abc",
    });

    await stopSlackMonitor({ controller, run });
  });
});

// Quiet the linter about unused state ref in this suite; helper imports are
// the canonical way to reset the global mock harness.
void slackTestState;
