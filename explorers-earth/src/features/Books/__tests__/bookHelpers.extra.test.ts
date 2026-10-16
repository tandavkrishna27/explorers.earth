import { describe, it, expect } from 'vitest';
import { formatAuthors, formatPageCount, formatRating, deduplicateBooks } from '../utils/bookHelpers';

describe('bookHelpers extra cases', () => {
  it('should format authors list edge cases', () => {
    expect(formatAuthors([])).toBe('Unknown Author');
    expect(formatAuthors(undefined)).toBe('Unknown Author');
    expect(formatAuthors(['Martin Fowler'])).toBe('Martin Fowler');
    expect(formatAuthors(['Martin Fowler', 'Kent Beck'])).toBe('Martin Fowler & Kent Beck');
  });

  it('should format page counts safely', () => {
    expect(formatPageCount(undefined)).toBe('');
    expect(formatPageCount(null)).toBe('');
    expect(formatPageCount(100)).toBe('100 pages');
  });

  it('should format rating values', () => {
    expect(formatRating(undefined)).toBe('');
    expect(formatRating(null)).toBe('');
    expect(formatRating(4.5)).toBe('9.0');
  });

  it('should deduplicate books correctly', () => {
    const list = [
      { documentId: '1', volume_id: 'vol-1', is_pinned: false },
      { documentId: '1', volume_id: 'vol-1', is_pinned: true }
    ];
    const res = deduplicateBooks(list as any);
    expect(res.length).toBe(1);
    expect(res[0].is_pinned).toBe(true);
  });
});
