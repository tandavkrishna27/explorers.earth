import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "../../../..");

describe("Music Compose ownership safety", () => {
  it("passes only the exact source manifest through Docker ignore semantics", () => {
    const sandbox = mkdtempSync(join(tmpdir(), "music-fixture-context-"));
    const context = join(sandbox, "context");
    const output = join(sandbox, "output");
    const write = (relative: string, value = "fixture") => {
      const path = join(context, ...relative.split("/"));
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, value);
    };
    try {
      mkdirSync(context);
      write(".dockerignore", readFileSync(resolve(repositoryRoot, ".dockerignore"), "utf8"));
      write("explorers-earth/Dockerfile.music-fixture");
      write("explorers-earth/package.json", "{}");
      write("explorers-earth/src/main.tsx");
      write("explorers-earth/public/robots.txt");
      write("explorers-earth/scripts/generate-static-files.js");
      write("tunes/shared/musicPublicationContract.ts");
      write("tunes/shared/explorersOwnerContentContract.ts");
      for (const hostile of [
        "explorers-earth/.env.oauth.local",
        "tunes/.env.oauth.local",
        "explorers-earth/server/.chrome-profile/Default/Cookies",
        "explorers-earth/test-results/music/trace.zip",
        "explorers-earth/test-results/screenshots/capability.png",
        "explorers-earth/src/nested/.env.authority",
        "explorers-earth/src/nested/debug_capability.html",
        "explorers-earth/src/nested/runtime.log",
        "explorers-earth/src/.artifacts/authority/key",
        "explorers-earth/src/nested/tests/authority.ts",
        "explorers-earth/src/nested/test/authority.ts",
        "explorers-earth/src/nested/arbitrary-authority.ts",
        "explorers-earth/public/nested/.env.public",
        "explorers-earth/public/debug_response.html",
        "tunes/.env.music.test",
        "tunes/node_modules/fixture-dependency/index.js",
        "tunes/dist/server/index.js",
        "tunes/coverage/coverage-final.json",
        "tunes/test-results/music/trace.zip",
        "tunes/server/runtime.log",
        "tunes/server/tests/authority.ts",
      ]) write(hostile, "hostile-context-sentinel");
      const dockerfile = join(sandbox, "Dockerfile.context-manifest");
      writeFileSync(dockerfile, [
        "FROM node:22.12-alpine AS manifest",
        "COPY . /capture/context",
        "RUN find /capture/context -type f | sed 's#^/capture/context/##' | sort > /context-manifest.txt",
        "FROM scratch",
        "COPY --from=manifest /context-manifest.txt /context-manifest.txt",
        "",
      ].join("\n"));
      const result = spawnSync("docker", [
        "build", "--pull=false", "--progress=plain", "--file", dockerfile,
        "--output", `type=local,dest=${output}`, context,
      ], { encoding: "utf8", timeout: 25_000, stdio: ["ignore", "pipe", "pipe"] });
      expect(result.error, `${result.stdout}\n${result.stderr}`).toBeUndefined();
      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
      const manifest = readFileSync(join(output, "context-manifest.txt"), "utf8").trim().split(/\r?\n/);
      expect(manifest).toEqual([
        "explorers-earth/Dockerfile.music-fixture",
        "explorers-earth/package.json",
        "explorers-earth/public/robots.txt",
        "explorers-earth/scripts/generate-static-files.js",
        "explorers-earth/src/main.tsx",
        "tunes/shared/explorersOwnerContentContract.ts",
        "tunes/shared/musicPublicationContract.ts",
      ]);
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  }, 30_000);

  it("matches the actual root BuildKit context to the generated tracked fixture manifest", () => {
    const sandbox = mkdtempSync(join(tmpdir(), "music-fixture-actual-context-"));
    const output = join(sandbox, "output");
    const dockerfile = join(sandbox, "Dockerfile.context-manifest");
    try {
      const expectedResult = spawnSync(process.execPath, [
        resolve(repositoryRoot, "scripts/generate-music-fixture-dockerignore.mjs"),
        "--manifest",
      ], { cwd: repositoryRoot, encoding: "utf8" });
      expect(expectedResult.status, `${expectedResult.stdout}\n${expectedResult.stderr}`).toBe(0);
      const expected = expectedResult.stdout.trim().split(/\r?\n/);
      writeFileSync(dockerfile, [
        "FROM node:22.12-alpine AS manifest",
        "COPY . /capture/context",
        "RUN find /capture/context -type f | sed 's#^/capture/context/##' | sort > /context-manifest.txt",
        "FROM scratch",
        "COPY --from=manifest /context-manifest.txt /context-manifest.txt",
        "",
      ].join("\n"));
      const result = spawnSync("docker", [
        "build", "--pull=false", "--progress=plain", "--file", dockerfile,
        "--output", `type=local,dest=${output}`, repositoryRoot,
      ], { encoding: "utf8", timeout: 25_000, stdio: ["ignore", "pipe", "pipe"] });
      expect(result.error, `${result.stdout}\n${result.stderr}`).toBeUndefined();
      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
      const manifest = readFileSync(join(output, "context-manifest.txt"), "utf8").trim().split(/\r?\n/);
      expect(manifest).toEqual(expected);
      for (const denied of [
        "tunes/.env.music.test",
        "tunes/node_modules/.bin/autoprefixer",
        "tunes/dist/server/index.js",
        "explorers-earth/src/nested/tests/authority.ts",
      ]) expect(manifest).not.toContain(denied);
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  }, 30_000);
});
