import {act, cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
vi.mock('react-i18next', async () => (await import('./i18nMock')).i18nMock);
const {searchMyLists, searchGooglePlaces} = vi.hoisted(() => ({searchMyLists: vi.fn(), searchGooglePlaces: vi.fn()}));
vi.mock('../myListsSearch', () => ({searchMyLists}));
vi.mock('../googlePlaceSearch', () => ({searchGooglePlaces}));
import SmartAddBox from '../SmartAddBox';
import {shouldSearchGoogle} from '../GooglePlaceResults';
afterEach(cleanup);
beforeEach(() => {
 vi.clearAllMocks();
 searchMyLists.mockResolvedValue([]);
 searchGooglePlaces.mockImplementation(async (q: string) => [{placeId: 'G1', name: `${q} (Google)`, formattedAddress: null, lat: 15.5, lng: 73.8, types: []}]);
});
const thalassa = {recommendationId: '11111111-1111-4111-8111-111111111111', collectionId: null, title: 'Thalassa', subtitle: 'Places · Goa'};
const box = (onAdd = vi.fn(), onClose = vi.fn()) => {render(<SmartAddBox dayName="Day 1" onAdd={onAdd} onClose={onClose} />); return {onAdd, onClose, input: screen.getByRole('combobox')};};

describe('SmartAddBox (GD-18)', () => {
 it('lists my saved items first, then Google, then a note; stays open after adding', async () => {
  searchMyLists.mockResolvedValue([thalassa]);
  const {onAdd, onClose, input} = box();
  await userEvent.type(input, 'Thal');
  await waitFor(() => expect(screen.getByRole('option', {name: /Thal \(Google\)/})).toBeTruthy());
  const options = screen.getAllByRole('option').map((o) => o.textContent);
  expect(options[0]).toContain('Thalassa');
  expect(options[1]).toContain('Thal (Google)');
  expect(options.at(-1)).toBe('Add as a note: "Thal"');
  await userEvent.click(screen.getByRole('option', {name: /Thalassa/}));
  expect(onAdd).toHaveBeenCalledWith({kind: 'listItem', timeLabel: null, ref: {recommendationId: thalassa.recommendationId, collectionId: null}});
  expect(input).toHaveValue('');
  expect(onClose).not.toHaveBeenCalled();
 });
 it('adds a Google pick as a place item', async () => {
  const {onAdd, input} = box();
  await userEvent.type(input, 'Fort');
  await userEvent.click(await screen.findByRole('option', {name: /Fort \(Google\)/}, {timeout: 2000}));
  expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({kind: 'place', timeLabel: null,
   place: expect.objectContaining({placeId: 'G1', name: 'Fort (Google)', geometry: {location: {lat: 15.5, lng: 73.8}}, source: 'google', verified: true})}));
 });
 it('Enter adds a note even when a saved item matches; arrows pick a hit or a Google result', async () => {
  searchMyLists.mockResolvedValue([thalassa]);
  const {onAdd, input} = box();
  await userEvent.type(input, 'Thal');
  await screen.findByRole('option', {name: /Thal \(Google\)/}, {timeout: 2000});
  await userEvent.keyboard('{Enter}');
  expect(onAdd).toHaveBeenLastCalledWith({kind: 'note', timeLabel: null, text: 'Thal'});
  await userEvent.type(input, 'Thal');
  await screen.findByRole('option', {name: /Thal \(Google\)/}, {timeout: 2000});
  await userEvent.keyboard('{ArrowDown}');
  expect(input.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', {name: /Thalassa/}).id);
  await userEvent.keyboard('{Enter}');
  expect(onAdd).toHaveBeenLastCalledWith({kind: 'listItem', timeLabel: null, ref: {recommendationId: thalassa.recommendationId, collectionId: null}});
  await userEvent.type(input, 'Thal');
  await screen.findByRole('option', {name: /Thal \(Google\)/}, {timeout: 2000});
  await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');
  expect(onAdd).toHaveBeenLastCalledWith(expect.objectContaining({kind: 'place', place: expect.objectContaining({placeId: 'G1'})}));
 });
 it('adds a note with Enter when nothing matches and closes on Escape', async () => {
  const {onAdd, onClose, input} = box();
  await userEvent.type(input, 'Buy ferry tickets{Enter}');
  expect(onAdd).toHaveBeenCalledWith({kind: 'note', timeLabel: null, text: 'Buy ferry tickets'});
  expect(input).toHaveValue('');
  await userEvent.keyboard('{Escape}');
  expect(onClose).toHaveBeenCalled();
 });
});

describe('smart add search limits', () => {
 it('searches nothing under 3 characters and never sends a sentence to Google', () => {
  expect(shouldSearchGoogle('Fo')).toBe(false);
  expect(shouldSearchGoogle('Fort')).toBe(true);
  expect(shouldSearchGoogle('Fort Aguada Goa India')).toBe(true);
  expect(shouldSearchGoogle('remember to buy ferry tickets')).toBe(false);
 });
 it('debounces Google by 500ms and skips both searches for short text', () => {
  vi.useFakeTimers();
  try {
   box();
   const input = screen.getByRole('combobox');
   fireEvent.change(input, {target: {value: 'Fo'}});
   act(() => {vi.advanceTimersByTime(1000);});
   expect(searchMyLists).not.toHaveBeenCalled();
   expect(searchGooglePlaces).not.toHaveBeenCalled();
   fireEvent.change(input, {target: {value: 'Fort'}});
   act(() => {vi.advanceTimersByTime(499);});
   expect(searchGooglePlaces).not.toHaveBeenCalled();
   act(() => {vi.advanceTimersByTime(1);});
   expect(searchGooglePlaces).toHaveBeenCalledTimes(1);
   fireEvent.change(input, {target: {value: 'remember to buy ferry tickets'}});
   act(() => {vi.advanceTimersByTime(1000);});
   expect(searchGooglePlaces).toHaveBeenCalledTimes(1);
  } finally {vi.useRealTimers();}
 });
});
