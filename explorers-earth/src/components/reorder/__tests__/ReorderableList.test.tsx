import { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ReorderableList from '../ReorderableList';
import ReorderableFileStrip from '../ReorderableFileStrip';
import ReorderableMediaStrip, { type MediaStripItem } from '../ReorderableMediaStrip';
import { moveItem } from '../moveItem';

afterEach(cleanup);

const names = () => screen.getAllByRole('listitem').map(node => node.textContent?.match(/row-\w+/)?.[0]);

function Harness({ initial = ['a', 'b', 'c'], onChange = vi.fn() }: { initial?: string[]; onChange?: (next: string[]) => void }) {
  const [items, setItems] = useState(initial);
  return <ReorderableList items={items} getKey={item => item} getLabel={(item, index) => `Row ${item} (${index + 1})`}
    ariaLabel="Rows" onReorder={next => { setItems(next); onChange(next); }} renderItem={item => <span>row-{item}</span>} />;
}

describe('moveItem', () => {
  it('moves one entry and leaves the input untouched', () => {
    const input = ['a', 'b', 'c'];
    expect(moveItem(input, 0, 2)).toEqual(['b', 'c', 'a']);
    expect(input).toEqual(['a', 'b', 'c']);
  });
  it('ignores moves outside the list', () => {
    expect(moveItem(['a', 'b'], 1, 2)).toEqual(['a', 'b']);
    expect(moveItem(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
  });
});

describe('ReorderableList', () => {
  it('moves an entry down with its visible button and reports the complete new order', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Move Row a (1) down' }));
    expect(onChange).toHaveBeenCalledWith(['b', 'a', 'c']);
    expect(names()).toEqual(['row-b', 'row-a', 'row-c']);
  });

  it('works from the keyboard: Enter on a focused button moves the entry and focus stays on it', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.tab();
    const first = screen.getAllByRole('button')[0];
    expect(first.getAttribute('aria-label')).toMatch(/^Drag Row a/);
    const down = screen.getByRole('button', { name: 'Move Row a (1) down' });
    down.focus();
    await user.keyboard('{Enter}');
    expect(names()).toEqual(['row-b', 'row-a', 'row-c']);
    // the same entry is now second; focus follows it onto its Move down button
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Move Row a (2) down' }));
    await user.keyboard(' ');
    expect(names()).toEqual(['row-b', 'row-c', 'row-a']);
    // at the end of the list the Move down button is disabled, so focus moves to Move up
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Move Row a (3) up' }));
  });

  it('disables the edge buttons so an entry cannot be moved off either end', () => {
    render(<Harness />);
    expect(screen.getByRole('button', { name: 'Move Row a (1) up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Row c (3) down' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Row b (2) up' })).toBeEnabled();
  });

  it('announces each move through a polite live region', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Move Row c (3) up' }));
    const live = screen.getByRole('status');
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(live.textContent).toBe('Row c (3) moved to position 2 of 3.');
  });

  it('is inert while disabled', () => {
    const onChange = vi.fn();
    const { rerender } = render(<ReorderableList items={['a', 'b']} getKey={i => i} getLabel={i => i} ariaLabel="Rows" disabled onReorder={onChange} renderItem={i => <span>{i}</span>} />);
    fireEvent.click(screen.getByRole('button', { name: 'Move a down' }));
    expect(onChange).not.toHaveBeenCalled();
    rerender(<span />);
  });

  it('labels the list and wires its instructions', () => {
    render(<Harness />);
    const list = screen.getByRole('list', { name: 'Rows' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(list.getAttribute('aria-describedby')).toBeTruthy();
  });
});

describe('ReorderableMediaStrip', () => {
  const start: MediaStripItem[] = [{ id: 'one', url: '/1' }, { id: 'two', url: '/2' }, { id: 'three', url: '/3' }];
  function Strip({ onChange }: { onChange: (items: MediaStripItem[]) => void }) {
    const [items, setItems] = useState(start);
    return <ReorderableMediaStrip items={items} onChange={next => { setItems(next); onChange(next); }} noun="Screenshot" alt="App screenshot" removeLabel="Remove screenshot" />;
  }
  it('reorders thumbnails and keeps remove working on the reordered list', async () => {
    const onChange = vi.fn();
    render(<Strip onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Move Screenshot 3 up' }));
    expect(onChange.mock.calls[0][0].map((item: MediaStripItem) => item.id)).toEqual(['one', 'three', 'two']);
    await userEvent.click(screen.getAllByRole('button', { name: 'Remove screenshot' })[0]);
    expect(onChange.mock.calls[1][0].map((item: MediaStripItem) => item.id)).toEqual(['three', 'two']);
  });
  it('renders nothing for an empty set', () => {
    const { container } = render(<ReorderableMediaStrip items={[]} onChange={() => {}} noun="Photo" alt="x" removeLabel="y" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('ReorderableFileStrip', () => {
  const files = ['a', 'b', 'c'].map(name => new File([name], `${name}.png`, { type: 'image/png' }));
  function Files({ onChange }: { onChange: (next: File[]) => void }) {
    const [current, setCurrent] = useState(files);
    return <ReorderableFileStrip files={current} previews={current.map(file => `blob:${file.name}`)} onChange={next => { setCurrent(next); onChange(next); }} noun="New photo" alt="New photo preview" removeLabel="Remove new photo" />;
  }
  it('reorders files that have not been uploaded yet, preserving file identity', async () => {
    const onChange = vi.fn();
    render(<Files onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Move New photo 1 down' }));
    expect(onChange.mock.calls[0][0].map((file: File) => file.name)).toEqual(['b.png', 'a.png', 'c.png']);
    expect(onChange.mock.calls[0][0][1]).toBe(files[0]);
    await userEvent.click(screen.getAllByRole('button', { name: 'Remove new photo' })[2]);
    expect(onChange.mock.calls[1][0].map((file: File) => file.name)).toEqual(['b.png', 'a.png']);
  });
});

describe('ReorderableList controls="keyboard"', () => {
  it('keyboard mode shows only the grip and moves with Space + arrows', () => {
    const onReorder = vi.fn();
    render(<ReorderableList controls="keyboard" items={['a', 'b', 'c']} getKey={(x) => x} getLabel={(x) => x} onReorder={onReorder} renderItem={(x) => <span>{x}</span>} ariaLabel="Items" />);
    expect(screen.queryByRole('button', { name: /Move a up/ })).toBeNull();
    const grip = screen.getByRole('button', { name: 'Drag a to reorder' });
    fireEvent.keyDown(grip, { key: ' ' });
    expect(grip).toHaveAttribute('aria-pressed', 'true');
    fireEvent.keyDown(grip, { key: 'ArrowDown' });
    fireEvent.keyDown(grip, { key: ' ' });
    expect(onReorder).toHaveBeenLastCalledWith(['b', 'a', 'c']);
  });

  it('Escape cancels a keyboard move', () => {
    const onReorder = vi.fn();
    render(<ReorderableList controls="keyboard" items={['a', 'b']} getKey={(x) => x} getLabel={(x) => x} onReorder={onReorder} renderItem={(x) => <span>{x}</span>} ariaLabel="Items" />);
    const grip = screen.getByRole('button', { name: 'Drag a to reorder' });
    fireEvent.keyDown(grip, { key: ' ' }); fireEvent.keyDown(grip, { key: 'ArrowDown' }); fireEvent.keyDown(grip, { key: 'Escape' });
    expect(onReorder).not.toHaveBeenCalled();
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('a');
  });

  it('default mode is unchanged (arrows rendered)', () => {
    render(<ReorderableList items={['a', 'b']} getKey={(x) => x} getLabel={(x) => x} onReorder={vi.fn()} renderItem={(x) => <span>{x}</span>} ariaLabel="Items" />);
    expect(screen.getByRole('button', { name: 'Move a down' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Drag a to reorder' })).not.toHaveAttribute('aria-pressed');
  });
});
