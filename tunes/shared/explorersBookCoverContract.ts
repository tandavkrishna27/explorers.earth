import {z} from 'zod/v3';
export const bookCoverMediaSchema=z.object({id:z.string().uuid(),url:z.string().regex(/^\/api\/explorers\/v1\/media\/[0-9a-f-]{36}\/content$/),mimeType:z.enum(['image/png','image/jpeg','image/webp','image/gif']),size:z.number().int().min(1).max(5242880),alternativeText:z.string().nullable(),caption:z.string().nullable()}).strict().refine(v=>v.url===`/api/explorers/v1/media/${v.id}/content`);
export const bookCoversSchema=z.object({cover:bookCoverMediaSchema.nullable(),thumbnail:bookCoverMediaSchema.nullable()}).strict();
export const importBookCoversSchema=z.object({expectedRevision:z.number().int().positive().safe()}).strict();
const slot=z.discriminatedUnion('status',[z.object({status:z.literal('copied'),media:bookCoverMediaSchema}).strict(),z.object({status:z.literal('fallback')}).strict()]);
export const bookCoverImportResultSchema=z.object({id:z.string().uuid(),revision:z.number().int().positive().safe(),slots:z.object({cover:slot,thumbnail:slot}).strict()}).strict();
export type BookCovers=z.infer<typeof bookCoversSchema>;
