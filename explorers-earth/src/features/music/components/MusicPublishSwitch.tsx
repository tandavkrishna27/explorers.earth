import { useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import Switch from '../../../components/ui/Switch';
import type { IntentAuthority } from '../../navigation/categoryNavigationPolicy';
import { useMusicPublish } from '../MusicPublishProvider';
import type { PublishState } from '../musicPublishCoordinator';

export function MusicPublishSwitch({ origin, ready, compactLabel }: { origin: IntentAuthority | undefined; ready: boolean; compactLabel?: ReactNode }) {
  const music = useMusicPublish(origin, { ready });
  const statusId = useId();
  const { t, i18n } = useTranslation();
  const text = (key: string, fallback: string) => t(`music.publication.${key}`, { defaultValue: fallback });
  const state = music.state;
  const status: Record<PublishState['kind'], string> = {
    loading: text('checking', 'Checking Music publication…'), published: text('published', 'Music is public.'),
    draft: text('private', 'Music is private.'), saving: text('saving', 'Saving and verifying Music publication…'),
    'needs-attention': text('attention', 'Music sharing needs attention. Review or make it private.'),
    unknown: state.errorCode === 'scope-changed' ? text('notReady', 'Music is not ready for this account. Other settings remain available.') : text('unknown', 'Music publication was not confirmed. Refresh or retry the previous action.'),
    conflict: text('conflict', 'Music changed or the previous action expired. Confirm a new action after reviewing the current state.'),
  };
  const disabled = !music.canChange || state.kind === 'loading' || state.kind === 'unknown' || state.kind === 'conflict' || !!state.desired;
  const recovery = music.canRecover;
  const compact = compactLabel !== undefined;
  const needsAttention = ['unknown', 'needs-attention', 'conflict'].includes(state.kind);
  const buttonClass = 'min-h-11 rounded-lg px-3 text-sm underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dashboard-accent';
  return <div dir={i18n.dir?.()} className="min-w-0 max-w-full break-words">
    <div className={compact ? 'flex min-w-0 items-center justify-between gap-2 py-1.5' : 'flex min-w-0 items-center gap-2'}>
      {compact && compactLabel}
      <Switch checked={state.confirmed?.profile === 'Yes' && state.confirmed.mode === 'public'} ariaLabel={text('label', 'Music public visibility')}
        ariaDescribedBy={statusId} loading={state.kind === 'saving'} disabled={disabled} onChange={checked => void music.request(checked ? 'public' : 'private')} />
      {!compact && <span className="text-xs font-semibold text-dashboard">{text('visibility', 'Public Visibility')}</span>}
    </div>
    <p id={statusId} role={state.errorCode && state.errorCode !== 'scope-changed' || state.kind === 'conflict' ? 'alert' : 'status'} tabIndex={state.errorCode ? 0 : undefined} className={compact && !needsAttention ? 'sr-only' : 'text-sm text-dashboard-light focus-visible:ring-2 focus-visible:ring-dashboard-accent'}>{status[state.kind]}</p>
    {needsAttention && <div className="flex flex-wrap gap-1">
      <button type="button" disabled={!recovery} className={buttonClass} onClick={() => void music.refresh()}>{text('refresh', 'Refresh Music status')}</button>
      {state.desired && state.kind !== 'conflict' && <button type="button" disabled={!recovery} className={buttonClass} onClick={() => void music.resume()}>{text('retry', 'Retry previous action')}</button>}
      {state.kind === 'needs-attention' && !state.desired && <button type="button" disabled={!recovery} className={buttonClass} onClick={() => void music.request('private')}>{text('makePrivate', 'Make private')}</button>}
      {state.kind === 'conflict' && <>
        {state.desired && state.desired !== 'private' && <button type="button" disabled={!recovery} className={buttonClass} onClick={() => void music.request(state.desired!)}>{text(`confirm_${state.desired}`, `Confirm new ${state.desired} action`)}</button>}
        <button type="button" disabled={!recovery} className={buttonClass} onClick={() => void music.request('private')}>{text('confirm_private', 'Confirm new private action')}</button>
      </>}
    </div>}
  </div>;
}
