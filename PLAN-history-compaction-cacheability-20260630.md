# History Compaction + Cacheability Re-Architecture — Phased Plan (2026-06-30)

**Author:** Tier-1 perf/arch subagent · **Status:** PLAN ONLY (no code/flags changed this turn)
**Repo:** `/home/miles/projects/openclaw-fork` @ `main` (`454e3f8a8f`)
**Builds on:** `CACHE-CONTEXT-MASTER-PLAN-20260629.md` (measurement + prefix/system levers) and
`CACHE-OPTIMIZATION-PLAN.md` (Anthropic phased). This plan owns the **history half** those two
deferred. It does NOT re-derive measurement (P0-A/P0-B already landed — see §0.3).

---

## 0. Executive summary

Chat **history is ~71% of every call (~43.7k of ~61.4k mean tok) and is 100% uncached on every
serving path today** — the `cache_control` machinery only ever marks the system prefix and the last
tool definition; it never marks a single `user`/`assistant`/`toolResult` block (verified:
`anthropic-payload-policy.ts:344-405` iterates messages only to _strip_ thinking markers, never to
add a caching breakpoint). So the entire lever the prior plans chased (prefix caching) tops out at
the ~29% static envelope; the other ~71% is re-billed fresh forever. The win is to (1) **compact the
fat tool I/O deterministically** (tool results ~29% + tool-call args ~16% = ~45% of the whole call,
the dominant mass), and (2) **re-segment history into a FROZEN / WARM / LIVE layering** whose FROZEN
and WARM bytes are stable turn-to-turn so a third (and fourth) cache breakpoint can be placed _inside
the messages array_, pulling the bulk of history from `fresh` into `cacheRead`. The hard constraint
that reconciles "aggressive compaction" with "max caching": **any byte that has been cached must
never change again** — so compaction must be _freeze-and-append_ (compact the oldest chunk once,
persist it, never recompute it), not the current _sliding-window re-digest_ (which silently rewrites
history bytes every turn and would bust any history cache we add). The single most important code
fact driving this whole plan: the live `historyOptimization.digestOldToolResults` is **already ON**
but is **cache-hostile** because its cutoff slides (`resolveDigestCutoffIndex`,
`context-budget.ts:184` anchors to `userIndexes.length - keepRawTurns`), so the raw↔digest boundary
moves forward every turn. We must convert that to an append-only frozen segment before we can cache
history at all.

### Impact-ranked lever table (highest measured token mass first)

| #      | Lever                                                                                               | Mass today                                    | What it does                                                                              | Cacheable after?                                        | Risk                |
| ------ | --------------------------------------------------------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------- |
| **L1** | **Freeze-and-append tool-result compaction** (replace sliding digest)                               | tool results **~29%** (~17.8k tok/call)       | compact oldest tool results ONCE into an append-only FROZEN block; keep N recent verbatim | ✅ frozen bytes stable → cacheable                      | Med                 |
| **L2** | **History cache breakpoints #3/#4** (mark end-of-FROZEN + last-stable-WARM in the messages array)   | unlocks caching of **~50–65%** of history     | adds the actual `cache_control` markers history never gets today                          | ✅ this is the caching itself                           | Med-High (per-path) |
| **L3** | **Tool-call args compaction** (assistant `toolCall.input`)                                          | **~16%** (~9.8k tok/call)                     | freeze/stub older call args alongside their results                                       | ✅ same frozen segment                                  | Med                 |
| **L4** | **Compaction-before-drop** (replace lossy IMP-042 drop-floor)                                       | prevents silent loss; recovers droppable mass | summarize-then-freeze instead of `slice()`-delete oldest turns                            | ✅ summary is frozen+cached                             | Med                 |
| **L5** | **Freeze-time thinking eviction** (evict once at freeze, not every call)                            | assistant thinking **~13%** (~8k tok)         | bake thinking-free bytes into FROZEN; stop per-call re-eviction churn                     | ✅ removes a per-call cache-bust on rolling-cache paths | Low-Med             |
| **L6** | **Per-path breakpoint strategy table** (Gemini-prefix-only vs Anthropic-4bp vs direct-Opus-rolling) | correctness gate on L2                        | ensures L2 markers actually cache on each path and don't go net-negative                  | n/a (enabler)                                           | Med                 |

**Net target:** move the FROZEN+WARM portion of history (~50–65% of ~43.7k ≈ **22–28k tok/call**) from
`fresh` into `cacheRead`. At Anthropic read pricing (~0.1× input) that is a ~90% cost cut on that
slice; at Gemini-marker read pricing (~0.25× effective per the 06-29 branch probe) ~75%. Combined
with the already-landed prefix caching, this is the difference between caching ~29% of a call and
caching ~75–85% of it.

---

## 0.1 What in the skeleton the code CONTRADICTS (read this before the phases)

1. **"Prest0-Mode injects cache_control on (c) the last stable turn."** ❌ **False.**
   `applyPrest0ModeCacheBreakpoints` (`functions/src/prest0nVm/fleetModelProxy.ts:161-265`) injects
   exactly TWO breakpoints: (a) the last `system`/`developer` block (honoring the boundary split) and
   (b) the last tool definition. **There is no history/turn breakpoint anywhere.** Same for the
   in-runtime OpenRouter path (`applyAnthropicEphemeralCacheControlMarkers`,
   `anthropic-payload-policy.ts:344`). So "advance breakpoint #3 / keep breakpoint #4 on last WARM
   turn" is **net-new code that places markers in the messages array**, not a re-placement of
   existing ones. This is L2 and is the riskiest, highest-value change.

2. **"~2 breakpoints in reserve."** ✅ Correct, and that reserve is exactly what L2 spends:
   today system(1) + last-tool(1) = 2 used of Anthropic's 4. L2 spends #3 (end-of-FROZEN) and #4
   (last-stable-WARM). After L2 we are at the 4-breakpoint ceiling — no room left, which constrains
   future designs (see open question Q4).

3. **"digestOldToolResults keeps current tool-turn raw, strips older — and is cache-safe."** ❌ The
   existing digest is **NOT cache-safe** and is already ON in prod. `resolveDigestCutoffIndex`
   (`context-budget.ts:184`) computes the cutoff as `userIndexes[len - keepRawTurns]` — anchored to
   the _end_ of the conversation. Every new user turn shifts the cutoff forward by one turn, so a
   tool result that was raw (and potentially cached) on turn T becomes digested on turn T+1 → its
   bytes change → any cache breakpoint at or before it is invalidated. It also persists the digest
   back into `activeSession.agent.state.messages` (`attempt.ts:3196`) AND is **non-idempotent on
   re-scan** (a digested `toolResult` keeps `role:"toolResult"`, so the next call re-extracts its
   text via `getMessageText` and re-digests the already-compacted JSON). **This is the single thing
   that must change to a frozen append-only model (L1) before any history caching is possible.**

4. **"Thinking eviction shouldPreserveThinkingBlocks gates BOTH windowed eviction AND full-strip."**
   ✅ Correct and confirmed overloaded: the predicate `shouldPreserveThinkingBlocks`
   (`provider-replay-helpers.ts:83`) feeds (i) `evictionSafe` for the windowed
   `dropReasoningFromHistory` plan (`attempt.ts:1501`) AND (ii) the `dropThinkingBlocks` full-strip
   decision (`provider-replay-helpers.ts:119/126`, `transcript-policy.ts:122`). One predicate, two
   very different mechanisms; a change to it moves both. L5 decouples this.

5. **"Gemini markers cache system+tools prefix; frozen history block must sit in the cacheable
   prefix region."** ✅ Correct _and a hard constraint_: the Gemini-via-OpenRouter path reuses the
   exact same `applyAnthropicEphemeralCacheControlMarkers` marking (system boundary split + last
   tool), and Gemini's cache is **prefix-contiguous** — whether OpenRouter→Google honors a 3rd/4th
   `cache_control` breakpoint _inside the messages array_ for Gemini is **unverified** (open
   question Q1). If it does not, L2 only helps the Anthropic/Opus paths and Gemini stays
   prefix-only. This is why L6 (per-path) gates L2 rollout.

6. **"drop-floor is lossy."** ✅ Confirmed: the budget guard's reduction loop is pure
   `currentMessages.slice(...)` deletion of the oldest turn (`context-budget.ts:~600`) with only a
   most-recent-turn floor; no summarization happens there. The separate compaction machinery
   (`compaction.ts summarizeInStages`, `compaction-successor-transcript.ts`) is a _different_ trigger
   path. L4 inserts compaction-before-drop here.

---

## 0.2 Architecture map (verified file:line) — the three things that must cooperate

- **History assembly + budget guard:** `applyContextBudgetGuard` (`context-budget.ts:515`), called at
  `attempt.ts:3144` (live path) and `compact.ts:1161` (compaction path). Order today:
  age-out-images → digestOldToolResults (sliding) → drop-oldest loop. Result is written back to
  `activeSession.agent.state.messages` (`attempt.ts:3196`) → **persisted**, so frozen segments would
  survive across turns if we make them append-only.
- **Stream-time sanitizers (in-memory, NOT persisted):** the `streamFn` wrapper at
  `attempt.ts:2086-2130` applies `dropReasoningFromHistory` / `dropThinkingBlocks` per outbound
  request; on-disk transcript keeps thinking. This is where windowed thinking eviction lives.
- **Cache marker injection (egress):**
  - OpenRouter (Gemini + Anthropic refs): `createOpenRouterSystemCacheWrapper`
    (`proxy-stream-wrappers.ts:201`) → `applyAnthropicEphemeralCacheControlMarkers`
    (`anthropic-payload-policy.ts:344`). Marks system(boundary-split) + last tool only.
  - Anthropic-direct: `applyAnthropicPayloadPolicyToParams` (`anthropic-payload-policy.ts:200`).
  - Prest0-Mode (Gemini→Opus rewrite at egress): `applyPrest0ModeCacheBreakpoints`
    (`fleetModelProxy.ts:161`). Marks system + last tool only.
  - **None of these touch history blocks.** L2 must extend all three (or a shared helper) to mark a
    frozen-history boundary block + a last-stable-WARM block.

## 0.3 Already-landed prerequisites (do NOT redo)

- **P0-A/P0-B telemetry fixes are merged** (`454e3f8a8f "fix cache telemetry to use only live
per-call usage"`). `sanitizePerCallCacheUsage` (`usage.ts:222`) now zeroes a `cacheRead` that
  exceeds `promptTokens` (kills the 21443-constant artifact), and per-call usage is sourced live.
  This plan's verification (§ per-phase) depends on that fix being real — re-confirm distinct
  per-provider `cacheRead` values before trusting any before/after delta.
- **Gemini OpenRouter markers + thinking eviction are ON in live config**
  (`experimental.openRouterGoogleCache:"on"`, `thinkingEviction:"on"`,
  `historyOptimization.digestOldToolResults:true`). So Phase 0 here is NOT "turn on a flag" — it is
  "make the already-on digest cache-safe."

---

## Phase 0 — Stabilize the existing digest (make it cache-neutral) + segment model

**Objective:** stop the live sliding digest from rewriting history bytes every turn, and introduce
the FROZEN/WARM/LIVE segment abstraction that every later phase builds on. No new caching yet —
purely make history _byte-stable_ so caching becomes possible.

- **Code touch-points:**
  - `src/agents/pi-embedded-runner/run/context-budget.ts` — `resolveDigestCutoffIndex` (:184),
    `digestOldToolResultsWithStats` (:206), `digestToolResultText` (:138).
  - New module `src/agents/pi-embedded-runner/run/history-segments.ts` exporting
    `segmentHistory(messages, { warmTurns, frozenMarkerKey }): { frozen, warm, live }` (pure).
  - Config: `AgentHistoryOptimizationConfig` (`types.agent-defaults.ts:552`) — add
    `freezeMode?: "off" | "sliding" | "frozen"` (default `"sliding"` = today's exact behavior;
    new `"frozen"` = append-only).
- **Mechanism:** when `freezeMode:"frozen"`, anchor the digest cutoff to an **absolute, persisted
  watermark** (a custom session entry `openclaw.history-frozen-watermark` storing the message index /
  turn id up to which freezing has occurred), NOT to `len - keepRawTurns`. Freezing only ever
  _advances_ the watermark and only digests messages strictly below it. A message at index < watermark
  is byte-frozen forever; a digested `toolResult` is re-tagged (e.g. `role` retained but a
  `frozen:true` marker + `type:"text"` content) so the non-idempotent re-scan in (0.1#3) can early-out.
- **Cache-safety argument:** with an absolute watermark, the bytes of every message below it are
  written exactly once and never recomputed. The raw↔frozen transition index only moves _forward_ and
  only when WARM exceeds threshold — it never moves backward and never rewrites an already-frozen
  message. That is the byte-stability precondition for placing a cache breakpoint at the frozen
  boundary (Phase 2).
- **Impact:** 0 token change vs today (same compaction ratio), but converts the digest from
  cache-hostile to cache-neutral. Unblocks L1/L2.
- **Risk/reversibility:** `freezeMode` defaults to `"sliding"` → byte-identical to current prod. Flip
  to `"frozen"` per-surface. Fully reversible by flag.
- **Test/verify:** vitest `context-budget.frozen-watermark.test.ts`: (a) `"sliding"` → output
  identical to today; (b) `"frozen"` → digesting on turn T+1 leaves every message below the turn-T
  watermark byte-identical (assert `JSON.stringify` equality of the frozen slice across two
  successive guard runs); (c) watermark monotonically increases. No live model needed.
- **Dependencies:** none. Must land first.

---

## Phase 1 — Freeze-and-append tool-result + tool-call-args compaction (L1 + L3)

**Objective:** capture the dominant mass (tool results ~29% + call args ~16% ≈ 45% of the call) into
the append-only FROZEN block deterministically.

- **Code touch-points:** `context-budget.ts` `digestToolResultText` (:138) + a new
  `digestToolCallArgs` sibling; the assistant-block branch in `digestOldToolResultsWithStats`
  (:262-300) already walks `tool_use`/`tool-result` blocks — extend it to also compact
  `toolCall`/`tool_use` **input/args** on frozen (below-watermark) turns.
- **Mechanism:** for below-watermark turns, replace each fat tool result with the existing compact
  stub `{tool, argsHash, outcome, keyFacts, idsPreserved}` (deterministic: sha1 of stable
  `toolCallId`, deterministic truncation via `truncateToolResultText`) — already implemented and
  identifier-preserving. **Add** an analogous deterministic stub for assistant `toolCall.input`
  (preserve the call name + a hashed/elided args summary + any IDs). Keep the **N most-recent
  (WARM) turns verbatim** (the live working set). Critically: because the watermark is absolute
  (Phase 0), each result/args is compacted **once at freeze time** and the bytes never change again.
- **Cache-safety argument:** `digestToolResultText` is already pure + deterministic given (text,
  toolCallId, maxChars). With the frozen watermark, the inputs to each digest are fixed at freeze
  time, so the output bytes are written once → cacheable. The non-idempotency hazard from (0.1#3) is
  closed by Phase 0's `frozen:true` early-out.
- **Impact (ranked #1 + #3):** the biggest single reclamation. If ~60% of tool-result mass is older
  than the WARM window, that is ~10–11k tok/call moved from verbatim to ~stub, AND made cacheable.
  Call-args adds ~5–6k tok. Net history shrink ~15k tok/call _before_ caching, then the residual
  frozen stubs cache at read pricing.
- **Risk/reversibility:** Med — over-aggressive args compaction could elide a value a later turn
  needs. Mitigation: `idsPreserved` already keeps paths/IDs/URLs/case-numbers verbatim
  (`collectIdentifiers`, :126); mirror `compaction.identifier-preservation.test.ts`. Gated by
  `freezeMode:"frozen"` + a new `compactToolCallArgs?: boolean` (default false). Reversible by flag.
- **Test/verify:** extend `context-budget.history-digest.test.ts`: (a) flag OFF → identical; (b) ON →
  a follow-up turn referencing an ID/path from a frozen tool result still finds it verbatim in
  `idsPreserved`; (c) WARM N turns untouched; (d) freezing twice yields identical frozen bytes
  (idempotence). Live: replay a long Slack thread, confirm `historyBeforeChars/afterChars` diagnostic
  shows the expected shrink with no broken tool-reference follow-ups.
- **Dependencies:** Phase 0.

---

## Phase 2 — Place history cache breakpoints #3 (end-of-FROZEN) and #4 (last-stable-WARM) (L2)

**Objective:** the actual caching of history — add the `cache_control` markers history has never had.

- **Code touch-points (all three marker paths, ideally via one shared helper):**
  - `src/agents/anthropic-payload-policy.ts` `applyAnthropicEphemeralCacheControlMarkers` (:344) —
    after the existing system+last-tool marking, also mark (a) the **last block of the last FROZEN
    message** and (b) the **last block of the last stable WARM message** with `cache_control`.
  - `functions/src/prest0nVm/fleetModelProxy.ts` `applyPrest0ModeCacheBreakpoints` (:161) — mirror
    the same two history breakpoints on the Opus-egress body.
  - Anthropic-direct: `applyAnthropicPayloadPolicyToParams` (:200) for the direct-Opus subagent path.
  - The "which message index is the FROZEN boundary / last-stable-WARM" must be threaded from the
    Phase-0 watermark into the payload patcher (e.g. via a context field on `streamWithPayloadPatch`).
- **Mechanism / breakpoint budget:** Anthropic allows 4. Today: [1] system-stable-prefix, [2]
  last-tool. Add [3] = end-of-FROZEN block, [4] = last-stable-WARM block. The **LIVE tail** (current
  turn) stays after [4] uncached (it changes every turn — correct). This fully spends the 4-breakpoint
  budget (0.1#2).
- **Cache-safety argument:** breakpoint [3] sits on frozen, append-only bytes (Phase 0/1) → cache
  write happens once, every later call is a read. Breakpoint [4] sits on the _last stable WARM turn_
  (a completed turn that will not be edited again) — it advances only when a WARM turn graduates, and
  when it advances the bytes below it were already stable, so the new write extends the cached
  region rather than invalidating it. The volatile LIVE tail is intentionally left after [4].
- **Per-serving-path strategy (this is L6, the correctness gate):**

  | Path                                            | Cache shape                                                | Where the frozen-history breakpoint must sit                                                                                                                                  | Action                                                                                |
  | ----------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
  | **Anthropic via OpenRouter / Prest0-Mode Opus** | explicit, 4 breakpoints, non-prefix-contiguous OK          | breakpoints [3]+[4] inside messages array work directly                                                                                                                       | full L2                                                                               |
  | **direct-Opus subagent**                        | rolling whole-history cache (thinking preserved)           | already caches incrementally; adding [3]/[4] is **belt-and-suspenders** but compaction here is **net-negative** if it edits already-rolling-cached bytes                      | **measure before enabling**; likely keep compaction OFF for direct-Opus, markers only |
  | **Gemini via OpenRouter**                       | **prefix-contiguous** (caches up to a marker, prefix only) | the FROZEN block must be **physically contiguous with the cached prefix**, i.e. immediately after system+tools, OR Gemini must honor an in-array breakpoint (UNVERIFIED — Q1) | gate L2-for-Gemini behind a canary probe                                              |
  | **GPT-mini / Grok / GLM**                       | implicit / none                                            | no marker action; history caching only via prefix stability (GPT-mini auto) or not at all (Grok/GLM)                                                                          | no-op; rely on L1 shrink only                                                         |

- **Impact (ranked #2):** this is where the ~22–28k tok/call moves from `fresh` to `cacheRead`.
  Highest _cache-hit-rate_ lever; depends entirely on Phase 0/1 having made the bytes stable.
- **Risk/reversibility:** **Med-High** — a mis-placed marker on a byte that later changes silently
  busts cache (no error, just cost). And on Claude 4.5+, a marker on a `thinking` block 400s
  (signature) — the code already guards this (`record.type !== "thinking"` at
  `anthropic-payload-policy.ts:387`); preserve that guard. Gate behind
  `experimental.historyCacheBreakpoints:"off"|"shadow"|"on"` (mirror `thinkingEviction`'s tri-state);
  `"shadow"` computes+logs the intended breakpoint indices without emitting them.
- **Test/verify:** vitest asserting [3]/[4] land on the correct (frozen / last-WARM) message and
  never on a thinking block; byte-stability test that the marked frozen block is identical across two
  turns. **Live proof (the real gate):** OpenRouter `/generation` `native_tokens_cached` +
  `cache_discount` on a warm repeat must show cached tokens climb by ~the frozen+WARM size on a canary
  Slack thread, per provider. Do NOT claim a win without this number per path.
- **Dependencies:** Phase 0 + Phase 1. Roll out path-by-path per the L6 table; Gemini last (pending Q1).

---

## Phase 3 — Freeze-time thinking eviction + decouple the overloaded gate (L5)

**Objective:** stop re-evicting thinking every call; bake thinking-free bytes into FROZEN once so the
frozen block is stable, and split the overloaded `shouldPreserveThinkingBlocks` so the safe windowed
eviction and the dangerous full-strip are independently controllable.

- **Code touch-points:** `provider-replay-helpers.ts:83` (`shouldPreserveThinkingBlocks`),
  `attempt.ts:1501` (`evictionSafe`), `transcript-policy.ts:122`, the stream wrapper at
  `attempt.ts:2086-2130`, and Phase-0's freeze step in `context-budget.ts`.
- **Mechanism:** (1) At **freeze time** (when a turn crosses the watermark), strip thinking from that
  turn _once_ and persist the thinking-free frozen bytes — so the per-call stream-time
  `dropReasoningFromHistory` no longer needs to touch frozen turns (it keeps operating only on the
  WARM/LIVE window where it is cheap and the current-tool-turn-reasoning rule
  `shouldPreserveCurrentToolTurnReasoning` (`thinking.ts`) still applies). (2) **Split the gate**:
  introduce two predicates — `isWindowedEvictionSafe(modelId)` (governs `dropReasoningFromHistory`)
  and `isFullStripRequired(modelId)` (governs `dropThinkingBlocks`) — so Claude 4.5+ keeps
  full-strip OFF (signature validation) while still allowing freeze-time eviction on non-Claude
  paths. Keep `shouldPreserveThinkingBlocks` as a thin back-compat shim.
- **Cache-safety argument:** on rolling-cache Claude this is a _no-op for thinking_ (we must NOT strip
  — preserved), so it only changes non-Claude paths where thinking is already evicted; doing it once at
  freeze removes the per-call churn that, on any path that caches history, would rewrite the frozen
  bytes and bust [3]. Net: frozen bytes are thinking-resolved and stable.
- **Impact (ranked #5):** assistant thinking ~13% (~8k tok). On Gemini/gpt-mini/grok it's already
  evicted windowed; the gain here is _cache stability_ of the frozen block, not new token savings.
- **Risk/reversibility:** Low-Med. The decoupling is the only structural change; gate the freeze-time
  eviction behind the same `freezeMode`. The full-strip predicate must remain conservative (Claude
  4.5+ never stripped) to avoid the 400 signature errors.
- **Test/verify:** unit tests that (a) Claude-opus-latest → `isFullStripRequired===false`,
  `isWindowedEvictionSafe===false` (preserve), (b) gemini → windowed-safe true, (c) freeze-time
  eviction produces thinking-free frozen bytes that are stable across turns. Live: confirm no
  `thinking ... cannot be modified` 400s on the Opus path after enabling.
- **Dependencies:** Phase 0 (watermark). Independent of Phase 2 but complements it.

---

## Phase 4 — Compaction-before-drop: replace the lossy IMP-042 drop-floor (L4)

**Objective:** when a thread exceeds the budget (the ~135k/213-msg case), summarize-then-freeze the
oldest turns instead of silently `slice()`-deleting them — and make that summary cacheable.

- **Code touch-points:** the reduction loop in `applyContextBudgetGuard` (`context-budget.ts:~595`,
  the `currentMessages.slice(Math.min(dropCount, maxDropCount))` deletion); reuse the existing
  summarizer `summarizeInStages` / `summarizeWithFallback` (`compaction.ts:466/402`) and the
  successor-transcript writer (`compaction-successor-transcript.ts`).
- **Mechanism:** before the pure-deletion drop, if `historyOptimization.compactBeforeDrop===true`,
  invoke a **one-shot deterministic-persisted** summarization of the oldest droppable turns: run the
  LLM summarizer ONCE, persist the summary as a frozen synthetic turn (append-only, below the
  watermark), and replace the dropped raw turns with it. The summary is generated once and reused
  byte-identically forever (never re-summarized live) — same determinism rule as L1.
- **Cache-safety argument:** the summary becomes part of the FROZEN block and is covered by
  breakpoint [3]. Because it is generated once and persisted (not recomputed per call), it does not
  bust cache. This is the key reconciliation: **LLM summarization is allowed, but only once per
  segment, persisted, and reused** — never the naive per-call re-summarize that would bust cache
  every turn.
- **Impact (ranked #4):** converts catastrophic silent context loss (IMP-042) into bounded,
  cacheable summaries; recovers the droppable mass as a small frozen summary instead of a hard delete.
- **Risk/reversibility:** Med — summarization is non-deterministic _at generation time_ (run once), so
  the same thread compacted on two different machines could differ; acceptable because each session's
  summary is persisted per-session. Gate `compactBeforeDrop` default false. The existing
  compaction-safeguard quality gates (`compaction-safeguard-quality.ts`) apply.
- **Test/verify:** synthetic 135k-token thread → assert no raw turn is `slice`-deleted without a
  persisted summary covering it; assert the summary turn is frozen (below watermark) and byte-stable
  on the next call; assert most-recent user turn floor still holds. Live: re-run the IMP-042
  reproduction thread; confirm no mid-thread answer references a now-missing fact.
- **Dependencies:** Phase 0 (watermark/freeze) + Phase 1 (frozen block exists to append into).

---

## Phase 5 — Measurement, rollout sequencing, cleanup

- **Extend the §8 harness** from `CACHE-CONTEXT-MASTER-PLAN-20260629.md` (`scripts/cache-hitrate-
report.mjs`) with **history-specific KPIs**: per-call `historyBeforeChars/afterChars` (already
  emitted via `context.history.digested`), frozen-vs-warm-vs-live token split, and — the headline —
  `cacheRead` attributable to history breakpoints (compare warm-repeat `native_tokens_cached` before
  vs after Phase 2 per path). Integrity assertions stay (distinct per-provider `cacheRead`; no read on
  a gap > TTL).
- **Rollout order:** Phase 0 → 1 → (3) → 2-on-Anthropic-canary → measure → 2-on-Prest0-Opus →
  measure → 2-on-Gemini (only if Q1 resolves yes) → 4. Each behind its own flag, default-OFF, one
  canary Slack channel first, fleet only after the live `/generation` number confirms the slice moved
  from fresh→cacheRead with no quality/instruction-following regression.
- **Cleanup:** once `freezeMode:"frozen"` is proven, deprecate the `"sliding"` digest path (it is
  cache-hostile and should not be the long-term default).

---

## Open design questions needing a Miles decision

- **Q1 (blocks L2-for-Gemini):** Does OpenRouter→Google honor a `cache_control` breakpoint placed
  _inside the messages array_ (not just the system/tools prefix)? If Gemini caching is strictly
  prefix-contiguous, history caching for the dominant-volume path requires either (a) physically
  relocating the frozen block adjacent to the prefix (large re-architecture, risks turn-ordering
  validation in `provider-replay-helpers.ts`), or (b) accepting that Gemini gets L1 shrink only, no
  history caching. **Needs a live cold/warm probe with `native_tokens_cached` before committing.**
- **Q2:** WARM window size (`keepRawTurns`/`warmTurns`) — bigger WARM = more verbatim working set
  (better model quality, more fresh tokens) vs smaller WARM = more frozen/cached (cheaper, risk of
  over-compaction hurting multi-turn reasoning). Current default 3. Tune per surface?
- **Q3:** Direct-Opus subagent path — do we add [3]/[4] markers there at all, or rely on its rolling
  whole-history cache and keep history compaction OFF for it (since editing rolling-cached bytes is
  net-negative)? Recommend measure-then-decide.
- **Q4:** With L2 spending all 4 Anthropic breakpoints, we have zero reserve. If a future need arises
  (e.g. a 5th logical segment), we must merge segments. Accept the 4-breakpoint ceiling?
- **Q5:** Summary determinism (L4) — persisted-per-session is fine, but cross-session reproducibility
  is lost. Acceptable, or do we need a deterministic (non-LLM) extractive fallback for the frozen
  summary?

---

## HARD-rule / safety interactions (call-outs)

- **Bootstrap budget cap:** unaffected — this plan touches _history_ (messages array), not the
  bootstrap/system prefix. `bootstrapMaxChars`/`bootstrapTotalMaxChars` and the
  identity/HARD-inline rules are untouched. Do not let any history-segment refactor leak into the
  system-prompt assembler.
- **Full SDLC required:** every phase touches production paths (`context-budget.ts`, `attempt.ts`,
  `anthropic-payload-policy.ts`, `fleetModelProxy.ts`) → isolated worktree, `npm run build` exit 0
  (the pre-existing `build:plugin-sdk:dts` failure on `manager.core.ts`/`socket-adapter.ts` is NOT a
  regression — confirm it reproduces on `main`), targeted vitest, live `/generation` proof, PR (no
  self-merge).
- **Reversibility:** every phase is additive + flag-gated, default-OFF / default-`"sliding"` /
  default-`"off"`. With all new flags at default, history bytes are **byte-identical to current
  `main`** (the #1 acceptance gate — add a golden snapshot like Phase-3's
  `system-prompt.golden.test.ts`, but for the assembled messages array).
- **No silent context loss:** L4 is the explicit fix for IMP-042; until L4 lands, the lossy drop-floor
  remains the failure mode for >budget threads — do not advertise the budget guard as "safe" before
  Phase 4.
- **Identifier preservation:** L1/L3 must never elide a path/ID/URL/case-number — mirror
  `compaction.identifier-preservation.test.ts`; `collectIdentifiers` already does this and must stay
  in the frozen stub.

```

```
