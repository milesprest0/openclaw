/**
 * Idle-progress detection wrapper for provider streams.
 *
 * Wraps an upstream `AsyncIterable<T>` (an LLM provider chunk stream) and
 * surfaces user-visible signals when the stream goes silent:
 *   1. Heartbeat — fires `onHeartbeat()` after `idleHeartbeatMs` of silence
 *      from the upstream. Repeats every `idleHeartbeatMs` while the stream
 *      remains idle. Reset on every received event.
 *   2. Idle-fallback — throws the Error returned by `onIdleFallback()` after
 *      `idleFallbackMs` of silence from the upstream. Propagates up through
 *      the consumer's `for await`, the streaming transport's try/catch, and
 *      finally into the model-fallback machinery — which classifies the
 *      thrown error (its message contains "timeout") as a retryable timeout
 *      and rotates to the next candidate model/provider.
 *
 * Disable behavior:
 *   - `idleHeartbeatMs <= 0` disables the heartbeat only.
 *   - `idleFallbackMs <= 0` disables the idle-fallback throw only.
 *   - If both are disabled, the wrapper is a pure pass-through.
 *
 * Resource discipline: all timers are cleared on consumer return / break /
 * throw via the for-await's finally semantics, so this helper never leaks
 * timers even if the consumer aborts mid-stream.
 */
export interface IdleDetectionOptions {
  idleHeartbeatMs: number;
  idleFallbackMs: number;
  onHeartbeat: (info: { elapsedMs: number; heartbeatCount: number }) => void;
  onIdleFallback: (info: { elapsedMs: number }) => Error;
}
/**
 * Resolve idle-detection knobs from a model config. Both knobs are optional
 * on `model.params`. Falsy / non-positive values disable the respective
 * behavior. Returned object is always defined; callers can pass it straight
 * into `wrapAsyncIterableWithIdleDetection`.
 */
export declare function resolveIdleDetectionKnobs(model: unknown): {
  idleHeartbeatMs: number;
  idleFallbackMs: number;
};
/**
 * Wrap an async iterable with idle heartbeat + idle-fallback detection.
 *
 * Each received event resets both timers. If `idleHeartbeatMs` elapses with
 * no event, `onHeartbeat` fires; the heartbeat timer can re-arm and fire
 * multiple times during a long stall. If `idleFallbackMs` elapses with no
 * event, the iterator throws the Error returned by `onIdleFallback` and the
 * upstream iteration is aborted (return() is invoked on the source if
 * available).
 */
export declare function wrapAsyncIterableWithIdleDetection<T>(
  source: AsyncIterable<T>,
  opts: IdleDetectionOptions,
): AsyncGenerator<T, void, void>;
/**
 * Build the standard provider-idle-timeout error. Its message contains
 * "timeout" so the existing failover classifier in
 * `pi-embedded-helpers/failover-matches.ts` (the `timeout` pattern group)
 * routes it through the retryable / model-fallback path.
 *
 * The Error is also annotated with `code` and `retryable` properties so any
 * downstream observer that inspects structured error metadata can recognize
 * it without parsing strings.
 */
export declare function createProviderIdleTimeoutError(info: {
  provider?: string;
  modelId?: string;
  elapsedMs: number;
  fallbackMs: number;
}): Error;
