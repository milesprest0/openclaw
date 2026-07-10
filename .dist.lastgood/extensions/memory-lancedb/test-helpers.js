import fs from "node:fs/promises";
import "../../temp-path-DRiyUI5S.js";
import path from "node:path";
import { i as beforeEach, n as afterEach } from "../../dist-BosyQhji.js";
import { n as resolvePreferredOpenClawTmpDir } from "../../tmp-openclaw-dir-B4r8YQhH.js";
//#region extensions/memory-lancedb/test-helpers.ts
function installTmpDirHarness(params) {
  let tmpDir = "";
  let dbPath = "";
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(resolvePreferredOpenClawTmpDir(), params.prefix));
    dbPath = path.join(tmpDir, "lancedb");
  });
  afterEach(async () => {
    if (tmpDir)
      await fs.rm(tmpDir, {
        recursive: true,
        force: true,
      });
  });
  return {
    getTmpDir: () => tmpDir,
    getDbPath: () => dbPath,
  };
}
//#endregion
export { installTmpDirHarness };
