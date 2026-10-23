import {cleanup, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, describe, expect, it, vi} from 'vitest';
vi.mock('react-i18next', async () => (await import('./i18nMock')).i18nMock);
const {searchMyLists} = vi.hoisted(() => ({searchMyLists: vi.fn()}));
vi.mock('../myListsSearch', () => ({searchMyLists}));
// WP6's PlaceSearchField is not on main yet; the Google group is a local results list with the same props.
vi.mock('../GooglePlaceResults', () => ({default: ({query, onPick}: {query: string; onPick: (p: unknown) => void}) =>
 query ? <button type="button" onClick={() => onPick({placeId: 'G1', name: `${query} (Google)`, formattedAddress: null, lat: 15.5, lng: 73.8, types: []})}>{`${query} (Google)`}</button> : null}));
import SmartAddBox from '../SmartAddBox';
afterEach(cleanup);
describe('SmartAddBox (GD-18)', () => {
 it('lists my saved items first, then Google, then a note; stays open after adding', async () => {
  searchMyLists.mockResolvedValue([{recommendationId: '11111111-1111-4111-8111-111111111111', collectionId: null, title: 'Thalassa', subtitle: 'Places · Goa'}]);
  const onAdd = vi.fn(), onClose = vi.fn();
  render(<SmartAddBox dayName="Day 1" onAdd={onAdd} onClose={onClose} />);
  await userEvent.type(screen.getByRole('combobox'), 'Thal');
  await waitFor(() => expect(screen.getByRole('option', {name: /Thalassa/})).toBeTruthy());
  const options = screen.getAllByRole('option').map((o) => o.textContent);
  expect(options[0]).toContain('Thalassa');
  expect(options.at(-1)).toBe('Add as a note: "Thal"');
  await userEvent.click(screen.getByRole('option', {name: /Thalassa/}));
  expect(onAdd).toHaveBeenCalledWith({kind: 'listItem', timeLabel: null, ref: {recommendationId: '11111111-1111-4111-8111-111111111111', collectionId: null}});
  expect(screen.getByRole('combobox')).toHaveValue('');
  expect(onClose).not.toHaveBeenCalled();
 });
 it('adds a Google pick as a place item', async () => {
  searchMyLists.mockResolvedValue([]);
  const onAdd = vi.fn();
  render(<SmartAddBox dayName="Day 1" onAdd={onAdd} onClose={vi.fn()} />);
  await userEvent.type(screen.getByRole('combobox'), 'Fort');
  await userEvent.click(screen.getByRole('button', {name: 'Fort (Google)'}));
  expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({kind: 'place', timeLabel: null,
   place: expect.objectContaining({placeId: 'G1', name: 'Fort (Google)', geometry: {location: {lat: 15.5, lng: 73.8}}, source: 'google', verified: true})}));
 });
 it('adds a note with Enter when nothing matches and closes on Escape', async () => {
  searchMyLists.mockResolvedValue([]);
  const onAdd = vi.fn(), onClose = vi.fn();
  render(<SmartAddBox dayName="Day 1" onAdd={onAdd} onClose={onClose} />);
  await userEvent.type(screen.getByRole('combobox'), 'Buy ferry tickets{Enter}');
  expect(onAdd).toHaveBeenCalledWith({kind: 'note', timeLabel: null, text: 'Buy ferry tickets'});
  expect(screen.getByRole('combobox')).toHaveValue('');
  await userEvent.keyboard('{Escape}');
  expect(onClose).toHaveBeenCalled();
 });
});
