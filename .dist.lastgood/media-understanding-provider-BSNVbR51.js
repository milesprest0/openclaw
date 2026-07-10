import {
  r as describeImagesWithModel,
  t as describeImageWithModel,
} from "./image-runtime-DLf9RXbB.js";
import {
  i as resolveMediaUnderstandingString,
  n as buildOpenAiCompatibleVideoRequestBody,
  r as coerceOpenAiCompatibleVideoText,
} from "./media-understanding-Br1KJ1Ub.js";
import { y as QWEN_STANDARD_GLOBAL_BASE_URL } from "./models-npOf4c2S.js";
import { r as assertOkOrThrowHttpError } from "./provider-http-errors-Gz46brs9.js";
import "./provider-http-C6-kkFY-.js";
import { a as postJsonRequest, u as resolveProviderHttpRequestConfig } from "./shared-DqfWqGL5.js";
//#region extensions/qwen/media-understanding-provider.ts
const DEFAULT_QWEN_VIDEO_MODEL = "qwen-vl-max-latest";
const DEFAULT_QWEN_VIDEO_PROMPT = "Describe the video in detail.";
async function describeQwenVideo(params) {
  const fetchFn = params.fetchFn ?? fetch;
  const model = resolveMediaUnderstandingString(params.model, DEFAULT_QWEN_VIDEO_MODEL);
  const mime = resolveMediaUnderstandingString(params.mime, "video/mp4");
  const prompt = resolveMediaUnderstandingString(params.prompt, DEFAULT_QWEN_VIDEO_PROMPT);
  const { baseUrl, allowPrivateNetwork, headers, dispatcherPolicy } =
    resolveProviderHttpRequestConfig({
      baseUrl: params.baseUrl,
      defaultBaseUrl: QWEN_STANDARD_GLOBAL_BASE_URL,
      headers: params.headers,
      request: params.request,
      defaultHeaders: {
        "content-type": "application/json",
        authorization: `Bearer ${params.apiKey}`,
      },
      provider: "qwen",
      api: "openai-completions",
      capability: "video",
      transport: "media-understanding",
    });
  const { response: res, release } = await postJsonRequest({
    url: `${baseUrl}/chat/completions`,
    headers,
    body: buildOpenAiCompatibleVideoRequestBody({
      model,
      prompt,
      mime,
      buffer: params.buffer,
    }),
    timeoutMs: params.timeoutMs,
    fetchFn,
    allowPrivateNetwork,
    dispatcherPolicy,
  });
  try {
    await assertOkOrThrowHttpError(res, "Qwen video description failed");
    const text = coerceOpenAiCompatibleVideoText(await res.json());
    if (!text) throw new Error("Qwen video description response missing content");
    return {
      text,
      model,
    };
  } finally {
    await release();
  }
}
function buildQwenMediaUnderstandingProvider() {
  return {
    id: "qwen",
    capabilities: ["image", "video"],
    defaultModels: {
      image: "qwen-vl-max-latest",
      video: DEFAULT_QWEN_VIDEO_MODEL,
    },
    autoPriority: { video: 15 },
    describeImage: describeImageWithModel,
    describeImages: describeImagesWithModel,
    describeVideo: describeQwenVideo,
  };
}
//#endregion
export { describeQwenVideo as n, buildQwenMediaUnderstandingProvider as t };
