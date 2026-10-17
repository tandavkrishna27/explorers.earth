import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "../../../..");

const bootstrapSourceFiles = [
  "package.json", "package-lock.json", "docker-compose.music-test.yml",
  ".env.music.example", ".env.music.test.example",
  "fixtures/strapi/music-identity/identity.fixture.json",
  "tunes/scripts/music-cli.ts", "tunes/scripts/music-release-channel.mjs",
  "tunes/scripts/music-qualification.ts", "tunes/scripts/music-vitest-evidence.ts",
  "tunes/scripts/music-qualification-postgres.ts", "tunes/scripts/music-fixture-secret.ts",
  "tunes/scripts/windows-write-through.ps1", "tunes/scripts/music-compose-safety.ts",
  "tunes/scripts/music-process-runner.ts", "tunes/scripts/music-output-redaction.ts",
  "tunes/server/config/music-environment.ts", "tunes/server/config/secure-music-secret-file.ts",
  "tunes/shared/music-migration-contract.ts",
] as const;

function copyRepositoryFile(checkout: string, relativePath: string): void {
  const destination = join(checkout, relativePath);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(join(repositoryRoot, relativePath), destination);
}

function writeEmptyPackage(checkout: string, directory: string): void {
  const packageDirectory = join(checkout, directory);
  mkdirSync(packageDirectory, { recursive: true });
  const manifest = { name: `fixture-${directory}`, version: "1.0.0", private: true };
  writeFileSync(join(packageDirectory, "package.json"), `${JSON.stringify(manifest)}\n`);
  writeFileSync(join(packageDirectory, "package-lock.json"), `${JSON.stringify({ name: manifest.name, version: manifest.version, lockfileVersion: 3, requires: true, packages: { "": manifest } })}\n`);
}

describe("clean Music bootstrap real tool", () => {
  it("starts through the root lockfile before child dependencies exist", () => {
    if (!process.env.npm_execpath) throw new Error("npm_execpath is required");
    const rootLockHash = createHash("sha256").update(readFileSync(resolve(repositoryRoot, "package-lock.json"))).digest("hex").toUpperCase();
    expect(rootLockHash).toBe("783F9BE92D5C9DD5C13A77740476F8D3B33C4872051953FE060FAFBE2C7FAC5D");
    const offlineEnvironment = {
      ...process.env,
      npm_config_offline: "true",
      npm_config_audit: "false",
      npm_config_fund: "false",
      npm_config_update_notifier: "false",
    };
    const checkout = mkdtempSync(join(tmpdir(), "music-clean-bootstrap-"));
    try {
      for (const file of bootstrapSourceFiles) copyRepositoryFile(checkout, file);
      writeEmptyPackage(checkout, "tunes");
      writeEmptyPackage(checkout, "explorers-earth");
      mkdirSync(join(checkout, ".git", "refs", "heads"), { recursive: true });
      writeFileSync(join(checkout, ".git", "HEAD"), "ref: refs/heads/main\n");
      writeFileSync(join(checkout, ".git", "refs", "heads", "main"), "0123456789abcdef0123456789abcdef01234567\n");

      const rootInstall = spawnSync(process.execPath, [process.env.npm_execpath, "ci", "--ignore-scripts"], {
        cwd: checkout, env: offlineEnvironment, encoding: "utf8", timeout: 35_000,
      });
      expect(rootInstall.error, `${rootInstall.stdout}\n${rootInstall.stderr}`).toBeUndefined();
      expect(rootInstall.status, `${rootInstall.stdout}\n${rootInstall.stderr}`).toBe(0);
      expect(existsSync(join(checkout, "tunes", "node_modules"))).toBe(false);
      expect(existsSync(join(checkout, "explorers-earth", "node_modules"))).toBe(false);

      const bootstrap = spawnSync(process.execPath, [process.env.npm_execpath, "run", "--silent", "music:bootstrap", "--", "--format", "json"], {
        cwd: checkout, env: offlineEnvironment, encoding: "utf8", timeout: 70_000,
      });
      expect(bootstrap.error, `${bootstrap.stdout}\n${bootstrap.stderr}`).toBeUndefined();
      expect(bootstrap.status, `${bootstrap.stdout}\n${bootstrap.stderr}`).toBe(0);
      expect(JSON.parse(bootstrap.stdout.trim())).toMatchObject({ command: "bootstrap", status: "success", phase: "bootstrap" });
    } finally {
      rmSync(checkout, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  }, 120_000);
});
