import { describe, it, expect } from 'vitest';
import { formatRuntime, formatRating, buildBackdropUrl, extractYear, deduplicateMovies } from '../utils/movieHelpers';

describe('movieHelpers Extra Cases', () => {
  it('preserves owned image paths and zero factual values', () => {
    expect(buildBackdropUrl('/api/explorers/v1/media/a/content')).toBe('/api/explorers/v1/media/a/content');
    expect(formatRating(0)).toBe('0.0');
    expect(formatRuntime(0)).toBe('0m');
  });
  it('keeps distinct recommendations sharing Movie/TV provider numeric identity', () => {
    const movies = [{documentId:'movie',tmdb_id:'7'},{documentId:'tv',tmdb_id:'7'},{documentId:'another',tmdb_id:'7'}];
    expect(deduplicateMovies(movies).map(movie => movie.documentId)).toEqual(['movie','tv','another']);
  });
  it('should handle runtime formatting boundary cases', () => {
    expect(formatRuntime(undefined)).toBe('');
    expect(formatRuntime(null)).toBe('');
    expect(formatRuntime(45)).toBe('45m');
    expect(formatRuntime(120)).toBe('2h');
    expect(formatRuntime(135)).toBe('2h 15m');
  });

  it('should format ratings safely', () => {
    expect(formatRating(undefined)).toBe('');
    expect(formatRating(null)).toBe('');
    expect(formatRating(8.345)).toBe('8.3');
  });

  it('should generate empty string for empty backdrop paths', () => {
    expect(buildBackdropUrl(null)).toBe('');
    expect(buildBackdropUrl('')).toBe('');
  });
  
  it('should return external link backdrops unchanged', () => {
    const extUrl = 'https://images.tmdb.org/t/p/w1280/ext.jpg';
    expect(buildBackdropUrl(extUrl)).toBe(extUrl);
  });

  it('should extract years safely', () => {
    expect(extractYear(undefined)).toBe('');
    expect(extractYear('')).toBe('');
    expect(extractYear('2026-07-08')).toBe('2026');
  });
});
