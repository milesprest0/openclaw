import { describe, expect, it } from "vitest";
import {
  SLACK_SIGNATURE_MAX_AGE_MS,
  computeSlackSignatureForTest,
  verifySlackSignature,
} from "./signature.js";

const SECRET = "test-signing-secret";
const BODY = '{"type":"event_callback","event":{"type":"app_mention"}}';

function freshTs(nowMs: number = Date.now()): string {
  return Math.floor(nowMs / 1000).toString();
}

describe("verifySlackSignature", () => {
  it("accepts a valid signature", () => {
    const ts = freshTs();
    const sig = computeSlackSignatureForTest(SECRET, ts, BODY);
    const res = verifySlackSignature({
      signingSecret: SECRET,
      headers: { signature: sig, timestamp: ts },
      rawBody: BODY,
    });
    expect(res.ok).toBe(true);
  });

  it("rejects missing signing secret", () => {
    const res = verifySlackSignature({
      signingSecret: "",
      headers: { signature: "v0=abc", timestamp: freshTs() },
      rawBody: BODY,
    });
    expect(res).toEqual({ ok: false, reason: "missing_signing_secret" });
  });

  it("rejects missing signature header", () => {
    const res = verifySlackSignature({
      signingSecret: SECRET,
      headers: { signature: null, timestamp: freshTs() },
      rawBody: BODY,
    });
    expect(res).toEqual({ ok: false, reason: "missing_signature_header" });
  });

  it("rejects missing timestamp header", () => {
    const res = verifySlackSignature({
      signingSecret: SECRET,
      headers: { signature: "v0=" + "a".repeat(64), timestamp: null },
      rawBody: BODY,
    });
    expect(res).toEqual({ ok: false, reason: "missing_timestamp_header" });
  });

  it("rejects non-numeric timestamp", () => {
    const res = verifySlackSignature({
      signingSecret: SECRET,
      headers: { signature: "v0=" + "a".repeat(64), timestamp: "not-a-number" },
      rawBody: BODY,
    });
    expect(res).toEqual({ ok: false, reason: "invalid_timestamp" });
  });

  it("rejects timestamps older than 5 minutes (replay guard)", () => {
    const now = Date.now();
    const oldTs = freshTs(now - SLACK_SIGNATURE_MAX_AGE_MS - 10_000);
    const sig = computeSlackSignatureForTest(SECRET, oldTs, BODY);
    const res = verifySlackSignature({
      signingSecret: SECRET,
      headers: { signature: sig, timestamp: oldTs },
      rawBody: BODY,
      now,
    });
    expect(res).toEqual({ ok: false, reason: "timestamp_too_old" });
  });

  it("rejects timestamps from the future (out-of-skew)", () => {
    const now = Date.now();
    const futureTs = freshTs(now + SLACK_SIGNATURE_MAX_AGE_MS + 10_000);
    const sig = computeSlackSignatureForTest(SECRET, futureTs, BODY);
    const res = verifySlackSignature({
      signingSecret: SECRET,
      headers: { signature: sig, timestamp: futureTs },
      rawBody: BODY,
      now,
    });
    expect(res).toEqual({ ok: false, reason: "timestamp_in_future" });
  });

  it("rejects signatures not starting with v0=", () => {
    const ts = freshTs();
    const res = verifySlackSignature({
      signingSecret: SECRET,
      headers: { signature: "v1=" + "a".repeat(64), timestamp: ts },
      rawBody: BODY,
    });
    expect(res).toEqual({ ok: false, reason: "invalid_signature_format" });
  });

  it("rejects signatures with wrong length", () => {
    const ts = freshTs();
    const res = verifySlackSignature({
      signingSecret: SECRET,
      headers: { signature: "v0=deadbeef", timestamp: ts },
      rawBody: BODY,
    });
    expect(res).toEqual({ ok: false, reason: "invalid_signature_format" });
  });

  it("rejects signatures with non-hex content", () => {
    const ts = freshTs();
    const res = verifySlackSignature({
      signingSecret: SECRET,
      headers: { signature: "v0=" + "z".repeat(64), timestamp: ts },
      rawBody: BODY,
    });
    expect(res).toEqual({ ok: false, reason: "invalid_signature_format" });
  });

  it("rejects signature computed with wrong secret", () => {
    const ts = freshTs();
    const sig = computeSlackSignatureForTest("WRONG-SECRET", ts, BODY);
    const res = verifySlackSignature({
      signingSecret: SECRET,
      headers: { signature: sig, timestamp: ts },
      rawBody: BODY,
    });
    expect(res).toEqual({ ok: false, reason: "signature_mismatch" });
  });

  it("rejects signature computed over modified body (timing-safe)", () => {
    const ts = freshTs();
    const sig = computeSlackSignatureForTest(SECRET, ts, BODY);
    const res = verifySlackSignature({
      signingSecret: SECRET,
      headers: { signature: sig, timestamp: ts },
      rawBody: BODY + "tampered",
    });
    expect(res).toEqual({ ok: false, reason: "signature_mismatch" });
  });
});
