import { memo, useId, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useDialogA11y } from "../../hooks/useDialogA11y";

interface UnsavedChangesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  onDiscard: () => void;
}

/**
 * Unsaved Changes Confirmation Modal
 * 
 * Purpose: Shows a warning modal when users attempt to navigate away
 * from a form with unsaved changes, giving them options to save or discard.
 */
const UnsavedChangesModal: React.FC<UnsavedChangesModalProps> = memo(({
  isOpen,
  onClose,
  onSave,
  onDiscard,
}) => {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const messageId = useId();
  useDialogA11y(isOpen, dialogRef, onClose);

  if (!isOpen) return null;

  return (
    <div
      ref={dialogRef}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={messageId}
      tabIndex={-1}
      className="dashboard-theme fixed inset-0 z-[9999] flex items-center justify-center bg-dashboard-overlay backdrop-blur-sm p-3 sm:p-4"
    >
      <div 
        className="bg-dashboard-sidebar backdrop-blur-sm rounded-2xl border border-white w-full max-w-sm sm:max-w-md mx-3 sm:mx-4 shadow-dashboard-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 sm:p-6">
          <div className="mb-4 sm:mb-6">
            <h3 id={titleId} className="text-lg sm:text-xl font-semibold text-dashboard mb-2 sm:mb-3">
              {t('modal.unsavedChanges.title', 'Unsaved Changes')}
            </h3>
            <p id={messageId} className="text-dashboard-light text-sm sm:text-base leading-relaxed">
              {t('modal.unsavedChanges.message', 'You have unsaved changes that will be lost if you navigate away. What would you like to do?')}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-3">
            {/* Mobile order (top to bottom): Save Changes (top), Discard Changes (middle), Cancel (bottom) */}
            {/* Desktop order (left to right): Cancel (leftmost), Discard Changes (middle), Save Changes (right) */}
            <button
              type="button"
              onClick={onSave}
              className="w-full sm:w-auto px-4 py-2 text-white bg-green-500 hover:bg-green-600 rounded-md transition-colors font-medium text-sm sm:text-base sm:px-6 order-1 sm:order-3"
            >
              {t('modal.unsavedChanges.save', 'Save Changes')}
            </button>
            <button
              type="button"
              onClick={onDiscard}
              className="w-full sm:w-auto px-4 py-2 text-white bg-red-500 hover:bg-red-600 rounded-md transition-colors font-medium text-sm sm:text-base sm:px-6 order-2 sm:order-2"
            >
              {t('modal.unsavedChanges.discard', 'Discard Changes')}
            </button>
            <button
              type="button"
              data-autofocus
              onClick={onClose}
              className="w-full sm:w-auto px-4 py-2 text-white bg-gray-500 hover:bg-gray-600 rounded-md transition-colors font-medium text-sm sm:text-base sm:px-6 order-3 sm:order-1"
            >
              {t('modal.unsavedChanges.cancel', 'Cancel')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

UnsavedChangesModal.displayName = 'UnsavedChangesModal';

export default UnsavedChangesModal;
