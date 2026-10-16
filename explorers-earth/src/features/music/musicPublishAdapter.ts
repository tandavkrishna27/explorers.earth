import type { MusicPublicationOwnerScope } from './musicPublicationCommandRegistry';
import type { createMusicWorkspaceClient } from './musicWorkspaceClient';
import type { Transaction } from '../navigation/accountNavigationWriter';
import { planCategoryIntent, type IntentAuthority, type NavigationSnapshot } from '../navigation/categoryNavigationPolicy';
import type { Ports } from './musicPublishCoordinator';
import { publicMusicClient } from './publicMusicClient';
import { MusicClientError } from '../../lib/localTunesApiClient';
export type AdapterInput = {
    workspace: ReturnType<typeof createMusicWorkspaceClient>;
    scope: MusicPublicationOwnerScope;
    origin: IntentAuthority;
    isCurrent: () => boolean;
    transaction: Transaction;
};
export function createMusicPublishAdapter(input: AdapterInput): Ports {
    const { scope, origin, transaction, workspace } = input;
    const isCurrent = () => input.isCurrent() && transaction.isCurrent()
        && scope.userDocumentId === origin.userDocumentId && scope.accountDocumentId === origin.accountDocumentId;
    const assertCurrent = () => { if (!isCurrent())
        throw new Error('Music account changed.'); };
    const assertAccount = (snapshot: NavigationSnapshot) => {
        assertCurrent();
        if (snapshot.scope.userDocumentId !== scope.userDocumentId || snapshot.scope.accountDocumentId !== scope.accountDocumentId
            || !['Yes', 'No', null].includes(snapshot.visibility.public_music))
            throw new Error('Music account could not be verified.');
        return snapshot;
    };
    const guarded = async <T>(work: () => Promise<T>): Promise<T> => {
        assertCurrent();
        try {
            const result = await work();
            assertCurrent();
            return result;
        }
        catch (error) {
            if (error instanceof MusicClientError)
                throw error;
            throw new Error('Music operation was not confirmed.');
        }
    };
    return {
        isCurrent,
        read: () => guarded(async () => {
            const latest = assertAccount(await transaction.read());
            const dashboard = await workspace.loadDashboard();
            return { scope: { userDocumentId: scope.userDocumentId, accountDocumentId: scope.accountDocumentId }, profile: latest.visibility.public_music,
                mode: dashboard.publication.mode, publicSlug: dashboard.publication.publicSlug, savedPins: latest.savedPins };
        }),
        saveProfile: (value) => guarded(async () => {
            if (value === 'Yes') {
                const saved = assertAccount(await transaction.commit({ public_music: 'Yes' }));
                if (saved.visibility.public_music !== 'Yes')
                    throw new Error('Music profile was not confirmed.');
                return;
            }
            const latest = assertAccount(await transaction.read());
            const decision = planCategoryIntent(latest, { category: 'public_music', action: 'unpublish' });
            if (decision.kind === 'write') {
                const saved = assertAccount(await transaction.commit(decision.patch));
                if (saved.visibility.public_music !== 'No' || (decision.patch.pinned_nav_tabs !== undefined
                    && JSON.stringify(saved.savedPins) !== JSON.stringify(decision.patch.pinned_nav_tabs)) || decision.cleanupPending)
                    throw new Error('Music navigation cleanup pending.');
            }
            else if (decision.kind !== 'noop')
                throw new Error('Music navigation save blocked.');
        }),
        publish: (mode, key) => guarded(() => workspace.setPublication(mode, key)),
        discover: (publicSlug) => guarded(async () => {
            const descriptor = await publicMusicClient.discover(scope.accountDocumentId);
            if (descriptor.publication.mode !== 'public' || descriptor.publication.publicSlug !== publicSlug)
                throw new Error('Music discovery did not match.');
        }),
    };
}
