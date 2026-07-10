import { beforeEach, describe, expect, it, vi } from "vitest";

// Reliability coverage (auth + request/response contract + failure handling)
// for the Voyage embeddings extension. Fully mocked — no live/paid calls.

const { fetchMock, resolveClientMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  resolveClientMock: vi.fn(),
}));

vi.mock("openclaw/plugin-sdk/memory-core-host-engine-embeddings", () => ({
  fetchRemoteEmbeddingVectors: (...args: unknown[]) => fetchMock(...args),
  resolveRemoteEmbeddingBearerClient: (...args: unknown[]) => resolveClientMock(...args),
  normalizeEmbeddingModelWithPrefixes: ({
    model,
    defaultModel,
  }: {
    model: string;
    defaultModel: string;
  }) => model || defaultModel,
}));

import {
  createVoyageEmbeddingProvider,
  DEFAULT_VOYAGE_EMBEDDING_MODEL,
} from "./embedding-provider.js";

beforeEach(() => {
  fetchMock.mockReset();
  resolveClientMock.mockReset();
  resolveClientMock.mockResolvedValue({
    baseUrl: "https://api.voyageai.com/v1",
    headers: { authorization: "Bearer test-key" },
    ssrfPolicy: undefined,
  });
});

describe("voyage auth contract", () => {
  it("resolves a bearer client scoped to the voyage provider", async () => {
    fetchMock.mockResolvedValue([[0.1, 0.2]]);
    await createVoyageEmbeddingProvider({ model: "" } as never);
    expect(resolveClientMock).toHaveBeenCalledWith(expect.objectContaining({ provider: "voyage" }));
  });

  it("falls back to the default model when none is supplied", async () => {
    const { provider } = await createVoyageEmbeddingProvider({ model: "" } as never);
    expect(provider.model).toBe(DEFAULT_VOYAGE_EMBEDDING_MODEL);
  });
});

describe("voyage request/response contract", () => {
  it("posts to the /embeddings endpoint with model + input_type", async () => {
    fetchMock.mockResolvedValue([[0.5, 0.6, 0.7]]);
    const { provider } = await createVoyageEmbeddingProvider({ model: "voyage-4-large" } as never);
    const vec = await provider.embedQuery("hello");
    expect(vec).toEqual([0.5, 0.6, 0.7]);
    const call = fetchMock.mock.calls[0][0] as { url: string; body: Record<string, unknown> };
    expect(call.url).toMatch(/\/embeddings$/);
    expect(call.body).toMatchObject({ model: "voyage-4-large", input_type: "query" });
  });

  it("tags batch embeds as document input_type", async () => {
    fetchMock.mockResolvedValue([[1], [2]]);
    const { provider } = await createVoyageEmbeddingProvider({ model: "voyage-4-large" } as never);
    await provider.embedBatch(["a", "b"]);
    const call = fetchMock.mock.calls[0][0] as { body: Record<string, unknown> };
    expect(call.body).toMatchObject({ input_type: "document" });
  });

  it("short-circuits empty input without calling the remote API", async () => {
    const { provider } = await createVoyageEmbeddingProvider({ model: "voyage-4-large" } as never);
    const out = await provider.embedBatch([]);
    expect(out).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("voyage failure handling", () => {
  it("propagates remote embedding errors to the caller", async () => {
    fetchMock.mockRejectedValue(new Error("voyage embeddings failed: 401 unauthorized"));
    const { provider } = await createVoyageEmbeddingProvider({ model: "voyage-4-large" } as never);
    await expect(provider.embedQuery("x")).rejects.toThrow(/voyage embeddings failed/);
  });

  it("returns an empty vector when the API yields no rows", async () => {
    fetchMock.mockResolvedValue([]);
    const { provider } = await createVoyageEmbeddingProvider({ model: "voyage-4-large" } as never);
    const vec = await provider.embedQuery("x");
    expect(vec).toEqual([]);
  });
});
