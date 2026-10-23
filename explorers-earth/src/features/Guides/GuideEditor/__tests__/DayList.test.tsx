import {cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, describe, expect, it, vi} from 'vitest';
vi.mock('react-i18next', async () => (await import('./i18nMock')).i18nMock);
import DayList from '../DayList';
import DayStrip from '../DayStrip';
import {guideEmptySectionBlocks, type GuideDayItem} from '../../../../../../tunes/shared/explorersGuideContract';
afterEach(cleanup);
const note = (localId: string, timeLabel: GuideDayItem['timeLabel'] = null): GuideDayItem => ({kind: 'note', localId, timeLabel, text: `Note ${localId}`});
const day = (id: string, items: GuideDayItem[]) => ({id, title: '', items, blocks: {...guideEmptySectionBlocks, items}});
const days = [day('d1', [note('a'), note('b'), note('c')]), day('d2', [note('x', 'morning')])];
const actions = () => ({onMoveItem: vi.fn(), onSetTimeLabel: vi.fn(), onRemoveItem: vi.fn(), onEditNote: vi.fn(), onOpenAdd: vi.fn(),
 onInsertDay: vi.fn(), onDuplicateDay: vi.fn(), onClearDay: vi.fn(), onDeleteDay: vi.fn(), onMoveDay: vi.fn()});

describe('DayList', () => {
 it('numbers an unlabelled day and heads a labelled one', () => {
  render(<DayList days={days} startDate={null} {...actions()} />);
  const first = screen.getByRole('region', {name: 'Day 1'});
  expect(within(first).getAllByRole('listitem').map((li) => li.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('Note a')]));
  expect(within(first).queryByRole('heading', {level: 4})).toBeNull();
  expect(within(screen.getByRole('region', {name: 'Day 2'})).getByRole('heading', {level: 4, name: 'Morning'})).toBeTruthy();
 });
 it('moves an item to another day from its menu (GD-27 phone/keyboard path)', async () => {
  const a = actions();
  render(<DayList days={days} startDate={null} {...a} />);
  await userEvent.click(screen.getByRole('button', {name: 'Actions for Note b'}));
  await userEvent.click(screen.getByRole('menuitem', {name: 'Move to day…'}));
  await userEvent.click(screen.getByRole('menuitem', {name: 'Day 2'}));
  expect(a.onMoveItem).toHaveBeenCalledWith('d1', 'b', 'd2', 1, {fromIndex: 1});
 });
 it('reorders with Space, arrows and Space (GD-26 keyboard path)', async () => {
  const a = actions();
  render(<DayList days={days} startDate={null} {...a} />);
  const grip = screen.getByRole('button', {name: 'Reorder Note a'});
  grip.focus();
  await userEvent.keyboard(' {ArrowDown}{ArrowDown} ');
  expect(a.onMoveItem).toHaveBeenCalledWith('d1', 'a', 'd1', 2, {fromIndex: 0});
 });
 it('drops a dragged item between days at the drop position', () => {
  const a = actions();
  render(<DayList days={days} startDate={null} {...a} />);
  const source = screen.getByText('Note c').closest('li')!;
  const target = screen.getByText('Note x').closest('li')!;
  const data = new Map<string, string>();
  const dataTransfer = {setData: (k: string, v: string) => data.set(k, v), getData: (k: string) => data.get(k) ?? '', effectAllowed: '', dropEffect: ''};
  fireEvent.dragStart(source, {dataTransfer});
  fireEvent.dragOver(target, {dataTransfer});
  fireEvent.drop(target, {dataTransfer});
  expect(a.onMoveItem).toHaveBeenCalledWith('d1', 'c', 'd2', 0, {fromIndex: 2});
 });
 it('cannot delete the only day', async () => {
  render(<DayList days={[days[0]]} startDate={null} {...actions()} />);
  await userEvent.click(screen.getByRole('button', {name: 'Day 1 options'}));
  expect(screen.getByRole('menuitem', {name: 'Delete day'})).toBeDisabled();
 });
});

describe('DayStrip', () => {
 it('shows dates when set, selects, appends, and accepts a dropped item at the end of a day', () => {
  const onSelect = vi.fn(), onAddDay = vi.fn(), onDropItem = vi.fn();
  render(<DayStrip days={days} startDate="2026-12-12" selectedId="d1" onSelect={onSelect} onAddDay={onAddDay} onDropItem={onDropItem} />);
  fireEvent.click(screen.getByRole('tab', {name: /13 Dec/}));
  expect(onSelect).toHaveBeenCalledWith('d2');
  fireEvent.click(screen.getByRole('button', {name: '+ Day'}));
  expect(onAddDay).toHaveBeenCalled();
  const dataTransfer = {getData: () => JSON.stringify({sectionId: 'd1', localId: 'a', index: 0}), dropEffect: ''};
  fireEvent.drop(screen.getByRole('tab', {name: /13 Dec/}), {dataTransfer});
  expect(onDropItem).toHaveBeenCalledWith('d1', 'a', 'd2', 0);
 });
});
