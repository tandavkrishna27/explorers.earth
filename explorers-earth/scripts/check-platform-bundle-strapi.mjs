import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Phase A holds after P6-4; phase B is switched on by P6-7, once Apollo is gone. */
const ALWAYS = ['api.localqr.earth', 'localqr-strapi', 'undefined/upload', '/upload/files/', 'users_permissions_users',
  '77.42.95.255', '13.126.235.177'];
/**
 * Phase B: any occurrence of /graphql, not only a whole quoted literal. A template such as `${origin}/graphql` must fail too.
 * `localhost:1337` waits for phase B as well: eight image-URL builders pass it as runtimeOrigin()'s legacy
 * argument, which the platform runtime never returns, and platformBuildLeaks.test.ts already fails any use
 * outside that guard. Minified, a guarded and an unguarded use look the same, so the bundle cannot tell them
 * apart until the legacy build and its arguments are gone (P6-7/P6-8).
 */
const PHASE_B = ['/graphql', 'ApolloClient', '__APOLLO_CLIENT__', 'localhost:1337'];
/** The platform bundle is ~12 MB of JS; anything under half that is a broken build, not a clean one. */
export const MIN_JS_BYTES = 6_000_000;

function files(dir, found = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) files(path, found); else if (path.endsWith('.js')) found.push(path);
  }
  return found;
}

export function scanBundle(dist, { phase }) {
  const findings = [];
  let bytes = 0;
  for (const path of files(dist)) {
    const text = readFileSync(path, 'utf8');
    bytes += text.length;
    for (const marker of [...ALWAYS, ...(phase === 'B' ? PHASE_B : [])])
      if (text.includes(marker)) findings.push(`${path}: ${marker}`);
  }
  if (bytes < MIN_JS_BYTES) findings.push(`bundle size floor: ${bytes} < ${MIN_JS_BYTES} bytes of JS`);
  return { bytes, findings };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const phase = process.env.PLATFORM_BUNDLE_STRAPI_PHASE === 'B' ? 'B' : 'A';
  const { bytes, findings } = scanBundle(process.argv[2] ?? 'dist', { phase });
  if (findings.length) { console.error(findings.join('\n')); process.exit(1); }
  console.log(`platform bundle: ${bytes} bytes of JS, no Strapi signature (phase ${phase})`);
}
