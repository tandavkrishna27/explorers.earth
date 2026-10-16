import {explorersApiClient} from '../../../lib/explorersApiClient';
import {GuidesClient, type GuideSectionDraft} from './guidesClient';
import {toCanonicalSectionBlocks} from './guidesViewModel';
import type {GuideCollectionDetails} from '../../../../../tunes/shared/explorersGuideContract';

// Ticket 5.3. Creating a guide.
//
// Strapi did this as one createGuide mutation with every field on it, then a separate
// createGuideSection per day, each needing the guide's internal numeric id fetched over
// REST first. Canonically a guide is a collection plus an aggregate, so creation is a
// collection create followed by writes against the guide it produced.
//
// That ordering is not an inconvenience to paper over. The collection is what makes the
// guide exist, be listed, be ordered and be archived; its details and sections are content
// written into it afterwards, at a revision that only exists once it does. A single
// "create everything" call would have to invent a revision for content that has no guide
// yet.
//
// What this means for a partial failure is stated plainly rather than hidden: if the
// collection is created and a later step fails, the guide exists as a draft with whatever
// was written before the failure. That is recoverable - the creator sees a draft guide and
// can finish it - and it is strictly better than the Strapi path, where a failed section
// create left a guide whose days were silently missing with no error surfaced per day.

const key = () => crypto.randomUUID();

/** Lowercase, hyphenated, and unique enough to not collide with the owner's other guides. */
export function guideSlug(title: string): string {
 const base = title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
 // The slug column requires ^[a-z0-9]+(-[a-z0-9]+)*$, so a title of only punctuation or
 // non-Latin script would produce an empty string and be refused.
 const stem = base.length > 0 ? base : 'guide';
 return `${stem}-${crypto.randomUUID().slice(0, 8)}`;
}

export type NewGuide = {
 title: string;
 description: string | null;
 details: GuideCollectionDetails;
 /** Each day or stop, in order. */
 sections: GuideSectionDraft[];
 cover: File | null;
};

export type CreatedGuide = {collectionId: string};

/**
 * Creates a guide and everything in it.
 *
 * Returns the collection id, which is the guide's id everywhere else in the app.
 */
export async function createGuide(input: NewGuide, signal?: AbortSignal): Promise<CreatedGuide> {
 const collection = await explorersApiClient.createMyCollection({
  category: 'guides', title: input.title, slug: guideSlug(input.title),
  ...(input.description === null ? {} : {description: input.description}),
 } as never, key(), signal);

 // Re-read rather than deriving a revision from the create response: the guide's revision
 // is the category content revision, which the create itself moved.
 let observation = await GuidesClient.observeWholeGuide(collection.id, signal);
 observation = await GuidesClient.writeDetails(GuidesClient.prepareIntent(observation), input.details, signal);

 for (const section of input.sections) {
  // Appended in order, each against the revision the previous write produced.
  observation = await GuidesClient.addSection(GuidesClient.prepareIntent(observation), section, undefined, signal);
 }

 if (input.cover) await GuidesClient.attachCover(GuidesClient.prepareIntent(observation), input.cover, signal);

 return {collectionId: collection.id};
}

/** A day or stop, from the shapes the create wizard holds in state. */
export function guideSectionDraft(input: {
 title: string; description: string | null;
 Timeline?: unknown; Transport?: unknown; Stay?: unknown;
 Recommendation_Activity?: unknown; Budget?: unknown; Map_Details?: unknown;
 Packing_List?: unknown; Pre_Tasks?: unknown; Section_tags?: unknown;
}): GuideSectionDraft {
 return {
  title: input.title,
  description: input.description,
  blocks: toCanonicalSectionBlocks(input as never),
 };
}
