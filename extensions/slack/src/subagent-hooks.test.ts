import {
  getRequiredHookHandler,
  registerHookHandlersForTest,
} from "openclaw/plugin-sdk/channel-test-helpers";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerSlackSubagentHooks } from "../subagent-hooks-api.js";
import { __testing as subagentHookTesting } from "./subagent-hooks.js";

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
    subagentHookTesting.resetSlackSubagentHooksState();
    hookMocks.sendMessageSlack.mockClear();
  });

  afterEach(() => {
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
