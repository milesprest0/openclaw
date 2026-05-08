import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryStateStore } from "./state-store.js";
import {
  DEFAULT_THREAD_PARTICIPATION_TTL_MS,
  createThreadParticipationStore,
} from "./thread-participation-store.js";

function newStore(opts?: { ttlMs?: number; hotCacheMax?: number }) {
  const backing = new InMemoryStateStore("slack.thread.part");
  const store = createThreadParticipationStore({ ...opts, store: backing });
  return { store, backing };
}

describe("ThreadParticipationStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-08T20:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("markActive inserts a fresh record with joinedAt == lastActivityAt == now", async () => {
    const { store } = newStore();
    const rec = await store.markActive({
      workspaceId: "T1",
      channelId: "C1",
      threadTs: "1000.1",
      vmAccount: "fernando",
      reason: "mention",
    });
    expect(rec.joinedAt).toBe(Date.now());
    expect(rec.lastActivityAt).toBe(Date.now());
    expect(rec.vmAccount).toBe("fernando");
    expect(rec.reason).toBe("mention");
  });

  it("markActive on existing thread preserves joinedAt + reason, updates lastActivityAt", async () => {
    const { store } = newStore();
    const first = await store.markActive({
      workspaceId: "T1",
      channelId: "C1",
      threadTs: "1000.1",
      vmAccount: "fernando",
      reason: "mention",
    });
    vi.setSystemTime(Date.now() + 60_000);
    const second = await store.markActive({
      workspaceId: "T1",
      channelId: "C1",
      threadTs: "1000.1",
      vmAccount: "internal",
      reason: "command", // should be IGNORED on updates
    });
    expect(second.joinedAt).toBe(first.joinedAt);
    expect(second.reason).toBe("mention"); // immutable
    expect(second.vmAccount).toBe("internal"); // mutable
    expect(second.lastActivityAt).toBe(first.lastActivityAt + 60_000);
  });

  it("has / get reflect markActive + forget", async () => {
    const { store } = newStore();
    expect(await store.has("T1", "C1", "t")).toBe(false);
    await store.markActive({ workspaceId: "T1", channelId: "C1", threadTs: "t" });
    expect(await store.has("T1", "C1", "t")).toBe(true);
    expect((await store.get("T1", "C1", "t"))?.threadTs).toBe("t");
    await store.forget("T1", "C1", "t");
    expect(await store.has("T1", "C1", "t")).toBe(false);
  });

  it("TTL expiry: record drops from hot cache AND store after lastActivityAt + TTL", async () => {
    const { store } = newStore();
    await store.markActive({ workspaceId: "T1", channelId: "C1", threadTs: "t" });
    vi.setSystemTime(Date.now() + DEFAULT_THREAD_PARTICIPATION_TTL_MS + 1_000);
    expect(await store.has("T1", "C1", "t")).toBe(false);
  });

  it("markActive extends the TTL window (sliding expiration)", async () => {
    const { store } = newStore();
    await store.markActive({ workspaceId: "T1", channelId: "C1", threadTs: "t" });
    // One day before TTL, renew.
    vi.setSystemTime(Date.now() + DEFAULT_THREAD_PARTICIPATION_TTL_MS - 86_400_000);
    await store.markActive({ workspaceId: "T1", channelId: "C1", threadTs: "t" });
    // Now advance past the ORIGINAL TTL but within the renewed TTL.
    vi.setSystemTime(Date.now() + 86_400_000 + 60_000);
    expect(await store.has("T1", "C1", "t")).toBe(true);
  });

  it("loadAll hydrates the hot cache in one pass", async () => {
    const { store, backing } = newStore();
    // Pre-populate the backing store as if from a prior VM run.
    const expiresAt = Date.now() + DEFAULT_THREAD_PARTICIPATION_TTL_MS;
    for (let i = 0; i < 10; i++) {
      await backing.put(
        `T1/C1/t${i}`,
        {
          workspaceId: "T1",
          channelId: "C1",
          threadTs: `t${i}`,
          joinedAt: Date.now() - 1000,
          lastActivityAt: Date.now() - 1000,
        },
        { expiresAt },
      );
    }
    expect(store.hotCacheSize).toBe(0);
    const res = await store.loadAll();
    expect(res.loaded).toBe(10);
    expect(store.hotCacheSize).toBe(10);
    expect(await store.has("T1", "C1", "t7")).toBe(true);
  });

  it("loadAll is a no-op on the second call unless force=true", async () => {
    const { store, backing } = newStore();
    await backing.put(
      "T1/C1/t",
      { workspaceId: "T1", channelId: "C1", threadTs: "t", joinedAt: Date.now(), lastActivityAt: Date.now() },
      { expiresAt: Date.now() + DEFAULT_THREAD_PARTICIPATION_TTL_MS },
    );
    const first = await store.loadAll();
    expect(first.loaded).toBe(1);

    // Add a new entry — second loadAll() without force should NOT pick it up.
    await backing.put(
      "T1/C1/t2",
      {
        workspaceId: "T1",
        channelId: "C1",
        threadTs: "t2",
        joinedAt: Date.now(),
        lastActivityAt: Date.now(),
      },
      { expiresAt: Date.now() + DEFAULT_THREAD_PARTICIPATION_TTL_MS },
    );
    const second = await store.loadAll();
    expect(second.loaded).toBe(store.hotCacheSize);
    expect(second.durationMs).toBe(0);
    expect(store.hotCacheSize).toBe(1); // still 1 — not re-loaded

    const forced = await store.loadAll({ force: true });
    expect(forced.loaded).toBe(2);
  });

  it("loadAll honors workspaceId prefix filter", async () => {
    const { store, backing } = newStore();
    const expiresAt = Date.now() + DEFAULT_THREAD_PARTICIPATION_TTL_MS;
    await backing.put(
      "T1/C1/t",
      { workspaceId: "T1", channelId: "C1", threadTs: "t", joinedAt: 0, lastActivityAt: Date.now() },
      { expiresAt },
    );
    await backing.put(
      "T2/C1/t",
      { workspaceId: "T2", channelId: "C1", threadTs: "t", joinedAt: 0, lastActivityAt: Date.now() },
      { expiresAt },
    );
    const res = await store.loadAll({ workspaceId: "T1" });
    expect(res.loaded).toBe(1);
    expect(store.hotCacheSize).toBe(1);
  });

  it("hot cache evicts LRU when capacity exceeded", async () => {
    const { store } = newStore({ hotCacheMax: 3 });
    await store.markActive({ workspaceId: "T1", channelId: "C1", threadTs: "a" });
    await store.markActive({ workspaceId: "T1", channelId: "C1", threadTs: "b" });
    await store.markActive({ workspaceId: "T1", channelId: "C1", threadTs: "c" });
    // Access "a" to bump its LRU position
    await store.get("T1", "C1", "a");
    // Insert "d" — should evict "b" (least recently used)
    await store.markActive({ workspaceId: "T1", channelId: "C1", threadTs: "d" });
    expect(store.hotCacheSize).toBe(3);
    // "b" gone from hot cache but still in backing store; re-access re-hydrates
    expect(await store.has("T1", "C1", "b")).toBe(true);
    expect(store.hotCacheSize).toBe(3);
  });

  it("rejects keys with / delimiter or empty parts", async () => {
    const { store } = newStore();
    await expect(
      store.markActive({ workspaceId: "", channelId: "C", threadTs: "t" }),
    ).rejects.toThrow(/workspaceId/);
    await expect(
      store.markActive({ workspaceId: "T", channelId: "C/bad", threadTs: "t" }),
    ).rejects.toThrow(/channelId/);
    await expect(
      store.markActive({ workspaceId: "T", channelId: "C", threadTs: "t/s" }),
    ).rejects.toThrow(/threadTs/);
  });
});
