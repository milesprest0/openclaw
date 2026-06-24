/**
 * Track Beta — Slack Resilience Platform (Phase 1, PRE-172 dark launch).
 *
 * Slack Events API HTTP endpoint handler.
 *
 * DARK LAUNCH ONLY. This handler:
 *  - Accepts the Slack URL verification challenge (initial app setup).
 *  - Verifies request signatures (5-minute replay window).
 *  - Deduplicates events via the event-dedup store (PR #8).
 *  - Logs every accepted + rejected event.
 *  - DOES NOT dispatch to the agent. Period.
 *
 * The "dispatch" integration lands in a follow-up PR when the full
 * Events API migration is ready to go live on Fernando VM. The feature
 * flag \`channels.slack.eventsApi.enabled\` gates whether the endpoint
 * is mounted at all; when disabled, routes return HTTP 503.
 *
 * Reversible via feature flag. No VM config touched. No live cutover.
 *
 * See: memory/2026-05-08-track-beta-slack-resilience-plan.md
 */

import { createEventDedupStore, type EventDedupStore } from "../state/event-dedup-store.js";
import { verifySlackSignature, type SlackSignatureHeaders } from "./signature.js";

export const EVENTS_API_DEFAULT_PATH = "/slack/events";

export type SlackEventsApiLogger = {
  debug?: (msg: string, meta?: Record<string, unknown>) => void;
  info: (msg: string, meta?: Record<string, unknown>) => void;
  warn: (msg: string, meta?: Record<string, unknown>) => void;
  error: (msg: string, meta?: Record<string, unknown>) => void;
};

export type SlackEventsApiConfig = {
  /** Feature-flag gate: when false, all requests return 503. Default: false. */
  enabled?: boolean;
  /** Slack app signing secret (from \`channels.slack.signingSecret\`). */
  signingSecret?: string;
  /** Workspace / account id used for dedup scoping. */
  workspaceId?: string;
  /** VM account label recorded in dedup entries. */
  vmAccount?: string;
  /** Injectable dedup store (defaults to the singleton). */
  dedupStore?: EventDedupStore;
  /** Injectable logger (defaults to console). */
  logger?: SlackEventsApiLogger;
};

export type SlackEventsApiRequest = {
  method: string;
  headers: {
    "x-slack-signature"?: string | null;
    "x-slack-request-timestamp"?: string | null;
    [k: string]: string | string[] | null | undefined;
  };
  rawBody: string;
};

export type SlackEventsApiResponse = {
  status: number;
  body: string;
  contentType?: string;
};

type ParsedPayload =
  | { kind: "url_verification"; challenge: string }
  | {
      kind: "event_callback";
      eventId: string;
      eventType: string;
      teamId?: string;
      channelId?: string;
      threadTs?: string;
      event: Record<string, unknown>;
    }
  | { kind: "unknown"; raw: unknown };

const DEFAULT_LOGGER: SlackEventsApiLogger = {
  info: (msg, meta) => {
    console.log(`[slack.eventsApi] ${msg}`, meta ?? {});
  },
  warn: (msg, meta) => {
    console.warn(`[slack.eventsApi] ${msg}`, meta ?? {});
  },
  error: (msg, meta) => {
    console.error(`[slack.eventsApi] ${msg}`, meta ?? {});
  },
};

/**
 * Handle one incoming HTTP request to the Slack Events API endpoint.
 *
 * Always resolves — never throws. Returns the HTTP response to send.
 * DOES NOT dispatch to the agent.
 */
export async function handleSlackEventsApiRequest(
  req: SlackEventsApiRequest,
  cfg: SlackEventsApiConfig,
): Promise<SlackEventsApiResponse> {
  const logger = cfg.logger ?? DEFAULT_LOGGER;

  if (!cfg.enabled) {
    logger.warn("endpoint disabled — returning 503", { method: req.method });
    return { status: 503, body: "Slack Events API endpoint disabled" };
  }

  if (req.method !== "POST") {
    return { status: 405, body: "Method Not Allowed" };
  }

  // Signature verification FIRST — reject before parsing.
  const sigHeaders: SlackSignatureHeaders = {
    signature: asString(req.headers["x-slack-signature"]),
    timestamp: asString(req.headers["x-slack-request-timestamp"]),
  };
  const sigResult = verifySlackSignature({
    signingSecret: cfg.signingSecret ?? "",
    headers: sigHeaders,
    rawBody: req.rawBody,
  });
  if (!sigResult.ok) {
    logger.warn("signature verification failed", { reason: sigResult.reason });
    return { status: 401, body: "Unauthorized" };
  }

  // Parse payload.
  let payload: unknown;
  try {
    payload = JSON.parse(req.rawBody);
  } catch (err) {
    logger.warn("malformed JSON body", {
      err: err instanceof Error ? err.message : String(err),
    });
    return { status: 400, body: "Bad Request" };
  }

  const parsed = classifyPayload(payload);

  if (parsed.kind === "url_verification") {
    logger.info("url_verification challenge handled");
    return {
      status: 200,
      body: JSON.stringify({ challenge: parsed.challenge }),
      contentType: "application/json",
    };
  }

  if (parsed.kind !== "event_callback") {
    logger.info("ignoring non-event_callback payload", {
      rawType: (payload as { type?: unknown } | null)?.type,
    });
    return { status: 200, body: "" };
  }

  // Dedup.
  const workspaceId = parsed.teamId ?? cfg.workspaceId ?? "unknown";
  const dedup = cfg.dedupStore ?? createEventDedupStore();
  const { firstSighting, record } = await dedup.checkAndRecord({
    workspaceId,
    eventId: parsed.eventId,
    vmAccount: cfg.vmAccount,
    channelId: parsed.channelId,
    threadTs: parsed.threadTs,
  });

  if (!firstSighting) {
    logger.info("duplicate event dropped", {
      workspaceId,
      eventId: parsed.eventId,
      eventType: parsed.eventType,
      originalReceivedAt: record.receivedAt,
      originalVmAccount: record.vmAccount,
    });
    return { status: 200, body: "" };
  }

  logger.info("event accepted (dark launch — no dispatch)", {
    workspaceId,
    eventId: parsed.eventId,
    eventType: parsed.eventType,
    channelId: parsed.channelId,
    threadTs: parsed.threadTs,
  });
  return { status: 200, body: "" };
}

function classifyPayload(payload: unknown): ParsedPayload {
  if (payload === null || typeof payload !== "object") {
    return { kind: "unknown", raw: payload };
  }
  const obj = payload as Record<string, unknown>;

  if (obj.type === "url_verification" && typeof obj.challenge === "string") {
    return { kind: "url_verification", challenge: obj.challenge };
  }

  if (obj.type === "event_callback") {
    const eventId = typeof obj.event_id === "string" ? obj.event_id : "";
    const teamId = typeof obj.team_id === "string" ? obj.team_id : undefined;
    const event =
      obj.event && typeof obj.event === "object" ? (obj.event as Record<string, unknown>) : {};
    const eventType = typeof event.type === "string" ? event.type : "unknown";
    const channelId = typeof event.channel === "string" ? event.channel : undefined;
    const threadTs = typeof event.thread_ts === "string" ? event.thread_ts : undefined;
    if (eventId) {
      return {
        kind: "event_callback",
        eventId,
        eventType,
        teamId,
        channelId,
        threadTs,
        event,
      };
    }
  }

  return { kind: "unknown", raw: payload };
}

function asString(v: unknown): string | null {
  if (typeof v === "string") {
    return v;
  }
  if (Array.isArray(v) && typeof v[0] === "string") {
    return v[0];
  }
  return null;
}
