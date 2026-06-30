# PLAN — Phase 0: Stabilize digest (cache-neutral) + segment model

**Branch:** `feat/history-freeze-compaction-20260630` (off `454e3f8a8f`)
**Source of truth:** `~/projects/openclaw-fork/PLAN-history-compaction-cacheability-20260630.md` §0.1–§Phase0
**Status:** BUILD — Phase 0 only. Later phases (1–5) are separate PRs.

## Non-negotiable acceptance gate

With ALL new flags at default, the assembled messages array must be **byte-identical to current `main`**.
`freezeMode` defaults to `"sliding"` (today's exact behavior). Add a golden snapshot test proving this.

## Scope (Phase 0 ONLY — do not implement Phases 1–5)

Make the already-ON sliding digest cache-neutral by anchoring it to an absolute persisted watermark,
and introduce the FROZEN/WARM/LIVE segment abstraction every later phase builds on. **No new caching,
no breakpoint markers, no thinking changes, no compaction-before-drop in this phase.**

## Verified touch-points (file:line confirmed against repo @454e3f8a8f)

- `src/agents/pi-embedded-runner/run/context-budget.ts`
  - `resolveDigestCutoffIndex` (:184) — TODAY anchors cutoff to `userIndexes[len - keepRawTurns]`
    (end-anchored → shifts every turn → cache-hostile). This is the core bug to fix.
  - `digestOldToolResultsWithStats` (:206), `digestToolResultText` (:138).
  - `applyContextBudgetGuard` (:515) — the orchestration entrypoint (called at `attempt.ts:3144`
    live + `compact.ts:1161` compaction path). Result persists to
    `activeSession.agent.state.messages` (`attempt.ts:3196`).
- NEW module: `src/agents/pi-embedded-runner/run/history-segments.ts`
  - export `segmentHistory(messages, { warmTurns, frozenMarkerKey }): { frozen, warm, live }` (PURE,
    no side effects, deterministic).
- `src/config/types.agent-defaults.ts` (:552 `AgentHistoryOptimizationConfig`)
  - add `freezeMode?: "off" | "sliding" | "frozen"` (default `"sliding"`).
- `src/config/zod-schema.agent-defaults.ts` — add the zod enum for `freezeMode` (default `"sliding"`).
- Labels/help if required by schema tests: `src/config/schema.labels.ts`, `src/config/schema.help.ts`.

NOTE: `provider-replay-helpers.ts` lives at `src/plugins/provider-replay-helpers.ts` (NOT under
pi-embedded-runner) — but it is NOT touched in Phase 0.

## Mechanism

- `freezeMode:"frozen"`: anchor digest cutoff to an **absolute, persisted watermark** — a custom
  session entry `openclaw.history-frozen-watermark` storing the message index / turn id up to which
  freezing has occurred. Freezing only ever ADVANCES the watermark and only digests messages strictly
  below it. A message at index < watermark is byte-frozen forever.
- A digested `toolResult` gets a `frozen:true` marker (retain role, content→stub text) so the
  non-idempotent re-scan hazard (existing bug: digested toolResult re-extracted via `getMessageText`
  and re-digested) can early-out.
- `freezeMode:"sliding"` (default) and `"off"`: behavior byte-identical to today.

## Cache-safety argument (must hold)

With an absolute watermark, bytes of every message below it are written exactly once, never
recomputed. The raw↔frozen transition index moves forward only, only when WARM exceeds threshold;
never backward, never rewrites an already-frozen message. That is the byte-stability precondition for
later breakpoint placement (Phase 2).

## Tests (vitest, no live model)

New `context-budget.frozen-watermark.test.ts`:

- (a) `"sliding"` → output identical to today (regression vs current behavior).
- (b) `"frozen"` → digesting on turn T+1 leaves every message below the turn-T watermark
  byte-identical (assert `JSON.stringify` equality of the frozen slice across two successive guard
  runs).
- (c) watermark monotonically increases (never decreases).
- (d) `segmentHistory` is pure + deterministic: same input → identical `{frozen,warm,live}`.
  Plus a golden snapshot of the assembled messages array with all flags default == `main` output.

## Build / verify

- `npm run build` must exit 0. KNOWN non-regression: the pre-existing `build:plugin-sdk:dts` failure
  on `manager.core.ts`/`socket-adapter.ts` — CONFIRM it reproduces on `main` (it is not ours).
- Run the new + adjacent vitest suites (`context-budget*`, segment tests). All green.
- Do NOT flip any live flag. Do NOT deploy. Commit + push branch only; PR opened by orchestrator.

## Out of scope (explicitly DO NOT do in this phase)

- No `cache_control` marker placement (Phase 2).
- No tool-call-args compaction (Phase 1).
- No thinking-eviction decoupling (Phase 3).
- No compaction-before-drop (Phase 4).
- No flag flips, no deploy, no fleet rollout.
