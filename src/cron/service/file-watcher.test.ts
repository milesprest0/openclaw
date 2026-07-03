// ============================================================================
// PRE-176: cron store file-watcher tests
// ============================================================================

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startCronStoreWatcher } from "./file-watcher.js";
import { createCronServiceState } from "./state.js";

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
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cron-watcher-test-"));
    storePath = path.join(tmpDir, "jobs.json");
  });

  afterEach(() => {
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
    const handle = startCronStoreWatcher(state, { debounceMs: 50 });
    expect(handle).not.toBeNull();

    try {
      // Three rapid edits within the debounce window.
      fs.writeFileSync(storePath, JSON.stringify({ jobs: [] }));
      await new Promise((r) => setTimeout(r, 5));
      fs.writeFileSync(storePath, JSON.stringify({ jobs: [] }));
      await new Promise((r) => setTimeout(r, 5));
      fs.writeFileSync(storePath, JSON.stringify({ jobs: [] }));

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
        { timeoutMs: 10000 },
      );

      // Count how many reload attempts fired in total — should be <= 2
      // (debounce collapses the 3 rapid edits into 1, and a second event can
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
    const handle = startCronStoreWatcher(state, { debounceMs: 20 });
    expect(handle).not.toBeNull();

    try {
      // Mark the next 500ms as self-write; any edit within this window must
      // not trigger a reload.
      handle!.suppressFor(500);

      fs.writeFileSync(storePath, JSON.stringify({ jobs: [] }));
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
