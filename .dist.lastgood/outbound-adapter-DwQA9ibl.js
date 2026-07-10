import { a as chunkText } from "./chunk-aBEwc7QQ.js";
import { a as shouldLogVerbose } from "./globals-BdfwDi2E.js";
import "./runtime-env-B60JdRoI.js";
import "./reply-chunking-D9l7MwoT.js";
import { t as createWhatsAppOutboundBase } from "./outbound-base-BLzZJEJ5.js";
import { n as normalizeWhatsAppPayloadText } from "./outbound-media-contract-NP9fM72I.js";
import { t as resolveWhatsAppOutboundTarget } from "./resolve-outbound-target-DD-duvsB.js";
//#region extensions/whatsapp/src/outbound-adapter.ts
let whatsAppSendModulePromise;
function loadWhatsAppSendModule() {
  whatsAppSendModulePromise ??= import("./send-BHtB_oIO.js");
  return whatsAppSendModulePromise;
}
function normalizeOutboundText(text) {
  return normalizeWhatsAppPayloadText(text);
}
const whatsappOutbound = createWhatsAppOutboundBase({
  chunker: chunkText,
  sendMessageWhatsApp: async (to, text, options) =>
    await (
      await loadWhatsAppSendModule()
    ).sendMessageWhatsApp(to, normalizeOutboundText(text), { ...options }),
  sendPollWhatsApp: async (to, poll, options) =>
    await (await loadWhatsAppSendModule()).sendPollWhatsApp(to, poll, options),
  shouldLogVerbose: () => shouldLogVerbose(),
  resolveTarget: ({ to, allowFrom, mode }) =>
    resolveWhatsAppOutboundTarget({
      to,
      allowFrom,
      mode,
    }),
  normalizeText: normalizeOutboundText,
  skipEmptyText: true,
});
//#endregion
export { whatsappOutbound as t };
