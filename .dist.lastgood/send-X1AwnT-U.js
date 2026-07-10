import {
  d as createRenderedMessageBatch,
  t as deliverOutboundPayloads,
} from "./deliver-Dz9Dpt9U.js";
import { a as formatErrorMessage } from "./errors-DZMrVkYL.js";
import {
  c as markLiveMessagePreviewUpdated,
  t as createLiveMessageState,
} from "./live-CawdYLv5.js";
import { t as createMessageReceiptFromOutboundResults } from "./receipt-DxFe-lje.js";
import { t as createSubsystemLogger } from "./subsystem-Bjz8a2fE.js";
//#region src/channels/message/send.ts
const log = createSubsystemLogger("channels/message/send");
const neverAbortedSignal = new AbortController().signal;
function toDurableMessageIntent(intent, renderedBatch) {
  return {
    id: intent.id,
    channel: intent.channel,
    to: intent.to,
    ...(intent.accountId ? { accountId: intent.accountId } : {}),
    durability: intent.queuePolicy === "required" ? "required" : "best_effort",
    renderedBatch,
  };
}
async function withDurableMessageSendContext(params, run) {
  let deliveryIntent;
  const {
    attempt,
    durability,
    onDeleteReceipt,
    onEditReceipt,
    onCommitReceipt,
    onPreviewUpdate,
    onSendFailure,
    payloads,
    preview,
    previousReceipt,
    signal,
    abortSignal,
    ...deliveryParams
  } = params;
  const effectiveSignal = signal ?? abortSignal;
  const queuePolicy = durability === "best_effort" ? "best_effort" : "required";
  let liveState = preview ?? createLiveMessageState();
  const ctx = {
    id: `${params.channel}:${params.to}`,
    channel: params.channel,
    to: params.to,
    ...(params.accountId ? { accountId: params.accountId } : {}),
    durability: durability ?? "required",
    attempt: attempt ?? 1,
    signal: effectiveSignal ?? neverAbortedSignal,
    ...(previousReceipt ? { previousReceipt } : {}),
    preview: liveState,
    render: async () => createRenderedMessageBatch(payloads),
    previewUpdate: async (rendered) => {
      liveState = onPreviewUpdate
        ? await onPreviewUpdate(rendered, liveState)
        : markLiveMessagePreviewUpdated(liveState, rendered);
      ctx.preview = liveState;
      return liveState;
    },
    send: async (rendered) => {
      try {
        const results = await deliverOutboundPayloads({
          ...deliveryParams,
          payloads: rendered.payloads,
          renderedBatchPlan: rendered.plan,
          queuePolicy,
          ...(effectiveSignal ? { abortSignal: effectiveSignal } : {}),
          onDeliveryIntent: (intent) => {
            deliveryIntent = intent;
            ctx.intent = toDurableMessageIntent(intent, rendered);
          },
        });
        const receipt = createMessageReceiptFromOutboundResults({
          results,
          threadId: params.threadId == null ? void 0 : String(params.threadId),
          replyToId: params.replyToId ?? void 0,
        });
        if (results.length === 0)
          return {
            status: "suppressed",
            results: [],
            receipt,
            ...(deliveryIntent ? { deliveryIntent } : {}),
            reason: "no_visible_result",
          };
        return {
          status: "sent",
          results,
          receipt,
          ...(deliveryIntent ? { deliveryIntent } : {}),
        };
      } catch (error) {
        return {
          status: "failed",
          error,
        };
      }
    },
    edit: async (receipt, rendered) => {
      if (!onEditReceipt) throw new Error("message send context edit is not configured");
      const editedReceipt = await onEditReceipt(receipt, rendered);
      liveState = {
        ...liveState,
        receipt: editedReceipt,
        lastRendered: rendered,
      };
      ctx.preview = liveState;
      return editedReceipt;
    },
    delete: async (receipt) => {
      if (!onDeleteReceipt) throw new Error("message send context delete is not configured");
      await onDeleteReceipt(receipt);
    },
    commit: async (receipt) => {
      await onCommitReceipt?.(receipt);
    },
    fail: async (error) => {
      try {
        await onSendFailure?.(error);
      } catch (cleanupError) {
        log.warn(
          `message send failure cleanup failed; preserving original send error: ${formatErrorMessage(cleanupError)}`,
        );
      }
    },
  };
  try {
    return await run(ctx);
  } catch (error) {
    await ctx.fail(error);
    throw error;
  }
}
async function sendDurableMessageBatch(params) {
  return await withDurableMessageSendContext(params, async (ctx) => {
    const rendered = await ctx.render();
    const result = await ctx.send(rendered);
    if (result.status !== "failed") await ctx.commit(result.receipt);
    else await ctx.fail(result.error);
    return result;
  });
}
//#endregion
export { withDurableMessageSendContext as n, sendDurableMessageBatch as t };
