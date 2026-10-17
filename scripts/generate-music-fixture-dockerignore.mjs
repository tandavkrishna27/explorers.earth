import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const dockerignorePath = resolve(repositoryRoot, ".dockerignore");
const fixtureDockerignorePath = resolve(repositoryRoot, "explorers-earth/Dockerfile.music-fixture.dockerignore");
const allowedExtensions = new Set([
  ".ts", ".tsx", ".js", ".css", ".json", ".svg", ".png", ".jpg", ".jpeg", ".avif", ".txt", ".xml",
]);
const deniedSegments = new Set([
  "test", "tests", "__tests__", "node_modules", "dist", "coverage", "test-results", ".chrome-profile",
  "traces", "screenshots", ".artifacts",
]);
// Entry points only. Every shared contract these transitively import through a
// relative specifier is DERIVED below by sharedContractClosure(), so adding a
// new `from "./otherContract"` inside a manifested contract can no longer break
// the Music fixture build (or the transitive-closure gate that caught it).
const sharedContractEntryPoints = [
  "tunes/shared/musicPublicationContract.ts",
  "tunes/shared/explorersContract.ts",
  "tunes/shared/explorersOwnerContentContract.ts",
  "tunes/shared/explorersSearchContract.ts",
  "tunes/shared/explorersPublicContentContract.ts",
  "tunes/shared/explorersRichNoteContract.ts",
  "tunes/shared/explorersBookContract.ts",
  "tunes/shared/explorersBookCoverContract.ts",
  "tunes/shared/explorersMovieContract.ts",
  "tunes/shared/explorersMovieMediaContract.ts",
  "tunes/shared/explorersAppContract.ts",
  "tunes/shared/explorersAppEnrichmentContract.ts",
  "tunes/shared/explorersPlacePinsContract.ts",
  "tunes/shared/explorersPlacePinsFraming.ts",
  "tunes/shared/explorersProductContract.ts",
  "tunes/shared/explorersPersonContract.ts",
  "tunes/shared/explorersPublicPeopleSectorContract.ts",
  "tunes/shared/explorersPlaceContract.ts",
  "tunes/shared/explorersPlaceLinkContract.ts",
  // Ticket 5.3. explorersApiClient is in this context and imports the guide contract, so
  // the contract has to travel with it or the image's frontend build cannot resolve it.
  "tunes/shared/explorersGuideContract.ts",
  "tunes/shared/explorersLifecycleObservation.ts",
  "tunes/shared/explorersGameContract.ts",
  "tunes/shared/explorersGameOwnerContract.ts",
];

// Breadth-first over relative `from "./x"` specifiers inside tunes/shared, so the
// manifest is the import closure of the entry points rather than a hand-kept list.
function sharedContractClosure(entryPoints) {
  const closure = new Set();
  const queue = [...entryPoints];
  while (queue.length) {
    const file = queue.shift();
    if (closure.has(file)) continue;
    closure.add(file);
    const source = readFileSync(resolve(repositoryRoot, file), "utf8");
    for (const [, specifier] of source.matchAll(/from\s+['"]\.\/([\w.-]+)['"]/g)) {
      const dependency = `tunes/shared/${specifier.replace(/\.(?:ts|js)$/, "")}.ts`;
      if (!closure.has(dependency)) queue.push(dependency);
    }
  }
  return [...closure];
}

const fixedFiles = [
  ...sharedContractClosure(sharedContractEntryPoints),
  "explorers-earth/Dockerfile.music-fixture",
  "explorers-earth/package.json",
  "explorers-earth/package-lock.json",
  "explorers-earth/index.html",
  "explorers-earth/vite.config.ts",
  "explorers-earth/tsconfig.json",
  "explorers-earth/tsconfig.app.json",
  "explorers-earth/tsconfig.node.json",
  "explorers-earth/tailwind.config.js",
  "explorers-earth/postcss.config.js",
  "explorers-earth/nginx.conf",
  "explorers-earth/nginx.music-fixture.conf",
  "explorers-earth/scripts/check-landing-i18n.mjs",
  "explorers-earth/scripts/check-landing-hardcoded-copy.mjs",
  "explorers-earth/scripts/generate-static-files.js",
  "explorers-earth/scripts/check-music-production-bundle.mjs",
  "explorers-earth/src/features/Movies/api/explorersAdapter.ts",
  "explorers-earth/src/features/Movies/api/moviesClient.ts",
  "explorers-earth/src/features/Movies/api/moviesViewModel.ts",
  "explorers-earth/src/features/Movies/api/publicMoviesContinuation.ts",
  "explorers-earth/src/features/Movies/api/usePublicMovieGenre.ts",
  // Ticket 5.3. Named explicitly because discovery only picks up the *Client/*ViewModel/
  // explorersAdapter/hooks shapes, and GuidesPage - which is in this context - imports it.
  "explorers-earth/src/features/Guides/api/guideListWrites.ts",
  "explorers-earth/src/features/Guides/context/GuideEditingProvider.tsx",
  "explorers-earth/src/features/Games/api/gamesClient.ts",
  "explorers-earth/src/features/Games/api/gamesViewModel.ts",
  "explorers-earth/src/features/Games/api/explorersAdapter.ts",
  "explorers-earth/src/features/Games/hooks/useGamesOwner.ts",
];
// The compose file explicitly builds explorers-earth/Dockerfile.music-fixture,
// so this small allowlist affects only the disposable Music UAT image.  It
// lets an in-progress isolated worktree exercise its new dashboard modules
// without broadening the root (production) Docker context.
const fixtureOnlyDashboardFiles = [
  "explorers-earth/src/features/music/musicDevelopmentTransport.ts",
  "explorers-earth/src/features/music/components/MusicPlaylistCollection.tsx",
  "explorers-earth/src/features/music/components/MusicSectionTabs.tsx",
  "explorers-earth/src/features/music/components/MusicSectionTabs.css",
  "explorers-earth/src/features/music/components/musicPlaybackCommand.ts",
];

function trackedFixtureFiles() {
  const tracked = execFileSync("git", ["ls-files", "-z", "--", "explorers-earth/src", "explorers-earth/public"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  }).split("\0").filter(Boolean);
  const allowed = tracked.filter((path) => {
    const normalized = path.replaceAll("\\", "/");
    const segments = normalized.toLowerCase().split("/");
    const name = segments.at(-1) ?? "";
    const extensionIndex = name.lastIndexOf(".");
    const extension = extensionIndex >= 0 ? name.slice(extensionIndex) : "";
    return allowedExtensions.has(extension)
      && !segments.some((segment) => deniedSegments.has(segment))
      && !name.startsWith(".env")
      && !name.startsWith("debug_")
      && !name.endsWith(".log")
      && !name.includes(".test.")
      && !name.includes(".spec.");
  });
  return [...new Set([...fixedFiles, ...allowed])].sort();
}

function generatedDockerignore(files, description) {
  const directories = new Set();
  for (const file of files) {
    const segments = file.split("/");
    for (let length = 1; length < segments.length; length += 1) {
      directories.add(segments.slice(0, length).join("/"));
    }
  }
  const orderedDirectories = [...directories].sort((left, right) => {
    const depth = left.split("/").length - right.split("/").length;
    return depth || left.localeCompare(right);
  });
  return [
    "# GENERATED by scripts/generate-music-fixture-dockerignore.mjs --write.",
    `# ${description}`,
    "**",
    "",
    ...orderedDirectories.flatMap((directory) => [`!${directory}/`, `${directory}/*`]),
    "",
    ...files.map((file) => `!${file}`),
    "",
  ].join("\n");
}

const files = trackedFixtureFiles();
const generated = generatedDockerignore(files, "Default deny. Every traversable directory immediately denies all children; only exact tracked fixture files reopen.");
const fixtureFiles = [...new Set([...files, ...fixtureOnlyDashboardFiles])].sort();
const generatedFixture = generatedDockerignore(fixtureFiles, "Fixture-only default deny. The explicit Music fixture Dockerfile additionally permits the exact dashboard UAT sources below.");
const [mode, ...extra] = process.argv.slice(2);
if (extra.length || !["--check", "--write", "--manifest", "--fixture-manifest"].includes(mode)) {
  process.stderr.write("Usage: generate-music-fixture-dockerignore.mjs --check|--write|--manifest|--fixture-manifest\n");
  process.exitCode = 2;
} else if (mode === "--check") {
  let current = "";
  try { current = readFileSync(dockerignorePath, "utf8"); } catch { /* fixed failure below */ }
  let currentFixture = "";
  try { currentFixture = readFileSync(fixtureDockerignorePath, "utf8"); } catch { /* fixed failure below */ }
  if (current.replaceAll("\r\n", "\n") !== generated || currentFixture.replaceAll("\r\n", "\n") !== generatedFixture) {
    process.stderr.write("Music fixture Docker context manifest is stale.\n");
    process.exitCode = 1;
  }
} else if (mode === "--write") {
  writeFileSync(dockerignorePath, generated, "utf8");
  writeFileSync(fixtureDockerignorePath, generatedFixture, "utf8");
} else {
  process.stdout.write(`${(mode === "--fixture-manifest" ? fixtureFiles : files).join("\n")}\n`);
}
