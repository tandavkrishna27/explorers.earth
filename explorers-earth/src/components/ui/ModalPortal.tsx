import { type ReactNode } from "react";
import { createPortal } from "react-dom";
import { usePublicCategoryThemeStyles } from "../../features/PublicHome/components/PublicCategoryThemeContext";

/**
 * Renders a full-screen overlay into document.body.
 *
 * Public pages put their content in `.public-profile-content-layer`, which is isolated at
 * z-index 0 while the public nav lives in a sibling layer at z-80. An overlay rendered
 * inside the content layer can never rise above the nav no matter how large its own
 * z-index is, so Share / Get App / Website were covered. Portalling out of that stacking
 * context puts the overlay on the root context, where its own z-index (150) beats the nav.
 */
export default function ModalPortal({ children }: { children: ReactNode }) {
  const categoryStyles = usePublicCategoryThemeStyles();
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      data-modal-portal
      className={categoryStyles ? "contents" : "dashboard-theme contents"}
      style={categoryStyles ?? undefined}
    >
      {children}
    </div>,
    document.body,
  );
}
