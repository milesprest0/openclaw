/**
 * Inbound-media retention registry.
 *
 * Background / incident: inbound attachments offloaded by the Gateway
 * (`chat-attachments.ts` -> `saveMediaBuffer(..., "inbound", ...)` ->
 * `media://inbound/<id>`) are reclaimed ONLY by the periodic, purely
 * time-based sweep `cleanOldMedia(ttlMs)`. That sweep deletes by file age and
 * has NO awareness of whether a turn is in-flight, succeeded, failed, or is
 * being retried. A slow / timed-out multi-file turn — or a post-failure
 * retry — could therefore have its offloaded originals swept mid-turn or right
 * after failure, forcing the user to re-upload. On a legal VM that is
 * unacceptable: a failed/timed-out turn must NEVER destroy uploaded documents.
 *
 * This registry lets the Gateway PIN inbound media IDs to an active run so the
 * sweep skips them, then RELEASE them with a generous grace window on
 * completion — for BOTH success and failure — so a failed/timed-out turn keeps
 * its originals long enough to be recovered or retried without re-upload.
 *
 * The pin is enforced in `cleanOldMedia` by refreshing the mtime of pinned
 * files to "now" immediately before each prune pass, so the age-based external
 * prune walk cannot delete a pinned file. This is fully self-contained in the
 * fork and requires no change to the external prune implementation.
 *
 * Retention is intentionally fail-open: an unknown/expired pin simply lets the
 * media age out normally, so the registry can never cause unbounded growth.
 */

/** Default grace window applied when a run releases its pinned inbound media. */
export const DEFAULT_INBOUND_RETENTION_GRACE_MS = 60 * 60 * 1000; // 1 hour

type RetentionEntry = {
  /** Wall-clock ms after which the pin is no longer honored. */
  expiresAtMs: number;
};

// In-process registry. The media store and gateway live in the same process,
// so a module-level map is the correct scope (mirrors other in-memory
// gateway registries such as dedupe / abort controllers).
const retainedById = new Map<string, RetentionEntry>();

function coerceIds(ids: string | readonly string[]): string[] {
  const list = typeof ids === "string" ? [ids] : ids;
  const out: string[] = [];
  for (const id of list) {
    if (typeof id === "string" && id.length > 0) {
      out.push(id);
    }
  }
  return out;
}

/**
 * Pin inbound media IDs so the time-based sweep will not delete them until at
 * least `now + ttlMs`. Extends (never shortens) any existing pin for the same
 * ID, so concurrent runs sharing an offloaded file all keep it alive.
 */
export function pinInboundMedia(
  ids: string | readonly string[],
  ttlMs: number,
  now: number = Date.now(),
): void {
  if (!(ttlMs > 0)) {
    return;
  }
  const expiresAtMs = now + ttlMs;
  for (const id of coerceIds(ids)) {
    const existing = retainedById.get(id);
    if (!existing || existing.expiresAtMs < expiresAtMs) {
      retainedById.set(id, { expiresAtMs });
    }
  }
}

/**
 * Release inbound media IDs by downgrading their pin to a grace window
 * (`now + graceMs`) instead of deleting. Called when a run completes — on BOTH
 * success and failure — so a failed/timed-out turn retains its originals
 * through the grace window for recovery/retry. Never deletes media itself;
 * actual reclamation is left to the normal age-based sweep once the grace
 * window has elapsed.
 *
 * The grace pin only ever shortens an active pin down to the grace window (it
 * does not extend a longer in-flight pin belonging to another run), and only
 * applies to IDs that were actually pinned.
 */
export function releaseInboundMedia(
  ids: string | readonly string[],
  graceMs: number = DEFAULT_INBOUND_RETENTION_GRACE_MS,
  now: number = Date.now(),
): void {
  const graceExpiresAtMs = now + Math.max(0, graceMs);
  for (const id of coerceIds(ids)) {
    const existing = retainedById.get(id);
    if (!existing) {
      continue;
    }
    // Keep the later of (a longer pin held by another in-flight run) and the
    // grace window, so we never cut short someone else's active retention but
    // always guarantee at least `graceMs` of post-completion retention.
    const expiresAtMs = Math.max(existing.expiresAtMs, graceExpiresAtMs);
    retainedById.set(id, { expiresAtMs });
  }
}

/** Drop pins that have passed their expiry as of `now`. */
function evictExpired(now: number): void {
  for (const [id, entry] of retainedById) {
    if (entry.expiresAtMs <= now) {
      retainedById.delete(id);
    }
  }
}

/** Whether the given inbound media ID is currently pinned (and not expired). */
export function isInboundMediaPinned(id: string, now: number = Date.now()): boolean {
  const entry = retainedById.get(id);
  if (!entry) {
    return false;
  }
  if (entry.expiresAtMs <= now) {
    retainedById.delete(id);
    return false;
  }
  return true;
}

/** All inbound media IDs still pinned as of `now`. Evicts expired pins. */
export function pinnedInboundIds(now: number = Date.now()): string[] {
  evictExpired(now);
  return [...retainedById.keys()];
}

/** Test-only: clear the entire registry. */
export function clearInboundRetention(): void {
  retainedById.clear();
}
