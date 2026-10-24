/**
 * PasteLinkField
 * A labelled URL field that reads the pasted (or blurred) link once and hands the parsed
 * metadata to `onPrefill`. The typed value always flows through `onChange`; a failed read
 * never blocks the form, it only says the person can fill the fields in themselves.
 */
import React, { useEffect, useId, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { linkPreviewUrlSchema, type LinkPreview } from '../../../tunes/shared/explorersLinkPreviewContract';
import { linkPreviewClient } from '../lib/linkPreviewClient';

interface PasteLinkFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onPrefill: (preview: LinkPreview) => void;
  placeholder?: string;
  disabled?: boolean;
}

const PasteLinkField: React.FC<PasteLinkFieldProps> = ({ label, value, onChange, onPrefill, placeholder = 'https://', disabled = false }) => {
  const { t } = useTranslation();
  const id = useId();
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const lastPreviewed = useRef<string | null>(null);
  const inFlight = useRef<AbortController | null>(null);
  useEffect(() => () => inFlight.current?.abort(), []);

  const read = async (raw: string) => {
    const url = raw.trim();
    if (!linkPreviewUrlSchema.safeParse(url).success || url === lastPreviewed.current) return;
    lastPreviewed.current = url;
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    setLoading(true);
    setFailed(false);
    try {
      const preview = await linkPreviewClient.preview(url, controller.signal);
      if (!controller.signal.aborted) onPrefill(preview);
    } catch {
      if (!controller.signal.aborted) setFailed(true);
    } finally {
      if (inFlight.current === controller) { inFlight.current = null; setLoading(false); }
    }
  };

  const errorId = `${id}-error`;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">{label}</label>
      <div className="relative">
        <input
          id={id}
          type="url"
          inputMode="url"
          className="min-h-[44px] w-full rounded-xl border border-dashboard-border bg-dashboard-muted px-3 pr-10 text-dashboard placeholder:text-dashboard-muted focus:border-dashboard-accent focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          aria-busy={loading || undefined}
          aria-describedby={failed ? errorId : undefined}
          onChange={(event) => onChange(event.target.value)}
          onPaste={(event) => {
            const pasted = event.clipboardData?.getData('text') ?? '';
            if (pasted) void read(pasted);
          }}
          onBlur={(event) => void read(event.target.value)}
        />
        {loading && (
          <Loader2 aria-label={t('linkPreview.reading')} size={18} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gray-500" />
        )}
      </div>
      {failed && <p id={errorId} className="mt-1 text-sm text-red-600">{t('linkPreview.failed')}</p>}
    </div>
  );
};

export default PasteLinkField;
