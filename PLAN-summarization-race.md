# PLAN — Summarization / Compaction Timing-Delivery Race

**Status:** Investigation + design only. No code changes, no commits. Review gate before any implementation.
**Repo:** `/home/miles/projects/openclaw-fork` · branch `main` · HEAD `bfee32d04a`
**Author:** subagent `summarization-race-plan` · for review by **Miles**
**Sibling doc:** `PLAN-context-rot.md` (intra-turn tool-result digestion — _separate_ problem; read for context only).

---

## 0. The question, restated

Miles' words: _"Summarization already happens by a pretty reliable model. I just notice it loses that context sometimes — like it doesn't summarize or compact the thread in time to be delivered to the agent at times."_

So: **quality is fine; timing/ordering is the bug.** The hypothesis to confirm or refute: a model call sometimes assembles its prompt **before** the compacted/summarized view is ready, so the agent receives stale or un-compacted context.

**Verdict up front:** The hypothesis is **partly refuted and partly confirmed**, and which one applies depends on the runtime path:

- **Default account-VM path (no context engine, or context engine that does NOT own compaction):** the summarizer (`compactEmbeddedPiSession`) is **fully `await`ed before** the next prompt is assembled. There is **no await-race** here. The "loses context sometimes" symptom on this path is caused by a **different, real ordering bug: the compaction _trigger decision_ reads stale/under-counted token accounting**, so the high-quality summary is **never produced for that turn** — and a cheaper, lossy fallback (drop-oldest-turns) fires in its place. The summary is not late; it is _skipped_, then context is silently dropped.
- **Context-engine path with `turnMaintenanceMode === "background"`:** there **is** a genuine fire-and-forget race + **lane starvation**. The compacted/rewritten transcript is produced on a _separate_ lane _after_ the turn, and the next turn can assemble before it finishes — and under steady traffic the maintenance worker can be starved indefinitely.

Both are "timing/delivery" problems. The fix must close both, fail-closed, lossless.

---

## 1. The two summarization/compaction paths (with code evidence)

### Path A — Preflight compaction (the user-facing default)

**Trigger + await site:** `src/auto-reply/reply/agent-runner.ts:1192`

```
activeSessionEntry = await traceAgentPhase("reply.preflight_compaction", () =>
  runPreflightCompactionIfNeeded({ ... }));   // ← AWAITED, before the turn runs
```

- `runPreflightCompactionIfNeeded` — `src/auto-reply/reply/agent-runner-memory.ts:460`.
- Decision logic: computes `shouldCompact = shouldCompactByTokens || shouldCompactByTranscriptBytes || shouldCompactByContextBudget` (`agent-runner-memory.ts:498–500`). If false → returns early, **no compaction** (`:501`).
- On true → `await memoryDeps.compactEmbeddedPiSession({...})` (`:644`), then `incrementCompactionCount` (`:684`) and `appendPostCompactionRefreshPrompt` (`:693`), then re-points `followupRun.run.sessionId/sessionFile` to the rotated session (`:695–713`).

**(a) WHAT model/path produces the summary:** `compactEmbeddedPiSession` (queued, `src/agents/pi-embedded-runner/compact.queued.ts:48`) → `compactEmbeddedPiSessionDirect` → `compactEmbeddedPiSessionDirectOnce` (`src/agents/pi-embedded-runner/compact.ts:459`). The summary is produced by `activeSession.compact(params.customInstructions)` under a safety timeout (`compact.ts` ~`compactWithSafetyTimeout`). Model = `resolveEmbeddedCompactionTarget` (config `agents.defaults.compaction.model`, else default), with model fallback ladder. **This is the "pretty reliable model" Miles refers to.**

**(b) Synchronous or fire-and-forget:** **Synchronous** w.r.t. the next prompt. `compactEmbeddedPiSession` is serialized on the **session lane + global lane** (`compact.queued.ts` `enqueueCommandInLane(sessionLane, …)`), and the call in `runPreflightCompactionIfNeeded` is `await`ed before `createFollowupRunner` / the actual turn (`agent-runner.ts:1232`).

**(c) WHERE the summary is stored:** Written back to the **authoritative session file** by the compaction session (`session.agent.state.messages` rewrite + `SessionManager`/transcript rotation inside `compact.ts`), and the post-compaction token total is persisted into the **session store entry** via `incrementCompactionCount` → `session-updates.ts:289–298` (`updates.totalTokens = tokensAfterCompaction; updates.totalTokensFresh = true`).

**(d) WHEN it is read back:** The turn that runs immediately after opens the (possibly rotated) session file via `SessionManager.open(params.sessionFile)` inside `attempt.ts`. Because preflight is awaited and the `sessionId/sessionFile` pointer is updated in-place (`agent-runner-memory.ts:700–704`), the read-back **is consistent** on this path.

**(e) The race window on Path A — it is NOT an await-race; it is a trigger-decision data race.** The `shouldCompactByTokens` decision (`shouldRunPreflightCompaction`, `agent-runner-memory.ts:494`) is driven by the **persisted token accounting** on the session store entry:

- `freshPersistedTokens = resolveFreshSessionTotalTokens(entry)` (`:502`) returns `undefined` when `entry.totalTokensFresh === false` (`src/config/sessions/types.ts:560`).
- That token total is written by the **previous** turn's `persistRunSessionUsage` → `persistSessionUsageUpdate` (`src/auto-reply/reply/session-usage.ts:123`), which sets `patch.totalTokens` / `patch.totalTokensFresh = typeof totalTokens === "number"` (`session-usage.ts:211–212`) only when a fresh `lastCallUsage` context snapshot exists (`hasFreshContextSnapshot`, `:159`).

  The race: if the prior turn ended without a clean `lastCallUsage` snapshot (abort, tool-loop, fallback, provider that didn't return usage), `totalTokensFresh` is `false` / total is `undefined`. The preflight path then falls back to estimating from the transcript (`estimatePromptTokensFromSessionTranscript`, `:572`). If that estimate **under-counts** (e.g. images, un-normalized tool results, or simply not-yet-flushed last output), `shouldCompact` is **false** and **no summary is produced this turn**.

- Result: the un-compacted thread flows into prompt assembly. `applyContextBudgetGuard` (`attempt.ts:3107`; pipeline in `src/agents/pi-embedded-runner/run/context-budget.ts:515`) then enforces the ceiling by **dropping oldest whole turns** (the drop-loop down to `resolveLastUserMessageIndex`). And/or the preemptive precheck (`attempt.ts:3257`, `shouldPreemptivelyCompactBeforePrompt`) routes to `truncate_tool_results_only` instead of `compact`. **Either way the agent "loses context" — not because the summary was late, but because the trigger mis-fired and a lossy fallback ran instead of the reliable summarizer.**

> So for the default path, the precise "race" is: **previous-turn usage persistence (write) vs. this-turn compaction-trigger read.** When the write is stale/missing, the read under-fires the trigger, and deterministic drop-oldest silently removes context the summary would have preserved.

### Path B — Context-engine deferred turn maintenance (genuine fire-and-forget)

**Site:** `src/agents/pi-embedded-runner/context-engine-maintenance.ts:645–667`.

```
const shouldDefer = params.reason === "turn"
  && executionMode !== "background"
  && params.contextEngine.info.turnMaintenanceMode === "background";
if (shouldDefer) { scheduleDeferredTurnMaintenance({...}); return undefined; }   // ← fire-and-forget
```

- `scheduleDeferredTurnMaintenance` (`:528`) enqueues `runDeferredTurnMaintenanceWorker` on a **separate** lane (`resolveDeferredTurnMaintenanceLane`) and does `void trackedPromise` (`:622`). It is **not** awaited by the turn.
- The worker (`runDeferredTurnMaintenanceWorker`, `:368`) **busy-waits for the session lane to be idle** before running: `while (getQueueSize(sessionLane) > 0) { … await sleepWithAbort(...) }` (`:403–419`). It rewrites transcript entries (the compacted view) only after that.

**The race + a starvation bug, both real:**

1. **Read-before-ready:** the rewritten (compacted) transcript is produced _after_ the turn returns. The _next_ turn's `assemble`/`SessionManager.open` can run before the deferred worker has rewritten the entries → it reads the **pre-maintenance, un-compacted** transcript. This exactly matches "doesn't compact in time to be delivered."
2. **Lane starvation:** because the worker waits for `getQueueSize(sessionLane) === 0`, a session under steady back-to-back turns **never goes idle**, so deferred maintenance can be postponed indefinitely — the compacted view is _perpetually_ behind.

> Caveat (open question Q1 from `PLAN-context-rot.md`): it is unconfirmed whether `prest0-vm` runs a context engine with `turnMaintenanceMode === "background"`. If it does not, Path B is dormant and Path A is the whole story. **This must be confirmed before choosing scope** (see §7-Q1).

---

## 2. Confirm/refute summary

| Claim                                                                        | Finding                                                   | Evidence                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| "Summary isn't awaited before the next prompt (await-race)" on default path  | **Refuted**                                               | `agent-runner.ts:1192` awaits preflight; `compact.queued.ts` serializes on session lane; pointer re-point at `agent-runner-memory.ts:700`.                                                                                                             |
| "Context loss because the summarizer is skipped, then a lossy fallback runs" | **Confirmed**                                             | trigger reads stale `totalTokensFresh`/`totalTokens` (`agent-runner-memory.ts:502`, `sessions/types.ts:560`); written by prior turn (`session-usage.ts:211`); fallback = drop-oldest in `context-budget.ts:515` / truncate route in `attempt.ts:3257`. |
| "Fire-and-forget summarization read before ready"                            | **Confirmed, but only on context-engine background path** | `context-engine-maintenance.ts:651` defers; `:622` `void trackedPromise`; next-turn assemble reads session file independently.                                                                                                                         |
| "Maintenance can be starved under load"                                      | **Confirmed (context-engine path)**                       | `runDeferredTurnMaintenanceWorker` idle-wait loop `:403–419`.                                                                                                                                                                                          |

---

## 3. Design — smallest fix that closes both races

> Guiding constraints (Miles): **do not overengineer; prefer the smallest design; reuse existing machinery.** Two levers below; lever C is the recommended primary; lever D only if Path B is live.

### Design option A (baseline, rejected as _primary_) — "just await harder / gate on the summarizer"

Make every turn block until a fresh compaction has run when over budget. I.e. in `attempt.ts` when the preemptive precheck would route to `truncate`/`drop`, instead **synchronously invoke the reliable compaction model** and wait.

- **Pro:** trivially correct ordering; no stale view ever delivered.
- **Con:** adds compaction-model latency (seconds) to the _user-visible_ turn whenever the trigger fires; on a slow/erroring summarizer the turn stalls or hits the compaction safety timeout. This is exactly the "gate on the summarizer" cost Miles warned against. **Rejected as the primary mechanism**, kept only as the _fallback-of-last-resort_ inside option C.

### Design option B (recommended core) — Fix the trigger-decision data race (Path A)

The Path A failure is that compaction is **skipped** due to stale token accounting, then a lossy fallback runs. Close it deterministically without adding latency:

1. **Make the trigger fail-safe, not fail-skip.** In `runPreflightCompactionIfNeeded` (`agent-runner-memory.ts`), when token accounting is **stale or unknown** (`entry.totalTokensFresh === false || !hasPersistedTotalTokens`) AND the transcript-byte / context-budget signals are inconclusive, **bias toward compaction** (or toward computing a real transcript token count synchronously) rather than skipping. Today `shouldUseTranscriptFallback` already forces a transcript read in that case (`:551`) — the gap is that the _estimate can under-count_ and then `shouldCompact` is false. The change: when fresh accounting is unavailable, treat the **context-budget ceiling** (`context-budget.ts` assembled-token estimate over the actual messages) as the authoritative trigger, not the persisted scalar. The assembled-token estimate is the same number the assembler will enforce, so it cannot disagree with reality the way a stale persisted scalar can.

2. **Never let the lossy fallback (drop-oldest) run when compaction was _due_ but skipped.** In `attempt.ts`, when `shouldPreemptivelyCompactBeforePrompt` returns `compact_only` / `compact_then_truncate` (`:3325`), that already forces compaction via `PREEMPTIVE_OVERFLOW_ERROR_TEXT` + retry. The gap is the `truncate_tool_results_only` route (`:3279`) and the silent drop-oldest inside `applyContextBudgetGuard`. **Constrain drop-oldest to only run _after_ a compaction attempt for that assembled view, never instead of one** when the over-budget amount exceeds what tool-result truncation can recover. Concretely: gate the drop-oldest loop in `context-budget.ts` behind "a compaction has already been applied to this transcript (compactionCount advanced) OR the deficit is purely oversized-tool-results." This converts "silently dropped a turn" into "summarized first, then trimmed only tool-noise."

3. **Tighten the usage write so the trigger read is rarely stale.** The root cause of staleness is `persistSessionUsageUpdate` setting `totalTokensFresh = false` whenever a clean `lastCallUsage` snapshot is missing (`session-usage.ts:211`). Where we _do_ have a reliable assembled-token estimate for the turn we just ran (we compute `estimateAssembledTokens` in `attempt.ts` for diagnostics already — `context.assembled` event at `:3189`), **persist that as the fresh total** instead of leaving it unknown. This shrinks the stale-read window without a new subsystem.

- **Pro:** No added user-visible latency in the common case; reuses `applyContextBudgetGuard` / `estimateAssembledTokens` / the existing preflight trigger. Turns the lossy fallback into a last-resort, not a silent default. Directly removes the "loses context sometimes" surface.
- **Con:** when the trigger now fires where it previously (wrongly) skipped, those turns pay compaction latency — but only the turns that genuinely needed it, and via the already-awaited preflight (no new race).

### Design option C (recommended for Path B, if live) — Make the background-maintenance view _gate the read_, with a deterministic last-known-good fallback

This is the "always-ready / never-wait" idea, scoped minimally:

1. **Stop starving maintenance.** Change `runDeferredTurnMaintenanceWorker`'s "wait for session lane fully idle" loop (`context-engine-maintenance.ts:403`) to a **bounded** wait: run maintenance after the _current_ turn drains, not after the lane is globally empty. Reuse the existing session-write-lock (`acquireSessionWriteLock`) for the rewrite window instead of polling `getQueueSize`. This guarantees forward progress under steady load.

2. **Gate next-turn assembly on "maintenance not in-flight for this session," with a safe fallback.** Before `assemble`/`SessionManager.open` in a context-engine turn, check `activeDeferredTurnMaintenanceRuns.get(sessionKey)` (the map already exists, `:533`). If a maintenance pass is in-flight, **either** await it briefly (bounded, e.g. ≤ the session-write-lock acquire timeout) **or** assemble from the **last-known-good compacted snapshot** — never from the raw-but-truncated transcript and never from a half-rewritten file. The "last-known-good" snapshot is the compaction checkpoint already captured by `captureCompactionCheckpointSnapshotAsync` (`compact.ts` / `session-compaction-checkpoints.ts`) — reuse it as the deterministic fallback.

3. **Incremental write-through (the "always-ready" innovation), bounded:** rather than rewriting the whole transcript post-turn, have `afterTurn`/`ingestBatch` (`context-engine-lifecycle.ts:117–151`) maintain the compacted view **incrementally as each turn's messages are ingested** (it already ingests new messages per turn). The deferred `maintain` pass then only reconciles, never builds-from-scratch — so the compacted view is essentially current at all times and the gate in (2) almost never has to wait or fall back. This reuses the existing `ingestBatch` seam; it is not a new subsystem.

- **Pro:** closes the read-before-ready race and the starvation bug; the incremental view means the gate rarely blocks; fallback is the existing deterministic checkpoint (lossless, fact-preserving).
- **Con:** only relevant if a background context engine is active; the gate adds a small bounded wait on the rare turn that races an in-flight rewrite.

### Recommendation

- **Always do option B** (Path A trigger fix) — it is the most likely cause on the account VMs and adds no latency in the common case.
- **Do option C only if §7-Q1 confirms** a background-maintenance context engine is live on the target VM. Otherwise defer C.
- **Keep option A** strictly as the inner fallback in B-step-2 (compact-before-drop), never as the default gate.

---

## 4. Fail-closed + lossless guarantees (HARD — legal-document VM)

- **Raw messages always remain on disk + re-fetchable.** Both paths rewrite the **session file** (authoritative). Compaction rotates rather than deletes (`rotateTranscriptAfterCompaction`); the checkpoint snapshot (`captureCompactionCheckpointSnapshotAsync` / `persistSessionCompactionCheckpoint`) preserves the pre-compaction state. The trajectory JSONL is byte-capped/lossy and is **not** the source of record (same caveat as `PLAN-context-rot.md` §5).
- **Never deliver a silently fact-dropped summary.** Option B-step-2 forbids the drop-oldest fallback from running _instead of_ compaction; drop-oldest may only trim oversized tool-result _noise_ after a summary exists. The summary itself is produced by the existing reliable compaction model (unchanged).
- **Protected/identity/HARD lines untouched.** Neither lever touches the system prompt or `extractProtectedLines` regions; `assertProtectedLinesPresent` (`src/agents/prompt-invariants.ts`) should be asserted on the final assembled prompt after any compaction/rewrite, failing closed to the prior view (reuse the existing fail-open→prior-view posture, but make it fail-_closed_ to last-known-good for the over-budget case).
- **Fallback is deterministic last-known-good, never stale-or-lossy.** Option C's fallback is the captured compaction checkpoint, not a truncated raw view.

---

## 5. Risks + mitigations

| #   | Risk                                                                    | Likelihood            | Impact           | Mitigation                                                                                                                                     |
| --- | ----------------------------------------------------------------------- | --------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Option-A-style gate adds user-visible latency on every over-budget turn | —                     | Med              | Rejected as primary; B fires the awaited preflight only when genuinely due; A used only as inner last-resort.                                  |
| R2  | Stale snapshot delivered (Path B)                                       | Med (if CE active)    | High             | Gate next-turn assemble on in-flight maintenance; fall back to deterministic compaction checkpoint, never raw-truncated.                       |
| R3  | Incremental recompaction cost per message                               | Low                   | Low              | Reuse existing `ingestBatch` per-turn seam; `maintain` becomes reconcile-only, not rebuild.                                                    |
| R4  | Summarizer errors / times out when trigger now fires more often         | Low                   | Med              | Existing model-fallback ladder + `compactWithSafetyTimeout`; on failure keep prior view, surface, do **not** silently drop turns (R6).         |
| R5  | Trigger over-fires (compacts too eagerly after B) → cost                | Med                   | Low              | Drive trigger from the same `estimateAssembledTokens` ceiling the assembler enforces, so it fires only when the assembler would actually trim. |
| R6  | Drop-oldest silently removes a legal fact (today's behavior)            | **Med (current bug)** | **Catastrophic** | B-step-2: forbid drop-oldest-instead-of-compaction; only trim tool-noise after a summary exists; assert protected lines post-assembly.         |
| R7  | Lane starvation keeps compacted view perpetually behind (Path B)        | Med (if CE active)    | High             | Replace idle-wait loop with bounded session-write-lock window (C-step-1).                                                                      |
| R8  | Persisting assembled-token estimate as fresh total is wrong             | Low                   | Low              | Use it only as a floor when `lastCallUsage` is missing; never override a real fresh snapshot.                                                  |

---

## 6. Regression / test design (proves the race is closed)

**Path A (trigger data race) — new test** `src/auto-reply/reply/preflight-compaction.stale-usage.test.ts`:

- **A1:** Seed a session entry with `totalTokensFresh = false` (or `totalTokens = undefined`) but a transcript whose true assembled tokens are clearly over the ceiling. Assert `runPreflightCompactionIfNeeded` **triggers compaction** (compactionCount advances) rather than skipping. (Today this can skip.)
- **A2:** Seed an over-budget transcript; assert that on assembly the **drop-oldest fallback does not run before** a compaction attempt — i.e. `applyContextBudgetGuard.droppedTurns === 0` until `compactionCount > 0`, OR the only thing trimmed is oversized tool-results. Assert a known fact (UUID / `DWC-1` date / `/abs/path`) seeded in the oldest turn survives into the assembled prompt.
- **A3:** Simulate a prior turn that ended without `lastCallUsage`; assert the new "assembled-token floor" is persisted as `totalTokensFresh = true` so the next trigger read is not stale.

**Path B (fire-and-forget read-before-ready) — new test** `src/agents/pi-embedded-runner/context-engine-maintenance.deferred-race.test.ts` (only if CE path live):

- **B1 (the core race test Miles asked for):** Fire a model-call/assemble **concurrently** with an in-flight deferred maintenance pass for the same `sessionKey`. Assert the assembled prompt reflects the **up-to-date compacted view** (or the deterministic last-known-good checkpoint) — **never** the half-rewritten or pre-maintenance transcript.
- **B2 (starvation):** Enqueue back-to-back turns so the session lane never idles; assert deferred maintenance still completes within a bounded number of turns (forward-progress guarantee), not "never."
- **B3 (fallback safety):** Force the maintenance worker to error mid-rewrite; assert the next assemble uses the last-known-good checkpoint and that no protected/HARD line is missing (`assertProtectedLinesPresent`).

**Fail-closed cross-cutting — extend existing** `context-budget` tests:

- **C1:** A deliberately fact-dropping path must trigger the prior-view / last-known-good fallback and `assertProtectedLinesPresent(assembled).ok === true`.

---

## 7. Open questions for Miles

1. **Which path is live on the target VM?** Does `prest0-vm` (and the account VMs) run a context engine with `turnMaintenanceMode === "background"`, or the plain preflight-compaction path? This decides whether we ship **B only** (smallest) or **B + C**. (Same unknown as `PLAN-context-rot.md` Q1.)
2. **Is the "loses context" symptom you see on a _customer_ account VM or on `prest0-vm`?** That tells us whether to prioritize Path A (default) or Path B (CE) first.
3. **Acceptable to bias the trigger toward compaction when token accounting is stale?** This trades a few extra (awaited) compactions for never silently dropping context. Given the legal-document fail-closed posture, I recommend yes — confirm.
4. **OK to forbid drop-oldest-turns from running _instead of_ compaction** (R6)? This is the single highest-value safety change but slightly increases compaction frequency.
5. **For Path B, prefer the bounded-wait gate or the incremental write-through view** as the first increment? Write-through is the more "always-ready" innovation but touches the `ingestBatch` seam; the gate is smaller.
6. **Persisting the assembled-token estimate as a fresh fallback total** (B-step-3) — acceptable, or do you want the trigger to always recompute from the transcript when the real snapshot is missing (slower but no new persisted field)?

---

### Key decisions summary

- **Default path has no await-race** — the summarizer is awaited. The real Path-A bug is a **trigger data race** (stale usage → compaction skipped → lossy drop-oldest runs instead). Fix the trigger + forbid drop-before-compact.
- **Context-engine background path has a genuine fire-and-forget race + lane starvation.** Fix only if that path is live: bounded-progress maintenance + assemble-gate with a deterministic last-known-good checkpoint fallback, ideally backed by an incremental write-through view.
- **Never gate the user turn on the summarizer as the default** (latency); gate only as last resort.
- **Fail-closed + lossless:** raw stays on disk; fallback is the existing compaction checkpoint; protected lines asserted post-assembly; drop-oldest demoted to tool-noise-only after a summary exists.
- **Smallest viable:** ship **option B** first; measure; add **option C** only if a background context engine is confirmed active.
