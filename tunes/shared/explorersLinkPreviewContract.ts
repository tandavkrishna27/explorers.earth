import {z} from 'zod/v3';
const text=(max:number)=>z.string().trim().min(1).max(max).refine(v=>!/[\u0000-\u001f\u007f]/.test(v),'Invalid text');
/** Owner-pasted URL: http(s) only, no credentials, no explicit port. */
export const linkPreviewUrlSchema=z.string().max(2048).url().refine(v=>{try{const u=new URL(v);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&!u.port;}catch{return false;}},'Invalid URL');
export const linkPreviewRequestSchema=z.object({url:linkPreviewUrlSchema}).strict();
export const linkPreviewProductSchema=z.object({name:text(500).nullable(),brand:text(200).nullable(),price:z.string().regex(/^(?:0|[1-9][0-9]{0,13})(?:\.[0-9]{1,6})?$/).nullable(),currencyCode:z.string().regex(/^[A-Z]{3}$/).nullable()}).strict();
export const linkPreviewPersonSchema=z.object({name:text(500).nullable(),headline:text(500).nullable(),sameAs:z.array(linkPreviewUrlSchema).max(8)}).strict();
export const linkPreviewSchema=z.object({url:linkPreviewUrlSchema,title:text(500).nullable(),description:text(2000).nullable(),imageUrl:linkPreviewUrlSchema.nullable(),siteName:text(200).nullable(),product:linkPreviewProductSchema.nullable(),person:linkPreviewPersonSchema.nullable()}).strict();
export const linkPreviewImageRequestSchema=z.object({imageUrl:linkPreviewUrlSchema}).strict();
export type LinkPreview=z.infer<typeof linkPreviewSchema>;
