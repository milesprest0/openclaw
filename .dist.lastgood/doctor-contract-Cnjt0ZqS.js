import { r as createLegacyPrivateNetworkDoctorContract } from "./ssrf-policy-CLYqev3x.js";
import "./ssrf-runtime-BhFjkd3c.js";
//#region extensions/tlon/src/doctor-contract.ts
const contract = createLegacyPrivateNetworkDoctorContract({ channelKey: "tlon" });
const legacyConfigRules = contract.legacyConfigRules;
const normalizeCompatibilityConfig = contract.normalizeCompatibilityConfig;
//#endregion
export { normalizeCompatibilityConfig as n, legacyConfigRules as t };
