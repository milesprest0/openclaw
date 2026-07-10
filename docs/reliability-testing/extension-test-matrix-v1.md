# External Integration Reliability — Test Matrix v1

_Generated 2026-07-03 from live `extensions/` tree. Task: "Reliability test of external applications & integrations" (Notion, owner Malaika)._

## Inventory (ground truth)

- **119 real extension packages** (have `package.json`) under `extensions/`. (The dir shows ~125 entries; the extra 6 are stray files/tsconfig, not packages.)
- **112 already ship test files**; only **7 have ZERO test coverage**: `cerebras`, `copilot-proxy`, `media-understanding-core`, `open-prose`, `stepfun`, `tencent`, `voyage`.
- Auth-pattern detection (static grep of source, excluding `.test.ts`): API-key, OAuth, and webhook-signature signals captured per package (below).

## Category breakdown

**A. LLM / inference providers (API-key, in or adjacent to routing ladder):**
anthropic, anthropic-vertex, openai, openrouter, groq, google, xai, deepseek, mistral, moonshot, minimax, together, fireworks, deepinfra, perplexity, cerebras*, huggingface, nvidia, ollama, lmstudio, vllm, sglang, litellm, venice, arcee, chutes, qianfan, volcengine, byteplus, zai, xiaomi, stepfun*, synthetic, gradium, kimi-coding, qwen, alibaba, amazon-bedrock, amazon-bedrock-mantle, microsoft-foundry, cloudflare-ai-gateway, vercel-ai-gateway, tokenjuice, kilocode, copilot-proxy\*, github-copilot

**B. Messaging / channel integrations (OAuth + webhook-signature — HIGHEST inbound-security priority):**
slack, discord, telegram, whatsapp, msteams, feishu, googlechat, matrix, mattermost, line, signal, imessage, irc, nostr, tlon, twitch, qqbot, zalo, zalouser, nextcloud-talk, synology-chat, google-meet, webhooks

**C. Search / web tools (API-key):**
brave, exa, tavily, firecrawl, perplexity, duckduckgo, searxng, web-readability

**D. ACP / coding harnesses:**
codex, opencode, opencode-go, acpx, migrate-claude, migrate-hermes

**E. Voice / speech / media (API-key):**
elevenlabs, deepgram, azure-speech, inworld, senseaudio, speech-core, talk-voice, voice-call, tts-local-cli, image-generation-core, video-generation-core, media-understanding-core\*, comfy, fal, runway, music-generation, vydra

**F. Infra / core / local (no external auth):**
browser, bonjour, canvas, diffs, device-pair, diagnostics-otel, diagnostics-prometheus, document-extract, file-transfer, llm-task, lobster, memory-core, memory-lancedb, memory-wiki, openshell, phone-control, skill-workshop, thread-ownership, test-support, qa-channel, qa-lab, qa-matrix

_\* = zero existing test coverage (priority gap)_

## Webhook/signature-verifying extensions (inbound spoofing risk — test signature validation explicitly)

codex, discord, line, matrix, mattermost, nextcloud-talk, slack, synology-chat, telegram, voice-call, webhooks, zalo

## First-cycle sample selection (per stratified strategy)

**Full high-traffic/critical set (always tested every cycle):**

- LLM ladder: anthropic, openai, openrouter, groq
- Channels: slack, discord, whatsapp, telegram
- Voice: elevenlabs

**Rotating representative sample (2–3 per remaining category, cycle 1):**

- Search/tools: brave, tavily
- ACP harnesses: codex, opencode
- Infra: memory-core, browser
- Zero-coverage backfill (priority): voyage, cerebras (add contract tests where none exist)

## Per-extension check contract (3 checks each)

1. **Authentication** — API key / OAuth token / webhook signature validated correctly; expired/invalid creds rejected cleanly.
2. **Request/response contract** — request shape and response parsing match current provider API (catch silent API drift).
3. **Failure handling** — timeout, provider 4xx/5xx, and invalid-cred paths degrade gracefully (retry/backoff where designed).

## Guardrails

- Default vehicle = repo automated suites + **provider sandbox credentials**.
- Any test requiring live paid round-trips or real account data is **sampled minimally and gated behind explicit Malaika sign-off** (per task spec + no-proactive-action rule).
- Every confirmed defect routes through the SDLC remediation loop (owner, severity, re-test gate before close).

## Next steps

1. Malaika review of category split + cycle-1 sample.
2. Enumerate sandbox-cred availability per cycle-1 extension (which vendors offer test creds vs. require live keys → flags the sign-off subset).
3. Build the regression checklist template (3 checks × sample) and run the sandbox-safe subset first.
