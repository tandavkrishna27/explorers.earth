import { describe, it, expect } from 'vitest';
import tmdbService from '../tmdbService';
describe('provider display helpers', () => {
  it('formats display dates without network access', () => {
    expect(tmdbService.extractYear('2026-07-08')).toBe('2026');
    expect(tmdbService.extractYear(undefined)).toBe('');
  });
  it('keeps owned backdrop and logo routes unchanged', () => {
    expect(tmdbService.buildBackdropUrl('/api/explorers/v1/media/back/content')).toBe('/api/explorers/v1/media/back/content');
    expect(tmdbService.buildLogoUrl('/api/explorers/v1/media/logo/content')).toBe('/api/explorers/v1/media/logo/content');
  });
});
