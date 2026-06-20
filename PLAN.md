# PLAN — Slack Thread Auto-Bind Guard (6-phase SDLC)

Branch: `miles/thread-bind-guard`
Worktree: `/home/miles/projects/openclaw-fork-worktrees/thread-bind-guard`
Base: `main`

## 1) Discovery

- Trace inbound thread provenance fields already available on turn context (`topic_id`, `reply_to_id`, `thread_ts`) via `TemplateContext` and `FinalizedMsgContext` plumbing.
- Trace outbound message send routing for `action="send"` through shared dispatch/runtime layers (`src/auto-reply/reply/dispatch-from-config.ts`, message tool path, and outbound route helper layers).
- Locate the final thread target selection seam where defaulting can be applied once and inherited fleet-wide.

## 2) Design

- Introduce a turn-scoped `turnThreadContext` derived at ingress, carrying canonical inbound thread provenance in precedence order.
- Add shared resolver logic for outbound Slack send thread resolution with deterministic precedence:
  1. Explicit `threadId` arg.
  2. Inbound `topic_id`.
  3. Inbound `reply_to_id` / `thread_ts`.
  4. None (top-level).
- Add explicit `topLevel: true` escape hatch to force top-level delivery even when inbound thread provenance exists.

## 3) Implementation

- Implement resolver and wire it into shared dispatcher-layer send path (Slack-gated behavior, not account-specific).
- Thread `turnThreadContext` from ingress into the send path that handles `action="send"`.
- Add feature flag gate so auto-bind can be disabled at runtime without redeploy.
- Emit structured, high-signal log line whenever auto-bind attaches a thread by guard default.

## 4) Verification

- Add/adjust regression tests for required cases:
  - Threaded inbound -> default binds.
  - Cron/proactive (no threaded inbound trigger) -> remains top-level.
  - Explicit cross-post `threadId` -> honored.
  - Explicit `topLevel: true` -> honored.
- Run required gates:
  - Build/typecheck lane required by task.
  - Dispatch-from-config test suite.

## 5) Hardening

- Validate no behavior change for non-Slack providers and non-thread-triggered turns.
- Ensure no request-time rediscovery regressions; reuse prepared runtime context.
- Keep defaults deterministic and test-covered for future refactors.

## 6) Handoff

- Provide concise change summary with touched files, feature-flag name, and gate outcomes.
- Do not push or open PR.
- Emit completion event command exactly as requested.
