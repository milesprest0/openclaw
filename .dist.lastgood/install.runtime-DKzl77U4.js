import { s as resolveArchiveKind } from "./archive-CfKTdlm5.js";
import {
  N as validateRegistryNpmSpec,
  S as resolvePackageExtensionEntries,
  b as getPackageManifestMetadata,
  h as loadBundleManifest,
  m as detectBundleManifestFormat,
  x as loadPluginManifest,
} from "./discovery-bnS95tO3.js";
import { T as pathExists } from "./fs-safe-CgBWiL92.js";
import {
  i as withExtractedArchiveRoot,
  r as resolveExistingInstallPath,
  t as installPackageDir,
} from "./install-package-dir-BpHnIvxe.js";
import {
  i as scanPackageInstallSource,
  n as scanFileInstallSource,
  r as scanInstalledPackageDependencyTree,
  t as scanBundleInstallSource,
} from "./install-security-scan-BAybFOI9.js";
import { r as resolveArchiveSourcePath } from "./install-source-utils-DrH7L6Si.js";
import {
  a as finalizeNpmSpecArchiveInstall,
  i as resolveTimedInstallModeOptions,
  n as resolveCanonicalInstallTarget,
  o as installFromNpmSpecArchiveWithInstaller,
  r as resolveInstallModeOptions,
  t as ensureInstallTargetAvailable,
} from "./install-target-_OcmvBiR.js";
import { r as readJson } from "./json-files-DifBk3kt.js";
import "./archive-D8PAqNPu.js";
import { t as checkMinHostVersion } from "./min-host-version-DI6PDdpD.js";
import { i as isPathInside } from "./path-1liOXr_N.js";
import { o as root } from "./secure-temp-dir-CCj3cY2B.js";
import {
  o as resolveCompatibilityHostVersion,
  s as resolveRuntimeServiceVersion,
} from "./version-BZr74W_5.js";
export {
  checkMinHostVersion,
  detectBundleManifestFormat,
  ensureInstallTargetAvailable,
  pathExists as fileExists,
  finalizeNpmSpecArchiveInstall,
  getPackageManifestMetadata,
  installFromNpmSpecArchiveWithInstaller,
  installPackageDir,
  isPathInside,
  loadBundleManifest,
  loadPluginManifest,
  readJson as readJsonFile,
  resolveArchiveKind,
  resolveArchiveSourcePath,
  resolveCanonicalInstallTarget,
  resolveCompatibilityHostVersion,
  resolveExistingInstallPath,
  resolveInstallModeOptions,
  resolvePackageExtensionEntries,
  resolveRuntimeServiceVersion,
  resolveTimedInstallModeOptions,
  root,
  scanBundleInstallSource,
  scanFileInstallSource,
  scanInstalledPackageDependencyTree,
  scanPackageInstallSource,
  validateRegistryNpmSpec,
  withExtractedArchiveRoot,
};
