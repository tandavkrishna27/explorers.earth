import {explorersApiClient, type CollectionObservation} from '../../../lib/explorersApiClient';
import {buildListPublicUrl} from '../../../utils/listShareUrls';
import type {ListPageAdapter} from '../../shared/list/listPageAdapter';
import {archiveGuide, setGuidePublished} from '../api/guideListWrites';
import {invalidateGuides} from '../hooks/useGuidesOwner';

type GuideRow = {documentId: string; Title: string; Description?: string; slug?: string; Visibility?: boolean};

/**
 * The WP3B Share and Manage tabs, fed from a guide. A guide's title, slug, visibility and archive
 * are collection fields, so they go through the same collection commands every list uses.
 */
export function guideListAdapter(input: {guide: GuideRow; list: CollectionObservation | undefined; dayCount: number; username: string | null | undefined; refresh: () => void;
 /** The plan holds its own guide copy; a collection write moves the guide's revision, so the page re-reads it into the plan. */
 onWritten?: () => void}): ListPageAdapter {
 const {guide, list, dayCount, username, refresh, onWritten} = input;
 const observed = () => {
  if (!list) throw new Error('Guide could not be loaded. Refresh and try again.');
  return list;
 };
 const done = () => {invalidateGuides(); refresh(); onWritten?.();};
 const slug = guide.slug ?? '';
 return {
  // ListPageAdapter's category union predates Guides; the tabs only use it for paths and the QR tagline.
  category: 'guides' as never,
  categoryLabel: 'Guides',
  itemNoun: 'day',
  loading: false,
  error: null,
  retry: refresh,
  list: {
   id: guide.documentId, title: guide.Title, description: guide.Description ?? null, slug, coverUrl: null,
   status: guide.Visibility ? 'public' : 'draft', itemCount: dayCount,
   publicUrl: buildListPublicUrl(username, 'guides' as never, slug),
  },
  items: [],
  addPath: `/recommendations/guides/${guide.documentId}`,
  editPath: () => `/recommendations/guides/${guide.documentId}`,
  setStatus: async (status) => {await setGuidePublished(observed(), status === 'public'); done();},
  reorder: async () => {},
  togglePin: async () => {},
  removeItem: async () => {},
  rename: async ({title, description, slug: nextSlug}) => {
   await explorersApiClient.updateMyCollection(observed(), {
    ...(title === undefined ? {} : {title}),
    ...(description === undefined ? {} : {description: description ?? ''}),
    ...(nextSlug === undefined ? {} : {slug: nextSlug}),
   } as never, crypto.randomUUID());
   done();
  },
  archive: async () => {await archiveGuide(observed()); done();},
  purge: async () => {await explorersApiClient.purgeMyCollection(observed(), crypto.randomUUID()); done();},
 };
}
