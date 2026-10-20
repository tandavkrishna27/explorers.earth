import DeleteIcon from "../../../assets/icons/DeleteIcon";

/** The Remove control next to an image's Edit control. Rendered only when there is an image to remove. */
export default function RemoveMediaButton({ label, onRemove, disabled, testId }: {
  label: string; onRemove: () => void; disabled?: boolean; testId: string;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      data-testid={testId}
      disabled={disabled}
      onClick={onRemove}
      className="bg-black/60 p-2 rounded-full shadow-md text-white hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <DeleteIcon />
    </button>
  );
}
