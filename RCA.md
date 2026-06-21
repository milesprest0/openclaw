# RCA — Why a Prest0n turn can end without the user hearing back

Scope: every way a Slack (internal or account-specific) turn can terminate without emitting
exactly one user-visible final delivery. Each mode cites exact `file:line` in the live
codebase (`~/projects/openclaw-fork`, runtime = `dist/index.js`) and states whether each of
the 3 existing watchdogs catches it.

---

## The turn-delivery happy path (baseline)

`dispatchReplyFromConfig` (`src/auto-reply/reply/dispatch-from-config.ts:364`) runs the agent,
collects `replies`, and in the delivery loop (lines 1560–1577) calls `sendFinalPayload` for
each non-reasoning, non-suppressed reply. `sendFinalPayload` (line 987) routes via
`routeReplyToOriginating` (line 573) or falls back to `dispatcher.sendFinalReply`. On success
the success tail (lines 1650–1657) records `completed` + `markIdle("message_completed")`.

A turn is "owed a reply" when `suppressDelivery === false` (resolved at line 787). The bug is:
several terminal outcomes leave an owed turn with **no** `sendFinalPayload` success and **no**
compensating delivery.

---

## Mode 1 — Reasoning-only completion (CONFIRMED, live in main)

**Evidence:** delivery loop at `dispatch-from-config.ts:1562-1565`:

```
for (const reply of replies) {
  if (reply.isReasoning === true) { continue; }   // line 1564
```

If the model emits ONLY `isReasoning` payloads (reasoning lane not supported on generic
channel dispatch), every reply is skipped, `attemptedFinalDelivery` stays `false`, the loop
ends, and the success tail records `completed` — a **silent turn**. The user is owed a reply
and gets nothing.

**PR #23 status:** commit `a39552d05a` ("fix(dispatch): deterministic empty-completion guard
for reasoning-only turns") added exactly this guard — but `git merge-base --is-ancestor
a39552d05a HEAD` → **NOT in HEAD**. It lives only on unmerged branch
`feat/empty-completion-guard`. **So this failure mode is currently live in production.**

**Watchdog coverage:**

- REL-024a: text ack disabled (`ACK_DELAY_MS = 0`, line 42); orphan reconciler fires only
  after `ORPHAN_AFTER_MS = 5 min` of _no journal activity_ — but a reasoning-only turn DOES
  emit `run:completed` lifecycle activity, so the reconciler treats it as
  `reconciler:heartbeat-observed`/`outbound-observed` and **finalizes as completed, never
  posting a recovery message** (lines 665-683). **NOT caught.**
- slack-silent-turn-watchdog.py: would detect "mention without delivered reply in 60s" and
  alert #bug-squasher — but it only ALERTS observability, never replies to the user. **User
  still silent.**
- managed-task-watchdog.py: only watches `tmp/managed-tasks` managed jobs. **NOT caught.**

---

## Mode 2 — Unhandled exception in dispatch (CONFIRMED)

**Evidence:** top-level catch at `dispatch-from-config.ts:1660-1671`:

```
} catch (err) {
  ... dedupe bookkeeping ...
  recordProcessed("error", { error: String(err) });
  markIdle("message_error");
  throw err;                                        // line 1670
}
```

Any throw after the model runs (TTS failure, media normalization, route plumbing, a hook,
etc.) lands here and is **re-thrown with no user-visible delivery**. Note the agent-runner
DOES synthesize failure replies for _known_ classes (model-switch, context-overflow,
GatewayDraining: `agent-runner-execution.ts:2024-2058`), but any exception escaping those
into the dispatch catch produces silence. Upstream channel callers
(`runtime-channel.ts:103`, `inbound-reply-dispatch.ts`) log/swallow — user gets nothing.

**Watchdog coverage:** Same as Mode 1 — REL-024a reconciler keys on journal _idle_; an
error that logs `message_error` looks like activity. slack-silent-turn-watchdog only alerts
observability. **NOT caught for the user.**

---

## Mode 3 — Final delivery failure (CONFIRMED)

**Evidence:** delivery loop at `dispatch-from-config.ts:1573-1576`:

```
if (!finalReply.queuedFinal && finalReply.routedFinalCount === 0) {
  finalDeliveryFailed = true;
}
```

When the route/dispatcher returns not-ok (transient Slack API failure, dropped socket,
binding race), `finalDeliveryFailed` is set, the success-clear is skipped (line 1579), but
**no retry or compensating delivery is attempted** and the function returns "completed-ish".
The user is owed and gets nothing.

**Watchdog coverage:** REL-024a reconciler MIGHT catch true abandonment after 5 min IF no
other journal activity — but a partial delivery attempt logs activity. Best case: a delayed,
generic recovery message 5+ min later via the sidecar (fragile, journalctl-dependent).
**Not deterministically caught.**

---

## Mode 4 — Drain-kill on restart / process death (CONFIRMED — the original smoking gun)

**Evidence (config vs. code mismatch):**

- systemd unit: `TimeoutStopSec=30`, `KillMode=control-group` (`systemctl --user cat
openclaw-gateway.service`).
- gateway internal drain budget: `DEFAULT_RESTART_DRAIN_TIMEOUT_MS = 300_000`
  (`src/cli/gateway-cli/run-loop.ts:12`), used at run-loop.ts:411 to log
  `draining N active task(s) ... with timeout 300000ms` and to `waitForActiveTasks(300000)`
  / `waitForActiveEmbeddedRuns(300000)` (lines 423-426).
- The in-process force-exit watchdog is armed to `restartDrainTimeoutMs + SHUTDOWN_TIMEOUT_MS`
  (run-loop.ts:341), i.e. ~305s — **but systemd's 30s `TimeoutStopSec` fires first** and
  SIGKILLs the whole control group.

**Journal proof (two occurrences):**

```
23:02:30  [gateway] draining 2 active task(s) and 1 active embedded run(s) ... timeout 300000ms
23:03:00  [gateway] still draining 2 active task(s) ...
23:03:00  openclaw-gateway.service: Failed with result 'timeout'.   ← SIGKILL at +30s
16:06:28  [gateway] draining 4 active task(s) ... timeout 300000ms
16:06:59  openclaw-gateway.service: Failed with result 'timeout'.   ← SIGKILL at +31s
```

The turn is killed mid-`model_call` (the 15:50 stalled-session log shows the same session in
`model_call` for 200s+). `abortActiveReplyRuns({mode:"all"})` → `abortForRestart()`
(`reply-run-registry.ts:511-520`) is _supposed_ to make the in-flight turn return
`buildRestartLifecycleReplyText()` ("⚠️ Gateway is restarting...",
`agent-runner-execution.ts:920,2024`) — but:
(a) on a hard SIGKILL the process is dead before that reply can be delivered, and
(b) even on a graceful drain, the abort raced the model call and the user often saw nothing.

**Two sub-modes:**

- **4a graceful drain abort** — process still alive; the restart-lifecycle reply _can_ be
  emitted but only if the turn reaches the abort-aware branch. In-process code CAN guarantee
  this.
- **4b hard SIGKILL** — process dead at 30s; **no in-process code can run**. This is NOT
  fixable in the gateway; it needs the systemd `TimeoutStopSec` to be ≥ the drain budget (or
  the drain budget lowered to < `TimeoutStopSec`), plus the REL-024a orphan reconciler as the
  cross-restart backstop.

**Watchdog coverage:** REL-024a reconciler is the ONLY thing that can recover 4b (post
restart, after 5 min idle) — fragile and slow but it is the right layer for a dead process.
slack-silent-turn / managed-task: no coverage.

---

## Summary table

| Mode                     | Owed-turn silent?  | In-process fix possible? | Caught by existing watchdogs?   |
| ------------------------ | ------------------ | ------------------------ | ------------------------------- |
| 1 Reasoning-only         | Yes (live in main) | **Yes**                  | No (reconciler sees activity)   |
| 2 Unhandled exception    | Yes                | **Yes**                  | No (logs look like activity)    |
| 3 Final-delivery failure | Yes                | **Yes**                  | Only late/generic, fragile      |
| 4a Graceful drain abort  | Sometimes          | **Yes**                  | No                              |
| 4b Hard SIGKILL          | Yes                | **No** (process dead)    | Only REL-024a reconciler (5min) |

## Decision

ONE deterministic in-process finally-guarantee inside `dispatchReplyFromConfig` closes
**1, 2, 3, and 4a** — the modes in-process code can actually own — without adding a 4th
sidecar. **4b** is explicitly left to a config alignment (`TimeoutStopSec`) + the existing
REL-024a reconciler, because no in-process mechanism can run after SIGKILL. This is the
smallest non-redundant change that closes the gap.
