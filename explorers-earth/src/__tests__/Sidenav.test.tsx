import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MockedProvider } from '@apollo/client/testing';
import Sidebar from '../components/Sidenav';
import { DashboardThemeProvider } from '../contexts/DashboardThemeContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

describe('Sidebar Navigation Component', () => {
  it('renders exactly 5 core navigation items', () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MockedProvider addTypename={false}>
        <MemoryRouter initialEntries={['/home']}>
          <DashboardThemeProvider>
            <Sidebar />
          </DashboardThemeProvider>
        </MemoryRouter>
      </MockedProvider></QueryClientProvider>
    );

    expect(screen.getByText(/Home/i)).toBeInTheDocument();
    expect(screen.getByText(/Profile/i)).toBeInTheDocument();
    expect(screen.getByText(/Recommendations/i)).toBeInTheDocument();
    expect(screen.getByText(/Analytics/i)).toBeInTheDocument();
    expect(screen.getByText(/Settings/i)).toBeInTheDocument();

    expect(screen.queryByText(/^Movies$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Books$/i)).not.toBeInTheDocument();
  });
});
