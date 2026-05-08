/**
 * Track Beta — Slack Resilience Platform Migration.
 *
 * Barrel export for Slack state-store modules. See `state-store.ts` for
 * design notes and the Phase 0 PR ladder.
 */
export {
  InMemoryStateStore,
  StateStoreFeatureUnavailableError,
  clearInMemoryRegistryForTest,
  getStateStore,
  setStateStoreFactory,
} from "./state-store.js";
export type {
  StateStore,
  StateStoreEntry,
  StateStoreFactory,
  StateStoreUnsubscribe,
  StateStoreWatchCallback,
  StateStoreWriteOptions,
} from "./state-store.js";

export {
  DEFAULT_EVENT_DEDUP_TTL_MS,
  EVENT_DEDUP_NAMESPACE,
  MIN_EVENT_DEDUP_TTL_MS,
  createEventDedupStore,
} from "./event-dedup-store.js";
export type {
  EventDedupCheckInput,
  EventDedupRecord,
  EventDedupStore,
  EventDedupStoreOptions,
} from "./event-dedup-store.js";

export {
  DEFAULT_THREAD_PARTICIPATION_TTL_MS,
  THREAD_PARTICIPATION_NAMESPACE,
  createThreadParticipationStore,
} from "./thread-participation-store.js";
export type {
  MarkActiveInput,
  ThreadParticipationRecord,
  ThreadParticipationStore,
  ThreadParticipationStoreOptions,
} from "./thread-participation-store.js";

export {
  CHANNEL_ROUTING_NAMESPACE,
  createChannelRoutingStore,
} from "./channel-routing-store.js";
export type {
  ChannelRoutingRecord,
  ChannelRoutingStore,
  ChannelRoutingStoreOptions,
  UpsertChannelRoutingInput,
} from "./channel-routing-store.js";
