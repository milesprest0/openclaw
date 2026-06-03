import { afterEach, describe, expect, it } from "vitest";
import {
  clearInboundRetention,
  DEFAULT_INBOUND_RETENTION_GRACE_MS,
  isInboundMediaPinned,
  pinInboundMedia,
  pinnedInboundIds,
  releaseInboundMedia,
} from "./inbound-retention.js";

describe("inbound-retention registry", () => {
  afterEach(() => {
    clearInboundRetention();
  });

  it("pins inbound media so it is retained while a turn is in-flight", () => {
    const now = 1_000_000;
    pinInboundMedia(["a", "b"], 60_000, now);
    expect(isInboundMediaPinned("a", now)).toBe(true);
    expect(isInboundMediaPinned("b", now + 59_000)).toBe(true);
    expect(pinnedInboundIds(now).sort()).toEqual(["a", "b"]);
  });

  it("drops a pin once its ttl elapses (abandoned media still ages out)", () => {
    const now = 1_000_000;
    pinInboundMedia("a", 10_000, now);
    expect(isInboundMediaPinned("a", now + 10_001)).toBe(false);
    expect(pinnedInboundIds(now + 10_001)).toEqual([]);
  });

  it("retains media through the grace window on FAILED turn release (never deletes on failure)", () => {
    const now = 1_000_000;
    // In-flight pin from a long/timed-out turn.
    pinInboundMedia("doc", 120_000, now);
    // Simulate the turn FAILING: release with grace instead of delete.
    const failAt = now + 30_000;
    releaseInboundMedia("doc", DEFAULT_INBOUND_RETENTION_GRACE_MS, failAt);
    // Still retained right after failure...
    expect(isInboundMediaPinned("doc", failAt + 1)).toBe(true);
    // ...and through the grace window so a retry can recover it.
    expect(isInboundMediaPinned("doc", failAt + DEFAULT_INBOUND_RETENTION_GRACE_MS - 1)).toBe(true);
    // Only ages out after grace expires.
    expect(isInboundMediaPinned("doc", failAt + DEFAULT_INBOUND_RETENTION_GRACE_MS + 1)).toBe(
      false,
    );
  });

  it("release grace never cuts short a longer pin held by another in-flight run", () => {
    const now = 1_000_000;
    pinInboundMedia("shared", 10 * 60_000, now); // 10 min in-flight
    // A different, shorter-lived run releases the shared id with a 1s grace.
    releaseInboundMedia("shared", 1_000, now);
    // The longer in-flight pin still wins.
    expect(isInboundMediaPinned("shared", now + 5 * 60_000)).toBe(true);
  });

  it("releasing an id that was never pinned is a no-op (does not create retention)", () => {
    const now = 1_000_000;
    releaseInboundMedia("never-pinned", DEFAULT_INBOUND_RETENTION_GRACE_MS, now);
    expect(isInboundMediaPinned("never-pinned", now)).toBe(false);
    expect(pinnedInboundIds(now)).toEqual([]);
  });

  it("pinInboundMedia extends but never shortens an existing pin", () => {
    const now = 1_000_000;
    pinInboundMedia("x", 100_000, now);
    pinInboundMedia("x", 10_000, now); // shorter: ignored
    expect(isInboundMediaPinned("x", now + 50_000)).toBe(true);
    pinInboundMedia("x", 200_000, now); // longer: extends
    expect(isInboundMediaPinned("x", now + 150_000)).toBe(true);
  });

  it("ignores non-positive ttl and empty ids", () => {
    const now = 1_000_000;
    pinInboundMedia("x", 0, now);
    pinInboundMedia("", 1_000, now);
    pinInboundMedia([""], 1_000, now);
    expect(pinnedInboundIds(now)).toEqual([]);
  });
});
