import { describe, expect, it } from "vitest";
import { SocketDropException } from "../errors.js";
import { SocketAdapter } from "./socket-adapter.js";

describe("SocketAdapter", () => {
  it("marks pre-response socket failures as retryable", async () => {
    let responseStarted = false;
    const wrapped = SocketAdapter.attach(
      Promise.reject(Object.assign(new Error("socket hang up"), { code: "ECONNRESET" })),
      () => responseStarted,
    );

    await expect(wrapped).rejects.toMatchObject({
      name: "SocketDropException",
      safeToRetry: true,
    });

    responseStarted = true;
  });

  it("marks mid-stream socket failures as non-retryable", async () => {
    let responseStarted = true;
    const wrapped = SocketAdapter.attach(Promise.reject(new Error("UND_ERR_SOCKET")), () => {
      return responseStarted;
    });

    await expect(wrapped).rejects.toMatchObject({
      name: "SocketDropException",
      safeToRetry: false,
    });

    responseStarted = false;
  });

  it("keeps non-socket errors unchanged", async () => {
    const original = new Error("validation failed");
    const wrapped = SocketAdapter.attach(Promise.reject(original), () => false);
    await expect(wrapped).rejects.toBe(original);
  });

  it("does not wrap existing SocketDropException values", async () => {
    const original = new SocketDropException("already wrapped", false);
    const wrapped = SocketAdapter.attach(Promise.reject(original), () => false);
    await expect(wrapped).rejects.toBe(original);
  });
});
