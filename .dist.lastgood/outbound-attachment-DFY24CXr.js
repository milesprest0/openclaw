import { t as buildOutboundMediaLoadOptions } from "./load-options-6LTmiW9v.js";
import { u as saveMediaBuffer } from "./store-N2etmi9e.js";
import { t as loadWebMedia } from "./web-media-E6nAhoMh.js";
//#region src/media/outbound-attachment.ts
async function resolveOutboundAttachmentFromUrl(mediaUrl, maxBytes, options) {
  const media = await loadWebMedia(
    mediaUrl,
    buildOutboundMediaLoadOptions({
      maxBytes,
      mediaAccess: options?.mediaAccess,
      mediaLocalRoots: options?.localRoots,
      mediaReadFile: options?.readFile,
    }),
  );
  const saved = await saveMediaBuffer(
    media.buffer,
    media.contentType ?? void 0,
    "outbound",
    maxBytes,
    media.fileName,
  );
  return {
    path: saved.path,
    contentType: saved.contentType,
  };
}
//#endregion
export { resolveOutboundAttachmentFromUrl as t };
