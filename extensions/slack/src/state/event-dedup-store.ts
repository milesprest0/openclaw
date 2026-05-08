/**
 * Track Beta — Slack Resilience Platform (Phase 0, PRE-172 prep).
 *
 * Event deduplication store for the Slack Events API migration.
 *
 * Slack retries event deliveries aggressively under normal operation
 * (3x retry over ~20s, plus occasional burst-retry under backend load).
 * The Events API guarantees at-least-once delivery keyed by `event_id`;
 * our handler MUST be idempotent to avoid duplicate agent dispatches.
 *
 * This store records a sentinel doc per `{workspace_id}/{event_id}` with a
 * 1-hour TTL. `checkAndRecord()` is the only API the handler calls — it
 * returns `true` if this is the first sighting (proceed) and `false` if
 * the event was already seen (drop silently).
 *
 * Backed by the abstract `StateStore` (see `state-store.ts`) in namespace
 * `slack.events.seen`. Production VMs register a Firestore factory at
 * boot; unit tests use the in-memory fallback.
 *
 * Dark-launch / Phase 0, NO live cutover, Miles-review gated, reversible
 * via feature flag (\`channels.slack.eventsApi.enabled\`, wired in the
 * Events API endpoint PR).
 *
 * See: memory/2026-05-08-track-beta-slack-resilience-plan.md
 */

import { getStateStore, type StateStore } from "./state-store.js";

/** Namespace used by the StateStore factory. */
export const EVENT_DEDUP_NAMESPACE = "slack.events.seen";

/** Default TTL (1 hour). Slack retry window is ~20s; 1h is ample headroom. */
export const DEFAULT_EVENT_DEDUP_TTL_MS = 60 * 60 * 1000;

/** Lower bound on TTL to guard against pathologically-short dedup windows. */
export const MIN_EVENT_DEDUP_TTL_MS = 60_000;

export type EventDedupRecord = {
  workspaceId: string;
  eventId: string;
  /** Unix ms when this VM first saw the event. */
  receivedAt: number;
  /** VM / account that processed the first sighting. */
  vmAccount?: string;
  /** Optional context for debugging. */
  channelId?: string;
  threadTs?: string;
};

export type EventDedupCheckInput = {
  workspaceId: string;
  eventId: string;
  vmAccount?: string;
  channelId?: string;
  threadTs?: string;
};

export type EventDedupStoreOptions = {
  /** Override TTL (ms). Defaults to DEFAULT_EVENT_DEDUP_TTL_MS. */
  ttlMs?: number;
  /**
   * Inject a specific StateStore (primarily for tests). When omitted, the
   * singleton factory is used.
   */
  store?: StateStore;
};

/**
 * Public API for the Slack event dedup store.
 *
 * All callers must prefer `checkAndRecord` — it is the only atomic primitive.
 * The getters are for diagnostics / observability only.
 */
export interface EventDedupStore {
  /**
   * Atomic first-sighting check. Returns:
   *  - `{ firstSighting: true, record }` when the event had not been seen
   *    (the caller should proceed to process the event).
   *  - `{ firstSighting: false, record }` when the event was already seen
   *    (the caller MUST NOT dispatch; log+drop is the correct action).
   *
   * The write is idempotent: calling with the same (workspaceId, eventId)
   * during the TTL window yields `firstSighting=false` deterministically.
   */
  checkAndRecord(input: EventDedupCheckInput): Promise<{
    firstSighting: boolean;
    record: EventDedupRecord;
  }>;

  /** Peek-only: does a record currently exist for this event_id? */
  has(workspaceId: string, eventId: string): Promise<boolean>;

  /** Fetch the recorded first-sighting record (for diagnostics). */
  get(workspaceId: string, eventId: string): Promise<EventDedupRecord | undefined>;

  /** Effective TTL currently in use (ms). */
  readonly ttlMs: number;
}

class EventDedupStoreImpl implements EventDedupStore {
  readonly ttlMs: number;
  private readonly store: StateStore;

  constructor(opts?: EventDedupStoreOptions) {
    const requested = opts?.ttlMs ?? DEFAULT_EVENT_DEDUP_TTL_MS;
    this.ttlMs = Math.max(requested, MIN_EVENT_DEDUP_TTL_MS);
    this.store = opts?.store ?? getStateStore(EVENT_DEDUP_NAMESPACE);
  }

  async checkAndRecord(input: EventDedupCheckInput): Promise<{
    firstSighting: boolean;
    record: EventDedupRecord;
  }> {
    assertValidKeyPart(input.workspaceId, "workspaceId");
    assertValidKeyPart(input.eventId, "eventId");

    const key = dedupKey(input.workspaceId, input.eventId);
    const candidate: EventDedupRecord = {
      workspaceId: input.workspaceId,
      eventId: input.eventId,
      receivedAt: Date.now(),
      vmAccount: input.vmAccount,
      channelId: input.channelId,
      threadTs: input.threadTs,
    };

    const wrote = await this.store.putIfAbsent(key, candidate, { ttlMs: this.ttlMs });
    if (wrote) {
      return { firstSighting: true, record: candidate };
    }
    const existing = await this.store.get<EventDedupRecord>(key);
    // Fall-through guard: if the race settled between putIfAbsent and get
    // (entry expired mid-call), treat the current call as first-sighting.
    if (!existing) {
      await this.store.put(key, candidate, { ttlMs: this.ttlMs });
      return { firstSighting: true, record: candidate };
    }
    return { firstSighting: false, record: existing.value };
  }

  async has(workspaceId: string, eventId: string): Promise<boolean> {
    const entry = await this.store.get(dedupKey(workspaceId, eventId));
    return entry !== undefined;
  }

  async get(workspaceId: string, eventId: string): Promise<EventDedupRecord | undefined> {
    const entry = await this.store.get<EventDedupRecord>(dedupKey(workspaceId, eventId));
    return entry?.value;
  }
}

/**
 * Factory: construct an `EventDedupStore`. Exposed as a function rather than
 * an exported class so VMs can swap implementations (e.g., a no-op store for
 * a test harness) without monkey-patching.
 */
export function createEventDedupStore(opts?: EventDedupStoreOptions): EventDedupStore {
  return new EventDedupStoreImpl(opts);
}

function dedupKey(workspaceId: string, eventId: string): string {
  return `${workspaceId}/${eventId}`;
}

function assertValidKeyPart(value: string, label: string): void {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`event dedup: ${label} must be a non-empty string`);
  }
  if (value.includes("/")) {
    throw new TypeError(
      `event dedup: ${label} must not contain '/' (namespace delimiter)`,
    );
  }
}
