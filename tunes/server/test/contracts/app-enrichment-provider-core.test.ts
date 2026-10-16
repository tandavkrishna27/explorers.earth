import { it, expect } from 'vitest';
import * as c from '../../application/appEnrichmentProviderCore.mjs';
import { appSnapshotFieldsSchema } from '../../../shared/explorersAppEnrichmentContract';
const p = { maxInputBytes: 30000, maxHtmlNodes: 100, maxHtmlDepth: 15, maxJsonLdBlocks: 2, maxJsonBytes: 10000, maxJsonDepth: 8, maxJsonTokens: 100 };
const id = () => c.websiteProviderIdentity('https://example.com/');
const decode = (html: string, policy = p) => c.decodeWebsiteMetadata(Buffer.from(html), id(), policy, fields => appSnapshotFieldsSchema.parse(fields));
it('preserves exact canonical identities and refuses mismatches', () => {
    expect(c.resolveWebsiteIdentity(id())).toBe('https://example.com/');
    for (const url of ['https://example.com', 'http://example.com/', 'https://x@example.com/', 'https://example.com/#x', 'https://EXAMPLE.com/'])
        expect(() => c.websiteProviderIdentity(url)).toThrow();
    expect(() => c.resolveWebsiteIdentity({ ...id(), sourceIdentityHash: '0'.repeat(64) })).toThrow();
    expect(id()).not.toEqual(c.websiteProviderIdentity('https://www.example.com/'));
});
it('reserves exact synthetic Apple identities and entity mapping', () => {
    const input = { trackId: '123', storefront: 'us', kind: 'software' as const };
    expect(c.appleProviderIdentity(input).sourceIdentity).toBe('{"trackId":"123","storefront":"us","kind":"software"}');
    expect(c.appleLookupUrl(input)).toBe('https://itunes.apple.com/lookup?id=123&country=us&entity=software');
    expect(c.appleLookupUrl({ ...input, kind: 'mac-software' })).toBe('https://itunes.apple.com/lookup?id=123&country=us&entity=desktopSoftware');
    for (const trackId of ['0', '01', '-1', '1.2', '9007199254740992'])
        expect(() => c.appleProviderIdentity({ ...input, trackId })).toThrow();
    expect(() => c.appleProviderIdentity({ ...input, extra: true })).toThrow();
});
it('requires exact finite positive policy and binds every cap', () => {
    for (const extra of [{ maxHtmlNodes: 0 }, { extra: 1 }, { maxJsonDepth: Infinity }])
        expect(() => c.validateProviderParsingPolicy({ ...p, ...extra })).toThrow();
    expect(c.websiteAdapterVersion(p)).not.toBe(c.websiteAdapterVersion({ ...p, maxJsonTokens: 101 }));
});
it('admits the exact transport ceiling and refuses larger byte policies at every pure entry',()=>{
 for(const field of ['maxInputBytes','maxJsonBytes']){expect(c.validateProviderParsingPolicy({...p,[field]:10485760})[field as keyof typeof p]).toBe(10485760);expect(()=>c.validateProviderParsingPolicy({...p,[field]:10485761})).toThrow();}
 expect(c.parseBoundedProviderJson('{}',{...p,maxJsonBytes:10485760})).toEqual({});expect(()=>c.parseBoundedProviderJson('{}',{...p,maxJsonBytes:10485761})).toThrow();
 expect(c.decodeProviderUtf8(Buffer.from('x'),10485760)).toBe('x');expect(()=>c.decodeProviderUtf8(Buffer.from('x'),10485761)).toThrow();
});
it('refuses malformed UTF8 and byte overflow', () => {
    expect(() => c.decodeProviderUtf8(Buffer.from([0xc0, 0xaf]), 2)).toThrow();
    expect(() => c.decodeProviderUtf8(Buffer.from('abc'), 2)).toThrow();
    expect(c.decodeProviderUtf8(Buffer.from('é'), 2)).toBe('é');
});
it('preflights depth tokens quoted braces and malformed JSON', () => {
    expect(c.parseBoundedProviderJson('{"x":"{\\\"}"}', p)).toEqual({ x: '{"}' });
    expect(() => c.parseBoundedProviderJson('[[[0]]]', { ...p, maxJsonDepth: 2 })).toThrow();
    expect(() => c.parseBoundedProviderJson('[0,1]', { ...p, maxJsonTokens: 3 })).toThrow();
    for (const text of ['{"x":"unterminated', '{x:1}', '{} trailing'])
        expect(() => c.parseBoundedProviderJson(text, p)).toThrow();
});
it('selects Product then OG Twitter and title independently', () => {
    expect(decode('<title>fallback</title><meta property="og:title" content="OG"><script type="application/ld+json">{"@type":"Product","name":"Product","description":"Product description","price":1}</script>')).toEqual({ kind: 'fields', fields: { title: 'Product', description: 'Product description' } });
    expect(decode('<title>fallback</title><meta name="description" content="fallback desc"><meta property="og:title" content="OG"><meta name="twitter:description" content="Twitter desc">')).toEqual({ kind: 'fields', fields: { title: 'OG', description: 'Twitter desc' } });
    expect(decode('<title> A &amp; B </title>')).toEqual({ kind: 'fields', fields: { title: 'A & B' } });
});
it('omits blanks and refuses invalid selected fields and Product ambiguity', () => {
    expect(decode('<title> </title>')).toEqual({ kind: 'unavailable' });
    expect(decode('<script type="application/ld+json">{"@type":"Thing","name":"ignored"}</script><title>Fallback</title>')).toEqual({ kind: 'fields', fields: { title: 'Fallback' } });
    for (const html of ['<script type="application/ld+json">[{"@type":"Product"},{"@type":"Product"}]</script>', '<script type="application/ld+json">{"@type":"Product","name":null}</script>', '<script type="application/ld+json">{"@type":"Product","description":123}</script>'])
        expect(() => decode(html)).toThrow();
    expect(() => decode('<title>' + 'é'.repeat(251) + '</title>')).toThrow();
    expect(() => decode('<meta name="description" content="' + 'é'.repeat(4097) + '">')).toThrow();
});
it('enforces structural filters and requires authoritative validation', () => {
    expect(() => decode('<div><div><div>x</div></div></div>', { ...p, maxHtmlDepth: 3 })).toThrow();
    expect(() => decode('<p>x</p><p>y</p>', { ...p, maxHtmlNodes: 5 })).toThrow();
    expect(() => decode('<script type="application/ld+json">{}</script>'.repeat(3))).toThrow();
    expect(() => c.decodeWebsiteMetadata(Buffer.from('<title>x</title>'), id(), p, undefined as never)).toThrow();
});
it('refuses JSON masquerading as HTML and deep markup inside Product text', () => {
    expect(() => decode('{"title":"wrong content profile"}')).toThrow();
    const deep = '<i>'.repeat(20) + 'x' + '</i>'.repeat(20);
    expect(() => decode('<script type="application/ld+json">' + JSON.stringify({ '@type': 'Product', name: deep }) + '</script>')).toThrow();
});
it('normalizes inert descriptions without following assets or executing scripts', () => {
    expect(decode('<meta name="twitter:title" content="Twitter"><meta name="description" content="A &amp; B"><img src="https://example.com/private"><script>throw new Error("executed")</script>')).toEqual({ kind: 'fields', fields: { title: 'Twitter', description: 'A & B' } });
    expect(decode('<script type="application/ld+json">' + JSON.stringify({ '@graph': [{ '@type': 'Product', description: '<p>First</p><p>Second</p><script>bad()</script>' }] }).replace(/</g, '\\u003c') + '</script>')).toEqual({ kind: 'fields', fields: { description: 'First Second' } });
});
it('refuses accessor policies without invoking getters',()=>{
 let reads=0;
 const policy={...p};Object.defineProperty(policy,'maxJsonDepth',{enumerable:true,get(){reads++;return 8}});
 expect(()=>c.parseBoundedProviderJson('{}',policy)).toThrow();expect(reads).toBe(0);
 expect(()=>c.validateProviderParsingPolicy(policy)).toThrow();expect(reads).toBe(0);
});
it('preserves already decoded HTML text without interpreting it a second time',()=>{
 expect(decode('<title>&lt;Beta&gt; Explorer</title>')).toEqual({kind:'fields',fields:{title:'<Beta> Explorer'}});
 expect(decode('<meta property="og:title" content="&lt;Beta&gt; Explorer"><meta property="og:description" content="AT&amp;amp;T">')).toEqual({kind:'fields',fields:{title:'<Beta> Explorer',description:'AT&amp;T'}});
});
