import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, describe, expect, it, vi} from 'vitest';
vi.mock('react-i18next', async () => (await import('./i18nMock')).i18nMock);
import MyListsPanel, {NEW_ITEM_DRAG_TYPE} from '../MyListsPanel';
afterEach(cleanup);
const lists = [{id: 'l1', title: 'Goa', category: 'places', items: [{recommendationId: 'r1', title: 'Thalassa'}]}];
describe('MyListsPanel (GD-19)', () => {
 it('adds an item to the selected day with +, and switches to Map', async () => {
  const onAdd = vi.fn();
  render(<MyListsPanel lists={lists} selectedDayName="Day 2" onAdd={onAdd} map={<div>map-here</div>} />);
  await userEvent.selectOptions(screen.getByLabelText('List'), 'l1');
  await userEvent.click(screen.getByRole('button', {name: 'Add Thalassa to Day 2'}));
  expect(onAdd).toHaveBeenCalledWith({kind: 'listItem', timeLabel: null, ref: {recommendationId: 'r1', collectionId: 'l1'}});
  await userEvent.click(screen.getByRole('tab', {name: 'Map'}));
  expect(screen.getByText('map-here')).toBeTruthy();
 });
 it('drags an item out as a new guide item', () => {
  render(<MyListsPanel lists={lists} selectedDayName="Day 1" onAdd={vi.fn()} map={null} />);
  const data = new Map<string, string>();
  fireEvent.dragStart(screen.getByText('Thalassa').closest('li')!, {dataTransfer: {setData: (k: string, v: string) => data.set(k, v), effectAllowed: ''}});
  expect(JSON.parse(data.get(NEW_ITEM_DRAG_TYPE)!)).toEqual({recommendationId: 'r1', collectionId: 'l1'});
 });
});
