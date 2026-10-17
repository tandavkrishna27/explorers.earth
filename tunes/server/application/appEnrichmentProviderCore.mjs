import { createHash } from 'node:crypto';
import { parse, parseFragment } from 'parse5';
import { z } from 'zod/v3';
const fail = () => {
    throw new Error('Invalid provider metadata');
};
const sha = value => createHash('sha256').update(value, 'utf8').digest('hex');
const positive = z.number().int().positive().safe();
const byteLimit = positive.max(10485760);
const policySchema = z.object({ maxInputBytes: byteLimit, maxHtmlNodes: positive, maxHtmlDepth: positive, maxJsonLdBlocks: positive, maxJsonBytes: byteLimit, maxJsonDepth: positive, maxJsonTokens: positive }).strict();
const identitySchema = z.object({ sourceId: z.string(), sourceIdentity: z.string().min(1).max(2048), sourceIdentityHash: z.string().regex(/^[a-f0-9]{64}$/), canonicalizationVersion: z.string() }).strict();
function dataObject(value) {
    if (!value || Object.getPrototypeOf(value) !== Object.prototype)
        fail();
    for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value)))
        if (!('value' in descriptor) || !descriptor.enumerable)
            fail();
    if (Object.getOwnPropertySymbols(value).length)
        fail();
    return value;
}
export function validateProviderParsingPolicy(input) {
    try {
        return Object.freeze(policySchema.parse(dataObject(input)));
    }
    catch {
        fail();
    }
}
function makeIdentity(sourceId, sourceIdentity, canonicalizationVersion) {
    return Object.freeze(identitySchema.parse({ sourceId, sourceIdentity, sourceIdentityHash: sha(sourceIdentity), canonicalizationVersion }));
}
export function websiteProviderIdentity(canonicalUrl) {
    try {
        if (typeof canonicalUrl !== 'string' || /[\x00-\x20\x7f\\]/.test(canonicalUrl))
            fail();
        const u = new URL(canonicalUrl);
        if (u.href !== canonicalUrl || u.protocol !== 'https:' || u.username || u.password || u.hash || u.port || !u.hostname)
            fail();
        return makeIdentity('website-metadata', canonicalUrl, 'website-url-v1');
    }
    catch {
        fail();
    }
}
export function resolveWebsiteIdentity(input) {
    try {
        const identity = identitySchema.parse(dataObject(input)), expected = websiteProviderIdentity(identity.sourceIdentity);
        if (Object.keys(expected).some(k => identity[k] !== expected[k]))
            fail();
        return identity.sourceIdentity;
    }
    catch {
        fail();
    }
}
const appleSchema = z.object({ trackId: z.string().regex(/^[1-9][0-9]*$/).refine(v => Number.isSafeInteger(Number(v))), storefront: z.string().regex(/^[a-z]{2}$/), kind: z.enum(['software', 'mac-software']) }).strict();
function appleInput(input) {
    try {
        return appleSchema.parse(dataObject(input));
    }
    catch {
        fail();
    }
}
export function appleProviderIdentity(input) {
    const { trackId, storefront, kind } = appleInput(input);
    return makeIdentity('apple-app-store', JSON.stringify({ trackId, storefront, kind }), 'apple-lookup-v1');
}
export function appleLookupUrl(input) {
    const { trackId, storefront, kind } = appleInput(input);
    return `https://itunes.apple.com/lookup?id=${trackId}&country=${storefront}&entity=${kind === 'software' ? 'software' : 'desktopSoftware'}`;
}
export function websiteAdapterVersion(input) {
    const p = validateProviderParsingPolicy(input);
    return 'website-metadata-v1:' + sha(JSON.stringify(p));
}
export function decodeProviderUtf8(bytes, maxBytes) {
    try {
        if (!(bytes instanceof Uint8Array) || !byteLimit.safeParse(maxBytes).success || bytes.byteLength > maxBytes)
            fail();
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    }
    catch {
        fail();
    }
}
export function parseBoundedProviderJson(text, input) {
    try {
        const { maxJsonBytes, maxJsonDepth, maxJsonTokens } = z.object({ maxJsonBytes: byteLimit, maxJsonDepth: positive, maxJsonTokens: positive }).parse(dataObject(input));
        if (typeof text !== 'string' || Buffer.byteLength(text) > maxJsonBytes)
            fail();
        let depth = 0, tokens = 0;
        for (let i = 0; i < text.length;) {
            const ch = text[i];
            if (/\s/.test(ch)) {
                i++;
                continue;
            }
            if (++tokens > maxJsonTokens)
                fail();
            if (ch === '"') {
                i++;
                let closed = false;
                for (; i < text.length; i++) {
                    if (text[i] === '\\') {
                        i++;
                        continue;
                    }
                    if (text[i] === '"') {
                        closed = true;
                        i++;
                        break;
                    }
                }
                if (!closed)
                    fail();
                continue;
            }
            if (ch === '{' || ch === '[') {
                if (++depth > maxJsonDepth)
                    fail();
                i++;
                continue;
            }
            if (ch === '}' || ch === ']') {
                if (--depth < 0)
                    fail();
                i++;
                continue;
            }
            if (ch === ',' || ch === ':') {
                i++;
                continue;
            }
            while (i < text.length && !/[\s\[\]{}:,"]/.test(text[i]))
                i++;
        }
        if (depth !== 0)
            fail();
        return JSON.parse(text);
    }
    catch {
        fail();
    }
}
// Postparse traversal is a semantic filter, NOT a preallocation/work bound.
// Production callers must execute this pure parser in owned cancellable isolation.
function nodes(root, p) {
    const stack = [[root, 0]], out = [];
    while (stack.length) {
        const [node, depth] = stack.pop();
        if (out.length >= p.maxHtmlNodes || depth > p.maxHtmlDepth)
            fail();
        out.push(node);
        const children = node.childNodes ?? [];
        for (let i = children.length - 1; i >= 0; i--)
            stack.push([children[i], depth + 1]);
        if (node.content)
            stack.push([node.content, depth + 1]);
    }
    return out;
}
function textOf(node, p) {
    return nodes(node, p).filter(n => n.nodeName === '#text').map(n => n.value).join('');
}
function normalize(value, p, parseMarkup) {
    if (typeof value !== 'string' || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value))
        fail();
    if (!parseMarkup) return value.replace(/\s+/g, ' ').trim();
    const fragment = parseFragment(value);
    nodes(fragment, p);
    const parts = [];
    const stack = [fragment];
    let count = 0;
    while (stack.length) {
        const node = stack.pop();
        if (++count > p.maxHtmlNodes)
            fail();
        if (node.tagName === 'script' || node.tagName === 'style')
            continue;
        if (node.nodeName === '#text')
            parts.push(node.value);
        for (let i = (node.childNodes?.length ?? 0) - 1; i >= 0; i--)
            stack.push(node.childNodes[i]);
    }
    return parts.join(' ').replace(/\s+/g, ' ').trim();
}
function products(value) {
    const stack = [value], found = [];
    while (stack.length) {
        const v = stack.pop();
        if (Array.isArray(v)) {
            for (let i = v.length - 1; i >= 0; i--)
                stack.push(v[i]);
            continue;
        }
        if (v && typeof v === 'object') {
            const types = Array.isArray(v['@type']) ? v['@type'] : [v['@type']];
            if (types.some(t => ['Product', 'https://schema.org/Product', 'http://schema.org/Product'].includes(t)))
                found.push(v);
            for (const nested of Object.values(v))
                if (nested && typeof nested === 'object')
                    stack.push(nested);
        }
    }
    return found;
}
export function decodeWebsiteMetadata(bytes, identity, input, validateFields) {
    try {
        if (typeof validateFields !== 'function')
            fail();
        resolveWebsiteIdentity(identity);
        const p = validateProviderParsingPolicy(input), html = decodeProviderUtf8(bytes, p.maxInputBytes);
        if (html.includes('\0') || /^[\s]*[\[{]/.test(html))
            fail();
        const all = nodes(parse(html), p), metadata = new Map(), titles = [], candidates = [];
        let blocks = 0;
        for (const node of all) {
            const attrs = Object.fromEntries((node.attrs ?? []).map(a => [a.name, a.value]));
            if (node.tagName === 'meta') {
                const key = (attrs.property ?? attrs.name ?? '').toLowerCase();
                if (['og:title', 'og:description', 'twitter:title', 'twitter:description', 'description'].includes(key)) {
                    if (!Object.hasOwn(attrs, 'content'))
                        fail();
                    const list = metadata.get(key) ?? [];
                    list.push(attrs.content);
                    metadata.set(key, list);
                }
            }
            if (node.tagName === 'title')
                titles.push(textOf(node, p));
            if (node.tagName === 'script' && (attrs.type ?? '').trim().toLowerCase() === 'application/ld+json') {
                if (++blocks > p.maxJsonLdBlocks)
                    fail();
                candidates.push(...products(parseBoundedProviderJson(textOf(node, p), p)));
            }
        }
        if (candidates.length > 1)
            fail();
        const product = candidates[0];
        const fields = {};
        for (const [key, productKey, tiers] of [['title', 'name', ['og:title', 'twitter:title']], ['description', 'description', ['og:description', 'twitter:description', 'description']]]) {
            const sources = [];
            if (product && Object.hasOwn(product, productKey))
                sources.push({values:[product[productKey]],parseMarkup:true});
            for (const tier of tiers)
                if (metadata.has(tier))
                    sources.push({values:metadata.get(tier),parseMarkup:false});
            if (key === 'title' && titles.length)
                sources.push({values:titles,parseMarkup:false});
            for (const {values,parseMarkup} of sources) {
                const normalized = values.map(value => normalize(value, p, parseMarkup));
                if (new Set(normalized).size > 1)
                    fail();
                const value = normalized[0];
                if (!value)
                    continue;
                if (Buffer.byteLength(value) > (key === 'title' ? 500 : 8192))
                    fail();
                fields[key] = value;
                break;
            }
        }
        if (!Object.keys(fields).length)
            return { kind: 'unavailable' };
        return { kind: 'fields', fields: validateFields(fields) };
    }
    catch {
        fail();
    }
}



function exactAppleIdentity(input) {
    const identity = identitySchema.parse(dataObject(input));
    const source = appleInput(JSON.parse(identity.sourceIdentity));
    const expected = appleProviderIdentity(source);
    if (Object.keys(expected).some(key => identity[key] !== expected[key]))
        fail();
    return source;
}
export function resolveAppleIdentity(input) {
    try {
        return appleLookupUrl(exactAppleIdentity(input));
    }
    catch {
        fail();
    }
}
export function appleAdapterVersion(input) {
    return 'apple-metadata-v1:' + sha(JSON.stringify(validateProviderParsingPolicy(input)));
}
function appleText(value, maxBytes) {
    if (typeof value !== 'string' || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value))
        fail();
    const text = value.trim();
    if (!text || Buffer.byteLength(text) > maxBytes)
        fail();
    return text;
}
function applePlatforms(devices, kind) {
    const found = new Set(kind === 'mac-software' ? ['macOS'] : []);
    if (devices !== undefined) {
        if (!Array.isArray(devices))
            fail();
        for (const device of devices) {
            const text = appleText(device, Infinity);
            if (/^(iPhone(?:[1-9][0-9]*|SE[0-9]*)?)(?:-\1)?$/.test(text))
                found.add('iOS');
            if (/^(iPad(?:[1-9][0-9]*|Air[0-9]*|Mini[0-9]*|Pro[0-9]*|ThirdGen|FourthGen)?)(?:-\1)?$/.test(text))
                found.add('iPadOS');
            if (/^(?:MacDesktop|MacBook(?:Air|Pro)?|MacMini|MacPro|iMac(?:Pro)?)(?:[0-9]+)?$/.test(text))
                found.add('macOS');
        }
    }
    return ['iOS', 'iPadOS', 'macOS'].filter(value => found.has(value));
}
/** Pure only: production callers must use owned cancellable isolation. */
export function decodeAppleMetadata(bytes, identity, input, validateFields) {
    try {
        if (typeof validateFields !== 'function')
            fail();
        const source = exactAppleIdentity(identity), policy = validateProviderParsingPolicy(input);
        const value = parseBoundedProviderJson(decodeProviderUtf8(bytes, policy.maxInputBytes), policy);
        const envelope = z.object({ resultCount: z.number().int().min(0).safe(), results: z.array(z.unknown()) }).strict().parse(value);
        if (envelope.resultCount !== envelope.results.length || envelope.resultCount > 1)
            fail();
        if (envelope.resultCount === 0)
            return { kind: 'unavailable' };
        const record = dataObject(envelope.results[0]);
        if (!Number.isSafeInteger(record.trackId) || record.trackId !== Number(source.trackId) || record.kind !== source.kind)
            fail();
        const fields = {};
        if (Object.hasOwn(record, 'trackName'))
            fields.title = appleText(record.trackName, 500);
        if (Object.hasOwn(record, 'description'))
            fields.description = appleText(record.description, 8192);
        if (Object.hasOwn(record, 'price')) {
            if (typeof record.price !== 'number' || !Number.isFinite(record.price) || record.price < 0)
                fail();
            fields.priceTier = record.price === 0 ? 'Free' : 'Paid';
        }
        if (Object.hasOwn(record, 'supportedDevices') && record.supportedDevices === undefined)
            fail();
        const platforms = applePlatforms(record.supportedDevices, source.kind);
        if (platforms.length)
            fields.platforms = platforms;
        if (!Object.keys(fields).length)
            return { kind: 'unavailable' };
        return { kind: 'fields', fields: validateFields(fields) };
    }
    catch {
        fail();
    }
}
