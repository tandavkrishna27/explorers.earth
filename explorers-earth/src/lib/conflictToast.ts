import { toast } from "sonner";
import { sinceRevisionConflict } from "./revisionConflict";

export const CONFLICT_TOAST_ID = "revision-conflict";
// The command that lost the race rejects, and the screen that issued it then reports its
// own generic failure ("Failed to update visibility"). That must not sit next to, or
// replace, the real explanation, so generic error toasts raised in this window are dropped.
const SUPPRESS_GENERIC_MS = 1500;

type ErrorToast = typeof toast.error;
let showError: ErrorToast | undefined;

/** Idempotent. Routes every `toast.error` through the conflict window above. */
export function installConflictToastGuard(): void {
  if (showError) return;
  showError = toast.error;
  const original = showError;
  toast.error = ((message, data) =>
    sinceRevisionConflict() < SUPPRESS_GENERIC_MS ? CONFLICT_TOAST_ID : original(message, data)) as ErrorToast;
}

export function showRevisionConflictToast(message: string, reloadLabel: string, reload: () => void): void {
  (showError ?? toast.error)(message, {
    id: CONFLICT_TOAST_ID,
    duration: Infinity,
    action: { label: reloadLabel, onClick: reload },
  });
}
