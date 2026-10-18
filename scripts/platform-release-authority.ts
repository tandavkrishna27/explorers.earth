// A bounded observation of caller-supplied transport/context, never release authority.
export type CandidateCiInput = Readonly<{ validated_run_id: string; music_validated_run_id: string }>;
export type CandidateCiContext = Readonly<{
  repository: 'tandavkrishna27/explorers.earth'; ref: 'refs/heads/codex/unified-replatform';
  eventName: 'workflow_dispatch'; checkoutSha: string; candidateHeadSha: string;
}>;
export type CandidateCiDependencies = Readonly<{ token: string; transport: typeof fetch }>;
export type CandidateCiJobObservation = Readonly<{ key: string; name: string; jobId: number; conclusion: 'success' | 'skipped' }>;
export type CandidateCiRunObservation = Readonly<{
  runId: string; runAttempt: number; workflowId: number;
  workflowPath: '.github/workflows/ci.yml' | '.github/workflows/test.yml'; jobs: readonly CandidateCiJobObservation[];
}>;
export type CandidateCiObservation = Readonly<{
  status: 'CI_PREFLIGHT_OBSERVED_UNQUALIFIED'; releaseQualified: false; policyVersion: 'candidate-ci-v1';
  repository: 'tandavkrishna27/explorers.earth'; repositoryId: 1171328761; sourceCommit: string;
  runs: readonly [CandidateCiRunObservation, CandidateCiRunObservation];
}>;
export type CandidateCiErrorCode =
  | 'SELECTOR_INVALID' | 'CONTEXT_INVALID' | 'DEPENDENCIES_INVALID' | 'AUTHENTICATION_UNAVAILABLE'
  | 'API_TIMEOUT' | 'API_REQUEST_FAILED' | 'API_REDIRECT_REJECTED' | 'API_CONTENT_TYPE_INVALID'
  | 'API_BODY_LIMIT' | 'API_BODY_INVALID' | 'API_JSON_INVALID' | 'API_RESPONSE_INVALID'
  | 'REPOSITORY_IDENTITY_MISMATCH' | 'WORKFLOW_IDENTITY_MISMATCH' | 'RUN_BINDING_MISMATCH'
  | 'RUN_NOT_SUCCESSFUL' | 'JOB_PAGINATION_INVALID' | 'JOB_IDENTITY_AMBIGUOUS' | 'JOB_BINDING_MISMATCH'
  | 'REQUIRED_JOB_AMBIGUOUS' | 'REQUIRED_JOB_NOT_SUCCESSFUL' | 'RUN_CHANGED';
export class CandidateCiError extends Error {
  readonly code: CandidateCiErrorCode;
  constructor(code: CandidateCiErrorCode) { super(code); this.name = 'CandidateCiError'; this.code = code; }
}
function fail(code: CandidateCiErrorCode): never { throw new CandidateCiError(code); }
function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
export const CANDIDATE_CI_POLICY = freeze({
  version: 'candidate-ci-v1', repository: 'tandavkrishna27/explorers.earth', repositoryId: 1171328761,
  branch: 'codex/unified-replatform', ref: 'refs/heads/codex/unified-replatform', apiOrigin: 'https://api.github.com',
  apiVersion: '2022-11-28', requestTimeoutMs: 10000, maxResponseBytes: 1048576, perPage: 100, maxPages: 10, maxJobs: 1000,
  workflows: [
    { id: 310453885, path: '.github/workflows/ci.yml', selector: 'validated_run_id', jobs: [
      { key: 'lint', name: '🔍 Lint', allowSkipped: false },
      { key: 'typecheck', name: '🔷 TypeScript', allowSkipped: false },
      { key: 'unit-tests', name: '🧪 Unit Tests', allowSkipped: false },
      { key: 'build', name: '🏗️ Build', allowSkipped: false },
      { key: 'integration-tests', name: '🔗 Integration Tests', allowSkipped: false },
      { key: 'e2e-category-a', name: '🎭 E2E Category A', allowSkipped: false },
      { key: 'e2e-category-b', name: '🎭 E2E Category B', allowSkipped: false },
      { key: 'e2e-public-shell', name: '🎭 E2E Public shell', allowSkipped: false },
      { key: 'e2e-music-account', name: '🎭 E2E Music and account', allowSkipped: false },
      { key: 'replatform-required', name: 'replatform-required', allowSkipped: false },
    ] },
    { id: 340709050, path: '.github/workflows/test.yml', selector: 'music_validated_run_id', jobs: [
      { key: 'docs-contracts', name: 'docs-contracts', allowSkipped: false },
      { key: 'static', name: 'static', allowSkipped: false },
      { key: 'unit-coverage', name: 'unit-coverage', allowSkipped: false },
      { key: 'contracts', name: 'contracts', allowSkipped: false },
      { key: 'database', name: 'database', allowSkipped: false },
      { key: 'security', name: 'security', allowSkipped: false },
      { key: 'frontend', name: 'frontend', allowSkipped: false },
      { key: 'browser', name: 'browser', allowSkipped: false },
      { key: 'load-chaos', name: 'load-chaos', allowSkipped: true },
      { key: 'image-deploy-contract', name: 'image-deploy-contract', allowSkipped: false },
      { key: 'platform-fixture', name: 'platform-fixture', allowSkipped: false },
      { key: 'music-required', name: 'music-required', allowSkipped: false },
    ] },
  ],
} as const);
type Data = Record<string, unknown>;
function ownData(value: unknown, keys: readonly string[], code: CandidateCiErrorCode): Data {
  try {
    if (value === null || typeof value !== 'object') fail(code);
    const proto = Object.getPrototypeOf(value);
    if (proto !== null && proto !== Object.prototype) fail(code);
    const names = Reflect.ownKeys(value);
    if (names.length !== keys.length || names.some(key => typeof key !== 'string' || !keys.includes(key))) fail(code);
    const copy: Data = {};
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) fail(code);
      copy[key] = descriptor.value;
    }
    return copy;
  } catch { return fail(code); }
}
const isId = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const isLocator = (value: unknown): value is string => typeof value === 'string' && /^[1-9][0-9]{0,15}$/.test(value) && Number.isSafeInteger(Number(value));
function object(value: unknown): Data {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail('API_RESPONSE_INVALID');
  return value as Data;
}
function field(row: Data, key: string, check: (value: unknown) => boolean): unknown {
  if (!Object.hasOwn(row, key) || !check(row[key])) fail('API_RESPONSE_INVALID');
  return row[key];
}
const string = (value: unknown): value is string => typeof value === 'string';
const conclusion = (value: unknown) => value === null || string(value);
type Repository = { id: number; full_name: string };
function repository(value: unknown): Repository {
  const row = object(value);
  return { id: field(row, 'id', isId) as number, full_name: field(row, 'full_name', string) as string };
}
function identity(repo: Repository): void {
  if (repo.id !== CANDIDATE_CI_POLICY.repositoryId || repo.full_name !== CANDIDATE_CI_POLICY.repository) fail('REPOSITORY_IDENTITY_MISMATCH');
}
type Run = {
  id: number; workflow_id: number; path: string; head_sha: string; head_branch: string; event: string;
  status: string; conclusion: string | null; run_attempt: number; repository: Repository; head_repository: Repository;
};
function run(value: unknown): Run {
  const row = object(value);
  return {
    id: field(row, 'id', isId) as number, workflow_id: field(row, 'workflow_id', isId) as number,
    path: field(row, 'path', string) as string, head_sha: field(row, 'head_sha', string) as string,
    head_branch: field(row, 'head_branch', string) as string, event: field(row, 'event', string) as string,
    status: field(row, 'status', string) as string, conclusion: field(row, 'conclusion', conclusion) as string | null,
    run_attempt: field(row, 'run_attempt', isId) as number,
    repository: repository(field(row, 'repository', () => true)), head_repository: repository(field(row, 'head_repository', () => true)),
  };
}
type Job = { id: number; name: string; status: string; conclusion: string | null; run_id?: number; head_sha?: string; run_attempt?: number };
function job(value: unknown): Job {
  const row = object(value);
  const result: Job = { id: field(row, 'id', isId) as number, name: field(row, 'name', string) as string,
    status: field(row, 'status', string) as string, conclusion: field(row, 'conclusion', conclusion) as string | null };
  if (Object.hasOwn(row, 'run_id')) result.run_id = field(row, 'run_id', isId) as number;
  if (Object.hasOwn(row, 'head_sha')) result.head_sha = field(row, 'head_sha', string) as string;
  if (Object.hasOwn(row, 'run_attempt')) result.run_attempt = field(row, 'run_attempt', isId) as number;
  return result;
}
async function acquire(url: string, token: string, transport: typeof fetch): Promise<unknown> {
  const failures = new Set<CandidateCiError>();
  const requestFailure = (code: CandidateCiErrorCode): CandidateCiError => {
    const error = new CandidateCiError(code); failures.add(error); return error;
  };
  const reject = (code: CandidateCiErrorCode): never => { throw requestFailure(code); };
  let signal: AbortSignal | undefined;
  let listener: (() => void) | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    signal = AbortSignal.timeout(CANDIDATE_CI_POLICY.requestTimeoutMs);
    const deadline = new Promise<never>((_resolve, reject) => {
      listener = () => reject(requestFailure('API_TIMEOUT'));
      signal!.addEventListener('abort', listener, { once: true });
      if (signal!.aborted) listener();
    });
    // Observe rejection even when a synchronous Response/transport exception wins first.
    void deadline.catch(() => undefined);
    const response = await Promise.race([transport(url, { method: 'GET', redirect: 'error', signal,
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': CANDIDATE_CI_POLICY.apiVersion } }), deadline]);
    if (response.status !== 200) reject('API_REQUEST_FAILED');
    if (response.redirected) reject('API_REDIRECT_REJECTED');
    const responseUrl = response.url;
    if (responseUrl !== '') {
      let normalized: string;
      try { normalized = new URL(responseUrl).href; } catch { return reject('API_REDIRECT_REJECTED'); }
      if (normalized !== new URL(url).href) reject('API_REDIRECT_REJECTED');
    }
    if (!/^application\/(?:json|[a-z0-9.+-]+\+json)(?:;|$)/i.test(response.headers.get('content-type') ?? '')) reject('API_CONTENT_TYPE_INVALID');
    const declared = response.headers.get('content-length');
    if (declared !== null && (!/^[0-9]+$/.test(declared) || Number(declared) > CANDIDATE_CI_POLICY.maxResponseBytes)) reject('API_BODY_LIMIT');
    const body = response.body;
    if (!body) return reject('API_BODY_INVALID');
    reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const part = await Promise.race([reader.read(), deadline]);
      if (part.done) break;
      if (!(part.value instanceof Uint8Array)) reject('API_BODY_INVALID');
      size += part.value.byteLength;
      if (size > CANDIDATE_CI_POLICY.maxResponseBytes) reject('API_BODY_LIMIT');
      chunks.push(new Uint8Array(part.value));
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown; }
    catch { return reject('API_JSON_INVALID'); }
  } catch (error) {
    // Only locally created failures are preserved; transport failures never carry private details.
    if (error instanceof CandidateCiError && failures.has(error)) throw error;
    return reject(signal?.aborted ? 'API_TIMEOUT' : 'API_REQUEST_FAILED');
  } finally {
    if (signal && listener) signal.removeEventListener('abort', listener);
    if (reader) {
      try { void Promise.resolve(reader.cancel()).catch(() => undefined); } catch { /* Cleanup cannot override the first failure. */ }
    }
  }
}
export async function observeCandidateCi(input: unknown, context: unknown, dependencies: CandidateCiDependencies): Promise<CandidateCiObservation> {
  const selected = ownData(input, ['validated_run_id', 'music_validated_run_id'], 'SELECTOR_INVALID');
  if (!isLocator(selected.validated_run_id) || !isLocator(selected.music_validated_run_id) || selected.validated_run_id === selected.music_validated_run_id) fail('SELECTOR_INVALID');
  const ctx = ownData(context, ['repository', 'ref', 'eventName', 'checkoutSha', 'candidateHeadSha'], 'CONTEXT_INVALID');
  if (ctx.repository !== CANDIDATE_CI_POLICY.repository || ctx.ref !== CANDIDATE_CI_POLICY.ref || ctx.eventName !== 'workflow_dispatch' ||
    typeof ctx.checkoutSha !== 'string' || !/^[a-f0-9]{40}$/.test(ctx.checkoutSha) || typeof ctx.candidateHeadSha !== 'string' ||
    !/^[a-f0-9]{40}$/.test(ctx.candidateHeadSha) || ctx.checkoutSha !== ctx.candidateHeadSha) fail('CONTEXT_INVALID');
  const deps = ownData(dependencies, ['token', 'transport'], 'DEPENDENCIES_INVALID');
  // Validate every dependency type before authentication, including blank-token/invalid-transport combinations.
  if (typeof deps.token !== 'string' || typeof deps.transport !== 'function') fail('DEPENDENCIES_INVALID');
  if (!deps.token || /\s/.test(deps.token)) fail('AUTHENTICATION_UNAVAILABLE');
  const token = deps.token, transport = deps.transport as typeof fetch, sourceCommit = ctx.checkoutSha;
  const locators = [selected.validated_run_id, selected.music_validated_run_id] as const;
  const base = CANDIDATE_CI_POLICY.apiOrigin + '/repos/' + CANDIDATE_CI_POLICY.repository;
  const get = (suffix: string) => acquire(base + suffix, token, transport);
  identity(repository(await get('')));
  const observations: CandidateCiRunObservation[] = [];
  for (const [index, policy] of CANDIDATE_CI_POLICY.workflows.entries()) {
    const workflow = object(await get('/actions/workflows/' + policy.id));
    const workflowId = field(workflow, 'id', isId), path = field(workflow, 'path', string), state = field(workflow, 'state', string);
    if (workflowId !== policy.id || path !== policy.path || state !== 'active') fail('WORKFLOW_IDENTITY_MISMATCH');
    const runId = locators[index];
    const runPath = '/actions/runs/' + runId;
    const before = run(await get(runPath));
    identity(before.repository); identity(before.head_repository);
    if (before.id !== Number(runId) || before.workflow_id !== policy.id || before.path !== policy.path || before.head_sha !== sourceCommit ||
      before.head_branch !== CANDIDATE_CI_POLICY.branch || before.event !== 'push') fail('RUN_BINDING_MISMATCH');
    if (before.status !== 'completed' || before.conclusion !== 'success') fail('RUN_NOT_SUCCESSFUL');
    const rows: Job[] = [], ids = new Set<number>();
    let total: number | undefined;
    for (let page = 1; page <= CANDIDATE_CI_POLICY.maxPages; page++) {
      const payload = object(await get(runPath + '/attempts/' + before.run_attempt + '/jobs?per_page=100&page=' + page));
      const count = field(payload, 'total_count', value => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= CANDIDATE_CI_POLICY.maxJobs) as number;
      const values = field(payload, 'jobs', value => Array.isArray(value) && value.length <= CANDIDATE_CI_POLICY.perPage) as unknown[];
      const jobs = values.map(job); // Complete schema validation precedes semantic page checks.
      if (total === undefined) total = count;
      else if (total !== count) fail('JOB_PAGINATION_INVALID');
      for (const row of jobs) {
        if (ids.has(row.id)) fail('JOB_IDENTITY_AMBIGUOUS');
        ids.add(row.id);
      }
      rows.push(...jobs);
      if (rows.length > total) fail('JOB_PAGINATION_INVALID');
      for (const row of jobs) {
        if ((row.run_id !== undefined && row.run_id !== before.id) || (row.head_sha !== undefined && row.head_sha !== sourceCommit) ||
          (row.run_attempt !== undefined && row.run_attempt !== before.run_attempt)) fail('JOB_BINDING_MISMATCH');
      }
      if (rows.length === total) break;
      if (jobs.length !== CANDIDATE_CI_POLICY.perPage || page === CANDIDATE_CI_POLICY.maxPages) fail('JOB_PAGINATION_INVALID');
    }
    const jobs: CandidateCiJobObservation[] = policy.jobs.map(required => {
      const matches = rows.filter(row => row.name === required.name);
      if (matches.length !== 1) fail('REQUIRED_JOB_AMBIGUOUS');
      const row = matches[0];
      if (row.status !== 'completed' || (row.conclusion !== 'success' && !(required.allowSkipped && row.conclusion === 'skipped'))) fail('REQUIRED_JOB_NOT_SUCCESSFUL');
      return { key: required.key, name: required.name, jobId: row.id, conclusion: row.conclusion as 'success' | 'skipped' };
    });
    const after = run(await get(runPath));
    if (JSON.stringify(after) !== JSON.stringify(before)) fail('RUN_CHANGED');
    observations.push({ runId, runAttempt: before.run_attempt, workflowId: policy.id, workflowPath: policy.path, jobs });
  }
  return freeze({ status: 'CI_PREFLIGHT_OBSERVED_UNQUALIFIED', releaseQualified: false, policyVersion: CANDIDATE_CI_POLICY.version,
    repository: CANDIDATE_CI_POLICY.repository, repositoryId: CANDIDATE_CI_POLICY.repositoryId, sourceCommit,
    runs: [observations[0], observations[1]] });
}
