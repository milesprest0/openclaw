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
