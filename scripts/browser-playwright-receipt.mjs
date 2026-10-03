import { checkedIdentities } from './browser-shard-plan.mjs';
import { validateSelectedIdentities } from './browser-test-list.mjs';

function cleanAnnotations(annotations) {
  return Array.isArray(annotations) && annotations.every(a => a && typeof a.type === 'string' && !['skip','fixme','fail'].includes(a.type));
}

/** Converts only complete zero-retry JSON evidence. It cannot authenticate the
 * child or prove resource cleanup: those facts must come from a trusted executor.
 * JSON reporter omits repeatEachIndex, so reject repeatEach>1 rather than guess.
 */
export function executionResults(child, { filePrefix, projects, assigned, cleanup }) {
  if (child.status !== 0 || child.signal || child.error || cleanup !== 'passed') throw new Error('Child or resource cleanup failed');
  if (!projects || !Object.keys(projects).length || Object.values(projects).some(n => n !== 1)) throw new Error('Unsupported runtime project/repeat metadata');
  let report;
  try { report = JSON.parse(child.stdout); } catch { throw new Error('Malformed runtime JSON'); }
  if (!Array.isArray(report.errors) || report.errors.length || !Array.isArray(report.suites) || !report.suites.length) throw new Error('Incomplete runtime report or global/teardown errors');
  const results = [];
  function walk(suite, titles, root) {
    if (!suite || typeof suite.title !== 'string') throw new Error('Malformed runtime suite');
    const next = root ? titles : [...titles, suite.title];
    if (suite.specs !== undefined && !Array.isArray(suite.specs)) throw new Error('Malformed runtime specs');
    for (const spec of suite.specs ?? []) {
      if (typeof spec.file !== 'string' || !spec.file || typeof spec.title !== 'string' || spec.ok !== true || !Array.isArray(spec.tests) || !spec.tests.length) throw new Error('Failed or malformed runtime spec');
      for (const test of spec.tests) {
        if (!Object.hasOwn(projects, test.projectName) || test.expectedStatus !== 'passed' || test.status !== 'expected' || !cleanAnnotations(test.annotations) || !Array.isArray(test.results) || test.results.length !== 1) throw new Error('Unsupported/failed/flaky/skipped/retried runtime test');
        const attempt = test.results[0];
        if (attempt.retry !== 0 || attempt.status !== 'passed' || attempt.error || !Array.isArray(attempt.errors) || attempt.errors.length || !cleanAnnotations(attempt.annotations) || !Number.isFinite(attempt.duration) || attempt.duration < 0) throw new Error('Failed or incomplete runtime attempt');
        results.push({ identity:{file:`${filePrefix}/${spec.file}`, titlePath:[...next,spec.title], project:test.projectName, repeat:0}, expectedStatus:'passed', status:'passed', attempts:[{retry:0,status:'passed'}] });
      }
    }
    if (suite.suites !== undefined && !Array.isArray(suite.suites)) throw new Error('Malformed nested runtime suites');
    for (const nested of suite.suites ?? []) walk(nested, next, false);
  }
  for (const suite of report.suites) walk(suite, [], true);
  const identities = checkedIdentities(results.map(result => result.identity));
  validateSelectedIdentities(assigned, identities);
  const stats = report.stats;
  if (!stats || stats.expected !== results.length || stats.unexpected !== 0 || stats.flaky !== 0 || stats.skipped !== 0) throw new Error('Runtime statistics mismatch');
  return results.sort((a,b) => JSON.stringify(a.identity) < JSON.stringify(b.identity) ? -1 : JSON.stringify(a.identity) > JSON.stringify(b.identity) ? 1 : 0);
}
