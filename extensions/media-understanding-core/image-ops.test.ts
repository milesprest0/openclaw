import { describe, expect, it, vi } from "vitest";

// Reliability coverage for the media-understanding-core image ops.
// `sharp` is a heavy optional native dep; we mock it so the tests exercise the
// contract (metadata normalization, resize plumbing, failure handling) without
// invoking native image processing. Fully mocked — no network, no native calls.

const sharpInstance = {
  metadata: vi.fn(async () => ({ width: 100, height: 50, hasAlpha: false, channels: 3 })),
  rotate: vi.fn(() => sharpInstance),
  resize: vi.fn(() => sharpInstance),
  jpeg: vi.fn(() => sharpInstance),
  png: vi.fn(() => sharpInstance),
  toBuffer: vi.fn(async () => Buffer.from("processed")),
};
const sharpFactory = vi.fn(() => sharpInstance);

vi.mock("sharp", () => ({ default: sharpFactory }));

const { createMediaAttachmentImageOps } = await import("./image-ops.js");

describe("media-understanding-core input validation / failure handling", () => {
  it("rejects a non-positive maxInputPixels budget", () => {
    expect(() => createMediaAttachmentImageOps({ maxInputPixels: 0 })).toThrow(/positive/);
    expect(() => createMediaAttachmentImageOps({ maxInputPixels: -1 })).toThrow();
  });
});

describe("media-understanding-core request/response contract", () => {
  const ops = createMediaAttachmentImageOps({ maxInputPixels: 1_000_000 });

  it("normalizes valid metadata into width/height", async () => {
    const meta = await ops.getImageMetadata(Buffer.from("x"));
    expect(meta).toEqual({ width: 100, height: 50 });
  });

  it("returns null when metadata reports non-positive dimensions", async () => {
    sharpInstance.metadata.mockResolvedValueOnce({ width: 0, height: 0 } as never);
    const meta = await ops.getImageMetadata(Buffer.from("x"));
    expect(meta).toBeNull();
  });

  it("resizes to jpeg via the fit=inside contract", async () => {
    const out = await ops.resizeToJpeg({ buffer: Buffer.from("x"), maxSide: 512, quality: 80 });
    expect(Buffer.isBuffer(out)).toBe(true);
    expect(sharpInstance.resize).toHaveBeenCalledWith(
      expect.objectContaining({ width: 512, height: 512, fit: "inside" }),
    );
    expect(sharpInstance.jpeg).toHaveBeenCalledWith(
      expect.objectContaining({ quality: 80, mozjpeg: true }),
    );
  });

  it("detects an alpha channel from channels=4", async () => {
    sharpInstance.metadata.mockResolvedValueOnce({ hasAlpha: false, channels: 4 } as never);
    expect(await ops.hasAlphaChannel(Buffer.from("x"))).toBe(true);
  });
});
