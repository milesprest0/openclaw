import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createEventDedupStore,
  type EventDedupStore,
} from "../state/event-dedup-store.js";
import { InMemoryStateStore } from "../state/state-store.js";
import {
  EVENTS_API_DEFAULT_PATH,
  handleSlackEventsApiRequest,
  type SlackEventsApiConfig,
  type SlackEventsApiLogger,
} from "./endpoint.js";
import { computeSlackSignatureForTest } from "./signature.js";

const SECRET = "test-signing-secret";

function freshTs(nowMs: number = Date.now()): string {
  return Math.floor(nowMs / 1000).toString();
}

function newDedup(): EventDedupStore {
  return createEventDedupStore({
    store: new InMemoryStateStore("slack.events.seen"),
  });
}

function makeLogger(): {
  logger: SlackEventsApiLogger;
  info: Array<{ msg: string; meta?: Record<string, unknown> }>;
  warn: Array<{ msg: string; meta?: Record<string, unknown> }>;
} {
  const info: Array<{ msg: string; meta?: Record<string, unknown> }> = [];
  const warn: Array<{ msg: string; meta?: Record<string, unknown> }> = [];
  return {
    info,
    warn,
    logger: {
      info: (msg, meta) => info.push({ msg, meta }),
      warn: (msg, meta) => warn.push({ msg, meta }),
      error: (msg, meta) => warn.push({ msg, meta }),
    },
  };
}

function signedRequest(body: string, opts?: { secret?: string; tsOffsetMs?: number }) {
  const nowMs = Date.now();
  const effectiveTs = freshTs(nowMs + (opts?.tsOffsetMs ?? 0));
  const sig = computeSlackSignatureForTest(opts?.secret ?? SECRET, effectiveTs, body);
  return {
    method: "POST",
    headers: {
      "x-slack-signature": sig,
      "x-slack-request-timestamp": effectiveTs,
    },
    rawBody: body,
  };
}

describe("handleSlackEventsApiRequest", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-08T20:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 503 when the endpoint is disabled (default)", async () => {
    const { logger } = makeLogger();
    const res = await handleSlackEventsApiRequest(signedRequest("{}"), {
      signingSecret: SECRET,
      logger,
    });
    expect(res.status).toBe(503);
  });

  it("returns 405 on non-POST", async () => {
    const { logger } = makeLogger();
    const res = await handleSlackEventsApiRequest(
      { method: "GET", headers: {}, rawBody: "" },
      { enabled: true, signingSecret: SECRET, logger },
    );
    expect(res.status).toBe(405);
  });

  it("returns 401 when signature header is missing", async () => {
    const { logger, warn } = makeLogger();
    const res = await handleSlackEventsApiRequest(
      {
        method: "POST",
        headers: { "x-slack-request-timestamp": freshTs() },
        rawBody: "{}",
      },
      { enabled: true, signingSecret: SECRET, logger },
    );
    expect(res.status).toBe(401);
    expect(warn[0]?.msg).toMatch(/signature verification failed/);
    expect(warn[0]?.meta?.reason).toBe("missing_signature_header");
  });

  it("returns 401 when signature is computed with wrong secret", async () => {
    const { logger } = makeLogger();
    const res = await handleSlackEventsApiRequest(
      signedRequest("{}", { secret: "WRONG" }),
      { enabled: true, signingSecret: SECRET, logger },
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 on malformed JSON body after signature passes", async () => {
    const { logger } = makeLogger();
    const res = await handleSlackEventsApiRequest(
      signedRequest("not-json"),
      { enabled: true, signingSecret: SECRET, logger },
    );
    expect(res.status).toBe(400);
  });

  it("handles url_verification challenge and echoes the challenge value", async () => {
    const { logger, info } = makeLogger();
    const body = JSON.stringify({
      type: "url_verification",
      challenge: "xyzzy-challenge-123",
    });
    const res = await handleSlackEventsApiRequest(signedRequest(body), {
      enabled: true,
      signingSecret: SECRET,
      logger,
    });
    expect(res.status).toBe(200);
    expect(res.contentType).toBe("application/json");
    expect(JSON.parse(res.body)).toEqual({ challenge: "xyzzy-challenge-123" });
    expect(info.some((e) => e.msg.includes("url_verification"))).toBe(true);
  });

  it("accepts an event_callback on first sighting, records in dedup, returns 200", async () => {
    const { logger, info } = makeLogger();
    const dedup = newDedup();
    const body = JSON.stringify({
      type: "event_callback",
      event_id: "Ev1",
      team_id: "T1",
      event: { type: "app_mention", channel: "C1", thread_ts: "1000.1" },
    });
    const res = await handleSlackEventsApiRequest(signedRequest(body), {
      enabled: true,
      signingSecret: SECRET,
      logger,
      dedupStore: dedup,
      vmAccount: "fernando",
    });
    expect(res.status).toBe(200);
    expect(res.body).toBe("");
    expect(await dedup.has("T1", "Ev1")).toBe(true);
    const accepted = info.find((e) => e.msg.includes("event accepted"));
    expect(accepted?.meta?.eventType).toBe("app_mention");
    expect(accepted?.meta?.channelId).toBe("C1");
  });

  it("drops duplicate event_callback and logs duplicate meta", async () => {
    const { logger, info } = makeLogger();
    const dedup = newDedup();
    const body = JSON.stringify({
      type: "event_callback",
      event_id: "Ev1",
      team_id: "T1",
      event: { type: "app_mention", channel: "C1" },
    });
    const cfg: SlackEventsApiConfig = {
      enabled: true,
      signingSecret: SECRET,
      logger,
      dedupStore: dedup,
    };
    await handleSlackEventsApiRequest(signedRequest(body), cfg);
    const res2 = await handleSlackEventsApiRequest(signedRequest(body), cfg);
    expect(res2.status).toBe(200);
    const dup = info.find((e) => e.msg.includes("duplicate event dropped"));
    expect(dup).toBeDefined();
    expect(dup?.meta?.eventId).toBe("Ev1");
  });

  it("falls back to cfg.workspaceId when team_id is missing", async () => {
    const { logger } = makeLogger();
    const dedup = newDedup();
    const body = JSON.stringify({
      type: "event_callback",
      event_id: "Ev1",
      // no team_id
      event: { type: "app_mention" },
    });
    await handleSlackEventsApiRequest(signedRequest(body), {
      enabled: true,
      signingSecret: SECRET,
      logger,
      dedupStore: dedup,
      workspaceId: "config-fallback-workspace",
    });
    expect(await dedup.has("config-fallback-workspace", "Ev1")).toBe(true);
  });

  it("NEVER dispatches to an agent — no callable is reachable from this module", () => {
    // Dark-launch guarantee: this PR MUST NOT contain any agent-dispatch
    // code path. Asserted by scanning the source for the verbs we would use
    // when wiring lands in a follow-up PR.
    const endpointPath = fileURLToPath(new URL("./endpoint.ts", import.meta.url));
    const src = readFileSync(endpointPath, "utf8");
    expect(src).not.toMatch(/dispatchToAgent|createAgentTurn|enqueueForAgent/);
  });

  it("ignores unknown payload shapes with 200", async () => {
    const { logger } = makeLogger();
    const body = JSON.stringify({ type: "something_else", foo: "bar" });
    const res = await handleSlackEventsApiRequest(signedRequest(body), {
      enabled: true,
      signingSecret: SECRET,
      logger,
    });
    expect(res.status).toBe(200);
  });

  it("exposes EVENTS_API_DEFAULT_PATH constant for router wiring", () => {
    expect(EVENTS_API_DEFAULT_PATH).toBe("/slack/events");
  });
});
