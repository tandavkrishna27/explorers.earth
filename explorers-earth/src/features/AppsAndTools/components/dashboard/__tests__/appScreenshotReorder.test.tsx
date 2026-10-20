import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { MockedProvider } from '@apollo/client/testing';
import AddAppPage from '../AddAppPage';
import { AppsClient } from '../../../api/appsClient';
import useAuthStore from '../../../../../store/store';

// UAT APP-02: screenshots had a picker and a remove button but no way to change their order.
// The server already stores them in ordered slots and the public page renders slot order, so
// the editor only has to let the owner arrange the list and send it back in that order.

const fixture = vi.hoisted(() => ({ content: { view: { lists: [] as unknown[] }, details: new Map(), observation: {} }, loading: false, error: undefined as Error | undefined, refetch: vi.fn() }));
vi.mock('../../../hooks/useAppsOwner', () => ({ useAppsOwner: () => ({ content: fixture.content, data: { appLists: fixture.content.view.lists }, loading: fixture.loading, error: fixture.error, refetch: fixture.refetch }), invalidateApps: vi.fn() }));
vi.mock('../../../api/appsClient', () => ({ AppsClient: { observeCollection: vi.fn(), prepareManualIntent: vi.fn(), createManual: vi.fn(), upload: vi.fn(), updateRecommendation: vi.fn(), membership: vi.fn() } }));
vi.mock('../../../../Favorites/components/TiptapEditor', () => ({ default: () => <textarea aria-label="Note" /> }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), loading: vi.fn() } }));

const tree = (path: string) => <MockedProvider><MemoryRouter initialEntries={[path]}><Routes>
  <Route path="/apps/:listId/add" element={<AddAppPage />} />
  <Route path="/apps/:listId/edit/:appId" element={<AddAppPage />} />
  <Route path="/recommendations/apps/:listId" element={<p>Saved list</p>} />
</Routes></MemoryRouter></MockedProvider>;

const mediaIds = () => screen.getAllByAltText('App screenshot').map(image => image.getAttribute('src')!.split('/media/')[1].split('/')[0]);

beforeEach(() => {
  vi.clearAllMocks(); fixture.loading = false; fixture.error = undefined;
  fixture.content = { view: { lists: [] }, details: new Map(), observation: {} };
  useAuthStore.getState().login({ id: 'u1', documentId: 'u1', username: 'owner', email: 'owner@example.test', blocked: false, token: 'fixture' }); useAuthStore.setState({ accountId: 'a1' });
});
afterEach(() => { cleanup(); useAuthStore.getState().logout(); });

describe('app screenshot order', () => {
  function loaded() {
    const app = { documentId: 'app-a', title: 'Shots', app_url: 'https://example.com/a', developer: null, logo_url: null, description: null, download_url: null, price_tier: 'Free', platforms: [], user_recommendation_note: '', user_rating: null, screenshots: null };
    fixture.content.view.lists = [{ documentId: 'list-1', recommended_apps: [app] }];
    fixture.content.details.set('app-a', { detail: { id: 'app-a', revision: 1, category: 'apps', appScreenshots: { screenshotMediaIds: ['m1', 'm2', 'm3'] } } });
    fixture.content = { ...fixture.content };
  }

  it('shows move up and move down for every screenshot, with the ends disabled', async () => {
    loaded(); render(tree('/apps/list-1/edit/app-a'));
    expect(await screen.findAllByAltText('App screenshot')).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Move Screenshot 1 up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Screenshot 3 down' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Screenshot 2 up' })).toBeEnabled();
  });

  it('saves the rearranged order when editing an existing app', async () => {
    loaded(); vi.mocked(AppsClient.updateRecommendation).mockResolvedValue({} as never);
    render(tree('/apps/list-1/edit/app-a'));
    await screen.findAllByAltText('App screenshot');
    fireEvent.click(screen.getByRole('button', { name: 'Move Screenshot 3 up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move Screenshot 1 down' }));
    expect(mediaIds()).toEqual(['m3', 'm1', 'm2']);
    fireEvent.click(screen.getByRole('button', { name: 'Save app' }));
    await waitFor(() => expect(AppsClient.updateRecommendation).toHaveBeenCalledTimes(1));
    const patch = vi.mocked(AppsClient.updateRecommendation).mock.calls[0][1] as { appScreenshots: { screenshotMediaIds: string[] } };
    expect(patch.appScreenshots.screenshotMediaIds).toEqual(['m3', 'm1', 'm2']);
  });

  it('sends uploaded screenshots in the order the owner arranged them when creating', async () => {
    vi.mocked(AppsClient.observeCollection).mockResolvedValue({ detail: { id: 'list-1' } } as never);
    vi.mocked(AppsClient.prepareManualIntent).mockImplementation((parent, draft) => ({ parent, draft }) as never);
    vi.mocked(AppsClient.createManual).mockResolvedValue({ id: 'app-1' } as never);
    let next = 0; vi.mocked(AppsClient.upload).mockImplementation(async () => ({ id: `u${++next}` }) as never);
    const { container } = render(tree('/apps/list-1/add'));
    fireEvent.change(screen.getByLabelText('App title'), { target: { value: 'New' } });
    fireEvent.change(screen.getByLabelText('App URL'), { target: { value: 'https://example.com/new' } });
    const input = container.querySelector('input[type=file]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['a'], 'a.png', { type: 'image/png' }), new File(['b'], 'b.png', { type: 'image/png' })] } });
    await waitFor(() => expect(screen.getAllByAltText('App screenshot')).toHaveLength(2));
    fireEvent.click(screen.getByRole('button', { name: 'Move Screenshot 2 up' }));
    expect(mediaIds()).toEqual(['u2', 'u1']);
    fireEvent.click(screen.getByRole('button', { name: 'Save app' }));
    await waitFor(() => expect(AppsClient.createManual).toHaveBeenCalled());
    expect((vi.mocked(AppsClient.prepareManualIntent).mock.calls[0][1] as { screenshotMediaIds: string[] }).screenshotMediaIds).toEqual(['u2', 'u1']);
  });

  it('announces the move for assistive technology', async () => {
    loaded(); render(tree('/apps/list-1/edit/app-a'));
    await screen.findAllByAltText('App screenshot');
    fireEvent.click(screen.getByRole('button', { name: 'Move Screenshot 2 down' }));
    expect(screen.getByRole('status', { hidden: true }).textContent).toBe('Screenshot 2 moved to position 3 of 3.');
  });
});
