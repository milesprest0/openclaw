import { l as resolvePersistedOverrideModelRef } from "./model-selection-CyVXHdEG.js";
import { r as resolveSessionParentSessionKey } from "./session-conversation-YLqp8hUs.js";
import { c as normalizeOptionalString } from "./string-coerce-BdEutqX5.js";
/**
 * Decide whether a persisted model override is still authoritative this turn.
 * - `"user"` source (explicit `/model`, sessions.patch): always authoritative.
 * - legacy entries with no source but a set override: treated as user-driven.
 * - `"auto"` source: authoritative only within the TTL window from when it was
 *   written (`modelOverrideAt`); after that it is ignored so the live default
 *   is re-resolved. If `modelOverrideAt` is absent (legacy auto pin), it is
 *   treated as expired so it re-resolves.
 */
function isModelOverrideStillAuthoritative(params) {
  if (!Boolean(normalizeOptionalString(params.modelOverride))) return false;
  if (params.modelOverrideSource !== "auto") return true;
  const ttlMs = params.ttlMs ?? 36e5;
  if (ttlMs <= 0) return false;
  const setAt = params.modelOverrideAt;
  if (typeof setAt !== "number" || !Number.isFinite(setAt)) return false;
  return (params.nowMs ?? Date.now()) - setAt < ttlMs;
}
function resolveParentSessionKeyCandidate(params) {
  const explicit = normalizeOptionalString(params.parentSessionKey);
  if (explicit && explicit !== params.sessionKey) return explicit;
  const derived = resolveSessionParentSessionKey(params.sessionKey);
  if (derived && derived !== params.sessionKey) return derived;
  return null;
}
function resolveStoredModelOverride(params) {
  const direct = isModelOverrideStillAuthoritative({
    modelOverride: params.sessionEntry?.modelOverride,
    modelOverrideSource: params.sessionEntry?.modelOverrideSource,
    modelOverrideAt: params.sessionEntry?.modelOverrideAt,
  })
    ? resolvePersistedOverrideModelRef({
        defaultProvider: params.defaultProvider,
        overrideProvider: params.sessionEntry?.providerOverride,
        overrideModel: params.sessionEntry?.modelOverride,
      })
    : null;
  if (direct)
    return {
      ...direct,
      source: "session",
    };
  const parentKey = resolveParentSessionKeyCandidate({
    sessionKey: params.sessionKey,
    parentSessionKey: params.parentSessionKey,
  });
  if (!parentKey || !params.sessionStore) return null;
  const parentEntry = params.sessionStore[parentKey];
  const parentOverride = isModelOverrideStillAuthoritative({
    modelOverride: parentEntry?.modelOverride,
    modelOverrideSource: parentEntry?.modelOverrideSource,
    modelOverrideAt: parentEntry?.modelOverrideAt,
  })
    ? resolvePersistedOverrideModelRef({
        defaultProvider: params.defaultProvider,
        overrideProvider: parentEntry?.providerOverride,
        overrideModel: parentEntry?.modelOverride,
      })
    : null;
  if (!parentOverride) return null;
  return {
    ...parentOverride,
    source: "parent",
  };
}
//#endregion
export { resolveStoredModelOverride as n, isModelOverrideStillAuthoritative as t };
