// Classifies every Strapi reference in tunes/server + tunes/shared by EVIDENCE,
// not by a filename or a text match. Read-only.
//
// The inventory's STRAPI_REFERENCE tag matches /Strapi|strapi|.../ anywhere in a
// file, comments included, so it is an upper bound. The ticket's own gate says
// "an unused text match is not a runtime dependency" — so each line is split
// into code or comment, and each file is labelled by its strongest code line.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');

const root = path.resolve(process.argv[2]);
const PATTERN = /strapi/i;

const files = cp
  .execFileSync('git', ['ls-files', 'tunes/server', 'tunes/shared'], { cwd: root, encoding: 'utf8' })
  .trim()
  .split('\n')
  .filter((f) => /\.(tsx?|mjs|cjs)$/.test(f) && !/(\/(__tests__|test|tests)\/|\.(test|spec)\.)/.test(f));

/** Strip block comments, then classify each surviving line. */
function classifyLines(text) {
  // Blank out block comments so a /* ... strapi ... */ line is not read as code.
  const blanked = text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  const rawLines = text.split('\n');
  const codeLines = blanked.split('\n');

  const code = [];
  const comment = [];
  rawLines.forEach((raw, i) => {
    if (!PATTERN.test(raw)) return;
    const bare = codeLines[i];
    const withoutLineComment = bare.replace(/\/\/.*$/, '');
    if (PATTERN.test(withoutLineComment)) {
      code.push({ line: i + 1, text: raw.trim() });
    } else {
      comment.push({ line: i + 1, text: raw.trim() });
    }
  });
  return { code, comment };
}

const KINDS = [
  // Strongest evidence first.
  { kind: 'ENV_READ', re: /process\.env\.[A-Z0-9_]*STRAPI[A-Z0-9_]*/ },
  { kind: 'IMPORT', re: /^\s*import[\s\S]*strapi/i },
  { kind: 'EXPORT_DECL', re: /^\s*export\s+(class|const|function|type|interface)\s+\w*strapi/i },
  { kind: 'TYPE_ONLY', re: /^\s*(type|interface)\s+\w*strapi/i },
  { kind: 'STRING_LITERAL', re: /['"`][^'"`]*strapi[^'"`]*['"`]/i },
  { kind: 'IDENTIFIER', re: /strapi/i },
];

const rows = [];

for (const f of files) {
  const text = fs.readFileSync(path.join(root, f), 'utf8');
  if (!PATTERN.test(text)) continue;
  const { code, comment } = classifyLines(text);

  const kinds = new Set();
  for (const line of code) {
    for (const k of KINDS) {
      if (k.re.test(line.text)) {
        kinds.add(k.kind);
        break;
      }
    }
  }

  rows.push({
    file: f,
    codeCount: code.length,
    commentCount: comment.length,
    kinds: [...kinds],
    verdict: code.length === 0 ? 'COMMENT_ONLY' : 'CODE',
    code,
  });
}

const commentOnly = rows.filter((r) => r.verdict === 'COMMENT_ONLY');
const withCode = rows.filter((r) => r.verdict === 'CODE');

console.log('files scanned:', files.length);
console.log('files mentioning strapi at all:', rows.length);
console.log('  COMMENT_ONLY (not a runtime dependency):', commentOnly.length);
console.log('  with at least one code reference:', withCode.length);
console.log('');
console.log('=== COMMENT_ONLY ===');
commentOnly.forEach((r) => console.log(`  ${r.file} (${r.commentCount} comment lines)`));
console.log('');
console.log('=== CODE REFERENCES ===');
withCode
  .sort((a, b) => b.codeCount - a.codeCount)
  .forEach((r) => {
    console.log(`\n--- ${r.file}  [${r.kinds.join(',')}]  ${r.codeCount} code / ${r.commentCount} comment`);
    r.code.slice(0, 40).forEach((l) => console.log(`    ${l.line}: ${l.text.slice(0, 150)}`));
    if (r.code.length > 40) console.log(`    ... ${r.code.length - 40} more`);
  });

fs.writeFileSync(
  path.join(__dirname, 'strapi-classification.json'),
  JSON.stringify({ rows }, null, 2)
);
