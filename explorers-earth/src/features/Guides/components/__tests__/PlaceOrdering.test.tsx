import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PlaceMoveButtons from '../PlaceMoveButtons';
import ActivityPhotoOrder from '../ActivityPhotoOrder';
import { useMoveAnnouncer } from '../../../../components/reorder/useMoveAnnouncer';

afterEach(cleanup);

function Day({ onOrder }: { onOrder: (names: string[]) => void }) {
  const [places, setPlaces] = useState([{ id: 'a', name: 'Cafe' }, { id: 'b', name: 'Museum' }, { id: 'c', name: 'Park' }]);
  const { announce, region } = useMoveAnnouncer();
  return <div>{region}<ul>{places.map((place, index) => <li key={place.id}>{place.name}
    <PlaceMoveButtons name={place.name} index={index} places={places} setPlaces={next => { setPlaces(next); onOrder(next.map(p => p.name)); }} announce={announce} /></li>)}</ul></div>;
}

describe('places inside a day part', () => {
  it('move with visible buttons, from the keyboard, and are announced', async () => {
    const onOrder = vi.fn();
    const user = userEvent.setup();
    render(<Day onOrder={onOrder} />);
    expect(screen.getByRole('button', { name: 'Move Cafe up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Park down' })).toBeDisabled();
    screen.getByRole('button', { name: 'Move Park up' }).focus();
    await user.keyboard('{Enter}');
    expect(onOrder).toHaveBeenLastCalledWith(['Cafe', 'Park', 'Museum']);
    expect(screen.getByRole('status').textContent).toBe('Park moved to position 2 of 3.');
  });
  it('do not start a drag of the surrounding card', () => {
    const outer = vi.fn();
    render(<div onPointerDown={outer}><PlaceMoveButtons name="X" index={0} places={['x', 'y']} setPlaces={() => {}} announce={() => {}} /></div>);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Move X down' }));
    expect(outer).not.toHaveBeenCalled();
  });
});

describe('activity photos', () => {
  const photos = [{ id: 'p1', url: '/1' }, { id: 'p2', url: '/2' }, { id: 'p3', url: '/3' }];
  it('are arranged with buttons and keep their identity', async () => {
    const onChange = vi.fn();
    render(<ActivityPhotoOrder name="Louvre" photos={photos} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Move Louvre photo 3 up' }));
    expect(onChange.mock.calls[0][0].map((p: { id: string }) => p.id)).toEqual(['p1', 'p3', 'p2']);
    expect(screen.queryByRole('button', { name: /^Remove/ })).toBeNull();
  });
  it('offers nothing for a single photo', () => {
    const { container } = render(<ActivityPhotoOrder name="X" photos={photos.slice(0, 1)} onChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
