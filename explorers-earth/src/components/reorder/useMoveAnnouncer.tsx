import { useCallback, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { fillTemplate } from './moveItem';

/**
 * For lists that already render their own move buttons: announce a completed move through a
 * polite live region. Render `region` once inside the list's container.
 */
export function useMoveAnnouncer(): { announce: (label: string, position: number, total: number) => void; region: ReactNode } {
  const { t } = useTranslation();
  const [message, setMessage] = useState('');
  const announce = useCallback((label: string, position: number, total: number) => {
    setMessage(fillTemplate(t('common.reorder.moved', { defaultValue: '{{item}} moved to position {{position}} of {{total}}.' }), { item: label, position, total }));
  }, [t]);
  const region = <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">{message}</div>;
  return { announce, region };
}
