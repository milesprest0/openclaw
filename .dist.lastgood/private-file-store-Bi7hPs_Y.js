import "./fs-safe-defaults-DPw2RCP0.js";
import { n as fileStoreSync, t as fileStore } from "./file-store-CYPhc5Bw.js";
//#region src/infra/private-file-store.ts
function privateFileStore(rootDir) {
  return fileStore({
    rootDir,
    private: true,
  });
}
function privateFileStoreSync(rootDir) {
  return fileStoreSync({
    rootDir,
    private: true,
  });
}
//#endregion
export { privateFileStoreSync as n, privateFileStore as t };
