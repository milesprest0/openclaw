import type { SessionEntry } from "../../config/sessions/types.js";
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
export declare const MODEL_OVERRIDE_AUTO_TTL_MS: number;
/**
 * Decide whether a persisted model override is still authoritative this turn.
 * - `"user"` source (explicit `/model`, sessions.patch): always authoritative.
 * - legacy entries with no source but a set override: treated as user-driven.
 * - `"auto"` source: authoritative only within the TTL window from when it was
 *   written (`modelOverrideAt`); after that it is ignored so the live default
 *   is re-resolved. If `modelOverrideAt` is absent (legacy auto pin), it is
 *   treated as expired so it re-resolves.
 */
export declare function isModelOverrideStillAuthoritative(params: {
  modelOverride?: string;
  modelOverrideSource?: "auto" | "user";
  modelOverrideAt?: number;
  nowMs?: number;
  ttlMs?: number;
}): boolean;
export declare function resolveStoredModelOverride(params: {
  sessionEntry?: SessionEntry;
  sessionStore?: Record<string, SessionEntry>;
  sessionKey?: string;
  parentSessionKey?: string;
  defaultProvider: string;
}): StoredModelOverride | null;
