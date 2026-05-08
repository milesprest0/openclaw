import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  InMemoryStateStore,
  StateStoreFeatureUnavailableError,
  type StateStore,
} from "./state-store.js";
import { createChannelRoutingStore } from "./channel-routing-store.js";

function newStore(opts?: { enableLiveListener?: boolean }) {
  const backing = new InMemoryStateStore("slack.channel.routing");
  const store = createChannelRoutingStore({ ...opts, store: backing });
  return { store, backing };
}

describe("ChannelRoutingStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-08T20:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("upsert + get round-trip copies fields and stamps updatedAt", async () => {
    const { store } = newStore();
    const rec = await store.upsert({
      workspaceId: "T1",
      channelId: "C1",
      modelId: "openrouter/anthropic/claude-opus-4.7",
      fallbackModels: ["openrouter/openai/gpt-5.5", "openrouter/google/gemini-3.1-pro"],
      overrideReason: "legal research lane",
      updatedBy: "miles@prest0.ai",
    });
    expect(rec.updatedAt).toBe(Date.now());
    expect(rec.enabled).toBe(true);
    expect(rec.fallbackModels).toEqual([
      "openrouter/openai/gpt-5.5",
      "openrouter/google/gemini-3.1-pro",
    ]);

    const fetched = await store.get("T1", "C1");
    expect(fetched?.modelId).toBe("openrouter/anthropic/claude-opus-4.7");
    expect(fetched?.overrideReason).toBe("legal research lane");
    expect(fetched?.updatedBy).toBe("miles@prest0.ai");
  });

  it("upsert defensively copies fallbackModels", async () => {
    const { store } = newStore();
    const fallbacks = ["a", "b"];
    await store.upsert({
      workspaceId: "T1",
      channelId: "C1",
      modelId: "m",
      fallbackModels: fallbacks,
    });
    fallbacks.push("c");
    const fetched = await store.get("T1", "C1");
    expect(fetched?.fallbackModels).toEqual(["a", "b"]);
  });

  it("resolve returns the record only when enabled !== false", async () => {
    const { store } = newStore();
    await store.upsert({
      workspaceId: "T1",
      channelId: "C1",
      modelId: "m",
      enabled: false,
    });
    expect(await store.get("T1", "C1")).toBeDefined();
    expect(await store.resolve("T1", "C1")).toBeUndefined();

    await store.upsert({ workspaceId: "T1", channelId: "C1", modelId: "m2" });
    expect((await store.resolve("T1", "C1"))?.modelId).toBe("m2");
  });

  it("remove clears hot cache and backing store", async () => {
    const { store } = newStore();
    await store.upsert({ workspaceId: "T1", channelId: "C1", modelId: "m" });
    expect(await store.get("T1", "C1")).toBeDefined();
    await store.remove("T1", "C1");
    expect(await store.get("T1", "C1")).toBeUndefined();
    expect(store.hotCacheSize).toBe(0);
  });

  it("hydrateAndWatch cold-loads + installs a live listener when supported", async () => {
    const { store, backing } = newStore();
    await backing.put("T1/C1", {
      workspaceId: "T1",
      channelId: "C1",
      modelId: "m-old",
      updatedAt: Date.now(),
    });
    const res = await store.hydrateAndWatch();
    expect(res.loaded).toBe(1);
    expect(res.listening).toBe(true);
    expect(store.hotCacheSize).toBe(1);

    // Simulate an admin-console update: write directly to the backing store.
    await backing.put("T1/C1", {
      workspaceId: "T1",
      channelId: "C1",
      modelId: "m-new",
      updatedAt: Date.now() + 1000,
    });
    // Hot cache updated via listener.
    const fetched = await store.get("T1", "C1");
    expect(fetched?.modelId).toBe("m-new");

    res.dispose();

    // After dispose, a subsequent backing-store write is NOT reflected until next get().
    await backing.put("T1/C1", {
      workspaceId: "T1",
      channelId: "C1",
      modelId: "m-after-dispose",
      updatedAt: Date.now() + 2000,
    });
    // Hot cache still shows m-new.
    const fromHot = await store.get("T1", "C1");
    // get() returns hot-cache hit first, so it's still the pre-dispose value.
    expect(fromHot?.modelId).toBe("m-new");
  });

  it("hydrateAndWatch listens to removal events", async () => {
    const { store, backing } = newStore();
    await backing.put("T1/C1", {
      workspaceId: "T1",
      channelId: "C1",
      modelId: "m",
      updatedAt: Date.now(),
    });
    const res = await store.hydrateAndWatch();
    expect(store.hotCacheSize).toBe(1);
    await backing.delete("T1/C1");
    expect(store.hotCacheSize).toBe(0);
    res.dispose();
  });

  it("hydrateAndWatch honors workspaceId prefix for both list and watch", async () => {
    const { store, backing } = newStore();
    await backing.put("T1/C1", {
      workspaceId: "T1",
      channelId: "C1",
      modelId: "m",
      updatedAt: Date.now(),
    });
    await backing.put("T2/C1", {
      workspaceId: "T2",
      channelId: "C1",
      modelId: "m",
      updatedAt: Date.now(),
    });
    const res = await store.hydrateAndWatch({ workspaceId: "T1" });
    expect(res.loaded).toBe(1);
    expect(store.hotCacheSize).toBe(1);

    // Admin writes T2 update — must NOT bleed into this store's hot cache.
    await backing.put("T2/C1", {
      workspaceId: "T2",
      channelId: "C1",
      modelId: "m-updated",
      updatedAt: Date.now(),
    });
    expect(store.hotCacheSize).toBe(1);
    res.dispose();
  });

  it("hydrateAndWatch degrades gracefully when backing store does not support watch", async () => {
    // Fake store that supports everything except watch.
    const fake: StateStore = {
      namespace: "slack.channel.routing",
      get: async () => undefined,
      put: async () => {},
      putIfAbsent: async () => true,
      delete: async () => {},
      list: async function* () {},
      watch: () => {
        throw new StateStoreFeatureUnavailableError("watch");
      },
    };
    const store = createChannelRoutingStore({ store: fake });
    const res = await store.hydrateAndWatch();
    expect(res.listening).toBe(false);
    expect(res.loaded).toBe(0);
    res.dispose(); // no-op
  });

  it("enableLiveListener=false skips watch entirely", async () => {
    const { store } = newStore({ enableLiveListener: false });
    const res = await store.hydrateAndWatch();
    expect(res.listening).toBe(false);
    res.dispose();
  });

  it("rejects empty or delimited keys", async () => {
    const { store } = newStore();
    await expect(
      store.upsert({ workspaceId: "", channelId: "C", modelId: "m" }),
    ).rejects.toThrow(/workspaceId/);
    await expect(
      store.upsert({ workspaceId: "T", channelId: "C/bad", modelId: "m" }),
    ).rejects.toThrow(/channelId/);
    await expect(
      store.upsert({ workspaceId: "T", channelId: "C", modelId: "" }),
    ).rejects.toThrow(/modelId/);
  });
});
