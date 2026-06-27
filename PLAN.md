# PLAN: Dimension-safe memory embedding fallback (Tier-12 design #1)

## Problem

`agents.defaults.memorySearch.fallback` lets you name ONE backup embedding provider that
is used when the primary embedding call fails. But the runtime resolves the fallback's
_model_ via `resolveEmbeddingProviderFallbackModel(...)`
(extensions/memory-core/src/memory/manager-provider-state.ts:102), which returns the
fallback ADAPTER's own `defaultModel`. The `openai` adapter's default is
`text-embedding-3-small` (1536-dim). Our store is pinned at 3072-dim (gemini-embedding-2-preview).

Two concrete defects this causes:

1. DIMENSION CORRUPTION / OUTAGE: a real failover would embed at 1536 and write into a
   3072 store -> unqueryable / corrupt index. This is the "whole system goes down when
   utilized" risk we must eliminate.
2. SAME-PROVIDER FALLBACK BLOCKED: `resolveMemoryFallbackProviderRequest` returns null when
   `fallback === currentProviderId` (manager-provider-state.ts:~95). Our primary already runs
   through the `openai` adapter (OpenRouter baseUrl -> google/gemini-embedding-2-preview), so we
   currently cannot configure a same-adapter, different-model fallback over the same transport.

## Goal (design #1 — dimension-pinned single fallback)

Let operators pin BOTH the fallback model AND its output dimensionality so the fallback only
ever emits vectors that match the primary store. For prest0-vm: primary
gemini-embedding-2-preview @3072, fallback openai/text-embedding-3-large pinned @3072.

## Scope of code change (surgical, memory-core only)

1. SCHEMA — add two OPTIONAL fields under `agents.defaults.memorySearch` (and per-agent override):
   - `fallbackModel?: string` — explicit model id for the fallback provider. When set, it OVERRIDES
     the fallback adapter's `defaultModel`. When unset, behavior is unchanged (back-compat).
   - `fallbackOutputDimensionality?: number` — output dim for the fallback request. When unset,
     falls back to `outputDimensionality` (same as primary), preserving store consistency.
     Update: src/config/types\*.ts (the memorySearch type), src/config/schema.help.ts (help text),
     src/config/schema.labels.ts (labels). Mirror into ResolvedMemorySearchConfig in
     src/agents/memory-search.ts (mergeConfig + the returned object), defaulting like the others.

2. RESOLVER — extensions/memory-core/src/memory/manager-provider-state.ts
   `resolveMemoryFallbackProviderRequest`:
   - model: prefer `settings.fallbackModel` when present; else keep
     `resolveEmbeddingProviderFallbackModel(fallback, settings.model, cfg)` (unchanged default).
   - outputDimensionality: prefer `settings.fallbackOutputDimensionality ?? settings.outputDimensionality`.
   - Relax the `fallback === currentProviderId` skip: allow same-provider fallback ONLY when a
     distinct `fallbackModel` is configured (so we can reuse the OpenRouter transport to switch
     model). If fallbackModel is absent AND ids match, keep returning null (no-op, unchanged).

3. SAFETY GUARD (defense in depth) — wherever a resolved fallback vector is about to be written,
   assert the produced embedding length === the store's pinned `vectorDims`. On mismatch: DO NOT
   write, log a clear error, and surface as a normal embedding failure (graceful degrade), never a
   crash and never a corrupting write. Find the write path in
   extensions/memory-core/src/memory/manager-sync-ops.ts (search the embed->upsert path) and add a
   dimension check before persistence. If a shared assert helper is cleaner, add one in
   extensions/memory-core/src/memory/embeddings.ts.

## Tests (MUST add, this is a persistence path)

Add/extend vitest specs under extensions/memory-core/src/memory/ (co-located \*.test.ts):

- a) fallback uses explicit `fallbackModel` (not the adapter defaultModel) when configured.
- b) fallback request carries the pinned outputDimensionality (3072), not the adapter native default.
- c) same-provider fallback (provider="openai", fallback="openai") is ALLOWED when fallbackModel differs,
  and still returns null when fallbackModel is absent (back-compat).
- d) dimension guard: a fallback embedding whose length != store vectorDims is rejected (no write,
  no throw to caller-as-crash) — degrades gracefully.
- e) back-compat: with no new fields set, behavior is byte-for-byte unchanged (existing tests pass).

## Build/verify gates (do all, report results)

- `npm run build` (or the repo's typecheck/build script) — zero errors.
- Run the memory-core test suite for the touched files (vitest) — all green, including new specs.
- Run `npm run lint` if present on touched files.
- DO NOT deploy. DO NOT run any reindex. DO NOT modify ~/.openclaw config.
- Leave a short SUMMARY.md at repo root: files changed, test names added, build+test output tail.

## Hard constraints

- memory-core + config schema only. Do not touch unrelated providers, chat-model fallback, or runtime.
- Preserve full back-compat: all new config fields optional; unset = today's behavior.
- No network calls in tests; mock adapters.
- Commit on this branch (feat/embedding-dimension-safe-fallback) with a clear message. Do NOT push, do NOT open a PR yet.
