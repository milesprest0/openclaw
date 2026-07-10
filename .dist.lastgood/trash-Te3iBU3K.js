import os from "node:os";
import { n as resolvePreferredOpenClawTmpDir } from "./tmp-openclaw-dir-B4r8YQhH.js";
import "./temp-path-DRiyUI5S.js";
import "./browser-config-D-o7LaWd.js";
import { t as movePathToTrash$1 } from "./trash-DdQBWsSt.js";
//#region extensions/browser/src/browser/trash.ts
async function movePathToTrash(targetPath) {
  return await movePathToTrash$1(targetPath, {
    allowedRoots: [os.homedir(), resolvePreferredOpenClawTmpDir()],
  });
}
//#endregion
export { movePathToTrash as t };
