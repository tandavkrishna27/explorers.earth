export default function MusicNavLimitNotice({ maxSlots }: { maxSlots: number }) {
  return <aside role="status" className="mb-6 rounded-xl border border-amber-400/40 bg-amber-400/10 p-4 text-sm text-dashboard">
    Music is enabled but excluded from your {maxSlots}-item public navigation limit.
    <a href="/settings#public-navigation" className="ml-2 font-semibold underline">Reorder pinned navigation</a>
  </aside>;
}
