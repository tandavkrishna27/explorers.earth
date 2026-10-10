import { beforeAll, expect, it, vi } from 'vitest';
import { canonicalDigest, parseRelease, verifyRelease } from '../../../../scripts/platform-release-contract';
import { runReleaseCli } from '../../../../scripts/platform-release';

// All contexts, tokens, responses and transports here are synthetic. They prove no hosted provenance.
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Row = { [key: string]: Json };
type Observer = (input: unknown, context: unknown, dependencies: { token: string; transport: typeof fetch }) => Promise<unknown>;
let exports: Record<string, unknown>;
let importFailure: unknown;
beforeAll(async () => {
  try { exports = await import('../../../../scripts/platform-release-authority'); }
  catch (error) { importFailure = error; }
});
function moduleReady(): Observer {
  expect(importFailure, 'SETUP_MODULE_UNAVAILABLE: platform-release-authority import failed; CI behavior NOT EXERCISED').toBeUndefined();
  expect(typeof exports.observeCandidateCi).toBe('function');
  return exports.observeCandidateCi as Observer;
}
const source = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const base = 'https://api.github.com/repos/tandavkrishna27/explorers.earth';
const token = 'synthetic-private-token';
const frontend = [
  ['lint', '🔍 Lint'], ['typecheck', '🔷 TypeScript'], ['unit-tests', '🧪 Unit Tests'],
  ['build', '🏗️ Build'], ['integration-tests', '🔗 Integration Tests'], ['e2e-category-a', '🎭 E2E Category A'],
  ['e2e-category-b', '🎭 E2E Category B'], ['e2e-public-shell', '🎭 E2E Public shell'],
  ['e2e-publishing', '🎭 E2E Publishing'], ['e2e-music-account', '🎭 E2E Music and account'],
  ['replatform-required', 'replatform-required'],
] as const;
const backend = ['docs-contracts', 'static', 'unit-coverage', 'contracts', 'database', 'security', 'frontend',
  'browser', 'load-chaos', 'image-deploy-contract', 'platform-fixture', 'music-required'] as const;
const maps: readonly (readonly (readonly [string, string])[])[] = [frontend, backend.map(name => [name, name] as const)];
function selectors() { return { validated_run_id: '101', music_validated_run_id: '102' }; }
function context() { return { repository: 'tandavkrishna27/explorers.earth', ref: 'refs/heads/codex/unified-replatform', eventName: 'workflow_dispatch', checkoutSha: source, candidateHeadSha: source }; }
function repository(): Row { return { id: 1171328761, full_name: 'tandavkrishna27/explorers.earth' }; }
function workflow(index: number): Row { return { id: index === 0 ? 310453885 : 340709050, path: index === 0 ? '.github/workflows/ci.yml' : '.github/workflows/test.yml', state: 'active' }; }
function run(index: number): Row { const w = workflow(index); return { id: 101 + index, workflow_id: w.id, path: w.path, head_sha: source,
  head_branch: 'codex/unified-replatform', event: 'push', status: 'completed', conclusion: 'success', run_attempt: 2,
  repository: repository(), head_repository: repository() }; }
function jobs(index: number): Row[] { return maps[index].map(([, name], j) => ({ id: 501 + index * 100 + j, name, status: 'completed', conclusion: 'success' })); }
function response(value: Json, headers: Record<string, string> = {}) { return new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json', ...headers } }); }
type Call = { url: string; init: RequestInit | undefined; occurrence: number };
type Change = (url: URL, value: Row, occurrence: number) => Json;
function fixture(change: Change = (_url, value) => value, replacement?: (call: Call, value: Json) => Response | Promise<Response>) {
  const calls: Call[] = []; let active = 0, maxActive = 0;
  const transport: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const occurrence = calls.filter(call => call.url === url.href).length;
    const call = { url: url.href, init, occurrence }; calls.push(call); active++; maxActive = Math.max(maxActive, active);
    try {
      const index = url.pathname.includes('/102') || url.pathname.includes('/340709050') ? 1 : 0;
      let value: Row;
      if (url.pathname.includes('/actions/workflows/')) value = workflow(index);
      else if (url.pathname.endsWith('/jobs')) value = { total_count: maps[index].length, jobs: jobs(index) };
      else if (url.pathname.includes('/actions/runs/')) value = run(index);
      else value = repository();
      const changed = change(url, value, occurrence);
      return replacement ? await replacement(call, changed) : response(changed);
    } finally { active--; }
  };
  return { calls, transport, maxActive: () => maxActive };
}
async function observe(f = fixture(), input: unknown = selectors(), ctx: unknown = context(), auth = token) {
  return moduleReady()(input, ctx, { token: auth, transport: f.transport });
}
async function rejects(promise: Promise<unknown>, code: string) {
  const error: unknown = await promise.then(() => { throw new Error('unexpected synthetic acceptance'); }, error => error);
  expect(error).toBeInstanceOf(exports.CandidateCiError);
  expect(error).toMatchObject({ name: 'CandidateCiError', code, message: code });
  expect(error).not.toHaveProperty('cause');
  expect(JSON.stringify(error)).not.toMatch(/synthetic-private|private-exception|private-body|private-header/);
}
function deepFrozen(value: unknown) {
  if (value !== null && typeof value === 'object') { expect(Object.isFrozen(value)).toBe(true); for (const child of Object.values(value)) deepFrozen(child); }
}
function ownShapes(value: Record<string, unknown>) {
  const key = Object.keys(value)[0]; let getters = 0;
  const accessor = { ...value }; Object.defineProperty(accessor, key, { enumerable: true, get() { getters++; throw new Error('private-exception'); } });
  const hidden = { ...value }; Object.defineProperty(hidden, key, { enumerable: false });
  const missing = { ...value }; delete missing[key];
  const inherited = Object.assign(Object.create({ [key]: value[key] }), missing);
  return { getters: () => getters, values: [null, 1, 'value', [], { ...value, unknown: true }, missing, inherited, accessor, hidden,
    { ...value, [Symbol('private')]: 1 }, Object.assign(Object.create(Date.prototype), value),
    new Proxy(value, { ownKeys() { throw new Error('private-exception'); } })] };
}
function expectedObservation() {
  return { status: 'CI_PREFLIGHT_OBSERVED_UNQUALIFIED', releaseQualified: false, policyVersion: 'candidate-ci-v1',
    repository: 'tandavkrishna27/explorers.earth', repositoryId: 1171328761, sourceCommit: source,
    runs: maps.map((map, index) => ({ runId: index === 0 ? '101' : '102', runAttempt: 2,
      workflowId: index === 0 ? 310453885 : 340709050, workflowPath: index === 0 ? '.github/workflows/ci.yml' : '.github/workflows/test.yml',
      jobs: map.map(([key, name], j) => ({ key, name, jobId: 501 + index * 100 + j, conclusion: 'success' })) })) };
}
function paths(pages = 1) {
  return [base, ...[0, 1].flatMap(index => [base + '/actions/workflows/' + (index === 0 ? 310453885 : 340709050),
    base + '/actions/runs/' + (101 + index), ...Array.from({ length: pages }, (_, j) => base + '/actions/runs/' + (101 + index) + '/attempts/2/jobs?per_page=100&page=' + (j + 1)),
    base + '/actions/runs/' + (101 + index)])];
}

it('Candidate CI preflight: strict selectors context and dependencies precede transport', async () => {
  const fn = moduleReady();
  for (const value of [0, 101, '', '0', '01', ' 101', '101 ', '+101', '-101', '1e2', '9007199254740992', '10000000000000000']) {
    for (const key of ['validated_run_id', 'music_validated_run_id']) { const f = fixture(); await rejects(observe(f, { ...selectors(), [key]: value }), 'SELECTOR_INVALID'); expect(f.calls).toHaveLength(0); }
  }
  for (const [value, code] of [[{ ...selectors(), music_validated_run_id: '101' }, 'SELECTOR_INVALID'],
    [{ ...context(), repository: 'other/repo' }, 'CONTEXT_INVALID'], [{ ...context(), ref: 'refs/heads/main' }, 'CONTEXT_INVALID'],
    [{ ...context(), eventName: 'push' }, 'CONTEXT_INVALID'], [{ ...context(), checkoutSha: 'A'.repeat(40) }, 'CONTEXT_INVALID'],
    [{ ...context(), candidateHeadSha: 'b'.repeat(40) }, 'CONTEXT_INVALID'], [{ ...context(), checkoutSha: 'a'.repeat(39) }, 'CONTEXT_INVALID']] as const) {
    const f = fixture(); await rejects(code === 'SELECTOR_INVALID' ? observe(f, value) : observe(f, selectors(), value), code); expect(f.calls).toHaveLength(0);
  }
  for (const [target, code] of [['input', 'SELECTOR_INVALID'], ['context', 'CONTEXT_INVALID'], ['dependencies', 'DEPENDENCIES_INVALID']] as const) {
    const f = fixture(); const valid = target === 'input' ? selectors() : target === 'context' ? context() : { token, transport: f.transport };
    const shapes = ownShapes(valid);
    for (const value of shapes.values) await rejects(fn(target === 'input' ? value : selectors(), target === 'context' ? value : context(),
      (target === 'dependencies' ? value : { token, transport: f.transport }) as { token: string; transport: typeof fetch }), code);
    for (const key of Object.keys(valid)) {
      let evaluated = 0;
      const accessor = { ...valid }; Object.defineProperty(accessor, key, { enumerable: true, get() { evaluated++; throw new Error('private-exception'); } });
      const hidden = { ...valid }; Object.defineProperty(hidden, key, { enumerable: false });
      const missing = { ...valid } as Record<string, unknown>; delete missing[key];
      const inherited = Object.assign(Object.create({ [key]: (valid as Record<string, unknown>)[key] }), missing);
      for (const value of [accessor, hidden, missing, inherited]) await rejects(fn(target === 'input' ? value : selectors(), target === 'context' ? value : context(),
        (target === 'dependencies' ? value : { token, transport: f.transport }) as { token: string; transport: typeof fetch }), code);
      expect(evaluated).toBe(0);
    }
    expect(shapes.getters()).toBe(0); expect(f.calls).toHaveLength(0);
  }
  for (const value of ['', ' ', 'x y', 'x\n', '\tx']) { const f = fixture(); await rejects(observe(f, selectors(), context(), value), 'AUTHENTICATION_UNAVAILABLE'); expect(f.calls).toHaveLength(0); }
  for (const delta of [{ token: 1 }, { transport: null }]) { const f = fixture(); await rejects(fn(selectors(), context(), { token, transport: f.transport, ...delta } as { token: string; transport: typeof fetch }), 'DEPENDENCIES_INVALID'); expect(f.calls).toHaveLength(0); }
  await rejects(fn(null, null, null as unknown as { token: string; transport: typeof fetch }), 'SELECTOR_INVALID');
  await rejects(fn(selectors(), null, null as unknown as { token: string; transport: typeof fetch }), 'CONTEXT_INVALID');
  expect(await observe(fixture(), Object.assign(Object.create(null), selectors()), Object.assign(Object.create(null), context()), 'x')).toEqual(expectedObservation());
  const nullDependencies = fixture(); expect(await fn(selectors(), context(), Object.assign(Object.create(null), { token, transport: nullDependencies.transport }))).toEqual(expectedObservation());
  await observe(fixture(), selectors(), context(), 'x'.repeat(20000)); // No invented token-length policy.
});

it('Candidate CI preflight: complete synthetic policy stays unqualified and immutable', async () => {
  moduleReady();
  expect(exports.CANDIDATE_CI_POLICY).toEqual({ version: 'candidate-ci-v1', repository: 'tandavkrishna27/explorers.earth', repositoryId: 1171328761,
    branch: 'codex/unified-replatform', ref: 'refs/heads/codex/unified-replatform', apiOrigin: 'https://api.github.com', apiVersion: '2022-11-28',
    requestTimeoutMs: 10000, maxResponseBytes: 1048576, perPage: 100, maxPages: 10, maxJobs: 1000,
    workflows: maps.map((map, index) => ({ id: index === 0 ? 310453885 : 340709050, path: index === 0 ? '.github/workflows/ci.yml' : '.github/workflows/test.yml',
      selector: index === 0 ? 'validated_run_id' : 'music_validated_run_id', jobs: map.map(([key, name]) => ({ key, name, allowSkipped: index === 1 && key === 'load-chaos' })) })) });
  const f = fixture((url, value) => url.pathname.endsWith('/jobs') ? { ...value, jobs: [...value.jobs as Row[]].reverse(), harmless: 'private-body' } : { ...value, harmless: 'private-body' });
  const timeout = vi.spyOn(AbortSignal, 'timeout');
  try {
    const output = await observe(f); expect(output).toEqual(expectedObservation());
    expect(f.calls.map(call => call.url)).toEqual(paths()); expect(f.maxActive()).toBe(1);
    expect(timeout.mock.calls).toEqual(Array.from({ length: 9 }, () => [10000]));
    expect(new Set(f.calls.map(call => call.init?.signal)).size).toBe(9);
    for (const call of f.calls) { expect(call.init).toMatchObject({ method: 'GET', redirect: 'error' });
      const headers = new Headers(call.init?.headers); expect(headers.get('Authorization')).toBe('Bearer synthetic-private-token');
      expect(headers.get('Accept')).toBe('application/vnd.github+json'); expect(headers.get('X-GitHub-Api-Version')).toBe('2022-11-28'); }
    deepFrozen(exports.CANDIDATE_CI_POLICY); deepFrozen(output);
    expect(() => Object.assign(output as object, { releaseQualified: true })).toThrow();
    const runs = (output as { runs: object[] }).runs; expect(() => runs.push({})).toThrow();
    const policy = exports.CANDIDATE_CI_POLICY as { workflows: { jobs: object[] }[] };
    expect(() => policy.workflows[0].jobs.push({})).toThrow(); expect(() => Object.assign(policy.workflows[1].jobs[8], { allowSkipped: false })).toThrow();
    expect(() => Object.assign((output as { runs: { jobs: object[] }[] }).runs[0].jobs[0], { conclusion: 'skipped' })).toThrow();
    const serialized = JSON.stringify(output); expect(JSON.parse(serialized).releaseQualified).toBe(false);
    expect(serialized).not.toMatch(/private|https:|harmless|token|candidateEligible/);
  } finally { timeout.mockRestore(); }
});

it('Candidate CI preflight: repository workflow and push source binding reject drift', async () => {
  moduleReady();
  const schemas = [
    { endpoint: base, value: repository(), fields: ['id', 'full_name'] },
    { endpoint: base + '/actions/workflows/310453885', value: workflow(0), fields: ['id', 'path', 'state'] },
    { endpoint: base + '/actions/runs/101', value: run(0), fields: ['id', 'workflow_id', 'path', 'head_sha', 'head_branch', 'event', 'status', 'conclusion', 'run_attempt', 'repository', 'head_repository'] },
  ];
  for (const schema of schemas) for (const key of schema.fields) {
    const absent = { ...schema.value }; delete absent[key];
    for (const bad of [absent, { ...schema.value, [key]: [] }, ...(key === 'conclusion' ? [] : [{ ...schema.value, [key]: null }])]) {
      await rejects(observe(fixture((url, value) => url.href === schema.endpoint ? bad : value)), 'API_RESPONSE_INVALID');
    }
    if (typeof schema.value[key] === 'number') for (const id of [0, -1, 1.5, 9007199254740992, '101'])
      await rejects(observe(fixture((url, value) => url.href === schema.endpoint ? { ...value, [key]: id } : value)), 'API_RESPONSE_INVALID');
  }
  for (const delta of [{ id: 1 }, { full_name: 'attacker/fork' }]) {
    await rejects(observe(fixture((url, value) => url.href === base ? { ...value, ...delta } : value)), 'REPOSITORY_IDENTITY_MISMATCH');
    for (const key of ['repository', 'head_repository']) {
      await rejects(observe(fixture((url, value) => url.pathname.endsWith('/runs/101') ? { ...value, [key]: { ...repository(), ...delta } } : value)), 'REPOSITORY_IDENTITY_MISMATCH');
      for (const invalid of [null, {}, { ...repository(), id: '1171328761' }, { ...repository(), full_name: 1 }])
        await rejects(observe(fixture((url, value) => url.pathname.endsWith('/runs/101') ? { ...value, [key]: invalid } : value)), 'API_RESPONSE_INVALID');
    }
  }
  for (const delta of [{ id: 1 }, { path: '.github/workflows/wrong.yml' }, { state: 'disabled_manually' }])
    await rejects(observe(fixture((url, value) => url.pathname.includes('/workflows/') ? { ...value, ...delta } : value)), 'WORKFLOW_IDENTITY_MISMATCH');
  for (const delta of [{ id: 999 }, { workflow_id: 1 }, { path: '.github/workflows/wrong.yml' }, { head_sha: 'b'.repeat(40) },
    { head_branch: 'main' }, ...['workflow_dispatch', 'pull_request', 'schedule', 'nightly'].map(event => ({ event }))])
    await rejects(observe(fixture((url, value) => url.pathname.endsWith('/runs/101') ? { ...value, ...delta } : value)), 'RUN_BINDING_MISMATCH');
  for (const delta of [...['queued', 'in_progress', 'pending'].map(status => ({ status })),
    ...['failure', 'skipped', 'cancelled', 'neutral', 'timed_out', null].map(conclusion => ({ conclusion }))])
    await rejects(observe(fixture((url, value) => url.pathname.endsWith('/runs/101') ? { ...value, ...delta } : value)), 'RUN_NOT_SUCCESSFUL');
  await rejects(observe(fixture((url, value) => url.href === base ? { ...value, id: 'wrong', full_name: 'attacker/fork' } : value)), 'API_RESPONSE_INVALID');
});

it('Candidate CI preflight: every required job and sole load chaos exemption', async () => {
  moduleReady();
  for (let index = 0; index < 2; index++) for (const [, name] of maps[index]) {
    const mutate = (transform: (rows: Row[]) => Row[]) => fixture((url, value) => {
      if (!url.pathname.endsWith('/runs/' + (101 + index) + '/attempts/2/jobs')) return value;
      const rows = transform(value.jobs as Row[]); return { total_count: rows.length, jobs: rows };
    });
    await rejects(observe(mutate(rows => rows.filter(row => row.name !== name))), 'REQUIRED_JOB_AMBIGUOUS');
    await rejects(observe(mutate(rows => [...rows, { ...rows.find(row => row.name === name)!, id: 9999 }])), 'REQUIRED_JOB_AMBIGUOUS');
    await rejects(observe(mutate(rows => rows.map(row => row.name === name ? { ...row, name: name + ' ' } : row))), 'REQUIRED_JOB_AMBIGUOUS');
    for (const status of ['queued', 'in_progress']) await rejects(observe(mutate(rows => rows.map(row => row.name === name ? { ...row, status } : row))), 'REQUIRED_JOB_NOT_SUCCESSFUL');
    for (const conclusion of ['failure', 'cancelled', 'neutral', 'timed_out', null, 'skipped']) {
      const f = mutate(rows => rows.map(row => row.name === name ? { ...row, conclusion } : row));
      if (index === 1 && name === 'load-chaos' && conclusion === 'skipped') {
        const output = await observe(f) as { runs: { jobs: { name: string; conclusion: string }[] }[] };
        expect(output.runs[1].jobs.find(row => row.name === 'load-chaos')?.conclusion).toBe('skipped');
      } else await rejects(observe(f), 'REQUIRED_JOB_NOT_SUCCESSFUL');
    }
  }
  await rejects(observe(fixture((url, value) => url.pathname.endsWith('/jobs') ? { total_count: 2, jobs: [jobs(0)[0], jobs(0)[0]] } : value)), 'JOB_IDENTITY_AMBIGUOUS');
  // These child/aggregate blockers are covered individually above, never substituted by a green aggregate.
  expect(maps.flat().map(([, name]) => name)).toEqual(expect.arrayContaining(['platform-fixture', 'music-required', 'replatform-required']));
});

function paginated(count: number, change?: Change) {
  return fixture((url, value, occurrence) => {
    if (!url.pathname.endsWith('/jobs')) return change ? change(url, value, occurrence) : value;
    const index = url.pathname.includes('/102/') ? 1 : 0;
    const all = [...Array.from({ length: count - maps[index].length }, (_, j) => ({ id: 10000 + index * 10000 + j, name: 'unrelated-' + j, status: 'completed', conclusion: 'success' })), ...jobs(index)];
    const page = Number(url.searchParams.get('page'));
    const result = { total_count: count, jobs: all.slice((page - 1) * 100, page * 100) };
    return change ? change(url, result, occurrence) : result;
  }, (_call, value) => response(value, { Link: '<https://attacker.invalid/private>; rel="next"' }));
}
it('Candidate CI preflight: bounded complete attempt pagination and optional row binding', async () => {
  moduleReady();
  for (const count of [111, 1000]) { const f = paginated(count); expect(await observe(f)).toEqual(expectedObservation());
    expect(f.calls.map(call => call.url)).toEqual(paths(count === 111 ? 2 : 10)); expect(f.calls).toHaveLength(count === 111 ? 11 : 27); expect(f.maxActive()).toBe(1); }
  for (const total_count of [-1, 1.5, 1001, '11', null])
    await rejects(observe(fixture((url, value) => url.pathname.endsWith('/jobs') ? { ...value, total_count } : value)), 'API_RESPONSE_INVALID');
  for (const bad of [{ total_count: 0, jobs: [] }, { total_count: 111, jobs: jobs(0) }, { total_count: 1, jobs: jobs(0) }])
    await rejects(observe(fixture((url, value) => url.pathname.endsWith('/jobs') ? bad : value)), bad.total_count === 0 ? 'REQUIRED_JOB_AMBIGUOUS' : 'JOB_PAGINATION_INVALID');
  for (const rows of [null, {}, Array.from({ length: 101 }, (_, i) => ({ ...jobs(0)[0], id: i + 1 }))])
    await rejects(observe(fixture((url, value) => url.pathname.endsWith('/jobs') ? { total_count: 111, jobs: rows } : value)), 'API_RESPONSE_INVALID');
  for (const key of ['total_count', 'jobs']) await rejects(observe(fixture((url, value) => {
    if (!url.pathname.endsWith('/jobs')) return value; const page = { ...value }; delete page[key]; return page;
  })), 'API_RESPONSE_INVALID');
  await rejects(observe(paginated(111, (url, value) => url.searchParams.get('page') === '2' ? { ...value, total_count: 112 } : value)), 'JOB_PAGINATION_INVALID');
  await rejects(observe(paginated(111, (url, value) => url.searchParams.get('page') === '2' ? { ...value, jobs: (value.jobs as Row[]).map((row, j) => j === 0 ? { ...row, id: 10000 } : row) } : value)), 'JOB_IDENTITY_AMBIGUOUS');
  for (const field of ['id', 'name', 'status', 'conclusion']) for (const mode of ['missing', 'wrong']) {
    await rejects(observe(fixture((url, value) => { if (!url.pathname.endsWith('/jobs')) return value;
      const row = { ...jobs(0)[0] }; if (mode === 'missing') delete row[field]; else row[field] = [];
      return { total_count: 1, jobs: [row] }; })), 'API_RESPONSE_INVALID');
  }
  for (const id of [0, -1, 1.5, 9007199254740992]) await rejects(observe(fixture((url, value) => url.pathname.endsWith('/jobs') ? {
    total_count: 1, jobs: [{ ...jobs(0)[0], id }] } : value)), 'API_RESPONSE_INVALID');
  for (const field of ['run_id', 'head_sha', 'run_attempt']) for (const required of [true, false]) {
    for (const value of [null, [], field === 'head_sha' ? 1 : '1', field === 'head_sha' ? 'b'.repeat(40) : 999]) {
      const f = fixture((url, page) => { if (!url.pathname.endsWith('/jobs')) return page;
        const rows = [...page.jobs as Row[]]; if (!required) rows.push({ id: 9999, name: 'unrelated', status: 'completed', conclusion: 'success' });
        const j = required ? 0 : rows.length - 1; rows[j] = { ...rows[j], [field]: value }; return { total_count: rows.length, jobs: rows }; });
      await rejects(observe(f), typeof value === (field === 'head_sha' ? 'string' : 'number') ? 'JOB_BINDING_MISMATCH' : 'API_RESPONSE_INVALID');
    }
  }
  expect(await observe(fixture((url, value) => !url.pathname.endsWith('/jobs') ? value : { ...value, jobs: (value.jobs as Row[]).map(row => ({ ...row, run_id: url.pathname.includes('/101/') ? 101 : 102, run_attempt: 2, head_sha: source })) }))).toEqual(expectedObservation());
});

it('Candidate CI preflight: final run reobservation rejects changed authority', async () => {
  moduleReady();
  for (const index of [0, 1]) for (const delta of [{ id: 999 }, { workflow_id: 1 }, { path: 'different' }, { head_sha: 'b'.repeat(40) },
    { head_branch: 'main' }, { event: 'workflow_dispatch' }, { status: 'in_progress' }, { conclusion: 'failure' }, { conclusion: null }, { run_attempt: 3 },
    ...['repository', 'head_repository'].flatMap(key => [{ [key]: { ...repository(), id: 1 } }, { [key]: { ...repository(), full_name: 'attacker/fork' } }])]) {
    const f = fixture((url, value, occurrence) => url.pathname.endsWith('/runs/' + (101 + index)) && occurrence === 1 ? { ...value, ...delta } : value);
    await rejects(observe(f), 'RUN_CHANGED');
    expect(f.calls.map(call => call.url)).toEqual(paths().slice(0, index === 0 ? 5 : 9));
  }
  for (const invalid of [{ run_attempt: null }, { repository: {} }, { conclusion: 1 }])
    await rejects(observe(fixture((url, value, occurrence) => url.pathname.endsWith('/runs/101') && occurrence === 1 ? { ...value, ...invalid } : value)), 'API_RESPONSE_INVALID');
  expect(await observe(fixture((_url, value, occurrence) => ({ ...value, updated_at: occurrence ? 'later' : 'earlier' })))).toEqual(expectedObservation());
  const blocked = fixture((url, value) => url.pathname.endsWith('/jobs') ? { total_count: 0, jobs: [] } : value);
  await rejects(observe(blocked), 'REQUIRED_JOB_AMBIGUOUS'); expect(blocked.calls).toHaveLength(4);
});

type Reader = { read: () => Promise<ReadableStreamReadResult<Uint8Array>>; cancel: () => unknown };
function readerResponse(reader: Reader): Response {
  return { status: 200, redirected: false, url: '', headers: new Headers({ 'content-type': 'application/json' }),
    body: { getReader: () => reader } } as unknown as Response;
}
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
it('Candidate CI preflight: bounded transport bodies deadlines and cleanup sanitize failure', async () => {
  const fn = moduleReady();
  const single = (reply: () => Response | Promise<Response>) => fn(selectors(), context(), { token, transport: async () => reply() });
  for (const status of [302, 401, 403, 404, 429, 500]) await rejects(single(() => new Response('private-body', { status })), 'API_REQUEST_FAILED');
  for (const delta of [{ redirected: true }, { url: 'https://attacker.invalid/private' }, { url: base + '/wrong' }, { url: '://invalid' }]) {
    const reply = response(repository()); for (const [key, value] of Object.entries(delta)) Object.defineProperty(reply, key, { value });
    await rejects(single(() => reply), 'API_REDIRECT_REJECTED');
  }
  expect(await observe(fixture(undefined, (call, value) => {
    const reply = response(value); Object.defineProperty(reply, 'url', { value: call.url.replace('https://api.github.com/', 'https://API.GITHUB.COM:443/') }); return reply;
  }))).toEqual(expectedObservation());
  for (const contentType of ['text/html', 'application/octet-stream', 'application/jsonx'])
    await rejects(single(() => new Response('{}', { headers: { 'content-type': contentType } })), 'API_CONTENT_TYPE_INVALID');
  for (const contentType of ['application/json', 'APPLICATION/JSON; charset=utf-8', 'application/vnd.github+json'])
    expect(await observe(fixture(undefined, (_call, value) => new Response(JSON.stringify(value), { headers: { 'content-type': contentType } })))).toEqual(expectedObservation());
  for (const length of ['', '-1', '1.5', 'x', '1048577']) await rejects(single(() => response(repository(), { 'content-length': length })), 'API_BODY_LIMIT');
  await rejects(single(() => new Response(' '.repeat(1048577), { headers: { 'content-type': 'application/json' } })), 'API_BODY_LIMIT');
  const padded = JSON.stringify(repository()).padEnd(1048576, ' ');
  expect(await observe(fixture(undefined, (call, value) => call.url === base ? new Response(padded, { headers: { 'content-type': 'application/json', 'content-length': '1048576' } }) : response(value)))).toEqual(expectedObservation());
  await rejects(single(() => new Response(null, { headers: { 'content-type': 'application/json' } })), 'API_BODY_INVALID');
  for (const bytes of [new Uint8Array([0xff]), new TextEncoder().encode('private-body')])
    await rejects(single(() => new Response(bytes, { headers: { 'content-type': 'application/json' } })), 'API_JSON_INVALID');
  await rejects(single(() => readerResponse({ read: async () => ({ done: false, value: 'nonbyte' } as unknown as ReadableStreamReadResult<Uint8Array>), cancel: () => undefined })), 'API_BODY_INVALID');
  for (const key of ['status', 'redirected', 'url', 'headers', 'body']) { const reply = response(repository());
    Object.defineProperty(reply, key, { get() { throw new Error('private-exception'); } }); await rejects(single(() => reply), 'API_REQUEST_FAILED'); }
  for (const method of ['headers-get', 'getReader', 'read']) {
    const reply = readerResponse({ read: async () => { throw new Error('private-exception'); }, cancel: () => undefined });
    if (method === 'headers-get') Object.defineProperty(reply, 'headers', { value: { get() { throw new Error('private-header'); } } });
    if (method === 'getReader') Object.defineProperty(reply, 'body', { value: { getReader() { throw new Error('private-exception'); } } });
    await rejects(single(() => reply), 'API_REQUEST_FAILED');
  }
  for (const target of ['headers-get', 'getReader', 'read']) {
    const reply = readerResponse({ read: async () => ({ done: true, value: undefined }), cancel: () => undefined });
    const receiver = target === 'headers-get' ? reply.headers : target === 'getReader' ? reply.body! : reply.body!.getReader();
    Object.defineProperty(receiver, target === 'headers-get' ? 'get' : target, { get() { throw new Error('private-exception'); } });
    if (target === 'read') Object.defineProperty(reply, 'body', { value: { getReader: () => receiver } });
    await rejects(single(() => reply), 'API_REQUEST_FAILED');
  }
  await rejects(single(() => { throw new Error('private-exception'); }), 'API_REQUEST_FAILED');
  // Retain ordinary JSON.parse duplicate-key semantics rather than claiming a stronger API parser.
  expect(await observe(fixture(undefined, (call, value) => call.url === base ? new Response('{"id":1,"id":1171328761,"full_name":"tandavkrishna27/explorers.earth"}', { headers: { 'content-type': 'application/json' } }) : response(value)))).toEqual(expectedObservation());
  const original = new TextEncoder().encode(JSON.stringify(repository())); let reads = 0;
  expect(await observe(fixture(undefined, (call, value) => call.url === base ? readerResponse({ read: async () => {
    if (reads++ === 0) return { done: false, value: original }; original.fill(0); return { done: true, value: undefined };
  }, cancel: () => undefined }) : response(value)))).toEqual(expectedObservation());
  vi.useFakeTimers();
  const signals: AbortSignal[] = []; const removals: ReturnType<typeof vi.spyOn>[] = [];
  const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => { const c = new AbortController(); signals.push(c.signal);
    removals.push(vi.spyOn(c.signal, 'removeEventListener')); setTimeout(() => c.abort(), ms); return c.signal; });
  try {
    const aborted = new AbortController(); aborted.abort();
    timeout.mockReturnValueOnce(aborted.signal);
    await rejects(single(() => { throw new Error('private-exception'); }), 'API_TIMEOUT');
    for (const mode of ['fetch', 'read', 'combined']) {
      const fetchGate = deferred<Response>(); const readGate = deferred<ReadableStreamReadResult<Uint8Array>>(); let cancellations = 0;
      const reply = readerResponse({ read: () => readGate.promise, cancel: () => { cancellations++; return new Promise<void>(() => {}); } });
      const pending = single(() => mode === 'read' ? reply : fetchGate.promise); const assertion = rejects(pending, 'API_TIMEOUT');
      if (mode === 'combined') { await vi.advanceTimersByTimeAsync(6000); fetchGate.resolve(reply); await vi.advanceTimersByTimeAsync(3999);
        expect(signals.at(-1)?.aborted).toBe(false); await vi.advanceTimersByTimeAsync(1); }
      else await vi.advanceTimersByTimeAsync(10000);
      await assertion; if (mode !== 'fetch') expect(cancellations).toBe(1);
    }
    for (const mode of ['pending', 'reject', 'throw']) {
      let calls = 0; const cleanup = deferred<void>();
      const pending = single(() => readerResponse({ read: async () => ({ done: false, value: new Uint8Array(1048577) }),
        cancel: () => { calls++; if (mode === 'throw') throw new Error('private-exception'); return mode === 'reject' ? cleanup.promise : new Promise<void>(() => {}); } }));
      const assertion = rejects(pending, 'API_BODY_LIMIT'); await vi.advanceTimersByTimeAsync(0); await assertion; expect(calls).toBe(1);
      if (mode === 'reject') { cleanup.reject(new Error('private-exception')); await vi.advanceTimersByTimeAsync(0); }
      await vi.advanceTimersByTimeAsync(10000); // Later abort must not replace the first body-limit failure.
    }
    const serial = fixture(undefined, async (_call, value) => {
      const gate = deferred<Response>(); setTimeout(() => gate.resolve(response(value)), 9000); return gate.promise;
    });
    const serialAssertion = observe(serial).then(output => expect(output).toEqual(expectedObservation()));
    await vi.advanceTimersByTimeAsync(81000); await serialAssertion;
    expect(serial.maxActive()).toBe(1); expect(serial.calls).toHaveLength(9);
    expect(removals.every(spy => spy.mock.calls.some(call => call[0] === 'abort'))).toBe(true);
  } finally { for (const spy of removals) spy.mockRestore(); timeout.mockRestore(); vi.useRealTimers(); }
});

it('Candidate CI preflight: caller mutation and offline APIs confer no release authority', async () => {
  const fn = moduleReady(); expect(Object.keys(exports).sort()).toEqual(['CANDIDATE_CI_POLICY', 'CandidateCiError', 'observeCandidateCi']);
  const input = selectors(), ctx = context(), gate = deferred<Response>(); const f = fixture(); let first = true;
  const transport: typeof fetch = async (url, init) => { if (first) { first = false; return gate.promise; } return f.transport(url, init); };
  const deps = { token, transport }; const pending = fn(input, ctx, deps);
  input.validated_run_id = '999'; input.music_validated_run_id = '998'; ctx.checkoutSha = 'b'.repeat(40); ctx.candidateHeadSha = 'b'.repeat(40);
  ctx.repository = 'attacker/fork'; ctx.ref = 'refs/heads/main'; ctx.eventName = 'push';
  deps.token = 'mutated'; deps.transport = async () => { throw new Error('private-exception'); }; gate.resolve(response(repository()));
  const output = await pending; expect(output).toEqual(expectedObservation()); expect(f.calls.map(call => call.url)).toEqual(paths().slice(1));
  expect(f.calls.every(call => new Headers(call.init?.headers).get('Authorization') === 'Bearer synthetic-private-token')).toBe(true);
  for (const forged of [JSON.parse(JSON.stringify(output)), { ...selectors(), proof: output }, { ...selectors(), releaseQualified: true }]) {
    const unused = fixture(); await rejects(observe(unused, forged), 'SELECTOR_INVALID'); expect(unused.calls).toHaveLength(0);
  }
  const digest = 'sha256:' + 'b'.repeat(64);
  const manifest: Row = { version: 1, sourceCommit: source, schemaVersion: 52, producerRunId: '123', producerRepository: 'tandavkrishna27/explorers.earth',
    producerWorkflow: '.github/workflows/platform-candidate.yml', testEvidenceRef: 'artifact:123/qualification',
    images: { api: { repository: 'ghcr.io/tandavkrishna27/explorers-api', digest, platforms: { 'linux/amd64': { digest, smokeEvidenceRef: 'artifact:123/api-smoke' } } },
      web: { repository: 'ghcr.io/tandavkrishna27/explorers-web', digest, platforms: { 'linux/amd64': { digest, smokeEvidenceRef: 'artifact:123/web-smoke' } } } } };
  manifest.manifestDigest = canonicalDigest(manifest);
  const ready = { version: 1, environment: 'qa', hostAlias: 'qa-host', sshUser: 'deploy', sshPort: 22, knownHostKeyRef: 'qa_KNOWN_HOST', architecture: 'linux/amd64',
    dockerVersion: '29.2.1', composeVersion: '2.39.0', publicOrigin: 'https://qa.example.test', internalPorts: { api: 5000, web: 80, postgres: 5432 },
    database: { name: 'qa_db', volume: 'qa_data', runtimeRole: 'qa_app', migratorRole: 'qa_migrator', runtimePasswordRef: 'qa_DB_PASSWORD_FILE', migratorPasswordRef: 'qa_MIGRATOR_PASSWORD_FILE' },
    storage: { bucket: 'shared-private-bucket', region: 'ap-south-1', prefix: 'qa/', boundary: 'application-shared-principal' },
    google: { clientIdRef: 'GOOGLE_CLIENT_ID', clientSecretRef: 'GOOGLE_CLIENT_SECRET', callback: 'https://qa.example.test/api/auth/callback/google' },
    appSecretRef: 'qa_APP_SECRET', publicConfig: { origin: 'https://qa.example.test', apiPath: '/api', socketPath: '/socket.io' } };
  expect(parseRelease(manifest).schemaVersion).toBe(52);
  expect(() => verifyRelease(manifest, ready, { success: true, trusted: true, observation: output } as never)).toThrow('TRUSTED_AUTHORITY_UNAVAILABLE');
  expect(await runReleaseCli(['inspect', '--manifest', 'synthetic.json'], async () => JSON.stringify(manifest))).toEqual({ exitCode: 0, stdout: 'STRUCTURALLY_VALID_UNQUALIFIED\n', stderr: '' });
  for (const environment of ['qa', 'production']) {
    expect(await runReleaseCli(['verify', '--manifest', 'synthetic.json', '--readiness', 'ready.json', '--environment', environment],
      async path => JSON.stringify(path === 'ready.json' ? ready : manifest))).toEqual({ exitCode: 1, stdout: '', stderr: environment === 'qa' ? 'TRUSTED_AUTHORITY_UNAVAILABLE\n' : 'ENVIRONMENT_MISMATCH\n' });
  }
});
