import {
  n as stopBrowserBridgeServer,
  t as startBrowserBridgeServer,
} from "../../bridge-server-DFsurMfO.js";
import { t as registerBrowserCli } from "../../browser-cli-Pl6pNkpj.js";
import {
  a as normalizeBrowserRequestPath,
  c as browserPdfSave,
  d as browserArmFileChooser,
  f as browserNavigate,
  i as isPersistentBrowserProfileMutation,
  l as browserAct,
  n as persistBrowserProxyFiles,
  o as resolveRequestedBrowserProfile,
  p as browserScreenshotAction,
  r as runBrowserProxyCommand,
  s as browserConsoleMessages,
  t as applyBrowserProxyPaths,
  u as browserArmDialog,
} from "../../browser-runtime-Dpz_Cmrv.js";
import {
  A as DEFAULT_BROWSER_EVALUATE_ENABLED,
  D as DEFAULT_AI_SNAPSHOT_MAX_CHARS,
  I as DEFAULT_OPENCLAW_BROWSER_PROFILE_NAME,
  P as DEFAULT_OPENCLAW_BROWSER_COLOR,
  f as redactCdpUrl,
} from "../../cdp.helpers-DnNpBUOj.js";
import {
  i as resolveGoogleChromeExecutableForPlatform,
  n as readBrowserVersion,
  t as parseBrowserMajorVersion,
} from "../../chrome.executables-BinpIko4.js";
import {
  i as resolveProfile,
  n as resolveBrowserConfig,
  s as DEFAULT_UPLOAD_DIR,
} from "../../config-DhdywqBF.js";
import {
  n as resolveBrowserControlAuth,
  t as ensureBrowserControlAuth,
} from "../../control-auth-B3jZZmk_.js";
import {
  n as stopBrowserControlService,
  r as createBrowserRouteDispatcher,
  t as startBrowserControlServiceFromConfig,
} from "../../control-service-T5vQsPj7.js";
import { f as resolveExistingPathsWithinRoot } from "../../fs-safe-CgBWiL92.js";
import {
  i as getBrowserControlState,
  n as createBrowserControlContext,
  o as createBrowserRuntimeState,
  s as stopBrowserRuntime,
} from "../../plugin-enabled-C9LPRxsq.js";
import { t as definePluginEntry } from "../../plugin-entry-Yc8_SbjU.js";
import {
  i as createBrowserTool,
  n as browserHandlers,
  r as handleBrowserGatewayRequest,
  t as createBrowserPluginService,
} from "../../plugin-service-BQuV8V1n.js";
import {
  o as normalizeBrowserFormField,
  s as normalizeBrowserFormFieldValue,
} from "../../pw-role-snapshot-DkK4EEVr.js";
import { t as registerBrowserRoutes } from "../../routes-D36s7FLv.js";
import { t as createBrowserRouteContext } from "../../server-context-Il7jEHOv.js";
import {
  n as installBrowserAuthMiddleware,
  r as installBrowserCommonMiddleware,
} from "../../server-middleware-kETVHJXc.js";
import {
  _ as browserStop,
  a as untrackSessionBrowserTab,
  c as browserDeleteProfile,
  d as browserOpenTab,
  f as browserProfiles,
  g as browserStatus,
  h as browserStart,
  i as trackSessionBrowserTab,
  l as browserDoctor,
  m as browserSnapshot,
  o as browserCloseTab,
  p as browserResetProfile,
  s as browserCreateProfile,
  t as closeTrackedBrowserTabsForSessions,
  u as browserFocusTab,
  v as browserTabAction,
  y as browserTabs,
} from "../../session-tab-registry-D-1NosPu.js";
import { r as getBrowserProfileCapabilities } from "../../target-id-Bq4VUN4D.js";
import { t as movePathToTrash } from "../../trash-Te3iBU3K.js";
export {
  DEFAULT_AI_SNAPSHOT_MAX_CHARS,
  DEFAULT_BROWSER_EVALUATE_ENABLED,
  DEFAULT_OPENCLAW_BROWSER_COLOR,
  DEFAULT_OPENCLAW_BROWSER_PROFILE_NAME,
  DEFAULT_UPLOAD_DIR,
  applyBrowserProxyPaths,
  browserAct,
  browserArmDialog,
  browserArmFileChooser,
  browserCloseTab,
  browserConsoleMessages,
  browserCreateProfile,
  browserDeleteProfile,
  browserDoctor,
  browserFocusTab,
  browserHandlers,
  browserNavigate,
  browserOpenTab,
  browserPdfSave,
  browserProfiles,
  browserResetProfile,
  browserScreenshotAction,
  browserSnapshot,
  browserStart,
  browserStatus,
  browserStop,
  browserTabAction,
  browserTabs,
  closeTrackedBrowserTabsForSessions,
  createBrowserControlContext,
  createBrowserPluginService,
  createBrowserRouteContext,
  createBrowserRouteDispatcher,
  createBrowserRuntimeState,
  createBrowserTool,
  definePluginEntry,
  ensureBrowserControlAuth,
  getBrowserControlState,
  getBrowserProfileCapabilities,
  handleBrowserGatewayRequest,
  installBrowserAuthMiddleware,
  installBrowserCommonMiddleware,
  isPersistentBrowserProfileMutation,
  movePathToTrash,
  normalizeBrowserFormField,
  normalizeBrowserFormFieldValue,
  normalizeBrowserRequestPath,
  parseBrowserMajorVersion,
  persistBrowserProxyFiles,
  readBrowserVersion,
  redactCdpUrl,
  registerBrowserCli,
  registerBrowserRoutes,
  resolveBrowserConfig,
  resolveBrowserControlAuth,
  resolveExistingPathsWithinRoot,
  resolveGoogleChromeExecutableForPlatform,
  resolveProfile,
  resolveRequestedBrowserProfile,
  runBrowserProxyCommand,
  startBrowserBridgeServer,
  startBrowserControlServiceFromConfig,
  stopBrowserBridgeServer,
  stopBrowserControlService,
  stopBrowserRuntime,
  trackSessionBrowserTab,
  untrackSessionBrowserTab,
};
