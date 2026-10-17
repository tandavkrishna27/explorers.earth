import { CSSProperties, FC, ReactNode } from "react";
import { createPortal } from "react-dom";
import CrossIcon from "../../assets/icons/CrossIcon";
import { usePublicCategoryThemeStyles } from "../../features/PublicHome/components/PublicCategoryThemeContext";

// types for modal component
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  type?: string;
}

const Modal: FC<ModalProps> = ({ isOpen, onClose, children, type }) => {
  const categoryStyles = usePublicCategoryThemeStyles();
  const modalAvailableHeight = 'min(95dvh, calc(100dvh - var(--modal-gutter)))';
  // edge case when modal is not open or the state is false
  if (!isOpen) return null;

  return createPortal(
    <div 
      data-category-modal={categoryStyles ? true : undefined}
      className={`${categoryStyles ? 'fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 text-[var(--category-text)] backdrop-blur-sm p-2 sm:p-4' : 'dashboard-theme fixed inset-0 z-[9999] flex items-center justify-center bg-dashboard-overlay backdrop-blur-sm p-2 sm:p-4'} ${
        type === 'crop' ? 'bg-black/80' : ''
      }`}
      style={{
        ...categoryStyles,
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        data-modal-wrapper
        className="relative flex min-h-0 min-w-0 max-w-full flex-col [--modal-gutter:1rem] sm:[--modal-gutter:2rem]"
        style={{
          '--modal-available-height': modalAvailableHeight,
          width: type === 'crop' ? 'clamp(360px, 85vw, 1000px)' : 'clamp(360px, 98vw, 800px)',
          maxHeight: 'var(--modal-available-height)',
        } as CSSProperties}
        onClick={(e) => e.stopPropagation()}
      >
        {type !== "crop" && (
          <div className="relative h-[60px] shrink-0" data-modal-close-slot>
            <button
              type="button"
              aria-label="Close dialog"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className={categoryStyles ? "absolute right-2 top-2 z-20 flex min-h-11 min-w-11 items-center justify-center rounded-full border border-[var(--category-control-border)] bg-[var(--category-panel)] p-2 text-[var(--category-text)] backdrop-blur-sm transition-colors duration-200 hover:border-[var(--category-accent)] hover:text-[var(--category-muted)] focus-visible:!outline focus-visible:!outline-2 focus-visible:!outline-[var(--category-focus)]" : "absolute right-2 top-2 z-20 flex min-h-11 min-w-11 items-center justify-center rounded-full border border-dashboard bg-dashboard-sidebar p-2 text-dashboard backdrop-blur-sm transition-colors duration-200 hover:border-dashboard-accent hover:text-dashboard-light"}
            >
              <CrossIcon stroke={categoryStyles ? "currentColor" : "#ffffff"} size="5" />
            </button>
          </div>
        )}
        
        <div
          data-modal-panel
          className={`${categoryStyles ? 'bg-[var(--category-panel)] backdrop-blur-sm rounded-2xl border-2 border-[var(--category-control-border)] w-full' : 'bg-dashboard-sidebar backdrop-blur-sm rounded-2xl border-2 border-gray-600 w-full'} ${
            type === "crop" 
              ? "p-0" 
              : "p-0"
          } relative my-auto min-h-0 min-w-0 max-w-full transform overflow-x-hidden overflow-y-auto transition-all duration-300 ease-out`}
          style={{
            width: '100%',
            minWidth: 0,
            maxWidth: '100%',
            minHeight: type === "crop" ? 'min(clamp(400px, 60vh, 80vh), var(--modal-available-height))' : 0,
            maxHeight: type === "crop" ? 'var(--modal-available-height)' : 'calc(var(--modal-available-height) - 60px)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={categoryStyles ? "modal-content text-[var(--category-text)] font-poppins" : "modal-content text-dashboard font-poppins"}>{children}</div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default Modal;
