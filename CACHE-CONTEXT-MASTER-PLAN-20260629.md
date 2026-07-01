# Cache + Context-Window Master Plan (Prest0n fleet / OpenClaw fork)

**Date:** 2026-06-29 · **Author:** cache/context strategist subagent · **Status:** PLAN ONLY (no production code or flags changed)
**Repo:** `/home/miles/projects/openclaw-fork` @ `main` (`dd4b747037`)
**Inputs verified:** `CACHE-OPT-STRATEGIST-BRIEF.md`, the four prior-art specs, `PLAN-tier2-cache-optimization.md`, the three unmerged branches, live `~/.openclaw/openclaw.json`, and `/tmp/openclaw/token-usage-2026-06-{28,29}.jsonl` (read-only Python).

---

## 0. TL;DR for the exec channel

- **The "50% cache" claim and the brief's "18.2%" are BOTH wrong, for two different measurement bugs.** After de-duplicating the telemetry the aggregate is **~34.7%** (06-29) / **~37.2%** (06-28). But even that number rests on a **fabricated constant**: every non-zero `cacheRead` in the entire corpus is _exactly_ `21443` — across Gemini, GPT-mini, Grok, AND a call 16 h later. That is physically impossible for real provider cache reads. **Conclusion: we cannot currently state a trustworthy hit-rate. Fixing measurement is P0 and gates everything else.**
- **Highest-leverage real lever:** the dominant-volume Gemini Tier-2 path (220 calls) gets **zero prefix caching today** — Gemini does no implicit caching over OpenRouter and we send it no `cache_control` markers. The unmerged `feat/gemini-openrouter-cache-20260629` branch is the fix and is the single biggest win available.
- **Context window is already ~70% dieted** (144k→42.8k projectContext chars). The residual is HARD/identity content that is _correctly_ kept inline. Further reduction requires sub-region classification, not "turn on the flag" (it's already on).

---

## 1. Measurement reconciliation — the TRUE numbers, honestly

### 1.1 Why "18.2%" is wrong (double-row defect — **P0-A**)

The JSONL interleaves **two record shapes**, one per turn, written by two different functions to the **same file** (`resolveTokenUsageLogPath`):

| Shape         | Writer                                                     | Carries                                                       | Has `cacheRead`? | Has `promptTokens`? |
| ------------- | ---------------------------------------------------------- | ------------------------------------------------------------- | ---------------- | ------------------- |
| `USAGE_ONLY`  | `logTokenUsageRecord` — `session-usage.ts:217`             | `ts, cacheRead, cacheWrite, lastCallInput, accumInput…`       | ✅               | ✅                  |
| `REPORT_ONLY` | `logPromptInstrumentationRecord` — `session-usage.ts:~247` | `generatedAt, systemPrompt{}, tools{}, skills{}, retrieval{}` | ❌               | ✅                  |

Both carry `promptTokens`, but only `USAGE_ONLY` carries `cacheRead`. The brief computed `sum(cacheRead)/sum(promptTokens)` over **all** rows, so the denominator was **double-counted** → ~18%. Restricting to `USAGE_ONLY` rows (the only ones with cache data):

```
06-29: sum(cacheRead)=3,130,678  sum(promptTokens)=9,016,670  → 34.7%   (n=148 usage rows)
06-28: sum(cacheRead)=  711,926  sum(promptTokens)=1,913,138  → 37.2%   (n= 34 usage rows)
```

Per-model (06-29, USAGE_ONLY only):

| model                         | n   | hit%  | cacheRead | cacheWrite | promptTokens |
| ----------------------------- | --- | ----- | --------- | ---------- | ------------ |
| google/gemini-3.5-flash       | 111 | 35.6% | 2,380,173 | 0          | 6,679,606    |
| ~openai/gpt-mini-latest       | 26  | 35.2% | 557,518   | 0          | 1,583,190    |
| x-ai/grok-4.20                | 4   | 21.2% | 85,772    | 0          | 404,297      |
| ~anthropic/claude-opus-latest | 7   | 30.7% | 107,215   | 43,124     | 349,577      |

### 1.2 Why even 34.7% is not trustworthy (constant-cacheRead defect — **P0-B**)

`SELECT DISTINCT cacheRead` over all 148 usage rows returns **{21443 (×146), 0 (×2)}**. Broken out:

```
gemini-3.5-flash : cacheRead ∈ {21443}             (112 rows, one value)
gpt-mini-latest  : cacheRead ∈ {21443}             ( 26 rows)
grok-4.20        : cacheRead ∈ {21443}             (  4 rows)
opus-latest      : cacheRead ∈ {21443, 0}
```

This cannot be real provider telemetry:

- **Different providers, identical integer.** Gemini, OpenAI, and xAI use different tokenizers; the same system prefix tokenizes to _different_ counts per provider. They cannot all report exactly 21,443 cached tokens.
- **Grok caches at 21443** even though xAI reports `supports_implicit_caching=false` on OpenRouter (per `PLAN-tier2-cache-optimization.md` Finding D) — it should be ~0.
- **A call 978 min (16 h) later still reads 21443** (session `…668989`, last row 21:03 after a 04:45 write) — both the 5 m and 1 h TTLs are long dead; a real cache read there is impossible.
- The value equals the **stable-prefix size** and never moves with session depth, model, or elapsed time.

**Diagnosis:** `cacheRead` is not the provider's reported `cached_tokens`. It is a **stale/carried-forward constant** — almost certainly the last persisted `SessionEntry.cacheRead` (`session-usage.ts:202`, `patch.cacheRead = (lastCallUsage ?? usage)?.cacheRead ?? 0`) being re-emitted when the live `currentAttemptAssistant.usage` (`attempt.ts:3589`, normalized at `model.ts:204`) does not actually populate `cacheRead` for the OpenRouter `openai-completions` path. `derivePromptTokens` (`usage.ts:207`) then computes `promptTokens = input + cacheRead + cacheWrite`, so a fake `cacheRead` of 21443 silently inflates `promptTokens` and produces the spurious identity `promptTokens − 21443 = lastCallInput` that holds for **148/148** rows. **The whole hit-rate is anchored to a constant we never actually measured.**

> Honest bottom line: **the true current cache hit-rate is UNKNOWN.** The defensible statements are: (1) the _aggregate-as-logged_ is 34.7%, not 18% and not 50%; (2) that 34.7% is built on a constant `cacheRead` and is therefore an artifact, not a measurement; (3) until P0-A and P0-B are fixed, "did caching improve" cannot be answered with data. Everything below is sequenced so measurement is trustworthy _before_ any optimization is judged.

### 1.3 Bucketing (computed from the JSONL, with the P0-B caveat)

Splitting 06-29 usage rows by session position / inter-call gap (these inherit the 21443 artifact, so treat as _upper bounds on apparent_ hit-rate, not ground truth):

| Bucket                        | promptTokens | cacheRead | apparent hit% | note                                                                          |
| ----------------------------- | ------------ | --------- | ------------- | ----------------------------------------------------------------------------- |
| COLD (first call in session)  | 1,239,060    | 343,088   | 27.7%         | should be ~0% on a true cold call; the 21443 carry-in inflates it             |
| WARM within 5 m of prior call | 1,990,155    | 836,277   | 42.0%         | the only bucket where a real 5 m-ephemeral hit is even possible               |
| WARM after >5 m gap (expired) | 5,889,018    | 1,994,199 | 33.9%         | 91 of 133 gaps fall here; a real 5 m cache is dead, yet "hit" — pure artifact |

Inter-call gap distribution (133 intra-session gaps): **p50 = 538 s (~9 min)**, 40 ≤5 m, 91 in 5 m–1 h, 2 >1 h. **The median gap exceeds the 5-minute ephemeral TTL.** Even after measurement is fixed, this is the structural reason real hit-rate will be low until TTL strategy (§5) lands.

### 1.4 TTL-waste case (brief's session `…668989`) — confirmed structural

Trace of that session shows the steady-state mechanic plainly: Gemini turns each report `cacheRead=21443, cacheWrite=0` while `lastCallInput` climbs 27k→84k as history grows; the two Opus turns show `cacheWrite=21562, cacheRead=0` (write premium paid) and are **never read back** — the next same-prefix call is a different model (Gemini), and the following Opus call is 16 h later. **We paid the 1.25× Anthropic write premium twice for zero read benefit.** This is the "never write cache you won't read" anti-pattern the TTL strategy must kill.

---

## 2. Mechanism map (verified file:line) — what actually happens per turn

### 2.1 The prefix/suffix split is real and correct

- Boundary constant + splitter: `src/agents/system-prompt-cache-boundary.ts` (`SYSTEM_PROMPT_CACHE_BOUNDARY`, `splitSystemPromptCacheBoundary`).
- Assembler emits boundary at `system-prompt.ts:1262`; stable files above, dynamic (`heartbeat.md`, `memory.md` — `DYNAMIC_CONTEXT_FILE_BASENAMES`, `system-prompt.ts:65`) + `## Runtime` (`:1333`) below. `stableContextFiles`/`dynamicContextFiles` partition at `:980-981`. **MEMORY.md is already below the boundary (Phase-1 shipped).**

### 2.2 Per provider, what caches the prefix today

| Provider (our routing)                                          | Prefix cached?            | Mechanism                                                                                                                                                                                                                                                                                               | Evidence                                                       |
| --------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **Anthropic via OpenRouter** (Opus)                             | ✅ explicit               | `applyAnthropicEphemeralCacheControlMarkers` honors boundary split (2 blocks) + caches last tool (`anthropic-payload-policy.ts:344-426`); wrapper `createOpenRouterSystemCacheWrapper` (`proxy-stream-wrappers.ts:184`)                                                                                 | only model with non-zero `cacheWrite` in telemetry             |
| **Gemini via OpenRouter** (Tier-2 primary, **dominant volume**) | ❌ **NONE**               | implicit caching needs `modelApi==="google-generative-ai"` (`prompt-cache-retention.ts:9-17`); our Gemini is `openai-completions`/OpenRouter, so the explicit Google path (`google-prompt-cache.ts`) never fires, AND no `cache_control` markers are sent (wrapper gates on `isAnthropicModelRef` only) | telemetry `cacheWrite=0` always; brief's Tier-2 plan Finding C |
| **GPT-mini via OpenRouter**                                     | ✅ implicit (server-side) | OpenAI auto-caches prefixes ≥1024 tok, free, automatic (`isOpenAIPromptCacheEligible`, `prompt-cache-retention.ts:24`)                                                                                                                                                                                  | no action available/needed                                     |
| **Grok via OpenRouter**                                         | ❌ none                   | xAI `supports_implicit_caching=false`                                                                                                                                                                                                                                                                   | tail fallback, low volume                                      |
| **GLM-5.2**                                                     | ❌ none                   | no upstream supports it (Tier-2 plan Finding B)                                                                                                                                                                                                                                                         | route/cost lever only                                          |

**The single structural gap:** the highest-volume model (Gemini, 220 calls) is the one model with no prefix caching at all.

### 2.3 `cacheRetention:"long"` does NOT reach the Gemini path

Live config sets `cacheRetention:"long"` on `google/gemini-3.5-flash` (`openclaw.json`), but:

- The OpenRouter Anthropic marker wrapper only acts when `isAnthropicModelRef(modelId)` is true (`proxy-stream-wrappers.ts:211`), so for Gemini it returns the underlying stream unchanged — **`long` is inert for Gemini**.
- The Google explicit-cache TTL resolver (`google-prompt-cache.ts:72`, 1h vs 5m) only runs for `modelApi==="google-generative-ai"`, which we never hit.
- So `cacheRetention:"long"` on Gemini today changes **nothing**. It only does work for the Anthropic-direct path and (post-merge) the Gemini-OpenRouter-marker path.

### 2.4 Why `projectContextChars` is still ~42.8k despite `dietToRetrieval:true`

The diet **is** firing (144,472 → 42,859 chars, −70%). Residual is by design:

- `classifyContextRegions` (`system-prompt.ts:174`) splits each file by markdown heading and inlines a **whole region** if _any_ line in it is protected (`containsProtectedLine`), pointers the rest. `extractProtectedLines` (`prompt-invariants.ts:21`) protects `HARD`, `HARD RULE`, `identity-level`, `OVERRIDES`, and everything under an "identity truth" heading.
- AGENTS.md/SOUL.md are dense with HARD/identity markers (6 and 4 protected lines, each in a large region), and `user.md`/`identity.md` are force-inlined whole (`:213`). So the big regions stay inline — correctly. The `maxChars:48000` cap (`clampProjectContextChars`, `:227`) isn't even binding at 42.8k.
- `retrieval.available:false` is **expected and correct**: Phase-0 spec deliberately emits `retrieval:{available:false}` as a placeholder because Lever-1 _retrieval plumbing was never built_ — the diet replaces prose with static pointer lines (`pointerLineForRegion`, `:223`), it does not wire a retrieval pipeline. **There is no contradiction: the diet works; "retrieval" was always a pointer-replacement, not live recall.** Pushing below ~42.8k requires _sub-region_ classification (§6), which is the real remaining context lever.

---

## 3. Unified, provider-agnostic cache strategy (the one design)

Miles asked for one coherent strategy "regardless of mechanism and model/provider." The unifying principle:

> **Maximize the number of input tokens that the provider can serve from a cache, by (a) guaranteeing a byte-identical stable prefix, (b) ensuring every provider has a working cache mechanism attached to that prefix, and (c) keeping the prefix warm within its TTL or not paying to write it at all.**

Three rungs, one ladder:

1. **Explicit-marker rung (Anthropic, and Gemini-via-OpenRouter once merged):** send `cache_control` breakpoints at the boundary split + tool-block. Pay the write premium only when reads will follow (TTL strategy §5).
2. **Implicit-prefix rung (OpenAI/GPT-mini, DeepSeek, native Gemini):** no markers; the only lever is **byte-identical prefix stability** — already in place (memoized prefix, no clock in `buildTimeSection`). Protect it: any context/diet change must not perturb bytes above the boundary.
3. **No-cache rung (GLM, Grok):** no caching mechanism exists. The only lever is **routing/volume** — keep them as deep fallbacks (already true) and, for GLM, the provider pin from the Tier-2 plan (cost/ctx, not cache).

The same boundary, the same prefix-stability invariant, and the same TTL policy object feed all three rungs. What differs is only _how the cache is keyed_ (explicit markers vs implicit prefix vs none) — and that is already abstracted behind `resolveCacheRetention` + the wrapper family.

---

## 4. Lever ranking by (hit-rate gain × volume ÷ risk)

| Rank  | Lever                                                                                                                  | Volume                             | Apparent gain                                                                                                        | Risk                                      | Where                                                                                                                                                                         |
| ----- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** | **Gemini-OpenRouter `cache_control` markers** (merge `feat/gemini-openrouter-cache-20260629`, then enable per-surface) | **Highest (220 calls)**            | Gemini prefix (~21k tok) goes from **0% cached → ~90% read discount** on warm turns; branch cites ~91% input savings | Low-Med (opt-in flag default-OFF; canary) | `prompt-cache-retention.ts` `isOpenRouterGoogleCacheEligible`, `proxy-stream-wrappers.ts` `googleMarkers`, `extra-params.ts:712`, config `experimental.openRouterGoogleCache` |
| **2** | **Fix measurement (P0-A + P0-B)**                                                                                      | All                                | 0 token gain; **unblocks judging every other lever**                                                                 | None (telemetry only)                     | `session-usage.ts:217/247`, `token-usage-log.ts`, `model.ts:204`, `usage.ts:207`                                                                                              |
| **3** | **TTL strategy: stop writing caches we won't read; warm-keepalive within TTL**                                         | Opus + any explicit-marker surface | Removes wasted 1.25× writes; converts expired-gap misses to hits where economical                                    | Med (TTL/cost tradeoff)                   | `proxy-stream-wrappers.ts:165-200`, `cache-ttl.ts`, `contextPruning.ttl`                                                                                                      |
| **4** | **Prefix-stability guard** (regression test prefix bytes are identical turn-to-turn)                                   | All implicit rungs                 | Protects existing GPT-mini/Gemini-implicit hits from silent regression                                               | Low                                       | `system-prompt.ts` boundary, golden test                                                                                                                                      |
| **5** | **Sub-region context diet** (push 42.8k → ~16–24k without HARD/identity loss)                                          | All                                | Smaller prefix = cheaper writes + smaller cold cost; not a hit-rate lever per se                                     | Med (instruction-following)               | `classifyContextRegions` `system-prompt.ts:174`                                                                                                                               |
| 6     | GLM provider pin (cost/ctx/reliability)                                                                                | Low (deep fallback)                | none (GLM can't cache)                                                                                               | Low                                       | already specced in `PLAN-tier2-cache-optimization.md`                                                                                                                         |

**Lever 1 is the headline.** It is the only change that moves the dominant-volume path from _no cache_ to _cached_. Everything else either makes that measurable (Lever 2), keeps it warm (Lever 3), or protects it (Lever 4).

---

## 5. TTL strategy (1 h vs 5 m, keepalive, never-write-unread)

Principles, mapped to surfaces:

- **Default 5 m (short)** for rapid, bursty internal Slack threads where the next turn lands within minutes (p50 gap is ~9 min, so even here 5 m frequently expires — see below).
- **1 h (long)** ONLY for surfaces that satisfy _both_: (a) a large stable prefix worth the 1.25× write premium, and (b) realistic reuse within the hour. Opus turns and long-lived account sessions qualify; one-shot crons do not.
- **Never write a cache you won't read:** before emitting a write-premium marker (Anthropic/Gemini-marker rung), gate on "is this session likely to issue another same-prefix call within the TTL?" The signal already exists — `readLastCacheTtlTimestamp` (`cache-ttl.ts:78`) + `contextPruning.mode:"cache-ttl"` track last cache touch. Extend that to suppress the long-TTL marker on detected one-shot/terminal turns.
- **Warm-keepalive for active sessions:** the live `contextPruning.ttl:"4m30s"` (just under the 5 m ephemeral) already trims context right before TTL expiry to preserve the prefix; align any new write-TTL with this (write 1 h when the session is active, let it lapse when idle). Critically: **the 5 m ephemeral is mismatched to the 9 min median gap** — for any surface we choose to cache, prefer 1 h or pair 5 m with active keepalive, otherwise we pay writes that expire before the next turn (exactly the `…668989` waste).

Decision table:

| Surface                               | Write markers?                       | TTL             | Rationale                                         |
| ------------------------------------- | ------------------------------------ | --------------- | ------------------------------------------------- |
| Account/customer Slack (active, deep) | yes (Anthropic + Gemini once merged) | 1 h             | large prefix, multi-turn within hour              |
| Internal dev bursts                   | yes                                  | 5 m + keepalive | sub-5-min bursts; keepalive covers the 9-min tail |
| One-shot cron / terminal turn         | **no write-premium**                 | n/a             | no second read → don't pay write                  |
| Tail fallbacks (GLM/Grok)             | n/a                                  | n/a             | no cache mechanism                                |

---

## 6. Context-window half: pushing 42.8k → 16–24k safely

`contextBudget.targetBand {16000,32000}` is live and `maxAssembledTokens:32000` is enforced (`context-budget.ts`), so the **assembled** prompt is already bounded. The remaining stable-prefix reduction:

- **Sub-region classification.** Today a whole heading-region is inlined if it contains _one_ protected line (`classifyContextRegions`, `system-prompt.ts:174`). Change the unit from "region" to "line-run": inline only the protected line(s) + minimal surrounding context, pointer the non-protected prose within the same region. Keep the fail-closed `assertProtectedLinesPresent` throw (`:296`) so no HARD/identity line can ever be dropped. Est. 42.8k → ~20–24k.
- This is a Lever-1 refinement under the **existing** `projectContextOptimization` flag — no new flag, gated by the golden-prompt suite (`prompt-invariants.test.ts`, `system-prompt.golden.test.ts`).
- **Do NOT** confuse this with cache hit-rate: a smaller prefix lowers cold cost and write premium but the _percentage_ cached can stay flat. Keep the two metrics separate in the harness (§8).

HARD constraint (unchanged): the three SOUL identity truths, all `HARD` rules, and the tool-dispatch table stay inline verbatim, always.

---

## 7. Phased sequence (reuse existing scaffolding; default-OFF; build/test/measure/rollback)

Each phase: isolated worktree → change → `npm run build` (exit 0; the pre-existing `build:plugin-sdk:dts` failure on `manager.core.ts`/`socket-adapter.ts` is NOT a regression, confirm it reproduces on `main`) → targeted vitest → enable flag on ONE canary surface → re-measure from JSONL with the §8 harness → roll forward or revert flag.

### Phase A — Measurement integrity (P0; do FIRST; telemetry-only, zero behavior change)

1. **P0-A merge the two rows.** Make `logTokenUsageRecord` and `logPromptInstrumentationRecord` emit **one** record per turn (or tag each with a `kind:"usage"|"report"` discriminator and a shared `turnId`) so analysis never double-counts `promptTokens`. Touch points: `session-usage.ts:217` + `:247`, `token-usage-log.ts:117/140`.
2. **P0-B fix `cacheRead` provenance.** Stop emitting a carried-forward constant. Source `cacheRead`/`cacheWrite` strictly from the **live** `currentAttemptAssistant.usage` for THIS call (`attempt.ts:3589`, normalized `model.ts:204`); when the provider returns no cache field, emit `cacheRead:0` (or `null`), never the previous turn's value. Audit `derivePromptTokens` (`usage.ts:207`) so `promptTokens` is the provider's `prompt_tokens` when available, not `input+cacheRead+cacheWrite` with a stale `cacheRead`. Add a unit test asserting `cacheRead` varies by provider and is 0 on a synthetic no-cache response.
3. Gate behind the existing `observability.promptInstrumentation.enabled`. Acceptance: replay shows `cacheRead` is no longer a single constant; per-model values differ; cold/16h-gap calls read ~0.

### Phase B — Lever 1: Gemini-OpenRouter markers (highest leverage)

- Merge `feat/gemini-openrouter-cache-20260629` (adds `isOpenRouterGoogleCacheEligible` + `googleMarkers` + `experimental.openRouterGoogleCache:"off"` default). Verify no Anthropic-path behavior change (branch already adds tests in `prompt-cache-retention.test.ts`, `proxy-stream-wrappers.test.ts`).
- Enable `experimental.openRouterGoogleCache:"on"` on **one canary Slack channel** only. Re-measure: Gemini rows should now show `cacheWrite>0` on cold turns and a real (non-21443, provider-reported) `cacheRead>0` on warm turns. Roll fleet-wide only after the harness confirms Gemini hit-rate climbed on the canary with no quality regression.
- Coordinate egress allowlist exactly as `PLAN-tier2-cache-optimization.md` Finding E requires (cache_control must not leak onto GLM/Grok bodies).

### Phase C — Lever 3: TTL strategy

- Thread the "never write unread" gate into `createOpenRouterSystemCacheWrapper` (`proxy-stream-wrappers.ts:165-200`) using `readLastCacheTtlTimestamp` + terminal-turn detection. Set per-surface TTL per §5 table via the already-existing `cacheRetention` resolution (`resolveOpenRouterCacheRetention`).
- Align write-TTL with `contextPruning.ttl` keepalive. Default conservative (short + no write on one-shots). Re-measure write/read ratio: target `cacheWrite` only on turns followed by a same-prefix read within TTL.

### Phase D — Lever 4 + Lever 5: prefix-stability guard + sub-region diet

- Add/extend the golden byte-identical prefix test (Phase-1 Lever 6) so any diet change is provably prefix-stable.
- Implement sub-region (line-run) classification in `classifyContextRegions` behind the existing `projectContextOptimization` flag; gate on `prompt-invariants.test.ts` + `system-prompt.golden.test.ts` + the instruction-following harness. Target prefix 42.8k → ~20–24k.

### Phase E — cleanup

- Assess the two stale branches `feat/gemini-cache-telemetry-20260528` and `feat/prompt-caching-anthropic-breakpoints`: both diff as **net-negative against current `main`** (they delete files that main now has — they predate merged work). **Do not merge as-is**; cherry-pick only any telemetry ideas not already in `main`, otherwise close them.

---

## 8. Measurement harness spec (repeatable; the thing that makes "did it go up" provable)

Deliver `scripts/cache-hitrate-report.mjs` (or `.py`) with these guarantees:

1. **De-dupe first (defends against P0-A):** read the JSONL, keep only rows with a `cacheRead` field (`USAGE_ONLY`), OR—after Phase A—group by `turnId` and take one merged record per turn. Never sum `promptTokens` across both shapes.
2. **Integrity assertions (defends against P0-B):** fail loudly if `cacheRead` has only one distinct non-zero value across ≥2 providers, or if any `cacheRead>0` appears on a row whose inter-call gap exceeds the configured TTL, or if `promptTokens != providerPromptTokens` when the provider field is present. These three checks would have caught the 21443 artifact immediately.
3. **Outputs:**
   - Aggregate `sum(cacheRead)/sum(promptTokens)`.
   - **Per-model** table (n, hit%, read, write, prompt) — the Gemini row is the KPI for Lever 1.
   - **Per-surface** (group by `sessionKey` prefix: account Slack vs internal vs cron/subagent).
   - **Bucket** split: cold (first-in-session) / warm-within-TTL / warm-expired, by inter-call gap vs the configured TTL.
   - **Write efficiency:** `sum(cacheRead)/sum(cacheWrite)` (writes that were never read = waste) and count of "wrote then no read within TTL" events.
   - **Context series:** p50/p99 `promptTokens`, `projectContextChars`, `lastCallInput` (from `REPORT_ONLY` rows joined by turn) — keeps the context-window metric separate from the cache metric.
4. **Usage:** `node scripts/cache-hitrate-report.mjs --date 2026-06-30 [--since … --baseline …]`, prints a before/after delta vs a saved baseline so each phase's effect is a number, not a vibe.

Reference values to reproduce today (so the harness is validated against this analysis): 06-29 aggregate 34.7%, Gemini 35.6%/n=111, distinct `cacheRead`={21443,0}, p50 gap 538 s.

---

## 9. Honest risk register / what I could NOT verify from here

- **Whether OpenRouter actually returns `cached_tokens` for Gemini once markers are sent** — the branch claims a live cold/warm probe confirmed ~91% savings; re-confirm on the canary with the fixed harness before fleet rollout.
- **The exact source of the 21443 constant** — I traced it to a carried-forward `lastCallUsage`/session-entry value rather than live provider usage, but pinning the precise line requires a live instrumented turn (read-only static reading is consistent with this but cannot prove the runtime path). Phase A must confirm by instrumentation, not assumption.
- **Anthropic-direct vs OpenRouter for Opus** — Opus is the only model writing cache today; its 5 m ephemeral + cross-model prefix sharing with Gemini is why its writes go unread. Lever 1 (Gemini also caching) plus the TTL gate together fix this, but the interaction needs canary measurement.

**Net recommendation:** Phase A (measurement) and Phase B (Gemini markers) are the two changes that matter; do them in that order. Do not report any hit-rate improvement until the harness's integrity assertions pass.
