import type {
  OpenClawConfig,
  ResolvedMemorySearchConfig,
} from "openclaw/plugin-sdk/memory-core-host-engine-foundation";
import { describe, expect, it, vi } from "vitest";
import {
  applyMemoryFallbackProviderState,
  resolveMemoryFallbackProviderRequest,
  resolveMemoryPrimaryProviderRequest,
  resolveMemoryProviderState,
} from "./manager-provider-state.js";

const DEFAULT_OLLAMA_EMBEDDING_MODEL = "nomic-embed-text";
const DEFAULT_LMSTUDIO_EMBEDDING_MODEL = "text-embedding-nomic-embed-text-v1.5";

vi.mock("./embeddings.js", () => ({
  resolveEmbeddingProviderFallbackModel: (providerId: string, fallbackSourceModel: string) =>
    providerId === "ollama"
      ? DEFAULT_OLLAMA_EMBEDDING_MODEL
      : providerId === "lmstudio"
        ? DEFAULT_LMSTUDIO_EMBEDDING_MODEL
        : fallbackSourceModel,
}));

type EmbeddingProvider = {
  id: string;
  model: string;
  embedQuery: (text: string) => Promise<number[]>;
  embedBatch: (texts: string[]) => Promise<number[][]>;
};

type EmbeddingProviderRuntime = {
  id: string;
  cacheKeyData: { provider: string; model: string };
};

function createProvider(id: string): EmbeddingProvider {
  return {
    id,
    model: `${id}-model`,
    embedQuery: async () => [0.1, 0.2, 0.3],
    embedBatch: async (texts: string[]) => texts.map(() => [0.1, 0.2, 0.3]),
  };
}

function createSettings(params: {
  provider: "openai" | "mistral";
  fallback?: "none" | "openai" | "mistral" | "ollama" | "lmstudio";
  model?: string;
  outputDimensionality?: number;
  fallbackModel?: string;
  fallbackOutputDimensionality?: number;
}): ResolvedMemorySearchConfig {
  return {
    provider: params.provider,
    model:
      params.model ??
      (params.provider === "mistral" ? "mistral/mistral-embed" : "text-embedding-3-small"),
    fallback: params.fallback ?? "none",
    remote: undefined,
    outputDimensionality: params.outputDimensionality,
    fallbackModel: params.fallbackModel,
    fallbackOutputDimensionality: params.fallbackOutputDimensionality,
    local: undefined,
  } as unknown as ResolvedMemorySearchConfig;
}

type MemoryFallbackProviderRequest = NonNullable<
  ReturnType<typeof resolveMemoryFallbackProviderRequest>
>;

function expectMemoryFallbackRequest(
  request: ReturnType<typeof resolveMemoryFallbackProviderRequest>,
): MemoryFallbackProviderRequest {
  if (!request) {
    throw new Error("Expected memory fallback provider request");
  }
  return request;
}

describe("memory manager mistral provider wiring", () => {
  it("stores mistral client when mistral provider is selected", () => {
    const mistralRuntime: EmbeddingProviderRuntime = {
      id: "mistral",
      cacheKeyData: { provider: "mistral", model: "mistral-embed" },
    };

    const state = resolveMemoryProviderState({
      provider: createProvider("mistral"),
      runtime: mistralRuntime,
      fallbackFrom: undefined,
      fallbackReason: undefined,
      providerUnavailableReason: undefined,
    });

    expect(state.provider).toEqual(expect.objectContaining({ id: "mistral" }));
    expect(state.providerRuntime).toBe(mistralRuntime);
  });

  it("stores mistral client after fallback activation", () => {
    const openAiRuntime: EmbeddingProviderRuntime = {
      id: "openai",
      cacheKeyData: { provider: "openai", model: "text-embedding-3-small" },
    };
    const mistralRuntime: EmbeddingProviderRuntime = {
      id: "mistral",
      cacheKeyData: { provider: "mistral", model: "mistral-embed" },
    };
    const current = resolveMemoryProviderState({
      provider: createProvider("openai"),
      runtime: openAiRuntime,
      fallbackFrom: undefined,
      fallbackReason: undefined,
      providerUnavailableReason: undefined,
    });

    const fallbackState = applyMemoryFallbackProviderState({
      current,
      fallbackFrom: "openai",
      reason: "forced test",
      result: {
        provider: createProvider("mistral"),
        runtime: mistralRuntime,
      },
    });

    expect(fallbackState.fallbackFrom).toBe("openai");
    expect(fallbackState.fallbackReason).toBe("forced test");
    expect(fallbackState.provider).toEqual(expect.objectContaining({ id: "mistral" }));
    expect(fallbackState.providerRuntime).toBe(mistralRuntime);
  });

  it("uses default ollama model when activating ollama fallback", () => {
    const request = resolveMemoryFallbackProviderRequest({
      cfg: {} as OpenClawConfig,
      settings: createSettings({ provider: "openai", fallback: "ollama" }),
      currentProviderId: "openai",
    });

    const fallbackRequest = expectMemoryFallbackRequest(request);
    expect(fallbackRequest.provider).toBe("ollama");
    expect(fallbackRequest.model).toBe(DEFAULT_OLLAMA_EMBEDDING_MODEL);
    expect(fallbackRequest.fallback).toBe("none");
  });

  it("uses explicit fallbackModel instead of fallback adapter defaultModel", () => {
    const request = resolveMemoryFallbackProviderRequest({
      cfg: {} as OpenClawConfig,
      settings: createSettings({
        provider: "openai",
        fallback: "ollama",
        fallbackModel: "text-embedding-3-large",
      }),
      currentProviderId: "openai",
    });

    const fallbackRequest = expectMemoryFallbackRequest(request);
    expect(fallbackRequest.provider).toBe("ollama");
    expect(fallbackRequest.model).toBe("text-embedding-3-large");
  });

  it("uses fallbackOutputDimensionality for fallback requests", () => {
    const request = resolveMemoryFallbackProviderRequest({
      cfg: {} as OpenClawConfig,
      settings: createSettings({
        provider: "openai",
        fallback: "mistral",
        outputDimensionality: 1536,
        fallbackOutputDimensionality: 3072,
      }),
      currentProviderId: "openai",
    });

    const fallbackRequest = expectMemoryFallbackRequest(request);
    expect(fallbackRequest.outputDimensionality).toBe(3072);
  });

  it("allows same-provider fallback only when fallbackModel is configured", () => {
    const allowed = resolveMemoryFallbackProviderRequest({
      cfg: {} as OpenClawConfig,
      settings: createSettings({
        provider: "openai",
        fallback: "openai",
        fallbackModel: "text-embedding-3-large",
      }),
      currentProviderId: "openai",
    });
    expect(allowed).not.toBeNull();

    const blocked = resolveMemoryFallbackProviderRequest({
      cfg: {} as OpenClawConfig,
      settings: createSettings({
        provider: "openai",
        fallback: "openai",
      }),
      currentProviderId: "openai",
    });
    expect(blocked).toBeNull();
  });

  it("keeps fallback request behavior unchanged when new fields are unset", () => {
    const request = resolveMemoryFallbackProviderRequest({
      cfg: {} as OpenClawConfig,
      settings: createSettings({
        provider: "openai",
        fallback: "ollama",
        model: "models/gemini-embedding-2-preview",
        outputDimensionality: 3072,
      }),
      currentProviderId: "openai",
    });

    const fallbackRequest = expectMemoryFallbackRequest(request);
    expect(fallbackRequest.model).toBe(DEFAULT_OLLAMA_EMBEDDING_MODEL);
    expect(fallbackRequest.outputDimensionality).toBe(3072);
  });

  it("includes outputDimensionality in the primary provider request", () => {
    const request = resolveMemoryPrimaryProviderRequest({
      settings: {
        ...createSettings({ provider: "mistral" }),
        provider: "gemini",
        model: "gemini-embedding-2-preview",
        outputDimensionality: 1536,
      } as ResolvedMemorySearchConfig,
    });

    expect(request.provider).toBe("gemini");
    expect(request.model).toBe("gemini-embedding-2-preview");
    expect(request.outputDimensionality).toBe(1536);
  });

  it("includes memory input_type fields in the primary provider request", () => {
    const request = resolveMemoryPrimaryProviderRequest({
      settings: {
        ...createSettings({ provider: "openai" }),
        inputType: "passage",
        queryInputType: "query",
        documentInputType: "document",
      } as ResolvedMemorySearchConfig,
    });

    expect(request.inputType).toBe("passage");
    expect(request.queryInputType).toBe("query");
    expect(request.documentInputType).toBe("document");
  });

  it("uses default lmstudio model when activating lmstudio fallback", () => {
    const request = resolveMemoryFallbackProviderRequest({
      cfg: {} as OpenClawConfig,
      settings: createSettings({ provider: "openai", fallback: "lmstudio" }),
      currentProviderId: "openai",
    });

    const fallbackRequest = expectMemoryFallbackRequest(request);
    expect(fallbackRequest.provider).toBe("lmstudio");
    expect(fallbackRequest.model).toBe(DEFAULT_LMSTUDIO_EMBEDDING_MODEL);
    expect(fallbackRequest.fallback).toBe("none");
  });
});
