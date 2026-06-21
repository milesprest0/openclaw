# PHASE 3 SPEC — Levers 1 + 2 (highest-risk behavioral) + Golden-Prompt Regression Gate

Branch: `feat/phase3-levers-12` · Worktree: `../openclaw-phase3` · Rollback target: `main` HEAD `695931ab12`

## Non-negotiable principles (read first)

1. **Additive + flag-gated, default-OFF.** With all new flags unset/false, the assembled
   system prompt and history MUST be **byte-for-byte identical** to current `main`. This is
   the #1 acceptance gate. Add a byte-identical golden snapshot test proving it.
2. **HARD/identity lines stay always-on.** Levers 1/2 must NEVER move, summarize, or drop any
   line tagged `HARD` or identity-level. The verbatim-presence assertion (below) is a build
   gate, not a suggestion.
3. **Pure helpers + optional opts param**, mirroring the Phase 1/2 pattern exactly (an
   `opts?: {...}` argument; when `undefined`, output is unchanged). No behavioral branch may
   run unless its flag is explicitly `=== true`.
4. **Full SDLC** — isolated worktree, PLAN.md, regression tests, build/typecheck. This touches
   production paths (`system-prompt.ts`, `context-budget.ts`, `attempt.ts`) so it is FULL, not
   lightweight, regardless of diff size.

---

## DELIVERABLE A (DO FIRST) — Golden-prompt instruction-following regression suite + verbatim-presence assertion

This is the GATE for Levers 1/2. Build and land it before/with the behavioral code so the
levers can be validated. It must pass with flags OFF (baseline) and stay green with flags ON.

### A1. Verbatim-presence assertion (deterministic, no model call)

- New module `src/agents/prompt-invariants.ts` exporting:
  - `extractProtectedLines(sourceText: string): string[]` — returns every line that is tagged
    HARD/identity. Detection rule (deterministic): a line is protected if it contains any of
    the markers `HARD`, `HARD RULE`, `identity-level`, `IDENTITY-LEVEL`, `OVERRIDES`, or sits
    under an identity-truth heading (the three SOUL identity truths). Keep the marker list in
    one exported `const PROTECTED_MARKERS`.
  - `assertProtectedLinesPresent(assembledPrompt: string, protectedLines: string[]): { ok: boolean; missing: string[] }`
    — every protected line must appear verbatim (whitespace-normalized only) in the assembled
    prompt. Returns the missing list for diagnostics.
- New test `src/agents/prompt-invariants.test.ts`: feed the actual workspace bootstrap files
  (AGENTS.md/SOUL.md from a fixture copy) → extract protected lines → assemble a prompt with
  Lever 1 ON → assert `missing.length === 0`. Also assert that with Lever 1 ON the non-protected
  long-form prose IS allowed to be replaced by a pointer (so the test proves trimming happened
  AND protection held).

### A2. Golden byte-identical snapshot (flags OFF)

- New test `src/agents/system-prompt.golden.test.ts`: build the full system prompt from a fixed
  fixture workspace with ALL Phase 3 flags unset, snapshot it; assert the snapshot is identical
  to a committed golden file. This is the default-OFF no-op proof. Commit the golden artifact.

### A3. Instruction-following eval scaffold (rubric harness, no live model required to pass CI)

- New dir `test/eval/instruction-following/` with a small JSONL corpus (6–10 representative
  cases): Slack HARD-rule compliance, tool-dispatch routing, identity-voice, deadline math,
  Spanish mirroring, multi-doc routing. Each case = `{ id, promptContextFixture, mustContainVerbatim: string[], rubric: string }`.
- New `src/agents/eval/instruction-following-harness.ts` (pure): for each case, assemble the
  prompt under given flags and run `assertProtectedLinesPresent` for `mustContainVerbatim`.
  The rubric/model-graded portion is OPTIONAL and guarded behind `RUN_LIVE_EVAL=1` (skipped in
  normal CI; deterministic verbatim portion always runs). Test file
  `src/agents/eval/instruction-following-harness.test.ts` runs the deterministic portion.

---

## LEVER 1 — Workspace Project Context dieting → retrieval (flag-gated)

### Flag

`agents.defaults.projectContextOptimization` (new `AgentProjectContextOptimizationConfig`):

- `dietToRetrieval?: boolean` (default false) — master switch.
- `maxChars?: number` (default 48_000) — Project Context char cap when ON (≈12k tokens).
- (NOTE: with `dietToRetrieval` false OR unset → NO behavior change at all.)

### Mechanism (in `src/agents/system-prompt.ts`)

- Introduce a deterministic region classifier `classifyContextRegions(file): { inline, onDemand }`.
  - `inline` (ALWAYS rendered verbatim): any region containing a protected line per
    `extractProtectedLines` (Deliverable A1) — the three SOUL identity truths, all `HARD` rules,
    the tool-dispatch trigger table. Also USER.md and IDENTITY.md (small, always inline).
  - `onDemand` (replaced by a one-line pointer when flag ON): long-form reference prose already
    pointer-ized in MEMORY.md, full trigger lists/examples/rationale blocks NOT containing a
    protected line.
- In `buildProjectContextSection(...)` (system-prompt.ts ~1095): when `dietToRetrieval===true`,
  render only `inline` regions + a compact pointer line per `onDemand` region
  (`"↳ <topic> — load via memory_search when relevant"`), then enforce `maxChars` with the same
  trim discipline as bootstrap. When flag is OFF, render exactly as today (unchanged code path).
- Emit a `context.projectContext.dieted` diagnostic ({beforeChars, afterChars, regionsInlined, regionsPointered}) when ON.
- Keep ordering byte-stable (`CONTEXT_FILE_ORDER`, system-prompt.ts:47) so the cache prefix
  invariant (Lever 6) holds.

### Guardrail wired in

- The classifier MUST route every protected line to `inline`. Deliverable A1 test asserts this.
- Hard fail (throw at assembly) if, with the flag ON, any protected line would be pointered —
  fail-closed, never silently drop a HARD/identity line.

---

## LEVER 2 — Rolling structured history summary (flag-gated)

### Flag

`agents.defaults.historyOptimization` (new `AgentHistoryOptimizationConfig`):

- `digestOldToolResults?: boolean` (default false) — master switch.
- `keepRawTurns?: number` (default 3) — most-recent N turns kept fully raw.
- `oldToolResultMaxChars?: number` (default 2_000) — per-turn-age cap for non-recent tool outputs.
- (Unset/false → NO behavior change.)

### Mechanism (in `src/agents/pi-embedded-runner/run/context-budget.ts`, consumed at attempt.ts:3057)

- Add a pure helper `digestOldToolResults(messages, { keepRawTurns, oldToolResultMaxChars }): messages`
  that, BEFORE the existing drop-oldest-turn loop, replaces tool-result blocks in turns older than
  `keepRawTurns` with a compact structured digest `{tool, argsHash, outcome, keyFacts, idsPreserved}`.
  - MUST preserve identifiers (paths, IDs, URLs, case numbers) verbatim in `idsPreserved` — there is
    already `compaction.identifier-preservation.test.ts` to mirror.
  - Last `keepRawTurns` turns and the most-recent user turn are NEVER digested.
- Wire into `applyContextBudgetGuard` as an optional first step gated by `digestOldToolResults===true`.
  When OFF, the guard runs exactly as today (pure deletion).
- Emit `context.history.digested` diagnostic when ON.

### Guardrail wired in

- New test `context-budget.history-digest.test.ts`: (a) flag OFF → messages array identical;
  (b) flag ON → old tool results shrink but a follow-up referencing an ID/path from a digested
  turn still finds it verbatim in `idsPreserved`; (c) recent N turns untouched.

---

## Config wiring (mirror Phase 1/2 exactly)

Add both new config types to every file the Phase 1 `toolExposure` / Phase 2
`skillsPromptOptimization` flags touched:

- `src/config/types.agent-defaults.ts` — add `AgentProjectContextOptimizationConfig` +
  `AgentHistoryOptimizationConfig` types and the two optional fields on `AgentDefaultsConfig`.
- `src/config/zod-schema.agent-defaults.ts` (+ `.test.ts`) — zod schemas + tests for both,
  including default-OFF and bounds.
- `src/config/schema.help.ts`, `schema.labels.ts` (+ hints/tags if the prior levers needed them).

## Tests to deliver (all must pass)

1. `prompt-invariants.test.ts` — verbatim-presence + protection-holds-under-trim.
2. `system-prompt.golden.test.ts` — byte-identical default-OFF snapshot.
3. `instruction-following-harness.test.ts` — deterministic verbatim portion of eval corpus.
4. `context-budget.history-digest.test.ts` — Lever 2 OFF=identical / ON=ids-preserved / recent-raw.
5. Lever 1 trim test — flag ON inlines all protected, pointers the rest, respects `maxChars`.
6. Config schema tests for both new flags (default-OFF, bounds).
7. Full existing suite stays green (no regression).

## Acceptance / report-back

- `npm run build` runtime bundle exit 0 (the pre-existing `build:plugin-sdk:dts` failure on
  `manager.core.ts` + `socket-adapter.ts` is NOT a regression — confirm it reproduces on `main`).
- All new + existing vitest green.
- Diff is additive; no edits to AGENTS.md / SOUL.md / IDENTITY.md / any identity body.
- PR title: `phase3 levers 1+2: project-context retrieval + rolling history digest (flag-gated default-OFF) + golden-prompt regression gate`.
- Open PR; do NOT merge — the assistant verifies independently then merges.

## Out of scope (do NOT do)

- Do NOT flip any flag on. Do NOT change defaults. Do NOT touch Lever 3/4/5/6 code already merged.
- Do NOT move any HARD/identity content out of the bootstrap files themselves (the levers operate
  at assembly time via classification; the source files are untouched).
