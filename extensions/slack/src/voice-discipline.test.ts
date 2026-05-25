import { describe, it, expect } from "vitest";
import { applyVoiceDiscipline, _diagnoseVoiceDiscipline } from "./voice-discipline.js";

describe("voice-discipline.applyVoiceDiscipline", () => {
  it("returns the message unchanged when there is no process narration", () => {
    const msg = "Hello, here is the deadline: June 14, 2026.";
    expect(applyVoiceDiscipline(msg)).toBe(msg);
  });

  it("returns the message unchanged when disabled", () => {
    const msg = "*Investigating Image Access Issues*\n\nReal reply.";
    expect(applyVoiceDiscipline(msg, { disabled: true })).toBe(msg);
  });

  it("strips a single-bold Slack-mrkdwn process header at top of message", () => {
    const msg =
      "*Investigating Image Access Issues*\n\nMalaika, the files did not land in the expected directory. I will check and report back.";
    const cleaned = applyVoiceDiscipline(msg);
    expect(cleaned).not.toContain("Investigating Image Access Issues");
    expect(cleaned).toContain("Malaika, the files did not land");
  });

  it("strips a double-bold Markdown process header inline", () => {
    const msg =
      "Here is the answer.\n\n**Refining My Analysis**\n\nThe real next step is to file the motion.";
    const cleaned = applyVoiceDiscipline(msg);
    expect(cleaned).not.toContain("Refining My Analysis");
    expect(cleaned).toContain("Here is the answer.");
    expect(cleaned).toContain("The real next step is to file the motion.");
  });

  it("strips multiple sequential process headers", () => {
    const msg = [
      "*Investigating Slack Image Downloads*",
      "",
      "*Analyzing File Sharing*",
      "",
      "*Refining My Analysis*",
      "",
      "Real reply text here that is the actual answer to the user's question and contains substantive content.",
    ].join("\n");
    const cleaned = applyVoiceDiscipline(msg);
    expect(cleaned).not.toContain("Investigating");
    expect(cleaned).not.toContain("Analyzing");
    expect(cleaned).not.toContain("Refining");
    expect(cleaned).toContain("Real reply text here");
  });

  it("strips bare reasoning-narration lines like 'I am now examining...'", () => {
    const msg =
      "I am now examining the directory structure.\n\nThe answer is: the deadline is June 14, 2026 per Labor Code § 5402(b).";
    const cleaned = applyVoiceDiscipline(msg);
    expect(cleaned).not.toContain("I am now examining");
    expect(cleaned).toContain("The answer is");
  });

  it("strips 'Step N: I' enumerations", () => {
    const msg =
      "Step 1: I will check the directory.\nStep 2: I will look at the manifest.\n\nFinal: the file is at path X — substantive content here describing the real outcome of the work that the user actually cares about.";
    const cleaned = applyVoiceDiscipline(msg);
    expect(cleaned).not.toContain("Step 1: I will check");
    expect(cleaned).not.toContain("Step 2: I will look");
    expect(cleaned).toContain("Final: the file is at path X");
  });

  it("returns the original when stripping would leave less than 10% of the message", () => {
    const msg = "*Investigating Image Access Issues*\n\nok";
    // After stripping the heading and trim, only "ok" remains, far below 10%.
    expect(applyVoiceDiscipline(msg)).toBe(msg);
  });

  it("returns the original when stripping would leave an empty string", () => {
    const msg = "*Investigating*\n*Analyzing*\n*Refining*";
    // After stripping all three headings, cleaned would be empty.
    expect(applyVoiceDiscipline(msg)).toBe(msg);
  });

  it("respects custom minRemainingFraction", () => {
    const msg = "*Investigating Foo*\n\nshort but substantive reply that we want to keep.";
    // With minRemainingFraction = 0.05, even a short remaining text passes.
    const cleaned = applyVoiceDiscipline(msg, { minRemainingFraction: 0.05 });
    expect(cleaned).toContain("short but substantive reply");
  });

  it("does not strip legitimate legal prose that just happens to contain reasoning verbs", () => {
    // "The court is analyzing" is not a process-header; it's substantive prose.
    const msg =
      "The court is analyzing whether the petitioner meets the asylum standard under INA § 208(b).";
    expect(applyVoiceDiscipline(msg)).toBe(msg);
  });

  it("preserves bolded legal headings that are NOT process narration", () => {
    const msg =
      "*Relief Sought*\n\nThe petitioner seeks asylum and withholding of removal under INA § 208 and § 241(b)(3).";
    const cleaned = applyVoiceDiscipline(msg);
    expect(cleaned).toContain("*Relief Sought*");
    expect(cleaned).toContain("INA § 208");
  });

  it("collapses 3+ blank lines into a single blank line", () => {
    const msg = "Line one.\n\n\n\n\nLine two.";
    const cleaned = applyVoiceDiscipline(msg);
    expect(cleaned).toBe("Line one.\n\nLine two.");
  });
});

describe("voice-discipline._diagnoseVoiceDiscipline", () => {
  it("returns the matched headers for observability", () => {
    const msg = "*Investigating Foo*\n\n*Analyzing Bar*\n\nReal reply.";
    const hits = _diagnoseVoiceDiscipline(msg);
    expect(hits.length).toBe(2);
    expect(hits[0]).toContain("Investigating");
    expect(hits[1]).toContain("Analyzing");
  });

  it("returns empty array for clean messages", () => {
    expect(_diagnoseVoiceDiscipline("Hello.")).toEqual([]);
  });
});
