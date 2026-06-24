/**
 * Track Beta — Slack Resilience Platform (Phase 0, PRE-171 prep).
 *
 * Persistent thread-participation cache.
 *
 * Today: each gateway tracks "threads the bot has participated in" in a
 * VM-local in-memory set that is lost on restart. The bot then misses
 * follow-up messages in threads it previously replied to until the user
 * @-mentions again. This is a frequent source of user confusion.
 *
 * Target: write-through persistence to a Firestore-backed StateStore with
 * a 30-day TTL on `lastActivityAt`. On gateway boot, cold-load the
 * workspace's recent threads into the hot cache in one `list()` call, then
 * keep the cache write-through via `markActive()` on every produced reply.
 *
 * This PR lands the module + cold-boot loader hook + 30-day TTL semantics
 * and unit tests. It does NOT yet wire into the Slack monitor — that
 * landing is intentionally separated (call-site wiring lands when all
 * three Phase 0 stores are merged and the Events API endpoint PR lands,
 * so the full ingress→state flow is reviewable together).
 *
 * Dark-launch / Phase 0, NO live cutover, Miles-review gated, reversible
 * via feature flag (\`channels.slack.threadParticipationPersistence.enabled\`,
 * wired at call-site landing time).
 *
 * See: memory/2026-05-08-track-beta-slack-resilience-plan.md
 */

import { getStateStore, type StateStore } from "./state-store.js";

/** Namespace used by the StateStore factory. */
export const THREAD_PARTICIPATION_NAMESPACE = "slack.thread.part";

/** Default TTL: 30 days from lastActivityAt. Matches Slack's typical thread-activity window. */
export const DEFAULT_THREAD_PARTICIPATION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type ThreadParticipationRecord = {
  workspaceId: string;
  channelId: string;
  threadTs: string;
  /** Unix ms when the bot first joined the thread. Immutable after creation. */
  joinedAt: number;
  /** Unix ms when the bot last posted OR received a message in this thread. */
  lastActivityAt: number;
  /** VM/account that most-recently marked activity. */
  vmAccount?: string;
  /** Optional join reason: "mention" | "invited" | "command" | user-supplied. */
  reason?: string;
};

export type MarkActiveInput = {
  workspaceId: string;
  channelId: string;
  threadTs: string;
  vmAccount?: string;
  /** Only honored on insert; ignored on updates to an existing record. */
  reason?: string;
  /** Override timestamp for testability. */
  now?: number;
};

export type ThreadParticipationStoreOptions = {
  ttlMs?: number;
  store?: StateStore;
  /**
   * Hot-cache capacity (max records retained in memory). When exceeded, the
   * least-recently-accessed entry is evicted. The Firestore-backed record
   * remains — next access re-hydrates the hot-cache entry.
   *
   * Default: 5000. A typical VM sees < 500 active threads in any 30d window;
   * 5000 gives comfortable headroom without memory pressure.
   */
  hotCacheMax?: number;
};

export interface ThreadParticipationStore {
  /**
   * Record activity in a thread. Called after the bot produces OR receives
   * a message in the thread. Idempotent; safe to call on every event.
   *
   * On first call for a thread, creates the record with \`joinedAt = now\`.
   * On subsequent calls, updates \`lastActivityAt = now\` (thus extending the
   * TTL window on every activity).
   */
  markActive(input: MarkActiveInput): Promise<ThreadParticipationRecord>;

  /** Returns the record if the bot is participating in the thread. */
  get(
    workspaceId: string,
    channelId: string,
    threadTs: string,
  ): Promise<ThreadParticipationRecord | undefined>;

  /** Cheap boolean probe (uses hot cache when possible). */
  has(workspaceId: string, channelId: string, threadTs: string): Promise<boolean>;

  /** Explicitly drop a thread (e.g., on \`/leave\` command or user revoke). */
  forget(workspaceId: string, channelId: string, threadTs: string): Promise<void>;

  /**
   * One-shot cold-boot loader. Pulls all non-expired records into the hot
   * cache with a single underlying \`list()\` call. Call from the gateway
   * boot hook after the StateStore factory is registered.
   *
   * Safe to call multiple times; subsequent calls are a no-op once
   * \`loaded=true\`. For a forced re-load, pass \`{ force: true }\`.
   */
  loadAll(opts?: { workspaceId?: string; force?: boolean }): Promise<{
    loaded: number;
    durationMs: number;
  }>;

  /** Hot-cache snapshot for diagnostics. */
  readonly hotCacheSize: number;
  readonly hotCacheMax: number;
  readonly ttlMs: number;
}

class ThreadParticipationStoreImpl implements ThreadParticipationStore {
  readonly ttlMs: number;
  readonly hotCacheMax: number;
  private readonly store: StateStore;

  // LRU: Map preserves insertion order; re-insert on access to keep it recent.
  private readonly hotCache = new Map<string, ThreadParticipationRecord>();
  private coldLoaded = false;

  constructor(opts?: ThreadParticipationStoreOptions) {
    this.ttlMs = opts?.ttlMs ?? DEFAULT_THREAD_PARTICIPATION_TTL_MS;
    this.hotCacheMax = opts?.hotCacheMax ?? 5000;
    this.store = opts?.store ?? getStateStore(THREAD_PARTICIPATION_NAMESPACE);
  }

  get hotCacheSize(): number {
    return this.hotCache.size;
  }

  async markActive(input: MarkActiveInput): Promise<ThreadParticipationRecord> {
    assertKey(input.workspaceId, "workspaceId");
    assertKey(input.channelId, "channelId");
    assertKey(input.threadTs, "threadTs");

    const key = threadKey(input.workspaceId, input.channelId, input.threadTs);
    const now = input.now ?? Date.now();

    const existing = this.getHot(key) ?? (await this.fetchFromStore(key));
    const record: ThreadParticipationRecord = existing
      ? {
          ...existing,
          lastActivityAt: now,
          // reason is immutable once set; vmAccount updates to the latest writer.
          vmAccount: input.vmAccount ?? existing.vmAccount,
        }
      : {
          workspaceId: input.workspaceId,
          channelId: input.channelId,
          threadTs: input.threadTs,
          joinedAt: now,
          lastActivityAt: now,
          vmAccount: input.vmAccount,
          reason: input.reason,
        };

    this.writeHot(key, record);
    await this.store.put(key, record, {
      expiresAt: record.lastActivityAt + this.ttlMs,
    });
    return record;
  }

  async get(
    workspaceId: string,
    channelId: string,
    threadTs: string,
  ): Promise<ThreadParticipationRecord | undefined> {
    const key = threadKey(workspaceId, channelId, threadTs);
    const hot = this.getHot(key);
    if (hot) {
      return hot;
    }
    const fetched = await this.fetchFromStore(key);
    if (fetched) {
      this.writeHot(key, fetched);
    }
    return fetched;
  }

  async has(workspaceId: string, channelId: string, threadTs: string): Promise<boolean> {
    return (await this.get(workspaceId, channelId, threadTs)) !== undefined;
  }

  async forget(workspaceId: string, channelId: string, threadTs: string): Promise<void> {
    const key = threadKey(workspaceId, channelId, threadTs);
    this.hotCache.delete(key);
    await this.store.delete(key);
  }

  async loadAll(opts?: {
    workspaceId?: string;
    force?: boolean;
  }): Promise<{ loaded: number; durationMs: number }> {
    if (this.coldLoaded && !opts?.force) {
      return { loaded: this.hotCache.size, durationMs: 0 };
    }
    const started = Date.now();
    let loaded = 0;
    const prefix = opts?.workspaceId ? `${opts.workspaceId}/` : undefined;

    for await (const entry of this.store.list<ThreadParticipationRecord>(prefix)) {
      this.writeHot(entry.key, entry.value);
      loaded += 1;
    }
    this.coldLoaded = true;
    return { loaded, durationMs: Date.now() - started };
  }

  private getHot(key: string): ThreadParticipationRecord | undefined {
    const hit = this.hotCache.get(key);
    if (!hit) {
      return undefined;
    }
    // Hot-cache respects TTL even though the underlying store also enforces
    // it — this keeps us honest when Firestore TTL sweeps lag.
    if (hit.lastActivityAt + this.ttlMs <= Date.now()) {
      this.hotCache.delete(key);
      return undefined;
    }
    // LRU bump: move to end.
    this.hotCache.delete(key);
    this.hotCache.set(key, hit);
    return hit;
  }

  private writeHot(key: string, record: ThreadParticipationRecord): void {
    // Evict LRU if at capacity and inserting a new key.
    if (!this.hotCache.has(key) && this.hotCache.size >= this.hotCacheMax) {
      const first = this.hotCache.keys().next();
      if (!first.done) {
        this.hotCache.delete(first.value);
      }
    }
    this.hotCache.delete(key);
    this.hotCache.set(key, record);
  }

  private async fetchFromStore(key: string): Promise<ThreadParticipationRecord | undefined> {
    const entry = await this.store.get<ThreadParticipationRecord>(key);
    return entry?.value;
  }
}

/**
 * Factory. Module-level singleton not exported on purpose — VMs construct
 * this once at boot (alongside the StateStore factory registration) and
 * inject it into the slack-monitor context.
 */
export function createThreadParticipationStore(
  opts?: ThreadParticipationStoreOptions,
): ThreadParticipationStore {
  return new ThreadParticipationStoreImpl(opts);
}

function threadKey(workspaceId: string, channelId: string, threadTs: string): string {
  return `${workspaceId}/${channelId}/${threadTs}`;
}

function assertKey(value: string, label: string): void {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`thread participation: ${label} must be a non-empty string`);
  }
  if (value.includes("/")) {
    throw new TypeError(
      `thread participation: ${label} must not contain '/' (namespace delimiter)`,
    );
  }
}
