# Dimension-Safe Fallback Implementation Summary

## Files changed

- `src/config/types.tools.ts`
  - Added optional `memorySearch.fallbackModel` and `memorySearch.fallbackOutputDimensionality`.
- `src/config/zod-schema.agent-runtime.ts`
  - Added schema support for `fallbackModel` and `fallbackOutputDimensionality`.
- `src/config/schema.help.ts`
  - Added help text for both new memory-search fallback fields.
- `src/config/schema.labels.ts`
  - Added UI labels for both new memory-search fallback fields.
- `src/agents/memory-search.ts`
  - Extended `ResolvedMemorySearchConfig` with `fallbackModel` and `fallbackOutputDimensionality`.
  - Merge/default behavior now resolves:
    - `fallbackModel` from defaults/overrides.
    - `fallbackOutputDimensionality` from explicit fallback value, else primary `outputDimensionality`.
- `extensions/memory-core/src/memory/manager-provider-state.ts`
  - Fallback request now prefers `settings.fallbackModel` over adapter default model.
  - Fallback request now uses `settings.fallbackOutputDimensionality ?? settings.outputDimensionality`.
  - Same-provider fallback is now allowed only when `fallbackModel` is explicitly set; otherwise unchanged no-op behavior.
- `extensions/memory-core/src/memory/embeddings.ts`
  - Added reusable embedding-dimension mismatch helpers and mismatch error classifier.
- `extensions/memory-core/src/memory/manager-embedding-ops.ts`
  - Added dimension guard before persistence path; throws mismatch error before any writes when pinned/vector dims do not match.
- `extensions/memory-core/src/memory/manager-sync-ops.ts`
  - Added pinned-vector-dimension tracking through reindex paths.
  - Added graceful handling for dimension mismatch errors (log, keep existing index, no crash).
- `extensions/memory-core/src/memory/manager.mistral-provider.test.ts`
  - Added/extended fallback resolver specs for model, dimensionality, same-provider rules, and back-compat.
- `extensions/memory-core/src/memory/index.test.ts`
  - Added integration spec that verifies mismatch fallback vectors are rejected without corrupting writes or crashing sync.
- `extensions/memory-core/src/memory/embeddings.test.ts`
  - Added helper-level mismatch detection/classifier tests.

## New required tests added

- `uses explicit fallbackModel instead of fallback adapter defaultModel`
- `uses fallbackOutputDimensionality for fallback requests`
- `allows same-provider fallback only when fallbackModel is configured`
- `rejects fallback embeddings that do not match pinned vector dimensions without crashing`
- `keeps fallback request behavior unchanged when new fields are unset`

## Verification run log tails

### Build

Command:

```bash
pnpm build
```

Tail:

```text
[build-all] write-build-info
[build-all] write-cli-startup-metadata
[build-all] write-cli-compat
```

### Typecheck

Command:

```bash
pnpm tsgo
```

Tail:

```text
> openclaw@2026.5.6 tsgo:core /tmp/embed-fallback-20260627-190824
> node scripts/run-tsgo.mjs -p tsconfig.core.json --incremental --tsBuildInfoFile .artifacts/tsgo-cache/core.tsbuildinfo
```

### Lint

Command:

```bash
pnpm lint
```

Tail:

```text
Found 0 warnings and 0 errors.
Finished in 18.0s on 5195 files with 213 rules using 1 threads.
[oxlint:extensions] finished
```

### Memory-core tests

Command:

```bash
pnpm test "extensions/memory-core/src/memory"
```

Tail:

```text
Test Files  35 passed (35)
Tests      317 passed (317)
[test] passed 1 Vitest shard in 9.67s
```
