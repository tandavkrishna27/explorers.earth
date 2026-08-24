import {
  type HTMLAttributes,
  type ReactNode,
  useId,
  useState,
} from "react";
import { motion, useReducedMotion } from "framer-motion";
import UpArrow from "../../assets/icons/UpArrow";
import Down from "../../assets/icons/Down";

export interface AccordionProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "id"> {
  heading: string;
  children: ReactNode;
  defaultOpen?: boolean;
  id?: string;
  headingIcon?: ReactNode;
  onOpenChange?: (isOpen: boolean) => void;
  variant?: "card" | "flat";
}

const Accordion = ({
  heading,
  children,
  defaultOpen = false,
  id,
  headingIcon,
  onOpenChange,
  variant = "card",
  className = "",
  ...props
}: AccordionProps) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const generatedId = useId().replace(/:/g, "");
  const prefersReducedMotion = useReducedMotion();
  const accordionId = id || `accordion-${generatedId}`;
  const triggerId = `${accordionId}-trigger`;
  const contentId = `${accordionId}-content`;
  const isFlat = variant === "flat";

  const handleToggle = () => {
    const nextIsOpen = !isOpen;
    setIsOpen(nextIsOpen);
    onOpenChange?.(nextIsOpen);
  };

  return (
    <div
      className={`${
        isFlat
          ? "border-b border-dashboard"
          : "bg-dashboard-sidebar backdrop-blur-sm rounded-xl border border-dashboard shadow-dashboard-elevated transition-all duration-300 hover:shadow-dashboard-elevated hover:border-dashboard-accent"
      } ${className}`.trim()}
      style={{
        // Open emoji pickers and media controls must be able to escape the row.
        overflow: isOpen ? "visible" : "hidden",
        position: "relative",
        zIndex: isOpen ? 1 : "auto",
      }}
      {...props}
    >
      <button
        id={triggerId}
        type="button"
        onClick={handleToggle}
        className={`group flex min-h-[52px] w-full items-center justify-between gap-3 px-1 py-3 text-left font-poppins text-dashboard transition-colors hover:bg-dashboard-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dashboard-accent ${
          isFlat
            ? isOpen
              ? "rounded-t-lg"
              : "rounded-lg"
            : isOpen
              ? "rounded-t-xl px-4 md:px-5"
              : "rounded-xl px-4 md:px-5"
        }`}
        aria-expanded={isOpen}
        aria-controls={contentId}
      >
        <span className="flex min-w-0 items-center gap-3">
          {headingIcon && (
            <span
              aria-hidden="true"
              className="shrink-0 text-dashboard-accent"
            >
              {headingIcon}
            </span>
          )}
          <span className="text-base font-semibold text-dashboard-light transition-colors group-hover:text-dashboard md:text-lg">
            {heading}
          </span>
        </span>
        <span
          aria-hidden="true"
          className={`flex min-h-11 min-w-11 items-center justify-center ${
            isFlat
              ? "text-dashboard-light group-hover:text-dashboard"
              : "rounded-full bg-dashboard-muted text-dashboard-light transition-colors group-hover:bg-dashboard-accent/20 group-hover:text-dashboard"
          }`}
        >
          <motion.span
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={{
              duration: prefersReducedMotion ? 0 : 0.2,
              ease: "easeInOut",
            }}
          >
            {isOpen ? <UpArrow /> : <Down />}
          </motion.span>
        </span>
      </button>

      <motion.div
        id={contentId}
        role="region"
        aria-labelledby={triggerId}
        hidden={!isOpen}
        initial={false}
        animate={{
          height: isOpen ? "auto" : 0,
          opacity: isOpen ? 1 : 0,
        }}
        transition={{
          duration: prefersReducedMotion ? 0 : 0.25,
          ease: [0.4, 0, 0.2, 1],
        }}
        style={{
          overflow: isOpen ? "visible" : "hidden",
          position: "relative",
          zIndex: isOpen ? 1 : "auto",
        }}
      >
        <div
          className={
            isFlat
              ? "rounded-b-lg px-1 pb-5 pt-2"
              : "rounded-b-xl border-t border-dashboard px-4 pb-3 pt-4 md:px-5 md:pb-4 md:pt-5"
          }
        >
          <div className="font-poppins text-dashboard-light">{children}</div>
        </div>
      </motion.div>
    </div>
  );
};

export default Accordion;
