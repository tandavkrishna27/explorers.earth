const fs = require('node:fs');
try {
  const raw = fs.readFileSync(process.argv[2], 'utf8');
  if (!raw.trim()) throw new Error('complete SARIF is empty');
  const report = JSON.parse(raw);
  if (report.version !== '2.1.0' || !Array.isArray(report.runs) || report.runs.length === 0 ||
      !report.runs.every(run => /^grype$/i.test(run.tool?.driver?.name ?? '') && Array.isArray(run.results))) {
    throw new Error('complete SARIF has no valid scan run');
  }
  const log = fs.readFileSync(process.argv[3], 'utf8');
  // Pinned Grype logs this INFO event after pkg.Provide has returned a successful catalog.
  const counts = [...log.matchAll(/gathered packages[^\r\n]*\bpackages=([0-9]+)\b/gi)];
  if (!counts.some(match => Number(match[1]) > 0)) throw new Error('positive package catalog evidence missing');
  console.log(`Complete SARIF validated; catalog packages=${counts[0][1]}`);
} catch (error) {
  console.error(`Image scan evidence rejected: ${error.message}`);
  process.exitCode = 1;
}
