/**
 * Track Beta — Slack Resilience Platform (Phase 1 gap closure, PRE-172).
 *
 * Node-style (req, res) adapter around `handleSlackEventsApiRequest`.
 *
 * This is the bridge between the gateway's Slack HTTP route registry
 * (which expects `(IncomingMessage, ServerResponse) => Promise<void> | void`)
 * and the pure functional `handleSlackEventsApiRequest` handler.
 *
 * Behavior:
 *  - Buffers the request body up to a hard byte cap (default 1 MiB),
 *    matching the legacy Bolt receiver request guard.
 *  - Calls `handleSlackEventsApiRequest` with the buffered raw body
 *    and the verbatim Slack signing headers.
 *  - Writes the resulting status / body / content-type back to the
 *    response. Always responds — never throws.
 *
 * This adapter performs NO dispatch and NO signature verification of
 * its own — those concerns belong to `handleSlackEventsApiRequest`.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import {
  handleSlackEventsApiRequest,
  type SlackEventsApiConfig,
  type SlackEventsApiLogger,
  type SlackEventsApiRequest,
} from "./endpoint.js";

export type CreateSlackEventsApiNodeHandlerOptions = {
  config: SlackEventsApiConfig;
  /** Hard upper bound on request body size in bytes. Default 1 MiB. */
  maxBodyBytes?: number;
  /** Timeout in milliseconds to wait for the full body. Default 30s. */
  bodyTimeoutMs?: number;
  /** Optional logger override. Defaults to `config.logger`. */
  logger?: SlackEventsApiLogger;
};

export type SlackEventsApiNodeHandler = (
  req: IncomingMessage,
  res: ServerResponse,
) => Promise<void>;

const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;
const DEFAULT_BODY_TIMEOUT_MS = 30_000;

/**
 * Build a `(req, res)` handler that can be passed to
 * `registerSlackHttpHandler({ path, handler, accountId })`.
 */
export function createSlackEventsApiNodeHandler(
  options: CreateSlackEventsApiNodeHandlerOptions,
): SlackEventsApiNodeHandler {
  const maxBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  const timeoutMs = options.bodyTimeoutMs ?? DEFAULT_BODY_TIMEOUT_MS;
  const logger = options.logger ?? options.config.logger;

  return async function slackEventsApiNodeHandler(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    let rawBody: string;
    try {
      rawBody = await readRequestBody(req, { maxBytes, timeoutMs });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      logger?.warn?.("failed to read request body", { reason });
      writeResponse(res, {
        status: reason === "payload_too_large" ? 413 : 400,
        body: reason === "payload_too_large" ? "Payload Too Large" : "Bad Request",
      });
      return;
    }

    const headers = normalizeHeaders(req);
    const handlerReq: SlackEventsApiRequest = {
      method: req.method ?? "GET",
      headers,
      rawBody,
    };

    const result = await handleSlackEventsApiRequest(handlerReq, options.config);
    writeResponse(res, result);
  };
}

function normalizeHeaders(req: IncomingMessage): SlackEventsApiRequest["headers"] {
  const out: SlackEventsApiRequest["headers"] = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) {
      continue;
    }
    out[key.toLowerCase()] = value as string | string[];
  }
  return out;
}

function writeResponse(
  res: ServerResponse,
  result: { status: number; body: string; contentType?: string },
): void {
  if (res.headersSent || res.writableEnded) {
    return;
  }
  try {
    if (result.contentType) {
      res.setHeader("Content-Type", result.contentType);
    } else if (!res.getHeader("Content-Type")) {
      res.setHeader("Content-Type", "text/plain");
    }
    res.statusCode = result.status;
    res.end(result.body);
  } catch {
    // Best-effort write; if the socket is already torn down, swallow.
  }
}

async function readRequestBody(
  req: IncomingMessage,
  opts: { maxBytes: number; timeoutMs: number },
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let received = 0;
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      fn();
    };

    const timer = setTimeout(() => {
      finish(() => reject(new Error("body_timeout")));
    }, opts.timeoutMs);

    req.on("data", (chunk: Buffer | string) => {
      if (settled) {
        return;
      }
      const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      received += buf.byteLength;
      if (received > opts.maxBytes) {
        finish(() => reject(new Error("payload_too_large")));
        return;
      }
      chunks.push(buf);
    });
    req.on("end", () => {
      finish(() => resolve(Buffer.concat(chunks).toString("utf8")));
    });
    req.on("error", (err) => {
      finish(() => reject(err));
    });
  });
}
