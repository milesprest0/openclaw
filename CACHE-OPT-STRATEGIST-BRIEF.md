# Caching + Context-Window Optimization — Strategist Brief (grounding for the planning subagent)

**Requested by:** Miles, #prest0n-development, 2026-06-29. Verbatim ask:

> "right now we're sitting at about 50% caching and we need to get that way up and we need to
> optimize the context window much more. scour the codebase related to this and come up a
> highly strategic plan to optimize caching regardless of the mechanism and regardless of the
> model and model provider."

This is INTERNAL ENGINEERING. Use real model/provider/file names. No white-label abstraction.

## What the orchestrator already verified (do NOT re-derive; CONFIRM + go deeper)

### Empirical cache state (live telemetry)

- File: `/tmp/openclaw/token-usage-2026-06-29.jsonl` (296 lines, 198 usage rows). Also `-06-28.jsonl`.
- Aggregate hit-rate = sum(cacheRead)/sum(promptTokens) = **2,122,857 / 11,659,998 = 18.2%** — NOT 50%.
- Per-model:
  - `google/gemini-3.5-flash` n=220 hit=17.9% cacheRead=2,358,730 cacheWrite=0 prompt=13,172,658
  - `~openai/gpt-mini-latest` n=52 hit=17.6% cacheRead=557,518 cacheWrite=0 prompt=3,166,380
  - `x-ai/grok-4.20` n=8 hit=10.6% cacheRead=85,772 cacheWrite=0 prompt=808,594
  - `~anthropic/claude-opus-latest` n=10 hit=13.6% cacheRead=64,329 cacheWrite=43,124 prompt=473,766
- Row shape sample fields: `model, provider, promptTokens, cacheRead?, cacheWrite?, systemPrompt.{chars,projectContextChars,nonProjectContextChars}, tools.schemaChars, skills.promptChars, injectedWorkspaceFiles.{count,injectedChars}, retrieval.{available}, qualityProxy`.

### Two data-visible defects to investigate + fix in the plan

1. **Telemetry double-logging / split rows (Opus):** each Opus turn appears as TWO rows — one with
   `cacheWrite>0, cacheRead=0`, a paired one with `cacheRead>0, cacheWrite=0` (or both 0). This
   corrupts any aggregate hit-rate computed naively and may be why the true rate is mis-stated.
   Find the emit point(s) in `src/auto-reply/reply/agent-runner-memory.ts` / `session-usage.ts`
   and confirm whether cacheRead and cacheWrite are emitted in separate records or one merged record.
2. **TTL-expiry waste:** session `...thread:1782531294.668989` wrote 21,562 cache tokens then read 0
   across calls ~4h apart → 5-minute ephemeral TTL expired between turns. We paid the 1.25× write
   premium for zero read benefit. The OpenRouter Anthropic path hardcodes `{type:"ephemeral"}` (5m).
   `cacheRetention:"long"` (1h) exists in config (see below) — confirm it actually threads to the
   OpenRouter marker path, not just the Anthropic-direct path.

### Live config state (`~/.openclaw/openclaw.json`) — ALL these optimization flags are ALREADY ON

- `cacheRetention: "short"` at top agent default; `"long"` on 3 nested model/surface blocks (lines ~54/63/73/91).
- `contextBudget.targetBand` set (~line 167-176).
- `toolExposure.lazy: true` (~177).
- `skillsPromptOptimization` enabled (~180).
- `projectContextOptimization.dietToRetrieval: true, maxChars:... ` (~184).
- `historyOptimization.digestOldToolResults: true` (~188).
- `observability.promptInstrumentation` block (~1000).
- **CONTRADICTION TO EXPLAIN:** despite `dietToRetrieval:true`, telemetry rows show
  `retrieval.available:false` and `projectContextChars≈42,859` (down from the 144,472 baseline in
  the plan, so SOME dieting is active). Determine: is Lever-1 retrieval actually firing? Is the
  pointer-replacement happening but retrieval not plumbed? Is the cached prefix still being busted
  by something below the boundary leaking above it?

### Code map (verified on `main`, repo `/home/miles/projects/openclaw-fork`)

- Cache boundary: `src/agents/system-prompt-cache-boundary.ts` — `SYSTEM_PROMPT_CACHE_BOUNDARY`,
  `splitSystemPromptCacheBoundary`, `prependSystemPromptAdditionAfterCacheBoundary`.
- Assembler: `src/agents/system-prompt.ts`
  - `CONTEXT_FILE_ORDER` (line 50): agents10 soul20 identity30 user40 tools50 bootstrap60 memory70.
  - `DYNAMIC_CONTEXT_FILE_BASENAMES = {heartbeat.md, memory.md}` (line 65) — MEMORY.md ALREADY moved
    below boundary (Phase-1 already shipped).
  - `buildProjectContextSection` ~1095, boundary emit ~1111, dynamic files ~1118.
- OpenRouter Anthropic marker path (THE path we use): `src/agents/pi-embedded-runner/proxy-stream-wrappers.ts`
  → `createOpenRouterSystemCacheWrapper` → `applyAnthropicEphemeralCacheControlMarkers`. Marks only
  the LAST content block; system arrives as ONE string → ONE breakpoint; emits NO ttl (5m default).
- Anthropic-direct path: `src/agents/anthropic-transport-stream.ts` → `applyAnthropicPayloadPolicyToParams`
  / `src/agents/anthropic-payload-policy.ts` — HONORS boundary split + `ttl:"1h"` via `cacheRetention:"long"`.
- Gemini OpenRouter cache markers (UNMERGED branch `feat/gemini-openrouter-cache-20260629`):
  `src/agents/pi-embedded-runner/prompt-cache-retention.ts` + `extra-params.ts` + config
  `types.agent-defaults.ts`. Opt-in `cache_control` for Gemini out-of-Prest0-mode.
- Context budget / history: `src/agents/pi-embedded-runner/run/context-budget.ts` (drop-oldest loop,
  most-recent-turn floor ~line 280), consumed at `attempt.ts:~3057`.
- Tool schema: `message` tool schema is the biggest (~5,792 chars / 105 props).
- Instrumentation: `src/agents/system-prompt-report.ts` (`buildSystemPromptReport`),
  `src/auto-reply/reply/agent-runner-memory.ts` (`derivePromptTokens`), JSONL logger
  `session-usage.ts`. Flag `observability.promptInstrumentation.enabled`.

### Prior-art docs already on disk (READ THESE FIRST, build on them — do not duplicate)

- `/home/miles/projects/openclaw-fork/CACHE-OPTIMIZATION-PLAN.md` (Anthropic phased plan)
- `/home/miles/projects/openclaw-fork/PHASE0-INSTRUMENTATION-SPEC.md` (SHIPPED)
- `/home/miles/projects/openclaw-fork/PHASE1-LEVERS-3-4-6-SPEC.md` (SHIPPED)
- `/home/miles/projects/openclaw-fork/PHASE3-LEVERS-1-2-SPEC.md` (SHIPPED, flags default-OFF but ON in live cfg)
- `/home/miles/projects/openclaw-fork/docs/plans/context-window-16-32k.md` (the master lever ranking + token breakdown)
- `/home/miles/projects/prest0/PLAN-tier2-cache-optimization.md` (Gemini implicit + GLM no-cache findings)
- Branches: `feat/gemini-openrouter-cache-20260629`, `feat/gemini-cache-telemetry-20260528`,
  `feat/prompt-caching-anthropic-breakpoints` (all UNMERGED — assess + sequence).

### Provider caching mechanics (confirmed)

- Anthropic: explicit `cache_control` breakpoints, up to 4. write 1.25× / read 0.1× of input. ttl 5m default, 1h opt-in. ~90% read savings on hit.
- Gemini: IMPLICIT only on our OpenRouter→Google path (`supports_implicit_caching=true`, read $0.15/M, write $0.083/M). Prefix-based, automatic, fragile to any prefix byte change. Explicit `cachedContents` not exposed via OpenRouter.
- OpenAI: server-side auto-cache >1024 tok, read 0.5×, free, automatic.
- DeepSeek: automatic context-cache (~$0.04/M on hit).
- GLM-5.2: NO caching available to us on any OpenRouter upstream.

## YOUR DELIVERABLE

Write a single highly-strategic plan to `/home/miles/projects/openclaw-fork/CACHE-CONTEXT-MASTER-PLAN-20260629.md` that:

1. **Reconciles the 50%-claim vs 18%-measured** with a crisp root-cause: separate the
   active-session steady-state rate from the cold/expired/aggregate rate, and quantify each
   bucket from the JSONL. State the TRUE current number(s) honestly.
2. Is **mechanism- and provider-agnostic** as Miles demanded: a unified cache strategy that lifts
   Anthropic (explicit breakpoints + TTL), Gemini/OpenAI/DeepSeek (implicit prefix stability), AND
   the no-cache rungs (GLM) via routing — one coherent design, not four disconnected hacks.
3. Ranks levers by **(cache-hit-rate gain) × (volume) ÷ (risk)**, with the dominant-volume Gemini
   Tier 2 path called out as the highest-leverage target (220 calls vs 10 Opus).
4. Addresses the **context-window optimization** half explicitly: why projectContext is still ~42.8k
   despite dieting, whether Lever-1 retrieval is actually firing, and how to push per-call input into
   the 16–32k band without instruction-following regression (HARD/identity lines always inline).
5. Fixes the **two data defects** (telemetry split-row, TTL-expiry waste) as P0 — you can't optimize
   what you're mis-measuring.
6. Proposes a **TTL strategy** (when to pay 1h vs 5m; warm-keepalive for active sessions; never write
   cache you won't read).
7. Sequences everything into phases with: exact file:line touch points, flag names, default-OFF
   safety, build/test gates, live cache-hit verification method (re-measure from JSONL after each
   phase), and rollback. Reuse the existing Phase scaffolding/flags rather than inventing parallel ones.
8. Includes a **measurement harness** spec: a repeatable script to compute true per-model and
   per-surface hit-rate from the JSONL so "did it go up" is provable, not vibes.

Be concrete and honest. Where the live config already has a flag ON but it's not delivering, say so
and diagnose WHY rather than proposing to "turn it on again." Cite file:line for every claim.
Do NOT change any production code or flags in this task — this is PLAN ONLY. Verify findings by
reading source; you may run read-only shell (grep/sed/python over the JSONL) but make no edits
outside the one plan file + this brief is yours to consult.
