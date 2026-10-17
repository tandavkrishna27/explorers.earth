import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { validateComposeModel, validateOwnedResources } from "../../../scripts/music-compose-safety.ts";

const repositoryRoot = resolve(import.meta.dirname, "../../../..");

const ownedLabels = {
  "com.docker.compose.project": "explorers-music-fixture",
  "com.explorers.music.fixture": "true",
  "com.explorers.music.project": "explorers-music-fixture",
};

const actualServices = {
  postgres: { image: "postgres:15-alpine", labels: ownedLabels },
  strapi: { image: "node:22.12-alpine", labels: ownedLabels },
  tunes: { build: { context: "C:/repo/tunes", dockerfile: "Dockerfile" }, labels: ownedLabels },
  explorers: { build: { context: "C:/repo", dockerfile: "explorers-earth/Dockerfile.music-fixture" }, labels: ownedLabels },
};

describe("Music Compose ownership safety", () => {
  it("refuses a model with an unlabeled network before cleanup", () => {
    // Production break caught: project-name confirmation alone could stop or
    // delete a network/volume that Compose resolved outside the fixture.
    expect(() => validateComposeModel({
      name: "explorers-music-fixture",
      services: actualServices,
      networks: { default: { labels: {} } },
      volumes: { database: { labels: ownedLabels } },
    })).toThrow("network default is missing required fixture labels");
  });

  it("refuses renamed fixture servers in place of the actual applications", () => {
    // Production break caught: Compose labels a generic fixture HTTP server as
    // Tunes and Explorers, so smoke never starts either application build.
    expect(() => validateComposeModel({
      name: "explorers-music-fixture",
      services: {
        ...actualServices,
        tunes: { image: "node:22-alpine", command: ["node", "music-fixture-server.ts"], labels: ownedLabels },
      },
      networks: { default: { labels: ownedLabels } },
      volumes: { database: { labels: ownedLabels } },
    })).toThrow("tunes must build the actual application");
  });

  it("requires the root-context Explorer fixture image that includes the shared publication contract", () => {
    expect(() => validateComposeModel({
      name: "explorers-music-fixture",
      services: {
        ...actualServices,
        explorers: { build: { context: "C:/repo/explorers-earth", dockerfile: "Dockerfile" }, labels: ownedLabels },
      },
      networks: { default: { labels: ownedLabels } },
      volumes: { database: { labels: ownedLabels } },
    })).toThrow("explorers must build the actual application");
  });

  it("keeps the generated exact tracked-file fixture context synchronized", () => {
    const result = spawnSync(process.execPath, [
      resolve(repositoryRoot, "scripts/generate-music-fixture-dockerignore.mjs"),
      "--check",
    ], { cwd: repositoryRoot, encoding: "utf8" });
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  });

  it("uses a fixture-Dockerfile-only allowlist for the explicit untracked dashboard UAT sources", () => {
    const result = spawnSync(process.execPath, [
      resolve(repositoryRoot, "scripts/generate-music-fixture-dockerignore.mjs"),
      "--fixture-manifest",
    ], { cwd: repositoryRoot, encoding: "utf8" });
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    const manifest = result.stdout.trim().split(/\r?\n/);
    expect(manifest).toEqual(expect.arrayContaining([
      "explorers-earth/src/features/music/musicDevelopmentTransport.ts",
      "explorers-earth/src/features/music/components/MusicPlaylistCollection.tsx",
      "explorers-earth/src/features/music/components/MusicSectionTabs.tsx",
      "explorers-earth/src/features/music/components/MusicSectionTabs.css",
      "explorers-earth/src/features/music/components/musicPlaybackCommand.ts",
      "tunes/shared/explorersOwnerContentContract.ts",
      "tunes/shared/explorersSearchContract.ts",
      "tunes/shared/explorersPublicContentContract.ts",
      "tunes/shared/explorersBookContract.ts",
      "tunes/shared/explorersBookCoverContract.ts",
    ]));
    expect(manifest).not.toEqual(expect.arrayContaining([
      "explorers-earth/src/features/music/components/__tests__/MusicSectionTabs.test.tsx",
      "explorers-earth/src/features/music/components/__tests__/MusicPlaylistCollection.test.tsx",
    ]));
    const dockerfile = readFileSync(resolve(repositoryRoot, "explorers-earth/Dockerfile.music-fixture"), "utf8");
    for (const source of manifest.filter((file) => file.startsWith("tunes/shared/"))) {
      expect(dockerfile).toContain(`COPY ${source} /workspace/${source}`);
      const contract = readFileSync(resolve(repositoryRoot, source), "utf8");
      for (const dependency of contract.matchAll(/from\s+['"]\.\/(\w+)['"]/g)) {
        expect(manifest).toContain(`tunes/shared/${dependency[1]}.ts`);
      }
    }
  });

  it("rejects a cleartext Music fixture origin from a production bundle", () => {
    const sandbox = mkdtempSync(join(tmpdir(), "music-production-bundle-"));
    try {
      for (const directory of ["src", "public", "dist"]) mkdirSync(join(sandbox, directory), { recursive: true });
      writeFileSync(join(sandbox, "src", "music.ts"), "export const musicOrigin = 'https://localtunes.earth';\n");
      writeFileSync(join(sandbox, "public", "robots.txt"), "User-agent: *\n");
      writeFileSync(join(sandbox, "dist", "music.js"), 'const origin = "http://localhost:55173";\n');
      const checker = resolve(repositoryRoot, "explorers-earth/scripts/check-music-production-bundle.mjs");
      const rejected = spawnSync(process.execPath, [checker], {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: { ...process.env, MUSIC_BUNDLE_CHECK_ROOT: sandbox },
      });
      expect(rejected.status).not.toBe(0);

      writeFileSync(join(sandbox, "dist", "music.js"), 'const origin = "https://localtunes.earth";\n');
      const accepted = spawnSync(process.execPath, [checker], {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: { ...process.env, MUSIC_BUNDLE_CHECK_ROOT: sandbox },
      });
      expect(accepted.status, `${accepted.stdout}\n${accepted.stderr}`).toBe(0);
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it("refuses absent or production-like resolved resources before cleanup", () => {
    // Production break caught: an empty `compose ps` result or a misleadingly
    // labeled production resource could be treated as safe to delete.
    expect(() => validateOwnedResources([])).toThrow("no resolved fixture resources");
    expect(() => validateOwnedResources([{
      kind: "volume",
      name: "production_music_fixture_data",
      labels: ownedLabels,
    }])).toThrow("production-like");
  });
});
