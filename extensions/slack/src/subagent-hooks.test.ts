import {
  getRequiredHookHandler,
  registerHookHandlersForTest,
} from "openclaw/plugin-sdk/channel-test-helpers";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerSlackSubagentHooks } from "../subagent-hooks-api.js";
import { __testing as subagentHookTesting } from "./subagent-hooks.js";

const SUBAGENT_RUN_LIVENESS_GATE_SYMBOL = Symbol.for("prest0n.subagentRunLiveness");

const hookMocks = vi.hoisted(() => ({
  sendMessageSlack: vi.fn(async () => ({ messageId: "m1", channelId: "C123", receipt: {} })),
}));

vi.mock("./send.js", () => ({
  sendMessageSlack: hookMocks.sendMessageSlack,
}));

function registerHandlersForTest(config: Record<string, unknown> = { channels: { slack: {} } }) {
  return registerHookHandlersForTest<OpenClawPluginApi>({
    config,
    register: registerSlackSubagentHooks,
  });
}

describe("slack subagent hook handlers", () => {
  beforeEach(() => {
    delete (globalThis as Record<PropertyKey, unknown>)[SUBAGENT_RUN_LIVENESS_GATE_SYMBOL];
    subagentHookTesting.resetSlackSubagentHooksState();
    hookMocks.sendMessageSlack.mockClear();
  });

  afterEach(() => {
    delete (globalThis as Record<PropertyKey, unknown>)[SUBAGENT_RUN_LIVENESS_GATE_SYMBOL];
    vi.useRealTimers();
    subagentHookTesting.resetSlackSubagentHooksState();
  });

  it("resolves Slack thread completion origin after subagent_spawning", async () => {
    const handlers = registerHandlersForTest();
    const spawnHandler = getRequiredHookHandler(handlers, "subagent_spawning");
    const deliveryHandler = getRequiredHookHandler(handlers, "subagent_delivery_target");

    await spawnHandler(
      {
        childSessionKey: "agent:main:subagent:child",
        requester: {
          channel: "slack",
          accountId: "work",
          to: "channel:C123",
          threadId: "1710000000.100001",
        },
      },
      {},
    );

    await expect(
      deliveryHandler(
        {
          childSessionKey: "agent:main:subagent:child",
          requesterSessionKey: "agent:main:main",
          expectsCompletionMessage: true,
        },
        {},
      ),
    ).resolves.toEqual({
      origin: {
        channel: "slack",
        accountId: "work",
        to: "channel:C123",
        threadId: "1710000000.100001",
      },
    });
  });

  it("announces start and posts 5-minute progress updates for Slack thread subagents", async () => {
    vi.useFakeTimers();
    const handlers = registerHandlersForTest();
    const spawnedHandler = getRequiredHookHandler(handlers, "subagent_spawned");

    await spawnedHandler(
      {
        runId: "run-1",
        childSessionKey: "agent:main:subagent:child",
        agentId: "codex",
        label: "issue-review",
        mode: "run",
        threadRequested: true,
        requester: {
          channel: "slack",
          accountId: "work",
          to: "channel:C123",
          threadId: "1710000000.100001",
        },
      },
      {},
    );

    expect(hookMocks.sendMessageSlack).toHaveBeenCalledTimes(1);
    expect(hookMocks.sendMessageSlack).toHaveBeenLastCalledWith(
      "channel:C123",
      expect.stringContaining("started"),
      expect.objectContaining({
        accountId: "work",
        threadTs: "1710000000.100001",
      }),
    );

    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(hookMocks.sendMessageSlack).toHaveBeenCalledTimes(2);
    expect(hookMocks.sendMessageSlack).toHaveBeenLastCalledWith(
      "channel:C123",
      expect.stringContaining("still running"),
      expect.objectContaining({
        accountId: "work",
        threadTs: "1710000000.100001",
      }),
    );
  });

  it("clears the ticker when ended targetSessionKey mismatches but runId matches", async () => {
    vi.useFakeTimers();
    const handlers = registerHandlersForTest();
    const spawnedHandler = getRequiredHookHandler(handlers, "subagent_spawned");
    const endedHandler = getRequiredHookHandler(handlers, "subagent_ended");

    await spawnedHandler(
      {
        runId: "run-mismatch",
        childSessionKey: "agent:main:subagent:child-mismatch",
        agentId: "codex",
        label: "bugfix",
        mode: "run",
        threadRequested: true,
        requester: {
          channel: "slack",
          accountId: "work",
          to: "channel:C123",
          threadId: "1710000000.100001",
        },
      },
      {},
    );

    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(hookMocks.sendMessageSlack).toHaveBeenCalledTimes(2);

    await endedHandler(
      {
        runId: "run-mismatch",
        targetSessionKey: "agent:main:subagent:other-session-key",
        targetKind: "subagent",
        reason: "complete",
        outcome: "ok",
      },
      {},
    );

    expect(hookMocks.sendMessageSlack).toHaveBeenCalledTimes(3);
    expect(hookMocks.sendMessageSlack).toHaveBeenLastCalledWith(
      "channel:C123",
      expect.stringContaining("completed"),
      expect.objectContaining({
        accountId: "work",
        threadTs: "1710000000.100001",
      }),
    );

    await vi.advanceTimersByTimeAsync(15 * 60_000);
    expect(hookMocks.sendMessageSlack).toHaveBeenCalledTimes(3);
  });

  it("self-terminates stale tickers at max age without an ended event", async () => {
    vi.useFakeTimers();
    const handlers = registerHandlersForTest();
    const spawnedHandler = getRequiredHookHandler(handlers, "subagent_spawned");

    await spawnedHandler(
      {
        runId: "run-max-age",
        childSessionKey: "agent:main:subagent:max-age",
        agentId: "codex",
        label: "bugfix",
        mode: "run",
        threadRequested: true,
        requester: {
          channel: "slack",
          accountId: "work",
          to: "channel:C123",
          threadId: "1710000000.100001",
        },
      },
      {},
    );

    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(hookMocks.sendMessageSlack).toHaveBeenCalledTimes(13);

    await vi.advanceTimersByTimeAsync(20 * 60_000);
    expect(hookMocks.sendMessageSlack).toHaveBeenCalledTimes(13);
  });

  it("stops ticker announcements when liveness gate marks the run dead", async () => {
    vi.useFakeTimers();
    const handlers = registerHandlersForTest();
    const spawnedHandler = getRequiredHookHandler(handlers, "subagent_spawned");

    const gate = vi.fn(
      (params: {
        spawnedAt?: number;
      }): { state: string; announceStillRunning: boolean; stopMonitoring: boolean } => {
        const spawnedAt = typeof params.spawnedAt === "number" ? params.spawnedAt : Date.now();
        if (Date.now() - spawnedAt >= 10 * 60_000) {
          return {
            state: "dead",
            announceStillRunning: false,
            stopMonitoring: true,
          };
        }
        return {
          state: "live",
          announceStillRunning: true,
          stopMonitoring: false,
        };
      },
    );
    (globalThis as Record<PropertyKey, unknown>)[SUBAGENT_RUN_LIVENESS_GATE_SYMBOL] = gate;

    await spawnedHandler(
      {
        runId: "run-gate",
        childSessionKey: "agent:main:subagent:gate",
        agentId: "codex",
        label: "gate-check",
        mode: "run",
        threadRequested: true,
        requester: {
          channel: "slack",
          accountId: "work",
          to: "channel:C123",
          threadId: "1710000000.100001",
        },
      },
      {},
    );

    expect(hookMocks.sendMessageSlack).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(hookMocks.sendMessageSlack).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(hookMocks.sendMessageSlack).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(15 * 60_000);
    expect(hookMocks.sendMessageSlack).toHaveBeenCalledTimes(2);
    expect(gate).toHaveBeenCalled();
  });

  it("announces completion and clears progress ticker on matching subagent_ended keys", async () => {
    vi.useFakeTimers();
    const handlers = registerHandlersForTest();
    const spawnedHandler = getRequiredHookHandler(handlers, "subagent_spawned");
    const endedHandler = getRequiredHookHandler(handlers, "subagent_ended");

    await spawnedHandler(
      {
        runId: "run-2",
        childSessionKey: "agent:main:subagent:child2",
        agentId: "codex",
        label: "bugfix",
        mode: "run",
        threadRequested: true,
        requester: {
          channel: "slack",
          accountId: "work",
          to: "channel:C123",
          threadId: "1710000000.100001",
        },
      },
      {},
    );

    await endedHandler(
      {
        targetSessionKey: "agent:main:subagent:child2",
        targetKind: "subagent",
        reason: "complete",
        outcome: "ok",
      },
      {},
    );

    expect(hookMocks.sendMessageSlack).toHaveBeenCalledTimes(2);
    expect(hookMocks.sendMessageSlack).toHaveBeenLastCalledWith(
      "channel:C123",
      expect.stringContaining("completed"),
      expect.objectContaining({
        accountId: "work",
        threadTs: "1710000000.100001",
      }),
    );

    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(hookMocks.sendMessageSlack).toHaveBeenCalledTimes(2);
  });
});
