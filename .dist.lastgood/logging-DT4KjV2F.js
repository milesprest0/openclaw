import { r as createConfigIO } from "./io-CEQSCTGy.js";
import { a as displayPath } from "./utils-BGRcpLKt.js";
//#region src/config/logging.ts
function formatConfigPath(path = createConfigIO().configPath) {
  return displayPath(path);
}
function logConfigUpdated(runtime, opts = {}) {
  const path = formatConfigPath(opts.path ?? createConfigIO().configPath);
  const suffix = opts.suffix ? ` ${opts.suffix}` : "";
  runtime.log(`Updated ${path}${suffix}`);
}
//#endregion
export { logConfigUpdated as n, formatConfigPath as t };
