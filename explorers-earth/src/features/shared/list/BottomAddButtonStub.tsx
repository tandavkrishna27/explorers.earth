// Temporary stand-in for WP2's BottomAddButton.
// swap for components/controls/* when WP2 merges (components/controls/BottomAddButton.tsx).
type Props = { label: string; onClick: () => void; hidden?: boolean; "data-testid"?: string };

export default function BottomAddButtonStub({ label, onClick, hidden, "data-testid": testId }: Props) {
  if (hidden) return null;
  return (
    <button type="button" data-testid={testId} onClick={onClick}
      className="fixed inset-x-4 bottom-4 z-30 min-h-12 rounded-xl bg-blue-400 px-4 text-white shadow-lg sm:hidden">
      {label}
    </button>
  );
}
