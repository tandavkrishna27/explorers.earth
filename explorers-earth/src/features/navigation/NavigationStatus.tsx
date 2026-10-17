import { useTranslation } from 'react-i18next';

const explanations: Record<string, string> = {
  'not-public': 'Publish this category before pinning it.',
  'no-content': 'Publish at least one list in this category before making it public.',
  unknown: 'Could not verify publication. Refresh and try again.',
  'slot-limit': 'You can select up to 5 tabs, including Profile. Unpin another tab first.',
  'manual-required': 'Choose Manual mode in Settings before changing saved pins.',
  'invalid-pins': 'Saved navigation could not be verified. Refresh before changing pins.',
};

/** Shared, non-optimistic feedback for account-scoped category controls. */
export function NavigationStatus({ navigation }: { navigation: { error?: string; busy: boolean; authority?: unknown; refresh: () => Promise<void> } }) {
  const { t } = useTranslation();
  const message = navigation.error ? explanations[navigation.error] ?? navigation.error : undefined;
  const text = (key: string, fallback: string) => t(`settings.publicNavigation.${key}`, { defaultValue: fallback });
  if (message) return <div role="alert" className="px-4 py-3 text-sm text-dashboard-danger break-words">
    {explanations[navigation.error!] ? text(navigation.error!, message) : message}
    <button type="button" disabled={navigation.busy} onClick={() => void navigation.refresh()} className="ml-2 underline">{text('refresh', 'Refresh')}</button>
  </div>;
  if (navigation.busy) return <p role="status" className="px-4 py-2 text-sm">{text('saving', 'Saving category settings…')}</p>;
  if (!navigation.authority) return <p role="status" className="px-4 py-2 text-sm">{text('verifying', 'Verifying your account before changing category settings…')}</p>;
  return null;
}
