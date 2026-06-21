# Phase 0 — Prompt/Context Instrumentation (additive, zero behavior change)

## Why

We are about to reduce the ~36k-token always-on Project Context injection. Before ANY
prose moves, we need a measuring stick so every later claim ("performance went up",
"no regression") is provable, not vibes. This phase changes NO behavior — it only
emits structured telemetry per turn. Reasoning risk: zero.

## Hard constraints

- ADDITIVE ONLY. Do not change prompt assembly, retrieval, routing, or any HARD/identity
  injection. No existing output may change.
- Reuse what already exists. Do NOT recompute things the codebase already computes:
  - `src/agents/system-prompt-report.ts` → `buildSystemPromptReport(...)` already produces
    `SessionSystemPromptReport` with `systemPrompt.{chars,projectContextChars,nonProjectContextChars}`,
    `tools.schemaChars`, `skills`, `injectedWorkspaceFiles`.
  - `src/auto-reply/reply/agent-runner-memory.ts` already derives `promptTokens` (search
    `derivePromptTokens`, `promptTokens`).
  - Type lives in `src/config/sessions/types.ts` → `SessionSystemPromptReport`.
- Flag-gated. New telemetry emission must sit behind a config flag (default OFF) so it is
  trivially reversible and can ship dark.
- Tested. Add a unit test asserting the emitted record shape and that the flag gates it.
- Build + typecheck clean (`npm run build`).

## Deliverable: one structured per-turn telemetry record

On each completed turn (where the system-prompt report + usage are available), emit ONE
structured JSON line (via the existing logger; no new transport) containing:

1. `promptTokens` (from usage) and `systemPrompt.chars` / `projectContextChars` /
   `nonProjectContextChars` (from the report).
2. `tools.schemaChars`, `skills.promptChars`, and `injectedWorkspaceFiles` rollup
   (count + total injectedChars).
3. `retrieval`: hit/miss + which memory entries were retrieved THIS turn, IF that signal is
   already available in the run context. If it is NOT already plumbed, DO NOT build a new
   retrieval pipeline here — instead emit `retrieval: { available: false }` and leave a
   `// PHASE1-HOOK:` comment at the exact spot where Lever-1 retrieval results should later
   attach. (Phase 0 must not grow scope into Phase 1.)
4. `model`, `provider`, `sessionId`/`sessionKey`, `generatedAt`.
5. A `qualityProxy` placeholder field reserved for eval pass-rate / regret signal
   (`qualityProxy: { evalPassRate: null, regret: null }`) — wired in a later phase.

## Where to hook

- Prefer the point where the run already has BOTH the `SessionSystemPromptReport` (source:"run")
  and the usage/`promptTokens` — likely in `agent-runner-memory.ts` after promptTokens is
  derived, reading `sessionEntry.systemPromptReport`. Confirm by reading the file; use
  gbrain-code if helpful: `gbrain-code code-refs systemPromptReport --repo ~/projects/openclaw-fork`.
- Emit through the existing structured logger used in that module; do not invent a new sink.

## Config flag

- Add a single boolean under the existing telemetry/observability config area (find the
  nearest existing flag and mirror its pattern). Name suggestion:
  `observability.promptInstrumentation.enabled` (default false). Document default-OFF.

## Acceptance

- `npm run build` passes.
- New unit test passes and proves: (a) flag OFF → no record emitted; (b) flag ON → exactly one
  record with the fields above; (c) when retrieval signal absent → `retrieval.available===false`.
- Zero diff to any existing prompt text, routing, or HARD/identity injection.
- Commit on a feature branch `feat/phase0-prompt-instrumentation`; push; open PR against main
  with a summary of fields emitted and the default-OFF flag.

## Out of scope (do NOT do here)

- Moving any prose to retrieval (that is Phase 1 / Lever 1).
- Trimming tool schemas or skills (Phase 1 / Levers 3-4).
- Prompt caching breakpoints (Lever 6).
- Building a new retrieval pipeline.
