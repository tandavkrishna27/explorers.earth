import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import PublicProfileFooter from '../PublicProfileFooter';

describe('PublicProfileFooter', () => {
  it('renders branding badge when enabled', () => {
    render(
      <BrowserRouter>
        <PublicProfileFooter brandingStyle="enabled" />
      </BrowserRouter>
    );
    expect(screen.getByText(/Powered by/i)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Explorers.Earth' })).toHaveAttribute(
      'src',
      '/eoe-full.svg',
    );
    expect(screen.getByText(/Create your profile/i)).toBeInTheDocument();
  });

  it('renders null when branding is disabled', () => {
    const { container } = render(
      <BrowserRouter>
        <PublicProfileFooter brandingStyle="disabled" />
      </BrowserRouter>
    );
    expect(container.firstChild).toBeNull();
  });
});
