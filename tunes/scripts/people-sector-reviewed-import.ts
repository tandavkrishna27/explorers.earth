import { createHash } from 'node:crypto';
import { closeSync, fstatSync, lstatSync, openSync, readSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateTaxonomyCatalogImport } from '../server/services/taxonomyCatalogImport';
import type { TaxonomyImport } from '../shared/explorersTaxonomyContract';
/**
 * Fixed reviewed People sector DATA only; grants no database/operator authority.
 * The Strapi export had zero People sectors (real-strapi-20261013 manifest: "observed
 * zero rows"), so this vocabulary is the owner-approved standard set (2026-10-22).
 * Term ids are UUIDv5 under the taxonomy ratification namespace of
 * "explorers.earth/people-sector/<slug>". Labels are English only, like Places;
 * other locales fall back to defaultLocale "en".
 */
export const reviewedPeopleSectorInputPath = resolve(dirname(fileURLToPath(import.meta.url)), '../fixtures/taxonomy/reviewed-people-20261022/people-sectors.json');
const expected = { bytes: 4983, sha256: '20c6c81e54b795cf4c8e7eec8ade2500cda849cd3aec7ab0e81cca7a01b5db77', inputHash: 'c129d5bdbcfd63278b7e04b241471fccabb25930dfcd35e5ce4eb611933a9b98', terms: 20 } as const;
const refuse = (): never => { throw new Error('Invalid reviewed People sector input'); };
function readFixed(path: string, length: number): Buffer {
    const info = lstatSync(path);
    if (!info.isFile() || info.isSymbolicLink() || realpathSync(path) !== path || info.size !== length) refuse();
    const fd = openSync(path, 'r');
    try {
        if (fstatSync(fd).size !== length) refuse();
        const bytes = Buffer.alloc(length);
        let offset = 0;
        while (offset < length) {
            const count = readSync(fd, bytes, offset, length - offset, null);
            if (count < 1) refuse();
            offset += count;
        }
        return bytes;
    } finally {
        closeSync(fd);
    }
}
export function loadReviewedPeopleSectors(): Readonly<{ people: TaxonomyImport; inputHash: string }> {
    try {
        const bytes = readFixed(reviewedPeopleSectorInputPath, expected.bytes);
        if (createHash('sha256').update(bytes).digest('hex') !== expected.sha256) refuse();
        const validated = validateTaxonomyCatalogImport(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
        const people = validated.input;
        if (validated.inputHash !== expected.inputHash || people.category !== 'people' || people.catalogVersion !== 1 || people.defaultLocale !== 'en'
            || people.terms.length !== expected.terms || people.terms.some(term => term.parentId !== null || !term.active || Object.keys(term.labels).join(',') !== 'en')
            || people.sourceMappings.length || people.legacySlugMappings.length) refuse();
        return { people, inputHash: validated.inputHash };
    } catch {
        return refuse();
    }
}
