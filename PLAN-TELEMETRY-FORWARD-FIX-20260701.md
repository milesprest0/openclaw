# PLAN — Phase 0 (telemetry): forward-only kill of the fabricated `cacheRead` carry

**Branch:** `fix/cache-telemetry-source-carryforward-20260701` off fork `main` (`8c05768550`).
**Do NOT** use `fix/cache-telemetry-fabricated-constant-20260630` — its diff reverts merged #39–#42.
**Source of truth for surrounding context:** `CACHE-OPT-STRATEGIST-BRIEF.md`, `scripts/cache-telemetry-audit.mjs`.

## The confirmed defect (root cause, file:line)

Live logs (`/tmp/openclaw/token-usage-2026-07-01.jsonl`) show the SAME nonzero
`cacheRead=21443` stamped on rows for **3 different provider families**
(anthropic/claude-opus, google/gemini-3.5-flash, openai) — impossible for genuine
per-provider reads (each family tokenizes differently). 34/41 rows in the last 6h are
contaminated. The analysis harness (`scripts/cache-telemetry-audit.mjs`, already committed
on the prior branch) _quarantines_ this, but the **write side still emits it**.

Trace:

- `src/agents/pi-embedded-runner/run/attempt.context-engine-helpers.ts:106`
  `findCurrentAttemptAssistantMessage()` slices `messagesSnapshot` from
  `prePromptMessageCount`, reverses, and returns the last `role==="assistant"` message.
- `attempt.ts:3632` (and the helper at `:158`) does
  `lastCallUsage = normalizeUsage(currentAttemptAssistant?.usage)`.
- When the current attempt did NOT produce a fresh assistant message carrying THIS call's
  usage (tool-loop continuation, provider that reports usage out-of-band, retry), the
  finder falls back to a **stale prior-turn assistant message** whose `.usage.cacheRead`
  is the old constant. That stale value is carried into `lastCallUsage`, persisted to the
  session entry (`session-usage.ts:209` `patch.cacheRead = safeLastCallUsage?.cacheRead`),
  and logged (`session-usage.ts:233` `cacheRead: safeLastCallUsage?.cacheRead ?? 0`) — even
  across a model switch, which is why one value shows up under 3 families.

## Fix (forward-only, telemetry-integrity ONLY — zero behavior change to prompt assembly)

Goal: never attribute a `cacheRead`/`cacheWrite` value to a call unless it provably came from
THIS attempt's own assistant response for THIS provider/model.

Implement a **provenance guard** at the point `lastCallUsage` is derived from
`currentAttemptAssistant`:

1. In `attempt.context-engine-helpers.ts`, tighten `findCurrentAttemptAssistantMessage` /
   its callers so the resolved assistant message must belong to the **current attempt**
   (index strictly `>= prePromptMessageCount`) AND — add a guard — its recorded
   provider/model family matches the family of the call being logged. If it does not match,
   treat `lastCallUsage` cache fields as **unknown** (undefined), NOT as the stale carry.
   - If the assistant message carries no provider/model tag, gate on positional freshness
     only (must be strictly newer than `prePromptMessageCount`), and additionally: if the
     assistant message is byte-identical/`usage` object-identical to the immediately prior
     turn's persisted `lastCallUsage`, drop the cache fields (stale-repeat detector).
2. Belt-and-suspenders at the write site (`session-usage.ts`): before persisting/logging,
   if `params.modelUsed`/`providerUsed` family differs from the family that produced
   `safeLastCallUsage`, zero out `cacheRead`/`cacheWrite` for that row (log `null`/omit,
   not a fabricated number). Reuse the family-mapping logic mirrored from
   `scripts/cache-telemetry-audit.mjs:providerFamily`. Factor `providerFamily()` into a
   shared util (e.g. `src/agents/usage.ts` or a new `src/agents/provider-family.ts`) so the
   harness and the runtime share ONE definition — do not duplicate.

Forward-only: this changes NOTHING about what tokens the model sees or what gets cached. It
only stops mislabelling telemetry. Fully reversible.

## Acceptance gate

- With the fix live, no single nonzero `cacheRead` value may appear under ≥2 provider
  families in freshly written rows. Add a unit test asserting the guard drops a
  cross-family carry.
- Re-running `node scripts/cache-telemetry-audit.mjs --dir /tmp/openclaw --hours 1` on
  post-fix rows must report `0 quarantined` (once enough fresh rows exist) — note this can
  only be fully verified after deploy + live traffic; the unit test is the hard gate.

## Tests (vitest, no live model)

New `attempt.context-engine-helpers.carryforward.test.ts` (or extend the nearest existing
suite):

- (a) fresh same-family assistant usage → `lastCallUsage.cacheRead` preserved.
- (b) stale prior-turn assistant of a DIFFERENT family → cache fields dropped (undefined),
  input/output still resolved if present.
- (c) positional staleness (assistant index < prePromptMessageCount) → dropped.
- (d) `providerFamily()` shared util parity: same mapping as the audit script for
  anthropic/google/openai/xai/minimax/deepseek/qwen/meta.
  Extend `session-usage` test if one exists to cover the write-site family guard.

## Build / verify

- `npm run build` must exit 0. KNOWN non-regression: pre-existing
  `build:plugin-sdk:dts` failure on `manager.core.ts`/`socket-adapter.ts` — CONFIRM it
  reproduces on `main` before blaming this change (it is not ours).
- Run the new + adjacent vitest suites (`context-engine-helpers*`, `session-usage*`,
  `usage*`). All green.
- Commit + push branch. Do NOT restart the gateway / deploy — the orchestrator gates deploy.

## Out of scope (do NOT touch here)

- No prompt/history assembly changes. No `cache_control` marker changes. No `contextPruning`
  or `freezeMode` flag changes. No history-compaction work (that is
  `PLAN-history-compaction-cacheability-20260630.md`, a separate phase).
- Do not revert or reopen anything from merged #39–#42.
