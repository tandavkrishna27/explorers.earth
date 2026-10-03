import { describe, expect, it } from 'vitest';
import Quill from 'quill';
import 'quill2-emoji';
import { createRecommendationSchema } from '../../../../tunes/shared/explorersContract';
import actualQuill from '../../../../tunes/shared/test-fixtures/quill-note-v1.json';
import { sanitizePublicRichText } from '../../features/PublicHome/utils/publicProfileContent';

// Removing the accepted rich-note producer field or flattening authoring HTML
// must fail this test. Exercise the installed editor's formats and emoji blot.
describe('shared note authoring contract', () => {
  it('keeps supported color on the actual bold element at the public renderer boundary',()=>{
    const host=document.createElement('div');host.innerHTML=sanitizePublicRichText(actualQuill.html);
    expect(host.querySelector('h2 strong')?.getAttribute('style')).toContain('color: rgb(230, 0, 0)');
    expect(host.textContent).toContain('😀');
  });
  it('accepts actual Quill HTML without dropping editor metadata or Unicode', () => {
    const host = document.createElement('div'); document.body.append(host);
    try {
      const editor = new Quill(host, { modules: { toolbar: false }, formats: ['header','bold','italic','underline','strike','color','background','list','emoji'] });
      editor.setContents([
        { insert: 'हैलो café', attributes: { bold: true, italic: true, underline: true, strike: true, color: '#e60000', background: '#ffff00' } },
        { insert: '\n', attributes: { header: 2 } },
        { insert: { emoji: 'grinning' } }, { insert: '\n' },
        { insert: 'First' }, { insert: '\n', attributes: { list: 'ordered' } },
        { insert: 'Second' }, { insert: '\n', attributes: { list: 'bullet' } },
      ] as any);
      const html = editor.root.innerHTML;
      expect(html).toContain('data-name="grinning"');
      expect(html).toContain('data-list="bullet"');
      const input = { category: 'books', entityId: '00000000-0000-4000-8000-000000000001', collectionId: '00000000-0000-4000-8000-000000000002', expectedCollectionRevision: 1, note: { version: 1, format: 'quill-html', html } };
      const parsed = createRecommendationSchema.safeParse(input);
      expect(parsed.success).toBe(true);
      if (parsed.success) expect((parsed.data as any).note.html).toBe(html);
    } finally { host.remove(); }
  });
});
