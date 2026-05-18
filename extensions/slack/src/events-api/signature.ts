/**
 * Track Beta — Slack Resilience Platform (Phase 1, PRE-172 dark launch).
 *
 * Slack request signature verification per
 * https://api.slack.com/authentication/verifying-requests-from-slack
 *
 * Signature format (v0):
 *   X-Slack-Signature: v0=<HMAC-SHA256 hex of "v0:<timestamp>:<raw body>">
 *   X-Slack-Request-Timestamp: <unix seconds>
 *
 * We reject:
 *  - Missing timestamp / signature headers.
 *  - Timestamps drifting more than 5 minutes from now (replay guard).
 *  - Signatures that do not match under timing-safe comparison.
 *
 * All crypto uses Node's built-in \`crypto\`; no new deps.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/** Slack recommends rejecting timestamps more than 5 minutes old. */
export const SLACK_SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000;

export type SlackSignatureHeaders = {
  signature?: string | null;
  timestamp?: string | null;
};

export type VerifySlackSignatureInput = {
  signingSecret: string;
  headers: SlackSignatureHeaders;
  rawBody: string;
  /** Override for testing. Defaults to Date.now(). */
  now?: number;
  /** Override max-age for testing. Defaults to SLACK_SIGNATURE_MAX_AGE_MS. */
  maxAgeMs?: number;
};

export type VerifySlackSignatureResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "missing_signing_secret"
        | "missing_signature_header"
        | "missing_timestamp_header"
        | "invalid_timestamp"
        | "timestamp_too_old"
        | "timestamp_in_future"
        | "invalid_signature_format"
        | "signature_mismatch";
    };

/**
 * Verify a Slack Events API request signature.
 *
 * Returns \`{ ok: true }\` on success and \`{ ok: false, reason }\` on any
 * failure. Callers MUST return HTTP 401 on any failure and MUST NOT leak
 * the specific \`reason\` to clients — it's for logging only.
 */
export function verifySlackSignature(
  input: VerifySlackSignatureInput,
): VerifySlackSignatureResult {
  if (!input.signingSecret || input.signingSecret.length === 0) {
    return { ok: false, reason: "missing_signing_secret" };
  }
  const sigHeader = input.headers.signature;
  if (!sigHeader) return { ok: false, reason: "missing_signature_header" };
  const tsHeader = input.headers.timestamp;
  if (!tsHeader) return { ok: false, reason: "missing_timestamp_header" };

  const tsSeconds = Number.parseInt(tsHeader, 10);
  if (!Number.isFinite(tsSeconds) || tsSeconds <= 0) {
    return { ok: false, reason: "invalid_timestamp" };
  }

  const now = input.now ?? Date.now();
  const maxAge = input.maxAgeMs ?? SLACK_SIGNATURE_MAX_AGE_MS;
  const ageMs = now - tsSeconds * 1000;
  if (ageMs > maxAge) return { ok: false, reason: "timestamp_too_old" };
  if (ageMs < -maxAge) return { ok: false, reason: "timestamp_in_future" };

  if (!sigHeader.startsWith("v0=")) {
    return { ok: false, reason: "invalid_signature_format" };
  }
  const providedHex = sigHeader.slice(3);
  // Expected hex length: 64 chars for SHA-256.
  if (providedHex.length !== 64 || !/^[0-9a-f]+$/i.test(providedHex)) {
    return { ok: false, reason: "invalid_signature_format" };
  }

  const basestring = `v0:${tsHeader}:${input.rawBody}`;
  const expectedHex = createHmac("sha256", input.signingSecret)
    .update(basestring, "utf8")
    .digest("hex");

  const a = Buffer.from(expectedHex, "hex");
  const b = Buffer.from(providedHex.toLowerCase(), "hex");
  if (a.length !== b.length) return { ok: false, reason: "signature_mismatch" };
  if (!timingSafeEqual(a, b)) return { ok: false, reason: "signature_mismatch" };

  return { ok: true };
}

/**
 * Convenience helper: given a signing secret + payload + timestamp, produce
 * the \`X-Slack-Signature\` header value a real Slack sender would compute.
 *
 * Exposed for tests; not used at runtime.
 */
export function computeSlackSignatureForTest(
  signingSecret: string,
  timestamp: string,
  rawBody: string,
): string {
  const digest = createHmac("sha256", signingSecret)
    .update(`v0:${timestamp}:${rawBody}`, "utf8")
    .digest("hex");
  return `v0=${digest}`;
}
