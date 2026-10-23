import {z} from 'zod/v3';
import {contentIdSchema} from './explorersContract';

// LNK-01..09. Any of the owner's lists may link to any other of their lists, one level deep,
// with an optional role ("Packing list"). Storage (0070) enforces own-lists-only through two
// composite FKs carrying account_id, no self link, and one link per unordered pair. "One
// level deep" is a read rule: a linked list shows as a card and its own links are never followed.
export const LIST_LINK_LIMIT=100;
export const LIST_LINK_ROLE_MAX=80;
export const LIST_LINK_ROLE_SUGGESTIONS=['Places to choose from','Packing list','Reading list','Watch list'] as const;
const revision=z.number().int().positive().safe();
export const listLinkCategorySchema=z.enum(['places','guides','movies','books','games','apps','products','people']);
export const listLinkRoleSchema=z.string().transform(v=>v.trim()).pipe(z.string().max(LIST_LINK_ROLE_MAX))
 .transform(v=>v.length===0?null:v).nullable();
export const attachListLinkSchema=z.object({
 hostCollectionId:contentIdSchema,expectedHostRevision:revision,
 linkedCollectionId:contentIdSchema,expectedLinkedRevision:revision,
 role:listLinkRoleSchema.default(null),position:z.number().int().min(0).max(LIST_LINK_LIMIT-1).optional(),
}).strict().refine(v=>v.hostCollectionId!==v.linkedCollectionId,{message:'A list cannot link to itself',path:['linkedCollectionId']});
export const detachListLinkSchema=z.object({linkId:contentIdSchema,expectedHostRevision:revision}).strict();
export const setListLinkRoleSchema=z.object({linkId:contentIdSchema,expectedHostRevision:revision,role:listLinkRoleSchema}).strict();
export const reorderListLinksSchema=z.object({hostCollectionId:contentIdSchema,expectedHostRevision:revision,
 linkIds:z.array(contentIdSchema).min(1).max(LIST_LINK_LIMIT)}).strict()
 .refine(v=>new Set(v.linkIds).size===v.linkIds.length,{message:'Duplicate link',path:['linkIds']});
export const listLinkDtoSchema=z.object({
 id:contentIdSchema,hostCollectionId:contentIdSchema,hostCategory:listLinkCategorySchema,
 linkedCollectionId:contentIdSchema,linkedCategory:listLinkCategorySchema,
 role:z.string().min(1).max(LIST_LINK_ROLE_MAX).nullable(),displayOrder:z.number().int().min(0).max(LIST_LINK_LIMIT-1),
 createdAt:z.string().datetime(),
}).strict();
export const linkedListCardSchema=z.object({
 linkId:contentIdSchema,direction:z.enum(['outgoing','incoming']),
 role:z.string().min(1).max(LIST_LINK_ROLE_MAX).nullable(),displayOrder:z.number().int().nonnegative(),
 collection:z.object({id:contentIdSchema,category:listLinkCategorySchema,title:z.string().min(1).max(200),slug:z.string().min(1).max(200),
  visibility:z.enum(['private','public']),publicationState:z.enum(['draft','published']),archived:z.boolean(),
  coverMediaId:contentIdSchema.nullable()}).strict(),
}).strict();
export type ListLinkCategory=z.infer<typeof listLinkCategorySchema>;
export type AttachListLinkInput=z.input<typeof attachListLinkSchema>;
export type DetachListLinkInput=z.input<typeof detachListLinkSchema>;
export type SetListLinkRoleInput=z.input<typeof setListLinkRoleSchema>;
export type ReorderListLinksInput=z.input<typeof reorderListLinksSchema>;
export type ListLinkDto=z.infer<typeof listLinkDtoSchema>;
export type LinkedListCard=z.infer<typeof linkedListCardSchema>;
