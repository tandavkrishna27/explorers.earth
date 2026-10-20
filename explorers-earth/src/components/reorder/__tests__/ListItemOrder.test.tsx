import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const reorder = vi.hoisted(() => vi.fn());
vi.mock('../../../lib/reorderListItems', () => ({ reorderListItems: reorder }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import ListItemOrder from '../ListItemOrder';

const items = [{ id: 'a', title: 'Alpha' }, { id: 'b', title: 'Beta' }, { id: 'c', title: 'Gamma' }];
beforeEach(() => { reorder.mockReset(); reorder.mockResolvedValue({}); });
afterEach(cleanup);

describe('ListItemOrder', () => {
  it('stays out of the way for a list of one', () => {
    const { container } = render(<ListItemOrder category="apps" listId="l1" items={items.slice(0, 1)} noun="App" nounPlural="apps" onChanged={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('is collapsed until asked, then writes the complete order for that list and category', async () => {
    const onChanged = vi.fn();
    const user = userEvent.setup();
    render(<ListItemOrder category="apps" listId="l1" items={items} noun="App" nounPlural="apps" onChanged={onChanged} />);
    expect(screen.queryByRole('list', { name: 'App order' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Reorder apps' }));
    await user.click(screen.getByRole('button', { name: 'Move App 3 up' }));
    await waitFor(() => expect(reorder).toHaveBeenCalledWith('apps', 'l1', ['a', 'c', 'b']));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(screen.getByRole('status').textContent).toBe('App 3 moved to position 2 of 3.');
  });

  it('keeps working from the keyboard alone', async () => {
    const user = userEvent.setup();
    render(<ListItemOrder category="books" listId="l9" items={items} noun="Book" nounPlural="books" onChanged={() => {}} />);
    screen.getByRole('button', { name: 'Reorder books' }).focus();
    await user.keyboard('{Enter}');
    screen.getByRole('button', { name: 'Move Book 1 down' }).focus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(reorder).toHaveBeenCalledWith('books', 'l9', ['b', 'a', 'c']));
  });

  it('reloads and says so when the write is refused, instead of keeping an order the server does not hold', async () => {
    reorder.mockRejectedValue(new Error('This list was changed somewhere else. It has been reloaded; try moving the item again.'));
    const onChanged = vi.fn();
    const user = userEvent.setup();
    render(<ListItemOrder category="movies" listId="l2" items={items} noun="Movie" nounPlural="movies" onChanged={onChanged} />);
    await user.click(screen.getByRole('button', { name: 'Reorder movies' }));
    await user.click(screen.getByRole('button', { name: 'Move Movie 2 up' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('changed somewhere else');
    expect(onChanged).toHaveBeenCalled();
    expect(screen.getAllByRole('listitem')[0].textContent).toContain('Alpha');
  });
});
