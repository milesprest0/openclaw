import type { AgentMessage } from "@mariozechner/pi-agent-core";

export type HistorySegments = {
  frozen: AgentMessage[];
  warm: AgentMessage[];
  live: AgentMessage[];
};

function normalizeNonNegativeInt(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  const next = Math.floor(value);
  return next >= 0 ? next : 0;
}

function resolveLiveStartIndex(messages: AgentMessage[], warmTurns: number): number {
  const userIndexes: number[] = [];
  for (let i = 0; i < messages.length; i += 1) {
    if (messages[i]?.role === "user") {
      userIndexes.push(i);
    }
  }
  if (userIndexes.length === 0) {
    return 0;
  }
  const lastUserIndex = userIndexes[userIndexes.length - 1] ?? -1;
  if (lastUserIndex < 0) {
    return 0;
  }
  if (warmTurns <= 0) {
    return Math.max(0, Math.min(messages.length, lastUserIndex));
  }
  const keepStartUserIndex =
    userIndexes[Math.max(0, userIndexes.length - warmTurns)] ?? lastUserIndex;
  return Math.max(0, Math.min(messages.length, Math.min(lastUserIndex, keepStartUserIndex)));
}

function isFrozenMessage(message: AgentMessage | undefined, frozenMarkerKey: string): boolean {
  if (!message || !frozenMarkerKey) {
    return false;
  }
  const value = (message as Record<string, unknown>)[frozenMarkerKey];
  return value === true;
}

export function segmentHistory(
  messages: AgentMessage[],
  opts: { warmTurns: number; frozenMarkerKey: string },
): HistorySegments {
  if (messages.length === 0) {
    return { frozen: [], warm: [], live: [] };
  }
  const liveStartIndex = resolveLiveStartIndex(messages, normalizeNonNegativeInt(opts.warmTurns));
  let frozenEndIndex = 0;
  for (let i = 0; i < liveStartIndex; i += 1) {
    if (!isFrozenMessage(messages[i], opts.frozenMarkerKey)) {
      break;
    }
    frozenEndIndex = i + 1;
  }
  return {
    frozen: messages.slice(0, frozenEndIndex),
    warm: messages.slice(frozenEndIndex, liveStartIndex),
    live: messages.slice(liveStartIndex),
  };
}
