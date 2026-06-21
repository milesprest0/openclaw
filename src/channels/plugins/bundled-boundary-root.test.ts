import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { moduleResolvesUnderBoundaryRoot } from "./bundled.js";

const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("moduleResolvesUnderBoundaryRoot", () => {
  it("matches a plain (non-symlinked) module path under its root", () => {
    expect(
      moduleResolvesUnderBoundaryRoot(
        "/pkg/dist/extensions/slack",
        "/pkg/dist/extensions/slack/index.js",
      ),
    ).toBe(true);
  });

  it("rejects a module path outside the root (lexical)", () => {
    expect(
      moduleResolvesUnderBoundaryRoot(
        "/pkg/extensions/slack",
        "/pkg/dist/extensions/slack/index.js",
      ),
    ).toBe(false);
  });

  it("matches across a symlinked launch path (regression: gateway started via symlink)", () => {
    // Simulate: real checkout at <real>, launch/argv1 path via symlink <link> -> <real>.
    const real = makeTempDir("oc-real-");
    const distSlack = path.join(real, "dist", "extensions", "slack");
    fs.mkdirSync(distSlack, { recursive: true });
    const moduleFile = path.join(distSlack, "index.js");
    fs.writeFileSync(moduleFile, "export default {};\n");

    const linkParent = makeTempDir("oc-link-");
    const link = path.join(linkParent, "openclaw");
    fs.symlinkSync(real, link, "dir");

    // Candidate root is in SYMLINK form (derived from argv1); module path is CANONICAL.
    const symlinkDistRoot = path.join(link, "dist", "extensions", "slack");
    const canonicalModulePath = moduleFile; // real path

    // Sanity: this is exactly the case a lexical startsWith would miss.
    expect(canonicalModulePath.startsWith(`${symlinkDistRoot}${path.sep}`)).toBe(false);

    // Canonicalized containment must still recognize it.
    expect(moduleResolvesUnderBoundaryRoot(symlinkDistRoot, canonicalModulePath)).toBe(true);

    // And must NOT match the wrong (source) root, even via symlink form.
    const symlinkSourceRoot = path.join(link, "extensions", "slack");
    expect(moduleResolvesUnderBoundaryRoot(symlinkSourceRoot, canonicalModulePath)).toBe(false);
  });
});
