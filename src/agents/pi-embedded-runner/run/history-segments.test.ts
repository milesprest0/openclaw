import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { describe, expect, it } from "vitest";
import { segmentHistory } from "./history-segments.js";

describe("segmentHistory", () => {
  it("splits frozen, warm, and live segments", () => {
    const messages: AgentMessage[] = [
      { role: "user", content: "u1", timestamp: 0, frozen: true } as AgentMessage,
      { role: "assistant", content: "a1", timestamp: 0, frozen: true } as AgentMessage,
      { role: "user", content: "u2", timestamp: 0 } as AgentMessage,
      { role: "assistant", content: "a2", timestamp: 0 } as AgentMessage,
      { role: "user", content: "u3", timestamp: 0 } as AgentMessage,
      { role: "assistant", content: "a3", timestamp: 0 } as AgentMessage,
    ];

    const segmented = segmentHistory(messages, {
      warmTurns: 1,
      frozenMarkerKey: "frozen",
    });

    expect(segmented.frozen).toHaveLength(2);
    expect(segmented.warm).toHaveLength(2);
    expect(segmented.live).toHaveLength(2);
    expect(segmented.live[0]?.role).toBe("user");
  });
});
