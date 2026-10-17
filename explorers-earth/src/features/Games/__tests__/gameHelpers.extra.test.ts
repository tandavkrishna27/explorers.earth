import { describe, it, expect } from 'vitest';
import { buildCoverUrl, deduplicateGames } from '../utils/gameHelpers';

describe('gameHelpers extra cases', () => {
  it('should build cover URLs from various inputs', () => {
    expect(buildCoverUrl(null)).toBe('');
    expect(buildCoverUrl('')).toBe('');
    expect(buildCoverUrl('https://images.igdb.com/co123.jpg')).toBe('https://images.igdb.com/co123.jpg');
    expect(buildCoverUrl('/uploads/cover.png')).toContain('/uploads/cover.png');
  });

  it('preserves distinct native recommendation identities sharing igdb_id', () => {
    const list = [
      { documentId: '1', igdb_id: 12345, is_pinned: false },
      { documentId: '2', igdb_id: 12345, is_pinned: true }
    ];
    const res = deduplicateGames(list as any);
    expect(res.length).toBe(2);
    expect(res.map(row=>row.documentId)).toEqual(['1','2']);
    expect(res[1].is_pinned).toBe(true);
  });
});
