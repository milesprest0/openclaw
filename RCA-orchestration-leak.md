# RCA — Orchestration / Step-Narration Leak on Multi-Step Served-Deliverable Builds

**Status:** Root cause identified (read-only investigation). No code changed.
**Scope:** Internal prest0-vm engineering. Defect lives in the orchestration/streaming layer, confirmed.
**Symptom reproduced:** QA tests T4, T11, T10 — internal step-by-step narration leaks verbatim to the TOP of the user-facing Slack reply on multi-step "served-deliverable" builds (matter lookup → deliverable builder → PDF/DOCX gen → file serving). Pure-reasoning / translation turns (T5–T9) never leak.

---

## TL;DR

The streaming layer has exactly **one** mechanism that suppresses a model's _intermediate, pre-tool-call narration_ from the user-facing stream: the **assistant "phase" check** (`commentary` vs `final_answer`).

```
src/agents/pi-embedded-subscribe.handlers.messages.ts:40-41   shouldSuppressAssistantVisibleOutput()
src/agents/pi-embedded-subscribe.handlers.messages.ts:506      if (deliveryPhase === "commentary") return;
```

That phase metadata is **only ever produced by the direct OpenAI Responses transports** (`openai-transport-stream.ts`, `openai-ws-*`). It is **never produced** on the OpenRouter-routed Anthropic / Google / OpenAI-completions paths that production "Prest0 mode" actually runs on (Tier-17 ladder via the `fleetModelProxy`, all `openrouter/*`). The companion lever, `enforceFinalTag` (`<final>` enforcement), is likewise off for the `openrouter` provider.

Result: on every OpenRouter-routed turn, `deliveryPhase` is `undefined`, the commentary suppressor never fires, and **each block of pre-tool-call narration the model emits between tool calls is streamed straight to the user** (via `onPartialReply` / `onBlockReply`, flushed at `text_end` and again before tool execution). The finished deliverable is then appended below it — hence narration at the _top_ of the reply.

Pure-reasoning turns don't leak because they are single-message, zero-tool turns: the model goes straight to the final answer, there is no interleaved pre-tool narration to leak, and real chain-of-thought is carried in native reasoning fields / `<think>` tags that `stripBlockTags` already removes.

---

## 1. Root cause — exact code path

### 1a. The model emits interleaved narration on multi-step turns

On a served-deliverable build the model produces a single agent turn shaped as:

```
[assistant text: "I'll pull the controlling deadlines…"]  → tool_use(matter lookup)
[assistant text: "Confirmed new matter — no collision…"]  → tool_use(deliverable builder)
[assistant text: "The batch packager is for multi-file fax intake — not the right fit…"] → tool_use(pdf gen)
[assistant text: "Both files are built and confirmed in the served folder."] → (final)
```

Each leading text block is genuine assistant `text` content (NOT a tool summary — tool summaries are emitted separately via `emitToolSummary`). This interleaving only happens on multi-tool turns. That is the material the user sees leaked.

### 1b. The streaming layer surfaces that text to the user

`handleMessageUpdate` processes every `text_delta` / `text_end`:

- **File:** `src/agents/pi-embedded-subscribe.handlers.messages.ts`
- **Lines ~404-660** (the `text_delta`/`text_start`/`text_end` branch).

The only gate that would stop intermediate narration is the phase check:

```ts
// :40-41
function shouldSuppressAssistantVisibleOutput(message) {
  return resolveAssistantMessagePhase(message) === "commentary";
}
// :415   const assistantPhase = resolveAssistantMessagePhase(msg);
// :487   const deliveryPhase = resolveAssistantMessagePhase(partialAssistant);
// :506   if (deliveryPhase === "commentary") return;   // <-- THE suppressor
```

When `deliveryPhase` is `undefined` (all non-Responses providers), control falls through to:

- `appendBlockReplyChunk(ctx, chunk)` (`:520`) — buffers the narration as a deliverable chunk, and
- the `onPartialReply` / `emitAgentEvent` emission (`:610-624`), and
- the `text_end` → `flushBlockReplyBuffer(... final:true)` flush (`:640-655`),
- plus the pre-tool flush in `handleToolExecutionStart` → `ctx.flushBlockReplyBuffer()` (`src/agents/pi-embedded-subscribe.handlers.tools.ts:848-853`).

So each narration block is delivered to Slack as a block reply _before the next tool runs_, stacking up at the top of the thread reply.

### 1c. Phase metadata is OpenAI-Responses-only

`resolveAssistantMessagePhase` (`src/shared/chat-message-content.ts:64-90`) reads either `message.phase` or a `textSignature` JSON blob `{v:1, phase}`. The only producers of that metadata are:

```
src/agents/openai-transport-stream.ts        (encodeTextSignatureV1, phase tagging :200-214,:576)
src/agents/openai-ws-message-conversion.ts   (normalizeAssistantPhase, phase assignment :387-649)
src/agents/openai-ws-stream.ts               (:1009-1136)
src/agents/openai-ws-types.ts                ("commentary" | "final_answer" :1)
```

Grep for who _sets_ phase on a message (non-test) returns only `acp-spawn-parent-stream.ts`, the three OpenAI files above, and `subagent-registry.ts`. **No Anthropic, no Google, no OpenAI-completions, no OpenRouter transport ever stamps phase.**

### 1d. The production runtime is OpenRouter, so the suppressor is dead code there

- Local pin: `~/.openclaw/openclaw.json:44` → `"primary": "openrouter/google/gemini-3.5-flash"`.
- In Prest0 mode the egress `baseUrl` is the `fleetModelProxy` Cloud Function, which rewrites traffic onto the **Tier-17 ladder** — `openrouter/~anthropic/claude-opus-latest` → `openrouter/~google/gemini-pro-latest` → `openrouter/~openai/gpt-latest` (per `MEMORY.md:43`). All `openrouter/*`.
- For provider `openrouter`, `isReasoningTagProvider()` → `resolveReasoningOutputMode()` returns `"native"` (only `google-generative-ai` is built-in `"tagged"`: `src/utils/provider-utils.ts:9-11,66-87`). So `enforceFinalTag` is **false** (`src/auto-reply/reply/agent-runner-run-params.ts:13-27`, `src/auto-reply/reply/get-reply-run.ts:1082-1089`).

Net: **both** suppression levers (phase-commentary AND `<final>`-tag enforcement) are keyed to providers/transports that are not in the production path. There is **no active suppressor** on the OpenRouter path → every pre-tool narration block reaches the user.

---

## 2. Why pure-reasoning turns don't leak but multi-step served-deliverable turns do

|                            | Pure-reasoning / translation (T5–T9)                               | Multi-step served-deliverable (T4, T10, T11)                          |
| -------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Tool calls in the turn     | none                                                               | several (lookup → builder → gen → serve)                              |
| Assistant messages         | one terminal message                                               | one message containing interleaved text + multiple `tool_use` blocks  |
| Pre-tool narration text    | none produced                                                      | one visible `text` block before each tool call                        |
| Chain-of-thought handling  | native reasoning fields / `<think>` → stripped by `stripBlockTags` | not thinking — these are real `text` content blocks, not stripped     |
| Suppressor that would help | n/a (nothing to suppress)                                          | phase==="commentary" — but phase is `undefined` on OpenRouter → no-op |
| Outcome                    | clean                                                              | narration streamed to top of reply, deliverable appended below        |

The differentiator is **interleaved pre-tool-call assistant text**, which only multi-tool turns generate. It is genuine visible `text` content (not native reasoning), so the reasoning-stripping path does nothing, and the only thing designed to catch it (phase-commentary) is inert off-Responses. This exactly matches the isolation facts: independent of file uploads (T10/T11 attachment-free, T4 upload — all leaked), and the deliverable files themselves are always clean (the leak is purely presentation/streaming at the chat layer).

---

## 3. Proposed fix (ONE path; do **not** apply here)

**Principle:** make the "suppress intermediate narration, deliver only the final answer" decision **deterministic and provider-independent**, instead of relying on OpenAI-Responses-only `phase` metadata. Generalize the existing commentary suppressor so a non-terminal (tool-using) assistant message's visible text is withheld from the user stream on _all_ providers — mirroring the behavior the Responses path already gets for free.

### Deterministic signal available on every provider

An assistant message that is **not the final answer** is reliably identifiable without phase metadata:

- it contains a structured tool invocation (`toolCall` / `toolUse` / `tool_call` / `tool_use` / `functionCall` block), and/or
- `message.stopReason === "toolUse"` (set by every transport: `anthropic-transport-stream.ts:467`, `openai-transport-stream.ts:640-642`, etc.).

A helper already exists: `hasStructuredToolInvocation(message)` in `src/agents/pi-embedded-subscribe.tool-text-diagnostics.ts:8-30`.

### File/function-level diff (description only)

1. **`src/shared/chat-message-content.ts`** — add a tiny exported predicate, e.g.
   `isNonFinalAssistantMessage(message): boolean` that returns true when the message has a structured tool-call block or `stopReason === "toolUse"`. (Pure, reusable, no transport coupling.)

2. **`src/agents/pi-embedded-subscribe.handlers.messages.ts`**
   - Extend `shouldSuppressAssistantVisibleOutput()` (`:40-41`) to also return `true` when `isNonFinalAssistantMessage(message)` is true — i.e. treat a tool-using assistant message's visible text as commentary, regardless of provider. Gate behind a config/runtime flag (e.g. `suppressNonFinalAssistantText`, default ON for non-Responses providers) so the existing phase-driven Responses behavior is preserved and there is a kill switch.
   - In the `handleMessageUpdate` streaming branch, treat this the same as `deliveryPhase === "commentary"` at `:506` (early-return / do not append to block buffer, do not `onPartialReply`). Because the tool-call disposition for non-Responses providers is only known at message boundary, the streamed pre-tool text must be **buffered and withheld** rather than flushed at `text_end`: hold the block-reply flush and, at `handleToolExecutionStart` (`tools.ts:848`), **discard** the buffered visible text for that message instead of flushing it (keep it in the transcript only). Only a _terminal_ assistant message (no tool call / `stopReason==="stop"`) flushes its text to the user.
   - Equivalent guard at `handleMessageEnd` (`:663-664`): if the message is non-final, skip the `emitSplitResultAsBlockReply` / `emitAgentEvent` visible-text emission.

3. **(Alternative, lower-risk variant)** Force `blockReplyBreak: "message_end"` for these turns and suppress non-final messages at `message_end` only — avoids streaming-time buffering complexity, at the cost of less granular streaming. Either variant lands the same user-visible result.

This is the deterministic, server-side enforcement consistent with the existing user-facing-voice-discipline (the SOUL.md "never narrate technical internals" rule) — it does not depend on the model cooperating, on prompt wording, or on provider-specific metadata.

> Note: this intentionally suppresses _all_ pre-tool assistant prose on multi-tool turns, which is exactly what the OpenAI Responses path already does via `phase==="commentary"`. If product wants to keep _some_ interim progress text, that should be an explicit, separately-styled progress event — not raw model narration.

---

## 4. Regression test design

Add `src/agents/pi-embedded-subscribe.suppresses-non-final-tool-narration.test.ts` (mirrors the existing `…suppresses-commentary-phase-output.test.ts` harness, but **without** any `phase` metadata, to represent the OpenRouter path):

1. **Multi-step served-deliverable simulation, no phase metadata.** Drive the stub session through:
   - `message_start` → text_delta "I'll pull the controlling deadlines…" → `tool_use` block (stopReason `toolUse`) → `message_end`
   - tool_execution_start / tool_execution_end
   - second assistant message "The batch packager is for…" + `tool_use` → end
   - terminal assistant message "Here is your demand letter. [ATTORNEY REVIEW REQUIRED]" with `stopReason: "stop"`, no tool block.
   - **Assert:** `onBlockReply` / `onPartialReply` are called **only** with the terminal text; none of the leaked phrases ("I'll pull…", "batch packager", "served folder", "Confirmed this is a new matter") ever appear in any emitted payload. `subscription.assistantTexts` (transcript) may still contain them.

2. **Anti-regression — pure-reasoning turn still delivered.** Single terminal message, no tool call, no phase → asserts the text IS delivered (guards against over-suppression of T5–T9-style turns).

3. **Anti-regression — OpenAI Responses path unchanged.** Re-run the existing commentary-phase test to confirm phase-driven suppression still works.

4. **Leak-phrase guard (cheap canary).** A table-driven assertion that, for a representative multi-tool turn, the concatenation of all `onBlockReply` payload texts contains none of a denylist of internal terms (tool/route names, "served folder", matter-collision phrasing).

---

## 5. Risk / blast-radius assessment

**Yes — the fix touches the production turn/streaming layer.** `pi-embedded-subscribe.handlers.messages.ts`, `…handlers.tools.ts`, and `chat-message-content.ts` are on the hot path for **every** assistant turn on every channel (Slack, etc.) and every provider. Changing what reaches `onBlockReply` / `onPartialReply` is high-blast-radius:

- **Over-suppression risk:** legitimate interim text the product wants to keep could be dropped; a single-message turn mis-classified as "non-final" would swallow the whole reply. Mitigation: gate behind a default-ON-but-overridable flag + the dedicated "terminal message still delivers" regression test.
- **Streaming-timing risk:** buffering pre-tool text until message boundary changes perceived latency/streaming granularity; interacts with `blockReplyBreak` (default `text_end`), the block chunker, reply directives, and the pre-tool `flushBlockReplyBuffer`. The lower-risk `message_end` variant reduces this surface.
- **Provider-matrix risk:** must verify Anthropic, Google, OpenAI-completions, **and** OpenAI Responses (which already works via phase) all behave; the change must be additive to the phase path, not a replacement.

**Conclusion: FULL 6-phase SDLC required before ship** (spec → review → implement → test incl. provider-matrix + streaming regression → staged rollout behind flag → verify in QA against T4/T10/T11 reproduction). Do **not** hotfix directly on the turn/streaming layer.

---

## Appendix — key file/line references

- `src/agents/pi-embedded-subscribe.handlers.messages.ts:40-41,408,415,487,506,520,610-624,640-655,663-664` — suppression gate + emission path
- `src/shared/chat-message-content.ts:22-90` — phase types + `resolveAssistantMessagePhase`
- `src/agents/openai-transport-stream.ts:200-214,576-577` / `openai-ws-message-conversion.ts:387-649` / `openai-ws-stream.ts:1009-1136` — the ONLY phase producers
- `src/agents/pi-embedded-subscribe.handlers.tools.ts:848-853` — pre-tool `flushBlockReplyBuffer`
- `src/agents/pi-embedded-subscribe.tool-text-diagnostics.ts:8-30` — reusable `hasStructuredToolInvocation`
- `src/utils/provider-utils.ts:9-11,66-87` — `isReasoningTagProvider` / reasoning-output-mode (google-generative-ai only)
- `src/auto-reply/reply/agent-runner-run-params.ts:13-27`, `get-reply-run.ts:1082-1089`, `get-reply-directives.ts:531-532` — `enforceFinalTag` wiring + default `blockReplyBreak: "text_end"`
- `~/.openclaw/openclaw.json:44` + `MEMORY.md:43` — production routes via `openrouter/*` / `fleetModelProxy` Tier-17, so phase metadata is never present
