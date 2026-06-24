import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { EmbeddedContextFile } from "../pi-embedded-helpers.js";
import {
  runInstructionFollowingHarness,
  type InstructionFollowingEvalCase,
} from "./instruction-following-harness.js";

function loadJsonlCases(filePath: string): InstructionFollowingEvalCase[] {
  return fs
    .readFileSync(filePath, "utf-8")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as InstructionFollowingEvalCase);
}

function loadFixtureContextFiles(fixturePath: string): EmbeddedContextFile[] {
  const absoluteFixture = path.resolve(projectRoot(), fixturePath);
  const names = fs.readdirSync(absoluteFixture).toSorted((a, b) => a.localeCompare(b, "en"));
  return names.map((name) => ({
    path: name,
    content: fs.readFileSync(path.join(absoluteFixture, name), "utf-8"),
  }));
}

function projectRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../");
}

describe("instruction-following harness", () => {
  it("runs deterministic verbatim checks against the eval corpus", async () => {
    const corpusPath = path.join(projectRoot(), "test/eval/instruction-following/corpus.jsonl");
    const cases = loadJsonlCases(corpusPath);

    const results = await runInstructionFollowingHarness({
      cases,
      resolveContextFiles: loadFixtureContextFiles,
      projectContextOptimization: {
        dietToRetrieval: true,
        maxChars: 3_200,
      },
      runLiveEval: process.env.RUN_LIVE_EVAL === "1",
      gradeLiveRubric: async () => true,
    });

    expect(results).toHaveLength(cases.length);
    const failures = results
      .filter((result) => !result.ok)
      .map((result) => ({
        id: result.id,
        missing: result.missing,
      }));
    expect(failures).toEqual([]);
    if (process.env.RUN_LIVE_EVAL !== "1") {
      expect(results.every((result) => result.liveEval === "skipped")).toBe(true);
    }
  });
});
