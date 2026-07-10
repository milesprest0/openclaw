import fs from "node:fs";
import { t as ensureLoaded } from "./store-BEz0x4av.js";
//#region src/cron/service/file-watcher.ts
const DEFAULT_DEBOUNCE_MS = 250;
const DEFAULT_MIN_SUPPRESS_MS = 100;
const defaultWatchFactory = (storePath, onChange) =>
  fs.watch(storePath, { persistent: false }, () => onChange());
const defaultTimerFns = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle),
};
/**
 * Start a debounced fs.watch on the cron store file. Returns a handle so the
 * caller (CronService.stop()) can tear it down cleanly.
 *
 * If the target path does not exist yet, the watcher is not started — the
 * caller should re-invoke after the file is persisted for the first time.
 */
function startCronStoreWatcher(state, options = {}) {
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
  const timerFns = options.timerFns ?? defaultTimerFns;
  let debounceTimer = null;
  let suppressUntilMs = 0;
  let closed = false;
  const triggerReload = () => {
    if (closed) return;
    debounceTimer = null;
    if (state.deps.nowMs() < suppressUntilMs) return;
    state.op = state.op
      .then(async () => {
        try {
          await ensureLoaded(state, {
            forceReload: true,
            skipRecompute: false,
          });
          log.info({ storePath }, "cron: hot-reloaded jobs from disk");
        } catch (err) {
          log.warn(
            {
              storePath,
              err: String(err),
            },
            "cron: hot-reload failed (keeping in-memory store)",
          );
        }
      })
      .catch((err) => {
        log.warn(
          {
            storePath,
            err: String(err),
          },
          "cron: hot-reload op-queue chain failed",
        );
      });
  };
  const watchFactory = options.watchFactory ?? defaultWatchFactory;
  let watcher = null;
  try {
    watcher = watchFactory(storePath, () => {
      if (closed) return;
      if (debounceTimer !== null) timerFns.clearTimeout(debounceTimer);
      debounceTimer = timerFns.setTimeout(triggerReload, debounceMs);
    });
    if (typeof watcher.unref === "function") watcher.unref();
  } catch (err) {
    log.warn(
      {
        storePath,
        err: String(err),
      },
      "cron: fs.watch failed (hot-reload disabled)",
    );
    return null;
  }
  if (typeof watcher.on === "function")
    watcher.on("error", (err) => {
      log.warn(
        {
          storePath,
          err: String(err),
        },
        "cron: fs.watch emitted error (continuing)",
      );
    });
  log.info(
    {
      storePath,
      debounceMs,
    },
    "cron: file watcher started (hot-reload on external edits)",
  );
  return {
    stop: () => {
      if (closed) return;
      closed = true;
      if (debounceTimer !== null) {
        timerFns.clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      try {
        watcher?.close();
      } catch {}
    },
    suppressFor: (ms) => {
      const window =
        typeof ms === "number" && ms >= DEFAULT_MIN_SUPPRESS_MS ? ms : DEFAULT_MIN_SUPPRESS_MS;
      suppressUntilMs = Math.max(suppressUntilMs, state.deps.nowMs() + window);
    },
  };
}
//#endregion
export { startCronStoreWatcher };
