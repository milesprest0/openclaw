# PLAN — Replace Claude Sonnet 4.6 → Sonnet 5 (code + detection + caching)

**Branch:** `feat/sonnet5-swap-20260701` (worktree `/tmp/oc-sonnet5-wt`, based on `origin/main` @ `8c05768550`)
**Author:** SDLC subagent (sonnet5-swap-sdlc)
**Date:** 2026-07-01

---

## 0. Verified live facts (given, not re-fetched)

| Model                                                     | ctx | in $/M | out $/M | cache_read $/M | cache_write $/M |
| --------------------------------------------------------- | --- | ------ | ------- | -------------- | --------------- |
| `anthropic/claude-sonnet-5` (LIVE now)                    | 1M  | 2.00   | 10.00   | 0.20           | 2.50            |
| `~anthropic/claude-sonnet-latest` → sonnet-5              | 1M  | 2.00   | 10.00   | 0.20           | 2.50            |
| `anthropic/claude-sonnet-4.6` / `claude-sonnet-4-6` (old) | 1M  | 3.00   | 15.00   | 0.30           | 3.75            |

Sonnet 5 is **cheaper** than 4.6 on every axis.

---

## 1. SSOT / discrepancy notes (report to Miles)

- **`config/model-tiers.json` DOES NOT EXIST** in either `~/projects/openclaw-fork` or `~/.openclaw/workspace`, and **`scripts/generate-model-tier-docs.mjs` DOES NOT EXIST** either. The AGENTS.md generated-block header (`— from config/model-tiers.json. Run node scripts/generate-model-tier-docs.mjs`) and multiple SSOT annotations reference these phantom files. The **real** tier SSOT is the hand-maintained Markdown `~/.openclaw/workspace/memory/reference/model-tier-stacks.md`; the AGENTS.md `BEGIN/END GENERATED:subagent-dispatch` block is **hand-synced**, not generated. Recommend correcting the misleading generator references in a follow-up doc pass.
- `rg` is not installed on this host; used `git grep`.

---

## 2. Full classified inventory (non-test `src` files w/ sonnet-4-6 family refs)

### (a) REPIN — shorthand/default that should now point at sonnet-5

| #   | File:line                            | Current                                                              | Change                          |
| --- | ------------------------------------ | -------------------------------------------------------------------- | ------------------------------- |
| 1   | `src/config/defaults.ts:23`          | `sonnet: "anthropic/claude-sonnet-4-6"` (DEFAULT_MODEL_ALIASES)      | → `"anthropic/claude-sonnet-5"` |
| 2   | `src/agents/live-model-filter.ts:19` | `"anthropic/claude-sonnet-4-6"` in `HIGH_SIGNAL_LIVE_MODEL_PRIORITY` | → `"anthropic/claude-sonnet-5"` |

### (b) ADD-ALONGSIDE — must ALSO recognize sonnet-5, keep sonnet-4 for back-compat

| #   | File:line                                     | Function                                                            | Finding & change                                                                                                                                                                                                                                                                                                                                |
| --- | --------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3   | `src/agents/context.ts:37`                    | `ANTHROPIC_1M_MODEL_PREFIXES = ["claude-opus-4","claude-sonnet-4"]` | **BUG for sonnet-5:** prefix list does NOT match `claude-sonnet-5` → sonnet-5's 1M ctx would be under-reported to the 200k default. ADD `"claude-sonnet-5"`. Keep existing two.                                                                                                                                                                 |
| 4   | `src/plugins/provider-replay-helpers.ts:~110` | `shouldPreserveThinkingBlocks`                                      | **CACHING BUG for sonnet-5:** `/claude-[5-9]/` only matches _version-first_ ids (`claude-5-opus`), NOT _name-first_ `claude-sonnet-5` → thinking blocks would be DROPPED, breaking prompt-cache prefix matching. FIX: add a name-agnostic `sonnet/opus/haiku-5+` match. Keep opus-4/sonnet-4/haiku-4 + `-latest` + version-first checks intact. |

### (c) DECISION-FLAGGED — adaptive-thinking capability of sonnet-5 is UNVERIFIED (recommend LEAVE)

Sonnet 4.6 advertises/defaults to `adaptive` thinking. I have **no verified fact** that sonnet-5 supports adaptive thinking. If sonnet-5 does NOT support it and we add it, we risk an API error on thinking requests. If sonnet-5 DOES support it and we omit it, behavior safely degrades to standard levels (off/minimal/low/medium/high) — **no error**. **Recommendation: LEAVE these on 4.6-only until Miles confirms sonnet-5's thinking capabilities.**
| # | File:line | Function |
|---|---|---|
| 5 | `src/agents/anthropic-transport-stream.ts:127` | `supportsAdaptiveThinking` (sonnet-4-6/4.6) |
| 6 | `src/plugin-sdk/provider-model-shared.ts:88-92` | `CLAUDE_ADAPTIVE_THINKING_DEFAULT_MODEL_PREFIXES` (advertises `adaptive` level + default) |
| 7 | `src/agents/model-thinking-default.ts:~66` | 4.6 adaptive-default block (gated on catalog `name` `/4\.6\b/`) |

### (d) LEAVE — historical / comment / provider-specific probe (no OpenRouter sonnet-5 impact)

| #   | File:line                                             | Why LEAVE                                                                                                                                                       |
| --- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 8   | `src/gateway/gateway-cli-backend.live-helpers.ts:168` | `claude-cli/claude-sonnet-4-6` model-switch probe target — **claude-cli** provider (not OpenRouter), a live-test probe. Out of scope; changing risks the probe. |
| 9   | `src/plugins/manifest.ts:72`                          | JSDoc example `claude-sonnet-4.6` — comment only. (Optional cosmetic refresh.)                                                                                  |
| 10  | `src/config/types.agent-defaults.ts:623`              | JSDoc example — comment only.                                                                                                                                   |
| 11  | `src/plugins/runtime/types-core.ts:113`               | JSDoc example — comment only.                                                                                                                                   |

### (e) TEST infra + fixtures to add/update

| File                                                                          | Change                                                                                                                                                                                                                            |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/agents/live-cache-regression-runner.ts:620`                              | Add `claude-sonnet-5` to front of `preferredModelIds` for the LIVE anthropic cache lane (keeps 4-6/4-5 fallbacks).                                                                                                                |
| `src/agents/pi-embedded-runner/extra-params.openrouter-cache-control.test.ts` | **NEW cache regression case:** verify `cache_control` injection fires for `anthropic/claude-sonnet-5` AND `~anthropic/claude-sonnet-latest` (this marker is what drives cache_write-on-first / cached-read-on-second at the API). |
| `src/agents/context.test.ts`                                                  | Add sonnet-5 → 1M context assertion.                                                                                                                                                                                              |
| `src/plugins/provider-replay-helpers.test.ts`                                 | Add `shouldPreserveThinkingBlocks("claude-sonnet-5") === true` (+ `anthropic/claude-sonnet-5`).                                                                                                                                   |
| `src/plugin-sdk/provider-model-shared.test.ts`                                | Add sonnet-5 thinking-profile case — asserts it does NOT advertise `adaptive`/`xhigh` (locks in the (c) "LEAVE" decision; flip if Miles opts in).                                                                                 |

---

## 3. Caching correctness (the whole point)

- `isAnthropicModelRef()` strips a leading `~` then checks `startsWith("anthropic/")`. Both `anthropic/claude-sonnet-5` and `~anthropic/claude-sonnet-latest` **PASS** → `cache_control` injection + cache-TTL eligibility already work for sonnet-5 on the OpenRouter path. ✓ (verified by node simulation)
- Two latent gaps that WOULD have silently degraded caching for sonnet-5, now fixed in (b): 1M context detection (#3) and thinking-block preservation (#4, drives cache-prefix stability).
- Deterministic proof: extended `extra-params.openrouter-cache-control.test.ts`. Live round-trip (real `cache_write_tokens` then `cached_tokens`) stays in the gated live runner (`OPENCLAW_LIVE_ANTHROPIC_CACHE_MODEL=claude-sonnet-5`).

---

## 4. Tier 2 decision (HELD pending Miles — do NOT mutate SSOT rung yet)

**Context:** Tier 2 rung 2 was `~anthropic/claude-sonnet-latest` (2026-06-06 Justin), reverted to `z-ai/glm-5.2` on 2026-06-28 (SSOT v2026-06-20). Tier 2 currently has **NO Sonnet**. The standing HARD rule "Claude Sonnet/Haiku banned on ALL Claude paths (Opus-4-7-everywhere)" is currently **unqualified** again. So there is no live sonnet-4.6 tier rung to "replace" — the only live sonnet-4.6 refs are the code items above.

**Option (i):** Re-insert Sonnet 5 at Tier 2 rung 2 (reverse the glm-5.2 revert).
**Option (ii):** Only repin code-level `sonnet` shorthand + defaults + detection; LEAVE Tier 2 on `z-ai/glm-5.2`.

**RECOMMENDATION: Option (ii).** Reasoning:

1. The glm-5.2 revert was a **deliberate decision made 3 days ago** (2026-06-28); reversing a fresh intentional revert should require explicit confirmation, not inference.
2. "Replace Sonnet 4.6 with Sonnet 5" safely reads as: update the _code references_ that point at sonnet-4.6 → sonnet-5; it does not require re-activating Sonnet in the Tier 2 rotation.
3. Cost: as a pure fallback, glm-5.2 (implicit cache_read ~$0.18/M, no write surcharge) is cheaper than sonnet-5 ($2/$10, cache_read $0.20). Sonnet-5's advantage (reliable explicit `cache_control` ~90% input savings) only pays on stable-large-prefix repeat traffic — not typical for a rung-2 fallback.
4. It keeps the Opus-4-7-everywhere HARD rule intact.
5. If Miles wants sonnet-5 actively serving Tier 2, it's a **one-line SSOT edit + AGENTS.md sync** on his word — zero code dependency, instant.

**If Miles picks (i):** edit `model-tier-stacks.md` rung 2 → `openrouter/~anthropic/claude-sonnet-5` (or `~anthropic/claude-sonnet-latest`), update the 2026-06-28 reconciliation note + the "banned on ALL Claude paths" line to record the re-exception, and sync the AGENTS.md generated block if the Mid-tier default changes.

---

## 5. Phases

- **P1 pre-flight:** DONE — clean worktree off origin/main; build/test targets confirmed (`npm run build`, `npm test`).
- **P2 PLAN:** THIS FILE.
- **P3 edits:** REPIN (#1,#2) + ADD-ALONGSIDE (#3,#4) + TEST fixtures + cache regression test. (c) items LEFT per recommendation. Tier 2 SSOT HELD.
- **P4 build + targeted tests** until green.
- **P5 diff summary + test results** reported; deploy-to-main GATED on Miles' Tier 2 decision.
- **P6 learnings.**
