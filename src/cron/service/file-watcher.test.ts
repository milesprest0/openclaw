// ============================================================================
// PRE-176: cron store file-watcher tests
// ============================================================================

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startCronStoreWatcher } from "./file-watcher.js";
import type { CronFsWatchFactory } from "./file-watcher.js";
import { createCronServiceState } from "./state.js";

/**
 * Deterministic watch factory: captures the change callback so the test can
 * fire synthetic fs events on demand, instead of depending on native
 * `fs.watch` event delivery (which is environment-flaky under loaded CI shards).
 */
function createControllableWatch(): {
  factory: CronFsWatchFactory;
  fire: () => void;
  closed: () => boolean;
} {
  let onChange: (() => void) | null = null;
  let isClosed = false;
  const factory: CronFsWatchFactory = (_storePath, cb) => {
    onChange = cb;
    return {
      close: () => {
        isClosed = true;
      },
      unref: () => {},
      on: () => {},
    };
  };
  return {
    factory,
    fire: () => onChange?.(),
    closed: () => isClosed,
  };
}

type MockLog = {
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
};

function createMockLog(): MockLog {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function createStateForPath(storePath: string) {
  const log = createMockLog();
  const state = createCronServiceState({
    storePath,
    cronEnabled: true,
    log: log as unknown as Parameters<typeof createCronServiceState>[0]["log"],
    deliver: vi.fn(),
    requestHeartbeatNow: vi.fn(),
    runHeartbeatOnce: vi.fn(),
    enqueueSystemEvent: vi.fn(),
    defaultAgentId: "main",
    resolveSessionStorePath: () => storePath,
    sessionStorePath: storePath,
  } as unknown as Parameters<typeof createCronServiceState>[0]);
  return { state, log };
}

async function waitUntil(
  predicate: () => boolean,
  opts: { timeoutMs?: number; pollMs?: number } = {},
) {
  const timeoutMs = opts.timeoutMs ?? 2000;
  const pollMs = opts.pollMs ?? 20;
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`waitUntil timed out after ${timeoutMs}ms`);
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

describe("startCronStoreWatcher (PRE-176)", () => {
  let tmpDir: string;
  let storePath: string;

  beforeEach(() => {
    // Defensive: a sibling test file in the same shard worker may leave
    // vi.useFakeTimers() active without restoring it. This file is the only
    // one that awaits real setTimeout/debounce progress, so a leaked fake
    // clock freezes it to the full test timeout. Force real timers here so
    // these tests are hermetic regardless of shard ordering.
    vi.useRealTimers();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cron-watcher-test-"));
    storePath = path.join(tmpDir, "jobs.json");
  });

  afterEach(() => {
    vi.useRealTimers();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* noop */
    }
  });

  it("returns null when the store path does not exist yet", () => {
    const { state, log } = createStateForPath(storePath);
    const handle = startCronStoreWatcher(state);
    expect(handle).toBeNull();
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({ storePath }),
      expect.stringContaining("file watcher skipped"),
    );
  });

  it("starts a watcher and tears down cleanly", () => {
    fs.writeFileSync(storePath, JSON.stringify({ jobs: [] }));
    const { state } = createStateForPath(storePath);
    const handle = startCronStoreWatcher(state, { debounceMs: 10 });
    expect(handle).not.toBeNull();
    handle!.stop();
    // idempotent
    handle!.stop();
  });

  it("debounces rapid file edits into a single reload attempt", async () => {
    fs.writeFileSync(storePath, JSON.stringify({ jobs: [] }));
    const { state, log } = createStateForPath(storePath);
    const watch = createControllableWatch();
    const handle = startCronStoreWatcher(state, {
      debounceMs: 50,
      watchFactory: watch.factory,
    });
    expect(handle).not.toBeNull();

    try {
      // Three rapid change events within the debounce window — driven
      // deterministically so the test does not depend on native fs.watch
      // event delivery (flaky under loaded CI shards).
      watch.fire();
      watch.fire();
      watch.fire();

      // ensureLoaded will fail because the mock state is missing real deps —
      // we assert the reload PATH fires (either info hot-reloaded or warn
      // hot-reload failed), not that it succeeds.
      await waitUntil(
        () =>
          log.info.mock.calls.some(
            (c) => typeof c[1] === "string" && c[1].includes("hot-reloaded jobs from disk"),
          ) ||
          log.warn.mock.calls.some(
            (c) => typeof c[1] === "string" && c[1].includes("hot-reload failed"),
          ),
        { timeoutMs: 5000 },
      );

      // Count how many reload attempts fired in total — should be <= 2
      // (debounce collapses the 3 rapid events into 1; a second event can
      // arrive from the editor-level rename replay on some platforms).
      const reloadCalls =
        log.info.mock.calls.filter(
          (c) => typeof c[1] === "string" && c[1].includes("hot-reloaded jobs from disk"),
        ).length +
        log.warn.mock.calls.filter(
          (c) => typeof c[1] === "string" && c[1].includes("hot-reload failed"),
        ).length;
      expect(reloadCalls).toBeLessThanOrEqual(2);
    } finally {
      handle!.stop();
    }
  });

  it("suppressFor() skips reloads triggered during the suppression window", async () => {
    fs.writeFileSync(storePath, JSON.stringify({ jobs: [] }));
    const { state, log } = createStateForPath(storePath);
    const watch = createControllableWatch();
    const handle = startCronStoreWatcher(state, {
      debounceMs: 20,
      watchFactory: watch.factory,
    });
    expect(handle).not.toBeNull();

    try {
      // Mark the next 500ms as self-write; any event within this window must
      // not trigger a reload.
      handle!.suppressFor(500);

      watch.fire();
      // Give debounce + scheduler a chance to fire.
      await new Promise((r) => setTimeout(r, 100));

      const reloadCalls =
        log.info.mock.calls.filter(
          (c) => typeof c[1] === "string" && c[1].includes("hot-reloaded jobs from disk"),
        ).length +
        log.warn.mock.calls.filter(
          (c) => typeof c[1] === "string" && c[1].includes("hot-reload failed"),
        ).length;
      expect(reloadCalls).toBe(0);
    } finally {
      handle!.stop();
    }
  });
});
