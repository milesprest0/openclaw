# PLAN — Path A RCA: pre-turn compaction reads stale token accounting → silent fact loss

**Verdict: CONFIRMED at the code level (mechanism is real and reachable), PARTIALLY CONFIRMED on live data.**
The stale-accounting → lossy-fallback mechanism exists exactly as hypothesized and the legacy engine
(so Path B is dormant) is active. I could **not** find a concrete already-happened fact-drop instance in the
available trajectory files (they are short; the destructive trim mutates in-memory `state.messages` and is **not**
written back into the `*.trajectory.jsonl`, so trajectories cannot by construction show the drop — see §3).
So the bug is proven reachable from code; the on-disk silence is itself consistent with (but not independent proof of) the hypothesis.

Investigation only. No production code changed, no flags flipped, nothing restarted.

---

## 1. Legacy engine is active → Path B (background race) is DORMANT — CONFIRMED

- **Default slot = `legacy`:** `src/plugins/slots.ts:19` → `contextEngine: "legacy"` in the slot-default map;
  resolved via `defaultSlotIdForKey()` (`slots.ts:55`). `effective-plugin-ids.ts:129-130` treats an unset/default
  slot as the built-in; `gateway-startup-plugin-ids.ts:121-122`: `"legacy" is the built-in default engine — no plugin startup needed.`
- **No config override on this VM:** `~/.openclaw/openclaw.json` has **no** `contextEngine` key and an **empty**
  `plugins.slots` (`{}`) — verified live. So the default `"legacy"` wins.
- **Legacy is a no-op for the background path:** `src/context-engine/legacy.ts`
  - `ingest()` → `return { ingested: false }` (no-op),
  - `assemble()` → pass-through, `estimatedTokens: 0` (`// Caller handles estimation`),
  - `afterTurn()` → empty body `// No-op: legacy flow persists context directly in SessionManager.`,
  - `compact()` → delegates to `delegateCompactionToRuntime`.
  - It **never** sets `turnMaintenanceMode="background"` — that string does not appear in `legacy.ts` at all.
    Registered as core in `legacy.registration.ts`.
    → **Path B (background fire-and-forget maintenance race) cannot fire under legacy. Path A is the live risk.**

---

## 2. The pre-turn trigger path — EXACT lines

Entry: `runPreflightCompactionIfNeeded()` — `src/auto-reply/reply/agent-runner-memory.ts:460`
(called from `agent-runner.ts` preflight, phase `reply.preflight_compaction`).

**(a) Where the token count is read (the stale source):**

- `agent-runner-memory.ts:502` `const persistedTotalTokens = entry.totalTokens;`
- `:503-506` `hasPersistedTotalTokens` = persisted total is a finite number > 0.
- `freshPersistedTokens = resolveFreshSessionTotalTokens(entry)` (`:501`) — only "fresh" when `totalTokensFresh===true`.
- These come from the session store, written by `persistSessionUsageUpdate()` in
  `src/auto-reply/reply/session-usage.ts:178-181`:
  `patch.totalTokens = totalTokens; patch.totalTokensFresh = typeof totalTokens === "number";`
  and `totalTokens` is `undefined` unless `hasFreshContextSnapshot` (`session-usage.ts:155-157`,
  needs `lastCallUsage` || `promptTokens>0` || `usageIsContextSnapshot`). **If the last turn errored/aborted, was a
  tool-only loop, or no last-call usage was captured, the snapshot is stale/absent → `totalTokensFresh=false`.**

**(b) Where staleness is (or isn't) checked:**

- `agent-runner-memory.ts:551`
  `const shouldUseTranscriptFallback = entry.totalTokensFresh === false || !hasPersistedTotalTokens;`
  This is the **only** staleness gate. It decides whether to bother reading the transcript at all.

**(c) The decision to compact vs skip:**

- Early skip: `:552-557` — if `!shouldUseTranscriptFallback && !shouldCompactByTranscriptBytes &&
!shouldCompactByContextBudget` → **`return entry` (no compaction)**. So when accounting is _fresh-but-undercounted_
  (e.g. a stale-but-`fresh===true` value persisted from a much smaller earlier turn — see §4), and bytes/budget
  triggers are off/under, the function returns WITHOUT compacting.
- Token decision: `:611-617` `shouldRunPreflightCompaction({entry, tokenCount: tokenCountForCompaction, ...})`.
  Definition: `src/auto-reply/reply/memory-flush.ts:96-110` →
  `resolveMemoryFlushGateState(params)` then `state.totalTokens >= state.threshold`.
  The gate's `totalTokens` is driven by `tokenCountForCompaction`, which is
  `Math.max(usageProjectedTokenCount, stalePersistedPromptTokens)` (`:584-593`). **Both inputs derive from the same
  stale persisted/transcript estimate. If the estimate under-counts, the gate under-fires → compaction skipped.**
- `:618-622` `shouldCompact = shouldCompactByTokens || ...Bytes || ...Budget`; `if(!shouldCompact) return entry;`

**(d) Where the lossy drop-oldest / truncate fallback can run:**

- `src/agents/pi-embedded-runner/run/context-budget.ts:515` `applyContextBudgetGuard()`.
  - `:551` first estimate `estimateAssembledTokens(...)` (multiplies by `SAFETY_MARGIN`, `:443`).
  - `:586-608` the destructive loop:
    `while (estimatedTokens > budget.budgetBeforeReserve && currentMessages.length > 0) { dropCount =
resolveDropCountForOldestTurn(...); currentMessages = currentMessages.slice(...); droppedTurns += 1; ... }`
    → **whole oldest turns are sliced off the front and discarded.** `resolveDropCountForOldestTurn` (`:490`) drops a
    full user→next-user span.
  - Also lossy-but-bounded: `ageOutOldestInlineImages` (`:446`, replaces old images with a placeholder) and
    `digestOldToolResultsWithStats` (`:206`, truncates old tool results via `truncateToolResultText`).
- This guard is **enabled by default**: `resolveContextBudget` `context-budget.ts:372` `const enabled = merged.enabled ?? true;`
  with `maxAssembledTokens = contextWindowTokens * DEFAULT_MAX_ASSEMBLED_RATIO (0.6)` (`:373-376`, const `:17`).
  Live config (`agents.defaults.contextBudget`) is **absent** on this VM → defaults apply → **guard is ON**.
- Caller in the live turn path: `src/agents/pi-embedded-runner/run/attempt.ts:3107` `applyContextBudgetGuard({...})`,
  and `:3160` `activeSession.agent.state.messages = contextBudgetGuard.messages;` — the trimmed array becomes the
  prompt actually sent to the model.

**(e) Can the drop run INSTEAD OF a real summary? — YES.** This is the crux.

- The budget guard at `attempt.ts:3107/3160` runs **unconditionally at assembly time on every turn**, regardless of
  whether `runPreflightCompactionIfNeeded` decided to summarize. The two are independent code paths.
- So the failure mode is: pre-turn accounting is stale/undercounted → `runPreflightCompactionIfNeeded` **skips the
  reliable summarizer** (§2c) → the turn proceeds → the assembly-time budget guard still finds the real assembled
  size over `budgetBeforeReserve` → **drop-oldest silently deletes the oldest turns with their facts, with no summary
  ever produced.** The model simply never sees those turns. That is the "randomly forgets" symptom.

---

## 3. LIVE-DATA evidence — PARTIALLY CONFIRMED (with an important structural caveat)

- **Legacy/no-override confirmed live** (§1): `openclaw.json` has no `contextEngine`, `plugins.slots == {}`.
- **Stale-accounting machinery is exercised in production:** the active trajectories show normal turns persisting
  `usage` with `totalTokens` (e.g. session `268c19b5-…-topic-1780773902` shows per-call `usage.totalTokens` values
  like 34781, 28132, 29349). Turns that end on `NO_REPLY` / tool-only loops / errors are present — exactly the cases
  where `lastCallUsage`/`promptTokens` can be absent and `totalTokensFresh` flips to `false` (`session-usage.ts:155-181`).
- **Compaction does occur in the wild:** across all `*.trajectory.jsonl`, `compactionSummary` (56×), `auto-compaction`
  (12×) and `droppedTurns` (30×) markers appear in larger sessions (e.g. `268c19b5-…`), proving both summary and
  drop machinery are live.
- **No concrete before/after identifier-drop instance found — and here is why that is expected, not exculpatory:**
  The destructive trim at `attempt.ts:3160` mutates the **in-memory** `agent.state.messages` used to build the
  outbound prompt. The raw transcript on disk (`*.trajectory.jsonl`) is **not** rewritten from the trimmed array — raw
  stays lossless on disk (good for recovery, bad for forensics). Therefore the trajectory files **cannot by
  construction** show "identifier present before boundary, absent after": the dropped turn is still in the file; it
  just never reached the model. The user-visible amnesia happens at prompt-assembly time and leaves no on-disk diff.
  The only durable trace would be the `context.gate.applied` diagnostic event with `droppedTurns>0`
  (`attempt.ts:~3170`) — those are emitted to the diagnostic/event stream, **not** persisted to the trajectory, and
  the local `~/.openclaw/logs/` did not contain retained `droppedTurns=`/`persistedFresh=false` lines at this log level.
  → **Honest status: mechanism proven from code + confirmed reachable with live config; a captured live drop event was
  not obtainable from on-disk artifacts. To capture one, raise verbosity and grep `context.gate.applied droppedTurns`
  / `preflightCompaction` `persistedFresh=false` (see §5).**

---

## 4. Smallest fix (design only — matches the agreed direction; do NOT implement here)

**R1 — When token accounting is stale/missing, measure real assembled size and let THAT drive the trigger
(bias toward summarizing).**

- Function: `runPreflightCompactionIfNeeded` — `agent-runner-memory.ts:460`.
- Exact change locus: the early-skip guard at **`:552-557`**. Today the function only measures real size via the
  transcript fallback when `shouldUseTranscriptFallback` is true, and the token gate (§2c) trusts an estimate that can
  undercount. Change: when `entry.totalTokensFresh === false || !hasPersistedTotalTokens` (i.e. `shouldUseTranscriptFallback`),
  compute the **real assembled token size** with the same estimator the guard uses
  (`estimateAssembledTokens` / `estimateMessagesTokens` from `context-budget.ts:408` / `compaction.ts`) over the
  actual session messages, and feed that into `tokenCountForCompaction` (`:587-593`) so `shouldRunPreflightCompaction`
  (`:611`) sees the true size. Bias: when size is unknown, treat as over-threshold (prefer summarize) rather than skip.

**R6 — FORBID drop-oldest from running INSTEAD of a summary; it may only trim oversized tool-result noise, and only
AFTER a real summary ran.**

- Function: `applyContextBudgetGuard` — `context-budget.ts:515`; specifically gate the destructive
  **while-loop at `:586-608`** (the `currentMessages.slice(...); droppedTurns += 1` block).
- Exact change: keep the bounded, non-fact-destroying passes that already run before the loop —
  `ageOutOldestInlineImages` (`:539-543`) and `digestOldToolResultsWithStats` (`:545-558`, tool-result truncation) —
  but make entry into the **turn-dropping while-loop conditional** on "a real summary has already been produced for the
  current state" (e.g. require `compactionCount > 0` for the current session/segment, threaded in via params, or an
  explicit `allowLossyDrop` flag set only on the post-summary assembly). If no summary has run, the loop must **not**
  execute; instead force/await a summarizing compaction (R1 makes that trigger reliably). Net: drop-oldest becomes a
  last-resort _after_ summarization, never a silent substitute for it.

**R3 — Persist a reliable per-turn assembled-size number ("save-the-estimate").**

- Function: `persistSessionUsageUpdate` — `session-usage.ts:128` (assignment site `:178-181`).
- Exact change: when the normal fresh-snapshot inputs are absent (`hasFreshContextSnapshot === false`,
  `:155-157`), still persist a **measured** assembled size computed at assembly time (carry the
  `contextBudgetGuard.estimatedTokens` from `attempt.ts:3107` through the run-result into this persist call) and set
  `totalTokens`/`totalTokensFresh=true` from that measured value at **`:179-180`**, instead of leaving `totalTokens=undefined`
  / `totalTokensFresh=false`. That closes the loop so the _next_ turn's preflight (R1) starts from a real number.

All three reuse existing machinery (`estimateAssembledTokens`, the existing guard result, the existing persist patch);
no new subsystem. Fail-closed/lossless preserved: raw transcript stays on disk; protected/HARD lines are unaffected
(note: `assertProtectedLinesPresent`/`extractProtectedLines` in `prompt-invariants.ts` only guard **system-prompt /
project-context workspace files** at `system-prompt.ts:279,296,310` — they do **not** protect conversation turns, which
is exactly why drop-oldest of turns is silent today; R6 is the protection for turns).

---

## 5. Regression-test design (proves the bug closed)

Location: new `src/auto-reply/reply/agent-runner-memory.preflight-stale.test.ts` (+ a guard unit test in
`src/agents/pi-embedded-runner/run/context-budget.test.ts`).

Setup / seed:

1. Build a `SessionEntry` with `totalTokensFresh = false` and either `totalTokens` undefined or a stale-low value
   (e.g. 5_000), i.e. the stale-accounting condition.
2. Seed an on-disk/in-memory transcript whose **real** assembled size is over the ceiling
   (`> contextWindowTokens * 0.6` budgetBeforeReserve), and plant three canary facts in the **oldest** turn:
   a UUID (`b3290033-ddd7-4584-912b-440f3d707d63`), a DWC-1 date string (`DWC-1 served 3/16/2026`), and an absolute
   path (`/home/miles/.openclaw/workspace/CASE-XYZ.md`).

Assertions:

- **A1 (R1 — trigger fires despite stale accounting):** `runPreflightCompactionIfNeeded` does **not** take the
  early-skip at `agent-runner-memory.ts:552-557` and `shouldRunPreflightCompaction` returns true → a summarizing
  compaction is invoked (spy on `memoryDeps.compactEmbeddedPiSession`). Fails on current code (stale undercount → skip).
- **A2 (R6 — no lossy drop before a summary):** drive `applyContextBudgetGuard` on the seeded over-ceiling transcript
  with `compactionCount === 0` → assert `result.droppedTurns === 0` (turn-drop loop did not run; only image-age/tool
  digest may apply). Then with `compactionCount > 0` → assert drop-oldest is permitted. Fails on current code
  (`droppedTurns > 0` at `compactionCount === 0`).
- **A3 (fact survival end-to-end):** after preflight summarization, assemble the prompt and assert all three canary
  identifiers (UUID, DWC-1 date, abs-path) are present in the assembled prompt string (either verbatim in retained
  recent turns or captured in the summary). Fails on current code (oldest turn silently dropped, canaries absent).
- **A4 (R3 — estimate persisted):** assert that after the turn, the persisted `SessionEntry` has
  `totalTokensFresh === true` and a `totalTokens` within tolerance of the measured assembled size, even though no
  `lastCallUsage`/`promptTokens` snapshot was supplied. Fails on current code (`totalTokensFresh` stays false).
- **A5 (invariant):** `droppedTurns === 0` until `compactionCount > 0` holds across the whole flow (ties A2 to the
  end-to-end path).

---

## Key file:line index

- `src/plugins/slots.ts:19` — `contextEngine: "legacy"` default.
- `src/plugins/effective-plugin-ids.ts:129-130`; `src/plugins/gateway-startup-plugin-ids.ts:121-122` — default = built-in, no startup.
- `src/context-engine/legacy.ts:30-66` — ingest/assemble/afterTurn no-ops (no `turnMaintenanceMode="background"`).
- `src/auto-reply/reply/agent-runner-memory.ts:460` entry; `:502-506` read totals; `:551` staleness gate;
  `:552-557` early skip; `:611-617` token decision; `:618-622` final gate.
- `src/auto-reply/reply/memory-flush.ts:96-110` — `shouldRunPreflightCompaction` (gate uses possibly-undercounted total).
- `src/auto-reply/reply/session-usage.ts:155-181` — where `totalTokens`/`totalTokensFresh` are (not) set.
- `src/agents/pi-embedded-runner/run/context-budget.ts:372` default-enabled; `:515` guard; `:586-608` drop-oldest loop;
  `:490` `resolveDropCountForOldestTurn`; `:408/443` estimator + SAFETY_MARGIN; `:17` 0.6 ratio.
- `src/agents/pi-embedded-runner/run/attempt.ts:3107` guard call; `:3160` in-memory `state.messages` overwrite.
- `src/agents/prompt-invariants.ts` + `src/agents/system-prompt.ts:279,296,310` — protected lines guard **system prompt only**, not turns.
