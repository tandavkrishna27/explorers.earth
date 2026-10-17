import {createContext, useContext, useMemo, type ReactNode} from 'react';
import {GuidesClient, type GuideObservation} from '../api/guidesClient';
import {setGuidePublished} from '../api/guideListWrites';
import type {CollectionObservation} from '../../../lib/explorersApiClient';
import {toCanonicalSectionBlocks, toGuideSection} from '../api/guidesViewModel';
import type {GuideCollectionDetails} from '../../../../../tunes/shared/explorersGuideContract';

// Ticket 5.3. What the six GuideDetails editors write through.
//
// Each of them used to build its own Apollo mutation, which meant each could compose a
// write against a revision it had never read, and four of them separately fetched the
// guide again just to see the blocks they were not editing. The page already has the whole
// aggregate at one revision, so this hands the editors three things and nothing else: the
// section they need to read, a save that takes complete block state, and a reload.
//
// The editors deliberately cannot see the observation or the revision. They describe what
// changed; the page decides what that means for the guide as a whole.

export type GuideSectionSave = {
 title: string;
 description: string | null;
 Timeline?: unknown; Transport?: unknown; Stay?: unknown;
 Recommendation_Activity?: unknown; Budget?: unknown;
 Map_Details?: unknown; Packing_List?: unknown; Pre_Tasks?: unknown; Section_tags?: unknown;
};

export type GuideEditing = {
 /** The section as the editors read it, in the legacy shape they already expect. */
 getSection: (sectionId: string) => ReturnType<typeof toGuideSection> | undefined;
 /**
  * Replaces one section's complete state.
  *
  * Complete, not partial: the caller sends every block, which is what the editors already
  * did when they saved through Strapi. A partial would let a block this editor does not
  * show arrive empty and erase what another editor wrote.
  */
 saveSection: (sectionId: string, save: GuideSectionSave) => Promise<void>;
 /**
  * Appends a section, or inserts it at a position.
  *
  * There is no guide id to supply. Strapi needed the guide's internal numeric id to build
  * the relation, which is why the form used to fetch it over REST before every create;
  * the section belongs to the guide this provider is for.
  */
 addSection: (save: GuideSectionSave, position?: number) => Promise<void>;
 /** Merges a change into the guide's own fields, sending the complete details object. */
 saveDetails: (patch: Partial<GuideCollectionDetails>) => Promise<void>;
 /**
  * Publishes or unpublishes the guide.
  *
  * This is a collection command, not an aggregate one - visibility is a field on the list,
  * which is what lets a guide be published by the same machinery as every other category.
  * Unpublishing also unpins, in the server's own transaction.
  */
 setPublished: (published: boolean) => Promise<void>;
 reload: () => void;
};

const context = createContext<GuideEditing | undefined>(undefined);

export function GuideEditingProvider({observation, list, reload, children}: {
 observation: GuideObservation | undefined;
 list: CollectionObservation | undefined;
 reload: () => void;
 children: ReactNode;
}) {
 const value = useMemo<GuideEditing>(() => {
  const require = () => {
   if (!observation) throw new Error('Guide could not be loaded. Refresh and try again.');
   return observation;
  };
  return {
   getSection: (sectionId) => {
    const section = observation?.aggregate.sections.find((candidate) => candidate.id === sectionId);
    return section ? toGuideSection(section) : undefined;
   },
   saveSection: async (sectionId, save) => {
    const current = require();
    const intent = GuidesClient.prepareIntent(current);
    const existing = current.aggregate.sections.find((candidate) => candidate.id === sectionId);
    if (!existing) throw new Error('That part of the guide is no longer there. Refresh and try again.');
    // Blocks the caller did not mention keep their current value rather than becoming
    // empty, so an editor that only knows about Stay cannot clear the Timeline.
    const mapped = toGuideSection(existing);
    await GuidesClient.writeSection(intent, sectionId, {
     title: save.title,
     description: save.description,
     blocks: toCanonicalSectionBlocks({
      Timeline: (save.Timeline ?? mapped.Timeline) as never,
      Transport: (save.Transport ?? mapped.Transport) as never,
      Stay: (save.Stay ?? mapped.Stay) as never,
      Recommendation_Activity: (save.Recommendation_Activity ?? mapped.Recommendation_Activity) as never,
      Budget: (save.Budget ?? mapped.Budget) as never,
      Map_Details: (save.Map_Details ?? mapped.Map_Details) as never,
      Packing_List: (save.Packing_List ?? mapped.Packing_List) as never,
      Pre_Tasks: (save.Pre_Tasks ?? mapped.Pre_Tasks) as never,
      Section_tags: (save.Section_tags ?? mapped.Section_tags) as never,
     }),
    });
    reload();
   },
   addSection: async (save, position) => {
    const current = require();
    const intent = GuidesClient.prepareIntent(current);
    await GuidesClient.addSection(intent, {
     title: save.title,
     description: save.description,
     // A new section starts from empty blocks, so anything the caller omits is genuinely
     // empty rather than inherited from a section that does not exist yet.
     blocks: toCanonicalSectionBlocks(save as never),
    }, position);
    reload();
   },
   saveDetails: async (patch) => {
    const current = require();
    const intent = GuidesClient.prepareIntent(current);
    await GuidesClient.writeDetails(intent, {...current.aggregate.details, ...patch});
    reload();
   },
   setPublished: async (published) => {
    if (!list) throw new Error('Guide could not be loaded. Refresh and try again.');
    await setGuidePublished(list, published);
    reload();
   },
   reload,
  };
 }, [observation, list, reload]);
 return <context.Provider value={value}>{children}</context.Provider>;
}

/**
 * The editing surface for the guide currently open.
 *
 * Throws outside the provider rather than returning undefined, because an editor that
 * silently cannot save is worse than one that fails to render.
 */
export function useGuideEditing(): GuideEditing {
 const value = useContext(context);
 if (!value) throw new Error('useGuideEditing must be used inside a GuideEditingProvider');
 return value;
}
