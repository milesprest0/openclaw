/**
 * Slack Web API error classifiers for membership-gated operations.
 *
 * When the bot is in the channel *list* (via allowlist or auto-join discovery)
 * but not actually a member of every channel in that list, calls like
 * `conversations.history` return `not_in_channel` or `channel_not_found`.
 * These are NOT failures — they just mean the operation is a no-op for that
 * channel. Callers that treat every API error as `runtime.error` end up
 * spamming the journal with benign lines, making it harder to spot real
 * reconcile/history/fetch failures.
 *
 * This module provides a single classifier so callers can route benign
 * membership errors to `runtime.log` (info) instead of `runtime.error`.
 *
 * Retires (in part) runtime patch 010
 * (`~/.openclaw/patches/010-slack-reconcile-not-in-channel-downgrade.patch.md`).
 * The full retirement completes once the runtime `runSlackReconcile` loop
 * (introduced by runtime patch 007) is upstreamed into this fork and can
 * consume `classifyBenignSlackApiError` directly.
 */

export type BenignSlackApiErrorReason = "not_in_channel" | "channel_not_found";

/**
 * Returns the specific benign-membership reason string if `err` looks like a
 * non-fatal Slack API membership-gated failure, or `null` otherwise.
 *
 * Accepts anything — Error instances, Slack WebAPIErrors, plain objects with
 * `.data.error`, or string payloads. Uses a conservative regex fallback so
 * this stays robust across SDK minor versions.
 */
export function classifyBenignSlackApiError(err: unknown): BenignSlackApiErrorReason | null {
  const codeLike = extractSlackApiErrorCode(err);
  if (codeLike === "not_in_channel" || codeLike === "channel_not_found") {
    return codeLike;
  }
  const text = typeof err === "string" ? err : err instanceof Error ? err.message : String(err);
  if (/\bnot_in_channel\b/.test(text)) {
    return "not_in_channel";
  }
  if (/\bchannel_not_found\b/.test(text)) {
    return "channel_not_found";
  }
  return null;
}

/** True iff `classifyBenignSlackApiError` would return a non-null reason. */
export function isBenignSlackApiError(err: unknown): boolean {
  return classifyBenignSlackApiError(err) !== null;
}

function extractSlackApiErrorCode(err: unknown): string | null {
  if (!err || typeof err !== "object") {
    return null;
  }
  const anyErr = err as {
    code?: unknown;
    data?: { error?: unknown };
    error?: unknown;
  };
  const candidates: unknown[] = [anyErr.data?.error, anyErr.error, anyErr.code];
  for (const c of candidates) {
    if (typeof c === "string" && c.length > 0) {
      return c;
    }
  }
  return null;
}
