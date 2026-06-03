# PLAN — Allow assistant failover when a timeout fires during a read-only tool call

Branch: `fix/failover-readonly-tool-timeout-20260603`

## Problem (production incident)

Fernando's legal VM was processing 12 fax PDFs. Opus timed out mid doc-read tool call
at ~5min. Because a tool execution was in flight, `timedOutDuringToolExecution` was set,
which the assistant-stage failover guard treats as a hard block on rotation/fallback. The
run dead-ended in `surface_error` ("I'm having trouble connecting right now") instead of
rotating down the configured fallback ladder (gemini-3.1-pro → qwen3.7-max → gpt-5.5).

The blanket block exists to avoid re-running side-effecting tools (exec/edit/write/message
send) on a fresh model after a timeout. But for **read-only / idempotent** tools (read, doc
extract, search, memory_get, etc.) there is no mutation risk, so we SHOULD fail over and let
heavy multi-doc turns degrade gracefully.

## Root cause

- `src/agents/pi-embedded-runner/run/failover-policy.ts` `shouldRotateAssistant`:
  `(params.timedOut && !timedOutDuringCompaction && !timedOutDuringToolExecution)` — blanket
  block on any in-flight tool.
- `timedOutDuringToolExecution` set in `attempt.ts` (~2384) purely from
  `countActiveToolExecutions(runId) > 0`; it does NOT know tool names/kinds. The active-tool
  tracker (`toolStartData` in `pi-embedded-subscribe.handlers.tools.ts`) stored only
  `{startTime, args}` per `runId:toolCallId` — no tool name.

## Change

1. **Track tool name on active executions** (`pi-embedded-subscribe.handlers.tools.ts`):
   - Add `toolName` to `ToolStartRecord` and store the normalized tool name at
     `handleToolExecutionStart` (name already available there).
   - Add `allActiveToolExecutionsReadOnly(runId)` returning `true` only when there is at least
     one active execution AND every active execution is read-only/idempotent.
   - Read-only classification via a dedicated allowlist (`isReadOnlyToolName`): read,
     doc/attachment extract, search/memory_search, memory_get, sessions_history/sessions_list,
     session_status (status action is read), image (analysis). Everything else (exec, edit,
     write, message, sessions_send, sessions_spawn, process, gateway, cron, canvas, nodes, …)
     is treated as side-effecting. **Fail-closed**: unknown tool name ⇒ NOT read-only.
2. **Compute sibling flag in `attempt.ts`** (`abortRun` timeout path): set
   `timedOutDuringReadOnlyToolExecution = timedOutDuringToolExecution && allActiveToolExecutionsReadOnly(runId)`.
   Thread it through the attempt result object alongside `timedOutDuringToolExecution`.
3. **Thread the boolean** through:
   - `run/types.ts` — add `timedOutDuringReadOnlyToolExecution?: boolean` to
     `EmbeddedRunAttemptResult`.
   - `run.ts` — read `attempt.timedOutDuringReadOnlyToolExecution ?? false`; pass into the
     assistant-stage `resolveRunFailoverDecision({...})` (~2217) and `handleAssistantFailover`.
   - `assistant-failover.ts` — accept the new param and forward into its internal
     `resolveRunFailoverDecision` call (post profile-rotation).
   - `failover-policy.ts` — add `timedOutDuringReadOnlyToolExecution: boolean` to
     `AssistantDecisionParams`.
4. **Relax the guard** in `failover-policy.ts` `shouldRotateAssistant`:
   ```
   (params.timedOut && !params.timedOutDuringCompaction &&
     (!params.timedOutDuringToolExecution || params.timedOutDuringReadOnlyToolExecution))
   ```
   Side-effecting tool timeouts remain blocked (no re-running mutations).

## Decision on the run.ts ~1450 timeout-compaction guard

`if (timedOut && !timedOutDuringCompaction && !timedOutDuringToolExecution)` gates
timeout-triggered compaction-then-retry. **Decision: leave as-is.** A read-only-tool timeout
should fail over to a fallback model (the user-facing degradation we want), not trigger a
same-model compaction+retry that would re-enter the same heavy multi-doc tool turn on the
same slow model. Compaction-then-retry is for the LLM-generation death-spiral case; the
read-only-tool fix targets the rotation/fallback path specifically. Keeping the compaction
guard narrow (no in-flight tool at all) is the conservative, well-scoped choice and composes
cleanly: read-only timeouts skip compaction and proceed to the relaxed failover decision.

## Tests (regression)

Extend `src/agents/pi-embedded-runner/run/failover-policy.test.ts`:

- assistant timeout, no tool in flight → rotate_profile/fallback_model (keep green).
- assistant timeout DURING read-only tool (`timedOutDuringToolExecution: true`,
  `timedOutDuringReadOnlyToolExecution: true`) → rotates / falls back (NEW fix).
- assistant timeout DURING side-effecting tool
  (`timedOutDuringToolExecution: true`, `timedOutDuringReadOnlyToolExecution: false`)
  → continue_normal/surface_error (still blocked — regression guard).
- assistant timeout during compaction → unchanged.
  Plus unit coverage for `isReadOnlyToolName` / `allActiveToolExecutionsReadOnly` if a test
  harness for the tools module is reachable; otherwise rely on the policy-level tests.

## Validation

- `npm run build` (typecheck) green.
- Targeted vitest run of failover-policy + assistant-failover tests green.

---

# PLAN (continued) — Durable fallbacks for ALL recoverable failures (gaps #1 + #2)

Builds on the read-only-tool-timeout fix above. Goal: make the fallback ladder
durable for every RECOVERABLE failure across every account VM (all VMs build
from this fork), and ensure the user-facing dead-end is last-resort + informative.

## GAP #1 — All RECOVERABLE failures walk the fallback ladder

### Single source of truth classifier

`isRecoverableFailoverReason(reason: FailoverReason | null): boolean`
(exported from `failover-policy.ts`, unit-tested).

- RECOVERABLE → rotate down the ladder when a fallback is configured:
  `timeout`, `overloaded`, `rate_limit`, `empty_response`, `no_error_details`,
  `unclassified`, `unknown`, `auth`, and `null`.
  - `null` is the bucket for network drops / stream-`terminated` / socket-reset /
    ECONNRESET that the classifier can't label. Verified against
    `classifyFailoverReasonFromHttpStatus` (errors.ts): 500/502/504/503/499 →
    `timeout`, 529 → `overloaded`, transient no-body shapes → `null`, generic
    network patterns → `no_error_details`/`unclassified`. All land in the
    recoverable set, so a clean connection error degrades down the ladder.
  - `auth` stays recoverable to preserve the existing profile-rotation handling
    (a different account/key may succeed); ladder applies after rotation.
- NON-RECOVERABLE → must NOT silently rotate to a different model:
  `auth_permanent`, `billing`, `model_not_found`, `format`, `session_expired`.
  - Exhaustiveness `never` guard fails CLOSED: a future FailoverReason is treated
    non-recoverable until explicitly reviewed (can't silently burn the ladder).

### `shouldRotateAssistant` change

Split into two clear predicates:

- `erroredRotation = !aborted && (failoverFailure || reason !== null) &&
 isRecoverableFailoverReason(reason)` — recoverable errored turns rotate; the
  `(failoverFailure || reason !== null)` guard keeps a clean turn (null reason,
  no failure) on `continue_normal`.
- `timeoutRotation` — unchanged read-only-tool relaxation (side-effecting tool
  timeouts and compaction timeouts stay blocked).

### `resolveRunFailoverDecision` (assistant stage) change

Previously a non-rotating assistant turn always fell to `continue_normal`. That
would have SWALLOWED non-recoverable errored failures (billing/auth_permanent/
model_not_found/format/session_expired). Added a branch: a non-rotating turn that
still carried an errored failure signal (`!timedOut && (failoverFailure ||
reason !== null)`) and is non-recoverable now returns `surface_error` (which on
the `handleAssistantFailover` non-timeout branch throws a FailoverError carrying
the reason — billing/rate_limit keep their `suspend` handling). Genuinely clean
turns still `continue_normal`.

Net effect on the decision routing:

- recoverable + fallbackConfigured + !aborted → `rotate_profile` (then
  `fallback_model` after rotation exhausted). NEVER `surface_error`.
- non-recoverable errored → `surface_error` (+ dedicated suspend for
  billing/rate_limit). NEVER a blind different-model rotation.
- externalAbort → `surface_error` regardless of reason (gated before the
  classifier runs).

### Documented decision — side-effecting tool timeout + fallback

Kept CONSERVATIVE/blocked. A timeout during an in-flight side-effecting tool
(`timedOutDuringToolExecution && !timedOutDuringReadOnlyToolExecution`) still
resolves to `continue_normal` and is NOT failed over to a different model in the
same turn. Rationale: `fallback_model` throws a FailoverError that the
model-fallback loop catches and RE-RUNS the turn on a fresh model from the
current transcript — there is no mechanism here that guarantees the in-flight
mutation (exec/edit/write/message-send) won't be re-issued, so allowing
fall-over risks double-executing a side effect. Until a "do not replay the
in-flight mutation" guarantee exists at the tool layer, side-effecting timeouts
stay blocked from same-turn auto-retry. Read-only tool timeouts remain allowed
to fall over (idempotent; safe to replay on a peer model).

## GAP #2 — Dead-end is last-resort + informative

### Ladder exhaustion location (verified, no code change needed)

The configured fallback ladder (`agents.defaults.model.fallbacks`) is consumed
in `src/agents/model-fallback.ts` `runModelWithFallback`'s
`for (let i = 0; i < candidates.length; i += 1)` loop. The embedded run throws a
`FailoverError` for a recoverable failure; the loop catches it, normalizes it,
records the attempt, and `continue`s to the NEXT candidate. The terminal
`FallbackSummaryError` (or rethrow of the single `lastError`) is thrown only
AFTER the loop exhausts every candidate. Even unrecognized errors continue the
loop while candidates remain (only abort/context-overflow short-circuit). So the
ladder is fully walked before the terminal surface — confirmed by the existing
`model-fallback.test.ts` (53 tests) + the cross-provider / codex-server-error /
empty-error-retry integration suites (all green). Gap #2's code portion is the
assertion (covered) + copy.

### Terminal user-facing copy (improved, fork-owned, white-label)

- run.ts terminal timeout payload (~2400): now states the service is
  temporarily unavailable AND that uploaded files/work are saved and the request
  can be retried, with the operator config hint kept in a parenthetical.
- run.ts rate-limit escalation FailoverError (~901): "temporarily at capacity
  (rate-limited)… your uploaded files and request have been saved — please try
  again in a moment."
- assistant-failover.ts overloaded FailoverError (~131): "temporarily
  overloaded… files/request saved — try again."
  All copy is white-label (no vendor/model/provider names).

### Web-adapter boundary (documented, intentionally out of scope)

The literal string "I'm having trouble connecting right now" is NOT in this
repo — it is the Prest0n web-adapter's own generic fallback on Fernando's VM
(prest0n-web-adapter.service). We do NOT chase it here. This change makes the
gateway return a clearer terminal error PAYLOAD (the improved copy above) so the
web-adapter has a better message to surface than its bare generic fallback. The
adapter-side copy is a separate, VM-local change outside this fork.

## Tests

`failover-policy.test.ts` extended (now 60 cases):

- `isRecoverableFailoverReason`: parametrized over the full recoverable and
  non-recoverable sets.
- recoverable errored reasons (timeout/overloaded/rate_limit/empty_response/
  no_error_details/unclassified/unknown) → `rotate_profile`, then
  `fallback_model` after rotation — NEVER surface_error/continue_normal.
- null-reason connection-drop with a failover signal → rotates.
- non-recoverable (auth_permanent/billing/model_not_found/session_expired/
  format) → `surface_error`, not rotate/fallback, before AND after rotation.
- externalAbort over many reasons → `surface_error`.
- clean turn (no signal, null reason) → `continue_normal`.
- side-effecting tool timeout → `continue_normal` (blocked); read-only tool
  timeout → `fallback_model` (allowed). Both explicit.
- ladder-exhaustion: asserted at the model-fallback unit/integration layer
  (existing suites), not re-implemented here; noted above.

## Validation (gaps #1+#2)

- `npx vitest run failover-policy.test.ts` → 60 passed.
- assistant-failover.test.ts (11), failover-observation.test.ts (4),
  provider-error-patterns (38), model-fallback.test.ts (53), attempt.stop-reason
  -recovery (2), and the run.\* integration suites
  (timeout-triggered-compaction 16, empty-error-retry 6,
  codex-server-error-fallback 1, cross-provider-fallback 2, incomplete-turn 91)
  → all green, no regressions.
- Heap-bumped `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`:
  4 errors on the branch, IDENTICAL 4 errors on `main` (slack prepare.ts,
  openai-transport-stream.ts, attempt.test.ts, cron/service.test-harness.ts).
  ZERO new errors introduced. None of the 4 are in any file this change touched.
