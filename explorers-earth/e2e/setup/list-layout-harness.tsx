import { useParams, useSearchParams } from 'react-router-dom';
import ListPage from '../../src/features/shared/list/ListPage';
import type { ListPageAdapter } from '../../src/features/shared/list/listPageAdapter';

// Stands in for the People list route in the dashboard-layout fixture only: the real shared
// ListPage with populated rows (the contained fixture serves only empty lists). Long unbroken
// text is the worst case for a phone row; `?sample=1` renders the WP11 sample variant.
const long = 'Supercalifragilisticexpialidocious-and-a-very-long-unbroken-person-name';
export default function ListLayoutHarness() {
  const { listId = 'layout-list' } = useParams();
  const [params] = useSearchParams();
  const done = async () => {};
  const adapter: ListPageAdapter = {
    category: 'people', categoryLabel: 'People', itemNoun: 'person', loading: false, error: null, retry: () => {},
    list: { id: listId, title: `Owned People ${long}`, description: null, slug: 'owned-people', coverUrl: null, status: 'public', itemCount: 3, publicUrl: `${window.location.origin}/fixture-owner/people/owned-people`, isSample: params.get('sample') === '1' },
    items: [
      { id: 'p1', title: `Owned People recommendation ${long}`, subtitle: 'Creator · Designer · Writer · Speaker', note: `A note ${long}`, imageUrl: null, rating: 8, pinned: true },
      { id: 'p2', title: 'Short name', subtitle: 'Artist', imageUrl: null, pinned: false },
      { id: 'p3', title: long, imageUrl: null, pinned: false },
    ],
    addPath: `/recommendations/people/${listId}/add`, editPath: (id) => `/recommendations/people/${listId}/edit/${id}`,
    setStatus: done, reorder: done, togglePin: done, removeItem: done, rename: done, archive: done, purge: done,
  };
  return <ListPage adapter={adapter} />;
}
