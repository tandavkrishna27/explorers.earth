import {cleanup, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {MemoryRouter} from 'react-router-dom';
import {afterEach, describe, expect, it, vi} from 'vitest';
vi.mock('react-i18next', async () => (await import('../../GuideEditor/__tests__/i18nMock')).i18nMock);
const {createTripGuide, navigate} = vi.hoisted(() => ({createTripGuide: vi.fn().mockResolvedValue({collectionId: 'g1'}), navigate: vi.fn()}));
vi.mock('../../api/guideCreation', () => ({createTripGuide}));
vi.mock('react-router-dom', async (orig) => ({...(await orig<typeof import('react-router-dom')>()), useNavigate: () => navigate}));
import NewGuideDialog from '../NewGuideDialog';
afterEach(cleanup);
describe('NewGuideDialog (GD-03/04/05)', () => {
 it('creates a Trip draft with title, days, optional dates and tags, then lands in the editor', async () => {
  render(<MemoryRouter><NewGuideDialog open onOpenChange={() => {}} /></MemoryRouter>);
  expect(screen.getByRole('radio', {name: /Topic guide/})).toBeDisabled();
  await userEvent.type(screen.getByLabelText('Title'), '3 days in Goa');
  await userEvent.clear(screen.getByLabelText('Days'));
  await userEvent.type(screen.getByLabelText('Days'), '3');
  await userEvent.type(screen.getByLabelText('Start date (optional)'), '2026-12-12');
  expect(screen.getByText('Starts as a draft only you can see')).toBeTruthy();
  await userEvent.click(screen.getByRole('button', {name: 'Create guide'}));
  expect(createTripGuide).toHaveBeenCalledWith(expect.objectContaining({title: '3 days in Goa', days: 3, startDate: '2026-12-12', tags: []}), undefined);
  expect(navigate).toHaveBeenCalledWith('/recommendations/guides/g1', expect.anything());
 });
 it('needs a title and 1-60 days; nothing else is required', async () => {
  render(<MemoryRouter><NewGuideDialog open onOpenChange={() => {}} /></MemoryRouter>);
  expect(screen.getByRole('button', {name: 'Create guide'})).toBeDisabled();
 });
 it('starts fresh on every open and honours the new defaultTitle', async () => {
  const view = (open: boolean, defaultTitle: string) => <MemoryRouter><NewGuideDialog open={open} onOpenChange={() => {}} defaultTitle={defaultTitle} /></MemoryRouter>;
  const {rerender} = render(view(true, 'First'));
  await userEvent.type(screen.getByLabelText('Destination (optional)'), 'Goa');
  rerender(view(false, 'First'));
  rerender(view(true, 'Second'));
  expect(screen.getByLabelText('Title')).toHaveValue('Second');
  expect(screen.getByLabelText('Destination (optional)')).toHaveValue('');
 });
});
