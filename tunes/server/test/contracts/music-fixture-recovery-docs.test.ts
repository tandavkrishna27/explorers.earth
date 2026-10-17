import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "../../../..");
const read = (path: string): string => readFileSync(resolve(repositoryRoot, path), "utf8");

describe("fixture teardown recovery documentation", () => {
  it.each([
    "docs/operations/music-deploy-runbook.md",
    "docs/development/music-command-contract.md",
    "docs/architecture/music-identity-decisions.md",
  ])("distinguishes exact pre-retirement retry from partial-state external discard in %s", (path) => {
    const documentation = read(path).replace(/\s+/g, " ");

    expect(documentation).toContain("Pre-retirement failure");
    expect(documentation).toContain("supported authority still authenticates exactly");
    expect(documentation).toContain("same confirmed command may be retried");
    expect(documentation).toContain("Partial or uncertain retirement");
    expect(documentation).toContain("truncate/fsync/close failure after mutation");
    expect(documentation).toContain("digest or generation mismatch");
    expect(documentation).toContain("mixed authority state");
    expect(documentation).toContain("no in-application retry or cleanup is authorized");
    expect(documentation).toContain("Preserve source work");
    expect(documentation).toContain("externally discard and recreate the disposable worktree from a clean checkout");
    expect(documentation).toContain("never copy ignored fixture authority into the replacement checkout");
    expect(documentation).not.toContain("Retry normal supported-authority cleanup after correcting the filesystem error");
  });
});
