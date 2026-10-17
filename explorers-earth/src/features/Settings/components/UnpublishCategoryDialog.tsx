import { useEffect, useRef, type KeyboardEvent } from "react";

type UnpublishCategoryDialogProps = {
  open: boolean;
  categoryName: string;
  pending: boolean;
  error?: string;
  onCancel(): void;
  onConfirm(): void;
};

export function UnpublishCategoryDialog({
  open,
  categoryName,
  pending,
  error,
  onCancel,
  onConfirm,
}: UnpublishCategoryDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const cancel = () => {
    if (pending) return;
    onCancel();
    previousFocus.current?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      cancel();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled])") ?? []);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/70 p-4" onMouseDown={cancel}>
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="unpublish-category-title"
        className="w-full max-w-md rounded-xl border border-dashboard-border bg-dashboard-sidebar p-6 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <h2 id="unpublish-category-title" className="text-lg font-bold text-dashboard">Unpublish {categoryName}</h2>
        <p className="mt-2 text-sm text-dashboard-light">
          This removes {categoryName} from your public profile and it will be removed from your public navigation. Your recommendations stay saved.
        </p>
        {error && <p role="alert" className="mt-3 text-sm text-red-400">{error}</p>}
        <div className="mt-6 flex justify-end gap-3">
          <button ref={cancelRef} type="button" disabled={pending} onClick={cancel} className="rounded-lg px-4 py-2 text-sm font-medium text-dashboard-muted disabled:opacity-60">
            Cancel
          </button>
          <button type="button" disabled={pending} onClick={onConfirm} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {pending ? `Unpublishing ${categoryName}` : `Unpublish ${categoryName}`}
          </button>
        </div>
      </section>
    </div>
  );
}
