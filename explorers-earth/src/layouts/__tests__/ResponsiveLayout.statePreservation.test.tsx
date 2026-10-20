import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ResponsiveLayout from '../ResponsiveLayout';

vi.mock('../../components/Header', () => ({ default: () => <header data-testid="header" /> }));
vi.mock('../../components/Navbar', () => ({ default: () => <nav data-testid="navbar" /> }));
vi.mock('../../components/Sidenav', () => ({ default: () => <aside data-testid="sidebar" /> }));
vi.mock('../../components/RouteLoader', () => ({ default: () => null }));
vi.mock('../../components/EarthLoader', () => ({ EarthLoader: () => null }));
vi.mock('../../routes/validators', () => ({ DashboardRouteValidator: ({ children }: any) => children }));
vi.mock('../../features/navigation/CategoryNavigationProvider', () => ({ CategoryNavigationProvider: ({ children }: any) => children }));

const resize = (width: number) => act(() => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  window.dispatchEvent(new Event('resize'));
});

// UAT XC-X01: the desktop and mobile layouts were different component types, so crossing
// 768px unmounted the routed page and wiped a half-typed form.
describe('ResponsiveLayout', () => {
  beforeEach(() => { vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined); });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  const mount = () => render(
    <MemoryRouter initialEntries={['/profile']}>
      <Routes><Route element={<ResponsiveLayout />}><Route path="profile" element={<Form />} /></Route></Routes>
    </MemoryRouter>,
  );
  function Form() { return <input aria-label="Display name" defaultValue="" />; }

  it('keeps the routed page mounted and its typed text across the 768px breakpoint, both directions', () => {
    resize(1100);
    mount();
    const input = screen.getByLabelText('Display name') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Half typed' } });
    expect(screen.getByTestId('sidebar')).toBeInTheDocument();

    for (const width of [767, 1100, 700, 768]) {
      resize(width);
      expect(screen.getByLabelText('Display name')).toBe(input);
      expect(input.value).toBe('Half typed');
    }
  });

  it('swaps sidebar for navbar by width', () => {
    resize(1100);
    mount();
    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
    expect(screen.queryByTestId('navbar')).toBeNull();
    resize(700);
    expect(screen.queryByTestId('sidebar')).toBeNull();
    expect(screen.getByTestId('navbar')).toBeInTheDocument();
  });
});
