import { ApolloClient, ApolloLink, ApolloProvider, InMemoryCache, Observable } from '@apollo/client';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import MobileLayout from '../MobileLayout';
import DashboardLayout from '../DashboardLayout';
import { useCategoryNavigation } from '../../features/navigation/CategoryNavigationProvider';
import { useMusicPublish } from '../../features/music/MusicPublishProvider';
import { loginSurface, surfaceAccount } from '../../features/navigation/__tests__/surfaceHarness';
import { canonicalAccountFixture, canonicalCategoryAccount } from '../../test/canonicalAccountFixture';
import useAuthStore from '../../store/store';

vi.mock('../../components/Header', () => ({ default: () => null }));
vi.mock('../../components/Navbar', () => ({ default: () => null }));
vi.mock('../../components/Sidenav', () => ({ default: () => null }));
vi.mock('../../components/RouteLoader', () => ({ default: () => null }));
vi.mock('../../components/EarthLoader', () => ({ EarthLoader: () => null }));
vi.mock('../../routes/validators', () => ({ DashboardRouteValidator: ({ children }: any) => children }));

function Consumer() {
  const navigation = useCategoryNavigation();
  const music = useMusicPublish(navigation.authority, { ready: false });
  return <div data-testid="publication-consumer">{navigation.authority?.accountDocumentId}:{music.state.kind}</div>;
}

describe('real publication providers at each dashboard layout Outlet', () => {
  beforeEach(() => { loginSurface(); localStorage.setItem('dashboard-theme', 'light'); vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined); });
  afterEach(() => { cleanup(); useAuthStore.getState().logout(); vi.restoreAllMocks(); });
  it('cold mobile and desktop/remount provide verified category scope with inert not-ready Music', async () => {
    const operations: string[] = [];
    const paths: string[] = [];
    // The verified category scope is read from the canonical owner profile now, so that
    // one request is authorized and every other transport - Music's above all - is not.
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
      const path = new URL(String(typeof input === 'string' ? input : input?.url ?? input), 'http://localhost').pathname;
      paths.push(path);
      if (path !== '/api/explorers/v1/me') throw new Error('No transport authorized');
      return new Response(JSON.stringify({ account: canonicalCategoryAccount() }), { headers: { 'Content-Type': 'application/json' } });
    });
    const client = new ApolloClient({ cache: new InMemoryCache(), link: new ApolloLink(operation => new Observable(observer => {
      operations.push(operation.operationName);
      observer.next({ data: { usersPermissionsUser: { __typename: 'UsersPermissionsUser', documentId: 'u1', provider: 'google', confirmed: true, blocked: false, accounts: [surfaceAccount()] } } });
      observer.complete();
    })) });
    const tree = (mobile: boolean) => <ApolloProvider client={client}><MemoryRouter><Routes><Route element={mobile ? <MobileLayout /> : <DashboardLayout />}><Route index element={<Consumer />} /></Route></Routes></MemoryRouter></ApolloProvider>;
    const verified = `${canonicalAccountFixture().id}:unknown`;
    const view = render(tree(true));
    await waitFor(() => expect(screen.getByTestId('publication-consumer')).toHaveTextContent(verified));
    view.rerender(tree(false));
    await waitFor(() => expect(screen.getByTestId('publication-consumer')).toHaveTextContent(verified));
    view.rerender(tree(true));
    await waitFor(() => expect(screen.getByTestId('publication-consumer')).toHaveTextContent(verified));
    // The legacy account query is gone; the scope comes from the canonical profile and
    // Music stays inert through both layouts and the remount.
    expect(operations.filter(name => name === 'CategoryNavigationAccount')).toEqual([]);
    expect(fetch).toHaveBeenCalled();
    expect(paths).toContain('/api/explorers/v1/me');
    expect(paths.filter(path => path.startsWith('/api/music'))).toEqual([]);
    client.stop();
  });
});
