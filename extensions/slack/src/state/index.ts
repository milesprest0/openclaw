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
