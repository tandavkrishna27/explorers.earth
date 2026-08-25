import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ThemeAppearanceSection from '../ThemeAppearanceSection';

describe('ThemeAppearanceSection', () => {
  it('renders all theme preset cards and triggers onChange on selection', () => {
    const handleChange = vi.fn();
    render(<ThemeAppearanceSection themeSettings={{ preset: 'cinematic-dark' }} onChange={handleChange} />);

    expect(screen.getByText('Cinematic Dark')).toBeInTheDocument();
    expect(screen.getByText('Glassmorphism Frost')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Glassmorphism Frost'));
    expect(handleChange).toHaveBeenCalledWith(expect.objectContaining({ preset: 'glassmorphism' }));
  });

  it('preserves future theme and recommendation keys when a preset changes', () => {
    const handleChange = vi.fn();
    render(
      <ThemeAppearanceSection
        themeSettings={{
          preset: 'cinematic-dark',
          futureTheme: { keep: true },
          recommendations: {
            layout: 'featured',
            categoryOrder: ['music', 'places'],
            futureRecommendation: 7,
          },
        }}
        onChange={handleChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Glassmorphism Frost/ }));

    expect(handleChange).toHaveBeenLastCalledWith(expect.objectContaining({
      preset: 'glassmorphism',
      accentColor: '#38BDF8',
      futureTheme: { keep: true },
      recommendations: {
        layout: 'featured',
        categoryOrder: ['music', 'places'],
        futureRecommendation: 7,
      },
    }));
  });

  it('offers all twelve distinct First view values including Places', () => {
    render(<ThemeAppearanceSection themeSettings={{}} onChange={vi.fn()} />);
    const firstView = screen.getByRole('combobox', { name: 'First view' });
    const values = within(firstView)
      .getAllByRole('option')
      .map((option) => (option as HTMLOptionElement).value);

    expect(values).toEqual([
      'all-recommendations',
      'places',
      'music',
      'movies',
      'books',
      'games',
      'guides',
      'apps',
      'products',
      'people',
      'gallery',
      'business',
    ]);
    expect(new Set(values).size).toBe(12);
  });

  it('merges recommendation changes without discarding nested future keys', () => {
    const handleChange = vi.fn();
    render(
      <ThemeAppearanceSection
        themeSettings={{
          recommendations: {
            layout: 'shelves',
            categoryOrder: ['places', 'music'],
            futureRecommendation: 'keep',
          },
        }}
        onChange={handleChange}
      />,
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Featured First' }));

    expect(handleChange).toHaveBeenLastCalledWith(expect.objectContaining({
      recommendations: expect.objectContaining({
        layout: 'featured',
        futureRecommendation: 'keep',
      }),
    }));
  });
});
