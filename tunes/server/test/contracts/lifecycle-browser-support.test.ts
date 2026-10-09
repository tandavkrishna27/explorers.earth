import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseBrowserSuite, assertBrowserEnvironment, validateLifecycleControl, assertLifecycleResults, assertProviderCode, assertOwnedCleanup, classifyLifecycleRequest, LIFECYCLE_CASES, LIFECYCLE_FONT_QUERIES } from '../../../scripts/lifecycle-browser-guards';
const ack = 'TASK4_FIXTURE_OWNED_DISPOSABLE_PG15';
describe('owned lifecycle browser boundary', () => {
    it('locally intercepts the exact current bootstrap typography without widening font authority', () => {
        const bootstrap = readFileSync(new URL('../../../../explorers-earth/src/bootstrap.ts', import.meta.url), 'utf8');
        const href = bootstrap.match(/fonts\.href\s*=\s*'([^']+)'/)?.[1];
        expect(href).toBeDefined();
        const current = new URL(href!);
        expect(current.searchParams.getAll('family').map(family => family.split(':')[0])).toEqual(['DM Sans', 'Fraunces', 'Inter', 'Lato', 'Montserrat', 'Poppins', 'Space Grotesk']);
        const classify = (url: string, resource = 'stylesheet', navigation = false) => classifyLifecycleRequest({url, resource, navigation, origin: 'http://127.0.0.1:53111'});
        expect(classify(current.href)).toBe('font');
        for (const query of LIFECYCLE_FONT_QUERIES) expect(classify('https://fonts.googleapis.com/css2?' + query)).toBe('font');
        const alteredFamily = new URL(current);alteredFamily.searchParams.set('family', 'Unowned Family:wght@400');
        const extraQuery = new URL(current);extraQuery.searchParams.set('token', 'unowned');
        for (const url of [alteredFamily.href, extraQuery.href, current.href.replace('fonts.googleapis.com', 'fonts.googleapis.com.evil'), current.href.replace('https:', 'http:'), current.href.replace('/css2?', '/api?')]) expect(classify(url)).toBe('deny');
        for (const resource of ['fetch', 'script', 'font', 'document']) expect(classify(current.href, resource)).toBe('deny');
        expect(classify(current.href, 'stylesheet', true)).toBe('deny');
    });
    it('accepts only exact existing and lifecycle selectors', () => {
        expect(parseBrowserSuite(['--ack', ack])).toBe('profile');
        for (const suite of ['auth', 'lifecycle', 'places', 'place-links'])
            expect(parseBrowserSuite(['--suite', suite, '--ack', ack])).toBe(suite);
        for (const args of [[], ['--suite', 'music', '--ack', ack], ['--suite', 'lifecycle', '--ack', 'wrong'], ['--ack', ack, '--ack', ack], ['--suite', 'lifecycle', '--ack', ack, '--list']])
            expect(() => parseBrowserSuite(args)).toThrow();
    });
    it('rejects ambient and production authority', () => {
        for (const key of ['DATABASE_URL', 'DATABASE_URL_TEST', 'DOCKER_HOST', 'DOCKER_CONTEXT', 'GATE_PROD', 'MUSIC_DEPLOY_PRODUCTION', 'MUSIC_C10_STANDALONE_POSTGRES_ACK', 'PLACES_E2E_FIXTURE_PATH', 'PLACE_LINKS_E2E_FIXTURE_PATH', 'PROFILE_E2E_SUITE'])
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
    it('bounds replacement sessions to a current case and an existing owned identity', () => {
        const input = { remote: '127.0.0.1', host: '127.0.0.1:55001', expectedHost: '127.0.0.1:55001', capability: 'a'.repeat(64), expectedCapability: 'a'.repeat(64), caseId: LIFECYCLE_CASES[10], activeCaseId: LIFECYCLE_CASES[10], action: 'session', owner: 0 };
        for (const owner of [0, 1]) expect(() => validateLifecycleControl({ ...input, owner })).not.toThrow();
        for (const patch of [{ owner: 2 }, { owner: -1 }, { owner: '0' }, { owner: undefined }, { activeCaseId: undefined }, { activeCaseId: LIFECYCLE_CASES[0] }, { capability: 'b'.repeat(64) }, { remote: '10.0.0.1' }])
            expect(() => validateLifecycleControl({ ...input, ...patch } as typeof input)).toThrow();
        expect(LIFECYCLE_CASES).toHaveLength(18);
        const results = LIFECYCLE_CASES.map(title => ({ title, status: 'passed', retry: 0 }));
        expect(() => assertLifecycleResults([...LIFECYCLE_CASES].slice(0, 10), results.slice(0, 10))).toThrow();
        expect(() => assertLifecycleResults([...LIFECYCLE_CASES], results.map((r, i) => i === 11 ? { ...r, status: 'failed' } : r))).toThrow();
    });
    it('requires all six completion replacement identities after the twelve retained cases', () => {
        expect(LIFECYCLE_CASES.slice(12)).toEqual(['held deletion completion preserves verified replacement B', 'held deletion completion preserves a fresh verified returning A session', 'held deactivation completion preserves verified replacement B', 'held deactivation completion preserves a fresh verified returning A session', 'held recovery completion preserves verified replacement B', 'held recovery completion preserves a fresh verified returning A session']);
        const results = LIFECYCLE_CASES.map(title => ({ title, status: 'passed', retry: 0 }));
        for (let index = 12; index < 18; index++) {
            expect(() => assertLifecycleResults(LIFECYCLE_CASES.filter((_, i) => i !== index), results.filter((_, i) => i !== index))).toThrow();
            expect(() => assertLifecycleResults([...LIFECYCLE_CASES], results.map((result, i) => i === index ? { ...result, status: 'failed' } : result))).toThrow();
        }
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
