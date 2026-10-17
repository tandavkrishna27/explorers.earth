import { it, expect } from 'vitest';
import { appleProviderIdentity, decodeAppleMetadata, appleAdapterVersion, resolveAppleIdentity } from '../../application/appEnrichmentProviderCore.mjs';
import { appSnapshotFieldsSchema } from '../../../shared/explorersAppEnrichmentContract';
const policy = { maxInputBytes: 30000, maxHtmlNodes: 100, maxHtmlDepth: 15, maxJsonLdBlocks: 2, maxJsonBytes: 30000, maxJsonDepth: 8, maxJsonTokens: 300 };
const input = { trackId: '123', storefront: 'us', kind: 'software' as const };
const id = () => appleProviderIdentity(input);
const result = (extra: Record<string, unknown> = {}) => ({ trackId: 123, kind: 'software', ...extra });
const decode = (results: unknown[], resultCount = results.length, identity = id()) => decodeAppleMetadata(Buffer.from(JSON.stringify({ resultCount, results })), identity, policy, fields => appSnapshotFieldsSchema.parse(fields));
it('resolves exact Apple identity and binds version to policy', () => {
    expect(resolveAppleIdentity(id())).toBe('https://itunes.apple.com/lookup?id=123&country=us&entity=software');
    expect(() => resolveAppleIdentity({ ...id(), sourceIdentityHash: '0'.repeat(64) })).toThrow();
    expect(appleAdapterVersion(policy)).not.toBe(appleAdapterVersion({ ...policy, maxJsonTokens: 301 }));
});
it('requires exact result count id and kind with unavailable only for valid absence', () => {
    expect(decode([])).toEqual({ kind: 'unavailable' });
    expect(decode([result()])).toEqual({ kind: 'unavailable' });
    for (const [results, count] of [[[], 1], [[result()], 0], [[result(), result()], 2], [[result({ trackId: 124 })], 1], [[result({ trackId: '123' })], 1], [[result({ kind: 'mac-software' })], 1]] as const)
        expect(() => decode([...results], count)).toThrow();
});
it('produces only valid title description price and deterministic device platforms', () => {
    expect(decode([result({ trackName: ' Example ', description: 'Useful app', price: 0, supportedDevices: ['iPad23-iPad23', 'iPhone17-iPhone17', 'iPad23-iPad23', 'unknown', 'MacDesktop'], artworkUrl512: 'https://example.com/asset', sellerName: 'ignored' })])).toEqual({ kind: 'fields', fields: { title: 'Example', description: 'Useful app', priceTier: 'Free', platforms: ['iOS', 'iPadOS', 'macOS'] } });
    expect(decode([result({ price: 0.01 })])).toEqual({ kind: 'fields', fields: { priceTier: 'Paid' } });
    expect(decode([result({ supportedDevices: ['unknown'] })])).toEqual({ kind: 'unavailable' });
    expect(decode([result({ supportedDevices: [] })])).toEqual({ kind: 'unavailable' });
});
it('supplies macOS for exact mac software even without optional device metadata', () => {
    expect(decode([result({ kind: 'mac-software' })], 1, appleProviderIdentity({ ...input, kind: 'mac-software' }))).toEqual({ kind: 'fields', fields: { platforms: ['macOS'] } });
});
it('refuses every supplied invalid field without partial suggestions', () => {
    for (const extra of [{ trackName: null }, { trackName: 23 }, { trackName: '' }, { trackName: 'é'.repeat(251) }, { description: null }, { description: 23 }, { description: 'é'.repeat(4097) }, { description: 'x\u0000y' }, { price: -1 }, { price: '0' }, { price: null }, { supportedDevices: null }, { supportedDevices: 'iPhone' }, { supportedDevices: [null] }, { supportedDevices: [23] }])
        expect(() => decode([result({ trackName: 'Valid', ...extra })])).toThrow();
    for (const raw of ['{"resultCount":1,"results":[{"trackId":123,"kind":"software","price":1e400}]}', 'callback({"resultCount":0,"results":[]})', '{"resultCount":0,"results":[],"extra":true}'])
        expect(() => decodeAppleMetadata(Buffer.from(raw), id(), policy, fields => appSnapshotFieldsSchema.parse(fields))).toThrow();
});
it('does not guess platforms from unknown strings or emit blank text writes', () => {
    expect(decode([result({ supportedDevices: ['iPhoneMalware', 'iPadUnknown', 'MacAlien', 'x'.repeat(5000)] })])).toEqual({ kind: 'unavailable' });
    expect(() => decode([result({ description: ' \n ' })])).toThrow();
    expect(() => decode([result({ trackName: 'Bad\nTitle' })])).toThrow();
    expect(() => decode([result({ description: '\ud800' })])).toThrow();
});
it('omits invented model suffixes and mismatched duplicated device identifiers',()=>{
 for(const device of ['iPhone1Alien','iPhone17-Unknown','iPad23-Unknown','iPhone17-iPhone18','iPad23-iPad24'])expect(decode([result({supportedDevices:[device]})])).toEqual({kind:'unavailable'});
 expect(decode([result({supportedDevices:['iPhone17-iPhone17','iPad23-iPad23','MacDesktop','iPhone1Alien']})])).toEqual({kind:'fields',fields:{platforms:['iOS','iPadOS','macOS']}});
 expect(decode([result({trackName:'Valid',supportedDevices:['iPhone1Alien']})])).toEqual({kind:'fields',fields:{title:'Valid'}});
});
it('accepts exact DB byte boundaries and refuses malformed identity or missing validator', () => {
    expect(decode([result({ trackName: 'x'.repeat(500), description: 'x'.repeat(8192) })])).toEqual({ kind: 'fields', fields: { title: 'x'.repeat(500), description: 'x'.repeat(8192) } });
    expect(() => decode([result({ trackName: 'x'.repeat(501) })])).toThrow();
    expect(() => decodeAppleMetadata(Buffer.from('{"resultCount":0,"results":[]}'), id(), policy, undefined as never)).toThrow();
    expect(() => resolveAppleIdentity({ ...id(), sourceIdentity: '{"storefront":"us","trackId":"123","kind":"software"}' })).toThrow();
});
