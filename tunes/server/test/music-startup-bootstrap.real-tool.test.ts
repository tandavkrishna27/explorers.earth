import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  productionComposeInputs,
  productionEnvironmentFixture,
} from "./fixtures/music-production-environment";

const repositoryRoot = resolve(import.meta.dirname, "../../..");
const sandbox = mkdtempSync(resolve(tmpdir(), "music-startup-compose-"));
const emptyEnvironmentPath = resolve(sandbox, "empty.env");
writeFileSync(emptyEnvironmentPath, "");
afterAll(() => rmSync(sandbox, { recursive: true, force: true }));

describe("production Compose startup contract", () => {
  it("renders the tunes-blue startup contract from production Compose", () => {
    const rendered = JSON.parse(execFileSync("docker", [
      "compose", "--env-file", emptyEnvironmentPath, "--profile", "deployment", "-f", "docker-compose.yml", "config", "--format", "json",
    ], {
      cwd: repositoryRoot,
      env: productionComposeInputs(process.env),
      encoding: "utf8",
      timeout: 10_000,
    })) as {
      services: Record<string, { environment: Record<string, string> }>;
    };
    expect(rendered.services["tunes-blue"].environment).toMatchObject(productionEnvironmentFixture());
  }, 15_000);
});
