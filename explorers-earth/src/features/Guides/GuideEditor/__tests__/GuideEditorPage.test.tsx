import {cleanup, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {MemoryRouter, Route, Routes} from 'react-router-dom';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {guideEmptySectionBlocks} from '../../../../../../tunes/shared/explorersGuideContract';
vi.mock('react-i18next', async () => (await import('./i18nMock')).i18nMock);
vi.mock('sonner', () => ({toast: {success: vi.fn(), error: vi.fn()}}));
const section = (id: string, n: number) => ({id, collectionId: 'g1', title: '', description: null, displayOrder: n, blocks: guideEmptySectionBlocks,
 archived: false, createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString()});
// useGuidePlan holds the branded GuideObservation, so the owner hook's observation carries the aggregate.
vi.mock('../../hooks/useGuidesOwner', () => ({invalidateGuides: vi.fn(), useGuidesOwner: () => ({loading: false, error: undefined, refresh: vi.fn(),
 guide: {documentId: 'g1', Title: 'Goa in two days', Visibility: false},
 observation: {accountId: 'a1', generation: 1, observedAt: 0, collectionId: 'g1', revision: 4,
  aggregate: {collectionId: 'g1', revision: 4, details: {numberOfDays: 2, startDate: null, place: {name: 'Goa'}, tipsNotes: null}, sections: [section('d1', 0), section('d2', 1)], sectionCount: 2, nextCursor: null, coverMediaId: null}}})}));
vi.mock('../../../../components/controls/PublishPill', () => ({default: ({value}: {value: string}) => <button type="button">{`Status: ${value}`}</button>}));
vi.mock('../../../../components/controls/BottomAddButton', () => ({default: ({label, onClick}: {label: string; onClick: () => void}) => <button type="button" onClick={onClick}>{label}</button>}));
vi.mock('../../../shared/list/ShareTab', () => ({default: () => <div>share-tab</div>}));
vi.mock('../../../shared/list/ManageTab', () => ({default: () => <div>manage-tab</div>}));
vi.mock('../MyListsPanel', () => ({default: () => <aside>panel</aside>}));
import GuideEditorPage from '../GuideEditorPage';
afterEach(cleanup);
// jsdom has no scrollIntoView; DayStrip jumps to the selected day with it.
Element.prototype.scrollIntoView = vi.fn();
const at = (path: string) => render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/recommendations/guides/:guideId" element={<GuideEditorPage />} /></Routes></MemoryRouter>);
describe('GuideEditorPage', () => {
 it('shows the header, Plan | Share | Manage and the draft pill; tabs do not remount the plan', async () => {
  at('/recommendations/guides/g1');
  expect(screen.getByRole('heading', {level: 1, name: 'Goa in two days'})).toBeTruthy();
  expect(screen.getByText('Goa · 2 days')).toBeTruthy();
  expect(screen.getByRole('button', {name: 'Status: draft'})).toBeTruthy();
  await userEvent.click(screen.getByRole('tab', {name: 'Share'}));
  expect(screen.getByText('share-tab')).toBeVisible();
  await userEvent.click(screen.getByRole('tab', {name: 'Plan'}));
  expect(screen.getByRole('region', {name: 'Day 1'})).toBeVisible();
 });
 it('phone bottom button opens the add box for the selected day', async () => {
  at('/recommendations/guides/g1');
  await userEvent.click(screen.getByRole('tab', {name: 'Day 2'}));
  // DayList's own per-day add shares the label; the phone bottom button renders last.
  await userEvent.click(screen.getAllByRole('button', {name: '+ Add to Day 2'}).at(-1)!);
  expect(screen.getByRole('combobox', {name: 'Add to Day 2'})).toBeTruthy();
 });
});
