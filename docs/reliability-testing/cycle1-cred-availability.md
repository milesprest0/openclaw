# Cycle 1 Credential Availability (Auth + E2E Readiness)

Date (UTC): 2026-07-09  
Repo: `/home/miles/projects/openclaw-fork`  
Scope: `anthropic`, `openai`, `google`, `openrouter`, `groq`, `slack`, `discord`, `telegram`, `whatsapp`, `elevenlabs`

## Method

Credential availability was classified from repository evidence only:

1. Extension auth declarations (`openclaw.plugin.json`, auth runtime code).
2. Auth/authz test coverage (`*auth*.test.ts`, `*oauth*.test.ts`, `*authz*.test.ts`, `*permissions*.test.ts`, signature tests).
3. Live-test gates (`*.live.test.ts`, `OPENCLAW_LIVE_TEST`, provider-specific `*_LIVE_TEST` env checks).

No live external calls were executed for this document.

---

## Per-extension classification

| Extension  | Auth surface in code                                                                                                                                                                                                      | Sandbox/test credential signal                                                                                                                                      | Live credential signal in tests/code                                                                                                    | E2E readiness classification                                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| anthropic  | `providerAuthEnvVars.anthropic = [ANTHROPIC_OAUTH_TOKEN, ANTHROPIC_API_KEY]`; auth choices include `anthropic-cli`, `setup-token`, `api-key` (`extensions/anthropic/openclaw.plugin.json`)                                | No explicit vendor sandbox credential path found in extension tests/code                                                                                            | Real OAuth/API key tokens required by auth wiring; no synthetic-only E2E path for external provider calls                               | **Requires real Anthropic account credential** (OAuth/API key/setup token) for end-to-end external verification                                      |
| openai     | `providerAuthEnvVars.openai = [OPENAI_API_KEY]`; OpenAI Codex OAuth/device-code + API-key auth choices (`extensions/openai/openclaw.plugin.json`)                                                                         | No provider-side sandbox credential mode in integration tests; CLI `--sandbox` is local execution sandbox, not OpenAI test credential                               | Live tests gated by `OPENAI_API_KEY` + `OPENCLAW_LIVE_TEST=1` (`extensions/openai/openai.live.test.ts`, `openai-provider.live.test.ts`) | **Requires live OpenAI API key / real OpenAI account auth** for end-to-end external verification                                                     |
| google     | `providerAuthEnvVars.google = [GEMINI_API_KEY, GOOGLE_API_KEY]`; auth choices include API key + Gemini CLI OAuth (`extensions/google/openclaw.plugin.json`)                                                               | OAuth tests reference Google sandbox hostnames (`*.sandbox.googleapis.com`) in auth-flow test scaffolding (`extensions/google/oauth.shared.ts`, `oauth.test.ts`)    | Live tests gated by `isLiveTestEnabled()` + API key presence (`extensions/google/google.live.test.ts`)                                  | **Requires real Google API credential (or real OAuth account)** for full provider E2E; sandbox endpoints in tests do not remove live-credential need |
| openrouter | `providerAuthEnvVars.openrouter = [OPENROUTER_API_KEY]` (`extensions/openrouter/openclaw.plugin.json`)                                                                                                                    | No sandbox/test credential mode found                                                                                                                               | Live tests gated by `OPENROUTER_API_KEY` + `OPENCLAW_LIVE_TEST=1` (`extensions/openrouter/openrouter.live.test.ts`)                     | **Requires live OpenRouter API key** for end-to-end external verification                                                                            |
| groq       | Setup declares `authMethods: [api-key]`, `envVars: [GROQ_API_KEY]` (`extensions/groq/openclaw.plugin.json`)                                                                                                               | No sandbox/test credential mode found                                                                                                                               | No dedicated `.live.test.ts` in this extension, but provider contract is API-key based                                                  | **Requires live Groq API key** for real external E2E exercise                                                                                        |
| slack      | `channelEnvVars.slack = [SLACK_BOT_TOKEN, SLACK_APP_TOKEN, SLACK_USER_TOKEN]` (`extensions/slack/openclaw.plugin.json`); request-signature verification with HMAC secret (`extensions/slack/src/events-api/signature.ts`) | Extensive auth/signature/auth-error unit coverage (`monitor/auth.test.ts`, `provider.auth-errors.test.ts`, `approval-auth.test.ts`, `events-api/signature.test.ts`) | Runtime requires real Slack tokens/signing secret for actual Slack traffic                                                              | **Requires real Slack workspace/app credentials** for end-to-end channel verification                                                                |
| discord    | `channelEnvVars.discord = [DISCORD_BOT_TOKEN]` (`extensions/discord/openclaw.plugin.json`)                                                                                                                                | Authz/auth tests present (`dm-command-auth.test.ts`, `send.permissions.authz.test.ts`, `runtime.moderation.authz.test.ts`)                                          | Live smoke test gated by `isLiveTestEnabled(["DISCORD_LIVE_TEST"])` + token (`extensions/discord/src/internal/live-smoke.live.test.ts`) | **Requires real Discord bot token + real server/user context** for end-to-end channel verification                                                   |
| telegram   | `channelEnvVars.telegram = [TELEGRAM_BOT_TOKEN]` (`extensions/telegram/openclaw.plugin.json`)                                                                                                                             | Group auth coverage present (`bot-native-commands.group-auth.test.ts`)                                                                                              | Runtime throws when bot token missing (`extensions/telegram/src/monitor.ts`, `src/channel.ts`)                                          | **Requires real Telegram bot token/account context** for end-to-end channel verification                                                             |
| whatsapp   | No static API-key env var in plugin; runtime auth is persistent web login/session state (`hasAnyWhatsAppAuth`, QR login flow) (`extensions/whatsapp/auth-presence.ts`, `src/login.ts`)                                    | Auth store + approval auth tests exist (`approval-auth.test.ts`, `accounts.whatsapp-auth.test.ts`, `auth-store.test.ts`)                                            | Runtime instructs QR-linking a real WhatsApp account and persisted credentials                                                          | **Requires real WhatsApp account/device QR session** for end-to-end channel verification                                                             |
| elevenlabs | `providerAuthEnvVars.elevenlabs = [ELEVENLABS_API_KEY, XI_API_KEY]` (`extensions/elevenlabs/openclaw.plugin.json`)                                                                                                        | No dedicated sandbox credential mode found in extension code                                                                                                        | Live tests gated by `isLiveTestEnabled(["ELEVENLABS_LIVE_TEST"])` and key presence (`extensions/elevenlabs/elevenlabs.live.test.ts`)    | **Requires live ElevenLabs API key** for end-to-end speech/transcription verification                                                                |

---

## Auth/Authz test coverage snapshot (cycle-1)

- **anthropic:** no dedicated `*auth*.test.ts` / `*.live.test.ts` in extension root; auth behavior configured via provider-auth choices + CLI credential seams.
- **openai:** `openai-codex-auth-identity.test.ts`, `provider-auth.contract.test.ts`, plus live tests (`openai.live.test.ts`, `openai-tts.live.test.ts`, `openai-provider.live.test.ts`).
- **google:** `oauth.test.ts`, `oauth-token-shared.test.ts`, plus `google.live.test.ts`.
- **openrouter:** no dedicated auth unit tests found; has `openrouter.live.test.ts` gated by key + live flag.
- **groq:** no dedicated auth/live test files found in this extension.
- **slack:** `monitor/auth.test.ts`, `monitor/provider.auth-errors.test.ts`, `approval-auth.test.ts`, `events-api/signature.test.ts`.
- **discord:** `monitor/dm-command-auth.test.ts`, `send.permissions.authz.test.ts`, `actions/runtime.moderation.authz.test.ts`, plus `internal/live-smoke.live.test.ts`.
- **telegram:** `bot-native-commands.group-auth.test.ts`.
- **whatsapp:** `approval-auth.test.ts`, `accounts.whatsapp-auth.test.ts`, `auth-store.test.ts`.
- **elevenlabs:** `elevenlabs.live.test.ts`.

---

## Subset blocked on live credentials + approval

For **full end-to-end external integration exercise**, the following cycle-1 extensions are blocked pending real credential/account provisioning and approval:

1. anthropic
2. openai
3. google
4. openrouter
5. groq
6. slack
7. discord
8. telegram
9. whatsapp
10. elevenlabs

### Approval gate

- **Malaika sign-off required before executing any live-credential E2E run** (external provider/channel traffic, real-account data, or paid API usage).
- Sandbox-safe/unit-only verification is already covered in `cycle1-sandbox-safe-results.md`.
