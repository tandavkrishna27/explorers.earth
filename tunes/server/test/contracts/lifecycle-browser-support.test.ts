import { describe, it, expect } from 'vitest';
import { parseBrowserSuite, assertBrowserEnvironment, validateLifecycleControl, assertLifecycleResults, assertProviderCode, assertOwnedCleanup, classifyLifecycleRequest, LIFECYCLE_CASES, LIFECYCLE_FONT_QUERIES } from '../../../scripts/lifecycle-browser-guards';
const ack = 'TASK4_FIXTURE_OWNED_DISPOSABLE_PG15';
describe('owned lifecycle browser boundary', () => {
    it('accepts only exact existing and lifecycle selectors', () => {
        expect(parseBrowserSuite(['--ack', ack])).toBe('profile');
        for (const suite of ['auth', 'lifecycle'])
            expect(parseBrowserSuite(['--suite', suite, '--ack', ack])).toBe(suite);
        for (const args of [[], ['--suite', 'music', '--ack', ack], ['--suite', 'lifecycle', '--ack', 'wrong'], ['--ack', ack, '--ack', ack], ['--suite', 'lifecycle', '--ack', ack, '--list']])
            expect(() => parseBrowserSuite(args)).toThrow();
    });
    it('rejects ambient and production authority', () => {
        for (const key of ['DATABASE_URL', 'DATABASE_URL_TEST', 'DOCKER_HOST', 'DOCKER_CONTEXT', 'GATE_PROD', 'MUSIC_DEPLOY_PRODUCTION', 'MUSIC_C10_STANDALONE_POSTGRES_ACK'])
            expect(() => assertBrowserEnvironment({ [key]: 'x' })).toThrow();
        expect(() => assertBrowserEnvironment({ NODE_ENV: 'production' })).toThrow();
        expect(() => assertBrowserEnvironment({})).not.toThrow();
    });
    it('requires exact local control origin, capability and case', () => {
        const input = { remote: '127.0.0.1', host: '127.0.0.1:55001', expectedHost: '127.0.0.1:55001', capability: 'a'.repeat(64), expectedCapability: 'a'.repeat(64), caseId: LIFECYCLE_CASES[0], action: 'prepare' };
        expect(() => validateLifecycleControl(input)).not.toThrow();
        for (const patch of [{ remote: '10.0.0.1' }, { host: 'attacker:55001' }, { capability: 'b'.repeat(64) }, { caseId: 'invented' }, { action: 'sql' }])
            expect(() => validateLifecycleControl({ ...input, ...patch })).toThrow();
    });
    it('requires exact discoveries and successful no-retry, no-skip executions', () => {
        const results = LIFECYCLE_CASES.map(title => ({ title, status: 'passed', retry: 0 }));
        expect(() => assertLifecycleResults([...LIFECYCLE_CASES], results)).not.toThrow();
        for (const altered of [results.slice(1), [...results, results[0]], results.map((r, i) => i ? r : { ...r, status: 'skipped' }), results.map((r, i) => i ? r : { ...r, retry: 1 })])
            expect(() => assertLifecycleResults([...LIFECYCLE_CASES], altered)).toThrow();
        expect(() => assertLifecycleResults([...LIFECYCLE_CASES].reverse(), results)).toThrow();
    });
    it('rejects provider code from a previous or absent scenario', () => {
        expect(() => assertProviderCode('this-case', 'this-case')).not.toThrow();
        for (const expected of [undefined, 'other-case'])
            expect(() => assertProviderCode('this-case', expected)).toThrow();
    });
    it('never issues a successful cleanup claim after any cleanup failure', () => {
        expect(() => assertOwnedCleanup([])).not.toThrow();
        expect(() => assertOwnedCleanup(['owned database drop'])).toThrow();
    });
    it('contains only exact Google navigation and inert assets, denying unsupported HTTP', () => {
        const origin = 'http://127.0.0.1:53111';
        const classify = (url: string, resource = 'document', navigation = true) => classifyLifecycleRequest({ url, origin, resource, navigation });
        expect(classify(origin + '/api/explorers/v1/recovery/status')).toBe('local');
        expect(classify('https://accounts.google.com/o/oauth2/v2/auth?state=x&redirect_uri=' + encodeURIComponent(origin + '/api/auth/callback/google'))).toBe('google');
        for (const url of ['https://accounts.google.com/o/oauth2/v2/auth?state=x&redirect_uri=https://attacker.invalid/callback', 'https://accounts.google.com/o/oauth2/v2/auth?redirect_uri=' + encodeURIComponent(origin + '/api/auth/callback/google'), 'https://attacker.invalid/api', origin + '/api/music/identity/lifecycle/suspend'])
            expect(classify(url)).toBe('deny');
        expect(classify('https://fonts.googleapis.com/css2?' + LIFECYCLE_FONT_QUERIES[0], 'stylesheet', false)).toBe('font');
        expect(classify('https://fonts.googleapis.com/css2?token=unowned', 'stylesheet', false)).toBe('deny');
        expect(classify('https://zupimages.net/up/19/34/4820.gif', 'image', false)).toBe('image');
        expect(classify('https://zupimages.net/up/19/34/other.gif', 'image', false)).toBe('deny');
    });
});
