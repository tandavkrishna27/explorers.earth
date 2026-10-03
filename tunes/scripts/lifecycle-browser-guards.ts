export const LIFECYCLE_CASES = [
    'active Settings requires trimmed feedback and retries one durable submission',
    'foreign feedback and stale revision cannot delete an active owner',
    'UI deactivation revokes both tabs and the old session',
    'UI deletion is cancelled by a real Google recovery callback',
    'recovery proof expires and cannot grant ordinary authority',
    'concurrent recovery completes exactly once and rejects replay',
    'wrong provider identity cannot recover a retained account',
    'terminal maintenance preserves tombstone and denies recovery',
    'foreign and absent origins cannot mutate lifecycle state',
    'delayed old lifecycle response cannot navigate a new owner',
] as const;
export function parseBrowserSuite(args: string[]): 'profile' | 'auth' | 'lifecycle' {
    const ack = 'TASK4_FIXTURE_OWNED_DISPOSABLE_PG15';
    if (JSON.stringify(args) === JSON.stringify(['--ack', ack]))
        return 'profile';
    for (const suite of ['auth', 'lifecycle'] as const)
        if (JSON.stringify(args) === JSON.stringify(['--suite', suite, '--ack', ack]))
            return suite;
    throw new Error('Browser E2E requires exact disposable PostgreSQL acknowledgement');
}
export function assertBrowserEnvironment(env: NodeJS.ProcessEnv) {
    if (env.NODE_ENV === 'production' || Object.keys(env).some(key => key.startsWith('MUSIC_C10_STANDALONE_POSTGRES_')) || ['DATABASE_URL', 'DATABASE_URL_TEST', 'DOCKER_HOST', 'DOCKER_CONTEXT', 'GATE_PROD', 'MUSIC_DEPLOY_PRODUCTION', 'MUSIC_DEPLOY_PROD'].some(key => Boolean(env[key])))
        throw new Error('Ambient database, Docker or production authority is forbidden');
}
export function validateLifecycleControl(input: {
    remote: string;
    host: string;
    expectedHost: string;
    capability: string;
    expectedCapability: string;
    caseId: string;
    action: string;
}) {
    if (input.remote !== '127.0.0.1' || input.host !== input.expectedHost || !/^[a-f0-9]{64}$/.test(input.capability) || input.capability !== input.expectedCapability || !(LIFECYCLE_CASES as readonly string[]).includes(input.caseId) || !['prepare', 'observe', 'provider', 'expire', 'bump', 'terminal'].includes(input.action))
        throw new Error('Lifecycle control authority mismatch');
}
export function assertLifecycleResults(discovered: string[], results: {
    title: string;
    status: string;
    retry: number;
}[]) {
    if (JSON.stringify(discovered) !== JSON.stringify(LIFECYCLE_CASES) || JSON.stringify(results.map(r => r.title)) !== JSON.stringify(LIFECYCLE_CASES) || results.some(r => r.status !== 'passed' || r.retry !== 0))
        throw new Error('Lifecycle exact discovery or execution failed');
}
export function assertProviderCode(code: string | undefined, expected: string | undefined) { if (!expected || code !== expected)
    throw new Error('Provider scenario mismatch'); }
export function assertOwnedCleanup(failures: string[]) { if (failures.length)
    throw new Error('Owned cleanup failed: ' + failures.join(', ')); }
export const LIFECYCLE_FONT_QUERIES = [
    'family=DM+Sans:wght@400;500;600;700;800;900&family=Fraunces:opsz,wght@9..144,600;9..144,700;9..144,800&family=Inter:wght@400;500;600;700&family=Poppins:wght@300;400;500;600;700&display=swap',
    'family=Lato:ital,wght@0,100;0,300;0,400;0,700;0,900;1,100;1,300;1,400;1,700;1,900&family=Montserrat:ital,wght@0,100..900;1,100..900&family=Poppins:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,100;1,200;1,300;1,400;1,500;1,600;1,700;1,800;1,900&family=Space+Grotesk:wght@300..700&display=swap',
].map(query => new URLSearchParams(query).toString());
export function classifyLifecycleRequest(input: {
    url: string;
    origin: string;
    resource: string;
    navigation: boolean;
}): 'local' | 'google' | 'font' | 'image' | 'deny' {
    const u = new URL(input.url);
    if (u.origin === input.origin)
        return u.pathname.startsWith('/api/') && !u.pathname.startsWith('/api/explorers/v1/') && !u.pathname.startsWith('/api/auth/') ? 'deny' : 'local';
    if (u.origin === 'https://accounts.google.com' && u.pathname === '/o/oauth2/v2/auth' && input.navigation && u.searchParams.get('redirect_uri') === input.origin + '/api/auth/callback/google' && u.searchParams.get('state'))
        return 'google';
    if (u.origin === 'https://fonts.googleapis.com' && u.pathname === '/css2' && input.resource === 'stylesheet' && LIFECYCLE_FONT_QUERIES.includes(u.searchParams.toString()))
        return 'font';
    if (u.origin === 'https://zupimages.net' && ['/up/19/34/4820.gif', '/up/19/34/6vlb.gif'].includes(u.pathname) && !u.search && input.resource === 'image')
        return 'image';
    return 'deny';
}
