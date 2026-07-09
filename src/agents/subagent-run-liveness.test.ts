import { describe, expect, it, vi } from "vitest";
import {
  assessRunLiveness,
  DEFAULT_FRESHNESS_MS,
  isLiveUnendedSubagentRun,
  RECENT_ENDED_SUBAGENT_CHILD_SESSION_MS,
  isStaleUnendedSubagentRun,
  STALE_UNENDED_SUBAGENT_RUN_MS,
  shouldKeepSubagentRunChildLink,
} from "./subagent-run-liveness.js";

describe("subagent run liveness", () => {
  const now = Date.parse("2026-04-25T12:00:00Z");

  it("keeps fresh unended runs live", () => {
    const entry = {
      createdAt: now - 60_000,
    };
    expect(isLiveUnendedSubagentRun(entry, now)).toBe(true);
    expect(isStaleUnendedSubagentRun(entry, now)).toBe(false);
  });

  it("assessRunLiveness marks missing run as dead and stops monitoring", () => {
    expect(assessRunLiveness(undefined, now)).toEqual({
      state: "dead",
      announceStillRunning: false,
      stopMonitoring: true,
    });
  });

  it("assessRunLiveness marks ended runs as dead and stops monitoring", () => {
    expect(
      assessRunLiveness(
        {
          createdAt: now - 30_000,
          endedAt: now - 1,
        },
        now,
      ),
    ).toEqual({
      state: "dead",
      announceStillRunning: false,
      stopMonitoring: true,
    });
  });

  it("assessRunLiveness marks fresh unended runs live", () => {
    expect(
      assessRunLiveness(
        {
          createdAt: now - 2 * 60_000,
          startedAt: now - 60_000,
        },
        now,
      ),
    ).toEqual({
      state: "live",
      announceStillRunning: true,
      stopMonitoring: false,
    });
  });

  it("assessRunLiveness marks stale unended runs dead beyond freshness", () => {
    expect(
      assessRunLiveness(
        {
          createdAt: now - DEFAULT_FRESHNESS_MS - 60_000,
          startedAt: now - DEFAULT_FRESHNESS_MS - 1,
        },
        now,
      ),
    ).toEqual({
      state: "dead",
      announceStillRunning: false,
      stopMonitoring: true,
    });
  });

  it("assessRunLiveness fails open as unknown for garbage timestamps", () => {
    expect(
      assessRunLiveness(
        {
          createdAt: Number.NaN,
          startedAt: Number.NaN,
          sessionStartedAt: Number.NaN,
        },
        now,
      ),
    ).toEqual({
      state: "unknown",
      announceStillRunning: true,
      stopMonitoring: false,
    });
  });

  it("respects PREST0N_RUN_LIVENESS_FRESHNESS_MS overrides", async () => {
    const previous = process.env.PREST0N_RUN_LIVENESS_FRESHNESS_MS;
    vi.resetModules();
    process.env.PREST0N_RUN_LIVENESS_FRESHNESS_MS = "1500";
    try {
      const mod = await import("./subagent-run-liveness.js");
      expect(mod.DEFAULT_FRESHNESS_MS).toBe(1500);
      expect(
        mod.assessRunLiveness(
          {
            createdAt: now - 2_000,
            startedAt: now - 1_600,
          },
          now,
        ),
      ).toEqual({
        state: "dead",
        announceStillRunning: false,
        stopMonitoring: true,
      });
    } finally {
      if (previous == null) {
        delete process.env.PREST0N_RUN_LIVENESS_FRESHNESS_MS;
      } else {
        process.env.PREST0N_RUN_LIVENESS_FRESHNESS_MS = previous;
      }
      vi.resetModules();
    }
  });

  it("marks old unended runs stale when no explicit timeout extends the window", () => {
    const entry = {
      createdAt: now - STALE_UNENDED_SUBAGENT_RUN_MS - 1,
    };
    expect(isStaleUnendedSubagentRun(entry, now)).toBe(true);
    expect(isLiveUnendedSubagentRun(entry, now)).toBe(false);
  });

  it("does not mark ended runs stale", () => {
    const entry = {
      createdAt: now - STALE_UNENDED_SUBAGENT_RUN_MS - 1,
      endedAt: now - 1,
    };
    expect(isStaleUnendedSubagentRun(entry, now)).toBe(false);
    expect(isLiveUnendedSubagentRun(entry, now)).toBe(false);
  });

  it("uses sessionStartedAt ahead of createdAt", () => {
    const entry = {
      createdAt: now - STALE_UNENDED_SUBAGENT_RUN_MS - 1,
      sessionStartedAt: now - 60_000,
    };
    expect(isStaleUnendedSubagentRun(entry, now)).toBe(false);
    expect(isLiveUnendedSubagentRun(entry, now)).toBe(true);
  });

  it("extends stale cutoff for explicit long run timeouts", () => {
    const entry = {
      createdAt: now - STALE_UNENDED_SUBAGENT_RUN_MS - 1,
      runTimeoutSeconds: 6 * 60 * 60,
    };
    expect(isStaleUnendedSubagentRun(entry, now)).toBe(false);
    expect(isLiveUnendedSubagentRun(entry, now)).toBe(true);
  });

  it("ignores non-real fixture timestamps as unknown instead of stale", () => {
    const entry = {
      createdAt: 100,
    };
    expect(isStaleUnendedSubagentRun(entry, now)).toBe(false);
    expect(isLiveUnendedSubagentRun(entry, now)).toBe(true);
  });

  it("defaults to current time when now is omitted", () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    try {
      expect(
        isStaleUnendedSubagentRun({
          createdAt: now - STALE_UNENDED_SUBAGENT_RUN_MS - 1,
        }),
      ).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps child links only while live, recently ended, or waiting on descendants", () => {
    expect(shouldKeepSubagentRunChildLink({ createdAt: now - 60_000 }, { now })).toBe(true);
    expect(
      shouldKeepSubagentRunChildLink(
        {
          createdAt: now - RECENT_ENDED_SUBAGENT_CHILD_SESSION_MS - 60_000,
          endedAt: now - RECENT_ENDED_SUBAGENT_CHILD_SESSION_MS + 1,
        },
        { now },
      ),
    ).toBe(true);
    expect(
      shouldKeepSubagentRunChildLink(
        {
          createdAt: now - RECENT_ENDED_SUBAGENT_CHILD_SESSION_MS - 60_000,
          endedAt: now - RECENT_ENDED_SUBAGENT_CHILD_SESSION_MS - 1,
        },
        { now },
      ),
    ).toBe(false);
    expect(
      shouldKeepSubagentRunChildLink(
        {
          createdAt: now - RECENT_ENDED_SUBAGENT_CHILD_SESSION_MS - 60_000,
          endedAt: now - RECENT_ENDED_SUBAGENT_CHILD_SESSION_MS - 1,
        },
        { activeDescendants: 1, now },
      ),
    ).toBe(true);
    expect(
      shouldKeepSubagentRunChildLink(
        {
          createdAt: now - STALE_UNENDED_SUBAGENT_RUN_MS - 1,
        },
        { now },
      ),
    ).toBe(false);
  });
});
