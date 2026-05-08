/**
 * Track Beta — Slack Resilience Platform (Phase 0, PRE-170 prep).
 *
 * Admin-console-ready channel → model routing store.
 *
 * Today: per-channel model overrides live in static config
 * (\`channels.slack.modelByChannel\`) which requires a gateway restart to
 * change. Target: Firestore-backed per-\`{workspace, channel}\` doc updated
 * via admin console, with a real-time listener keeping the in-memory hot
 * cache live-synced.
 *
 * This PR lands the module + listener hook + hot-cache semantics and unit
 * tests. Like PRE-171, call-site wiring is intentionally deferred so the
 * full ingress→routing path is reviewable together with the Events API
 * endpoint PR.
 *
 * Dark-launch / Phase 0, NO live cutover, Miles-review gated, reversible
 * via feature flag (\`channels.slack.channelRouting.persistenceEnabled\`,
 * wired at call-site landing time). Legacy \`channels.modelByChannel\`
 * stays as fallback during migration.
 *
 * See: memory/2026-05-08-track-beta-slack-resilience-plan.md
 */

import {
  StateStoreFeatureUnavailableError,
  getStateStore,
  type StateStore,
  type StateStoreUnsubscribe,
} from "./state-store.js";

export const CHANNEL_ROUTING_NAMESPACE = "slack.channel.routing";

export type ChannelRoutingRecord = {
  workspaceId: string;
  channelId: string;
  /** Primary model id (e.g., \"openrouter/anthropic/claude-opus-4.7\"). */
  modelId: string;
  /** Ordered fallback list; first entry is the first retry target. */
  fallbackModels?: string[];
  /** Free-form text stored by admins for audit. */
  overrideReason?: string;
  /** User id / service account that wrote this record. */
  updatedBy?: string;
  /** Unix ms of the last mutation. */
  updatedAt: number;
  /** False = route is present in the collection but inactive. Default true. */
  enabled?: boolean;
};

export type UpsertChannelRoutingInput = {
  workspaceId: string;
  channelId: string;
  modelId: string;
  fallbackModels?: string[];
  overrideReason?: string;
  updatedBy?: string;
  enabled?: boolean;
  /** Override timestamp for testability. */
  now?: number;
};

export type ChannelRoutingStoreOptions = {
  store?: StateStore;
  /**
   * When \`true\`, attempt \`store.watch()\` to live-sync. When the underlying
   * store does not support \`watch\` (e.g., the in-memory reference impl in
   * tests), the listener call is swallowed and the store degrades to
   * \`loadAll()\`-on-demand. When \`false\`, the store never calls \`watch\`.
   *
   * Default: true.
   */
  enableLiveListener?: boolean;
};

export interface ChannelRoutingStore {
  upsert(input: UpsertChannelRoutingInput): Promise<ChannelRoutingRecord>;
  get(
    workspaceId: string,
    channelId: string,
  ): Promise<ChannelRoutingRecord | undefined>;
  /** Returns the record only if \`enabled !== false\`. */
  resolve(
    workspaceId: string,
    channelId: string,
  ): Promise<ChannelRoutingRecord | undefined>;
  remove(workspaceId: string, channelId: string): Promise<void>;

  /**
   * Hydrate the hot cache from the backing store and, when supported,
   * install a real-time listener that keeps the cache live-synced.
   *
   * Call once after the gateway boots. Returns the disposer for the
   * listener (or a no-op when \`watch\` is unavailable). The hot cache is
   * usable before this completes — \`get/resolve\` fall through to the
   * backing store on miss.
   */
  hydrateAndWatch(opts?: {
    workspaceId?: string;
  }): Promise<{
    loaded: number;
    listening: boolean;
    durationMs: number;
    dispose: () => void;
  }>;

  readonly hotCacheSize: number;
}

class ChannelRoutingStoreImpl implements ChannelRoutingStore {
  private readonly store: StateStore;
  private readonly enableLiveListener: boolean;
  private readonly hotCache = new Map<string, ChannelRoutingRecord>();
  private activeUnsub: StateStoreUnsubscribe | undefined;

  constructor(opts?: ChannelRoutingStoreOptions) {
    this.store = opts?.store ?? getStateStore(CHANNEL_ROUTING_NAMESPACE);
    this.enableLiveListener = opts?.enableLiveListener ?? true;
  }

  get hotCacheSize(): number {
    return this.hotCache.size;
  }

  async upsert(input: UpsertChannelRoutingInput): Promise<ChannelRoutingRecord> {
    assertKey(input.workspaceId, "workspaceId");
    assertKey(input.channelId, "channelId");
    assertKey(input.modelId, "modelId");

    const key = routingKey(input.workspaceId, input.channelId);
    const now = input.now ?? Date.now();
    const record: ChannelRoutingRecord = {
      workspaceId: input.workspaceId,
      channelId: input.channelId,
      modelId: input.modelId,
      fallbackModels: input.fallbackModels
        ? [...input.fallbackModels]
        : undefined,
      overrideReason: input.overrideReason,
      updatedBy: input.updatedBy,
      updatedAt: now,
      enabled: input.enabled ?? true,
    };
    this.hotCache.set(key, record);
    await this.store.put(key, record);
    return record;
  }

  async get(
    workspaceId: string,
    channelId: string,
  ): Promise<ChannelRoutingRecord | undefined> {
    const key = routingKey(workspaceId, channelId);
    const hot = this.hotCache.get(key);
    if (hot) return hot;
    const entry = await this.store.get<ChannelRoutingRecord>(key);
    if (entry) this.hotCache.set(key, entry.value);
    return entry?.value;
  }

  async resolve(
    workspaceId: string,
    channelId: string,
  ): Promise<ChannelRoutingRecord | undefined> {
    const rec = await this.get(workspaceId, channelId);
    if (!rec) return undefined;
    if (rec.enabled === false) return undefined;
    return rec;
  }

  async remove(workspaceId: string, channelId: string): Promise<void> {
    const key = routingKey(workspaceId, channelId);
    this.hotCache.delete(key);
    await this.store.delete(key);
  }

  async hydrateAndWatch(opts?: {
    workspaceId?: string;
  }): Promise<{
    loaded: number;
    listening: boolean;
    durationMs: number;
    dispose: () => void;
  }> {
    const started = Date.now();
    const prefix = opts?.workspaceId ? `${opts.workspaceId}/` : undefined;
    let loaded = 0;

    for await (const entry of this.store.list<ChannelRoutingRecord>(prefix)) {
      this.hotCache.set(entry.key, entry.value);
      loaded += 1;
    }

    let listening = false;
    let unsub: StateStoreUnsubscribe = () => {};
    if (this.enableLiveListener) {
      try {
        unsub = this.store.watch<ChannelRoutingRecord>(prefix ?? "", (change) => {
          if (change.kind === "removed") {
            this.hotCache.delete(change.key);
            return;
          }
          this.hotCache.set(change.key, change.value);
        });
        listening = true;
        this.activeUnsub = unsub;
      } catch (err) {
        if (!(err instanceof StateStoreFeatureUnavailableError)) throw err;
        // Swallow: underlying store does not support watch. Caller may
        // re-call hydrate periodically, or upgrade the factory later.
      }
    }

    return {
      loaded,
      listening,
      durationMs: Date.now() - started,
      dispose: () => {
        try {
          unsub();
        } finally {
          if (this.activeUnsub === unsub) this.activeUnsub = undefined;
        }
      },
    };
  }
}

export function createChannelRoutingStore(
  opts?: ChannelRoutingStoreOptions,
): ChannelRoutingStore {
  return new ChannelRoutingStoreImpl(opts);
}

function routingKey(workspaceId: string, channelId: string): string {
  return `${workspaceId}/${channelId}`;
}

function assertKey(value: string, label: string): void {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`channel routing: ${label} must be a non-empty string`);
  }
  if (value.includes("/")) {
    throw new TypeError(
      `channel routing: ${label} must not contain '/' (namespace delimiter)`,
    );
  }
}
