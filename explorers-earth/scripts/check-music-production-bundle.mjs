import { readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const productionRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Test-only override: it lets this checker verify a synthetic production
// bundle without ever changing the default Explorer production root.
const root = process.env.MUSIC_BUNDLE_CHECK_ROOT ? resolve(process.env.MUSIC_BUNDLE_CHECK_ROOT) : productionRoot;
const commonForbidden = /fixtureMode|fixtureHttpAllowed|localtunes-(?:sso-callback|cookie-setter)|localTunes_session|localtunes_(?:cross_domain_auth|sync_done)|Connect to Local Tunes|X-Username|\/api\/auth\/sync|changeLocalTunesPassword|createLocalTunesUser/;
const cleartextMusicOrigin = /http:\/\/(?:127\.0\.0\.1|localhost):(?:55000|55173)\b/;
const sourceForbidden = new RegExp(`${commonForbidden.source}|${cleartextMusicOrigin.source}`);
// A production artifact must neither contain an enabled fixture flag nor any
// of the cleartext Music fixture authorities. Other Explorer integrations have
// independent development defaults, so this remains scoped to Music rather
// than falsely rejecting their unrelated local configuration.
const bundleForbidden = new RegExp(`${sourceForbidden.source}|VITE_MUSIC_FIXTURE_ORIGIN`);
// The only non-production bundle is the disposable, local Docker fixture.
// It may carry this exact loopback authority because its image is built with a
// dedicated Dockerfile and never shipped. Any absent or different value still
// takes the production rejection path above.
const exactFixtureBuild = process.env.MUSIC_FIXTURE_BUNDLE_CHECK === "1";
const fixtureBundleForbidden = new RegExp(`${commonForbidden.source}|VITE_MUSIC_FIXTURE_ORIGIN`);

function productionSources(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "__tests__" || entry.name === "test" ? [] : productionSources(path);
    return [".ts", ".tsx"].includes(extname(entry.name)) ? [path] : [];
  });
}

function builtArtifacts(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? builtArtifacts(path) : [path];
  });
}

for (const path of productionSources(join(root, "src"))) {
  const bytes = readFileSync(path);
  if (bytes.includes(0)) continue;
  if (sourceForbidden.test(bytes.toString("utf8"))) {
    throw new Error("Production Explorer source contains retired Music authority or cleartext fixture transport");
  }
}

for (const path of [...builtArtifacts(join(root, "public")), ...builtArtifacts(join(root, "dist"))]) {
  const bytes = readFileSync(path);
  if (bytes.includes(0)) continue;
  if ((exactFixtureBuild ? fixtureBundleForbidden : bundleForbidden).test(bytes.toString("utf8"))) {
    throw new Error("Production Explorer public/bundle contains retired Music authority or cleartext fixture transport");
  }
}

process.stdout.write("Explorer production Music transport contract: HTTPS-only\n");
