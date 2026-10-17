import { it, expect, vi } from 'vitest';
import { resolve } from 'node:path';
import { readFileSync, readSync } from 'node:fs';
vi.mock('node:fs', async (importOriginal) => {
    const actual = await importOriginal<typeof import('node:fs')>();
    return { ...actual, readSync: vi.fn(actual.readSync) };
});
import { loadReviewedTaxonomyInputs, reviewedTaxonomyInputDirectory } from '../../../scripts/taxonomy-owned-import';
const directory = resolve(import.meta.dirname, '../../../../fixtures/taxonomy/real-strapi-20261013');
const manifestHash = '0087cf143b6f8ae68f60087539083bd0f7992c50c846b4c98a02dc1e9155ccff';
it('loads exact real reviewed335 catalog and configured empty People through current importer', () => {
    expect(reviewedTaxonomyInputDirectory).toBe(directory);
    const loaded = loadReviewedTaxonomyInputs({ fixedDirectory: directory, expectedManifestHash: manifestHash });
    expect(loaded.manifestHash).toBe(manifestHash);
    expect(loaded.inputHashes).toEqual({ places: 'c62c0eecd00db1cd13372d14ea984804e62d410e868bcb16d8093cbdd9084678', people: 'a91c358a4490341cd2341fd9ae1d4371eca217c9ed4730caf09cb1d500cf9c63' });
    expect(loaded.places.terms).toHaveLength(335);
    expect(loaded.places.terms.filter(term => term.parentId === null)).toHaveLength(25);
    expect(loaded.places.sourceMappings).toHaveLength(335);
    expect(loaded.people).toEqual({ version: 'explorers-taxonomy-import/v1', catalogVersion: 1, category: 'people', defaultLocale: 'en', terms: [], sourceMappings: [], legacySlugMappings: [] });
    expect(Object.isFrozen(loaded)).toBe(true);
    expect(Object.isFrozen(loaded.places.terms[0].labels)).toBe(true);
    expect(Object.isFrozen(loaded.manifest.ratification.slugPolicy)).toBe(true);
    expect(loaded.manifest.peopleRelationAudit).toEqual({ sha256: 'ef5decdfa13a0904d589096de3b0bea2550e9521c1ccfd0c4168ff5df63610f8', recommendations: 25, selectedRelations: 0 });
});
it('refuses arbitrary paths malformed expected digest getters and proxies without executing them', () => {
    for (const options of [{ fixedDirectory: resolve(directory, '..'), expectedManifestHash: manifestHash }, { fixedDirectory: directory, expectedManifestHash: '0'.repeat(64) }, { fixedDirectory: directory, expectedManifestHash: 'invalid' }, { fixedDirectory: directory, expectedManifestHash: manifestHash, reviewedBy: 'not-authority' }])
        expect(() => loadReviewedTaxonomyInputs(options)).toThrow(/^Invalid reviewed taxonomy inputs$/);
    let reads = 0;
    const getter = Object.defineProperty({ expectedManifestHash: manifestHash }, 'fixedDirectory', { enumerable: true, get() {
            reads++;
            throw Error('private');
        } });
    const proxy = new Proxy({}, { get() {
            reads++;
            throw Error('private');
        }, ownKeys() {
            reads++;
            throw Error('private');
        }, getPrototypeOf() {
            reads++;
            throw Error('private');
        } });
    expect(() => loadReviewedTaxonomyInputs(getter)).toThrow(/^Invalid reviewed taxonomy inputs$/);
    expect(() => loadReviewedTaxonomyInputs(proxy)).toThrow(/^Invalid reviewed taxonomy inputs$/);
    expect(reads).toBe(0);
});
it('returns immutable payload copies rather than authority or database handles', () => {
    const loaded = loadReviewedTaxonomyInputs({ fixedDirectory: directory, expectedManifestHash: manifestHash });
    expect(Object.keys(loaded).sort()).toEqual(['inputHashes', 'manifest', 'manifestHash', 'people', 'places', 'rawHashes']);
    expect(() => {
        (loaded.places.terms[0].labels as any).en = 'mutated';
    }).toThrow();
    expect(JSON.parse(readFileSync(resolve(directory, 'places-import.json'), 'utf8')).terms[0].labels.en).toBe('Acai Shop');
});
it.each([3111, 168643, 187])('refuses raw byte drift in reviewed file of %i bytes before returning payloads', async (size) => {
    const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
    vi.mocked(readSync).mockImplementation(((fd: number, buffer: Buffer, offset: number, length: number, position: number | null) => {
        const count = actual.readSync(fd, buffer, offset, length, position);
        if (buffer.length === size && count > 0) {
            const index = buffer.indexOf(10);
            if (index >= 0)
                buffer[index] = 13;
        }
        return count;
    }) as typeof readSync);
    try {
        expect(() => loadReviewedTaxonomyInputs({ fixedDirectory: directory, expectedManifestHash: manifestHash })).toThrow(/^Invalid reviewed taxonomy inputs$/);
    }
    finally {
        vi.mocked(readSync).mockImplementation(actual.readSync);
    }
});
