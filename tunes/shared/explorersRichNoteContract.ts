import { z } from 'zod/v3';

export const RICH_NOTE_BYTES = 256 * 1024;
export const richNoteSchema = z.object({version:z.literal(1),format:z.literal('quill-html'),html:z.string()
  .refine(html=>new TextEncoder().encode(html).byteLength<=RICH_NOTE_BYTES,'Rich note exceeds byte limit')}).strict();
export type RichNote = z.infer<typeof richNoteSchema>;
/** Authoring adapter; structural validation and empty-document normalization run on the server. */
export function richNoteFromEditor(html:string|null|undefined):RichNote|null {
  return html==null||html===''?null:richNoteSchema.parse({version:1,format:'quill-html',html});
}
