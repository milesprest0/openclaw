import "./subsystem-Bjz8a2fE.js";
import "./provider-env-vars-DkmNxQP4.js";
import "./provider-model-shared-CmD-CscC.js";
import "./failover-error-Dx3vQAkt.js";
import "./provider-registry-SwjmQzH9.js";
import "./runtime-shared-CdcIZV6B.js";
//#region src/plugin-sdk/image-generation-core.ts
const OPENAI_DEFAULT_IMAGE_MODEL = "gpt-image-2";
let imageGenerationCoreAuthRuntimePromise;
async function loadImageGenerationCoreAuthRuntime() {
  imageGenerationCoreAuthRuntimePromise ??= import("./image-generation-core.auth.runtime.js");
  return imageGenerationCoreAuthRuntimePromise;
}
async function resolveApiKeyForProvider(...args) {
  return (await loadImageGenerationCoreAuthRuntime()).resolveApiKeyForProvider(...args);
}
//#endregion
export { resolveApiKeyForProvider as n, OPENAI_DEFAULT_IMAGE_MODEL as t };
