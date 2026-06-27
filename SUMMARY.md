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
- `docs/.generated/config-baseline.sha256`
  - Regenerated config-surface baseline hash for the two new optional `memorySearch` fields (`pnpm config:docs:gen`); `pnpm config:docs:check` is green.

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

Commands (touched lanes: core prod, extension prod, extension test):

```bash
pnpm tsgo:core
pnpm tsgo:extensions
pnpm tsgo:extensions:test
```

Result: all three lanes exited clean with zero diagnostics.

### Config-surface baseline

Commands:

```bash
pnpm config:docs:gen
pnpm config:docs:check
```

Tail:

```text
OK docs/.generated/config-baseline.sha256
```

### Lint / format (touched files)

Commands:

```bash
pnpm exec oxfmt --check --threads=1 <touched files>
node scripts/run-oxlint.mjs --tsconfig config/tsconfig/oxlint.extensions.json <touched extension files>
node scripts/run-oxlint.mjs --tsconfig config/tsconfig/oxlint.core.json <touched core files>
```

Tail:

```text
All matched files use the correct format.
Found 0 warnings and 0 errors.
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
[test] passed 1 Vitest shard in 9.30s
```
