import { render, waitFor } from '@testing-library/react';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WorldMapChart from '../components/charts/WorldMapChart';
import worldTopologyUrl from 'world-atlas/countries-110m.json?url';
import type { AnalyticsEvent } from '../api/queries';

// The production CSP only allows connect-src 'self'. A chart that fetches a CDN renders
// nothing for the owner (ANL-02), so the analytics UI must never reach a third-party origin.
vi.mock('../../../hooks/useResponsiveChart', () => ({
  useResponsiveChart: () => ({
    chartConfig: { chartHeight: 300, fontSize: 12 },
    showPieLabels: true,
    isMobile: false,
  }),
}));

const topology = readFileSync(join(__dirname, '../../../../node_modules/world-atlas/countries-110m.json'), 'utf8');

const events: AnalyticsEvent[] = [
  { type: 'view', timestamp: '2026-08-24T10:00:00.000Z', page: 'public-profile', canonicalPath: '/u', country: 'IN' },
];

const requestedUrls = (fetchSpy: ReturnType<typeof vi.spyOn>) =>
  fetchSpy.mock.calls.map(([input]) => String((input as Request | URL | string) instanceof Request ? (input as Request).url : input));

const isThirdParty = (url: string) => {
  const parsed = new URL(url, window.location.origin);
  return parsed.origin !== window.location.origin;
};

describe('analytics charts contact no third-party origin', () => {
  afterEach(() => vi.restoreAllMocks());

  it('ships the world topology as a same-origin asset', () => {
    expect(isThirdParty(worldTopologyUrl)).toBe(false);
    expect(worldTopologyUrl).not.toMatch(/jsdelivr|unpkg|cdn/i);
  });

  it('loads the map topology without a third-party request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(topology, { status: 200 }));
    const xhrOpen = vi.spyOn(XMLHttpRequest.prototype, 'open');
    render(<WorldMapChart events={events} isResolvingCountries={false} />);

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const urls = [...requestedUrls(fetchSpy), ...xhrOpen.mock.calls.map((call) => String(call[1]))];
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.filter(isThirdParty)).toEqual([]);
  });

  it('has no hard-coded third-party URL in any chart or dashboard source', () => {
    const root = join(__dirname, '..', 'components');
    const files = [
      join(root, 'AnalyticsDashboard.tsx'),
      ...readdirSync(join(root, 'charts')).map((name) => join(root, 'charts', name)),
    ];
    const offenders = files.filter((file) => /https?:\/\/(?!localhost|127\.0\.0\.1)/.test(
      readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''),
    ));
    expect(offenders).toEqual([]);
  });
});
