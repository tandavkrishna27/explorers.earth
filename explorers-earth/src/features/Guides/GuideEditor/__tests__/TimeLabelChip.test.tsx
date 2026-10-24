import {cleanup, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, describe, expect, it, vi} from 'vitest';
vi.mock('react-i18next', async () => (await import('./i18nMock')).i18nMock);
import TimeLabelChip from '../TimeLabelChip';
afterEach(cleanup);
describe('TimeLabelChip', () => {
 it('offers + time, sets a word label, an exact time and clears', async () => {
  const onChange = vi.fn();
  const {rerender} = render(<TimeLabelChip value={null} onChange={onChange} />);
  await userEvent.click(screen.getByRole('button', {name: '+ time'}));
  await userEvent.click(screen.getByRole('menuitemradio', {name: 'Evening'}));
  expect(onChange).toHaveBeenLastCalledWith('evening');
  rerender(<TimeLabelChip value="evening" onChange={onChange} />);
  await userEvent.click(screen.getByRole('button', {name: /Evening/}));
  await userEvent.type(screen.getByLabelText('Exact time'), '9:30{Enter}');
  expect(onChange).toHaveBeenLastCalledWith('09:30');
  await userEvent.click(screen.getByRole('button', {name: /Evening/}));
  await userEvent.click(screen.getByRole('menuitem', {name: 'Clear time'}));
  expect(onChange).toHaveBeenLastCalledWith(null);
 });
 it('rejects a time it cannot read', async () => {
  const onChange = vi.fn();
  render(<TimeLabelChip value={null} onChange={onChange} />);
  await userEvent.click(screen.getByRole('button', {name: '+ time'}));
  await userEvent.type(screen.getByLabelText('Exact time'), 'lunch{Enter}');
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toHaveTextContent('Use a time like 9:30');
 });
});
