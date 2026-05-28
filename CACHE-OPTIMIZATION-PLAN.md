# Anthropic Prompt-Cache Optimization — Phased Plan (2026-05-28)

Context: This fleet's primary model pin is `~anthropic/claude-opus-latest` routed via
**OpenRouter** (endpointClass `openrouter`). The cache_control injection path for
OpenRouter is `proxy-stream-wrappers.ts::createOpenRouterSystemCacheWrapper` →
`applyAnthropicEphemeralCacheControlMarkers(payloadObj)`.

## Architecture findings (verified by reading source + tests)

There are TWO distinct Anthropic cache paths:

1. **Anthropic-direct** (`anthropic-transport-stream.ts` → `applyAnthropicPayloadPolicyToParams`):
   - HONORS the `<!-- OPENCLAW_CACHE_BOUNDARY -->` split (cached stable prefix + uncached
     dynamic suffix), supports `ttl: "1h"` via `cacheRetention: "long"`, strips boundary
     when caching disabled. Fully built + tested.

2. **OpenRouter** (`applyAnthropicEphemeralCacheControlMarkers`): **THIS IS THE PATH WE USE.**
   - Marks only the LAST content block of each `system`/`developer` message with
     `cache_control: { type: "ephemeral" }`.
   - System message arrives as a single STRING → becomes ONE text block → ONE marker at end.
   - DOES NOT split on `OPENCLAW_CACHE_BOUNDARY`. The boundary comment is inert text
     embedded inside the single cached block.
   - Emits NO `ttl` (Anthropic default 5-minute ephemeral).
   - Single breakpoint only.

Bootstrap assembly (`system-prompt.ts`):

- `CONTEXT_FILE_ORDER`: agents(10) soul(20) identity(30) user(40) tools(50) bootstrap(60) memory(70).
- `DYNAMIC_CONTEXT_FILE_BASENAMES = {heartbeat.md}` → only HEARTBEAT lands below boundary.
- **MEMORY.md is ABOVE the boundary (stable/cached region).** We edit it daily (memory
  dreaming cron 03:00 UTC, promotions, rolling session logs) → every edit busts the prefix.
- The boundary is emitted at the very end of the stable section; dynamic files + channel/
  messaging/voice/heartbeat/runtime go below it. But on OpenRouter NONE of this split is
  honored at injection time — it's all one cached block.

## Phase 1 — Stable/volatile prefix split (biggest lever)

Two coordinated changes:

1. **Teach the OpenRouter marker path to honor the boundary split.** In
   `applyAnthropicEphemeralCacheControlMarkers`, for `system`/`developer` messages whose
   (string or single-text-block) content contains `OPENCLAW_CACHE_BOUNDARY`, split into:
   - stable-prefix text block WITH `cache_control` (the cache write/read point), then
   - dynamic-suffix text block WITHOUT `cache_control`,
     and strip the boundary marker from both. Mirrors the Anthropic-direct behavior.
     If no boundary present, preserve current behavior exactly (mark last block).

2. **Move MEMORY.md below the boundary** by adding `memory.md` to
   `DYNAMIC_CONTEXT_FILE_BASENAMES`. Identity/rules (AGENTS/SOUL/IDENTITY/USER/TOOLS) stay
   in the cached prefix; the daily-churn MEMORY.md drops into the uncached suffix.

Net: daily MEMORY/HEARTBEAT edits no longer invalidate the large identity/tools prefix.

## Phase 2 — TTL alignment by surface

OpenRouter path currently hardcodes `{ type: "ephemeral" }` (5m). Thread a retention
signal into `createOpenRouterSystemCacheWrapper` so high-prefix / long-session surfaces can
emit `ttl: "1h"` (long) while rapid internal Slack stays 5m. Conservative default = short.
Gate long TTL behind explicit opt-in (config/env), never implicit.

## Phase 3 — Multi-breakpoint placement

Anthropic allows up to 4 cache breakpoints. Add a breakpoint at the tools-definition
boundary (so the large, never-changing tool schema caches independently of the system
prefix) and keep the stable-system breakpoint. This isolates tool-schema cache from
conversation-tail churn. Implement only after Phase 1+2 verified.

## Discipline (every phase)

- Read → change → `npm run build` → targeted vitest → live verify on OpenRouter → report.
- No phase starts until prior phase is verified live.
- Backups + commit per phase. Push to origin/main after live verification.
