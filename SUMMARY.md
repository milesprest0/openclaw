# Context Budget Invariant Implementation Summary

## Files changed and purpose

- `src/agents/pi-embedded-runner/run/context-budget.ts`
  - Added deterministic per-turn context-budget resolver + guard.
  - Enforces: age out oldest inline images beyond cap, then drop oldest turns until under budget.
  - Added per-tenant override support via `overrideKey` + `overrides`.
- `src/agents/pi-embedded-runner/run/context-budget.test.ts`
  - Regression tests for 3.5M-token/100-image trimming, image placeholder behavior, and default/override resolution.
- `src/agents/pi-embedded-runner/run/attempt.ts`
  - Applied guard before prompt submission/model call on every turn.
- `src/agents/pi-embedded-runner/compact.ts`
  - Applied guard before compaction so compaction input is bounded.
- `src/agents/pi-embedded-runner/run/history-image-prune.ts`
  - Re-exported `applyContextBudgetGuard` for existing run-path imports.
- `src/auto-reply/reply/agent-runner-memory.ts`
  - Wired context-budget likelihood check into preflight compaction trigger and passed `agentAccountId` through to compaction.
- `src/auto-reply/reply/agent-runner-memory.test.ts`
  - Adjusted two assertions to assert stable session identity (`sessionId`) instead of object reference.
- `src/config/types.agent-defaults.ts`
  - Extended `agents.defaults.contextBudget` shape with `overrideKey` and `overrides` map support.
- `src/config/zod-schema.agent-defaults.ts`
  - Added schema support for `agents.defaults.contextBudget.overrideKey` and `.overrides`.
- `src/config/zod-schema.agent-defaults.test.ts`
  - Added schema coverage for tenant override map under `agents.defaults.contextBudget`.
- `src/config/schema.labels.ts`
  - Added UI labels for new `contextBudget` keys.
- `src/config/schema.help.ts`
  - Added help text for new `contextBudget` keys.
- `src/agents/openai-transport-stream.ts`
  - Cast tightened to `as unknown as Array<Record<string, unknown>>` to satisfy current build lane type constraints.
- `src/cron/service.test-harness.ts`
  - Added `fileWatcher: null` to mock `CronServiceState` shape.

## Chosen default and rationale

- Default `maxAssembledTokens` is derived as `floor(0.6 * contextWindowTokens)`.
- If unset, this keeps the assembled transcript comfortably below model limits while preserving substantial history.
- With the common 200k context window, this resolves to 120k assembled tokens.
- Default `reserveTokens` is 20k; default `perThreadMaxImages` is 8.

## Fleet override mechanism

- Global default lives at `agents.defaults.contextBudget`.
- Per-tenant overrides live in `agents.defaults.contextBudget.overrides`.
- Runtime resolves override key in order: explicit `overrideKey`, then `agentAccountId`.
- Effective budget = base defaults merged with selected override entry.

## Verification commands and output tails

### Build

Command:

```bash
npm run build
```

Tail:

```text
[build-all] write-build-info
[build-all] write-cli-startup-metadata
[build-all] write-cli-compat
```

### Tests

Command:

```bash
npx vitest run src/auto-reply/reply/agent-runner-memory.test.ts src/agents/pi-embedded-runner/run/context-budget.test.ts src/config/zod-schema.agent-defaults.test.ts
```

Tail:

```text
Test Files  3 passed (3)
Tests      39 passed (39)
Duration   5.67s
```
