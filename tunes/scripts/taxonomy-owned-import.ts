import { createHash } from 'node:crypto';
import { isProxy } from 'node:util/types';
import { openSync, closeSync, readSync, fstatSync, lstatSync, realpathSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod/v3';
import { validateTaxonomyCatalogImport } from '../server/services/taxonomyCatalogImport';
import type { TaxonomyImport } from '../shared/explorersTaxonomyContract';
/** Fixed reviewed DATA only. This loader grants no database/operator authority. */
export const reviewedTaxonomyInputDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../fixtures/taxonomy/real-strapi-20261013');
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const text = z.string().min(1).max(1024).refine(value => !/[\x00-\x1f\x7f]/.test(value));
const expected = {
    places: { bytes: 168643, sha256: '8c95f6695476cdb3bd2d796e607b9ca18058e64db3467627c47f5519b1643cc7', inputHash: 'c62c0eecd00db1cd13372d14ea984804e62d410e868bcb16d8093cbdd9084678' },
    people: { bytes: 187, sha256: 'fd8857edbf2979f663970c10e398ae6e3440e693ae60035eea265345c585d186', inputHash: 'a91c358a4490341cd2341fd9ae1d4371eca217c9ed4730caf09cb1d500cf9c63' },
} as const;
const inputEntry = z.object({ sha256: hash, inputHash: hash }).strict();
const manifestSchema = z.object({
    version: z.literal(1), status: z.literal('reviewed-input-not-applied'), sourceHost: z.literal('api.localqr.earth'), observedDate: z.literal('2026-10-13'), provenance: text,
    inputs: z.object({ 'places-import.json': inputEntry, 'people-import.json': inputEntry }).strict(),
    counts: z.object({ roots: z.literal(25), children: z.literal(310), terms: z.literal(335), sourceMappings: z.literal(335), peopleTerms: z.literal(0) }).strict(),
    rawSourceHashes: z.object({ old: hash, proposal: hash, currentRoots: hash, currentChildren: hash }).strict(),
    reconciliation: z.object({ roots: z.literal(25), children: z.literal(310), exactCurrentLabelParentMatches: z.literal(335), mismatches: z.literal(0), documentIds: text, spotcheck: z.object({ sourceNumericId: z.literal(76), label: z.literal('Zoo'), documentId: z.literal('ydjfncpu1g0ju340641wldsl'), parentLabel: z.literal('Entertainment and Recreation'), observation: text }).strict() }).strict(),
    ratification: z.object({ namespace: z.literal('c534822b-86e9-5c40-be1f-f9b3833dab21'), identityTemplate: z.literal('api.localqr.earth/{root|child}/{sourceDocumentId}'), slugPolicy: z.object({ normalization: text, root: text, child: text, collisionResolution: text, changePolicy: text }).strict(), defaultLocale: z.literal('en'), active: text, order: text, people: text, mixedMovies: text, legacyAliases: text }).strict(),
    peopleRelationAudit: z.object({ sha256: z.literal('ef5decdfa13a0904d589096de3b0bea2550e9521c1ccfd0c4168ff5df63610f8'), recommendations: z.literal(25), selectedRelations: z.literal(0) }).strict(),
}).strict();
export type ReviewedTaxonomyInputs = Readonly<{
    places: TaxonomyImport;
    people: TaxonomyImport;
    manifest: z.infer<typeof manifestSchema>;
    manifestHash: string;
    inputHashes: Readonly<{
        places: string;
        people: string;
    }>;
    rawHashes: Readonly<{
        places: string;
        people: string;
    }>;
}>;
const refuse = (): never => {
    throw new Error('Invalid reviewed taxonomy inputs');
};
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
function plainOptions(options: unknown): {
    fixedDirectory: string;
    expectedManifestHash: string;
} {
    if (!options || typeof options !== 'object' || isProxy(options) || Object.getPrototypeOf(options) !== Object.prototype)
        refuse();
    const descriptors = Object.getOwnPropertyDescriptors(options);
    if (Reflect.ownKeys(descriptors).sort().join(',') !== 'expectedManifestHash,fixedDirectory' || Object.values(descriptors).some(descriptor => !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')))
        refuse();
    const parsed = z.object({ fixedDirectory: z.literal(reviewedTaxonomyInputDirectory), expectedManifestHash: hash }).strict().parse(options);
    return parsed;
}
function readFixed(name: 'source-manifest.json' | 'places-import.json' | 'people-import.json', length: number): Buffer {
    const path = join(reviewedTaxonomyInputDirectory, name), info = lstatSync(path);
    if (!info.isFile() || info.isSymbolicLink() || realpathSync(path) !== path || info.size !== length)
        refuse();
    const fd = openSync(path, 'r');
    try {
        const actual = fstatSync(fd);
        if (!actual.isFile() || actual.size !== length)
            refuse();
        const bytes = Buffer.alloc(length);
        let offset = 0;
        while (offset < length) {
            const count = readSync(fd, bytes, offset, length - offset, null);
            if (count < 1)
                refuse();
            offset += count;
        }
        if (readSync(fd, Buffer.alloc(1), 0, 1, null) !== 0)
            refuse();
        return bytes;
    }
    finally {
        closeSync(fd);
    }
}
function deepFreeze<T>(value: T): T {
    if (value && typeof value === 'object') {
        for (const nested of Object.values(value))
            deepFreeze(nested);
        Object.freeze(value);
    }
    return value;
}
export function loadReviewedTaxonomyInputs(options: unknown): ReviewedTaxonomyInputs {
    try {
        const parsed = plainOptions(options), directory = lstatSync(parsed.fixedDirectory);
        if (!directory.isDirectory() || directory.isSymbolicLink() || realpathSync(parsed.fixedDirectory) !== parsed.fixedDirectory)
            refuse();
        const manifestBytes = readFixed('source-manifest.json', 3111), manifestHash = sha(manifestBytes);
        if (manifestHash !== parsed.expectedManifestHash)
            refuse();
        const utf8 = new TextDecoder('utf-8', { fatal: true });
        const manifest = manifestSchema.parse(JSON.parse(utf8.decode(manifestBytes)));
        const payloads = {} as Record<'places' | 'people', TaxonomyImport>;
        for (const category of ['places', 'people'] as const) {
            const file = (`${category}-import.json`) as 'places-import.json' | 'people-import.json';
            const bytes = readFixed(file, expected[category].bytes), entry = manifest.inputs[file];
            if (sha(bytes) !== expected[category].sha256 || entry.sha256 !== expected[category].sha256 || entry.inputHash !== expected[category].inputHash)
                refuse();
            const validated = validateTaxonomyCatalogImport(JSON.parse(utf8.decode(bytes)));
            if (validated.inputHash !== expected[category].inputHash || validated.input.category !== category || validated.input.catalogVersion !== 1 || validated.input.defaultLocale !== 'en' || validated.input.legacySlugMappings.length)
                refuse();
            payloads[category] = validated.input;
        }
        const places = payloads.places, people = payloads.people;
        if (places.terms.length !== 335 || places.terms.filter(term => term.parentId === null).length !== 25 || places.sourceMappings.length !== 335 || new Set(places.sourceMappings.map(mapping => mapping.termId)).size !== 335 || places.terms.some(term => !term.active || Object.keys(term.labels).join(',') !== 'en') || people.terms.length || people.sourceMappings.length)
            refuse();
        return deepFreeze({ places, people, manifest, manifestHash, inputHashes: { places: expected.places.inputHash, people: expected.people.inputHash }, rawHashes: { places: expected.places.sha256, people: expected.people.sha256 } });
    }
    catch {
        return refuse();
    }
}
