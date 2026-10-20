import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const write = vi.hoisted(() => vi.fn());
vi.mock('../../../lib/reorderCategoryLists', () => ({ reorderCategoryLists: write }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
import CategoryListsOrder from '../CategoryListsOrder';

beforeEach(() => { write.mockReset(); write.mockResolvedValue({}); });
afterEach(cleanup);

describe('CategoryListsOrder', () => {
  it('writes the complete display order for the category', async () => {
    const onChanged = vi.fn();
    render(<CategoryListsOrder category="movies" lists={[{ id: 'a', title: 'One' }, { id: 'b', title: 'Two' }, { id: 'c', title: 'Three' }]} onChanged={onChanged} />);
    await userEvent.click(screen.getByRole('button', { name: 'Reorder lists' }));
    await userEvent.click(screen.getByRole('button', { name: 'Move List 1 down' }));
    await waitFor(() => expect(write).toHaveBeenCalledWith('movies', 'display', ['b', 'a', 'c']));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });
  it('is hidden for a single list', () => {
    const { container } = render(<CategoryListsOrder category="guides" noun="Guide" nounPlural="guides" lists={[{ id: 'a', title: 'Only' }]} onChanged={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('CategoryListsOrder staying open', () => {
  const lists = [{ id: 'a', title: 'One' }, { id: 'b', title: 'Two' }];
  it('stays open when the screen around it remounts after a move, until it is closed', async () => {
    const first = render(<CategoryListsOrder category="places" lists={lists} onChanged={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Reorder lists' }));
    first.unmount();
    const second = render(<CategoryListsOrder category="places" lists={lists} onChanged={() => {}} />);
    expect(screen.getByRole('button', { name: 'Done reordering' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Done reordering' }));
    second.unmount();
    render(<CategoryListsOrder category="places" lists={lists} onChanged={() => {}} />);
    expect(screen.getByRole('button', { name: 'Reorder lists' })).toBeTruthy();
  });
});
