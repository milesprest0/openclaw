import {
  i as shouldContributeXaiCompat,
  n as resolveXaiBaseUrl,
  r as resolveXaiTransport,
  t as isXaiModelHint,
} from "../../api-VftxFIXZ.js";
import { t as buildXaiImageGenerationProvider } from "../../image-generation-provider-B78TsvxQ.js";
import {
  a as XAI_DEFAULT_MODEL_ID,
  c as buildXaiCatalogModels,
  i as XAI_DEFAULT_MAX_TOKENS,
  l as buildXaiModelDefinition,
  n as XAI_DEFAULT_CONTEXT_WINDOW,
  o as XAI_DEFAULT_MODEL_REF,
  r as XAI_DEFAULT_IMAGE_MODEL,
  s as XAI_IMAGE_MODELS,
  t as XAI_BASE_URL,
  u as resolveXaiCatalogEntry,
} from "../../model-definitions-DAyHCwkm.js";
import { n as applyXaiConfig, r as applyXaiProviderConfig } from "../../onboard-DP_hI7f6.js";
import { t as buildXaiProvider } from "../../provider-catalog-Dku39SnU.js";
import { r as normalizeNativeXaiModelId } from "../../provider-model-id-normalize-DsIoZHHW.js";
import {
  n as resolveXaiForwardCompatModel,
  t as isModernXaiModel,
} from "../../provider-models-0X11lDxR.js";
import {
  f as resolveXaiModelCompatPatch,
  i as applyXaiModelCompat,
  n as XAI_TOOL_SCHEMA_PROFILE,
  t as HTML_ENTITY_TOOL_CALL_ARGUMENTS_ENCODING,
} from "../../provider-tools-Br0qcNYr.js";
import { t as applyXaiRuntimeModelCompat } from "../../runtime-model-compat-BWoTtLX4.js";
export {
  HTML_ENTITY_TOOL_CALL_ARGUMENTS_ENCODING,
  XAI_BASE_URL,
  XAI_DEFAULT_CONTEXT_WINDOW,
  XAI_DEFAULT_IMAGE_MODEL,
  XAI_DEFAULT_MAX_TOKENS,
  XAI_DEFAULT_MODEL_ID,
  XAI_DEFAULT_MODEL_REF,
  XAI_IMAGE_MODELS,
  XAI_TOOL_SCHEMA_PROFILE,
  applyXaiConfig,
  applyXaiModelCompat,
  applyXaiProviderConfig,
  applyXaiRuntimeModelCompat,
  buildXaiCatalogModels,
  buildXaiImageGenerationProvider,
  buildXaiModelDefinition,
  buildXaiProvider,
  isModernXaiModel,
  isXaiModelHint,
  normalizeNativeXaiModelId as normalizeXaiModelId,
  resolveXaiBaseUrl,
  resolveXaiCatalogEntry,
  resolveXaiForwardCompatModel,
  resolveXaiModelCompatPatch,
  resolveXaiTransport,
  shouldContributeXaiCompat,
};
