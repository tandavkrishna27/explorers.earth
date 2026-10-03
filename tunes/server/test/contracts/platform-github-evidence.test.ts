import { describe, it, expect, vi } from 'vitest';
import { qualifyGitHubChecks, GitHubEvidenceError } from '../../deployment/platform-github-evidence';
const sha = 'a'.repeat(40);
function fixture(change?: (url: URL, value: any) => any) {
  const calls: any[] = [];
  const transport: typeof fetch = async (input: any, init: any) => {
    const url = new URL(String(input)); calls.push({ url, init });
    let value: any;
    if (url.pathname.endsWith('/actions/workflows/310453885')) value = { id: 310453885, path: '.github/workflows/ci.yml', state: 'active' };
    else if (url.pathname.endsWith('/actions/workflows/340709050')) value = { id: 340709050, path: '.github/workflows/test.yml', state: 'active' };
    else if (/\/attempts\/2\/jobs$/.test(url.pathname)) value = { total_count: 1, jobs: [{ id: url.pathname.includes('/101/') ? 501 : 502, run_id: url.pathname.includes('/101/') ? 101 : 102, run_attempt: 2, head_sha: sha, name: url.pathname.includes('/101/') ? 'replatform-required' : 'music-required', status: 'completed', conclusion: 'success' }] };
    else if (/\/runs\/(101|102)$/.test(url.pathname)) { const id = url.pathname.endsWith('/101') ? 101 : 102; value = { id, workflow_id: id === 101 ? 310453885 : 340709050, path: id === 101 ? '.github/workflows/ci.yml' : '.github/workflows/test.yml', head_sha: sha, head_branch: 'codex/unified-replatform', event: 'push', status: 'completed', conclusion: 'success', run_attempt: 2, repository: { id: 1171328761, full_name: 'tandavkrishna27/explorers.earth' }, head_repository: { id: 1171328761, full_name: 'tandavkrishna27/explorers.earth' } }; }
    else value = { id: 1171328761, full_name: 'tandavkrishna27/explorers.earth' };
    return new Response(JSON.stringify(change ? change(url, value) : value), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return { calls, transport };
}
const input = { sourceCommit: sha, replatformRunId: '101', musicRunId: '102' };
describe('trusted GitHub check acquisition', () => {
  it('acquires repository/workflow/run/attempt jobs and binds exact successful identities', async () => {
    const f = fixture(); const proof = await qualifyGitHubChecks(input, { token: 'test-token', transport: f.transport });
    expect(proof.sourceCommit).toBe(sha); expect(proof.releaseQualified).toBe(false); expect(proof.checks.map(x => x.jobId)).toEqual([501,502]);
    expect(f.calls).toHaveLength(7); expect(f.calls.every(x => x.url.origin === 'https://api.github.com' && x.init.redirect === 'error')).toBe(true);
  });
  it.each(['pending','in_progress','queued'])('rejects %s run', async status => { const f = fixture((u,v) => u.pathname.endsWith('/runs/101') ? { ...v, status } : v); await expect(qualifyGitHubChecks(input,{token:'x',transport:f.transport})).rejects.toMatchObject({code:'RUN_NOT_SUCCESSFUL'}); });
  it.each(['failure','skipped','cancelled','neutral','timed_out',null])('rejects %s aggregate', async conclusion => { const f = fixture((u,v) => u.pathname.endsWith('/jobs') ? {...v,jobs:v.jobs.map((j:any)=>({...j,conclusion}))}:v); await expect(qualifyGitHubChecks(input,{token:'x',transport:f.transport})).rejects.toMatchObject({code:'REQUIRED_JOB_NOT_SUCCESSFUL'}); });
  it.each(['repository','head_repository'])('rejects wrong %s identity', async key => { const f = fixture((u,v)=>u.pathname.endsWith('/runs/101')?{...v,[key]:{id:1,full_name:'attacker/fork'}}:v); await expect(qualifyGitHubChecks(input,{token:'x',transport:f.transport})).rejects.toMatchObject({code:'REPOSITORY_IDENTITY_MISMATCH'}); });
  it.each([{head_sha:'b'.repeat(40)},{head_branch:'main'},{event:'pull_request'},{workflow_id:1},{path:'.github/workflows/other.yml'}])('rejects run binding %j',async delta=>{const f=fixture((u,v)=>u.pathname.endsWith('/runs/101')?{...v,...delta}:v);await expect(qualifyGitHubChecks(input,{token:'x',transport:f.transport})).rejects.toBeInstanceOf(GitHubEvidenceError);});
  it('rejects successful aggregate from another attempt',async()=>{const f=fixture((u,v)=>u.pathname.endsWith('/jobs')?{...v,jobs:v.jobs.map((j:any)=>({...j,run_attempt:1}))}:v);await expect(qualifyGitHubChecks(input,{token:'x',transport:f.transport})).rejects.toMatchObject({code:'JOB_BINDING_MISMATCH'});});
  it('rejects duplicate aggregate identities',async()=>{const f=fixture((u,v)=>u.pathname.endsWith('/jobs')?{total_count:2,jobs:[...v.jobs,{...v.jobs[0],id:999}]}:v);await expect(qualifyGitHubChecks(input,{token:'x',transport:f.transport})).rejects.toMatchObject({code:'REQUIRED_JOB_AMBIGUOUS'});});
  it('rejects missing pages instead of inferring completeness',async()=>{const f=fixture((u,v)=>u.pathname.endsWith('/jobs')?{total_count:101,jobs:v.jobs}:v);await expect(qualifyGitHubChecks(input,{token:'x',transport:f.transport})).rejects.toMatchObject({code:'JOB_PAGINATION_INVALID'});});
  it('rejects caller proof and unknown selector fields without requests',async()=>{const f=fixture();await expect(qualifyGitHubChecks({...input,proof:{success:true}} as any,{token:'x',transport:f.transport})).rejects.toMatchObject({code:'SELECTOR_INVALID'});expect(f.calls).toHaveLength(0);});
  it('fails closed without token',async()=>{await expect(qualifyGitHubChecks(input,{token:''})).rejects.toMatchObject({code:'AUTHENTICATION_UNAVAILABLE'});});
});

describe('bounded GitHub transport', () => {
  it.each([401,403,404,429,500,302])('fails closed on HTTP %s', async status => { await expect(qualifyGitHubChecks(input,{token:'x',transport:async()=>new Response('{}',{status,headers:{'content-type':'application/json'}})})).rejects.toMatchObject({code:'API_REQUEST_FAILED'}); });
  it('rejects oversized declared body',async()=>{await expect(qualifyGitHubChecks(input,{token:'x',transport:async()=>new Response('{}',{headers:{'content-type':'application/json','content-length':'1048577'}})})).rejects.toMatchObject({code:'API_BODY_LIMIT'});});
  it('rejects oversized streamed body even absent length',async()=>{await expect(qualifyGitHubChecks(input,{token:'x',transport:async()=>new Response(' '.repeat(1048577),{headers:{'content-type':'application/json'}})})).rejects.toMatchObject({code:'API_BODY_LIMIT'});});
  it.each(['text/html','application/octet-stream'])('rejects %s response',async type=>{await expect(qualifyGitHubChecks(input,{token:'x',transport:async()=>new Response('{}',{headers:{'content-type':type}})})).rejects.toMatchObject({code:'API_CONTENT_TYPE_INVALID'});});
  it('rejects malformed JSON without exposing returned contents',async()=>{await expect(qualifyGitHubChecks(input,{token:'x',transport:async()=>new Response('secret-not-json',{headers:{'content-type':'application/json'}})})).rejects.toMatchObject({code:'API_JSON_INVALID',message:'API_JSON_INVALID'});});
  it('rejects a followed foreign redirect from even a broken transport',async()=>{const response=new Response('{}',{headers:{'content-type':'application/json'}});Object.defineProperty(response,'url',{value:'https://attacker.invalid/data'});await expect(qualifyGitHubChecks(input,{token:'x',transport:async()=>response})).rejects.toMatchObject({code:'API_REDIRECT_REJECTED'});});
  it('sanitizes transport errors',async()=>{await expect(qualifyGitHubChecks(input,{token:'x',transport:async()=>{throw new Error('token secret');}})).rejects.toMatchObject({code:'API_REQUEST_FAILED',message:'API_REQUEST_FAILED'});});
  it('rejects missing required aggregate',async()=>{const f=fixture((u,v)=>u.pathname.endsWith('/jobs')?{total_count:0,jobs:[]}:v);await expect(qualifyGitHubChecks(input,{token:'x',transport:f.transport})).rejects.toMatchObject({code:'REQUIRED_JOB_AMBIGUOUS'});});
  it('rejects duplicate job IDs on the same page',async()=>{const f=fixture((u,v)=>u.pathname.endsWith('/jobs')?{total_count:2,jobs:[...v.jobs,...v.jobs]}:v);await expect(qualifyGitHubChecks(input,{token:'x',transport:f.transport})).rejects.toMatchObject({code:'JOB_IDENTITY_AMBIGUOUS'});});
});

describe('deadline and complete pagination', () => {
  it('bounds a transport that never resolves',async()=>{vi.useFakeTimers();const spy=vi.spyOn(AbortSignal,'timeout').mockImplementation(ms=>{const c=new AbortController();setTimeout(()=>c.abort(),ms);return c.signal;});try{const pending=qualifyGitHubChecks(input,{token:'x',transport:()=>new Promise(()=>{})});const assertion=expect(pending).rejects.toMatchObject({code:'API_TIMEOUT'});await vi.advanceTimersByTimeAsync(10000);await assertion;}finally{spy.mockRestore();vi.useRealTimers();}});
  it('binds all pages and finds aggregate on last page',async()=>{const f=fixture((u,v)=>{if(!u.pathname.endsWith('/jobs'))return v;return {total_count:101,jobs:u.searchParams.get('page')==='1'?Array.from({length:100},(_,i)=>({...v.jobs[0],id:10000+i,name:'ordinary-'+i})):[v.jobs[0]]};});const proof=await qualifyGitHubChecks(input,{token:'x',transport:f.transport});expect(proof.checks).toHaveLength(2);expect(f.calls.filter(c=>c.url.pathname.endsWith('/jobs'))).toHaveLength(4);});
  it('rejects changing page totals',async()=>{const f=fixture((u,v)=>{if(!u.pathname.endsWith('/jobs'))return v;return u.searchParams.get('page')==='1'?{total_count:101,jobs:Array.from({length:100},(_,i)=>({...v.jobs[0],id:10000+i,name:'ordinary-'+i}))}:{total_count:102,jobs:v.jobs};});await expect(qualifyGitHubChecks(input,{token:'x',transport:f.transport})).rejects.toMatchObject({code:'JOB_PAGINATION_INVALID'});});
});


describe('deadline includes non-cooperative stream cleanup', () => {
  it.each(['oversized','stalled'])('settles %s body even when cancellation never settles', async mode => {
    vi.useFakeTimers(); const controller = new AbortController();
    const spy = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    let result: string | undefined; let cancelCalls = 0;
    const stream = new ReadableStream<Uint8Array>({ start(c) { if (mode === 'oversized') c.enqueue(new Uint8Array(1048577)); }, cancel() { cancelCalls++; return new Promise<void>(() => {}); } });
    try {
      const pending = qualifyGitHubChecks(input, { token: 'x', transport: async () => new Response(stream, { headers: { 'content-type': 'application/json' } }) }).then(() => { result = 'unexpected-success'; }, error => { result = error.code; });
      await vi.advanceTimersByTimeAsync(0); controller.abort(); await vi.advanceTimersByTimeAsync(10500);
      expect(result).toBe(mode === 'oversized' ? 'API_BODY_LIMIT' : 'API_TIMEOUT'); expect(cancelCalls).toBe(1); await pending;
    } finally { spy.mockRestore(); vi.useRealTimers(); }
  });
  it('absorbs later cleanup rejection and preserves first body-limit error', async () => {
    let rejectCancel!: (error: Error) => void;
    const stream = new ReadableStream<Uint8Array>({start(c){c.enqueue(new Uint8Array(1048577));},cancel(){return new Promise<void>((_,reject)=>{rejectCancel=reject;});}});
    let settled: string | undefined;
    const pending=qualifyGitHubChecks(input,{token:'x',transport:async()=>new Response(stream,{headers:{'content-type':'application/json'}})}).then(()=>{settled='success';},error=>{settled=error.code;});
    await new Promise(resolve=>setTimeout(resolve,10)); expect(settled).toBe('API_BODY_LIMIT');
    rejectCancel(new Error('private cleanup message')); await pending; await new Promise(resolve=>setTimeout(resolve,0));
  });
});
