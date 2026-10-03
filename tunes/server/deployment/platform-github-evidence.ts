import { z } from 'zod';

/** Read-only check qualification. This result never authorizes publishing or deployment. */
export class GitHubEvidenceError extends Error { constructor(public readonly code: string) { super(code); } }
function fail(code: string): never { throw new GitHubEvidenceError(code); }
export const GITHUB_CHECK_POLICY = Object.freeze({ repositoryId: 1171328761, repository: 'tandavkrishna27/explorers.earth', branch: 'codex/unified-replatform', apiOrigin: 'https://api.github.com', workflows: Object.freeze([{ id: 310453885, path: '.github/workflows/ci.yml', job: 'replatform-required' }, { id: 340709050, path: '.github/workflows/test.yml', job: 'music-required' }]) });
const id = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const selector = z.object({ sourceCommit: z.string().regex(/^[a-f0-9]{40}$/), replatformRunId: z.string().regex(/^[1-9][0-9]{0,15}$/), musicRunId: z.string().regex(/^[1-9][0-9]{0,15}$/) }).strict();
const repository = z.object({ id, full_name: z.string() });
const runSchema = z.object({ id, workflow_id: id, path: z.string(), head_sha: z.string(), head_branch: z.string(), event: z.string(), status: z.string(), conclusion: z.string().nullable(), run_attempt: id, repository, head_repository: repository });
const workflowSchema = z.object({ id, path: z.string(), state: z.string() });
const jobSchema = z.object({ id, run_id: id, run_attempt: id, head_sha: z.string(), name: z.string(), status: z.string(), conclusion: z.string().nullable() });
const jobsSchema = z.object({ total_count: z.number().int().min(0).max(1000), jobs: z.array(jobSchema).max(100) });
export interface GitHubCheckEvidence { readonly releaseQualified: false; readonly sourceCommit: string; readonly repositoryId: number; readonly checks: readonly { runId: number; runAttempt: number; workflowId: number; workflowPath: string; jobId: number; jobName: string }[]; }
export interface GitHubEvidenceOptions { token: string; transport?: typeof fetch; }

export async function qualifyGitHubChecks(input: unknown, options: GitHubEvidenceOptions): Promise<GitHubCheckEvidence> {
  const parsed = selector.safeParse(input); if (!parsed.success) fail('SELECTOR_INVALID');
  const selected = parsed.data;
  if (![selected.replatformRunId, selected.musicRunId].every(v => Number.isSafeInteger(Number(v))) || selected.replatformRunId === selected.musicRunId) fail('SELECTOR_INVALID');
  if (!options.token || /[\s\r\n]/.test(options.token)) fail('AUTHENTICATION_UNAVAILABLE');
  const transport = options.transport ?? fetch;
  async function acquire(path: string): Promise<unknown> {
    // Every path is constructed internally from validated numeric selectors and pinned constants.
    const url = new URL('/repos/' + GITHUB_CHECK_POLICY.repository + path, GITHUB_CHECK_POLICY.apiOrigin);
    if (url.origin !== GITHUB_CHECK_POLICY.apiOrigin) fail('API_ORIGIN_INVALID');
    const signal = AbortSignal.timeout(10000); let rejectTimeout: (reason: GitHubEvidenceError) => void = () => {};
    const timeoutPromise = new Promise<never>((_, reject) => { rejectTimeout = reject; });
    const onTimeout = () => rejectTimeout(new GitHubEvidenceError('API_TIMEOUT'));
    signal.addEventListener('abort', onTimeout, { once: true });
    try {
      const response = await Promise.race([transport(url.href, { method: 'GET', redirect: 'error', signal: signal, headers: { Authorization: 'Bearer ' + options.token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } }), timeoutPromise]);
      if (response.redirected || response.url && new URL(response.url).origin !== url.origin) fail('API_REDIRECT_REJECTED');
      if (response.status !== 200) fail('API_REQUEST_FAILED');
      const contentType = response.headers.get('content-type') ?? ''; if (!/^application\/(?:json|[a-z0-9.+-]+\+json)(?:;|$)/i.test(contentType)) fail('API_CONTENT_TYPE_INVALID');
      const length = response.headers.get('content-length'); if (length && (!/^\d+$/.test(length) || Number(length) > 1048576)) fail('API_BODY_LIMIT');
      const reader = response.body?.getReader(); if (!reader) fail('API_BODY_INVALID');
      const chunks: Uint8Array[] = []; let size = 0;
      try { while (true) { const part = await Promise.race([reader.read(), timeoutPromise]); if (part.done) break; size += part.value.byteLength; if (size > 1048576) fail('API_BODY_LIMIT'); chunks.push(part.value); } } finally { // Request cleanup without allowing a non-cooperative stream to block the first failure or deadline.
        try { void reader.cancel().catch(() => {}); } catch { /* Preserve the acquisition outcome even if cancellation throws synchronously. */ }
      }
      const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown; } catch { return fail('API_JSON_INVALID'); }
    } catch (error) { if (error instanceof GitHubEvidenceError) throw error; return fail(signal.aborted ? 'API_TIMEOUT' : 'API_REQUEST_FAILED'); } finally { signal.removeEventListener('abort', onTimeout); }
  }
  function validate<T>(schema: z.ZodType<T>, value: unknown): T { const result = schema.safeParse(value); if (!result.success) fail('API_RESPONSE_INVALID'); return result.data; }
  function matchRepository(value: z.infer<typeof repository>) { if (value.id !== GITHUB_CHECK_POLICY.repositoryId || value.full_name !== GITHUB_CHECK_POLICY.repository) fail('REPOSITORY_IDENTITY_MISMATCH'); }
  matchRepository(validate(repository, await acquire('')));
  const checks: GitHubCheckEvidence['checks'][number][] = [];
  const runIds = [selected.replatformRunId, selected.musicRunId];
  for (let index = 0; index < runIds.length; index++) {
    const runId = runIds[index];
    const policy = GITHUB_CHECK_POLICY.workflows[index];
    const workflow = validate(workflowSchema, await acquire('/actions/workflows/' + policy.id));
    if (workflow.id !== policy.id || workflow.path !== policy.path || workflow.state !== 'active') fail('WORKFLOW_IDENTITY_MISMATCH');
    const run = validate(runSchema, await acquire('/actions/runs/' + runId));
    matchRepository(run.repository); matchRepository(run.head_repository);
    if (run.id !== Number(runId) || run.workflow_id !== policy.id || run.path !== policy.path || run.head_sha !== selected.sourceCommit || run.head_branch !== GITHUB_CHECK_POLICY.branch || !['push','workflow_dispatch'].includes(run.event)) fail('RUN_BINDING_MISMATCH');
    if (run.status !== 'completed' || run.conclusion !== 'success') fail('RUN_NOT_SUCCESSFUL');
    const jobs: z.infer<typeof jobSchema>[] = []; let total: number | undefined;
    for (let page = 1; page <= 10; page++) {
      const result = validate(jobsSchema, await acquire('/actions/runs/' + runId + '/attempts/' + run.run_attempt + '/jobs?per_page=100&page=' + page));
      if (total !== undefined && total !== result.total_count) fail('JOB_PAGINATION_INVALID'); total = result.total_count;
      if (new Set(result.jobs.map(job => job.id)).size !== result.jobs.length || result.jobs.some(job => jobs.some(previous => previous.id === job.id))) fail('JOB_IDENTITY_AMBIGUOUS');
      jobs.push(...result.jobs); if (jobs.length > total || jobs.length < total && result.jobs.length !== 100) fail('JOB_PAGINATION_INVALID');
      if (jobs.length === total) break; if (page === 10) fail('JOB_PAGINATION_INVALID');
    }
    if (jobs.some(job => job.run_id !== run.id || job.run_attempt !== run.run_attempt || job.head_sha !== selected.sourceCommit)) fail('JOB_BINDING_MISMATCH');
    const matches = jobs.filter(job => job.name === policy.job); if (matches.length !== 1) fail('REQUIRED_JOB_AMBIGUOUS');
    const job = matches[0]; if (job.status !== 'completed' || job.conclusion !== 'success') fail('REQUIRED_JOB_NOT_SUCCESSFUL');
    checks.push({ runId: run.id, runAttempt: run.run_attempt, workflowId: policy.id, workflowPath: policy.path, jobId: job.id, jobName: policy.job });
  }
  return Object.freeze({ releaseQualified: false as const, sourceCommit: selected.sourceCommit, repositoryId: GITHUB_CHECK_POLICY.repositoryId, checks: Object.freeze(checks.map(check => Object.freeze(check))) });
}





