import type { MusicPinVerifier } from '../navigation/accountNavigationWriter';
import { musicIdentityCoordinator } from './musicApi';
import { musicWorkspaceClient } from '../../hooks/useTunesDashboard';
import { publicMusicClient } from './publicMusicClient';

/** Runs inside the existing pin transaction: read-only, no reentrant writer/coordinator. */
export const verifyMusicPin: MusicPinVerifier = async (transaction, origin) => {
  const current = () => transaction.isCurrent() && musicIdentityCoordinator.isReadyFor(origin);
  if (!current()) return 'unknown';
  try {
    const account = await transaction.read();
    if (!current() || account.scope.userDocumentId !== origin.userDocumentId || account.scope.accountDocumentId !== origin.accountDocumentId) return 'unknown';
    if (account.visibility.public_music !== 'Yes') return 'not-public';
    const dashboard = await musicWorkspaceClient.loadDashboard();
    if (!current()) return 'unknown';
    if (dashboard.publication.mode !== 'public') return 'not-public';
    const descriptor = await publicMusicClient.discover(origin.accountDocumentId);
    if (!current()) return 'unknown';
    return descriptor.publication.mode === 'public' && descriptor.publication.publicSlug === dashboard.publication.publicSlug ? 'public' : 'unknown';
  } catch { return 'unknown'; }
};

export type MusicPublicationReadinessState = "hidden" | "setup-required" | "published-hidden" | "live" | "unavailable";

export interface MusicPublicationReadiness {
  state: MusicPublicationReadinessState;
  label: string;
  primaryAction: string;
  secondaryAction: string;
}

export function getMusicPublicationReadiness(input: {
  profilePreference: "Yes" | "No" | null | undefined;
  publicationMode: "private" | "unlisted" | "public";
  statusAvailable: boolean;
}): MusicPublicationReadiness {
  if (!input.statusAvailable) return { state: "unavailable", label: "Status unavailable", primaryAction: "Retry status", secondaryAction: "Open Music workspace" };
  const profileEnabled = input.profilePreference === "Yes";
  const published = input.publicationMode === "public";
  if (profileEnabled && published) return { state: "live", label: "Live on profile", primaryAction: "View as guest", secondaryAction: "Copy public link" };
  if (profileEnabled) return { state: "setup-required", label: "Profile enabled, Music not public", primaryAction: "Make Music public", secondaryAction: "Hide profile Music" };
  if (published) return { state: "published-hidden", label: "Public link active, profile tab hidden", primaryAction: "Show on profile", secondaryAction: "Copy public link" };
  return { state: "hidden", label: "Hidden from profile", primaryAction: "Enable profile Music", secondaryAction: "Open sharing settings" };
}
