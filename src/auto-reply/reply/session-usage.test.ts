import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionEntry, SessionSystemPromptReport } from "../../config/sessions.js";

const { logPromptInstrumentationRecordMock, logTokenUsageRecordMock, updateSessionStoreEntryMock } =
  vi.hoisted(() => ({
    logPromptInstrumentationRecordMock: vi.fn(async () => {}),
    logTokenUsageRecordMock: vi.fn(async () => {}),
    updateSessionStoreEntryMock: vi.fn(
      async (_params: {
        update: (entry: SessionEntry) => Promise<Partial<SessionEntry>>;
      }): Promise<unknown> => undefined,
    ),
  }));

vi.mock("../../logging/token-usage-log.js", async () => {
  const actual = await vi.importActual<typeof import("../../logging/token-usage-log.js")>(
    "../../logging/token-usage-log.js",
  );
  return {
    ...actual,
    logPromptInstrumentationRecord: logPromptInstrumentationRecordMock,
    logTokenUsageRecord: logTokenUsageRecordMock,
  };
});

vi.mock("../../config/sessions.js", () => ({
  updateSessionStoreEntry: updateSessionStoreEntryMock,
}));

const { persistSessionUsageUpdate } = await import("./session-usage.js");

describe("persistSessionUsageUpdate prompt instrumentation", () => {
  let currentEntry: SessionEntry;

  const report: SessionSystemPromptReport = {
    source: "run",
    generatedAt: 1,
    systemPrompt: {
      chars: 1200,
      projectContextChars: 900,
      nonProjectContextChars: 300,
    },
    injectedWorkspaceFiles: [
      {
        name: "README.md",
        path: "README.md",
        missing: false,
        rawChars: 200,
        injectedChars: 150,
        truncated: false,
      },
      {
        name: "NOTES.md",
        path: "NOTES.md",
        missing: false,
        rawChars: 120,
        injectedChars: 100,
        truncated: false,
      },
    ],
    skills: {
      promptChars: 400,
      entries: [],
    },
    tools: {
      listChars: 0,
      schemaChars: 600,
      entries: [],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    currentEntry = {
      sessionId: "sess-1",
      updatedAt: 1,
      model: "gpt-5.3-codex",
      modelProvider: "openai",
    };

    updateSessionStoreEntryMock.mockImplementation(
      async (params: { update: (entry: SessionEntry) => Promise<Partial<SessionEntry>> }) => {
        const patch = await params.update(currentEntry);
        currentEntry = {
          ...currentEntry,
          ...patch,
        };
        return currentEntry;
      },
    );
  });

  it("does not emit prompt instrumentation when flag is off", async () => {
    await persistSessionUsageUpdate({
      storePath: "/tmp/store",
      sessionKey: "agent:main:session-1",
      usage: { input: 1000, output: 200, total: 1200 },
      promptTokens: 1000,
      systemPromptReport: report,
      cfg: {
        observability: {
          promptInstrumentation: {
            enabled: false,
          },
        },
      },
    });

    expect(logPromptInstrumentationRecordMock).not.toHaveBeenCalled();
  });

  it("emits exactly one record with required shape when flag is on", async () => {
    const cfg = {
      observability: {
        promptInstrumentation: {
          enabled: true,
        },
      },
    };

    await persistSessionUsageUpdate({
      storePath: "/tmp/store",
      sessionKey: "agent:main:session-1",
      usage: { input: 1000, output: 200, total: 1200 },
      promptTokens: 1000,
      modelUsed: "gpt-5.3-codex",
      providerUsed: "openai",
      systemPromptReport: report,
      cfg,
    });

    expect(logPromptInstrumentationRecordMock).toHaveBeenCalledTimes(1);
    expect(logPromptInstrumentationRecordMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionKey: "agent:main:session-1",
        sessionId: "sess-1",
        model: "gpt-5.3-codex",
        provider: "openai",
        promptTokens: 1000,
        systemPrompt: {
          chars: 1200,
          projectContextChars: 900,
          nonProjectContextChars: 300,
        },
        tools: {
          schemaChars: 600,
        },
        skills: {
          promptChars: 400,
        },
        injectedWorkspaceFiles: {
          count: 2,
          injectedChars: 250,
        },
        retrieval: {
          available: false,
        },
        qualityProxy: {
          evalPassRate: null,
          regret: null,
        },
      }),
      cfg,
    );
  });
});

describe("persistSessionUsageUpdate cache telemetry integrity", () => {
  let currentEntry: SessionEntry;

  beforeEach(() => {
    vi.clearAllMocks();
    currentEntry = {
      sessionId: "sess-cache",
      updatedAt: 1,
      model: "gpt-5.3-codex",
      modelProvider: "openai",
    };
    updateSessionStoreEntryMock.mockImplementation(
      async (params: { update: (entry: SessionEntry) => Promise<Partial<SessionEntry>> }) => {
        const patch = await params.update(currentEntry);
        currentEntry = {
          ...currentEntry,
          ...patch,
        };
        return currentEntry;
      },
    );
  });

  it("does not leak accumulator cacheRead into zero-cache last-call usage", async () => {
    await persistSessionUsageUpdate({
      storePath: "/tmp/store",
      sessionKey: "agent:main:session-cache",
      usage: { input: 350, output: 25, cacheRead: 21_443, total: 21_818 },
      lastCallUsage: { input: 350, output: 25 },
      promptTokens: 350,
    });

    expect(currentEntry.cacheRead).toBe(0);
    expect(currentEntry.cacheWrite).toBe(0);
    const usageRecord = logTokenUsageRecordMock.mock.calls.at(0)?.[0];
    expect(usageRecord).not.toHaveProperty("cacheRead");
    expect(usageRecord).not.toHaveProperty("cacheWrite");
  });

  it("records live last-call cache usage for the current call", async () => {
    await persistSessionUsageUpdate({
      storePath: "/tmp/store",
      sessionKey: "agent:main:session-cache",
      usage: { input: 350, output: 25, cacheRead: 120, total: 495 },
      lastCallUsage: { input: 350, output: 25, cacheRead: 120 },
      promptTokens: 470,
    });

    expect(currentEntry.cacheRead).toBe(120);
    expect(logTokenUsageRecordMock).toHaveBeenCalledWith(
      expect.objectContaining({
        cacheRead: 120,
      }),
      expect.anything(),
    );
  });

  it("drops untrusted cacheRead that exceeds the call prompt size", async () => {
    await persistSessionUsageUpdate({
      storePath: "/tmp/store",
      sessionKey: "agent:main:session-cache",
      usage: { input: 120, output: 10, cacheRead: 21_443, total: 21_573 },
      lastCallUsage: { input: 120, output: 10, cacheRead: 21_443 },
      promptTokens: 120,
    });

    expect(currentEntry.cacheRead).toBe(0);
    expect(logTokenUsageRecordMock).toHaveBeenCalledWith(
      expect.objectContaining({
        cacheRead: 0,
      }),
      expect.anything(),
    );
  });

  it("drops cache telemetry when last-call usage family mismatches the current call", async () => {
    await persistSessionUsageUpdate({
      storePath: "/tmp/store",
      sessionKey: "agent:main:session-cache",
      usage: { input: 200, output: 20, cacheRead: 321, total: 541 },
      lastCallUsage: { input: 200, output: 20, cacheRead: 321, cacheWrite: 12 },
      lastCallUsageFamily: "anthropic",
      providerUsed: "openai",
      modelUsed: "gpt-5.5",
      promptTokens: 521,
    });

    expect(currentEntry.cacheRead).toBe(0);
    expect(currentEntry.cacheWrite).toBe(0);
    const usageRecord = logTokenUsageRecordMock.mock.calls.at(0)?.[0];
    expect(usageRecord).not.toHaveProperty("cacheRead");
    expect(usageRecord).not.toHaveProperty("cacheWrite");
  });
});
