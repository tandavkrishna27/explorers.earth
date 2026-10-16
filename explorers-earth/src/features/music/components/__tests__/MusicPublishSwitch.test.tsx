import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MusicPublishSwitch } from '../MusicPublishSwitch';
import { useCategoryNavigation } from '../../../navigation/CategoryNavigationProvider';
import { musicBackend, musicPublishHarness, readyMusic } from '../../__tests__/musicPublishHarness';
import { writtenPins, writtenVisibility } from '../../../navigation/__tests__/surfaceHarness';
import { musicIdentityCoordinator } from '../../musicApi';
import useAuthStore from '../../../../store/store';
import { MusicClientError } from '../../../../lib/localTunesApiClient';
export function PublicationSwitch() { const { authority } = useCategoryNavigation(); return <MusicPublishSwitch origin={authority} ready />; }
describe('Music controlled publication switch', () => {
  beforeEach(async () => { vi.restoreAllMocks(); sessionStorage.clear(); musicIdentityCoordinator.reset(); await readyMusic(); });
  afterEach(() => { cleanup(); useAuthStore.getState().logout(); musicIdentityCoordinator.reset(); });
  it('publishes by keyboard, then Off removes only saved Music and never changes playlists', async () => {
    const backend = musicBackend(); const h = musicPublishHarness(<PublicationSwitch />, { pinned_nav_tabs: ['public_profile', 'public_music', 'public_books'] }); await h.ready();
    const control = await screen.findByRole('switch', { name: 'Music public visibility' });
    await waitFor(() => expect(control).toBeEnabled());
    control.focus(); await userEvent.keyboard('[Space]');
    await waitFor(() => expect(control).toHaveAttribute('aria-checked', 'true'));
    await userEvent.click(control); await waitFor(() => expect(control).toHaveAttribute('aria-checked', 'false'));
    expect(h.writes).toHaveLength(2);
    // On publishes Music; Off takes it private and touches no other pin.
    expect(writtenVisibility(h.writes[0].variables.input, 'public_music')).toBe(true);
    expect(writtenPins(h.writes[0].variables.input)).toEqual(['public_profile', 'public_music', 'public_books']);
    expect(writtenVisibility(h.writes[1].variables.input, 'public_music')).toBe(false);
    expect(writtenPins(h.writes[1].variables.input)).toEqual(['public_profile', 'public_books']);
    expect(backend.publish.mock.calls.map(call => call[0])).toEqual(['public', 'private']);
    expect(control).toHaveAttribute('aria-describedby'); expect(control).toHaveClass('h-11', 'w-11');
  });
  it.each([['No', 'public'], ['Yes', 'unlisted'], ['No', 'unlisted']] as const)('offers Make private directly for legacy %s/%s while unchecked', async (profile, mode) => {
    const backend = musicBackend(mode); const h = musicPublishHarness(<PublicationSwitch />, { public_music: profile }); await h.ready();
    const revoke = await screen.findByRole('button', { name: 'Make private' });
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false'); fireEvent.click(revoke);
    await screen.findByText('Music is private.');
    expect(backend.publish.mock.calls.map(call => call[0])).toEqual(['private']);
    expect(h.writes.every(write => writtenVisibility(write.variables.input, 'public_music') !== true)).toBe(true);
  });
  it('removes only the saved Music target on deliberate Off even while automatic pinning is enabled', async () => {
    const backend = musicBackend('public');
    const h = musicPublishHarness(<PublicationSwitch />, { public_music: 'Yes', auto_pinning: true, pinned_nav_tabs: ['public_profile', 'public_books', 'public_music', 'public_games'] }); await h.ready();
    const control = screen.getByRole('switch'); await waitFor(() => expect(control).toBeChecked());
    fireEvent.click(control); await screen.findByText('Music is private.');
    expect(h.writes).toHaveLength(1);
    // Only the saved Music pin is removed, even with automatic pinning on.
    expect(writtenVisibility(h.writes[0].variables.input, 'public_music')).toBe(false);
    expect(writtenPins(h.writes[0].variables.input)).toEqual(['public_profile', 'public_books', 'public_games']);
    expect(h.saved.auto_pinning).toBe(true); expect(backend.publish.mock.calls.map(call => call[0])).toEqual(['private']);
  });
  it('shows a keyboard-accessible failure and resumes the same uncertain command key', async () => {
    const backend = musicBackend(); backend.publish.mockRejectedValueOnce(new Error('private transport details'));
    const h = musicPublishHarness(<PublicationSwitch />); await h.ready();
    const control = screen.getByRole('switch'); await waitFor(() => expect(control).toBeEnabled()); fireEvent.click(control);
    expect(await screen.findByRole('alert')).toHaveTextContent(/not confirmed/); expect(control).toHaveAttribute('aria-checked', 'false'); expect(control).toBeDisabled();
    const retry = screen.getByRole('button', { name: 'Retry previous action' }); retry.focus(); await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(control).toHaveAttribute('aria-checked', 'true'));
    expect(backend.publish.mock.calls[1][1]).toBe(backend.publish.mock.calls[0][1]);
  });
  it('requires explicit confirmation after replay expiry and never rotates on Resume', async () => {
    const backend = musicBackend(); backend.publish.mockRejectedValueOnce(new MusicClientError('AUTH_UNAVAILABLE', 409, 'expired', undefined, 'PUBLICATION_REPLAY_EXPIRED'));
    const h = musicPublishHarness(<PublicationSwitch />); await h.ready(); const control = screen.getByRole('switch'); await waitFor(() => expect(control).toBeEnabled()); fireEvent.click(control);
    const confirm = await screen.findByRole('button', { name: 'Confirm new public action' });
    expect(control).toBeDisabled(); expect(screen.queryByRole('button', { name: 'Retry previous action' })).not.toBeInTheDocument();
    expect(backend.publish).toHaveBeenCalledTimes(1); fireEvent.click(confirm);
    await waitFor(() => expect(control).toHaveAttribute('aria-checked', 'true'));
    expect(backend.publish.mock.calls[1][1]).not.toBe(backend.publish.mock.calls[0][1]);
  });
});
