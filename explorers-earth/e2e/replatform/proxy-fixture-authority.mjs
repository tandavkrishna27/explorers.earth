export function assertFixtureOrigin(fixture, env = process.env) {
  if (fixture.origin !== env.PLAYWRIGHT_EXTERNAL_BASE_URL) throw new Error('FIXTURE_ORIGIN_MISMATCH');
  if (/^http:\/\/127\.0\.0\.1:\d+$/.test(fixture.origin)) return;
  const p = fixture.proxyAuthority;
  const keys = ['kind','runId','project','sourceCommit','webImage','capability','origin','callback','database','runtimeRole','observerOwned','protectedArtifacts'];
  let envelope; try { envelope = JSON.parse(env.PLATFORM_PROXY_AUTHORITY); } catch { throw new Error('PROXY_AUTHORITY_REQUIRED'); }
  if (!p || Object.keys(p).sort().join() !== keys.sort().join() || JSON.stringify(p) !== JSON.stringify(envelope)
    || p.kind !== 'owned-synthetic-proxy/v1' || !/^[a-f0-9]{32}$/.test(p.runId)
    || p.project !== 'platform-browser-'+p.runId || !/^[a-f0-9]{40}$/.test(p.sourceCommit)
    || !/^sha256:[a-f0-9]{64}$/.test(p.webImage) || !/^[a-f0-9]{64}$/.test(p.capability)
    || p.origin !== 'https://qa.platform.invalid' || fixture.origin !== p.origin
    || p.callback !== p.origin+'/api/auth/callback/google' || p.database !== 'platform_qa'
    || p.runtimeRole !== 'platform_browser_login' || p.observerOwned !== true || p.protectedArtifacts !== true)
    throw new Error('PROXY_AUTHORITY_INVALID');
  if (!fixture.personas || !Object.keys(fixture.personas).length || Object.values(fixture.personas).some(persona =>
    !persona.userId || !persona.handle || !/^__Secure-better-auth\.session_token=.+\..+$/.test(persona.cookie)))
    throw new Error('PROXY_SESSION_INVALID');
}
export function isOptionalFontRequest(value,type){
 const url=new URL(value);
 return url.protocol==='https:'&&((url.hostname==='fonts.googleapis.com'&&url.pathname==='/css2'&&type==='stylesheet')||(url.hostname==='fonts.gstatic.com'&&url.pathname.startsWith('/s/')&&type==='font'));
}
export function isOptionalLoaderImage(value,type){
 return type==='image'&&['https://zupimages.net/up/19/34/4820.gif','https://zupimages.net/up/19/34/6vlb.gif'].includes(value);
}
export function publicReadBudgetDelayMs(header){
 const match=typeof header==='string'&&/^limit=120, remaining=(\d+), reset=(\d+)$/.exec(header);
 if(!match||Number(match[1])>120||Number(match[2])>60)throw new Error('PUBLIC_READ_BUDGET_INVALID');
 return Number(match[1])>=90?0:Number(match[2])*1000+250;
}
