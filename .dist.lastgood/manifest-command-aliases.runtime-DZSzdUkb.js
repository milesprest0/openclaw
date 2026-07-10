import { n as resolveManifestCommandAliasOwnerInRegistry } from "./manifest-command-aliases-Ymsnd92A.js";
import { o as loadManifestMetadataRegistry } from "./manifest-contract-eligibility-Bpx8eP31.js";
//#region src/plugins/manifest-command-aliases.runtime.ts
function resolveManifestCommandAliasOwner(params) {
  const registry =
    params.registry ??
    loadManifestMetadataRegistry({
      config: params.config,
      workspaceDir: params.workspaceDir,
      env: params.env,
    }).manifestRegistry;
  return resolveManifestCommandAliasOwnerInRegistry({
    command: params.command,
    registry,
  });
}
//#endregion
export { resolveManifestCommandAliasOwner };
