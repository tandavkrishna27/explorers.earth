import {explorersApiClient, type CollectionObservation} from '../../../lib/explorersApiClient';

// Ticket 5.3. The guide-as-list operations: publish, pin, reorder and archive.
//
// These are deliberately NOT guide-aggregate commands. A guide's title, visibility,
// publication state, display order and pin are fields on the collection, so they go
// through the same collection commands every category uses - which is what makes a guide
// pinnable, orderable, publishable and archivable by machinery that already exists and is
// already tested. Only the guide's own fields and its sections go through the aggregate.
//
// Each takes the branded editable collection observation, because that is what carries the
// revision a write is composed against. The adapter already has them in `content.lists`.

const key = () => crypto.randomUUID();

/**
 * Publishes or unpublishes a guide.
 *
 * It does NOT clear the pin, even though unpublishing must unpin. The server does that in
 * the same transaction, and that is the point: the rule used to live here, in UI code that
 * built `{is_pinned:false, pin_order:null}` alongside the visibility change, where any
 * other caller - a second screen, a future API client - would simply not have done it.
 */
export async function setGuidePublished(list: CollectionObservation, published: boolean, signal?: AbortSignal) {
 return explorersApiClient.updateMyCollection(list, {
  visibility: published ? 'public' : 'private',
  publicationState: published ? 'published' : 'draft',
 }, key(), signal);
}

/**
 * Pins a guide at a position, or unpins it with null.
 *
 * A pin on an unpublished or private guide is refused by the server with 422 rather than
 * stored, so the caller surfaces that refusal instead of pre-checking and racing it.
 */
export async function setGuidePin(list: CollectionObservation, pinOrder: number | null, signal?: AbortSignal) {
 return explorersApiClient.updateMyCollection(list, {pinOrder}, key(), signal);
}

/** Where the guide sits among the owner's guides, which is separate from whether it is pinned. */
export async function setGuideDisplayOrder(list: CollectionObservation, displayOrder: number, signal?: AbortSignal) {
 return explorersApiClient.updateMyCollection(list, {displayOrder}, key(), signal);
}

export async function renameGuide(list: CollectionObservation, title: string, signal?: AbortSignal) {
 return explorersApiClient.updateMyCollection(list, {title}, key(), signal);
}

/**
 * Archives a guide.
 *
 * Archive, not delete: the sections, the guide's fields and its media all stay, and the
 * guide leaves every active listing. That is the same semantics every other category's
 * list delete has, and it is why a mistaken delete is recoverable.
 */
export async function archiveGuide(list: CollectionObservation, signal?: AbortSignal) {
 return explorersApiClient.archiveMyCollection(list, key(), signal);
}
