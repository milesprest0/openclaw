# Cycle 1 Closeout — External Integration Reliability (Non-Live-Credential Closeout)

Date (UTC): 2026-07-09  
Repo: `/home/miles/projects/openclaw-fork`  
Scope baseline: `anthropic`, `openai`, `google`, `openrouter`, `groq`, `slack`, `discord`, `telegram`, `whatsapp`, `elevenlabs`

## Executive summary

Cycle 1 sandbox-safe reliability execution completed for the 10 target integrations, with all non-live provider/channel suites green except a known Google default-model assertion drift in this checkout. The previously reported "zero-coverage" packages were re-verified and found to already contain test files; each of those tests passes under sandbox-scoped Vitest execution. Live subset evidence confirms one true blocker (OpenAI key/env misconfiguration) and expected credential-gated skips for Google/Discord/ElevenLabs/OpenRouter cache.

## 1) Sandbox-safe status (including zero-coverage verification)

### A. Cycle-1 target integrations

Evidence bundle:

- `docs/reliability-testing/evidence/cycle1-results.jsonl`
- per-integration logs under `docs/reliability-testing/evidence/*.vitest.log`

Current interpretation:

- Sandbox-safe coverage for the Cycle-1 target stack is functionally complete.
- In this checkout, Google still shows a deterministic test assertion drift in `extensions/google/default-model.test.ts` (2 failing tests) when run via scoped provider config.
- This is tracked as a test-contract issue, not a runtime outage.

Google rerun evidence:

- `docs/reliability-testing/evidence/google.sandbox.rerun.json`
- `docs/reliability-testing/evidence/google.sandbox.rerun.vitest.log`

### B. “Zero-coverage” package verification (reconciled)

Re-run results are captured in:

- `docs/reliability-testing/evidence/cycle1-zero-coverage-results.jsonl`
- `docs/reliability-testing/evidence/{cerebras,copilot-proxy,media-understanding-core,open-prose,stepfun,tencent,voyage}.zero.json`
- matching `.zero.vitest.log` files.

Verified packages + outcomes:

1. `cerebras` — `extensions/cerebras/index.test.ts` — pass (6/6)
2. `copilot-proxy` — `extensions/copilot-proxy/index.test.ts` — pass (4/4)
3. `media-understanding-core` — `extensions/media-understanding-core/image-ops.test.ts` — pass (5/5)
4. `open-prose` — `extensions/open-prose/index.test.ts` — pass (2/2)
5. `stepfun` — `extensions/stepfun/provider-catalog.test.ts` — pass (7/7)
6. `tencent` — `extensions/tencent/provider-catalog.test.ts` — pass (6/6)
7. `voyage` — `extensions/voyage/embedding-provider.test.ts` — pass (7/7)

Package-level inventory check:

- `docs/reliability-testing/evidence/coverage-inventory.json`
- Result: `119` extension packages discovered, `0` packages with no test files.

Conclusion: prior “zero-coverage” label was stale; these packages are already covered and pass in sandbox scope.

## 2) Live subset status

Live evidence files:

- `docs/reliability-testing/evidence/cycle1-live-results.jsonl`
- `docs/reliability-testing/evidence/{openai,google,openrouter,discord,elevenlabs}.live.json`
- `docs/reliability-testing/evidence/{openai,google,openrouter,discord,elevenlabs}.live.vitest.log`

### A. OpenAI: config-defect blocker (not provider reliability outage)

- Failing callsite: `extensions/openai/openai-provider.live.test.ts:182`
- Error formatting path: `src/agents/provider-http-errors.ts` (`createProviderHttpError` / `assertOkOrThrowProviderError`)
- Observed error: `401 Incorrect API key provided: sk-or-v1...` with `code=invalid_api_key`

Assessment:

- `OPENAI_API_KEY` is populated with an OpenRouter-format key (`sk-or-v1...`) rather than a native OpenAI key (`sk-...`).
- Classification: environment/config defect.

Remediation:

1. Provide valid OpenAI `sk-...` material in `OPENAI_API_KEY`, or
2. Correct key routing so OpenRouter credentials remain in `OPENROUTER_API_KEY` only.

### B. Credential-gated pending live tests: expected skips

Gate helper:

- `src/agents/live-test-helpers.ts` → `isLiveTestEnabled(extraEnvVars)` (provider-specific flags OR `LIVE` OR `OPENCLAW_LIVE_TEST`).

Observed pending counts and rationale:

- Google: **5 pending** (`extensions/google/google.live.test.ts`)  
  Gate requires live flag + one of `GEMINI_API_KEY` / `GOOGLE_API_KEY` / `GEMINI_PROVIDER_API_KEY`.
- Discord: **1 pending** (`extensions/discord/src/internal/live-smoke.live.test.ts`)  
  Gate requires live flag (`DISCORD_LIVE_TEST` or global) + `DISCORD_BOT_TOKEN`.
- ElevenLabs: **3 pending** (`extensions/elevenlabs/elevenlabs.live.test.ts`)  
  Gate requires live flag (`ELEVENLABS_LIVE_TEST` or global) + `ELEVENLABS_API_KEY`.
- OpenRouter: **1 pending** (`extensions/openrouter/openrouter.live.test.ts`)  
  Base live test executed; cache test is additionally gated by `OPENCLAW_LIVE_CACHE_TEST=1`.

These are expected control-plane skips, not failures.

## 3) Risks and impact

1. **OpenAI live signal is currently invalidated by credential wiring**  
   Reliability conclusion for OpenAI cannot be made until key routing is corrected.
2. **Google sandbox suite has a standing assertion-contract mismatch**  
   Low operational risk to runtime behavior, but medium release-gate noise risk unless reconciled.
3. **Live pending tests remain non-executed by design without approved credentials/flags**  
   This is acceptable for non-live closeout but leaves residual uncertainty for full E2E behavior.

## 4) Go / No-Go recommendation (Cycle 1)

**Recommendation: CONDITIONAL GO for Cycle-1 non-live closeout; NO-GO for claiming full live reliability completion.**

- **GO** for sandbox-safe closeout and test-coverage reconciliation (including prior zero-coverage claims).
- **NO-GO** for final live reliability sign-off until:
  1. OpenAI credential mapping defect is fixed and live suite reruns clean.
  2. Credential-gated live pending cases are intentionally executed with approved live creds/toggles (or explicitly deferred with owner sign-off).

## 5) Evidence index

- Findings: `docs/reliability-testing/cycle1-findings.md`
- Sandbox summary: `docs/reliability-testing/cycle1-sandbox-safe-results.md`
- Credential readiness: `docs/reliability-testing/cycle1-cred-availability.md`
- Live run aggregate: `docs/reliability-testing/evidence/cycle1-live-results.jsonl`
- Zero-coverage reconciliation: `docs/reliability-testing/evidence/cycle1-zero-coverage-results.jsonl`
- Zero-test inventory check: `docs/reliability-testing/evidence/coverage-inventory.json`
