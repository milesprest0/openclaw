import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildPctFull,
  logTokenUsageRecord,
  resolveTokenUsageLogPath,
  type TokenUsageRecord,
} from "./token-usage-log.js";

describe("buildPctFull", () => {
  it("computes ratio rounded to 4dp", () => {
    expect(buildPctFull(250000, 1000000)).toBe(0.25);
    expect(buildPctFull(333333, 1000000)).toBe(0.3333);
  });
  it("returns undefined when inputs missing or contextMax<=0", () => {
    expect(buildPctFull(undefined, 1000000)).toBeUndefined();
    expect(buildPctFull(100, 0)).toBeUndefined();
    expect(buildPctFull(100, undefined)).toBeUndefined();
  });
});

describe("logTokenUsageRecord", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "tokusage-"));
    vi.spyOn(
      await import("../infra/tmp-openclaw-dir.js"),
      "resolvePreferredOpenClawTmpDir",
    ).mockReturnValue(dir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("appends one JSONL record with expected fields", async () => {
    const record: TokenUsageRecord = {
      ts: new Date().toISOString(),
      sessionKey: "slack:C123",
      model: "gemini-3.5-flash",
      provider: "openrouter",
      promptTokens: 64000,
      lastCallInput: 64000,
      contextMax: 1000000,
      totalTokens: 64000,
      pctFull: buildPctFull(64000, 1000000),
    };
    await logTokenUsageRecord(record);
    const file = resolveTokenUsageLogPath();
    const contents = await readFile(file, "utf8");
    const lines = contents.trim().split("\n");
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.sessionKey).toBe("slack:C123");
    expect(parsed.promptTokens).toBe(64000);
    expect(parsed.totalTokens).toBe(64000);
    expect(parsed.pctFull).toBe(0.064);
  });

  it("does not write when disabled via config", async () => {
    const record: TokenUsageRecord = {
      ts: new Date().toISOString(),
      sessionKey: "slack:C999",
    };
    await logTokenUsageRecord(record, {
      logging: { tokenUsageLog: false },
    } as never);
    const file = resolveTokenUsageLogPath();
    await expect(readFile(file, "utf8")).rejects.toThrow();
  });
});
