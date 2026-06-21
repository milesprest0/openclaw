# Phase 1 Spec — Levers 4 + 3 + 6 (low-risk token reduction)

Source plan: `docs/plans/context-window-16-32k.md`. Phase 0 (instrumentation) already shipped
on `main` (`PromptInstrumentationRecord`, flag `observability.promptInstrumentation.enabled`).

## Hard constraints (do not violate)

- **No instruction-content removal.** Do NOT touch AGENTS.md/SOUL.md/IDENTITY.md/USER.md,
  any HARD/identity line, or any reasoning instruction text. Phase 1 is schema/mechanism/cache
  only. Behavioral content moves are Phase 3 and are out of scope here.
- **Everything additive + flag-gated, default OFF.** Each lever must be instantly reversible by
  flipping a config flag back to its current default. No data migration.
- **Keep core tools always-on:** `message`, `exec`, `read`, `edit`, `sessions_spawn`,
  `sessions_send`, `sessions_yield`. Lazy exposure may only gate genuinely low-frequency tools.
- **Never drop the most-recent user turn** (preserve the floor at context-budget.ts:280).
- **Byte-identical stable prefix** turn-to-turn (no timestamps/nondeterministic ordering inside
  the cached region) so `cacheRead` does not regress.
- Full SDLC: isolated worktree, build green (`npm run build` exit 0), tests added + passing,
  PR opened. Verify-before-report: re-run build/tests yourself, do not trust prior logs.

## Lever 4 — Tool-schema diet + lazy exposure

1. **Diet the `message` tool schema** (`src/.../message-tool.ts` ~lines 117-200): the schema is
   ~5,792 chars / 105 props, ~half the total tool-schema budget. Collapse rarely-used
   provider-specific optional props (Telegram/Discord effect/quote/poll/sticker fields, etc.)
   behind a documented `extra: Record<string, unknown>` passthrough OR a shared `$ref` sub-schema,
   and trim verbose per-field `description`s. **No capability loss** — the props must still be
   accepted at runtime (via `extra` or the kept schema). Target ≈ −2k chars (~−500 tokens).
2. **Lazy tool exposure** via `effective-tool-policy.ts` (split seam exists at attempt.ts:1115):
   gate low-frequency tools (image-generate, music, video, pdf, nodes — whichever are present)
   out of the default tool array and expose them on intent. Core tools listed above stay always-on.
   Behind a flag `agents.defaults.toolExposure.lazy` (default false → current behavior = all tools).

- Guardrail tests: (a) tool-availability test that core tools always present;
  (b) regression that an intent phrase for a lazy tool still surfaces it;
  (c) snapshot/length assertion that `message` schema shrank and still round-trips every prop.

## Lever 3 — Deterministic 16–32k budget gate (mechanism only)

- Add additive config `agents.defaults.contextBudget.targetBand = { min: 16000, max: 32000 }`
  to `AgentContextBudgetConfig`. **Default: absent/disabled** → existing 0.6×200k≈120k behavior
  unchanged.
- When `targetBand` is set, at the assembly seam (attempt.ts:~3057) run the existing reducers in
  order until `estimatedAssembledTokens ≤ targetBand.max`: (1) image age-out (exists), (2) old
  tool-output digest if present, (3) drop oldest turns (exists), (4) trigger compaction (exists).
  Map `maxAssembledTokens → 32000`, set `reserveTokens` so `budgetBeforeReserve ≈ 28000`.
- Preserve the "never drop most-recent turn" floor. Emit a `context.gate.applied` diagnostic when
  the gate trims (reuse the Phase 0 logging channel if convenient).
- Guardrail: replay-corpus (or synthetic oversized assembled prompt) test asserting, with the band
  enabled, p99 `estimatedAssembledTokens ≤ 32000` AND most-recent user turn always survives.
  With the band disabled (default), behavior is byte-identical to today.

## Lever 6 — Cache-aware byte-identical prefix

- Verify Lever 4's schema change is deterministic (stable prop ordering, no timestamps in the
  cached region). Add/extend a test asserting the serialized tool-schema + system-prefix region is
  identical across two builds of the same config. Do not change the cache boundary behavior; just
  protect prefix stability. Coordinate with `CACHE-OPTIMIZATION-PLAN.md` if referenced.

## Acceptance (Phase 1)

- `npm run build` exit 0; all new + existing affected tests pass.
- With all Phase 1 flags at default: zero behavioral change (prove via test + schema snapshot).
- With Lever 4 enabled: measured tool-schema char count drops ~2k; no tool capability lost.
- With Lever 3 band enabled: assembled prompt p99 ≤ 32k on the replay/synthetic corpus; most-recent
  turn preserved.
- PR opened against `main` with a clear description and the test evidence.

## Out of scope (explicitly)

- Lever 1 (Project Context retrieval) and Lever 2 (history summary) — Phase 3, gated behind the
  golden-prompt regression suite. Do not start them here.
- Any edit to identity/HARD/instruction text.
