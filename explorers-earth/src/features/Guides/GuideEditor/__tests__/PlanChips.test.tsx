import {cleanup, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, describe, expect, it, vi} from 'vitest';
vi.mock('react-i18next', async () => (await import('./i18nMock')).i18nMock);
import PlanChips from '../PlanChips';
afterEach(cleanup);
describe('PlanChips (GD-22)', () => {
 it('always shows Itinerary; others show as + chips until they have content', async () => {
  const onSelect = vi.fn();
  render(<PlanChips filled={{stay: true, transport: false, budget: false, tips: false}} active="itinerary" onSelect={onSelect} />);
  expect(screen.getByRole('tab', {name: 'Itinerary'})).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('tab', {name: 'Stay'})).toBeTruthy();
  await userEvent.click(screen.getByRole('tab', {name: '+ Transport'}));
  expect(onSelect).toHaveBeenCalledWith('transport');
 });
});
