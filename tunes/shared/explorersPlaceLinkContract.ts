import {z} from 'zod/v3';
import {contentIdSchema} from './explorersContract';

// Ticket 5.2. A Products or People list may be linked to one of the owner's location
// lists, which is what the "Add People / Add Products to this location" flow creates.
//
// Three rules carry the weight, and each is enforced by storage rather than by a check in
// an application service:
//
//  - **One location parent per child list.** The link row is keyed by the child, so a
//    second parent cannot be written at all. Re-pointing is an explicit detach then
//    attach, never an implicit move, because a silent move loses where the list was.
//  - **Both sides belong to one account.** Both foreign keys carry account_id, so a
//    cross-account attachment is impossible rather than merely refused.
//  - **The parent is a location list, not a place.** The parent key includes the places
//    category, so a bare place recommendation id has nothing to reference.
//
// Public traversal is a separate matter: a linked child is served only when the account,
// the category, the parent list and the child list are each publicly eligible. A private
// child under a public parent is absent, not redacted.

const revision=z.number().int().positive().safe();

export const LINKABLE_CHILD_CATEGORIES=['products','people'] as const;
export const linkableChildCategorySchema=z.enum(LINKABLE_CHILD_CATEGORIES);
export type LinkableChildCategory=z.infer<typeof linkableChildCategorySchema>;

/**
 * Attach is addressed by the child, because the child is what has at most one parent.
 * Both revisions travel so a stale view cannot link the wrong pair.
 */
export const attachLocationLinkSchema=z.object({
 childCollectionId:contentIdSchema,
 expectedChildRevision:revision,
 locationCollectionId:contentIdSchema,
 expectedLocationRevision:revision,
}).strict();
export const detachLocationLinkSchema=z.object({
 childCollectionId:contentIdSchema,
 expectedChildRevision:revision,
}).strict();

export const locationLinkDtoSchema=z.object({
 childCollectionId:contentIdSchema,
 childCategory:linkableChildCategorySchema,
 locationCollectionId:contentIdSchema,
}).strict();

export type AttachLocationLinkInput=z.infer<typeof attachLocationLinkSchema>;
export type DetachLocationLinkInput=z.infer<typeof detachLocationLinkSchema>;
export type LocationLinkDto=z.infer<typeof locationLinkDtoSchema>;

/**
 * The child lists a location serves, in the shape the location page already reads:
 * `person_lists` / `product_lists`, each with its own items.
 *
 * The children are the lists themselves, so nothing here is a copy of them - a linked
 * list stays one list, reachable both through its location and on its own.
 */
export const linkedChildListSchema=z.object({
 documentId:contentIdSchema,
 List_Name:z.string(),
 slug:z.string(),
 Visibility:z.boolean(),
 display_order:z.number().int().nonnegative(),
}).passthrough();
export type LinkedChildList=z.infer<typeof linkedChildListSchema>;
