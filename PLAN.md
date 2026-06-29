# PLAN.md — Phase 1: strip prior-turn thinking blocks from replayed history

Branch: `feat/thinking-eviction-phase1-20260628` (off clean main 7ea4bef5a1)
Goal: cut the ~17k tokens/turn that replayed prior-turn `thinking` blocks add to the
prompt — WITHOUT degrading reasoning continuity OR prompt-cache economics.

## Critical context discovered during investigation (DO NOT re-derive — build on this)

The eviction primitives ALREADY EXIST and are ALREADY wired into the live send path.
This phase is a **scoped, kill-switched ENABLEMENT** on the paths where it is safe.

- `src/agents/pi-embedded-runner/thinking.ts`
  - `dropReasoningFromHistory(messages)` — THE safe lever. Strips thinking from _completed_
    turns only; PRESERVES reasoning for the active tool-call continuation (the assistant
    turn after the latest user message that issued a toolCall and is awaiting a toolResult).
    Signature-safe; replaces a reasoning-only turn with `[assistant reasoning omitted]` text
    so turn structure survives provider adapters. Returns the SAME reference when unchanged.
  - `dropThinkingBlocks(messages)` — blunter: keeps only the LATEST assistant turn's thinking.
    NOT our default lever for phase 1 (less surgical). Leave behavior unchanged.
  - `stripInvalidThinkingSignatures` — already runs in replay-history; leave as-is.
  - Tests in `thinking.test.ts` already cover active-tool-loop preservation (25 tests).
- Live wiring: `src/agents/pi-embedded-runner/run/attempt.ts` ~line 2069 installs a streamFn
  wrapper when `transcriptPolicy.dropThinkingBlocks || transcriptPolicy.dropReasoningFromHistory`
  is true; it calls `dropReasoningFromHistory` / `dropThinkingBlocks` on every outbound request.
- Policy resolution: `src/agents/transcript-policy.ts` merges from the provider plugin's
  `buildReplayPolicy(ctx)`. Defaults are all-false.
- Our LIVE provider path (`openrouter/google/gemini-3.5-flash`) resolves to
  `PASSTHROUGH_GEMINI_REPLAY_HOOKS` → `buildPassthroughGeminiSanitizingReplayPolicy(modelId)`
  in `src/plugins/provider-replay-helpers.ts`, which sets NEITHER `dropReasoningFromHistory`
  NOR `dropThinkingBlocks`. => thinking is currently REPLAYED in full on this path. This is
  the ~17k/turn we measured.

## The performance-safety guardrails (this is the "must not degrade" core)

1. **Reasoning continuity:** use `dropReasoningFromHistory` (NOT `dropThinkingBlocks`). It
   already preserves the active tool-call loop + signatures. Never strip the in-flight turn.
2. **Prompt-cache prefix matching:** `shouldPreserveThinkingBlocks(modelId)` (already in
   provider-replay-helpers.ts) returns true for Claude 4.5+ because dropping thinking there
   INVALIDATES the cached prefix and costs MORE. Our new enablement MUST be gated so it NEVER
   turns on for a model where `shouldPreserveThinkingBlocks(modelId) === true`.
3. **Non-destructive:** eviction is request-local (the streamFn wrapper). The session file on
   disk keeps full thinking for audit/resume/debug. Zero data loss, fully reversible.
4. **Kill switch + phased:** a single config flag with three states (off | shadow | on),
   default `off`. Instant disable.

## Config flag

Add to `src/config/types.agent-defaults.ts` under the existing `experimental` block:

```ts
experimental?: {
  localModelLean?: boolean;
  /**
   * Phase 1 thinking-block eviction from replayed history.
   * - "off"    (default): no change; thinking replayed as today.
   * - "shadow": compute + log projected token savings each turn, but send the
   *             ORIGINAL messages unchanged (measurement only, zero behavior change).
   * - "on":     apply dropReasoningFromHistory to outbound requests on safe paths.
   * Never applies when shouldPreserveThinkingBlocks(modelId) is true (cache safety).
   */
  thinkingEviction?: "off" | "shadow" | "on";
};
```

Add the matching zod enum in the agent-defaults experimental schema (find where
`localModelLean` is validated and mirror it; default to "off" / optional).

## Implementation (centralized in attempt.ts — ONE site, lowest blast radius)

In `src/agents/pi-embedded-runner/run/attempt.ts`, near the existing eviction wrapper
(~line 2069):

1. Resolve `const thinkingEvictionMode = <config>.agentDefaults?.experimental?.thinkingEviction ?? "off";`
   (use the same config-resolution pattern already used in that file for agentDefaults;
   match how other experimental flags are read).
2. Compute a safety gate:
   `const evictionSafe = !shouldPreserveThinkingBlocks(params.model?.id ?? params.modelId);`
   Import `shouldPreserveThinkingBlocks` from `../../../plugins/provider-replay-helpers.js`
   (fix the relative path to match attempt.ts depth).
3. Extend the EXISTING wrapper condition so the wrapper also installs when
   `thinkingEvictionMode !== "off" && evictionSafe`. Keep all existing policy-driven behavior
   (`transcriptPolicy.dropThinkingBlocks` / `dropReasoningFromHistory`) intact and FIRST.
4. Inside the wrapper, after the existing policy-driven sanitation produces `sanitized`:
   - If `thinkingEvictionMode !== "off" && evictionSafe`, compute
     `const evicted = dropReasoningFromHistory(sanitized as AgentMessage[]);`
   - SHADOW: if mode === "shadow", and `evicted !== sanitized`, log a single line and send
     `sanitized` (UNCHANGED):
     `log.info("[thinking-eviction] mode=shadow sessionKey=… provider=…/… before=<n> after=<m> savedTokens=<n-m> savedPct=<…>")`
     where before/after are estimated via the existing token estimator already imported in
     attempt.ts (reuse whatever `estimateMessagesTokens`/equivalent is in scope; if none, use
     a cheap `JSON.stringify(...).length / 4` heuristic and label it `~estTokens`). Do NOT add
     a heavy new dependency.
   - ON: if mode === "on", set `sanitized = evicted` (so it is actually sent) and log
     `[thinking-eviction] mode=on … savedTokens=…`.
5. Preserve the existing `if (sanitized === messages) return inner(...)` fast-path semantics.

Keep the diff surgical. Do not refactor unrelated code. Do not touch MEMORY.md/AGENTS.md.

## Tests (REQUIRED — this is full SDLC, touches the prompt-assembly path)

1. Extend `thinking.test.ts` ONLY if a gap exists (active-loop preservation already covered).
2. Add a focused unit test for the new mode logic. Prefer a small test on a pure helper:
   refactor the mode decision into a tiny exported pure function if it makes testing clean,
   e.g. `resolveThinkingEvictionPlan({ mode, evictionSafe })` returning
   `{ apply: boolean; measure: boolean }`, and unit-test its truth table:
   - off → {apply:false, measure:false}
   - shadow + safe → {apply:false, measure:true}
   - on + safe → {apply:true, measure:true}
   - shadow|on + UNSAFE (shouldPreserveThinkingBlocks true) → {apply:false, measure:false}
3. Golden continuity assertion: a test proving that with mode="on", an active tool-call
   continuation transcript is returned BYTE-IDENTICAL (reference-equal is fine) — i.e. the
   in-flight reasoning chain is never stripped. (dropReasoningFromHistory already guarantees
   this; assert it at the integration boundary so a future refactor can't regress it.)

## Build / verify (must all pass before reporting done)

```
npm run build        # or the repo's typecheck/build script (check package.json)
npx vitest run src/agents/pi-embedded-runner/thinking.test.ts
npx vitest run <new test file>
```

Report: files changed, test results, and the projected per-turn savings logic. Do NOT push,
do NOT open a PR, do NOT merge to main — stop after green build + tests and summarize.

When completely finished, run:
openclaw system event --text "Done: phase1 thinking-eviction built + tests green" --mode now
