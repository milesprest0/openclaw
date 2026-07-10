import { t as __testing } from "../../access-control-Di00ltjl.js";
import { t as whatsappCommandPolicy$1 } from "../../command-policy-B7K05oAv.js";
import {
  n as listWhatsAppDirectoryPeersFromConfig,
  t as listWhatsAppDirectoryGroupsFromConfig,
} from "../../directory-config-3Dgtomxo.js";
import { t as resolveLegacyGroupSessionKey$1 } from "../../group-session-contract-GDMMo231.js";
import {
  c as normalizeWhatsAppTarget$1,
  t as isWhatsAppGroupJid$1,
} from "../../normalize-target-B5_fp7Jp.js";
import { t as resolveWhatsAppRuntimeGroupPolicy$1 } from "../../runtime-group-policy-D7T2IrkY.js";
import {
  n as unsupportedSecretRefSurfacePatterns,
  t as collectUnsupportedSecretRefConfigCandidates,
} from "../../security-contract-ZPLfQpe_.js";
import {
  r as isLegacyGroupSessionKey$1,
  t as canonicalizeLegacySessionKey$1,
} from "../../session-contract-DXH5S8Mt.js";
//#region extensions/whatsapp/contract-api.ts
const canonicalizeLegacySessionKey = canonicalizeLegacySessionKey$1;
const isLegacyGroupSessionKey = isLegacyGroupSessionKey$1;
const isWhatsAppGroupJid = isWhatsAppGroupJid$1;
const normalizeWhatsAppTarget = normalizeWhatsAppTarget$1;
const resolveLegacyGroupSessionKey = resolveLegacyGroupSessionKey$1;
const resolveWhatsAppRuntimeGroupPolicy = resolveWhatsAppRuntimeGroupPolicy$1;
const whatsappAccessControlTesting = __testing;
const whatsappCommandPolicy = whatsappCommandPolicy$1;
//#endregion
export {
  canonicalizeLegacySessionKey,
  collectUnsupportedSecretRefConfigCandidates,
  isLegacyGroupSessionKey,
  isWhatsAppGroupJid,
  listWhatsAppDirectoryGroupsFromConfig,
  listWhatsAppDirectoryPeersFromConfig,
  normalizeWhatsAppTarget,
  resolveLegacyGroupSessionKey,
  resolveWhatsAppRuntimeGroupPolicy,
  unsupportedSecretRefSurfacePatterns,
  whatsappAccessControlTesting,
  whatsappCommandPolicy,
};
