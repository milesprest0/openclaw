/**
 * Track Beta — Slack Resilience Platform Migration (Phase 0)
 *
 * Abstract key/value state-store contract shared by:
 *  - PRE-172 `prest0n_slack_events_seen` (event dedup, TTL 1h)
 *  - PRE-171 `prest0n_slack_thread_participation` (thread participation, TTL 30d)
 *  - PRE-170 `prest0n_channel_routing` (per-channel routing, no TTL)
 *
 * The openclaw fork does NOT ship a hard Firestore dependency. Instead we
 * expose a `StateStore` interface + an in-memory reference implementation.
 * VMs plug in a production Firestore adapter via the runtime registry (see
 * `setStateStoreFactory`) — adapters live in the VM's own wiring layer, not
 * here, so the extension stays dep-light and unit-testable.
 *
 * Design notes:
 *  - Namespaces isolate each store ("slack.events.seen", "slack.thread.part",
 *    "slack.channel.routing") so a single adapter can back all three.
 *  - TTL is advisory: in-memory drops entries on next read; Firestore adapters
 *    SHOULD use native TTL policies (`ttlField` docs).
 *  - All mutations are write-through. Read paths are allowed to return
 *    hot-cache data populated by `watch()` listeners.
 *  - `watch()` is optional; stores that don't need real-time updates (dedup,
 *    participation) never call it. Channel routing (PRE-170) uses it.
 *
 * Part of the Track Beta Phase 0 PR ladder:
 *   pre-171-172-170/firestore-state-client  ← THIS PR
 *   pre-172/event-dedup-store
 *   pre-171/thread-participation-store
 *   pre-170/channel-routing-store
 *   pre-172/events-api-endpoint-dark-launch
 *
 * See workspace memory: `memory/2026-05-08-track-beta-slack-resilience-plan.md`.
 */

export type StateStoreEntry<V = unknown> = {
  /** Opaque document id (already namespace-scoped by the caller). */
  key: string;
  /** Arbitrary JSON-serializable value. */
  value: V;
  /**
   * Absolute expiration time (unix ms). Entries with `expiresAt <= now` MUST
   * be treated as absent by `get()` implementations. `undefined` means no TTL.
   */
  expiresAt?: number;
};

export type StateStoreWriteOptions = {
  /**
   * Time-to-live in milliseconds from "now". If supplied, the entry's
   * `expiresAt` becomes `Date.now() + ttlMs`. Ignored when `expiresAt` is
   * supplied directly.
   */
  ttlMs?: number;
  /** Absolute expiration (unix ms). Takes precedence over `ttlMs`. */
  expiresAt?: number;
};

export type StateStoreWatchCallback<V = unknown> = (
  change:
    | { kind: "added" | "modified"; key: string; value: V; expiresAt?: number }
    | { kind: "removed"; key: string },
) => void;

export type StateStoreUnsubscribe = () => void;

/**
 * Abstract key/value state store used by the Slack resilience modules.
 *
 * Implementations MUST:
 *  - Respect TTL expiration on `get()` and `list()`.
 *  - Treat `put({ ttlMs: 0 })` as "no TTL" (persistent).
 *  - Be safe to call from multiple call-sites concurrently. Read-modify-write
 *    patterns go through `putIfAbsent()` / `updateWith()` where atomicity
 *    matters.
 */
export interface StateStore {
  /**
   * Namespace scope. Implementations use it as a prefix or collection name.
   * Example: `slack.events.seen`, `slack.thread.part`, `slack.channel.routing`.
   */
  readonly namespace: string;

  get<V = unknown>(key: string): Promise<StateStoreEntry<V> | undefined>;

  put(key: string, value: unknown, opts?: StateStoreWriteOptions): Promise<void>;

  /**
   * Atomic "only write if absent". Returns true if the write happened, false
   * if a non-expired entry already existed. Used by the event-dedup store
   * (PRE-172) to detect first-seen events.
   */
  putIfAbsent(key: string, value: unknown, opts?: StateStoreWriteOptions): Promise<boolean>;

  delete(key: string): Promise<void>;

  /**
   * List all non-expired entries. Implementations MAY paginate / stream;
   * callers MUST iterate defensively. Used by cold-boot loaders (PRE-171,
   * PRE-170).
   */
  list<V = unknown>(prefix?: string): AsyncIterable<StateStoreEntry<V>>;

  /**
   * Optional real-time listener. Returns a disposer. If the implementation
   * does not support listeners (e.g. the in-memory reference impl), it MAY
   * throw `StateStoreFeatureUnavailableError` — callers must tolerate this
   * and fall back to periodic `list()` refreshes.
   */
  watch<V = unknown>(prefix: string, cb: StateStoreWatchCallback<V>): StateStoreUnsubscribe;
}

export class StateStoreFeatureUnavailableError extends Error {
  constructor(feature: string) {
    super(`StateStore feature '${feature}' is not available in this implementation`);
    this.name = "StateStoreFeatureUnavailableError";
  }
}

/**
 * Factory that produces a namespaced `StateStore`. VMs register a single
 * factory that backs all slack state namespaces (typically a Firestore-backed
 * implementation at the production tier and the in-memory impl in tests).
 *
 * The factory MUST be pure with respect to the namespace argument: calling it
 * twice with the same namespace returns logically-equivalent stores.
 */
export type StateStoreFactory = (namespace: string) => StateStore;

let stateStoreFactory: StateStoreFactory | undefined;

/**
 * Register the singleton factory used by the resilience modules. VMs call this
 * once during gateway boot, passing in their production adapter. Tests may
 * re-register freely.
 */
export function setStateStoreFactory(factory: StateStoreFactory | undefined): void {
  stateStoreFactory = factory;
}

/**
 * Fetch (and lazily construct) the `StateStore` for a namespace.
 *
 * If no factory is registered, falls back to an in-memory implementation so
 * local dev + unit tests work without wiring. Production VMs MUST register a
 * real factory at boot; failing to do so will log a once-per-namespace warning
 * (see `warnIfFallbackInProduction`).
 */
export function getStateStore(namespace: string): StateStore {
  if (stateStoreFactory) {
    return stateStoreFactory(namespace);
  }
  return getOrCreateInMemoryStore(namespace);
}

const inMemoryRegistry = new Map<string, InMemoryStateStore>();

function getOrCreateInMemoryStore(namespace: string): InMemoryStateStore {
  const existing = inMemoryRegistry.get(namespace);
  if (existing) {
    return existing;
  }
  const created = new InMemoryStateStore(namespace);
  inMemoryRegistry.set(namespace, created);
  return created;
}

/**
 * In-memory reference implementation. Intended for:
 *  - Unit tests (the default when no factory is registered).
 *  - Local dev where Firestore isn't wired yet.
 *  - Cold-start fallback if a production adapter fails to initialize (VMs
 *    should prefer to fail-loud, but we expose the impl so operators have an
 *    explicit opt-in).
 */
export class InMemoryStateStore implements StateStore {
  readonly namespace: string;

  private readonly map = new Map<string, { value: unknown; expiresAt?: number }>();
  private readonly watchers = new Set<{
    prefix: string;
    cb: StateStoreWatchCallback;
  }>();

  constructor(namespace: string) {
    this.namespace = namespace;
  }

  private isExpired(entry: { expiresAt?: number }): boolean {
    return entry.expiresAt !== undefined && entry.expiresAt <= Date.now();
  }

  async get<V = unknown>(key: string): Promise<StateStoreEntry<V> | undefined> {
    const raw = this.map.get(key);
    if (!raw) {
      return undefined;
    }
    if (this.isExpired(raw)) {
      this.map.delete(key);
      this.notify({ kind: "removed", key });
      return undefined;
    }
    return { key, value: raw.value as V, expiresAt: raw.expiresAt };
  }

  async put(key: string, value: unknown, opts?: StateStoreWriteOptions): Promise<void> {
    const expiresAt = resolveExpiresAt(opts);
    const had = this.map.has(key);
    this.map.set(key, { value, expiresAt });
    this.notify({
      kind: had ? "modified" : "added",
      key,
      value,
      expiresAt,
    });
  }

  async putIfAbsent(key: string, value: unknown, opts?: StateStoreWriteOptions): Promise<boolean> {
    const existing = this.map.get(key);
    if (existing && !this.isExpired(existing)) {
      return false;
    }
    await this.put(key, value, opts);
    return true;
  }

  async delete(key: string): Promise<void> {
    const had = this.map.delete(key);
    if (had) {
      this.notify({ kind: "removed", key });
    }
  }

  async *list<V = unknown>(prefix?: string): AsyncIterable<StateStoreEntry<V>> {
    const now = Date.now();
    for (const [key, raw] of this.map.entries()) {
      if (prefix && !key.startsWith(prefix)) {
        continue;
      }
      if (raw.expiresAt !== undefined && raw.expiresAt <= now) {
        this.map.delete(key);
        this.notify({ kind: "removed", key });
        continue;
      }
      yield { key, value: raw.value as V, expiresAt: raw.expiresAt };
    }
  }

  watch<V = unknown>(prefix: string, cb: StateStoreWatchCallback<V>): StateStoreUnsubscribe {
    const entry = {
      prefix,
      cb: cb as StateStoreWatchCallback,
    };
    this.watchers.add(entry);
    return () => {
      this.watchers.delete(entry);
    };
  }

  /** Test-only escape hatch: drop all entries and watchers. */
  clearForTest(): void {
    this.map.clear();
    this.watchers.clear();
  }

  private notify(
    change:
      | { kind: "added" | "modified"; key: string; value: unknown; expiresAt?: number }
      | { kind: "removed"; key: string },
  ): void {
    for (const w of this.watchers) {
      if (change.key.startsWith(w.prefix)) {
        try {
          w.cb(change);
        } catch {
          // swallow — one misbehaving watcher must not break sibling notifies.
        }
      }
    }
  }
}

function resolveExpiresAt(opts?: StateStoreWriteOptions): number | undefined {
  if (!opts) {
    return undefined;
  }
  if (opts.expiresAt !== undefined) {
    return opts.expiresAt;
  }
  if (opts.ttlMs !== undefined && opts.ttlMs > 0) {
    return Date.now() + opts.ttlMs;
  }
  return undefined;
}

/** Test-only: reset the in-memory registry. Does NOT touch the factory. */
export function clearInMemoryRegistryForTest(): void {
  for (const store of inMemoryRegistry.values()) {
    store.clearForTest();
  }
  inMemoryRegistry.clear();
}
