# PLAN — Deterministic Empty-Completion Guard

## Problem

On generic channel dispatch (Slack group/thread), a turn can complete having produced
ONLY reasoning/thinking payloads. The reply loop in `dispatch-from-config.ts` skips
reasoning payloads (`if (reply.isReasoning === true) continue;`) because this path has
no reasoning lane. Result: `attemptedFinalDelivery=false`, `queuedFinal=false`,
`counts.final=0` → `hasVisibleChannelTurnDispatch` returns false → `dispatch_silent`.
The user gets nothing on a turn they were owed a reply for.

## Goal

Deterministically guarantee a user-facing final on the correct thread when a turn was
_supposed_ to reply but emitted only reasoning. Code-side, no model reliance, no
redundancy, no firing on intentional silence.

## Trigger (ALL must hold) — narrow by construction

1. `!suppressDelivery` — we were actually supposed to deliver on this surface.
2. `replies.length > 0` — the model produced content (not a NO_REPLY/lurk; those yield
   zero reply payloads, so the guard never fires on deliberate silence).
3. `attemptedFinalDelivery === false` — every produced payload was `isReasoning` and got
   skipped, so nothing reached the channel.

This shape is _exactly_ "reasoning-only completion". It cannot collide with:

- Deliberate group silence / NO_REPLY → `replies.length === 0` (guard skipped).
- Suppressed/message-tool-only turns → `suppressDelivery` true (guard skipped).
- Normal replies → `attemptedFinalDelivery` true (guard skipped).
- Tool/block-only turns that legitimately delivered → `attemptedFinalDelivery` may be
  false but `replies.length` reflects final payloads only; if a final existed it was
  attempted. Reasoning-only is the only path with replies>0 and attempted=false.

## Action (Tier A only — cheapest, no model re-call)

Promote the last reasoning payload that has non-empty `text` to a real final:

- Clone payload, set `isReasoning: false`, deliver via existing `sendFinalPayload`.
- Update `queuedFinal`, `routedFinalCount`, `attemptedFinalDelivery`, `finalDeliveryFailed`
  exactly as the normal loop does, so all downstream accounting (success-clear,
  counts.final, `hasVisibleChannelTurnDispatch`) is correct and idempotent.
- If no reasoning payload has text (degenerate), do nothing (no empty post).

Tier B (bounded retry) and Tier C (template) are intentionally NOT implemented now:
Tier A resolves the observed failure mode (reasoning-only) with zero extra cost and zero
new model calls. Retry/template can be layered later if a truly-empty (replies.length===0
but supposed-to-reply) shape is ever observed; that is a different, not-yet-seen failure.

## Idempotency / redundancy

- Guard runs once, synchronously, after the reply loop, inside the existing try block.
- It only acts when `attemptedFinalDelivery===false`; once it delivers, attempted=true,
  so the existing success-clear block runs exactly once and nothing double-posts.

## Thread correctness

- `sendFinalPayload` → `routeReplyToOriginating` uses the same originating-thread routing
  the normal final uses. No new thread, no top-level post.

## Files

- `src/auto-reply/reply/dispatch-from-config.ts` — insert guard after the reply loop,
  before `if (attemptedFinalDelivery && !finalDeliveryFailed)`.

## Tests (regression gate)

- New test in `dispatch-from-config.test.ts`:
  - reasoning-only replies + not suppressed → guard promotes one final; `queuedFinal` true,
    `counts.final===1`.
  - reasoning-only replies + suppressed → guard does NOT fire.
  - zero replies (NO_REPLY) + not suppressed → guard does NOT fire.
  - normal final reply → guard does NOT fire (no double-send; counts.final===1).
- `npm run build` (typecheck) exit 0.
- Targeted vitest on dispatch-from-config + dispatch-result + kernel.
