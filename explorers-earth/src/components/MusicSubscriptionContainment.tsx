export const MUSIC_SUBSCRIPTION_FLOWS_ENABLED = false;

export function MusicSubscriptionUnavailable() {
  return (
    <main className="dashboard-theme min-h-screen bg-dashboard-bg px-4 py-16 text-white">
      <section className="mx-auto max-w-xl rounded-2xl border border-white/10 bg-dashboard-sidebar p-8 text-center">
        <h1 className="text-2xl font-semibold">Music subscriptions unavailable</h1>
        <p className="mt-3 text-sm text-dashboard-muted">
          Music subscription and quota changes are temporarily unavailable while account access is being upgraded.
        </p>
      </section>
    </main>
  );
}
