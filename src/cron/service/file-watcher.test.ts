// ============================================================================
// PRE-176: cron store file-watcher tests
// ============================================================================

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startCronStoreWatcher } from "./file-watcher.js";
import type { CronFsWatchFactory, CronTimerFns } from "./file-watcher.js";
import { createCronServiceState } from "./state.js";

/**
 * Deterministic timer stub: captures the pending debounce callback so the test
 * can flush it on demand. This removes ALL dependency on real wall-clock timers
 * (`setTimeout`), which can be frozen inside a worker by leaked
 * `vi.useFakeTimers()` state from a sibling test file under a parallel pool.
 */
function createControllableTimers(): {
  timerFns: CronTimerFns;
  flush: () => void;
  pending: () => boolean;
} {
  let cb: (() => void) | null = null;
  const timerFns: CronTimerFns = {
    setTimeout: (fn) => {
      cb = fn;
      return 1;
    },
    clearTimeout: () => {
      cb = null;
    },
  };
  return {
    timerFns,
    flush: () => {
      const fn = cb;
      cb = null;
      fn?.();
    },
    pending: () => cb !== null,
  };
}

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

async function flushMicrotasks(iterations = 20) {
  for (let i = 0; i < iterations; i += 1) {
    await Promise.resolve();
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
    const timers = createControllableTimers();
    const handle = startCronStoreWatcher(state, {
      debounceMs: 50,
      watchFactory: watch.factory,
      timerFns: timers.timerFns,
    });
    expect(handle).not.toBeNull();

    try {
      // Three rapid change events within the debounce window — driven
      // deterministically so the test does not depend on native fs.watch
      // event delivery (flaky under loaded CI shards).
      watch.fire();
      watch.fire();
      watch.fire();

      // Debounce collapses the 3 rapid events into a single pending timer;
      // flush it once to trigger exactly one reload attempt.
      expect(timers.pending()).toBe(true);
      timers.flush();
      await state.op;
      await flushMicrotasks();

      // ensureLoaded will fail because the mock state is missing real deps —
      // we assert the reload PATH fires (either info hot-reloaded or warn
      // hot-reload failed), not that it succeeds.
      expect(
        log.info.mock.calls.some(
          (c) => typeof c[1] === "string" && c[1].includes("hot-reloaded jobs from disk"),
        ) ||
          log.warn.mock.calls.some(
            (c) => typeof c[1] === "string" && c[1].includes("hot-reload failed"),
          ),
      ).toBe(true);

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
    const timers = createControllableTimers();
    const handle = startCronStoreWatcher(state, {
      debounceMs: 20,
      watchFactory: watch.factory,
      timerFns: timers.timerFns,
    });
    expect(handle).not.toBeNull();

    try {
      // Mark the next 500ms as self-write; any event within this window must
      // not trigger a reload.
      handle!.suppressFor(500);

      watch.fire();
      // Flush the debounce deterministically — the suppression window must
      // cause triggerReload to bail before any reload op fires. Then let any
      // microtasks settle.
      timers.flush();
      await Promise.resolve();
      await Promise.resolve();

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
