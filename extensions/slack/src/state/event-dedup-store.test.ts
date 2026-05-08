import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_EVENT_DEDUP_TTL_MS,
  MIN_EVENT_DEDUP_TTL_MS,
  createEventDedupStore,
} from "./event-dedup-store.js";
import { InMemoryStateStore } from "./state-store.js";

function newStore(ttlMs?: number) {
  const backing = new InMemoryStateStore("slack.events.seen");
  const dedup = createEventDedupStore({ ttlMs, store: backing });
  return { dedup, backing };
}

describe("EventDedupStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("first sighting returns firstSighting=true and records the event", async () => {
    const { dedup } = newStore();
    const res = await dedup.checkAndRecord({
      workspaceId: "T1",
      eventId: "Ev1",
      vmAccount: "fernando",
      channelId: "C1",
      threadTs: "1778260467.132069",
    });
    expect(res.firstSighting).toBe(true);
    expect(res.record.workspaceId).toBe("T1");
    expect(res.record.eventId).toBe("Ev1");
    expect(res.record.vmAccount).toBe("fernando");
    expect(res.record.channelId).toBe("C1");
    expect(res.record.threadTs).toBe("1778260467.132069");
    expect(res.record.receivedAt).toBe(Date.now());
  });

  it("second sighting returns firstSighting=false and the original record", async () => {
    const { dedup } = newStore();
    const first = await dedup.checkAndRecord({
      workspaceId: "T1",
      eventId: "Ev1",
      vmAccount: "fernando",
    });
    vi.setSystemTime(Date.now() + 5_000);
    const second = await dedup.checkAndRecord({
      workspaceId: "T1",
      eventId: "Ev1",
      vmAccount: "internal", // different VM — still treated as dup
    });

    expect(second.firstSighting).toBe(false);
    // Returned record must be the ORIGINAL, not the retry.
    expect(second.record.receivedAt).toBe(first.record.receivedAt);
    expect(second.record.vmAccount).toBe("fernando");
  });

  it("entries expire after TTL and a post-TTL retry is a fresh first sighting", async () => {
    const { dedup } = newStore();
    const first = await dedup.checkAndRecord({ workspaceId: "T1", eventId: "Ev1" });
    expect(first.firstSighting).toBe(true);

    vi.setSystemTime(Date.now() + DEFAULT_EVENT_DEDUP_TTL_MS + 1_000);

    const second = await dedup.checkAndRecord({ workspaceId: "T1", eventId: "Ev1" });
    expect(second.firstSighting).toBe(true);
    expect(second.record.receivedAt).toBeGreaterThan(first.record.receivedAt);
  });

  it("TTL below MIN is clamped to MIN", () => {
    const { dedup } = newStore(1_000);
    expect(dedup.ttlMs).toBe(MIN_EVENT_DEDUP_TTL_MS);
  });

  it("different workspaces are isolated", async () => {
    const { dedup } = newStore();
    const a = await dedup.checkAndRecord({ workspaceId: "T1", eventId: "Ev1" });
    const b = await dedup.checkAndRecord({ workspaceId: "T2", eventId: "Ev1" });
    expect(a.firstSighting).toBe(true);
    expect(b.firstSighting).toBe(true);
  });

  it("has() returns true only when a non-expired record exists", async () => {
    const { dedup } = newStore();
    expect(await dedup.has("T1", "Ev1")).toBe(false);
    await dedup.checkAndRecord({ workspaceId: "T1", eventId: "Ev1" });
    expect(await dedup.has("T1", "Ev1")).toBe(true);
    vi.setSystemTime(Date.now() + DEFAULT_EVENT_DEDUP_TTL_MS + 1_000);
    expect(await dedup.has("T1", "Ev1")).toBe(false);
  });

  it("get() returns undefined when missing, record when present", async () => {
    const { dedup } = newStore();
    expect(await dedup.get("T1", "Ev1")).toBeUndefined();
    await dedup.checkAndRecord({
      workspaceId: "T1",
      eventId: "Ev1",
      vmAccount: "fernando",
      channelId: "C1",
    });
    const rec = await dedup.get("T1", "Ev1");
    expect(rec).toBeDefined();
    expect(rec?.vmAccount).toBe("fernando");
    expect(rec?.channelId).toBe("C1");
  });

  it("rejects empty keys", async () => {
    const { dedup } = newStore();
    await expect(
      dedup.checkAndRecord({ workspaceId: "", eventId: "Ev1" }),
    ).rejects.toThrow(/workspaceId/);
    await expect(
      dedup.checkAndRecord({ workspaceId: "T1", eventId: "" }),
    ).rejects.toThrow(/eventId/);
  });

  it("rejects keys containing the namespace delimiter", async () => {
    const { dedup } = newStore();
    await expect(
      dedup.checkAndRecord({ workspaceId: "T/1", eventId: "Ev1" }),
    ).rejects.toThrow(/workspaceId/);
    await expect(
      dedup.checkAndRecord({ workspaceId: "T1", eventId: "Ev/1" }),
    ).rejects.toThrow(/eventId/);
  });

  it("burst of 20 retries of the same event yields exactly one firstSighting", async () => {
    const { dedup } = newStore();
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        dedup.checkAndRecord({ workspaceId: "T1", eventId: "Ev1" }),
      ),
    );
    const firstCount = results.filter((r) => r.firstSighting).length;
    expect(firstCount).toBe(1);
  });
});
