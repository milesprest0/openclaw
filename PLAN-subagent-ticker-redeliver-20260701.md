# PLAN — Fix orphaned subagent progress ticker + empty-completion redelivery loop

Branch: `fix/subagent-ticker-redeliver-20260701` (off `origin/main` @ 8c05768550)
Worktree: `/home/miles/projects/oc-ticker-redeliver-fix`
Author context: Miles approved (Slack #prest0n-development, thread 1782859235.453689, "yes" 2026-07-01 02:59 UTC)

## Background (observed incident)

The subagent `history-cache-sdlc` completed with an EMPTY result. Afterward, the Slack thread received a "Subagent … is still running (Nm elapsed)." message every 5 minutes AND, earlier, a duplicate terminal completion re-posted every ~5 minutes. Two INDEPENDENT bugs caused this. Both were live-patched (manual DB edit + gateway restart) but neither is fixed in code. This PLAN fixes both durably with regression tests.

---

## BUG 1 — Orphaned Slack subagent progress ticker (in-memory `setInterval`)

### File

`extensions/slack/src/subagent-hooks.ts`

### Root cause (confirmed by reading the code)

- `handleSlackSubagentSpawned` stores ticker state in `slackSubagentStateBySessionKey` keyed by **`event.childSessionKey`** and starts a 5-min `setInterval` via `maybeStartSlackSubagentTicker`.
- `handleSlackSubagentEnded` looks the state up by **`event.targetSessionKey`** (`slackSubagentStateBySessionKey.get(event.targetSessionKey)`). If that key does NOT match the key used at spawn time (which is what happened for `history-cache-sdlc`), the lookup returns `undefined`, the function early-returns (`if (!state) return;`), and `clearSlackSubagentTicker` is NEVER called.
- Result: the `setInterval` is orphaned in process memory. It is `unref()`'d so it won't hold the event loop open, but it keeps firing every 5 min for the life of the gateway process. There is NO max-age backstop, so nothing stops it short of a restart.

### Fix requirements

1. **Guarantee ticker clearing on every terminal outcome regardless of key mismatch.**
   - `SlackSubagentEndedEvent.outcome` currently allows `"ok" | "error" | "timeout" | "killed" | "reset" | "deleted"`. Ensure every one of these clears the ticker. (It already does IF the key matches — the real problem is the key miss.)
   - Make `handleSlackSubagentEnded` resilient to key mismatch: when the direct `get(targetSessionKey)` misses, still make a best-effort attempt to clear any ticker that belongs to this ended subagent. Options (build agent to choose the cleanest, minimal one):
     - (a) Track BOTH the spawn key and any alternate/target session key on the state so ended-lookup can find it; OR
     - (b) Have the lifecycle emitter pass a stable identity (e.g., the same key used at spawn) so ended and spawned agree; OR
     - (c) As a guaranteed backstop independent of key identity, add mechanism #2 below.
   - Prefer fixing the key mismatch at its source AND keeping the backstop. Investigate the lifecycle emitter (`src/agents/subagent-registry-lifecycle.ts`) to learn which key it passes on spawn vs. ended so the correct minimal fix is chosen. Do NOT guess — trace the actual call sites.
2. **Max-age self-terminating backstop (defense in depth).** Add a hard cap so no ticker can outlive its subagent indefinitely. On each tick, if `Date.now() - state.spawnedAt` exceeds a cap (e.g. `SLACK_SUBAGENT_PROGRESS_TICKER_MAX_AGE_MS`, suggest 60 min — make it a named const), the ticker self-clears (`clearSlackSubagentTicker(state)` + remove from Map) and stops posting. This guarantees termination even if the ended event never arrives or keys never match.
3. Keep the existing `unref()` behavior and best-effort catch semantics.
4. Do NOT change the 5-min interval value or the message text (out of scope).

### Regression tests (must FAIL on current code, PASS after fix)

Add to a new/existing test near `extensions/slack/src/` (look for existing test harness for this plugin; use `__testing.resetSlackSubagentHooksState()` between cases):

- **T1 (key-mismatch clear):** spawn with childSessionKey `A`, then fire ended with `targetSessionKey` `B` (mismatch) representing the same subagent → assert the ticker for the subagent is cleared (no further posts). This test MUST fail on current code. If the chosen fix routes identity through the emitter, adapt the test to exercise that path.
- **T2 (max-age backstop):** spawn a ticker, advance fake timers beyond the max-age cap, assert the interval self-clears and stops posting even with NO ended event. Use fake timers (`vi.useFakeTimers()`).
- **T3 (normal path regression):** spawn key `A`, ended key `A` → ticker cleared + single completion message posted (existing behavior preserved).

---

## BUG 2 — Empty/void terminal completion redelivery loop (task store)

### File

`src/tasks/task-registry.ts` (function `maybeDeliverTaskTerminalUpdate`, ~lines 1108-1225)

### Root cause (confirmed by reading the code)

- Compare the TWO delivery paths:
  - `maybeDeliverTaskStateChangeUpdate` (state-change path, ~line 1225+) correctly gates on the watermark: `if (!latestEvent || (deliveryState?.lastNotifiedEventAt ?? 0) >= latestEvent.at) return;` AND on success calls `upsertTaskDeliveryState({ taskId, lastNotifiedEventAt: latestEvent.at })`. So it stamps the watermark.
  - `maybeDeliverTaskTerminalUpdate` (terminal path) sets `deliveryStatus:"delivered"` on success but **never stamps `lastNotifiedEventAt`** in `task_delivery_state`. It relies solely on `deliveryStatus`.
- Incident specifics (from live DB): task `ab48bb8e` was `status=succeeded` but `delivery_status=pending` with `last_notified_event_at = NULL`. The terminal delivery apparently didn't reach `delivered` (empty result / delivery path where status stayed `pending`), and because the watermark was never stamped, the notifier kept re-selecting the same pending task every ~5 min and re-posting the terminal message.
- The gap: an EMPTY/void terminal result can land the row in `pending` with a NULL watermark, and nothing advances the watermark, so redelivery loops forever.

### Fix requirements

1. **Stamp the notify watermark on terminal delivery too.** When `maybeDeliverTaskTerminalUpdate` reaches a terminal decision (delivered, session_queued, not_applicable, or a definitive failure that should not retry), call `upsertTaskDeliveryState({ taskId, lastNotifiedEventAt: <terminal event .at or Date.now()> })` so the terminal event can't be re-selected indefinitely. Mirror how the state-change path stamps the watermark.
2. **Empty/void result must not loop.** Ensure that a terminal outcome with an empty/void payload still advances the watermark / marks a definitive delivery status (delivered or not_applicable), never leaving `pending` + NULL watermark. Trace `shouldAutoDeliverTaskTerminalUpdate`, `formatTaskTerminalMessage`, and the `pending` transition at line ~798 (`if (params.deliveryStatus === "pending" && existing.deliveryStatus !== "delivered")`) to understand how a row lands in `pending`.
3. Preserve genuine retry-on-transient-failure semantics — do NOT stamp the watermark in a way that suppresses a legitimate retryable failure (network send error). The loop we're killing is the "succeeded + empty result + pending + null watermark" case, not real failures. Distinguish carefully: the `failed` branch that queues a fallback should still be allowed to retry per existing policy; the fix is specifically about terminal success/empty landing in a permanent pending+null-watermark state.

### Regression tests (must FAIL on current code, PASS after fix)

Add to `src/tasks/` test suite (see `task-registry.store.test.ts` / `task-registry.store.sqlite.ts` tests for patterns):

- **T4 (empty terminal no-loop):** simulate a terminal succeeded task with an empty/void terminal message, run the terminal delivery, then run it again → assert it is NOT re-delivered a second time (watermark stamped or status is definitively delivered/not_applicable). This MUST fail on current behavior if current behavior loops.
- **T5 (watermark stamped on terminal delivery):** after a successful terminal delivery, assert `getTaskDeliveryState(taskId).lastNotifiedEventAt` is set (non-null).
- **T6 (retryable failure still retries):** a transient send failure must NOT stamp the watermark in a way that blocks a later legitimate delivery (guard against over-suppression).

---

## BUG 3 (cleanup, low-risk) — Sweep stale pending rows

Not a code change to the repo; a one-time DB maintenance step on the live box, done SEPARATELY and carefully AFTER the code fix is validated:

- Stale `pending` rows on OTHER threads left untouched during the live-patch: b32439ff, ecd1b904, 9fe59a71, 5f6322dc, 682a03e6, d2a54df2, e8cac6d8, 75bccd6c, 314e9949, 880f63be, 4b57308a.
- These are older `failed`/`lost` on other threads. Verify each is genuinely dead (not an active workstream) before marking delivered. Back up `runs.sqlite` first. This is done by the orchestrator (me), NOT the build agent, and is out of scope for this PR's code.

---

## SDLC phases

- **Phase 1 (done by orchestrator):** Root cause both bugs — DONE, documented above with exact file/line evidence.
- **Phase 2 (build agent):** Implement Bug 1 + Bug 2 fixes in this worktree per requirements. Trace call sites; do not guess. Choose minimal, correct fixes.
- **Phase 3 (build agent):** Add regression tests T1–T6. Tests must fail on current behavior before the fix, pass after.
- **Phase 4 (build agent):** `npm run build` (or `tsc`/typecheck) clean; run the new + adjacent test suites green (`vitest run` on the touched areas). Report exact pass/fail counts.
- **Phase 5 (orchestrator):** Review diff, confirm reversibility, commit, push, open PR to `main`. Deploy-verify. Then do Bug 3 DB sweep separately.
- **Phase 6 (orchestrator):** Harvest learnings to memory.

## Constraints

- Do NOT touch `~/.openclaw/openclaw.json` or any live config/DB from the build agent.
- Do NOT modify the 5-min interval value or message wording.
- Keep changes minimal and additive where possible; everything reversible.
- All changes stay in this worktree/branch. No live-instance checkout is touched.
- Report real test counts — never fabricate a passing result.
