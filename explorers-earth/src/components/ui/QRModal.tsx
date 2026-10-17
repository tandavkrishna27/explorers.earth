import { FC } from "react";
import { usePublicCategoryThemeStyles } from "../../features/PublicHome/components/PublicCategoryThemeContext";
import QRCode from "./QRCode";
import Button from "./Button";
import CopyIcon from "../../assets/icons/CopyIcon";
import { QRSize } from "../../utils/qrCodeService";

interface QRModalProps {
  isOpen: boolean;
  onClose: () => void;
  qrValue: string;
  onCopyLink: () => void;
  title?: string;
  qrSize?: QRSize; // Add configurable QR size
}

const QRModal: FC<QRModalProps> = ({
  isOpen,
  onClose,
  qrValue,
  onCopyLink,
  title = "QR Code",
  qrSize = "large", // Default to large instead of xl
}) => {
  const categoryStyles = usePublicCategoryThemeStyles();
  if (!isOpen) return null;

  return (
    <div className={categoryStyles ? "fixed w-full h-full inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center" : "fixed w-full h-full inset-0 backdrop-blur-sm z-50 flex items-center justify-center"}>
      <div
        className="relative rounded-lg h-full w-full flex items-center justify-center"
        style={{ ...(categoryStyles ? { backgroundColor: 'var(--category-panel)', color: 'var(--category-text)' } : {}), width: "90vw", height: "90vh" }}
      >
        <button
          onClick={onClose}
          className={categoryStyles ? "absolute top-4 right-4 z-50 p-2 rounded-full bg-[var(--category-panel)] hover:bg-[var(--category-hover)] shadow-[inset_0_0_0_1px_var(--category-control-border)] focus-visible:!outline focus-visible:!outline-2 focus-visible:!outline-[var(--category-focus)] transition-colors" : "absolute top-4 right-4 z-50 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"}
        >
          <svg
            className={categoryStyles ? "w-6 h-6 text-[var(--category-text)]" : "w-6 h-6 text-white"}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
        <div className="flex flex-col gap-10 items-center">
          {title && (
            <h3 className={categoryStyles ? "text-[var(--category-text)] text-xl font-poppins font-semibold" : "text-white text-xl font-poppins font-semibold"}>
              {title}
            </h3>
          )}
          <div className="bg-white p-4 rounded-lg">
            <QRCode
              value={qrValue}
              size={qrSize}
              className="transition-opacity duration-300"
            />
          </div>
          <Button
            btnText="Copy Link"
            variant="secondary"
            endIcon={<CopyIcon />}
            onClickHandler={onCopyLink}
          />
        </div>
      </div>
    </div>
  );
};

export default QRModal;
