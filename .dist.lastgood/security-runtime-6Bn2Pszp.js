import "./redact-Mxj55RzQ.js";
import "./errors-DZMrVkYL.js";
import "./fs-safe-defaults-DPw2RCP0.js";
import "./fs-safe-CgBWiL92.js";
import { i as wrapExternalContent } from "./external-content-BCW9yxs8.js";
import "./path-guards-DyZnivcw.js";
import "./replace-file-8cLr_oo0.js";
import "./fs-safe-advanced-DQNZZtsF.js";
import "./private-file-store-Bi7hPs_Y.js";
import "./shared-Dp_cRzjX.js";
import "./ports-CzR_dSOf.js";
import "./ssrf-DO8eIXaD.js";
import "./sibling-temp-file-DNbaIacI.js";
import "./runtime-shared-leW4XjHk.js";
import { o as root } from "./secure-temp-dir-CCj3cY2B.js";
import "./dm-policy-shared-COpbJNwP.js";
import "./channel-secret-collector-runtime-BlUVW_H0.js";
//#region src/security/channel-metadata.ts
const DEFAULT_MAX_CHARS = 800;
const DEFAULT_MAX_ENTRY_CHARS = 400;
function normalizeEntry(entry) {
  return entry.replace(/\s+/g, " ").trim();
}
function truncateText(value, maxChars) {
  if (maxChars <= 0) return "";
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}
function buildUntrustedChannelMetadata(params) {
  const deduped = params.entries
    .map((entry) => (typeof entry === "string" ? normalizeEntry(entry) : ""))
    .filter((entry) => Boolean(entry))
    .map((entry) => truncateText(entry, DEFAULT_MAX_ENTRY_CHARS))
    .filter((entry, index, list) => list.indexOf(entry) === index);
  if (deduped.length === 0) return;
  const body = deduped.join("\n");
  return wrapExternalContent(
    truncateText(
      `${`UNTRUSTED channel metadata (${params.source})`}\n${`${params.label}:\n${body}`}`,
      params.maxChars ?? DEFAULT_MAX_CHARS,
    ),
    {
      source: "channel_metadata",
      includeWarning: false,
    },
  );
}
//#endregion
//#region src/plugin-sdk/security-runtime.ts
async function openFileWithinRoot(params) {
  return await (
    await root(params.rootDir)
  ).open(params.relativePath, {
    hardlinks: params.rejectHardlinks === false ? "allow" : "reject",
    nonBlockingRead: params.nonBlockingRead,
    symlinks: params.allowSymlinkTargetWithinRoot === true ? "follow-within-root" : "reject",
  });
}
async function writeFileFromPathWithinRoot(params) {
  await (
    await root(params.rootDir)
  ).copyIn(params.relativePath, params.sourcePath, {
    mkdir: params.mkdir,
    sourceHardlinks: "reject",
  });
}
//#endregion
export {
  writeFileFromPathWithinRoot as n,
  buildUntrustedChannelMetadata as r,
  openFileWithinRoot as t,
};
