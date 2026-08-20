/**
 * Recoverable error screen shown by ProtectedRoute when the onboarding-status
 * check fails with no data.
 *
 * Without this the guard would render a loader forever (the Apollo client in
 * main.tsx has no retry link), locking an authenticated user out of every
 * protected route until they manually reload. This gives them a way out:
 * retry the check, or log out.
 */
interface OnboardingCheckErrorProps {
  onRetry: () => void;
  onLogout: () => void;
}

const OnboardingCheckError = ({ onRetry, onLogout }: OnboardingCheckErrorProps) => {
  const savedTheme = localStorage.getItem("dashboard-theme");
  const isDark = savedTheme === "dark" || !savedTheme;

  return (
    <div
      className={`dashboard-theme ${isDark ? "dashboard-theme-dark" : ""} bg-dashboard-bg min-h-screen flex items-center justify-center p-6`}
    >
      <div className="max-w-sm w-full text-center rounded-2xl border border-dashboard bg-dashboard-sidebar p-6 shadow-dashboard-elevated">
        <h1 className="text-lg font-semibold text-dashboard">
          Couldn&apos;t load your account
        </h1>
        <p className="mt-2 text-sm text-dashboard-muted">
          We couldn&apos;t reach the server to check your account. Check your
          connection and try again.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 w-full rounded-xl bg-dashboard-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
        >
          Try again
        </button>
        <button
          type="button"
          onClick={onLogout}
          className="mt-2 w-full rounded-xl px-4 py-2.5 text-sm font-medium text-dashboard-muted transition hover:text-dashboard"
        >
          Log out
        </button>
      </div>
    </div>
  );
};

export default OnboardingCheckError;
