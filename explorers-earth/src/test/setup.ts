/**
 * Vitest Global Setup
 * Runs before every test file.
 */
import './contained-unit-worker-check';
import '@testing-library/jest-dom';
import { afterEach, vi } from 'vitest';
import { cleanup, configure } from '@testing-library/react';

// testing-library's asyncUtilTimeout default is 1000ms, which this project never set
// deliberately -- far tighter than the vitest test budget, so a loaded CI runner expires the
// waitFor long before the test itself. AppEnrichmentPanel flaked exactly that way
// ("expected vi.fn() to be called at least once" from an awaited waitFor), passing in the
// sibling run of the identical commit.
//
// Raising it cannot make a passing assertion fail: waitFor only ever fails by TIMING OUT, so
// nothing passes because the window was short. The five call sites that pass an explicit
// { timeout } still win over this default, and 5000ms stays well inside the 30s vitest
// budget so a genuine failure still reports as the assertion rather than a test timeout.
configure({ asyncUtilTimeout: 5000 });

// Automatically clean up DOM and env stubs after each test
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

// ── localStorage / sessionStorage mock ──────────────────────────────────────
const storageMock = (): Storage => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = String(value); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (index: number) => Object.keys(store)[index] ?? null,
  } as Storage;
};

Object.defineProperty(window, 'localStorage', { value: storageMock() });
Object.defineProperty(window, 'sessionStorage', { value: storageMock() });

// ── window.matchMedia mock ───────────────────────────────────────────────────
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// ── window.ResizeObserver mock ───────────────────────────────────────────────
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// ── IntersectionObserver mock ────────────────────────────────────────────────
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));
