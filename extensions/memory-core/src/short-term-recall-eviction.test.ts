import { describe, expect, it } from "vitest";
import type { ShortTermRecallEntry } from "./short-term-promotion.js";
import { __testing } from "./short-term-promotion.js";

const NOW_MS = Date.parse("2026-06-01T12:00:00.000Z");

function buildEntry(params: {
  key: string;
  totalScore: number;
  lastRecalledAt: string;
  recallCount?: number;
}): ShortTermRecallEntry {
  return {
    key: params.key,
    path: "memory/2026-05-01.md",
    startLine: 1,
    endLine: 2,
    source: "memory",
    snippet: params.key,
    recallCount: params.recallCount ?? 1,
    dailyCount: 0,
    groundedCount: 0,
    totalScore: params.totalScore,
    maxScore: Math.max(0, Math.min(1, params.totalScore)),
    firstRecalledAt: "2026-05-01T00:00:00.000Z",
    lastRecalledAt: params.lastRecalledAt,
    queryHashes: [],
    recallDays: ["2026-05-01"],
    conceptTags: [],
  };
}

describe("short-term recall eviction", () => {
  it("trims over-cap stores by total score and recency tie-break", () => {
    const entries = {
      "memory:a:1:2": buildEntry({
        key: "memory:a:1:2",
        totalScore: 9,
        lastRecalledAt: "2026-05-15T00:00:00.000Z",
      }),
      "memory:b:1:2": buildEntry({
        key: "memory:b:1:2",
        totalScore: 7,
        lastRecalledAt: "2026-05-20T00:00:00.000Z",
      }),
      "memory:c:1:2": buildEntry({
        key: "memory:c:1:2",
        totalScore: 7,
        lastRecalledAt: "2026-05-10T00:00:00.000Z",
      }),
      "memory:d:1:2": buildEntry({
        key: "memory:d:1:2",
        totalScore: 4,
        lastRecalledAt: "2026-05-21T00:00:00.000Z",
      }),
    };

    const trimmed = __testing.evictRecallEntries(
      entries,
      { maxEntries: 2, ttlDays: 90, minRecallCount: 0 },
      NOW_MS,
    );

    expect(Object.keys(trimmed).toSorted()).toEqual(["memory:a:1:2", "memory:b:1:2"]);
  });

  it("drops stale low-recall entries by TTL", () => {
    const entries = {
      "memory:stale-low:1:2": buildEntry({
        key: "memory:stale-low:1:2",
        totalScore: 5,
        recallCount: 1,
        lastRecalledAt: "2026-01-01T00:00:00.000Z",
      }),
      "memory:stale-high:1:2": buildEntry({
        key: "memory:stale-high:1:2",
        totalScore: 4,
        recallCount: 3,
        lastRecalledAt: "2026-01-01T00:00:00.000Z",
      }),
      "memory:recent-low:1:2": buildEntry({
        key: "memory:recent-low:1:2",
        totalScore: 3,
        recallCount: 1,
        lastRecalledAt: "2026-05-25T00:00:00.000Z",
      }),
    };

    const trimmed = __testing.evictRecallEntries(
      entries,
      { maxEntries: 10, ttlDays: 90, minRecallCount: 2 },
      NOW_MS,
    );

    expect(Object.keys(trimmed).toSorted()).toEqual([
      "memory:recent-low:1:2",
      "memory:stale-high:1:2",
    ]);
  });

  it("retains entries that are recent or frequently recalled", () => {
    const entries = {
      "memory:old-frequent:1:2": buildEntry({
        key: "memory:old-frequent:1:2",
        totalScore: 2,
        recallCount: 5,
        lastRecalledAt: "2025-12-01T00:00:00.000Z",
      }),
      "memory:recent-rare:1:2": buildEntry({
        key: "memory:recent-rare:1:2",
        totalScore: 2,
        recallCount: 1,
        lastRecalledAt: "2026-05-30T00:00:00.000Z",
      }),
    };

    const trimmed = __testing.evictRecallEntries(
      entries,
      { maxEntries: 10, ttlDays: 90, minRecallCount: 2 },
      NOW_MS,
    );

    expect(Object.keys(trimmed).toSorted()).toEqual([
      "memory:old-frequent:1:2",
      "memory:recent-rare:1:2",
    ]);
  });

  it("keeps under-cap stores unchanged", () => {
    const entries = {
      "memory:a:1:2": buildEntry({
        key: "memory:a:1:2",
        totalScore: 2,
        lastRecalledAt: "2026-05-20T00:00:00.000Z",
      }),
      "memory:b:1:2": buildEntry({
        key: "memory:b:1:2",
        totalScore: 1,
        lastRecalledAt: "2026-05-19T00:00:00.000Z",
      }),
    };

    const trimmed = __testing.evictRecallEntries(
      entries,
      { maxEntries: 5, ttlDays: 90, minRecallCount: 2 },
      NOW_MS,
    );

    expect(trimmed).toEqual(entries);
  });
});
