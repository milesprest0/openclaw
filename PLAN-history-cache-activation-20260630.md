# PLAN — History-cache activation (freeze → shadow → on)

**Branch:** `feat/history-cache-activation-20260630`
**Worktree:** `/home/miles/projects/oc-history-cache-activation`
**Base:** `main` @ `8c05768550` (Merge #42: history frozen-boundary sentinel)
**Owner context:** internal engineering VM (prest0-vm). Activation-only work; NO live config flip here.

---

## 0. Objective

Move the FROZEN+WARM slice of chat history (~22–28k tok/call, ~50–65% of the ~43.7k-tok history mass)
from `fresh` into `cacheRead` by activating the already-merged history-freeze + history-cache-breakpoint
machinery, while guaranteeing the two volatile injected payloads —
(1) the per-turn timestamp (`[DOW YYYY-MM-DD HH:MM TZ]` from `injectTimestamp`) and
(2) `HEARTBEAT.md` content — stay BELOW the last cache breakpoint so they never bust cache.

---

## 1. Phase 1 verdict — NO CODE GAP

The merged code already implements both required behaviors. Volatile content sits below the last
breakpoint **by construction**, and compaction is already freeze-and-append. Evidence:

### (a) Freeze-and-append compaction — IMPLEMENTED

- `digestOldToolResultsWithStats` (`src/agents/pi-embedded-runner/run/context-budget.ts`) under
  `freezeMode:"frozen"` anchors the digest cutoff to an **absolute persisted watermark**, not the
  sliding `len - keepRawTurns`:
  - `frozenWatermark = Math.max(readFrozenWatermark(persisted), slidingCutoffIndex)` (~:393-396)
  - `cutoffIndex = Math.min(messages.length, frozenWatermark ?? 0)` (~:398-400)
  - each frozen message/block is tagged `frozen:true` (~:443, ~:487) and **skipped on re-scan**
    (`if (frozen === true) continue`, ~:424, ~:465) → non-idempotent re-digest hazard closed.
- Watermark only advances (`Math.max`) and is persisted back to session state:
  `attempt.ts:3151-3204` (live path) and `compact.ts:1172-1193` (compaction path).
- ⇒ every below-watermark byte is written once and never recomputed ⇒ byte-stable ⇒ cacheable.

### (b) Volatile content below the last breakpoint — IMPLEMENTED BY CONSTRUCTION

Two volatile payloads exist; both land below the last history breakpoint:

1. **Per-turn timestamp** — injected as a PREFIX on the live user turn by `injectTimestamp`
   (`src/gateway/server-methods/agent-timestamp.ts:41`), e.g. `[Wed 2026-07-01 00:09 UTC] <msg>`.
   It rides on the LAST message (the live tail). The `## Current Date & Time` system-prompt section
   (`system-prompt.ts:509 buildTimeSection`) emits ONLY the static timezone string — no clock — so
   the system prefix is NOT volatile.
2. **HEARTBEAT.md** — classified DYNAMIC: `DYNAMIC_CONTEXT_FILE_BASENAMES = {"heartbeat.md","memory.md"}`
   (`system-prompt.ts:65`), so it renders in the **"Dynamic Project Context"** section placed AFTER
   `SYSTEM_PROMPT_CACHE_BOUNDARY` (`system-prompt.ts:981, 1262, 1270`). The heartbeat wake instruction
   also arrives as a live user turn.
3. **History breakpoints never mark the live tail.** `resolveHistoryCacheBreakpointIndices`
   (`src/agents/anthropic-payload-policy.ts:425`) computes:
   - `lastFrozenIdx` = last message with `frozen:true` (breakpoint [3]);
   - `lastStableWarmIdx` = last non-frozen/non-system message scanning **from `length-2`** (breakpoint [4]).
     The scan starts at `messages.length - 2`, so the final message (index `length-1`, the live tail
     carrying the injected timestamp + latest user text) is **never** eligible for a marker. The system
     prefix split honors `OPENCLAW_CACHE_BOUNDARY` so the dynamic (HEARTBEAT) suffix stays uncached.
     Existing test `"on mode marks frozen and completed warm boundaries, never the live tail"`
     (`anthropic-cache-control-payload.test.ts`) already asserts the live tail is unmarked.

**Conclusion:** no code change is required for volatile-below-breakpoint. The single gap this PLAN
closes is a missing **explicit regression test** asserting a timestamped live-tail turn is placed
after the last cache breakpoint (added in Phase 4).

---

## 2. Gating (already merged, identical in fork + installed dist)

History frozen sentinel + breakpoints activate ONLY when BOTH:

- `agents.defaults.experimental.historyCacheBreakpoints: "on"` (schema: `"off"|"shadow"|"on"`)
- `agents.defaults.historyOptimization.freezeMode: "frozen"` (schema: `"off"|"sliding"|"frozen"`, default `"sliding"`)

`"shadow"` computes [3]/[4] indices + fires `onHistoryBreakpointsComputed` diagnostics but emits NO
wire markers → zero cost/behavior risk. `appendHistoryFrozenSentinel` only appends the wire sentinel
when `mode==="on" && freezeMode==="frozen"`.

---

## 3. Dependency-ordered activation (for the PARENT to flip live — NOT done here)

Each step is one live-config change on `~/.openclaw/openclaw.json` (already backed up by parent):

1. **Enable freeze (byte-neutral):** set `historyOptimization.freezeMode: "frozen"`.
   - Effect: converts the already-ON sliding digest to append-only frozen watermark. Token output
     unchanged vs today; only makes history byte-stable. `historyCacheBreakpoints` still `"off"`
     ⇒ no wire markers, no sentinel. Lowest risk.
   - Verify: no behavior/latency change; `historyFrozenWatermark` appears + advances in diagnostics.
2. **Shadow the breakpoints:** set `experimental.historyCacheBreakpoints: "shadow"`.
   - Effect: computes [3]/[4] indices and logs via `onComputed`; still NO wire markers, NO sentinel.
   - Verify: diagnostics show sane `lastFrozenIdx`/`lastStableWarmIdx` on a warm thread; zero cost delta.
3. **Turn on:** set `experimental.historyCacheBreakpoints: "on"` (with `freezeMode:"frozen"` already set).
   - Effect: emits sentinel + places `cache_control` [3]/[4] at frozen boundary + last stable WARM.
   - Verify (the real gate): OpenRouter `/generation` `native_tokens_cached` climbs by ~frozen+WARM
     size on a warm repeat, per provider; no `thinking ... cannot be modified` 400s on Opus; no
     instruction-following regression on a canary Slack thread.

Keep WARM window at current `keepRawTurns:3` for first rollout.

---

## 4. Rollback

Fully flag-reversible, no redeploy needed:

1. `experimental.historyCacheBreakpoints: "off"` — stops all wire markers + sentinel immediately.
2. `historyOptimization.freezeMode: "sliding"` — restores byte-identical pre-change digest behavior.
3. If config was edited by hand, restore the parent's backup of `~/.openclaw/openclaw.json`.
   With both flags at default (`"off"` / `"sliding"`) the assembled payload is byte-identical to `main`.

---

## 5. Phase 3 (code fix) — SKIPPED

Phase 1 found no code gap. No production code changed in this worktree. Only a regression test added.

---

## 6. Phase 4 — build + tests

- Freeze/breakpoint suite green (baseline re-confirmed before + after the test add).
- Added ONE regression test asserting a timestamped live-tail user turn is placed AFTER the last
  cache breakpoint (both breakpoints land on frozen/WARM, never on the volatile tail). Verified it
  fails when the live-tail guard is removed and passes when intact.
