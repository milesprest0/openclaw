# PLAN - Phase 1 Levers 4, 3, 6

Branch: `feat/phase1-levers-346`
Spec: `PHASE1-LEVERS-3-4-6-SPEC.md`

## Scope

- Implement only Lever 4 (tool-schema diet + lazy tool exposure), Lever 3 (deterministic 16-32k target band gate mechanism), and Lever 6 (cache-prefix byte-stability checks).
- Keep all changes additive and flag-gated with default OFF.
- Keep always-on tools unchanged: `message`, `exec`, `read`, `edit`, `sessions_spawn`, `sessions_send`, `sessions_yield`.
- Do not change instruction content files or HARD/identity lines.

## Implementation Steps

1. Locate and update `message` tool schema to reduce serialized size while preserving runtime compatibility via explicit passthrough (`extra`) and existing runtime handling.
2. Add lazy exposure policy wiring behind `agents.defaults.toolExposure.lazy` in effective tool policy, with intent-based surfacing for low-frequency tools.
3. Add additive `targetBand` config on context budget defaults/schema/types, disabled by default.
4. At the attempt assembly seam, apply deterministic gate behavior when target band enabled: existing reducers in order and cap aligned to 32k max with reserve targeting ~28k pre-reserve budget.
5. Emit `context.gate.applied` diagnostics when band gate trims context.
6. Add prefix-stability protections/tests for deterministic serialized tool-schema + system-prefix region.

## Test Plan

1. Tool availability guardrail test: always-on tools always present even with lazy mode enabled.
2. Lazy intent regression test: intent phrase enables corresponding lazy tool exposure.
3. Message schema tests: shrink assertion and round-trip acceptance for existing provider-specific fields via passthrough.
4. Budget gate tests: synthetic oversized corpus p99 assembled tokens <= 32k with band enabled.
5. Most-recent-turn floor test: most recent user turn survives under gate pressure.
6. Default-off equivalence test: with all flags off, behavior/serialization remains byte-identical to current path.
7. Prefix stability test: deterministic byte-identical prefix for same config across repeated assembly.

## Verification

- Run `npm run build` until exit 0.
- Run affected vitest files/suites until green.
- Re-run build/tests once more to verify fresh results.

## Delivery

1. Commit only phase-1 related changes.
2. Push `feat/phase1-levers-346`.
3. Open PR to `main` with summary + explicit verification evidence.
4. Emit final system event: `openclaw system event --text "Phase1 done: <branch> <PR-url> build green, tests green, summary" --mode now`.
