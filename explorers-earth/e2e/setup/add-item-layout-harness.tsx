import { AddItemPage } from '../../src/features/shared/addItem';

// Stands in for the Movies add route in the dashboard-layout fixture only, so the shared WP4
// add template is measured inside the real dashboard shell before any category adopts it.
export default function AddItemLayoutHarness() {
  return (
    <AddItemPage title="Add a movie" backLabel="Back to Public movies" onBack={() => {}} mode="manual"
      bar={{ onCancel: () => {}, onSave: () => {}, onSaveAndAddAnother: () => {}, saving: null, canSave: true }}>
      {Array.from({ length: 8 }, (_, index) => (
        <label key={index} className="grid gap-1 text-sm">
          Field {index + 1}
          <input className="rounded-xl border border-white/10 bg-transparent px-3 py-2" />
        </label>
      ))}
    </AddItemPage>
  );
}
