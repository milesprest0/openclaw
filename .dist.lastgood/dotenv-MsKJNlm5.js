import path from "node:path";
import {
  n as loadGlobalRuntimeDotEnvFiles,
  r as loadWorkspaceDotEnvFile,
} from "./dotenv-ZqX2_kZ1.js";
import { v as resolveStateDir } from "./paths-Cnwfh6dH.js";
//#region src/cli/dotenv.ts
function loadCliDotEnv(opts) {
  const quiet = opts?.quiet ?? true;
  loadWorkspaceDotEnvFile(path.join(process.cwd(), ".env"), { quiet });
  loadGlobalRuntimeDotEnvFiles({
    quiet,
    stateEnvPath: path.join(resolveStateDir(process.env), ".env"),
  });
}
//#endregion
export { loadCliDotEnv };
