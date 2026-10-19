import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { publicProfileRetryAfterMs } from "../api/publicProfileGatewayClient";

const MAX_AUTO_RETRIES = 3;
const DEFAULT_RETRY_MS = 10_000;

/**
 * Shown when the public profile could not be loaded for a reason that is not "does not exist"
 * (rate limited, server error, offline). Retries on its own after the server's Retry-After
 * (default 10 s, at most 3 times) and always offers a manual retry.
 */
export default function PublicProfileLoadError({ error, onRetry }: { error: unknown; onRetry: () => Promise<void> }) {
  const { t } = useTranslation();
  const [retrying, setRetrying] = useState(false);
  const autoRetries = useRef(0);
  const message = error instanceof Error ? error.message : "";
  const rateLimited = message === "PUBLIC_PROFILE_429";
  const retryAfterMs = publicProfileRetryAfterMs(error);

  const retry = useCallback(() => {
    setRetrying(true);
    void onRetry().finally(() => setRetrying(false));
  }, [onRetry]);

  useEffect(() => {
    if (autoRetries.current >= MAX_AUTO_RETRIES) return;
    const timer = window.setTimeout(() => { autoRetries.current += 1; retry(); }, Math.max(retryAfterMs ?? DEFAULT_RETRY_MS, 1_000));
    return () => window.clearTimeout(timer);
  }, [error, retry, retryAfterMs]);

  return (
    <div role="alert" data-testid="public-profile-load-error" className="min-h-screen flex items-center justify-center bg-black text-white px-4">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-xl font-bold">{t("publicProfile.loadError.title", "This page could not be loaded")}</h1>
        <p className="text-sm text-gray-400">
          {rateLimited
            ? t("publicProfile.loadError.rateLimited", "Too many requests right now. We will try again shortly.")
            : t("publicProfile.loadError.body", "Something went wrong while loading this page. It still exists; please try again.")}
        </p>
        <button type="button" onClick={retry} disabled={retrying} className="px-4 py-2 rounded-lg bg-purple-600 disabled:opacity-60">
          {retrying ? t("publicProfile.loadError.retrying", "Retrying...") : t("publicProfile.loadError.retry", "Try again")}
        </button>
      </div>
    </div>
  );
}
