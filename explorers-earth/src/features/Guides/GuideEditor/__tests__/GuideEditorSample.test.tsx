import {cleanup, render, screen} from '@testing-library/react';
import {MemoryRouter, Route, Routes} from 'react-router-dom';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {guideEmptySectionBlocks} from '../../../../../../tunes/shared/explorersGuideContract';
// Real English strings (the sample components pass a string default, which the WP9 i18nMock does not read).
vi.mock('react-i18next', async (importOriginal) => {
 const real = await importOriginal<typeof import('react-i18next')>();
 const {englishTranslation} = await import('../../../shared/samples/__tests__/englishTranslationMock');
 return {...real, useTranslation: englishTranslation};
});
vi.mock('sonner', () => ({toast: {success: vi.fn(), error: vi.fn()}}));
const note = (localId: string, text: string) => ({kind: 'note', localId, timeLabel: null, text});
const section = (id: string, n: number) => ({id, collectionId: 'g1', title: '', description: null, displayOrder: n,
 blocks: {...guideEmptySectionBlocks, items: [note(`${id}-a`, 'Beach walk'), note(`${id}-b`, 'Fish thali')]},
 archived: false, createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString()});
const owner = vi.hoisted(() => ({isSample: true}));
vi.mock('../../hooks/useGuidesOwner', () => ({invalidateGuides: vi.fn(), useGuidesOwner: () => ({loading: false, error: undefined, refresh: vi.fn(),
 guide: {documentId: 'g1', Title: '3 days in Goa', Visibility: false, ...(owner.isSample ? {isSample: true} : {})},
 observation: {accountId: 'a1', generation: 1, observedAt: 0, collectionId: 'g1', revision: 4,
  aggregate: {collectionId: 'g1', revision: 4, details: {numberOfDays: 2, startDate: null, place: {name: 'Goa'}, tipsNotes: null}, sections: [section('d1', 0), section('d2', 1)], sectionCount: 2, nextCursor: null, coverMediaId: null}}})}));
vi.mock('../../../../components/controls/PublishPill', () => ({default: ({value, disabled, disabledReason}: {value: string; disabled?: boolean; disabledReason?: string}) =>
 <><button type="button" aria-disabled={disabled || undefined}>{`Status: ${value}`}</button>{disabled && <span>{disabledReason}</span>}</>}));
vi.mock('../../../../components/controls/BottomAddButton', () => ({default: ({label, onClick, hidden}: {label: string; onClick: () => void; hidden?: boolean}) => hidden ? null : <button type="button" onClick={onClick}>{label}</button>}));
vi.mock('../../../shared/list/ShareTab', () => ({default: () => <div>share-tab</div>}));
vi.mock('../../../shared/list/ManageTab', () => ({default: () => <div>manage-tab</div>}));
vi.mock('../MyListsPanel', () => ({default: () => <aside>panel</aside>}));
import GuideEditorPage from '../GuideEditorPage';
afterEach(cleanup);
Element.prototype.scrollIntoView = vi.fn();
const at = () => render(<MemoryRouter initialEntries={['/recommendations/guides/g1']}><Routes><Route path="/recommendations/guides/:guideId" element={<GuideEditorPage />} /></Routes></MemoryRouter>);

describe('a sample guide (WP11, mocks v3)', () => {
 it('shows the badge row above the title, the sample bar and a disabled publish control with the reason', () => {
  owner.isSample = true;
  at();
  const badge = screen.getByText('Sample');
  const title = screen.getByRole('heading', {level: 1, name: '3 days in Goa'});
  expect(badge.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.getByText(/A sample to show how a list works/)).toBeTruthy();
  expect(screen.getByRole('button', {name: 'Status: draft'})).toHaveAttribute('aria-disabled', 'true');
  expect(screen.getByText("Samples can't be published. Make it mine to edit and publish it.")).toBeTruthy();
  expect(screen.getByRole('button', {name: 'Make it mine'})).toBeTruthy();
  expect(screen.getByRole('button', {name: 'Delete sample'})).toBeTruthy();
 });

 it('hides sharing, every Add and the day and item menus; reorder stays', () => {
  owner.isSample = true;
  at();
  expect(screen.queryByText('share-tab')).toBeNull();
  expect(screen.queryByRole('button', {name: /Add/})).toBeNull();
  expect(screen.queryByRole('button', {name: /\+ Day/})).toBeNull();
  expect(screen.queryByRole('button', {name: 'My lists'})).toBeNull();
  expect(screen.queryByRole('button', {name: /options$/})).toBeNull();
  expect(screen.queryByRole('button', {name: /^Actions for/})).toBeNull();
  expect(screen.getAllByRole('button', {name: /^Reorder /}).length).toBe(4);
 });

 it('an ordinary guide keeps sharing, Add and menus and has no sample bar', () => {
  owner.isSample = false;
  at();
  expect(screen.queryByText('Sample')).toBeNull();
  expect(screen.getByText('share-tab')).toBeTruthy();
  expect(screen.getAllByRole('button', {name: /options$/}).length).toBe(2);
  expect(screen.getAllByRole('button', {name: /^Actions for/}).length).toBe(4);
  expect(screen.getAllByRole('button', {name: /Add/}).length).toBeGreaterThan(0);
 });
});
