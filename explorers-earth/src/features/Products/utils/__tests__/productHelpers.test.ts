import { describe, it, expect } from 'vitest';
import {
  generateSlug,
  categoryToSlug,
  slugToCategoryName,
  formatRating,
  extractNoteText,
  deduplicateProducts,
  buildImageUrl,
  extractUniqueCategories,
} from '../productHelpers';

describe('productHelpers unit tests', () => {
  it('should generate valid slug from product name', () => {
    expect(generateSlug('Awesome Product! Special Edition')).toBe('awesome-product-special-edition');
  });

  it('should map category names to slugs and back', () => {
    expect(categoryToSlug('Home & Kitchen')).toBe('home-kitchen');
    expect(slugToCategoryName('home-kitchen')).toBe('Home Kitchen');
  });

  it('should format rating string', () => {
    expect(formatRating(8)).toBe('8');
    expect(formatRating(undefined)).toBe('');
  });

  it('should parse note text from string', () => {
    expect(extractNoteText('Direct note string')).toBe('Direct note string');
  });

  it('should deduplicate product suggestions prioritizing pinned ones', () => {
    const items = [
      { documentId: '1', product_url: 'http://a.com', is_pinned: false },
      { documentId: '2', product_url: 'http://a.com', is_pinned: true }
    ];
    const res = deduplicateProducts(items as any);
    expect(res.length).toBe(1);
    expect(res[0].is_pinned).toBe(true);
  });

  it('should append media URLs correctly', () => {
    expect(buildImageUrl('/uploads/a.png')).toContain('/uploads/a.png');
    expect(buildImageUrl('https://ext.com/img.png')).toBe('https://ext.com/img.png');
  });

  // Additional 3+ tests to satisfy min 10 requirement:
  it('should return empty string if buildImageUrl is null or undefined', () => {
    expect(buildImageUrl(null)).toBe('');
    expect(buildImageUrl(undefined)).toBe('');
  });

  it('should return empty array for deduplicateProducts on empty/null arrays', () => {
    expect(deduplicateProducts(null)).toEqual([]);
    expect(deduplicateProducts(undefined)).toEqual([]);
  });

  it('should extract unique categories and sort them by name', () => {
    const catArrays = [
      [
        { name: 'Kitchen', slug: 'kitchen' },
        { name: 'Electronics', slug: 'electronics' }
      ],
      [
        { name: 'Kitchen', slug: 'kitchen' }, // duplicate
        { name: 'Clothing', slug: 'clothing' }
      ]
    ];
    const res = extractUniqueCategories(catArrays);
    expect(res).toHaveLength(3);
    // Sorted alphabetically by name: Clothing, Electronics, Kitchen
    expect(res[0].name).toBe('Clothing');
    expect(res[1].name).toBe('Electronics');
    expect(res[2].name).toBe('Kitchen');
  });

  it('should parse complex Tiptap rich text block array in extractNoteText', () => {
    const richText = [
      {
        type: 'paragraph',
        children: [{ text: 'First paragraph text.' }]
      },
      {
        type: 'paragraph',
        children: [{ text: 'Second paragraph text.' }]
      }
    ];
    expect(extractNoteText(richText)).toBe("First paragraph text.\nSecond paragraph text.");
  });
});
