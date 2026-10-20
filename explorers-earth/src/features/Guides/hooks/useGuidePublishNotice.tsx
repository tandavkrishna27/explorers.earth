import {useCallback, useState, type ReactNode} from 'react';
import {toast} from 'sonner';
import {CategoryVisibilityModal} from '../../../components/CategoryVisibilityModal';
import {useCategoryNavigation} from '../../navigation/CategoryNavigationProvider';
import type {IntentAuthority} from '../../navigation/categoryNavigationPolicy';
import useAuthStore from '../../../store/store';

// UAT GDE-07. A guide that was just created is still a draft, so asking "Make your Guides
// public?" at that point is premature and says nothing about the guide. What matters is the
// moment a guide is PUBLISHED into a Guides category that is still hidden: that is when the
// owner expects visitors to see it, and when it will not be visible. So publishing a guide
// into a hidden category always says so, and the first time it happens the owner is also
// offered the category switch.
const PROMPTED_KEY = 'explorers:guides-category-prompted:';

function alreadyPrompted(accountId: string | null): boolean {
  try { return window.localStorage.getItem(PROMPTED_KEY + (accountId ?? '')) === '1'; } catch { return false; }
}
function rememberPrompted(accountId: string | null) {
  try { window.localStorage.setItem(PROMPTED_KEY + (accountId ?? ''), '1'); } catch { /* per-viewer convenience only */ }
}

export const GUIDE_PUBLISHED_HIDDEN_MESSAGE = "Guide published. It won't be visible to visitors until your Guides category is public.";

/**
 * Call `notifyPublished()` after a guide has been published. Render `modal` once on the page.
 * It reports success, or the hidden-category warning, and opens the category prompt the
 * first time that warning applies to this account.
 */
export function useGuidePublishNotice(publishedMessage = 'Guide published'): {notifyPublished: () => void; modal: ReactNode} {
  const navigation = useCategoryNavigation();
  const accountId = useAuthStore((state) => state.accountId);
  const [prompt, setPrompt] = useState<IntentAuthority | null>(null);

  const notifyPublished = useCallback(() => {
    // Without a loaded account snapshot the category's state is unknown, so no claim is made.
    const visibility = navigation.snapshot?.visibility.public_guides;
    if (visibility === undefined || visibility === 'Yes') {
      toast.success(publishedMessage);
      return;
    }
    toast.info(GUIDE_PUBLISHED_HIDDEN_MESSAGE, {duration: 8000});
    if (navigation.authority && !alreadyPrompted(accountId)) {
      rememberPrompted(accountId);
      setPrompt(navigation.authority);
    }
  }, [navigation.snapshot, navigation.authority, accountId, publishedMessage]);

  const modal = prompt ? (
    <CategoryVisibilityModal
      isOpen
      onClose={() => setPrompt(null)}
      categoryName="Guides"
      visibilityField="public_guides"
      origin={prompt}
      accountDocumentId={prompt.accountDocumentId ?? ''}
    />
  ) : null;

  return {notifyPublished, modal};
}
