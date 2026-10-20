import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DayOrderPanel from '../DayOrderPanel';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

afterEach(cleanup);

const days = [
  { documentId: 'd1', Title: 'Day 1: Arrival', Sequence: 1 },
  { documentId: 'd2', Title: 'Old town', Sequence: 2 },
  { documentId: 'd3', Title: 'Day 3: Departure', Sequence: 3 },
];

// The page owns the saved order: it rewrites the sections once the write has landed.
function Host({ onReorder }: { onReorder: (ids: string[]) => Promise<void> }) {
  const [saved, setSaved] = useState(days);
  const [open, setOpen] = useState(true);
  return <DayOrderPanel sections={saved} open={open} onOpenChange={setOpen}
    onReorder={async ids => { await onReorder(ids); setSaved(ids.map(id => saved.find(day => day.documentId === id)!)); }} />;
}

describe('guide day order', () => {
  it('offers Reorder days, collapsed by default, and shows each day by position rather than a typed number', () => {
    render(<DayOrderPanel sections={days} open={false} onOpenChange={() => {}} onReorder={async () => {}} />);
    const toggle = screen.getByRole('button', { name: 'Reorder days' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('list', { name: 'Day order' })).toBeNull();
  });

  it('is not offered for a guide with a single day', () => {
    const { container } = render(<DayOrderPanel sections={days.slice(0, 1)} open onOpenChange={() => {}} onReorder={async () => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('sends the complete new order of day ids when a day is moved with the keyboard', async () => {
    const onReorder = vi.fn(async () => {});
    const user = userEvent.setup();
    render(<Host onReorder={onReorder} />);
    screen.getByRole('button', { name: 'Move Day 3 up' }).focus();
    await user.keyboard('{Enter}');
    expect(onReorder).toHaveBeenCalledWith(['d1', 'd3', 'd2']);
  });

  it('renumbers the days after a move and strips stale "Day N" prefixes from titles', async () => {
    const user = userEvent.setup();
    render(<Host onReorder={async () => {}} />);
    await user.click(screen.getByRole('button', { name: 'Move Day 3 up' }));
    await waitFor(() => expect(screen.getAllByRole('listitem').map(node => node.textContent?.replace(/\s+/g, ' ').trim().slice(0, 40))).toEqual([
      expect.stringMatching(/^Day 1Arrival/), expect.stringMatching(/^Day 2Departure/), expect.stringMatching(/^Day 3Old town/),
    ]));
  });

  it('shows the attempted order while the write is in flight, then restores the saved order and reports a failure', async () => {
    const onReorder = vi.fn().mockRejectedValue(new Error('This guide was changed somewhere else.'));
    render(<Host onReorder={onReorder} />);
    fireEvent.click(screen.getByRole('button', { name: 'Move Day 1 down' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('changed somewhere else');
    expect(screen.getAllByRole('listitem')[0].textContent).toContain('Arrival');
  });

  it('announces the move and disables the ends of the list', async () => {
    render(<Host onReorder={async () => {}} />);
    expect(screen.getByRole('button', { name: 'Move Day 1 up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Day 3 down' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Move Day 2 up' }));
    expect(screen.getByRole('status').textContent).toBe('Day 2 moved to position 1 of 3.');
  });
});
