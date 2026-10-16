import { describe, it, expect } from 'vitest';
import {
  generateSlug,
  categoryToSlug,
  slugToCategoryName,
  getPlatformColor,
  getPriceTierColor,
  formatRating,
  deduplicateApps,
  buildLogoUrl,
  extractUniqueCategories,
  extractNoteText,
} from '../appHelpers';

describe('appHelpers unit tests', () => {
  it('should format app titles into clean slugs', () => {
    expect(generateSlug('Obsidian - Notes App')).toBe('obsidian-notes-app');
  });

  it('should convert app category formatting', () => {
    expect(categoryToSlug('Developer Tools')).toBe('developer-tools');
    expect(slugToCategoryName('developer-tools')).toBe('Developer Tools');
  });

  it('should get badge colors for platforms and price tiers', () => {
    expect(getPlatformColor('iOS')).toContain('bg-gray-600/30');
    expect(getPlatformColor('android')).toContain('bg-green-700/30');
    expect(getPriceTierColor('Free')).toContain('bg-emerald-500/20');
  });

  it('should format ratings safely', () => {
    expect(formatRating(8)).toBe('8');
    expect(formatRating(null)).toBe('');
  });

  it('should deduplicate and merge overlapping app listings', () => {
    const apps = [
      { documentId: 'a', app_url: 'http://app.com', user_rating: 9, is_pinned: false },
      { documentId: 'b', app_url: 'http://app.com', user_rating: null, is_pinned: true }
    ];
    const result = deduplicateApps(apps);
    expect(result.length).toBe(1);
    expect(result[0].is_pinned).toBe(true);
    expect(result[0].user_rating).toBe(9);
  });

  it('should construct valid logo icon URLs', () => {
    expect(buildLogoUrl('/icons/a.png')).toContain('/icons/a.png');
    expect(buildLogoUrl('https://img.com/a.png')).toBe('https://img.com/a.png');
  });

  // Additional 3+ tests to satisfy min 10 requirement:
  it('should get fallback colors for unknown platforms and price tiers', () => {
    expect(getPlatformColor('unknown-platform')).toBe('bg-white/10 text-white/60');
    expect(getPriceTierColor('Unknown-Tier')).toBe('bg-white/10 text-white/50');
  });

  it('should extract unique categories and sort them by name', () => {
    const catArrays = [
      [
        { name: 'Utilities', slug: 'utilities' },
        { name: 'Design', slug: 'design' }
      ],
      [
        { name: 'Utilities', slug: 'utilities' }, // duplicate
        { name: 'Developer Tools', slug: 'developer-tools' }
      ]
    ];
    const res = extractUniqueCategories(catArrays);
    expect(res).toHaveLength(3);
    // Alphabetical order: Design, Developer Tools, Utilities
    expect(res[0].name).toBe('Design');
    expect(res[1].name).toBe('Developer Tools');
    expect(res[2].name).toBe('Utilities');
  });

  it('should parse complex Tiptap rich text block array in extractNoteText', () => {
    const richText = [
      {
        type: 'paragraph',
        children: [{ text: 'First line.' }]
      },
      {
        type: 'paragraph',
        children: [{ text: 'Second line.' }]
      }
    ];
    expect(extractNoteText(richText)).toBe("First line.\nSecond line.");
    expect(extractNoteText(null)).toBe("");
  });
});
