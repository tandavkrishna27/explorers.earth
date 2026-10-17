import { describe, it, expect } from 'vitest';
import tmdbService from '../tmdbService';
describe('retired browser provider service', () => {
  it('exposes formatting only; provider requests belong to the canonical API', () => {
    for (const method of ['searchMulti', 'getMovieDetails', 'getTVDetails', 'getWatchProviders', 'getTrending', 'getMovieGenres', 'getTVGenres']) expect(tmdbService).not.toHaveProperty(method);
  });
  it('preserves owned media and canonical provider image URLs', () => {
    expect(tmdbService.buildPosterUrl('/api/explorers/v1/media/id/content')).toBe('/api/explorers/v1/media/id/content');
    expect(tmdbService.buildPosterUrl('/poster.jpg')).toBe('https://image.tmdb.org/t/p/w342/poster.jpg');
    expect(tmdbService.buildPosterUrl('https://image.tmdb.org/t/p/original/p.jpg')).toBe('https://image.tmdb.org/t/p/original/p.jpg');
    expect(tmdbService.buildImageUrl(null, 'w500')).toBe('');
  });
});
