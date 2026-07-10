import { s as resolveArchiveKind } from "./archive-CfKTdlm5.js";
import { N as validateRegistryNpmSpec } from "./discovery-bnS95tO3.js";
import { T as pathExists } from "./fs-safe-CgBWiL92.js";
import {
  i as withExtractedArchiveRoot,
  n as installPackageDirWithManifestDeps,
  r as resolveExistingInstallPath,
  t as installPackageDir,
} from "./install-package-dir-BpHnIvxe.js";
import "./scan-paths-BLf-vGUd.js";
import { r as resolveArchiveSourcePath } from "./install-source-utils-DrH7L6Si.js";
import "./archive-D8PAqNPu.js";
import {
  a as finalizeNpmSpecArchiveInstall,
  i as resolveTimedInstallModeOptions,
  n as resolveCanonicalInstallTarget,
  o as installFromNpmSpecArchiveWithInstaller,
  r as resolveInstallModeOptions,
  t as ensureInstallTargetAvailable,
} from "./install-target-_OcmvBiR.js";
import { r as readJson } from "./json-files-DifBk3kt.js";
import { a as isPathInsideWithRealpath, i as isPathInside } from "./path-1liOXr_N.js";
//#region src/infra/install-from-npm-spec.ts
async function installFromValidatedNpmSpecArchive(params) {
  const spec = params.spec.trim();
  const specError = validateRegistryNpmSpec(spec);
  if (specError)
    return {
      ok: false,
      error: specError,
    };
  return finalizeNpmSpecArchiveInstall(
    await installFromNpmSpecArchiveWithInstaller({
      tempDirPrefix: params.tempDirPrefix,
      spec,
      timeoutMs: params.timeoutMs,
      expectedIntegrity: params.expectedIntegrity,
      onIntegrityDrift: params.onIntegrityDrift,
      warn: params.warn,
      installFromArchive: params.installFromArchive,
      archiveInstallParams: params.archiveInstallParams,
    }),
  );
}
//#endregion
export {
  ensureInstallTargetAvailable,
  pathExists as fileExists,
  installFromValidatedNpmSpecArchive,
  installPackageDir,
  installPackageDirWithManifestDeps,
  isPathInside,
  isPathInsideWithRealpath,
  readJson as readJsonFile,
  resolveArchiveKind,
  resolveArchiveSourcePath,
  resolveCanonicalInstallTarget,
  resolveExistingInstallPath,
  resolveInstallModeOptions,
  resolveTimedInstallModeOptions,
  withExtractedArchiveRoot,
};
