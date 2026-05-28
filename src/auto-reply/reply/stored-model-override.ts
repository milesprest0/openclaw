import { resolvePersistedOverrideModelRef } from "../../agents/model-selection.js";
import { resolveSessionParentSessionKey } from "../../channels/plugins/session-conversation.js";
import type { SessionEntry } from "../../config/sessions/types.js";
import { normalizeOptionalString } from "../../shared/string-coerce.js";

export type StoredModelOverride = {
  provider?: string;
  model: string;
  source: "session" | "parent";
};

/**
 * How long an `"auto"`-source model pin remains authoritative before the
 * session re-resolves the live configured default. Keeps active-conversation
 * fallbacks sticky (so the next turn does not immediately re-fail on a
 * rate-limited primary) while letting stale cross-session pins expire so a
 * session created under an older default returns to the current default.
 *
 * Set to 0 to always re-resolve auto pins on every turn.
 */
export const MODEL_OVERRIDE_AUTO_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Decide whether a persisted model override is still authoritative this turn.
 * - `"user"` source (explicit `/model`, sessions.patch): always authoritative.
 * - legacy entries with no source but a set override: treated as user-driven.
 * - `"auto"` source: authoritative only within the TTL window from when it was
 *   written (`modelOverrideAt`); after that it is ignored so the live default
 *   is re-resolved. If `modelOverrideAt` is absent (legacy auto pin), it is
 *   treated as expired so it re-resolves.
 */
export function isModelOverrideStillAuthoritative(params: {
  modelOverride?: string;
  modelOverrideSource?: "auto" | "user";
  modelOverrideAt?: number;
  nowMs?: number;
  ttlMs?: number;
}): boolean {
  const hasOverride = Boolean(normalizeOptionalString(params.modelOverride));
  if (!hasOverride) {
    return false;
  }
  // User-driven (or legacy untracked) overrides never expire.
  if (params.modelOverrideSource !== "auto") {
    return true;
  }
  const ttlMs = params.ttlMs ?? MODEL_OVERRIDE_AUTO_TTL_MS;
  if (ttlMs <= 0) {
    return false;
  }
  const setAt = params.modelOverrideAt;
  if (typeof setAt !== "number" || !Number.isFinite(setAt)) {
    // Legacy auto pin with no timestamp: treat as expired (re-resolve).
    return false;
  }
  const now = params.nowMs ?? Date.now();
  return now - setAt < ttlMs;
}

function resolveParentSessionKeyCandidate(params: {
  sessionKey?: string;
  parentSessionKey?: string;
}): string | null {
  const explicit = normalizeOptionalString(params.parentSessionKey);
  if (explicit && explicit !== params.sessionKey) {
    return explicit;
  }
  const derived = resolveSessionParentSessionKey(params.sessionKey);
  if (derived && derived !== params.sessionKey) {
    return derived;
  }
  return null;
}

export function resolveStoredModelOverride(params: {
  sessionEntry?: SessionEntry;
  sessionStore?: Record<string, SessionEntry>;
  sessionKey?: string;
  parentSessionKey?: string;
  defaultProvider: string;
}): StoredModelOverride | null {
  const directAuthoritative = isModelOverrideStillAuthoritative({
    modelOverride: params.sessionEntry?.modelOverride,
    modelOverrideSource: params.sessionEntry?.modelOverrideSource,
    modelOverrideAt: params.sessionEntry?.modelOverrideAt,
  });
  const direct = directAuthoritative
    ? resolvePersistedOverrideModelRef({
        defaultProvider: params.defaultProvider,
        overrideProvider: params.sessionEntry?.providerOverride,
        overrideModel: params.sessionEntry?.modelOverride,
      })
    : null;
  if (direct) {
    return { ...direct, source: "session" };
  }
  const parentKey = resolveParentSessionKeyCandidate({
    sessionKey: params.sessionKey,
    parentSessionKey: params.parentSessionKey,
  });
  if (!parentKey || !params.sessionStore) {
    return null;
  }
  const parentEntry = params.sessionStore[parentKey];
  const parentAuthoritative = isModelOverrideStillAuthoritative({
    modelOverride: parentEntry?.modelOverride,
    modelOverrideSource: parentEntry?.modelOverrideSource,
    modelOverrideAt: parentEntry?.modelOverrideAt,
  });
  const parentOverride = parentAuthoritative
    ? resolvePersistedOverrideModelRef({
        defaultProvider: params.defaultProvider,
        overrideProvider: parentEntry?.providerOverride,
        overrideModel: parentEntry?.modelOverride,
      })
    : null;
  if (!parentOverride) {
    return null;
  }
  return { ...parentOverride, source: "parent" };
}
