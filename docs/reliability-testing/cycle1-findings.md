# Cycle 1 Findings

Date (UTC): 2026-07-09
Scope: anthropic, openai, google, openrouter, groq, slack, discord, telegram, whatsapp, elevenlabs

## 1) Google default-model contract drift (still present in this checkout)

- **Severity:** Medium
- **Extension:** `google`
- **Issue:** assertion drift between test expectations and normalized model refs.
- **Current status in this repo snapshot:** still failing in sandbox rerun (2 failed assertions in `extensions/google/default-model.test.ts`).

### Evidence

- `docs/reliability-testing/evidence/google.sandbox.rerun.json`
  - suites: 50 total / 48 passed / 2 failed
  - tests: 250 total / 248 passed / 2 failed
- `docs/reliability-testing/evidence/google.sandbox.rerun.vitest.log`
- failing callsites:
  - `extensions/google/default-model.test.ts:10`
  - `extensions/google/default-model.test.ts:18`

### Root cause

- `extensions/google/onboard.ts` sets `GOOGLE_GEMINI_DEFAULT_MODEL = "google/gemini-3.1-pro-preview"`.
- Shared provider-onboard normalization emits canonical refs (`google/~google/gemini-pro-latest`).
- Deep-equality assertions in `default-model.test.ts` compare against the non-normalized constant and fail.

### Recommended remediation

- Align default constant + tests with normalized canonical model refs, or normalize expected values before deep-equal assertions.

---

## 2) OpenAI live failure is a configuration defect (not provider outage)

- **Severity:** High (for live reliability signal)
- **Extension:** `openai`
- **Classification:** Environment/config defect.

### Evidence

- Aggregate live run summary: `docs/reliability-testing/evidence/cycle1-live-results.jsonl` (`openai` exit code 1).
- Structured report: `docs/reliability-testing/evidence/openai.live.json`.
- Failing callsite: `extensions/openai/openai-provider.live.test.ts:182` (`client.responses.create(...)`).
- Error shaping path: `src/agents/provider-http-errors.ts` (`createProviderHttpError`, `assertOkOrThrowProviderError`).
- Error text captured in live JSON/logs:
  - `401 Incorrect API key provided: sk-or-v1...`
  - `code=invalid_api_key`

### Root cause

- The value loaded into `OPENAI_API_KEY` is an OpenRouter-format key (`sk-or-v1...`), not a native OpenAI key (`sk-...`).
- OpenAI correctly rejects it with `401 invalid_api_key`.
- Therefore this is not an OpenAI availability incident; it is a key-to-env mapping defect.

### Remediation

1. Set `OPENAI_API_KEY` to a real OpenAI key (`sk-...`) for OpenAI live tests, **or**
2. Route OpenAI-format live tests to the correct environment variable/source and keep OpenRouter keys isolated to `OPENROUTER_API_KEY`.

---

## 3) Credential-gated live skips are expected and correctly classified

Live gating helper:

- `src/agents/live-test-helpers.ts` → `isLiveTestEnabled(extraEnvVars)` returns true if any of: provider-specific flags, `LIVE`, or `OPENCLAW_LIVE_TEST` are truthy.

### Google — 5 skipped (expected)

- **Observed:** 5 pending/skipped tests in `docs/reliability-testing/evidence/google.live.json`.
- **Gate logic:** `extensions/google/google.live.test.ts`
  - `LIVE = isLiveTestEnabled() && GOOGLE_API_KEY.length > 0`
  - `GOOGLE_API_KEY` resolves from `GEMINI_API_KEY || GOOGLE_API_KEY || GEMINI_PROVIDER_API_KEY`
- **Interpretation:** if global live flag and/or Gemini key are absent, suite is skipped by design.

### Discord — 1 skipped (expected)

- **Observed:** 1 pending/skipped test in `docs/reliability-testing/evidence/discord.live.json`.
- **Gate logic:** `extensions/discord/src/internal/live-smoke.live.test.ts`
  - `LIVE = isLiveTestEnabled(["DISCORD_LIVE_TEST"]) && DISCORD_BOT_TOKEN.length > 0`
- **Interpretation:** missing `DISCORD_BOT_TOKEN` and/or live flag causes expected skip.

### ElevenLabs — 3 skipped (expected)

- **Observed:** 3 pending/skipped tests in `docs/reliability-testing/evidence/elevenlabs.live.json`.
- **Gate logic:** `extensions/elevenlabs/elevenlabs.live.test.ts`
  - `LIVE = isLiveTestEnabled(["ELEVENLABS_LIVE_TEST"])`
  - `describeLive = LIVE && ELEVENLABS_API_KEY ? describe : describe.skip`
- **Interpretation:** skips are expected without both live toggle and `ELEVENLABS_API_KEY`.

### OpenRouter — 1 skipped (expected, cache sub-suite only)

- **Observed:** in `docs/reliability-testing/evidence/openrouter.live.json`, 1 passed + 1 skipped.
- **Gate logic:** `extensions/openrouter/openrouter.live.test.ts`
  - base live suite: `OPENCLAW_LIVE_TEST === "1" && OPENROUTER_API_KEY present`
  - cache suite additionally requires `OPENCLAW_LIVE_CACHE_TEST === "1"`
- **Interpretation:** core live check ran; cache-specific check skipped as expected without cache gate flag.

---

## 4) Prior “zero-coverage” list was stale

- `extension-test-matrix-v1.md` had listed seven packages as zero coverage.
- Current verification shows those packages already have tests and pass in sandbox-scoped execution.
- Evidence set:
  - `docs/reliability-testing/evidence/cycle1-zero-coverage-results.jsonl`
  - `docs/reliability-testing/evidence/{cerebras,copilot-proxy,media-understanding-core,open-prose,stepfun,tencent,voyage}.zero.json`
  - matching `.zero.vitest.log` files.
- Full package inventory check now reports **0 packages with no test files**:
  - `docs/reliability-testing/evidence/coverage-inventory.json`
