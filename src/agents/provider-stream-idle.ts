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

const DEFAULT_HEARTBEAT_MS = 20_000;
const DEFAULT_FALLBACK_MS = 90_000;

/**
 * Resolve idle-detection knobs from a model config. Both knobs are optional
 * on `model.params`. Falsy / non-positive values disable the respective
 * behavior. Returned object is always defined; callers can pass it straight
 * into `wrapAsyncIterableWithIdleDetection`.
 */
export function resolveIdleDetectionKnobs(model: unknown): {
  idleHeartbeatMs: number;
  idleFallbackMs: number;
} {
  const params =
    model && typeof model === "object"
      ? ((model as { params?: Record<string, unknown> }).params ?? undefined)
      : undefined;
  const rawHeartbeat = readNumericKnob(params, "idleHeartbeatMs");
  const rawFallback = readNumericKnob(params, "idleFallbackMs");
  return {
    idleHeartbeatMs: rawHeartbeat === undefined ? DEFAULT_HEARTBEAT_MS : Math.max(0, rawHeartbeat),
    idleFallbackMs: rawFallback === undefined ? DEFAULT_FALLBACK_MS : Math.max(0, rawFallback),
  };
}

function readNumericKnob(
  params: Record<string, unknown> | undefined,
  key: string,
): number | undefined {
  if (!params) {
    return undefined;
  }
  const value = params[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  if (value === false) {
    return 0;
  }
  return undefined;
}

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
export async function* wrapAsyncIterableWithIdleDetection<T>(
  source: AsyncIterable<T>,
  opts: IdleDetectionOptions,
): AsyncGenerator<T, void, void> {
  const heartbeatEnabled = opts.idleHeartbeatMs > 0;
  const fallbackEnabled = opts.idleFallbackMs > 0;

  // Fast path: nothing to do. Pure pass-through, no timers, no overhead.
  if (!heartbeatEnabled && !fallbackEnabled) {
    for await (const value of source) {
      yield value;
    }
    return;
  }

  const iterator = source[Symbol.asyncIterator]();
  let heartbeatTimer: ReturnType<typeof setTimeout> | undefined;
  let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
  let lastEventAt = Date.now();
  let heartbeatCount = 0;
  let idleFallbackError: Error | undefined;

  // Each pending iterator.next() race needs a way to be cancelled when the
  // idle deadline fires. We resolve a sentinel from the deadline timer.
  type IdleSentinel = { idleFallbackSentinel: true };
  const IDLE_SENTINEL: IdleSentinel = { idleFallbackSentinel: true };

  let resolveIdleDeadline: ((value: IdleSentinel) => void) | undefined;

  const clearTimers = () => {
    if (heartbeatTimer !== undefined) {
      clearTimeout(heartbeatTimer);
      heartbeatTimer = undefined;
    }
    if (fallbackTimer !== undefined) {
      clearTimeout(fallbackTimer);
      fallbackTimer = undefined;
    }
  };

  const armHeartbeat = () => {
    if (!heartbeatEnabled) {
      return;
    }
    if (heartbeatTimer !== undefined) {
      clearTimeout(heartbeatTimer);
    }
    heartbeatTimer = setTimeout(() => {
      heartbeatTimer = undefined;
      heartbeatCount += 1;
      try {
        opts.onHeartbeat({
          elapsedMs: Date.now() - lastEventAt,
          heartbeatCount,
        });
      } catch {
        // Swallow user-callback errors; idle detection must remain robust.
      }
      // Re-arm so successive idle windows keep firing heartbeats.
      armHeartbeat();
    }, opts.idleHeartbeatMs);
    // Allow the process to exit if only this timer is pending.
    if (typeof (heartbeatTimer as { unref?: () => void }).unref === "function") {
      (heartbeatTimer as { unref: () => void }).unref();
    }
  };

  const armFallback = () => {
    if (!fallbackEnabled) {
      return;
    }
    if (fallbackTimer !== undefined) {
      clearTimeout(fallbackTimer);
    }
    fallbackTimer = setTimeout(() => {
      fallbackTimer = undefined;
      const elapsedMs = Date.now() - lastEventAt;
      let err: Error;
      try {
        err = opts.onIdleFallback({ elapsedMs });
      } catch (cbErr) {
        err = cbErr instanceof Error ? cbErr : new Error("provider idle timeout");
      }
      idleFallbackError = err;
      // Wake any in-flight .next() race so we can throw from the generator.
      resolveIdleDeadline?.(IDLE_SENTINEL);
    }, opts.idleFallbackMs);
    if (typeof (fallbackTimer as { unref?: () => void }).unref === "function") {
      (fallbackTimer as { unref: () => void }).unref();
    }
  };

  const resetTimers = () => {
    lastEventAt = Date.now();
    armHeartbeat();
    armFallback();
  };

  resetTimers();

  try {
    while (true) {
      let nextResult: IteratorResult<T> | IdleSentinel;
      if (fallbackEnabled) {
        const idlePromise = new Promise<IdleSentinel>((resolve) => {
          resolveIdleDeadline = resolve;
        });
        nextResult = await Promise.race<IteratorResult<T> | IdleSentinel>([
          iterator.next(),
          idlePromise,
        ]);
        resolveIdleDeadline = undefined;
      } else {
        nextResult = await iterator.next();
      }

      if ((nextResult as IdleSentinel).idleFallbackSentinel === true) {
        // Idle deadline fired before any next event. Abort upstream and throw.
        try {
          await iterator.return?.();
        } catch {
          // Ignore upstream return() failures; we are already aborting.
        }
        throw idleFallbackError ?? new Error("provider idle timeout");
      }

      const step = nextResult as IteratorResult<T>;
      if (step.done) {
        return;
      }
      // Reset timers BEFORE yielding so consumer-side work counts as "live".
      resetTimers();
      yield step.value;
    }
  } finally {
    clearTimers();
    resolveIdleDeadline = undefined;
  }
}

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
export function createProviderIdleTimeoutError(info: {
  provider?: string;
  modelId?: string;
  elapsedMs: number;
  fallbackMs: number;
}): Error {
  const providerLabel = info.provider ?? "provider";
  const modelLabel = info.modelId ? ` (${info.modelId})` : "";
  const err = new Error(
    `Provider idle timeout: ${providerLabel}${modelLabel} sent no stream chunks for ${info.elapsedMs}ms (>${info.fallbackMs}ms threshold)`,
  ) as Error & { code?: string; retryable?: boolean; provider?: string };
  err.code = "provider_idle_timeout";
  err.retryable = true;
  if (info.provider) {
    err.provider = info.provider;
  }
  return err;
}
