import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  InMemoryStateStore,
  clearInMemoryRegistryForTest,
  getStateStore,
  setStateStoreFactory,
  type StateStore,
  type StateStoreFactory,
} from "./state-store.js";

describe("InMemoryStateStore", () => {
  let store: InMemoryStateStore;

  beforeEach(() => {
    store = new InMemoryStateStore("slack.test");
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("put + get round-trip", async () => {
    await store.put("k", { n: 1 });
    const got = await store.get<{ n: number }>("k");
    expect(got).toEqual({ key: "k", value: { n: 1 }, expiresAt: undefined });
  });

  it("returns undefined for missing keys", async () => {
    const got = await store.get("nope");
    expect(got).toBeUndefined();
  });

  it("TTL expiration: get() returns undefined and prunes", async () => {
    await store.put("k", "v", { ttlMs: 1000 });
    expect((await store.get("k"))?.value).toBe("v");

    vi.setSystemTime(Date.now() + 1500);

    expect(await store.get("k")).toBeUndefined();
    // After pruning, it's really gone.
    const seen: string[] = [];
    for await (const e of store.list()) {
      seen.push(e.key);
    }
    expect(seen).not.toContain("k");
  });

  it("ttlMs=0 means persistent, not expired immediately", async () => {
    await store.put("k", "v", { ttlMs: 0 });
    vi.setSystemTime(Date.now() + 86_400_000);
    expect((await store.get("k"))?.value).toBe("v");
  });

  it("absolute expiresAt overrides ttlMs", async () => {
    const fixed = Date.now() + 5_000;
    await store.put("k", "v", { ttlMs: 60_000, expiresAt: fixed });
    const got = await store.get("k");
    expect(got?.expiresAt).toBe(fixed);
  });

  it("putIfAbsent: first write wins, second no-ops", async () => {
    const first = await store.putIfAbsent("k", "a");
    const second = await store.putIfAbsent("k", "b");
    expect(first).toBe(true);
    expect(second).toBe(false);
    expect((await store.get("k"))?.value).toBe("a");
  });

  it("putIfAbsent: treats expired entry as absent", async () => {
    await store.put("k", "stale", { ttlMs: 1000 });
    vi.setSystemTime(Date.now() + 2000);
    const ok = await store.putIfAbsent("k", "fresh");
    expect(ok).toBe(true);
    expect((await store.get("k"))?.value).toBe("fresh");
  });

  it("delete removes entry and fires watcher", async () => {
    const seen: Array<{ kind: string; key: string }> = [];
    const unsubscribe = store.watch("k", (c) => seen.push({ kind: c.kind, key: c.key }));
    await store.put("k", 1);
    await store.delete("k");
    unsubscribe();
    expect(await store.get("k")).toBeUndefined();
    expect(seen.map((s) => s.kind)).toEqual(["added", "removed"]);
  });

  it("list: prefix filter + prunes expired entries", async () => {
    await store.put("a/1", "one");
    await store.put("a/2", "two", { ttlMs: 1000 });
    await store.put("b/1", "bee");

    vi.setSystemTime(Date.now() + 2000);

    const seen: Record<string, unknown> = {};
    for await (const e of store.list("a/")) {
      seen[e.key] = e.value;
    }
    expect(seen).toEqual({ "a/1": "one" });
  });

  it("watch: fires added / modified / removed and respects prefix", async () => {
    const events: string[] = [];
    const stop = store.watch<string>("room/", (c) => {
      events.push(`${c.kind}:${c.key}`);
    });

    await store.put("room/1", "hello");
    await store.put("room/1", "world"); // modified
    await store.put("other/1", "x"); // prefix filter: ignored
    await store.delete("room/1");

    stop();
    await store.put("room/1", "after-unsub"); // ignored

    expect(events).toEqual(["added:room/1", "modified:room/1", "removed:room/1"]);
  });

  it("watcher errors do not block sibling watchers", async () => {
    const good: string[] = [];
    store.watch("k", () => {
      throw new Error("boom");
    });
    store.watch("k", (c) => {
      if (c.kind !== "removed") {
        good.push(c.key);
      }
    });
    await store.put("k", 1);
    expect(good).toEqual(["k"]);
  });

  it("clearForTest wipes everything", async () => {
    await store.put("a", 1);
    store.watch("", () => {});
    store.clearForTest();
    expect(await store.get("a")).toBeUndefined();
  });
});

describe("getStateStore / setStateStoreFactory", () => {
  afterEach(() => {
    setStateStoreFactory(undefined);
    clearInMemoryRegistryForTest();
  });

  it("falls back to in-memory when no factory is registered", () => {
    const a = getStateStore("slack.events.seen");
    expect(a).toBeInstanceOf(InMemoryStateStore);
    expect(a.namespace).toBe("slack.events.seen");
  });

  it("returns the SAME instance across calls for the in-memory fallback", () => {
    const a = getStateStore("slack.thread.part");
    const b = getStateStore("slack.thread.part");
    expect(a).toBe(b);
  });

  it("returns DIFFERENT instances per namespace", () => {
    const a = getStateStore("slack.events.seen");
    const b = getStateStore("slack.channel.routing");
    expect(a).not.toBe(b);
  });

  it("registered factory wins over in-memory fallback", () => {
    const fake: StateStore = {
      namespace: "slack.events.seen",
      get: async () => undefined,
      put: async () => {},
      putIfAbsent: async () => true,
      delete: async () => {},
      list: async function* () {},
      watch: () => () => {},
    };
    const factory: StateStoreFactory = () => fake;
    setStateStoreFactory(factory);
    expect(getStateStore("slack.events.seen")).toBe(fake);
  });

  it("unsetting the factory restores in-memory fallback", () => {
    const fake: StateStore = {
      namespace: "x",
      get: async () => undefined,
      put: async () => {},
      putIfAbsent: async () => true,
      delete: async () => {},
      list: async function* () {},
      watch: () => () => {},
    };
    setStateStoreFactory(() => fake);
    expect(getStateStore("x")).toBe(fake);
    setStateStoreFactory(undefined);
    expect(getStateStore("x")).toBeInstanceOf(InMemoryStateStore);
  });
});
