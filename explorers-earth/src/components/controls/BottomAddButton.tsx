import { useEffect, useState } from "react";
import useDeviceDetection from "../../hooks/useDeviceDetection";

export interface BottomAddButtonProps {
  /** Already translated, without the plus: "New list", "Add item", "Add to Day 2". */
  label: string;
  onClick: () => void;
  /** Hide on Share/Manage tabs and on an empty list (which shows its own large CTA). */
  hidden?: boolean;
}

/** Scroll distance from the top below which the button never shrinks (v5 mock: 10px). */
const SHRINK_AFTER_PX = 10;

/**
 * GL-08 phone Add: a full-width sticky bottom button (56px) above the bottom nav and the
 * safe area. Shrinks to 44px on scroll down and restores on scroll up. Phones only: the
 * phone layout scrolls the window (ResponsiveLayout), so it listens to window scroll.
 */
export function BottomAddButton({ label, onClick, hidden = false }: BottomAddButtonProps) {
  const { isDesktop } = useDeviceDetection();
  const [compact, setCompact] = useState(false);
  const active = !isDesktop && !hidden;

  useEffect(() => {
    if (!active) return;
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (y === last) return;
      setCompact(y > last && y > SHRINK_AFTER_PX);
      last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [active]);

  if (!active) return null;

  return (
    <div
      data-testid="bottom-add-bar"
      style={{ bottom: "var(--bottom-nav-height, 64px)" }}
      className="pointer-events-none fixed inset-x-0 z-40 bg-[linear-gradient(transparent,var(--dash-bg)_30%)] pb-2.5 pt-2 ps-[max(12px,env(safe-area-inset-left,0px))] pe-[max(12px,env(safe-area-inset-right,0px))]"
    >
      <button
        type="button"
        onClick={onClick}
        data-compact={compact}
        className={`pointer-events-auto w-full rounded-2xl border-0 bg-[#60a5fa] font-poppins font-semibold text-white shadow-[0_10px_30px_rgba(96,165,250,0.35)] transition-[height,font-size] duration-[180ms] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white motion-reduce:transition-none ${compact ? "h-11 text-[13.5px]" : "h-14 text-[15px]"}`}
      >
        <span aria-hidden="true">＋ </span>
        {label}
      </button>
    </div>
  );
}

export default BottomAddButton;
