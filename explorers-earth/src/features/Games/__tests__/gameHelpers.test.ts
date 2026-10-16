import { describe, it, expect } from 'vitest';
import {
  generateSlug,
  genreToSlug,
  slugToGenreName,
  extractUniqueGenres,
  parseGenres,
  formatRating,
  extractNoteText,
  deduplicateGames,
  buildCoverUrl,
} from '../utils/gameHelpers';

describe('gameHelpers', () => {
  describe('slug generation', () => {
    it('generates a clean slug', () => {
      expect(generateSlug('The Legend of Zelda: Tears of the Kingdom')).toBe('the-legend-of-zelda-tears-of-the-kingdom');
      expect(generateSlug('  Hello_World  --- ')).toBe('hello-world');
    });

    it('converts genre to slug', () => {
      expect(genreToSlug('Role-Playing (RPG)')).toBe('role-playing-rpg');
    });

    it('converts slug to genre name', () => {
      expect(slugToGenreName('role-playing-rpg')).toBe('Role Playing Rpg');
    });
  });

  describe('genre extractors', () => {
    it('extracts unique genres', () => {
      const arr1 = ['RPG', 'Action'];
      const arr2 = ['Action', 'Adventure'];
      
      const unique = extractUniqueGenres([arr1, arr2, null]);
      expect(unique).toEqual(['Action', 'Adventure', 'RPG']); // sorted
    });

    it('parses genres', () => {
      expect(parseGenres(['RPG', 123, null])).toEqual(['RPG']);
      expect(parseGenres(null)).toEqual([]);
    });
  });

  describe('format helpers', () => {
    it('formats rating', () => {
      expect(formatRating(8.567)).toBe('8.6');
      expect(formatRating(null)).toBe('');
    });
  });

  describe('extractNoteText', () => {
    it('extracts from string', () => {
      expect(extractNoteText('test')).toBe('test');
    });

    it('extracts from blocks', () => {
      const blocks = [
        { children: [{ text: 'Hello ' }, { text: 'World' }] },
      ];
      expect(extractNoteText(blocks)).toBe('Hello World');
    });
  });

  describe('deduplicateGames', () => {
    it('deduplicates by documentId', () => {
      const games = [
        { documentId: '1', title: 'A' },
        { documentId: '2', title: 'B' },
        { documentId: '1', title: 'A' },
      ];
      expect(deduplicateGames(games)).toHaveLength(2);
      expect(deduplicateGames(null)).toEqual([]);
    });
  });

  describe('buildCoverUrl', () => {
    it('returns as-is for http links', () => {
      expect(buildCoverUrl('http://example.com/cover.jpg')).toBe('http://example.com/cover.jpg');
    });

    it('prefixes strapi relative paths', () => {
      const expectedBase =
        import.meta.env.VITE_REST_API_URL?.replace('/api', '') || 'http://localhost:1337';

      expect(buildCoverUrl('/uploads/cover.jpg')).toBe(`${expectedBase}/uploads/cover.jpg`);
    });

    it('handles empty', () => {
      expect(buildCoverUrl(null)).toBe('');
    });
  });
});

describe('native Games identity and zero provenance',()=>{
 it('preserves a provider rating zero distinctly from absence',()=>{expect(formatRating(0)).toBe('0.0');expect(formatRating(null)).toBe('');});
 it('never merges distinct recommendation UUIDs sharing a provider ID',()=>{const rows=[{documentId:'a',igdb_id:42},{documentId:'b',igdb_id:42}];expect(deduplicateGames(rows)).toEqual(rows);});
 /*
  * The id is a uuid because `media_assets.id` is a `uuid` column and every projection
  * interpolates it directly, so `/api/explorers/v1/media/owned/content` was never a
  * shape the server can emit. It passed while `buildCoverUrl` matched the route by
  * prefix; the exact shared match in `src/lib/canonicalMedia.ts` refuses it, which is
  * the point of the exact match.
  */
 it('keeps canonical media on its authenticated native route',()=>{expect(buildCoverUrl('/api/explorers/v1/media/11111111-1111-4111-8111-111111111111/content')).toBe('/api/explorers/v1/media/11111111-1111-4111-8111-111111111111/content');});
});
