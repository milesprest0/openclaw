/**
 * Tests for the idle-progress heartbeat + idle-fallback wrapper used by the
 * OpenAI/Responses/Chat-Completions streaming transports.
 *
 * The helper under test lives in `provider-stream-idle.ts` and is exercised
 * here directly with vitest fake timers so we can simulate long silences
 * without slowing the suite.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createProviderIdleTimeoutError,
  resolveIdleDetectionKnobs,
  wrapAsyncIterableWithIdleDetection,
} from "./provider-stream-idle.js";

/**
 * Manual async iterable harness: lets a test push values, signal "done", or
 * simulate a stalled upstream by simply not pushing. The iterable resolves
 * each pending `.next()` only when a value/done arrives, so the wrapper's
 * idle-deadline race actually races (real microtask timing).
 */
function createManualIterable<T>(): {
  iterable: AsyncIterable<T>;
  push: (value: T) => void;
  end: () => void;
  returnCalls: { count: number };
} {
  const queue: Array<IteratorResult<T>> = [];
  const waiters: Array<(r: IteratorResult<T>) => void> = [];
  const returnCalls = { count: 0 };

  const pushResult = (result: IteratorResult<T>) => {
    if (waiters.length > 0) {
      const resolve = waiters.shift()!;
      resolve(result);
    } else {
      queue.push(result);
    }
  };

  const iterable: AsyncIterable<T> = {
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<IteratorResult<T>> {
          if (queue.length > 0) {
            return Promise.resolve(queue.shift()!);
          }
          return new Promise<IteratorResult<T>>((resolve) => {
            waiters.push(resolve);
          });
        },
        return(): Promise<IteratorResult<T>> {
          returnCalls.count += 1;
          return Promise.resolve({ value: undefined as unknown as T, done: true });
        },
      };
    },
  };

  return {
    iterable,
    push: (value: T) => pushResult({ value, done: false }),
    end: () => pushResult({ value: undefined as unknown as T, done: true }),
    returnCalls,
  };
}

/**
 * Drain a wrapped iterable into an array of yielded values until done or
 * the wrapper throws. Returns both the values and the optional caught error.
 */
async function drain<T>(iter: AsyncIterable<T>): Promise<{
  values: T[];
  error: unknown;
}> {
  const values: T[] = [];
  let error: unknown;
  try {
    for await (const value of iter) {
      values.push(value);
    }
  } catch (err) {
    error = err;
  }
  return { values, error };
}

describe("provider-stream-idle / wrapAsyncIterableWithIdleDetection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires the heartbeat after idleHeartbeatMs of silence", async () => {
    const { iterable, end } = createManualIterable<string>();
    const heartbeatEvents: Array<{ elapsedMs: number; heartbeatCount: number }> = [];

    const wrapped = wrapAsyncIterableWithIdleDetection(iterable, {
      idleHeartbeatMs: 1000,
      idleFallbackMs: 10_000,
      onHeartbeat: (info) => {
        heartbeatEvents.push(info);
      },
      onIdleFallback: () => new Error("should not fire"),
    });

    const drainPromise = drain(wrapped);

    // Let the wrapper arm timers (microtask flush).
    await Promise.resolve();
    expect(heartbeatEvents.length).toBe(0);

    // Advance just past the heartbeat threshold.
    await vi.advanceTimersByTimeAsync(1001);
    expect(heartbeatEvents.length).toBe(1);
    expect(heartbeatEvents[0]?.heartbeatCount).toBe(1);

    // Continued silence should re-arm and fire again.
    await vi.advanceTimersByTimeAsync(1000);
    expect(heartbeatEvents.length).toBe(2);
    expect(heartbeatEvents[1]?.heartbeatCount).toBe(2);

    end();
    const result = await drainPromise;
    expect(result.error).toBeUndefined();
    expect(result.values).toEqual([]);
  });

  it("does NOT fire the heartbeat when events arrive continuously", async () => {
    const { iterable, push, end } = createManualIterable<string>();
    const heartbeatEvents: Array<{ elapsedMs: number }> = [];

    const wrapped = wrapAsyncIterableWithIdleDetection(iterable, {
      idleHeartbeatMs: 1000,
      idleFallbackMs: 10_000,
      onHeartbeat: (info) => {
        heartbeatEvents.push(info);
      },
      onIdleFallback: () => new Error("should not fire"),
    });

    const drainPromise = drain(wrapped);

    // Send a steady stream of events every 200ms for ~3000ms — well under
    // the heartbeat threshold for every gap, so we expect zero heartbeats.
    for (let i = 0; i < 15; i++) {
      push(`evt-${i}`);
      // Yield microtasks so the wrapper's iterator.next() resolves and the
      // timers reset before the next advance.
      await Promise.resolve();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(200);
    }

    end();
    const result = await drainPromise;
    expect(result.error).toBeUndefined();
    expect(result.values.length).toBe(15);
    expect(heartbeatEvents.length).toBe(0);
  });

  it("throws the idle-fallback error after idleFallbackMs of no events", async () => {
    const { iterable, returnCalls } = createManualIterable<string>();
    const fallbackError = new Error("provider idle timeout: synthetic test");

    const wrapped = wrapAsyncIterableWithIdleDetection(iterable, {
      idleHeartbeatMs: 0, // disable heartbeat for this test
      idleFallbackMs: 5_000,
      onHeartbeat: () => {},
      onIdleFallback: () => fallbackError,
    });

    const drainPromise = drain(wrapped);

    // Let the wrapper arm timers.
    await Promise.resolve();

    // Advance past the fallback threshold without pushing any events.
    await vi.advanceTimersByTimeAsync(5_001);

    const result = await drainPromise;
    expect(result.error).toBe(fallbackError);
    expect(result.values).toEqual([]);
    // The wrapper should have called return() on the upstream iterator.
    expect(returnCalls.count).toBeGreaterThanOrEqual(1);
  });

  it("resets the heartbeat counter / timer when an event arrives mid-idle", async () => {
    const { iterable, push, end } = createManualIterable<string>();
    const heartbeatEvents: Array<{ elapsedMs: number; heartbeatCount: number }> = [];

    const wrapped = wrapAsyncIterableWithIdleDetection(iterable, {
      idleHeartbeatMs: 1000,
      idleFallbackMs: 10_000,
      onHeartbeat: (info) => {
        heartbeatEvents.push(info);
      },
      onIdleFallback: () => new Error("should not fire"),
    });

    const drainPromise = drain(wrapped);

    await Promise.resolve();

    // Sit idle for 800ms — should NOT fire (under threshold).
    await vi.advanceTimersByTimeAsync(800);
    expect(heartbeatEvents.length).toBe(0);

    // Push an event — this must reset the heartbeat timer.
    push("evt-1");
    // Allow the iterator.next() to resolve.
    await Promise.resolve();
    await Promise.resolve();

    // Now sit idle for another 800ms — would total 1600ms from arm time,
    // but only 800ms since the last event, so STILL should not fire.
    await vi.advanceTimersByTimeAsync(800);
    expect(heartbeatEvents.length).toBe(0);

    // Cross the threshold relative to the last event.
    await vi.advanceTimersByTimeAsync(300);
    expect(heartbeatEvents.length).toBe(1);
    expect(heartbeatEvents[0]?.heartbeatCount).toBe(1);

    end();
    const result = await drainPromise;
    expect(result.error).toBeUndefined();
    expect(result.values).toEqual(["evt-1"]);
  });

  it("disabled mode (idleFallbackMs=0) never throws even on indefinite silence", async () => {
    const { iterable, push, end } = createManualIterable<string>();

    const wrapped = wrapAsyncIterableWithIdleDetection(iterable, {
      idleHeartbeatMs: 0,
      idleFallbackMs: 0,
      onHeartbeat: () => {
        throw new Error("heartbeat should not fire in disabled mode");
      },
      onIdleFallback: () => new Error("fallback should not fire in disabled mode"),
    });

    const drainPromise = drain(wrapped);

    // Sit idle for a long time — must NOT throw.
    await vi.advanceTimersByTimeAsync(60_000);

    push("evt-1");
    await Promise.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(60_000);

    end();
    const result = await drainPromise;
    expect(result.error).toBeUndefined();
    expect(result.values).toEqual(["evt-1"]);
  });

  it("is a pure pass-through when both knobs are disabled and yields values in order", async () => {
    const { iterable, push, end } = createManualIterable<number>();

    const wrapped = wrapAsyncIterableWithIdleDetection(iterable, {
      idleHeartbeatMs: 0,
      idleFallbackMs: 0,
      onHeartbeat: () => {},
      onIdleFallback: () => new Error("noop"),
    });

    const drainPromise = drain(wrapped);

    for (let i = 0; i < 5; i++) {
      push(i);
      await Promise.resolve();
    }
    end();

    const result = await drainPromise;
    expect(result.error).toBeUndefined();
    expect(result.values).toEqual([0, 1, 2, 3, 4]);
  });
});

describe("provider-stream-idle / resolveIdleDetectionKnobs", () => {
  it("returns defaults when model has no params", () => {
    expect(resolveIdleDetectionKnobs({})).toEqual({
      idleHeartbeatMs: 20_000,
      idleFallbackMs: 90_000,
    });
    expect(resolveIdleDetectionKnobs(undefined)).toEqual({
      idleHeartbeatMs: 20_000,
      idleFallbackMs: 90_000,
    });
  });

  it("reads numeric overrides from model.params", () => {
    expect(
      resolveIdleDetectionKnobs({
        params: { idleHeartbeatMs: 5_000, idleFallbackMs: 30_000 },
      }),
    ).toEqual({ idleHeartbeatMs: 5_000, idleFallbackMs: 30_000 });
  });

  it("parses string-valued overrides (e.g. from env-substituted configs)", () => {
    expect(
      resolveIdleDetectionKnobs({
        params: { idleHeartbeatMs: "1500", idleFallbackMs: "45000" },
      }),
    ).toEqual({ idleHeartbeatMs: 1_500, idleFallbackMs: 45_000 });
  });

  it("treats false as 'disabled' (zero)", () => {
    expect(
      resolveIdleDetectionKnobs({
        params: { idleHeartbeatMs: false, idleFallbackMs: false },
      }),
    ).toEqual({ idleHeartbeatMs: 0, idleFallbackMs: 0 });
  });

  it("clamps negative values to 0 (disabled)", () => {
    expect(
      resolveIdleDetectionKnobs({
        params: { idleHeartbeatMs: -5, idleFallbackMs: -1 },
      }),
    ).toEqual({ idleHeartbeatMs: 0, idleFallbackMs: 0 });
  });
});

describe("provider-stream-idle / createProviderIdleTimeoutError", () => {
  it("produces an Error whose message contains 'timeout' (failover classifier match)", () => {
    const err = createProviderIdleTimeoutError({
      provider: "openai",
      modelId: "gpt-5",
      elapsedMs: 95_000,
      fallbackMs: 90_000,
    });
    expect(err).toBeInstanceOf(Error);
    expect(err.message.toLowerCase()).toContain("timeout");
    expect(err.message).toContain("openai");
    expect(err.message).toContain("gpt-5");
    expect(err.message).toContain("95000");
  });

  it("annotates structured metadata (code, retryable, provider)", () => {
    const err = createProviderIdleTimeoutError({
      provider: "anthropic",
      modelId: "claude-opus-4.7",
      elapsedMs: 91_000,
      fallbackMs: 90_000,
    }) as Error & { code?: string; retryable?: boolean; provider?: string };
    expect(err.code).toBe("provider_idle_timeout");
    expect(err.retryable).toBe(true);
    expect(err.provider).toBe("anthropic");
  });

  it("omits the model label when modelId is not supplied", () => {
    const err = createProviderIdleTimeoutError({
      elapsedMs: 100_000,
      fallbackMs: 90_000,
    });
    expect(err.message.toLowerCase()).toContain("timeout");
    expect(err.message).toContain("provider"); // generic provider label
  });
});
