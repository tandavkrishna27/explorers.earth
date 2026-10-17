import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import usePageTracking from '../usePageTracking';

const mockUseLocation = vi.fn();
vi.mock('react-router-dom', () => ({
  useLocation: () => mockUseLocation(),
}));

describe('usePageTracking hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    window.gtag = vi.fn();
  });
  afterEach(() => vi.restoreAllMocks());

  it('calls gtag on route change', () => {
    localStorage.setItem('explorers-cookie-consent', '{"analytics":true}');
    mockUseLocation.mockReturnValue({ pathname: '/about' });

    renderHook(() => usePageTracking());

    expect(window.gtag).toHaveBeenCalledWith('config', 'G-C3QBWP3ZSK', {
      page_path: '/about',
    });
  });

  it('does not throw if gtag is undefined', () => {
    localStorage.setItem('explorers-cookie-consent', '{"analytics":true}');
    delete window.gtag;
    mockUseLocation.mockReturnValue({ pathname: '/home' });

    expect(() => renderHook(() => usePageTracking())).not.toThrow();
  });

  it.each([null, '{bad', 'null', '{"analytics":false}', '{"analytics":"false"}', '{"analytics":1}'])('does not emit with an existing gtag but no opt-in: %s', (stored) => {
    if (stored !== null) localStorage.setItem('explorers-cookie-consent', stored);
    mockUseLocation.mockReturnValue({ pathname: '/tk2727/music' });
    renderHook(() => usePageTracking());
    expect(window.gtag).not.toHaveBeenCalled();
  });

  it('rechecks consent before each subsequent pathname emission', () => {
    localStorage.setItem('explorers-cookie-consent', '{"analytics":true}');
    mockUseLocation.mockReturnValue({ pathname: '/tk2727' });
    const { rerender } = renderHook(() => usePageTracking());
    expect(window.gtag).toHaveBeenCalledExactlyOnceWith('config', 'G-C3QBWP3ZSK', { page_path: '/tk2727' });
    localStorage.setItem('explorers-cookie-consent', '{"analytics":false}');
    mockUseLocation.mockReturnValue({ pathname: '/tk2727/music' });
    rerender();
    expect(window.gtag).toHaveBeenCalledTimes(1);
  });

  it('does not emit or throw when getItem throws', () => {
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    mockUseLocation.mockReturnValue({ pathname: '/settings' });
    expect(() => renderHook(() => usePageTracking())).not.toThrow();
    expect(window.gtag).not.toHaveBeenCalled();
  });

  it('does not emit or throw when the storage property getter throws', () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'localStorage')!;
    Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('property denied'); } });
    try {
      mockUseLocation.mockReturnValue({ pathname: '/settings' });
      expect(() => renderHook(() => usePageTracking())).not.toThrow();
      expect(window.gtag).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(window, 'localStorage', descriptor);
    }
  });
});
