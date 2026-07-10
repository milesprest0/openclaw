import {
  a as OPENCLAW_RUNTIME_CONTEXT_NOTICE,
  i as OPENCLAW_RUNTIME_CONTEXT_CUSTOM_TYPE,
  o as OPENCLAW_RUNTIME_EVENT_HEADER,
  r as OPENCLAW_NEXT_TURN_RUNTIME_CONTEXT_HEADER,
} from "./internal-runtime-context-DfXSY94W.js";
import { y as truncateUtf16Safe } from "./utils-BGRcpLKt.js";
//#region src/agents/pi-embedded-runner/run/runtime-context-prompt.ts
const OPENCLAW_RUNTIME_EVENT_USER_PROMPT = "Continue the OpenClaw runtime event.";
const MAX_CURRENT_TURN_CONTEXT_STRING_CHARS = 2e3;
function neutralizeMarkdownFences(value) {
  return value.replaceAll("```", "`​``");
}
function truncateCurrentTurnContextString(value) {
  if (value.length <= MAX_CURRENT_TURN_CONTEXT_STRING_CHARS) return value;
  return `${truncateUtf16Safe(value, Math.max(0, MAX_CURRENT_TURN_CONTEXT_STRING_CHARS - 14)).trimEnd()}…[truncated]`;
}
function sanitizeCurrentTurnContextString(value) {
  return neutralizeMarkdownFences(truncateCurrentTurnContextString(value.replaceAll("\0", "")));
}
function buildCurrentTurnPromptContextSuffix(context) {
  const replyChain = context?.replyChain?.filter(
    (entry) =>
      entry.body?.trim() ||
      entry.mediaType?.trim() ||
      entry.mediaPath?.trim() ||
      entry.mediaRef?.trim(),
  );
  if (replyChain && replyChain.length > 0) {
    const payload = replyChain.map((entry) => ({
      message_id: entry.messageId ? sanitizeCurrentTurnContextString(entry.messageId) : void 0,
      thread_id: entry.threadId ? sanitizeCurrentTurnContextString(entry.threadId) : void 0,
      sender: entry.sender ? sanitizeCurrentTurnContextString(entry.sender) : void 0,
      sender_id: entry.senderId ? sanitizeCurrentTurnContextString(entry.senderId) : void 0,
      sender_username: entry.senderUsername
        ? sanitizeCurrentTurnContextString(entry.senderUsername)
        : void 0,
      timestamp: entry.timestamp,
      body: entry.body ? sanitizeCurrentTurnContextString(entry.body) : void 0,
      is_quote: entry.isQuote === true ? true : void 0,
      media_type: entry.mediaType ? sanitizeCurrentTurnContextString(entry.mediaType) : void 0,
      media_path: entry.mediaPath ? sanitizeCurrentTurnContextString(entry.mediaPath) : void 0,
      media_ref: entry.mediaRef ? sanitizeCurrentTurnContextString(entry.mediaRef) : void 0,
      reply_to_id: entry.replyToId ? sanitizeCurrentTurnContextString(entry.replyToId) : void 0,
      forwarded_from: entry.forwardedFrom
        ? sanitizeCurrentTurnContextString(entry.forwardedFrom)
        : void 0,
      forwarded_from_id: entry.forwardedFromId
        ? sanitizeCurrentTurnContextString(entry.forwardedFromId)
        : void 0,
      forwarded_from_username: entry.forwardedFromUsername
        ? sanitizeCurrentTurnContextString(entry.forwardedFromUsername)
        : void 0,
      forwarded_date: entry.forwardedDate,
    }));
    return [
      "",
      "Reply chain of current user message (untrusted, nearest first):",
      "```json",
      JSON.stringify(payload, null, 2),
      "```",
    ].join("\n");
  }
  const reply = context?.reply;
  const replyBody = reply?.body?.trim();
  if (!reply || !replyBody) return "";
  const payload = {
    sender_label: reply.senderLabel ? sanitizeCurrentTurnContextString(reply.senderLabel) : void 0,
    is_quote: reply.isQuote === true ? true : void 0,
    body: sanitizeCurrentTurnContextString(replyBody),
  };
  return [
    "",
    "Reply target of current user message (untrusted, for context):",
    "```json",
    JSON.stringify(payload, null, 2),
    "```",
  ].join("\n");
}
function removeLastPromptOccurrence(text, prompt) {
  const index = text.lastIndexOf(prompt);
  if (index === -1) return null;
  return [text.slice(0, index).trimEnd(), text.slice(index + prompt.length).trimStart()]
    .filter((part) => part.length > 0)
    .join("\n\n")
    .trim();
}
function resolveRuntimeContextPromptParts(params) {
  const transcriptPrompt = params.transcriptPrompt;
  if (transcriptPrompt === void 0 || transcriptPrompt === params.effectivePrompt)
    return { prompt: params.effectivePrompt };
  const prompt = transcriptPrompt.trim();
  const runtimeContext =
    removeLastPromptOccurrence(params.effectivePrompt, transcriptPrompt)?.trim() ||
    params.effectivePrompt.trim();
  if (!prompt)
    return runtimeContext
      ? {
          prompt: OPENCLAW_RUNTIME_EVENT_USER_PROMPT,
          runtimeContext,
          runtimeOnly: true,
          runtimeSystemContext: buildRuntimeEventSystemContext(runtimeContext),
        }
      : { prompt: "" };
  return runtimeContext
    ? {
        prompt,
        runtimeContext,
      }
    : { prompt };
}
function buildRuntimeContextMessageContent(params) {
  return [
    params.kind === "runtime-event"
      ? OPENCLAW_RUNTIME_EVENT_HEADER
      : OPENCLAW_NEXT_TURN_RUNTIME_CONTEXT_HEADER,
    OPENCLAW_RUNTIME_CONTEXT_NOTICE,
    "",
    params.runtimeContext,
  ].join("\n");
}
function buildRuntimeContextSystemContext(runtimeContext) {
  return buildRuntimeContextMessageContent({
    runtimeContext,
    kind: "next-turn",
  });
}
function buildRuntimeEventSystemContext(runtimeContext) {
  return buildRuntimeContextMessageContent({
    runtimeContext,
    kind: "runtime-event",
  });
}
async function queueRuntimeContextForNextTurn(params) {
  const runtimeContext = params.runtimeContext?.trim();
  if (!runtimeContext) return;
  await params.session.sendCustomMessage(
    {
      customType: OPENCLAW_RUNTIME_CONTEXT_CUSTOM_TYPE,
      content: runtimeContext,
      display: false,
      details: { source: "openclaw-runtime-context" },
    },
    { deliverAs: "nextTurn" },
  );
}
//#endregion
export {
  resolveRuntimeContextPromptParts as a,
  queueRuntimeContextForNextTurn as i,
  buildRuntimeContextSystemContext as n,
  buildRuntimeEventSystemContext as r,
  buildCurrentTurnPromptContextSuffix as t,
};
