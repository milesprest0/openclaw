import { describe, expect, it } from "vitest";
import {
  classifyBenignSlackApiError,
  isBenignSlackApiError,
} from "./benign-api-errors.js";

describe("classifyBenignSlackApiError", () => {
  it("returns 'not_in_channel' for Slack WebAPIError-shaped objects", () => {
    const err = new Error("An API error occurred: not_in_channel") as Error & {
      code: string;
      data: { error: string };
    };
    err.code = "slack_webapi_platform_error";
    err.data = { error: "not_in_channel" };
    expect(classifyBenignSlackApiError(err)).toBe("not_in_channel");
    expect(isBenignSlackApiError(err)).toBe(true);
  });

  it("returns 'channel_not_found' via .data.error", () => {
    const err = { data: { error: "channel_not_found" } };
    expect(classifyBenignSlackApiError(err)).toBe("channel_not_found");
  });

  it("falls back to regex on raw Error message when no structured code is present", () => {
    const err = new Error("Error: An API error occurred: not_in_channel");
    expect(classifyBenignSlackApiError(err)).toBe("not_in_channel");
  });

  it("returns null for unrelated errors", () => {
    expect(classifyBenignSlackApiError(new Error("network timeout"))).toBeNull();
    expect(classifyBenignSlackApiError({ data: { error: "rate_limited" } })).toBeNull();
    expect(classifyBenignSlackApiError(null)).toBeNull();
    expect(classifyBenignSlackApiError(undefined)).toBeNull();
    expect(classifyBenignSlackApiError("")).toBeNull();
  });

  it("handles plain strings", () => {
    expect(classifyBenignSlackApiError("oops not_in_channel here")).toBe("not_in_channel");
    expect(classifyBenignSlackApiError("channel_not_found")).toBe("channel_not_found");
  });

  it("does not match substrings of unrelated words", () => {
    // Word-boundary guarded: 'not_in_channelship' should NOT match.
    expect(classifyBenignSlackApiError("not_in_channelship")).toBeNull();
  });
});
