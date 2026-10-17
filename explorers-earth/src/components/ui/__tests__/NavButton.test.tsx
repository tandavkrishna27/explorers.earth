import { fireEvent, render, screen } from '@testing-library/react';
import { Music2 } from 'lucide-react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import NavButton from '../NavButton';

describe('NavButton public target size', () => {
  it('gives the smallest public icon-and-label fixture a 44px minimum target', () => {
    render(
      <MemoryRouter>
        <NavButton
          type="public"
          href="/alice/music"
          icon={<Music2 size={18} />}
          text="Music"
          isActive={false}
          onClickHandler={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Music' })).toHaveClass('min-h-11', 'min-w-11');
  });

  it('forwards trusted-shaped mouse and keyboard Link activation to its typed public handler', () => {
    const targets: EventTarget[] = [];
    const onActivate = vi.fn((event) => { targets.push(event.currentTarget); });
    render(
      <MemoryRouter>
        <NavButton
          type="public"
          href="/alice/music"
          icon={<Music2 size={18} />}
          text="Music"
          isActive={false}
          onClickHandler={onActivate}
        />
      </MemoryRouter>,
    );

    const link = screen.getByRole('link', { name: 'Music' });
    fireEvent.click(link, { button: 0, detail: 1 });
    fireEvent.click(link, { button: 0, detail: 0 });
    expect(onActivate).toHaveBeenCalledTimes(2);
    expect(targets).toEqual([link, link]);
  });
});
