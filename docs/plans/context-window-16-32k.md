# PLAN: Drive per-call input into the 16k–32k token band (no instruction-following regression)

Branch suggestion: `feat/context-window-16-32k`
Status: investigation complete + sequenced plan. No production code changed.

## TL;DR (executive summary)

**The ~16k tool-schema hypothesis is REFUTED by live data.** Tool schemas total
only **~12k–14.5k _chars_ (≈3.0k–3.6k tokens)** across 16 tools — not 16k tokens.
The single biggest stable cost is the **injected workspace Project Context
(`projectContextChars ≈ 144,472 chars ≈ 36k tokens`)**, dwarfing tool schemas
(~3k tokens) and skills (~2.1k tokens). The fresh/volatile swing (13k–49k
`lastCallInput`) is dominated by **retained raw tool outputs + history**.

### Where the tokens actually are (live `systemPromptReport`, Slack session)

| Component                                          | chars   | ≈ tokens (÷4) | Source of truth             |
| -------------------------------------------------- | ------- | ------------- | --------------------------- |
| `systemPrompt.chars` (whole system block)          | 174,705 | ~43,700       | system-prompt-report.ts:109 |
| └ `projectContextChars` (injected workspace files) | 144,472 | **~36,100**   | system-prompt-report.ts:88  |
| └ `nonProjectContextChars` (OpenClaw scaffolding)  | 30,233  | ~7,560        | system-prompt-report.ts:131 |
| `tools.schemaChars` (16 tools)                     | 11,989  | **~3,000**    | system-prompt-report.ts:112 |
| └ `message` tool alone (105 props)                 | 5,792   | ~1,450        | message-tool.ts:761         |
| `skills.promptChars` (17 skills)                   | 8,406   | ~2,100        | system-prompt-report.ts:137 |

Reconciliation against the live token-usage JSONL (`/tmp/openclaw/token-usage-2026-06-20.jsonl`):
`cacheRead` steady **29,378** (cached stable prefix) + `lastCallInput` p50 **25,667**
(fresh suffix: dynamic system files like MEMORY.md + history + retrieved memory + user msg)
= `promptTokens` p50 **55,045** (min 42,564 / p99 78,594). Matches the brief exactly.

### Ranked levers (est. savings, in execution order)

| #   | Lever                                                                  | Est. savings                 | Risk to instruction-following    | Code location                                              |
| --- | ---------------------------------------------------------------------- | ---------------------------- | -------------------------------- | ---------------------------------------------------------- |
| 0   | **Instrumentation/decomposition** (prereq)                             | 0 (enables all)              | none                             | session-usage.ts + attempt.ts                              |
| 1   | **Workspace Project Context dieting → retrieval**                      | **15k–25k**                  | medium (identity/HARD always-on) | system-prompt.ts + bootstrap-files + memory retrieval      |
| 2   | **Rolling structured history summary** (cap raw tool-output retention) | **10k–30k** on long sessions | medium                           | context-budget.ts + compact.ts + tool-result-truncation.ts |
| 3   | **Deterministic pre-flight budget gate @ 16–32k** (prune→compact→trim) | enforces ceiling             | low (mechanism, not content)     | context-budget.ts + attempt.ts:3057                        |
| 4   | **Tool-schema dieting + lazy exposure**                                | 1.5k–2.5k                    | low                              | message-tool.ts schema + effective-tool-policy.ts          |
| 5   | **Skills description trimming / retrieval**                            | 0.5k–1.5k                    | low                              | system-prompt.ts:202 buildSkillsSection                    |
| 6   | **Cache-aware byte-identical prefix ordering**                         | 0 tokens (cost, not size)    | none                             | system-prompt.ts cache boundary                            |

Hitting the 16–32k band requires **levers 1 + 2 + 3 together**: trim the ~36k stable
Project Context to ~10–14k, keep history bounded by a rolling summary, and enforce with
a code-side gate. Tool-schema work (lever 4) is real but small — do it for cache stability
and polish, not as a primary lever.

---

## File:line map of the assembly pipeline

### (a) System prompt + workspace bootstrap assembly

- `src/agents/system-prompt.ts` — master assembler.
  - `CONTEXT_FILE_ORDER` map: agents(10) soul(20) identity(30) user(40) tools(50) bootstrap(60) memory(70) — **system-prompt.ts:47**.
  - `DYNAMIC_CONTEXT_FILE_BASENAMES = {heartbeat.md, memory.md}` (below cache boundary) — **system-prompt.ts:62**.
  - `buildSkillsSection(...)` — **system-prompt.ts:202**.
  - `buildMemoryPromptSection(...)` injected via `memorySection` — **system-prompt.ts:808** (impl `src/plugins/memory-state.ts:215`).
  - Project Context rendered via `buildProjectContextSection({files: stableContextFiles, ...})` — **system-prompt.ts:~1095** (stable) and `dynamicContextFiles` below the boundary — **system-prompt.ts:~1118**.
  - Cache boundary emitted `SYSTEM_PROMPT_CACHE_BOUNDARY` — **system-prompt.ts:1111**.
- Bootstrap char caps: `DEFAULT_BOOTSTRAP_MAX_CHARS = 12_000` (per file), `DEFAULT_BOOTSTRAP_TOTAL_MAX_CHARS = 60_000` (total) — **src/agents/pi-embedded-helpers/bootstrap.ts:87-88**; resolvers at `:106` / `:114`.
  - NOTE: `projectContextChars` (144k) >> 60k bootstrap cap, so the injected user-editable workspace files (large AGENTS.md/SOUL.md/TOOLS.md on this tenant) are **not** all subject to the bootstrap total cap. This is the gap lever 1 targets.

### (b) Tool schema serialization into the request

- Tools assembled: `effectiveTools = [...tools, ...filteredBundledTools]` — **src/agents/pi-embedded-runner/run/attempt.ts:1135**.
- Built/normalized: `normalizeAgentRuntimeTools(...)` — **attempt.ts:1062**.
- Policy filter for bundled (MCP/LSP) tools: `applyFinalEffectiveToolPolicy(...)` — **attempt.ts:1115** (impl `src/agents/pi-embedded-runner/effective-tool-policy.ts`).
- Tools → SDK definitions: `splitSdkTools({tools, sandboxEnabled})` → `toToolDefinitions` — **src/agents/pi-embedded-runner/tool-split.ts:8**.
- Per-tool schema char accounting already exists: `JSON.stringify(parameters).length` — **src/agents/system-prompt-report.ts:53**.
- The `message` tool schema (the huge one): `src/agents/tools/message-tool.ts:761` (`parameters: schema`); 164 `Type.*` nodes; ~31.5KB source; ~5,792–7,202 chars serialized.

### (c) Conversation history assembly / trimming

- `applyContextBudgetGuard(...)` — definition **src/agents/pi-embedded-runner/run/context-budget.ts:231**; call site **attempt.ts:3057**.
  - Knobs: `DEFAULT_MAX_ASSEMBLED_RATIO = 0.6`, `DEFAULT_RESERVE_TOKENS = 20_000`, `DEFAULT_PER_THREAD_MAX_IMAGES = 8` — context-budget.ts:13-15.
  - Current trim strategy: age out oldest inline images, then drop **oldest whole turns** until under `budgetBeforeReserve` (`= maxAssembledTokens − reserveTokens`); never drops the most-recent user turn (context-budget.ts:270-292). **No summarization — pure deletion.**
- Token estimation: `estimateMessagesTokens` (sum of `estimateTokens`) × `SAFETY_MARGIN = 1.2` — **src/agents/compaction.ts:22, :120**. `estimateTokens` uses `chars/4` — `node_modules/@mariozechner/pi-coding-agent/dist/core/compaction/compaction.js:161-217`.
- Tool-result truncation: `MAX_TOOL_RESULT_CONTEXT_SHARE = 0.3`, `DEFAULT_MAX_LIVE_TOOL_RESULT_CHARS = 16_000` — **src/agents/pi-embedded-runner/tool-result-truncation.ts:31,40**; resolver `resolveLiveToolResultMaxChars` :224.
- Preemptive compaction routing: `shouldPreemptivelyCompactBeforePrompt(...)` — **attempt.ts:3164**; routes `truncate_tool_results_only` / `compact_then_truncate` / `compact_only`.
- Compaction proper: `src/agents/pi-embedded-runner/compact.ts` (also calls `applyContextBudgetGuard` at :1161).

### (d) Memory / skills injection

- Memory: `buildMemoryPromptSection` — **src/plugins/memory-state.ts:215** → injected at system-prompt.ts:808. Pulls from the registered memory plugin's `promptBuilder` (no hard char cap at this seam — sized by the plugin).
- Memory-driven preflight compaction trigger: `isLikelyOverBudget(...)` — **src/auto-reply/reply/agent-runner-memory.ts:547** (def context-budget.ts:307).
- Skills: `buildSkillsSection` — **system-prompt.ts:202**; skill blocks parsed/measured `parseSkillBlocks` — system-prompt-report.ts:23.

### The single seam where messages[] + tools[] coexist pre-call

**`src/agents/pi-embedded-runner/run/attempt.ts` ~3053–3110.** Immediately after
`applyContextBudgetGuard` writes `activeSession.agent.state.messages` (attempt.ts:3084)
and before the model stream, the runtime has: final `activeSession.messages`,
`effectiveTools`, `systemPromptText`, `promptForModel`, `imageResult.images`. The
`context.assembled` diagnostic event is already emitted here (attempt.ts:3096) and the
`llm_input` hook fires at attempt.ts:3133. **This is the seam for the pre-flight budget
gate and the per-call decomposition log.**

---

## Lever 0 — Instrumentation / decomposition (DO FIRST, zero behavior change)

**Good news:** the decomposition already mostly exists in `buildSystemPromptReport`
(`systemPrompt.chars`, `projectContextChars`, `nonProjectContextChars`,
`tools.schemaChars` + per-tool entries, `skills.promptChars`) — attempt.ts:1370 builds
it and it already flows to `persistSessionUsageUpdate` via
`runResult.meta.systemPromptReport` (followup-runner.ts:391, agent-runner.ts:1452).

**Change:** extend the `TokenUsageRecord` (src/logging/token-usage-log.ts:45) and the
`logTokenUsageRecord` call in `session-usage.ts:164` to also emit, from the
`systemPromptReport` already available on the persist params:

- `systemTokens` = `ceil(systemPrompt.nonProjectContextChars / 4)`
- `projectContextTokens` = `ceil(systemPrompt.projectContextChars / 4)`
- `toolSchemaTokens` = `ceil(tools.schemaChars / 4)`
- `skillsTokens` = `ceil(skills.promptChars / 4)`
- `historyTokens` = `lastCallInput − (system+projectContext+toolSchema+skills+freshUser)` (derived residual)
- `freshUserTokens` = estimate of `promptForModel` (reuse `estimatePromptTokensForMemoryFlush`).

`systemPromptReport` is already a param of `persistSessionUsageUpdate` (session-usage.ts:88).
**No new measurement seam required**; just widen the JSONL. char/4 is the same heuristic
the runtime already trusts.

- Savings: 0. Risk: none. Guardrail: existing token-usage-log.test.ts + a new assertion
  that decomposition fields sum (±SAFETY_MARGIN) to `lastCallInput`.
- **Acceptance gate for the whole project depends on this**: we cannot claim 16–32k
  without per-component series.

---

## Lever 1 — Workspace Project Context dieting → retrieval (biggest single lever)

`projectContextChars ≈ 144k chars ≈ 36k tokens` is the elephant. On this tenant it is the
injected user-editable workspace files (AGENTS.md/SOUL.md/TOOLS.md/USER.md/IDENTITY.md +
memory) rendered verbatim into every system prompt.

**Two coordinated changes:**

1. **Split each workspace file into `always-on` vs `retrievable`.** Identity-level + HARD
   rules (the three SOUL identity truths, the Slack HARD rules, tool-dispatch table) stay
   inline (deterministic, code-pinned ordering). The long-form reference prose (full
   trigger lists, examples, multi-doc rationale — already partly externalized to
   `memory/reference/*.md`) moves behind `memory_search`/`read` retrieval.
   - Code: introduce a per-file front-matter or a manifest (`workspace-context-policy`)
     read in `system-prompt.ts` near `CONTEXT_FILE_ORDER` (:47) that classifies each
     injected file region as `inline` vs `on-demand`. Render only `inline` into Project
     Context; emit a one-line pointer for `on-demand` regions.
2. **Enforce a Project Context token cap** (e.g. 12k tokens) at the assembler with the
   same trim discipline as bootstrap (bootstrap.ts caps at 60k chars total but the
   injected workspace files bypass it — `projectContextChars` 144k >> 60k). Add a
   `projectContextMaxChars` budget applied in `buildProjectContextSection`.

- Est. savings: **15k–25k tokens** off the stable prefix (36k → ~11–14k).
- Risk to instruction-following: **medium** — moving rules out of always-on context can
  drop adherence. Mitigation: the three identity truths + all HARD rules are classified
  `inline` and covered by the golden-prompt regression suite. Anything retrieval-backed
  must have a deterministic trigger so it is pulled when relevant.
- Guardrail: golden-prompt instruction-following eval must not regress; add an assertion
  that every line tagged `HARD`/identity is present verbatim in the assembled prompt.

---

## Lever 2 — Rolling structured history summary (cap raw tool-output retention)

Today `applyContextBudgetGuard` only **deletes oldest turns** (context-budget.ts:270) and
tool results are truncated to ≤16k chars each (tool-result-truncation.ts:40). On
tool-heavy turns the fresh `lastCallInput` still swings to 49k because multiple recent raw
tool outputs are retained at full (truncated) size.

**Change:** add a rolling structured summary lane that replaces _old_ raw tool outputs
(beyond the last N turns) with a compact structured digest, instead of either keeping them
raw or hard-deleting the whole turn.

- Code: extend the trim loop in `context-budget.ts` (or a new `history-summary.ts`
  consumed at attempt.ts:3057) to, before dropping a turn, replace its tool-result blocks
  with a `{tool, args-hash, outcome, key-facts}` digest produced by the existing
  compaction summarizer (`generateSummary` in pi-coding-agent). Keep last 2–3 turns raw.
- Lower `DEFAULT_MAX_LIVE_TOOL_RESULT_CHARS` for _non-final_ turns specifically (a
  per-turn-age cap), leaving the most recent turn at 16k.
- Est. savings: **10k–30k tokens** on long/tool-heavy sessions (this pushes p99 from 78k
  toward band).
- Risk: **medium** — summarizing tool outputs can lose facts the model later needs.
  Mitigation: keep last N turns verbatim; digest must preserve identifiers (there is
  already `compaction.identifier-preservation.test.ts`). Behind a flag, gated by the
  golden eval.
- Guardrail: `run.overflow-compaction.*` tests + a new test that a digested old turn still
  exposes IDs/paths to a follow-up that references them.

---

## Lever 3 — Deterministic pre-flight budget gate @ 16–32k (prune → compact → trim)

The durability HARD rule: the ceiling lives in **code**, not prompt text. The mechanism
mostly exists (`applyContextBudgetGuard` + preemptive compaction) but is tuned to a
0.6 × 200k ≈ 120k assembled ratio with 20k reserve — far above 32k.

**Change:** add a target band config and a single deterministic gate at the seam
(attempt.ts:3057) that runs in order until `estimatedAssembledTokens ≤ targetMax`:

1. image age-out (exists),
2. old-tool-output digest (Lever 2),
3. drop oldest turns (exists),
4. trigger compaction (exists) if still over.

- Config: `agents.defaults.contextBudget.targetBand = { min: 16_000, max: 32_000 }`
  (additive to AgentContextBudgetConfig). Map `maxAssembledTokens → 32_000`, set
  `reserveTokens` so `budgetBeforeReserve ≈ 28_000` (headroom for fresh user + reserve).
- Est. savings: enforces the ceiling; saves only as much as 1+2 supply in content
  reductions. Risk: **low** (mechanism). Over-aggressive trim risks dropping needed
  history → keep the "never drop most-recent turn" floor (context-budget.ts:280) and emit
  a `context.gate.applied` diagnostic.
- Guardrail: assert p99 `promptTokens ≤ 32_000` on a replay corpus; assert most-recent
  user turn always survives.

---

## Lever 4 — Tool-schema dieting + lazy exposure (small; do for polish + cache)

Tool schemas are only ~3k tokens, but `message` is half of it (5.8–7.2k chars, 105–109
props) and is rarely needed mid-turn.

- **Diet `message` schema** (message-tool.ts:117-200): collapse rarely-used optional props
  (Telegram/Discord-specific effect/quote/poll fields) into a documented
  `extra: Record<string,unknown>` passthrough or a `$ref`-shared sub-schema; trim verbose
  per-field `description`s. Est. −2k chars (~−500 tokens), no capability loss.
- **Lazy tool exposure:** gate low-frequency tools (image-generate, music, video, pdf,
  nodes) out of the default tool array, expose on intent via `effective-tool-policy.ts`.
  Split seam already exists (attempt.ts:1115). Est. −1k–2k tokens when those plugins are
  present.
- Est. savings: **1.5k–2.5k tokens**. Risk: **low** (lazy exposure can cause a missed-tool
  retry; keep `message`/`exec`/`read`/`edit`/`sessions_*` always-on).
- Guardrail: tool-availability tests + a regression that intent phrases still surface the
  lazy tool.

---

## Lever 5 — Skills description trimming / retrieval (~2.1k tokens)

`buildSkillsSection` (system-prompt.ts:202) injects 17–24 skill `<description>` blocks
(8.4–9.1k chars). Trim each description to ≤160 chars and/or move full descriptions behind
the existing `read`-the-SKILL.md retrieval (the section already tells the model to read
SKILL.md before use).

- Est. savings: 0.5k–1.5k tokens. Risk: low (skill _selection_ uses descriptions; keep
  enough signal). Guardrail: skill-selection eval cases.

---

## Lever 6 — Cache-aware byte-identical prefix ordering (cost, not token-count)

Per `CACHE-OPTIMIZATION-PLAN.md`, the OpenRouter path marks only the last content block for
caching and does not honor `OPENCLAW_CACHE_BOUNDARY`. Ensure all Lever-1/4/5 changes keep
the stable prefix **byte-identical turn-to-turn** (deterministic ordering, no timestamps
inside the cached region) so `cacheRead` stays maximal. Does not reduce `promptTokens` but
keeps the 16–32k reduction cheap. Coordinate with that plan; do not regress the boundary.

---

## Sequencing

1. **Lever 0 (instrumentation)** — ship first; gives per-component series to verify every
   later change. Pure additive.
2. **Lever 4 + 5 (safe wins)** — schema/skills trimming + lazy tools. Low risk, immediate
   small reductions, validate the eval harness end-to-end.
3. **Lever 3 (gate mechanism)** — land the 16–32k target band + gate behind a flag
   (mechanism only, no behavioral content change yet).
4. **Lever 1 + 2 (behavioral changes)** — Project Context retrieval + rolling history
   summary, **behind the golden-prompt instruction-following regression suite**. Biggest
   movers and highest adherence risk; gate each behind a flag and the eval.
5. **Lever 6** — verify cache prefix stability after all of the above.

## Golden-prompt instruction-following regression suite (gate for Levers 1/2)

Build an eval set (`test/eval/instruction-following/*.jsonl`) of representative turns
(Slack HARD-rule compliance, tool-dispatch routing, identity-voice, deadline math, Spanish
mirroring, multi-doc routing). For each: assert the assembled system prompt contains every
`HARD`/identity line verbatim, and that the model response satisfies a rubric checker. Run
before/after each behavioral lever; fail the PR on any rubric regression.

## Acceptance test (measurable)

On a fixed replay corpus (or 48h of live `token-usage-*.jsonl` after rollout):

- **p50 `promptTokens` ∈ [16_000, 32_000]** and **p99 `promptTokens` ≤ 32_000**.
- `cacheRead` stays within −10% of its current ~29k baseline (prefix stability).
- **Zero regression** on the golden instruction-following eval (rubric pass-rate ≥ baseline).
- Decomposition invariant: `system + projectContext + toolSchema + skills + history +
freshUser ≈ lastCallInput` (within SAFETY_MARGIN).

## Rollback

Every lever is flag-gated and additive at known seams (token-usage-log.ts, system-prompt.ts
Project Context section, context-budget.ts, effective-tool-policy.ts, message-tool.ts
schema). Revert = disable flags / restore default caps. No data migration.

---

## Appendix — constants & live data references

- `DEFAULT_CONTEXT_TOKENS = 200_000` — src/agents/defaults.ts:6.
- Budget: `DEFAULT_MAX_ASSEMBLED_RATIO = 0.6`, `DEFAULT_RESERVE_TOKENS = 20_000`,
  `DEFAULT_PER_THREAD_MAX_IMAGES = 8` — context-budget.ts:13-15.
- Tool-result: `MAX_TOOL_RESULT_CONTEXT_SHARE = 0.3`,
  `DEFAULT_MAX_LIVE_TOOL_RESULT_CHARS = 16_000` — tool-result-truncation.ts:31,40.
- Bootstrap: `DEFAULT_BOOTSTRAP_MAX_CHARS = 12_000`,
  `DEFAULT_BOOTSTRAP_TOTAL_MAX_CHARS = 60_000` — pi-embedded-helpers/bootstrap.ts:87-88.
- `SAFETY_MARGIN = 1.2`; `estimateTokens = ceil(chars/4)`.
- Live token-usage (2026-06-20, n=7 Slack): `promptTokens` min 42,564 / p50 55,045 /
  p99–max 78,594; `lastCallInput` 13,067 / 25,667 / 49,216; `cacheRead` steady 29,378.
- Live `systemPromptReport`: systemPrompt 174,705 chars (projectContext 144,472 /
  nonProject 30,233); tools.schemaChars 11,989 (16 tools; message 5,792/105 props);
  skills.promptChars 8,406 (17 skills).
