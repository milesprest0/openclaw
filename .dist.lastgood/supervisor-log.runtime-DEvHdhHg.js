import { t as createSubsystemLogger } from "./subsystem-Bjz8a2fE.js";
//#region src/process/supervisor/supervisor-log.runtime.ts
const log = createSubsystemLogger("process/supervisor");
function warnProcessSupervisorSpawnFailure(message) {
  log.warn(message);
}
//#endregion
export { warnProcessSupervisorSpawnFailure };
