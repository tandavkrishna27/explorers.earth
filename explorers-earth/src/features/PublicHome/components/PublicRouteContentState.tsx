import type { ReactNode } from "react";
import { usePublicCategoryThemeStyles } from "./PublicCategoryThemeContext";

type QueryErrorLike = { message?: string } | null | undefined;

type PublicRouteErrorStateProps = {
  title: string;
  error: QueryErrorLike;
  onRetry: () => unknown;
  backAction?: ReactNode;
};

type PublicRouteRetry = (() => unknown) | null | undefined;

export function isNonNullObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isPublicProfileNotFound(error: unknown): boolean {
  return error instanceof Error && error.message === "PUBLIC_PROFILE_404";
}

export async function settlePublicRouteRetries(...retries: PublicRouteRetry[]) {
  await Promise.allSettled(
    retries
      .filter((retry): retry is () => unknown => typeof retry === "function")
      .map((retry) => Promise.resolve().then(retry)),
  );
}

export function PublicRouteErrorState({
  title,
  error,
  onRetry,
  backAction,
}: PublicRouteErrorStateProps) {
  const categoryStyles = usePublicCategoryThemeStyles();
  void error;
  return (
    <div className="flex min-h-[55vh] items-center justify-center px-6 py-16 text-center">
      <div className="max-w-md">
        <h2 className="text-xl font-semibold text-current">{title}</h2>
        <p className="mt-2 text-sm text-current opacity-70">
          Please try again. If the problem continues, come back later.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => void settlePublicRouteRetries(onRetry)}
            className={`min-h-11 rounded-xl px-5 py-2 text-sm font-semibold transition-opacity hover:opacity-85 ${categoryStyles
              ? "focus-visible:!outline focus-visible:!outline-2 focus-visible:!outline-offset-2 focus-visible:!outline-[var(--category-focus)] focus-visible:!transform-none"
              : "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            }`}
            style={{
              background: "var(--text-primary, currentColor)",
              color: "var(--bg-page, #090d16)",
              outlineColor: "var(--public-chrome-focus, currentColor)",
            }}
          >
            Retry
          </button>
          {backAction}
        </div>
      </div>
    </div>
  );
}

export function PublicRoutePartialNotice({ message }: { message: string }) {
  return (
    <div
      role="status"
      className="mx-auto mb-4 max-w-5xl rounded-xl border border-current/30 bg-transparent px-4 py-3 text-sm text-current"
    >
      {message}
    </div>
  );
}

export function PublicRouteLoadingState({ label }: { label: string }) {
  return (
    <div
      aria-busy="true"
      aria-label={label}
      className="min-h-[55vh] px-6 py-16"
      style={{ background: "var(--bg-page, #090d16)", color: "var(--text-primary, #fff)" }}
    >
      <div className="mx-auto max-w-4xl animate-pulse space-y-5">
        <div className="h-44 rounded-2xl bg-[var(--category-skeleton,rgba(255,255,255,.05))]" />
        <div className="h-5 w-48 rounded bg-[var(--category-skeleton,rgba(255,255,255,.1))]" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-28 rounded-xl bg-[var(--category-skeleton,rgba(255,255,255,.05))]" />
          ))}
        </div>
      </div>
    </div>
  );
}
