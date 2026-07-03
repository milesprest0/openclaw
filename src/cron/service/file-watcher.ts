// ============================================================================
// Cron store file-watcher — PRE-176
// ============================================================================
//
// Watches the persisted cron store (`jobs.json`) for external edits and
// triggers a debounced in-memory reload so jobs.json changes hot-reload
// without requiring a gateway restart.
//
// Design:
//   - `fs.watch` (non-recursive) on the store path.
//   - Debounced: multiple events within `debounceMs` coalesce into a single
//     reload to avoid redundant reloads during rapid edits (common with
//     editors that save + rename + chmod in sequence).
//   - Skips reloads caused by our own writes (`suppressUntilMs`) so the
//     post-write fsync does not kick off a no-op reload cycle.
//   - Uses the existing `ensureLoaded(state, { forceReload: true })` path
//     so every reload goes through the same validation + recompute pipeline
//     as the startup load.
//   - Fails closed: any error inside the watcher is logged but does not
//     crash the cron service; the watcher is best-effort.
//
// This is the counterpart to the scheduler's own mtime check and to the
// `openclaw cron edit` CLI path — both of which can still trigger reloads
// through the same mechanism. External tools that edit `jobs.json` directly
// (Prest0n, seed scripts, manual \`jq\` edits) are the primary use case.
// ============================================================================

import fs from "node:fs";
import type { CronServiceState } from "./state.js";
import { ensureLoaded } from "./store.js";

const DEFAULT_DEBOUNCE_MS = 250;
const DEFAULT_MIN_SUPPRESS_MS = 100;

export type CronFileWatcherHandle = {
  stop: () => void;
  /**
   * Mark a window during which watcher-triggered reloads should be skipped
   * because the service itself is about to write the store. Callers pass
   * the expected fsync window (typically 100ms). Short windows avoid
   * swallowing a legitimate external edit that lands concurrently.
   */
  suppressFor: (ms?: number) => void;
};

/**
 * Minimal surface of the fs watcher the cron store relies on. Kept narrow so
 * tests can inject a deterministic fake instead of depending on native
 * `fs.watch` event delivery (which is environment-flaky under heavily loaded
 * CI shards and does not reliably deliver events on all container filesystems).
 */
export type CronFsWatchLike = {
  close: () => void;
  unref?: () => void;
  on?: (event: "error", listener: (err: unknown) => void) => void;
};

export type CronFsWatchFactory = (storePath: string, onChange: () => void) => CronFsWatchLike;

const defaultWatchFactory: CronFsWatchFactory = (storePath, onChange) =>
  fs.watch(storePath, { persistent: false }, () => onChange());

export type CronFileWatcherOptions = {
  debounceMs?: number;
  /**
   * Test-only seam: supply a deterministic watch factory. Defaults to the
   * native `fs.watch`. Production callers never pass this.
   */
  watchFactory?: CronFsWatchFactory;
};

/**
 * Start a debounced fs.watch on the cron store file. Returns a handle so the
 * caller (CronService.stop()) can tear it down cleanly.
 *
 * If the target path does not exist yet, the watcher is not started — the
 * caller should re-invoke after the file is persisted for the first time.
 */
export function startCronStoreWatcher(
  state: CronServiceState,
  options: CronFileWatcherOptions = {},
): CronFileWatcherHandle | null {
  const debounceMs =
    typeof options.debounceMs === "number" && options.debounceMs >= 0
      ? options.debounceMs
      : DEFAULT_DEBOUNCE_MS;

  const storePath = state.deps.storePath;
  const log = state.deps.log;

  if (!fs.existsSync(storePath)) {
    log.info({ storePath }, "cron: file watcher skipped (store path does not exist yet)");
    return null;
  }

  let debounceTimer: NodeJS.Timeout | null = null;
  let suppressUntilMs = 0;
  let closed = false;

  const triggerReload = () => {
    if (closed) {
      return;
    }
    debounceTimer = null;
    const nowMs = state.deps.nowMs();
    if (nowMs < suppressUntilMs) {
      return;
    }
    // Fire the reload through the normal op queue so concurrent operations
    // (add/remove/run) serialize naturally with the reload.
    const reloadPromise = state.op
      .then(async () => {
        try {
          await ensureLoaded(state, { forceReload: true, skipRecompute: false });
          log.info({ storePath }, "cron: hot-reloaded jobs from disk");
        } catch (err) {
          log.warn(
            { storePath, err: String(err) },
            "cron: hot-reload failed (keeping in-memory store)",
          );
        }
      })
      .catch((err) => {
        log.warn({ storePath, err: String(err) }, "cron: hot-reload op-queue chain failed");
      });
    state.op = reloadPromise;
  };

  const watchFactory = options.watchFactory ?? defaultWatchFactory;
  let watcher: CronFsWatchLike | null = null;
  try {
    watcher = watchFactory(storePath, () => {
      if (closed) {
        return;
      }
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(triggerReload, debounceMs);
    });
    // Don't keep the Node process alive just for the cron watcher.
    if (typeof watcher.unref === "function") {
      watcher.unref();
    }
  } catch (err) {
    log.warn({ storePath, err: String(err) }, "cron: fs.watch failed (hot-reload disabled)");
    return null;
  }

  // Some platforms (Linux on some FS) emit spurious 'rename' events when an
  // editor replaces the file atomically (write-to-tmp + rename). The watcher
  // above handles that because it listens to both 'change' and 'rename';
  // the renamed-over file would still surface through fs.watch on the path
  // on most platforms. For maximum robustness we also swallow any error
  // bubbled by the watcher itself.
  if (typeof watcher.on === "function") {
    watcher.on("error", (err) => {
      log.warn({ storePath, err: String(err) }, "cron: fs.watch emitted error (continuing)");
    });
  }

  log.info({ storePath, debounceMs }, "cron: file watcher started (hot-reload on external edits)");

  return {
    stop: () => {
      if (closed) {
        return;
      }
      closed = true;
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      try {
        watcher?.close();
      } catch {
        /* noop */
      }
    },
    suppressFor: (ms) => {
      const window =
        typeof ms === "number" && ms >= DEFAULT_MIN_SUPPRESS_MS ? ms : DEFAULT_MIN_SUPPRESS_MS;
      suppressUntilMs = Math.max(suppressUntilMs, state.deps.nowMs() + window);
    },
  };
}
