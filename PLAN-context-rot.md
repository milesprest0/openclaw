# PLAN — In-Turn Context-Management Layer (Context Rot)

**Status:** Design/architecture only. No code changes in this document. Review gate before any implementation.
**Repo:** `/home/miles/projects/openclaw-fork` · branch `main` · HEAD `bfee32d04a`
**Author:** subagent `context-rot-plan` · for review by **Miles**

---

## 1. Problem statement + the cost-vs-rot correction

Reasoning quality degrades sharply once the **assembled per-call model input** (system prompt + bootstrap + identity/HARD rules + message history + tool outputs) climbs past roughly 16k–32k tokens. We observe this as a flat ~80k per-call ceiling on heavy multi-tool turns: a single turn loops one LLM call per tool invocation, and **each subsequent call re-sends every prior tool output verbatim**, so a 30-call debugging turn climbs ~38k→80k while a 6-call turn stays ~26–40k. This is _intra-turn accumulation_, not session-over-session growth.

**Critical correction this plan internalizes:** prompt caching (`cacheRead`) reduces _billed_ tokens only. The model still reasons over the **entire** assembled window regardless of how much was cache-read. Therefore every lever here must shrink the **real assembled prompt** (`input` + `cacheRead` combined, the full window the model sees), not the billed/`input` fraction. Cache metrics are explicitly _not_ a success signal.

---

## 2. Goal + measurable success criteria

**Goal:** keep the assembled per-call prompt in the 16–32k band on typical turns _without_ the model losing facts, decisions, file paths, or IDs established earlier in the same turn.

Two independently testable criteria (both must hold):

- **SC-1 (size):** On a synthetic multi-tool turn (≥15 tool calls, each returning a multi-KB result), the assembled per-call input — as measured by `estimateAssembledTokens` in `context-budget.ts` over `system + prompt + messages` — stays **≤ 32k tokens** on every call after warm-up, versus the current monotonic climb toward ~80k.
- **SC-2 (recall):** A concrete fact established in call 1 (e.g. a UUID, a `/abs/path`, a `DWC-1` filing date) is still present in the assembled window — verbatim — at call 15, either inline (recent raw window) or via the running-state ledger. Asserted by substring presence in the assembled messages/system text, not by a model round-trip.

Non-goals: reducing cache cost, changing model selection, touching the bootstrap diet (already shipped — see §3).

---

## 3. Current architecture (where the per-call prompt is assembled today)

**Assembly + budget enforcement entry point**

- `src/agents/pi-embedded-runner/run/attempt.ts:3107` — `applyContextBudgetGuard({ messages, cfg, contextWindowTokens, systemPrompt, prompt, promptImages })` runs in the prompt-submission path, wrapped in a `try/catch` that **fails open** to the original transcript (attempt.ts ~3110–3140). On `applied`, it writes the trimmed/digested messages back to `activeSession.agent.state.messages` (attempt.ts ~3160).

**Budget machinery** — `src/agents/pi-embedded-runner/run/context-budget.ts`

- `applyContextBudgetGuard` (line 515) pipeline, in order: `ageOutOldestInlineImages` → `digestOldToolResultsWithStats` (gated on `historyOptimization.digestOldToolResults`) → `estimateAssembledTokens` → drop-oldest-whole-turns loop until `estimatedTokens ≤ budgetBeforeReserve`, never dropping below the most recent user turn (`resolveLastUserMessageIndex`, ~drop floor log line).
- `digestToolResultText` (line ~133) already produces a compact JSON digest preserving: `tool`, `argsHash` (sha1 of `toolCallId`), `outcome` (ok/error), bounded `keyFacts`, and **`idsPreserved`** harvested by `collectIdentifiers` (URLs, abs paths, UUIDs, `XX-1234` IDs, 5+ digit numbers).
- `resolveDigestCutoffIndex` keeps the last `keepRawTurns` (default 3) user-delimited turns raw; everything older is digested.
- `resolveContextBudget` resolves the active config (live values: `maxAssembledTokens=32000`, `targetBand 16000–32000`, `reserveTokens=8000`, `keepRawTurns=3`, `oldToolResultMaxChars=2000`).

**Per-iteration tool-loop hook (the real intra-turn accumulation point)** — `src/agents/pi-embedded-runner/tool-result-context-guard.ts`

- `installToolResultContextGuard` wraps `agent.transformContext` and runs **on every loop iteration** before the next model call. Today it only: (a) truncates _individual_ tool results that individually exceed `maxSingleToolResultChars` (~50% of window), (b) runs the mid-turn precheck routing signal, (c) throws `PREEMPTIVE_CONTEXT_OVERFLOW_MESSAGE` past 90% of window.
- **Gap:** it does **not** digest the _accumulation_ of many in-window-sized results. `applyContextBudgetGuard`'s digest runs at prompt-submission, but the per-iteration `transformContext` path is where the 38k→80k climb actually happens within one attempt's loop. This is the single most important insertion point.
- The context-engine variant `installContextEngineLoopHook` already demonstrates per-iteration `afterTurn` + `assemble` on the same `transformContext` seam.

**Protected-region machinery** — `src/agents/prompt-invariants.ts`

- `extractProtectedLines` collects every line containing `HARD`, `IDENTITY-LEVEL`, `OVERRIDES`, etc., plus everything under an "identity truth" heading.
- `assertProtectedLinesPresent(assembledPrompt, protectedLines)` returns `{ ok, missing }` — the fail-closed assertion primitive.

**Project-context diet (already shipped, PR #28)** — `src/agents/system-prompt.ts`

- `buildProjectContextSection` (line ~238) + `classifyContextRegions` (line ~174): `dietToRetrieval` keeps only protected-line-bearing regions inline, pointers the rest to `memory_search`; **force-inlines `user.md` and `identity.md` whole** (line ~213). Char-level context already dropped 84,611→61,109. **Do not re-plan this; build on it.**

**On-disk persistence (re-fetch source)** — `src/trajectory/runtime.ts`

- `recordEvent("context.compiled" | "prompt.submitted", { messages, ... })` appends JSONL. **Caveat:** `truncateOversizedTrajectoryEvent` + per-file byte cap mean the trajectory is **not a guaranteed-lossless** store. The **session file** (`sessionFile` / session manager persistence) is the authoritative lossless copy and must be the re-fetch source of record.

---

## 4. Design — the three levers

> Guiding constraint (Miles): **do not overengineer.** Reuse `digestOldToolResults` / `collectIdentifiers` / `buildProjectContextSection` / `assertProtectedLinesPresent`. No new subsystems we don't need. Each sub-section calls out the gold-plating temptation and picks the simpler option.

### Lever 1 — Handle/digest substitution _inside the tool loop_ (the spike-flattener)

- **What changes:** Run the existing `digestOldToolResults` substitution **per-iteration** inside `installToolResultContextGuard`'s `transformContext`, not only at prompt-submission. Older tool results (beyond `keepRawTurns`) are replaced in the live message view by their compact digest (`tool`, `argsHash` handle, `outcome`, bounded `keyFacts`, `idsPreserved`). Recent raw window is preserved unchanged.
- **Exact integration point:** `src/agents/pi-embedded-runner/tool-result-context-guard.ts`, inside the `mutableAgent.transformContext` closure of `installToolResultContextGuard` (after the existing single-result truncation, before the overflow-threshold check). Reuse `digestOldToolResults(messages, { keepRawTurns, oldToolResultMaxChars })` exported from `context-budget.ts`. The guard already receives `contextWindowTokens`; thread `cfg.agents.defaults.historyOptimization` (same resolver `resolveHistoryOptimization`) into `installToolResultContextGuard` params.
- **Smallest viable implementation:** one call to the already-shipped `digestOldToolResults` on the cloned message view the guard already builds (`cloneMessagesForGuard`), gated behind the new flag (§8). The handle = the existing `argsHash` (deterministic from `toolCallId`); no new handle scheme.
- **OUT of scope (anti-gold-plating):** building a brand-new handle registry, LLM-based summarization of tool output, or changing the digest format. The current deterministic digest is sufficient; reuse it verbatim.

### Lever 2 — Compact running-state ledger (conservative, no summarizer)

- **What changes:** Maintain a small, **append-only**, deterministic ledger of established identifiers carried in the protected/never-trim region. It captures file paths, UUIDs, ticket IDs, and 5+ digit numbers harvested from outputs _as they are digested or dropped_ — i.e. the exact things `collectIdentifiers` already extracts. This guarantees SC-2: a path/ID from call 1 survives to call 15 even after its raw output is digested away.
- **Exact integration point:** harvest at the moment of digest/drop in `digestOldToolResultsWithStats` / the drop loop in `context-budget.ts` (the `idsPreserved` array already computed). Render the accumulated set as a fixed block injected adjacent to the protected project-context region in `buildProjectContextSection` (`system-prompt.ts`), so it inherits force-inline + protected treatment. Marker line tagged so `extractProtectedLines` treats it as un-trimmable.
- **Smallest viable implementation:** an append-only `Set<string>` of identifiers (bounded, e.g. last 200, dedup), rendered as a `## Established references (this turn)` block. **No LLM, no "decisions/open-questions" prose** in phase 1 — purely the mechanically-extracted identifiers, because that is the catastrophic-loss surface on a legal VM (wrong deadlines/citations) and a deterministic harvester cannot silently paraphrase a fact away.
- **OUT of scope (anti-gold-plating):** an LLM-summarized scratchpad of "decisions and open questions." That reintroduces exactly the summarizer-drops-a-fact risk we must avoid. Defer indefinitely unless a measured recall gap demands it; revisit only with Miles sign-off.

### Lever 3 — Retrieve-don't-replay (on-demand full re-fetch)

- **What changes:** When a later call needs an earlier full output, the model re-fetches it by handle rather than us re-sending all prior outputs. The digest already advertises the `argsHash` handle and `outcome`.
- **Exact integration point:** the **session file** (`sessionFile`, authoritative) is the lossless source; reuse the existing retrieval seam already wired for the context-engine (`installContextEngineLoopHook` → `contextEngine.assemble`) and/or the existing `memory_search`/`read` retrieval the diet already points users to. A thin "fetch tool result by handle" affordance maps `argsHash` → original message in the session file.
- **Smallest viable implementation:** **none in phase 1.** Lever 1 alone flattens the spike; lever 2 alone guarantees ID recall. Re-fetch is only needed when the model wants the _full body_ of a digested-away result — measure whether that actually occurs before building it.
- **OUT of scope (anti-gold-plating):** a similarity/embedding index over tool outputs. The repo already has context-engine retrieval and `memory_search`; do not build a parallel vector store. If re-fetch is needed at all, back it with the deterministic `argsHash`→session-file lookup first.

---

## 5. Protected-region / fail-closed guarantees

- **Un-trimmable identity:** `user.md` and `identity.md` are force-inlined whole (`classifyContextRegions`, system-prompt.ts ~213). `SOUL.md` HARD/IDENTITY-LEVEL/OVERRIDES lines and everything under identity-truth headings are retained inline by `extractProtectedLines`. None of the three levers touches the system prompt's protected regions — levers 1 & 3 operate only on `toolResult` message bodies; lever 2 only _adds_ an inline protected block.
- **Assertion gate:** extend the `assertProtectedLinesPresent` check so it runs against the **final assembled** prompt after lever-1 digest substitution. If any protected line is `missing`, **fail closed**: discard the digest substitution for that call and fall back to the prior (raw) message view. This mirrors the existing `applyContextBudgetGuard` try/catch fail-open-to-raw posture.
- **Lossless fallback:** raw tool outputs are **never deleted**. The authoritative copy lives in the **session file**; digests are a _view-time_ substitution on the in-memory message array only. The trajectory JSONL is a secondary (lossy-bounded) record and must not be relied on for losslessness. Substitution is therefore always reversible from the session file.
- **Conservative carry-forward:** lever 2 is append-only and mechanical (no paraphrase), so it cannot drop or mutate a fact it has seen.

---

## 6. Risks + mitigations

| #   | Risk                                                         | Likelihood | Impact           | Mitigation                                                                                                                                                                                      |
| --- | ------------------------------------------------------------ | ---------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Digest silently drops a fact (wrong legal deadline/citation) | Med        | **Catastrophic** | No LLM summarization (levers 1–2 deterministic). `idsPreserved` keeps IDs/paths/numbers verbatim; lever-2 ledger keeps them inline & protected; full body re-fetchable from session file.       |
| R2  | Protected line vanishes after substitution                   | Low        | Catastrophic     | `assertProtectedLinesPresent` on final assembled prompt; fail closed to raw view for that call.                                                                                                 |
| R3  | Recall failure — model can't find a digested-away fact       | Med        | High             | Lever-2 ledger surfaces every extracted ID/path inline; lever-3 re-fetch by handle as backstop (later phase). SC-2 test guards this.                                                            |
| R4  | Retrieval miss (handle→body lookup fails)                    | Low        | Med              | Handle is deterministic `argsHash` from `toolCallId`; lookup against authoritative session file, not lossy trajectory. Miss falls back to "fetch unavailable" notice, never a fabricated value. |
| R5  | Re-fetch round-trip perf overhead                            | Low        | Low              | Re-fetch is opt-in/lazy and phase 3 only; phase 1+2 add no round-trips, just cheaper string ops on already-cloned arrays.                                                                       |
| R6  | Per-iteration digest CPU cost in long loops                  | Low        | Low              | `digestOldToolResults` is regex/substring work on the already-cloned guard view; only runs when `digestOldToolResults` flag on and older results exist.                                         |
| R7  | Double-digesting (loop guard + submission guard)             | Med        | Low              | Idempotent: digest output is detectable (stable JSON shape); skip already-digested messages. Add guard to not re-digest a message whose content already parses as a digest.                     |
| R8  | Trajectory truncation misread as lossless store              | Med        | High             | Plan mandates session file as source of record; document the trajectory byte-cap caveat in code comments at the re-fetch site.                                                                  |

---

## 7. Regression test design

**New file:** `src/agents/pi-embedded-runner/run/context-budget.intra-turn-rot.test.ts`

Builds a synthetic 15+ -iteration tool loop (reuse helpers from `context-budget.test.ts` / `context-budget.history-digest.test.ts`).

- **Assertion A (SC-1, size):** after simulating N≥15 tool results (each ~4–8 KB) appended iteratively through the lever-1 `transformContext` digest path, assert `estimateAssembledTokens({ messages, systemPrompt, prompt }) <= 32_000` on the final iteration, **and** assert it is materially below the no-digest baseline (snapshot the baseline ~80k climb to prove the lever fires).
- **Assertion B (SC-2, recall):** seed call 1's tool result with a known UUID, a known absolute path, and a known `DWC-1` date string. After 15 iterations, assert all three appear (verbatim substring) in the final assembled view — either in the retained raw window, the digest `idsPreserved`, or the lever-2 ledger block.
- **Assertion C (fail-closed):** inject a protected HARD line into the system prompt; run a forced-digest pass; assert `assertProtectedLinesPresent(assembled, protectedLines).ok === true`, and that a deliberately fact-dropping digest path triggers the raw-view fallback.
- **Assertion D (idempotency, R7):** run the digest twice over the same messages; assert second pass is a no-op (no re-digest, identical output).

Extend `context-budget.history-digest.test.ts` to cover the lever-2 harvester output shape.

---

## 8. Phased rollout (each phase independently revertible, behind a flag)

All phases are runtime-path changes → **full 6-phase SDLC each**. Compose with existing live flags `agents.defaults.historyOptimization` (on) and `agents.defaults.contextBudget.targetBand` (16k–32k, on).

- **Phase 1 — Lever 1 only (smallest shippable increment).** Move/extend the existing `digestOldToolResults` substitution into the per-iteration `transformContext` guard, behind a new boolean `agents.defaults.historyOptimization.digestInToolLoop` (default **off**). Ship, enable on `prest0-vm` only, **measure** assembled-token curve on a real heavy turn against SC-1. Revert = flip flag off. This is expected to capture most of the 80k→≤32k win on its own.
- **Phase 2 — Lever 2 (running-state ledger).** Add the append-only identifier harvest + protected inline block, behind `agents.defaults.historyOptimization.runningStateLedger` (default off). Measure SC-2 recall. Revert = flip flag off.
- **Phase 3 — Lever 3 (retrieve-don't-replay), only if measured needed.** Add `argsHash`→session-file re-fetch affordance behind `agents.defaults.historyOptimization.toolResultRefetch` (default off). Skip entirely if phase 1+2 telemetry shows no recall gap requiring full-body re-fetch.

Each flag is independent and additive; no phase depends on a later one being present.

---

## 9. Open questions for Miles

1. **Phase 1 placement:** prefer extending `installToolResultContextGuard` (the non-context-engine path) only, or also mirror into `installContextEngineLoopHook`? Most account VMs appear to use the former; confirm which path `prest0-vm` runs so we instrument the right seam first.
2. **`keepRawTurns` in-loop:** the 3-turn raw window is turn-delimited by `user` messages, but an intra-turn tool loop has **no** intervening user messages — so "keep last 3 turns" ≈ "keep all of this turn raw," which defeats lever 1 inside a single long loop. Do you want a separate **in-loop raw cap** (e.g. keep last K=4 raw tool _results_ regardless of turn boundaries)? This is the key knob; recommend K≈4–6.
3. **Ledger scope:** cap the identifier ledger at last ~200 IDs, or unbounded-per-turn? Legal turns may establish many citations; unbounded risks the ledger itself becoming a context cost.
4. **Trajectory vs session file:** confirm the session file is acceptable as the sole lossless re-fetch source (trajectory is byte-capped/lossy) — affects R4/R8 framing.
5. **Measurement signal:** OK to gate phase advancement on the `context.history.digested` / `context.gate.applied` diagnostic events already emitted in attempt.ts, plus a new assembled-token gauge, rather than a new dashboard?
6. **Lever 2 ambition:** hold the line at _mechanical identifiers only_ (my recommendation, avoids R1), or do you eventually want a conservative decisions/open-questions scratchpad despite the summarizer-drop risk?

---

### Key decisions summary

- **Cost ≠ rot:** every lever targets the real assembled window, not billed/cache tokens.
- **Reuse, don't rebuild:** levers 1 & 2 are wiring of already-shipped `digestOldToolResults` + `collectIdentifiers` + `buildProjectContextSection` + `assertProtectedLinesPresent`. The one genuinely new behavior is running the existing digest **per-iteration inside the tool loop** (`transformContext`) — that's the spike-flattener.
- **No summarizer:** deterministic digest + append-only identifier ledger; never paraphrase a legal fact.
- **Fail-closed + lossless:** protected lines asserted on the final assembled prompt with raw-view fallback; raw outputs always re-fetchable from the authoritative session file.
- **Lever 3 likely unnecessary:** ship phase 1 (and maybe 2), measure, and only build re-fetch if a real recall gap appears.
