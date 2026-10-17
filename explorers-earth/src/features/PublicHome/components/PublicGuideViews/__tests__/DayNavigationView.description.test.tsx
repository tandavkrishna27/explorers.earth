import { fireEvent, render, screen } from '@testing-library/react';
import type { HTMLAttributes, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import DayNavigationView from '../DayNavigationView';

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children?: ReactNode }) => children,
  motion: {
    div: ({ initial: _initial, animate: _animate, exit: _exit, transition: _transition, whileHover: _whileHover, ...props }: HTMLAttributes<HTMLDivElement> & Record<string, unknown>) => <div {...props} />,
  },
}));

const sections = [{
  Sequence: 1,
  Description: 'Fixture day',
  Timeline: { morning: [], afternoon: [], evening: [] },
}];

function renderDescription(description: unknown) {
  return render(
    <DayNavigationView
      sections={sections}
      guide={{ Description: description }}
      selectedDay="overview"
    />,
  );
}

describe('DayNavigationView journey description', () => {
  it.each([
    [
      'plain string',
      'Plain&nbsp;Unicode &#160;東京 &amp; food &lt;img src=x alt=unsafe&gt;',
      'Plain Unicode 東京 & food <img src=x alt=unsafe>',
    ],
    [
      'Strapi blocks',
      [{ children: [{ text: 'A&nbsp;focused &#160;walk &amp; food &lt;script&gt;alert(1)&lt;/script&gt;' }] }],
      'A focused walk & food <script>alert(1)</script>',
    ],
  ])('renders a readable, inert %s description', (_shape, description, readableText) => {
    const { container } = renderDescription(description);

    expect(screen.getByText('About This Journey')).toBeVisible();
    const descriptionNode = screen.getByText(readableText);
    expect(descriptionNode).toBeVisible();
    expect(descriptionNode.textContent).not.toContain('&nbsp;');
    expect(container.querySelector('img')).not.toBeInTheDocument();
    expect(container.querySelector('script')).not.toBeInTheDocument();
  });

  it.each([
    ['unknown object', { unexpected: true }],
    ['null', null],
    ['empty string', ''],
    ['empty blocks', []],
  ])('omits About This Journey for %s descriptions', (_shape, description) => {
    renderDescription(description);

    expect(screen.queryByText('About This Journey')).not.toBeInTheDocument();
  });

  it('switches between the Read More and Read Less labels for normalized text over 300 characters', () => {
    renderDescription('A&nbsp;'.repeat(151));

    const readMore = screen.getByRole('button', { name: 'Read More' });
    expect(readMore).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Read Less' })).not.toBeInTheDocument();

    fireEvent.click(readMore);

    expect(screen.getByRole('button', { name: 'Read Less' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Read More' })).not.toBeInTheDocument();
  });
});
