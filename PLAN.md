# PLAN — Silent-Turn Delivery Guarantee (miles/silent-turn-guarantee)

Full SDLC plan. This touches the production turn-handling path, so all 6 phases apply.

## Phase 1 — Problem & Scope

**Problem (Miles):** Sometimes a query "goes off" — internal Prest0n or account-specific
Prest0n on Slack — and the user never hears back, for a long time or ever.

**Definitive root causes (see RCA.md for file:line evidence):**

1. **Reasoning-only completion** — the model emits only `isReasoning` payloads; the generic
   channel dispatch loop skips every one (`reply.isReasoning === true → continue`,
   dispatch-from-config.ts:1564), so the turn ends with **zero** user-visible delivery on a
   surface that was owed a reply. PR #23 fixed this on branch `feat/empty-completion-guard`
   but **that branch was never merged to main** — the guard is absent from the live bundle.

2. **Unhandled exception in dispatch** — the top-level `catch` at dispatch-from-config.ts:1660
   does `recordProcessed("error") → markIdle → throw`. It re-throws WITHOUT delivering any
   user-visible message. Upstream channel callers log/swallow it; the user gets nothing.

3. **Final-delivery failure** — `routeReplyToOriginating`/`dispatcher.sendFinalReply` returns
   not-ok (`finalDeliveryFailed = true`) and nothing else is attempted; the user is owed a
   reply and silently gets none.

4. **Drain-kill on restart (process death)** — systemd `TimeoutStopSec=30` but the gateway's
   internal restart drain budget is `DEFAULT_RESTART_DRAIN_TIMEOUT_MS = 300_000` (300s).
   On restart the gateway logs `draining N active task(s) ... with timeout 300000ms` and
   waits up to 5 min, but systemd SIGKILLs the process group at **30s**
   (`KillMode=control-group`). The in-flight turn dies mid-model-call with no delivery.
   Confirmed twice in journal: 16:06:28→16:06:59 and 23:02:30→23:03:00.

**Scope of THIS change (code-side, in-process, low-risk, non-redundant):** close modes
**1, 2, 3** and the _graceful_ portion of **4** with ONE deterministic finally-guarantee
inside `dispatchReplyFromConfig`. Mode 4's hard SIGKILL (process already dead) cannot be
closed by in-process code — that is a config fix (`TimeoutStopSec`) + the existing REL-024a
orphan reconciler's job; documented in RCA, not implemented here.

## Phase 2 — Design

Single additive, idempotent, feature-flagged **terminal-outcome finally guarantee** in
`dispatchReplyFromConfig`:

- New function-scoped tracker `userVisibleFinalDelivered` (set true on every successful
  final delivery, including existing paths).
- New function-scoped primitive `deliverGuaranteedFinalText(text)` — mirrors the
  route-or-dispatcher fallback already used by `sendFinalPayload`, text-only, accessible
  from BOTH the success tail and the `catch` block.
- **Reasoning-only promotion** (folds in PR #23's proven behavior): after the reply loop,
  when `!suppressDelivery && !attemptedFinalDelivery && replies.length > 0`, promote the
  last reasoning payload carrying visible text to a real final.
- **Final-delivery-failure backstop** (success tail): if the turn actually attempted a real
  delivery (`attemptedFinalDelivery === true`) but transport failed
  (`finalDeliveryFailed === true`) and `!userVisibleFinalDelivered`, deliver ONE honest
  "I prepared a reply but couldn't deliver it — please try again" final. (We deliberately do
  NOT fire on zero deliverable payloads: that is intentional NO_REPLY/lurk silence, exactly
  the case PR #23 excluded with `replies.length > 0`.)
- **Exception backstop** (catch block): if owed and `!userVisibleFinalDelivered`, deliver
  ONE honest "I hit an error partway through; here's where things stand — please try
  again" final, then re-throw (preserve existing error propagation/observability).
- **Feature flag** `OPENCLAW_SILENT_TURN_GUARANTEE` (default ON; `0|false|off` disables).
- **Idempotency:** every delivery path flips `userVisibleFinalDelivered`; the guard checks
  it before sending, so it can never double-post when a real answer already went out, and
  the success-tail + catch backstops are mutually exclusive.
- **Cannot fire on intentional silence:** NO_REPLY/lurk yields zero payloads and
  `suppressDelivery`/message-tool-only turns are excluded — same exclusions PR #23 proved.

### Non-redundancy with the 3 existing watchdogs (see RCA §4)

- REL-024a auto-ack (text ack disabled; :eyes: + orphan reconciler) — journalctl-tailing
  sidecar, fires at 5 min, can ONLY post-mortem recover; can't see in-process terminal
  outcomes. Our guard fires synchronously at turn-end. The reconciler's `markVisible`
  observes our delivery in the journal, so no double-fire.
- slack-silent-turn-watchdog.py — alerts #bug-squasher (observability), never replies to
  the user. Orthogonal.
- managed-task-watchdog.py — only watches explicitly-managed background tasks in
  `tmp/managed-tasks`, not ordinary inbound turns. Orthogonal.

## Phase 3 — Implementation

Edit `src/auto-reply/reply/dispatch-from-config.ts` only. ~5 surgical insertions.

## Phase 2b — Always-get-back-to-the-user signals (extends the SAME mechanism)

The terminal guarantee answers "the turn never ENDS silent." Two interim signals answer
"the turn never LOOKS dead while it runs." Both are folded into the same turn-scoped state
and the same single low-level send path (`deliverSilentTurnText`) — NO sidecar, NO watchdog,
NO competing send path.

### Shared turn-scoped state (single source of truth)

- `userVisibleFinalDelivered` — set true by every successful TERMINAL final; checked by the
  terminal guard (no double-post) AND by both interim signals (never fire after the answer).
- `receiptAckSent` — idempotency latch: at most one receipt ack per turn.
- `heartbeatCount` — bounded still-working beats.
- `receiptAckTimer` / `heartbeatTimer` — torn down by `cancelSilentTurnSignals()`, which is
  called (a) on every successful terminal delivery and (b) in a `finally` wrapping the whole
  dispatch body, so timers can NEVER leak on success, early return, or error.

### Signal #1 — Receipt ack (substantive, non-filler)

- Armed at turn start (`armSilentTurnSignals()`, right after `markProcessing()`), as a single
  `setTimeout(receiptAckDelayMs)`.
- The ack text is tied to the actual inbound request (first line of the inbound body, clipped
  to 80 chars): _"Got it — I'm working on your request: “<snippet>”. I'll follow up shortly."_
  — NOT empty "working on it" filler.
- SUPPRESSED on fast turns: terminal delivery calls `cancelSilentTurnSignals()`, clearing the
  timer before it fires. So if the real answer lands within the window, the user never sees a
  redundant ack.
- Idempotent: `receiptAckSent` is set before awaiting, and the fire-guard re-checks
  `userVisibleFinalDelivered` / `suppressDelivery`.

### Signal #2 — Still-working heartbeat (lightweight, bounded)

- Armed at turn start as a `setInterval(heartbeatIntervalMs)`; first beat at the interval,
  then every interval.
- Bounded by `heartbeatMax` (default 10) — the interval self-clears when the cap is hit.
- Stops immediately on terminal delivery / turn end via `cancelSilentTurnSignals()`; the
  interval body also re-checks `userVisibleFinalDelivered`/`suppressDelivery` each tick.

### How the three coordinate

All three read/write ONE set of turn-scoped vars. Terminal delivery is authoritative: the
moment a real final lands it flips `userVisibleFinalDelivered` and cancels the ack timer +
heartbeat interval. The interim signals never run after that flag is set, and they reuse the
exact same `routeReplyToOriginating` → `dispatcher.sendFinalReply` fallback the terminal
guarantee uses. When `suppressDelivery` is true (e.g. sendPolicy deny / message_tool_only),
`armSilentTurnSignals()` is a no-op — same exclusion as the terminal guard.

### REL-024a reconciliation

The external REL-024a watchdog's TEXT auto-ack stays DISABLED (`ACK_DELAY_MS=0`; it only does
an :eyes: reaction + activity logging). THIS in-process receipt ack is the single substantive
text ack, so there is no conflicting double text ack. Documented in code comments too.

### Env flags table

| Env var                                      | Default | Meaning                                                                                       |
| -------------------------------------------- | ------- | --------------------------------------------------------------------------------------------- |
| `OPENCLAW_SILENT_TURN_GUARANTEE`             | on      | Master switch. Off ⇒ byte-for-byte prior code path (no terminal guard, no ack, no heartbeat). |
| `OPENCLAW_SILENT_TURN_RECEIPT_ACK`           | on      | Signal #1 receipt ack (gated under master).                                                   |
| `OPENCLAW_SILENT_TURN_HEARTBEAT`             | on      | Signal #2 still-working heartbeat (gated under master).                                       |
| `OPENCLAW_SILENT_TURN_ACK_DELAY_MS`          | 4000    | Ack suppression window. Real answer within this window ⇒ ack cancelled.                       |
| `OPENCLAW_SILENT_TURN_HEARTBEAT_INTERVAL_MS` | 30000   | First beat + cadence.                                                                         |
| `OPENCLAW_SILENT_TURN_HEARTBEAT_MAX`         | 10      | Max heartbeats per turn (bounded).                                                            |

All on/off flags accept `0|false|off` to disable; positive-int flags fall back to the default
on missing/invalid values.

## Phase 4 — Tests

New regression cases in `dispatch-from-config.test.ts`:

1. reasoning-only completion → guard promotes one final (not suppressed)
2. owed-but-empty (no payloads of any deliverable kind) → honest backstop final
3. exception in dispatch → catch backstop delivers one final, still throws
4. suppressed turn → guard does NOT fire
5. intentional silence (zero replies, not owed) → guard does NOT fire
6. final-delivery failure (attempted but transport not-ok) → backstop delivers one honest final
7. real final already delivered → guard does NOT double-send
8. feature flag off → guard does NOT fire

Signal #1 + #2 cases (fake timers):

9.  fast turn → ack suppressed, exactly one terminal final
10. slow turn → ack fires once (referencing the inbound request), then terminal final, no dupes
11. very long turn → heartbeats fire bounded by the cap, then stop on terminal final
12. flags off → no ack/heartbeat (prior behavior)
13. master switch off → no ack/heartbeat even with sub-flags on
14. idempotency → terminal final cancels the pending ack + stops heartbeats
15. suppressed turn (sendPolicy deny) → no ack/heartbeat (not owed a reply)

## Phase 5 — Build & Verify

`node scripts/build-all.mjs` — confirm runtime tsdown bundle builds; the two PRE-EXISTING
dts errors (manifest 7207aa1aa2: manager.core.ts:608, socket-adapter.ts:28) are not ours.
Targeted vitest: dispatch-from-config suite green.

## Phase 6 — Handoff

No merge, no gateway restart, no deploy. Report RCA + mechanism + files + tests + build +
flag name + residual risks to parent for review.

## Residual risks (pre-noted)

- Hard SIGKILL drain-kill (mode 4) not closed here — needs `TimeoutStopSec` alignment
  (config) + REL-024a reconciler. Documented.
- Honest-error backstop text is generic by design (no leak of internals on customer
  surfaces); attorney-voice tenants may want tenant-specific copy later (prompt layer).
