import { n as normalizeAccountId } from "./account-id-BGKP_Par.js";
import { a as formatErrorMessage } from "./errors-DZMrVkYL.js";
import { t as createLazyImportLoader } from "./lazy-promise-B1nDYoKn.js";
import { n as resolveAgentMainSessionKey } from "./main-session-BttihmeO.js";
import { u as resolveStorePath } from "./paths-CfeECf6Z.js";
import { t as getLoadedChannelPluginForRead } from "./registry-loaded-read-MOL61L91.js";
import { t as loadSessionStore } from "./store-load-BSFLPYqQ.js";
import { c as normalizeOptionalString } from "./string-coerce-BdEutqX5.js";
import { t as maybeResolveIdLikeTarget } from "./target-id-resolution-CflbqRzj.js";
import { a as normalizeTargetForProvider } from "./target-normalization-CxSkkBsZ.js";
import { t as parseExplicitTargetForLoadedChannel } from "./target-parsing-loaded-ClasI1Xo.js";
import {
  n as resolveOutboundTargetWithPlugin,
  t as resolveSessionDeliveryTarget,
} from "./targets-session-gkBFAJFs.js";
//#region src/infra/outbound/targets-loaded.ts
function resolveLoadedOutboundChannelPlugin(channel) {
  const normalized = normalizeOptionalString(channel);
  if (!normalized) return;
  return getLoadedChannelPluginForRead(normalized);
}
function tryResolveLoadedOutboundTarget(params) {
  return resolveOutboundTargetWithPlugin({
    plugin: resolveLoadedOutboundChannelPlugin(params.channel),
    target: params,
  });
}
//#endregion
//#region src/cron/isolated-agent/delivery-target.ts
const targetsRuntimeLoader = createLazyImportLoader(() => import("./targets.runtime.js"));
async function loadTargetsRuntime() {
  return await targetsRuntimeLoader.load();
}
async function resolveOutboundTargetWithRuntime(params) {
  try {
    const loaded = tryResolveLoadedOutboundTarget(params);
    if (loaded) return loaded;
    const { resolveOutboundTarget } = await loadTargetsRuntime();
    return resolveOutboundTarget(params);
  } catch (err) {
    return {
      ok: false,
      error: /* @__PURE__ */ new Error(`Invalid delivery target: ${formatErrorMessage(err)}`),
    };
  }
}
function normalizeTargetForThreadCarry(channel, to) {
  if (!channel || !to) return;
  try {
    const comparable = normalizeTargetForProvider(channel, to) ?? to.trim();
    if (!comparable) return;
    const base = parseExplicitTargetForLoadedChannel(channel, comparable)?.to ?? comparable;
    return normalizeTargetForProvider(channel, base) ?? base;
  } catch {
    return;
  }
}
function deliveryTargetsShareThreadRoute(params) {
  if (!params.to || !params.lastTo) return false;
  if (params.to === params.lastTo) return true;
  const normalizedTo = normalizeTargetForThreadCarry(params.channel, params.to);
  const normalizedLastTo = normalizeTargetForThreadCarry(params.channel, params.lastTo);
  return Boolean(normalizedTo && normalizedLastTo && normalizedTo === normalizedLastTo);
}
const channelSelectionRuntimeLoader = createLazyImportLoader(
  () => import("./channel-selection.runtime.js"),
);
const deliveryTargetRuntimeLoader = createLazyImportLoader(
  () => import("./delivery-target.runtime.js"),
);
async function loadChannelSelectionRuntime() {
  return await channelSelectionRuntimeLoader.load();
}
async function loadDeliveryTargetRuntime() {
  return await deliveryTargetRuntimeLoader.load();
}
async function resolveDeliveryTarget(cfg, agentId, jobPayload, options) {
  const requestedChannel = typeof jobPayload.channel === "string" ? jobPayload.channel : "last";
  const explicitTo = typeof jobPayload.to === "string" ? jobPayload.to : void 0;
  const allowMismatchedLastTo = requestedChannel === "last";
  const sessionCfg = cfg.session;
  const mainSessionKey = resolveAgentMainSessionKey({
    cfg,
    agentId,
  });
  const store = loadSessionStore(resolveStorePath(sessionCfg?.store, { agentId }));
  const threadSessionKey = jobPayload.sessionKey?.trim();
  const main = (threadSessionKey ? store[threadSessionKey] : void 0) ?? store[mainSessionKey];
  const preliminary = resolveSessionDeliveryTarget({
    entry: main,
    requestedChannel,
    explicitTo,
    explicitThreadId: jobPayload.threadId,
    allowMismatchedLastTo,
  });
  let fallbackChannel;
  let channelResolutionError;
  if (!preliminary.channel)
    if (preliminary.lastChannel) fallbackChannel = preliminary.lastChannel;
    else
      try {
        const { resolveMessageChannelSelection } = await loadChannelSelectionRuntime();
        fallbackChannel = (await resolveMessageChannelSelection({ cfg })).channel;
      } catch (err) {
        const detail = formatErrorMessage(err);
        channelResolutionError = /* @__PURE__ */ new Error(
          `${detail} Set delivery.channel explicitly or use a main session with a previous channel.`,
        );
      }
  const resolved = fallbackChannel
    ? resolveSessionDeliveryTarget({
        entry: main,
        requestedChannel,
        explicitTo,
        explicitThreadId: jobPayload.threadId,
        fallbackChannel,
        allowMismatchedLastTo,
        mode: preliminary.mode,
      })
    : preliminary;
  const channel = resolved.channel ?? fallbackChannel;
  const mode = resolved.mode;
  let toCandidate = resolved.to;
  let accountId =
    (typeof jobPayload.accountId === "string" && jobPayload.accountId.trim()
      ? jobPayload.accountId.trim()
      : void 0) ?? resolved.accountId;
  if (!accountId && channel) {
    const { resolveFirstBoundAccountId } = await loadDeliveryTargetRuntime();
    accountId = resolveFirstBoundAccountId({
      cfg,
      channelId: channel,
      agentId,
    });
  }
  if (jobPayload.accountId) accountId = jobPayload.accountId;
  let threadId =
    resolved.threadId &&
    (resolved.threadIdExplicit ||
      deliveryTargetsShareThreadRoute({
        channel,
        to: resolved.to,
        lastTo: resolved.lastTo,
      }))
      ? resolved.threadId
      : void 0;
  if (channel === "telegram" && typeof toCandidate === "string") {
    const topicMatch = toCandidate.match(/:topic:(\d+)$/i);
    if (topicMatch) {
      if (jobPayload.threadId == null || jobPayload.threadId === "")
        threadId = Number(topicMatch[1]);
      toCandidate = toCandidate.replace(/:topic:\d+$/i, "");
    }
  }
  if (!channel)
    return {
      ok: false,
      channel: void 0,
      to: void 0,
      accountId,
      threadId,
      mode,
      error:
        channelResolutionError ??
        /* @__PURE__ */ new Error(
          "Channel is required when delivery.channel=last has no previous channel.",
        ),
    };
  let effectiveAllowFrom;
  if (mode === "implicit") {
    const { getLoadedChannelPluginForRead, mapAllowFromEntries } =
      await loadDeliveryTargetRuntime();
    const channelPlugin = getLoadedChannelPluginForRead(channel);
    const resolvedAccountId = normalizeAccountId(accountId);
    const configuredAllowFromRaw = channelPlugin?.config.resolveAllowFrom?.({
      cfg,
      accountId: resolvedAccountId,
    });
    const configuredAllowFrom = configuredAllowFromRaw
      ? mapAllowFromEntries(configuredAllowFromRaw)
      : [];
    const allowFromOverride = [...new Set(configuredAllowFrom)];
    effectiveAllowFrom = allowFromOverride;
    if (toCandidate && allowFromOverride.length > 0) {
      if (
        !(
          await resolveOutboundTargetWithRuntime({
            channel,
            to: toCandidate,
            cfg,
            accountId,
            mode,
            allowFrom: effectiveAllowFrom,
          })
        ).ok
      )
        toCandidate = allowFromOverride[0];
    }
  }
  const docked = await resolveOutboundTargetWithRuntime({
    channel,
    to: toCandidate,
    cfg,
    accountId,
    mode,
    allowFrom: effectiveAllowFrom,
  });
  if (!docked.ok)
    return {
      ok: false,
      channel,
      to: void 0,
      accountId,
      threadId,
      mode,
      error: docked.error,
    };
  if (options?.dryRun)
    return {
      ok: true,
      channel,
      to: docked.to,
      accountId,
      threadId,
      mode,
    };
  return {
    ok: true,
    channel,
    to:
      (
        await maybeResolveIdLikeTarget({
          cfg,
          channel,
          input: docked.to,
          accountId,
        })
      )?.to ?? docked.to,
    accountId,
    threadId,
    mode,
  };
}
//#endregion
export { resolveDeliveryTarget as t };
