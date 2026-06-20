# PLAN: Per-Call Token Observability

Branch: `feat/per-call-token-observability-20260620`
Base: `origin/main` @ aa90771f5c

## Problem

The runtime captures true per-API-call `prompt_tokens` (via `lastCallUsage` in
`session-usage.ts`) but only persists the _latest_ value per session in the
session store — it overwrites every turn. There is no per-call/per-turn time
series and nothing is emitted to a tail-able log. We cannot answer "how much
context fills per turn, min–max" from real provider numbers.

## Goal

Emit one structured JSONL record per LLM API-call usage persist, at the existing
`persistSessionUsageUpdate` seam, into a dedicated rolling log file. Additive,
single seam, off-by-config-safe, zero behavior change to existing persistence.

## Scope classification

FULL SDLC. Touches `session-usage.ts` (turn-handling/persistence path → blast
radius). Worktree + PLAN + test + build/typecheck.

## Design

New module `src/logging/token-usage-log.ts`:

- `resolveTokenUsageLogPath(date?)` → `<openclaw-tmp>/token-usage-<YYYY-MM-DD>.jsonl`
  (mirrors `log-file-path.ts` tmp-dir resolution).
- `logTokenUsageRecord(record, config?)` → append one JSON line; best-effort,
  never throws, gated by `config.logging.tokenUsageLog !== false`.
- `buildPctFull(totalTokens, contextMax)` → utilization ratio (4dp).
- Record: `{ ts, sessionKey, model, provider, promptTokens, lastCallInput,
lastCallOutput, cacheRead, cacheWrite, accumInput, accumOutput, contextMax,
totalTokens, pctFull }`.

Hook: inside `persistSessionUsageUpdate`, after `patch.totalTokens` is computed,
fire `void logTokenUsageRecord(...)` (fire-and-forget).

Config: `LoggingConfig.tokenUsageLog?: boolean` (default enabled).

## Tests (`src/logging/token-usage-log.test.ts`)

- `buildPctFull` ratio + undefined guards.
- Appends one JSONL record with expected fields.
- Writes nothing when disabled via config.

## Verify

- tsc `--noEmit`: 0 errors project-wide.
- vitest: 4/4 pass.
- Manual: tail `token-usage-*.jsonl` on the running gateway after deploy.

## Rollback

Single new module + one guarded call site + one config field. Revert = delete
module/test + remove call + remove field.
