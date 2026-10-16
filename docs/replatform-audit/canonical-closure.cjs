// Walks the static import closure of the canonical API entrypoint and reports
// which modules in it read STRAPI_* env or construct a Strapi HTTP client.
//
// This is the empirical form of 8.1a's exit gate: "canonical startup with no
// STRAPI_* variable set and outbound Strapi access denied". A file-count is not
// evidence; reachability from the entrypoint is.
const fs = require('node:fs');
const path = require('node:path');

const TUNES = path.resolve(process.argv[2]);
const ENTRY = path.join(TUNES, 'server/auth/canonicalStartup.ts');

const resolveImport = (fromFile, spec) => {
  if (!spec.startsWith('.')) return null; // package import, not our source
  const base = path.resolve(path.dirname(fromFile), spec);
  const candidates = [
    base,
    base + '.ts',
    base + '.tsx',
    base.replace(/\.js$/, '.ts'),
    path.join(base, 'index.ts'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
};

const seen = new Set();
const unresolved = [];
const queue = [ENTRY];

while (queue.length) {
  const file = queue.shift();
  if (seen.has(file)) continue;
  seen.add(file);
  const text = fs.readFileSync(file, 'utf8');

  // static imports/exports plus dynamic import() with a literal specifier
  const specs = [
    ...text.matchAll(/(?:^|\n)\s*(?:import|export)[\s\S]*?from\s*['"]([^'"]+)['"]/g),
    ...text.matchAll(/(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g),
    ...text.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g),
  ].map((m) => m[1]);

  for (const spec of specs) {
    if (!spec.startsWith('.')) continue;
    const resolved = resolveImport(file, spec);
    if (resolved) queue.push(resolved);
    else unresolved.push({ from: path.relative(TUNES, file), spec });
  }
}

const ENV_RE = /(?:process\.)?env(?:\.|\[['"])[A-Za-z_]*STRAPI/;
const HTTP_RE = /(?:fetch|fetchImpl|axios)/i;

const offenders = [];
for (const file of [...seen].sort()) {
  const rel = path.relative(TUNES, file).replace(/\\/g, '/');
  const text = fs.readFileSync(file, 'utf8');
  const blanked = text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  const hits = [];
  blanked.split('\n').forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, '');
    if (ENV_RE.test(code)) hits.push({ line: i + 1, kind: 'STRAPI_ENV', text: text.split('\n')[i].trim() });
    else if (/strapi/i.test(code) && HTTP_RE.test(code)) hits.push({ line: i + 1, kind: 'STRAPI_HTTP', text: text.split('\n')[i].trim() });
  });
  if (hits.length) offenders.push({ file: rel, hits });
}

const strapiNamed = [...seen]
  .map((f) => path.relative(TUNES, f).replace(/\\/g, '/'))
  .filter((f) => /strapi/i.test(f));

console.log('canonical closure: %d modules reachable from server/auth/canonicalStartup.ts', seen.size);
console.log('unresolved relative specifiers:', unresolved.length);
unresolved.slice(0, 10).forEach((u) => console.log('   ?', u.from, '->', u.spec));
console.log('');
console.log('Strapi-NAMED modules inside the canonical closure:', strapiNamed.length);
strapiNamed.forEach((f) => console.log('   !', f));
console.log('');
console.log('modules in the closure reading STRAPI_* env or doing Strapi HTTP:', offenders.length);
for (const o of offenders) {
  console.log(`\n--- ${o.file}`);
  o.hits.forEach((h) => console.log(`    ${h.line} [${h.kind}] ${h.text.slice(0, 160)}`));
}

fs.writeFileSync(
  path.join(__dirname, 'canonical-closure.json'),
  JSON.stringify(
    { entry: 'server/auth/canonicalStartup.ts', moduleCount: seen.size, modules: [...seen].map((f) => path.relative(TUNES, f).replace(/\\/g, '/')).sort(), offenders, unresolved },
    null,
    2
  )
);
