import { useState, ReactNode, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import UpArrow from "../../assets/icons/UpArrow";
import Down from "../../assets/icons/Down";

const Accordion = ({
  heading,
  children,
  defaultOpen = false,
  onOpenChange,
  ...props
}: {
  heading: string;
  children: ReactNode;
  defaultOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  [key: string]: any;
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const accordionRef = useRef<HTMLDivElement>(null);

  // Function to scroll page to bottom of accordion - works on all screen sizes
  const scrollToAccordionBottom = () => {
    if (accordionRef.current) {
      // Wait for accordion to fully expand
      setTimeout(() => {
        const accordionElement = accordionRef.current;
        if (accordionElement) {
          // Get viewport dimensions
          const viewportHeight = window.innerHeight;
          const viewportWidth = window.innerWidth;
          const currentScroll = window.pageYOffset || document.documentElement.scrollTop;

          // Get accordion position after expansion
          const rect = accordionElement.getBoundingClientRect();
          const accordionBottom = currentScroll + rect.bottom;

          // Check if accordion is already fully visible
          const isFullyVisible = rect.top >= 0 && rect.bottom <= viewportHeight;

          // Calculate target scroll position based on screen size
          let targetScroll;

          if (viewportWidth >= 1024) {
            // Large screens: scroll to show accordion bottom with padding
            targetScroll = accordionBottom - viewportHeight + 200;
          } else if (viewportWidth >= 768) {
            // Medium screens: show bottom with padding
            targetScroll = accordionBottom - viewportHeight + 200;
          } else {
            // Small screens: show bottom with small padding
            targetScroll = accordionBottom - viewportHeight + 100;
          }

          // Ensure valid scroll position
          const documentHeight = document.documentElement.scrollHeight;
          const maxScroll = documentHeight - viewportHeight;
          const finalScroll = Math.min(Math.max(targetScroll, 0), maxScroll);

          // Debug logging
          console.log('Scroll Debug:', {
            viewportWidth,
            viewportHeight,
            currentScroll,
            accordionBottom,
            targetScroll,
            finalScroll,
            maxScroll,
            isFullyVisible,
            shouldScroll: viewportWidth >= 1024 || (!isFullyVisible && Math.abs(finalScroll - currentScroll) > 10)
          });

          // Always scroll on large screens, or if accordion is not fully visible
          const shouldScroll = viewportWidth >= 1024 || (!isFullyVisible && Math.abs(finalScroll - currentScroll) > 10);

          if (shouldScroll) {
            console.log('Scrolling to:', finalScroll);
            window.scrollTo({
              top: finalScroll,
              behavior: 'smooth'
            });
          } else {
            console.log('Not scrolling - accordion is fully visible or no significant difference');
          }

          // Fallback for large screens - use scrollIntoView if manual scroll didn't work
          if (viewportWidth >= 1024) {
            setTimeout(() => {
              accordionElement.scrollIntoView({
                behavior: 'smooth',
                block: 'end',
                inline: 'nearest'
              });
            }, 100);
          }
        }
      }, 300); // Wait for accordion animation to complete
    }
  };

  // Handle accordion toggle with scroll
  const handleToggle = () => {
    const newIsOpen = !isOpen;
    setIsOpen(newIsOpen);

    // Notify parent of state change
    onOpenChange?.(newIsOpen);

    // If opening, scroll to bottom after accordion expands
    if (newIsOpen) {
      scrollToAccordionBottom();
    }
  };

  // Auto-scroll when accordion opens (for defaultOpen case)
  useEffect(() => {
    if (isOpen && accordionRef.current) {
      // Scroll after accordion is rendered
      scrollToAccordionBottom();
    }
  }, [isOpen]);

  return (
    <div
      ref={accordionRef}
      className="bg-dashboard-sidebar backdrop-blur-sm rounded-xl border border-dashboard shadow-dashboard-elevated transition-all duration-300 hover:shadow-dashboard-elevated hover:border-dashboard-accent hover:rounded-xl"
      style={{
        // Use visible instead of hidden to allow emoji picker to overflow
        overflow: isOpen ? 'visible' : 'hidden',
        // Ensure proper stacking context for emoji picker
        position: 'relative',
        zIndex: isOpen ? 1 : 'auto'
      }}
      {...props}
    >
      <button
        type="button"
        onClick={handleToggle}
        className={`w-full flex justify-between items-center px-4 py-3 md:px-5 md:py-4 text-dashboard font-poppins transition-all duration-300 hover:bg-dashboard-muted focus:outline-none focus:ring-2 focus:ring-dashboard-accent/50 focus:bg-dashboard-muted group ${isOpen ? 'rounded-t-xl' : 'rounded-xl'
          }`}
        aria-expanded={isOpen}
        aria-controls={`accordion-content-${heading.replace(/\s+/g, '-').toLowerCase()}`}
      >
        <span className="text-base md:text-lg font-semibold text-dashboard-light group-hover:text-dashboard transition-colors duration-200">
          {heading}
        </span>
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-dashboard-muted group-hover:bg-dashboard-accent/20 transition-all duration-300 group-focus:bg-dashboard-accent/20 group-focus:ring-2 group-focus:ring-dashboard-accent/30">
          <motion.div
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="text-dashboard-light group-hover:text-dashboard transition-colors duration-200"
          >
            {isOpen ? <UpArrow /> : <Down />}
          </motion.div>
        </div>
      </button>

      <motion.div
        id={`accordion-content-${heading.replace(/\s+/g, '-').toLowerCase()}`}
        initial={{ height: 0, opacity: 0 }}
        animate={{
          height: isOpen ? "auto" : 0,
          opacity: isOpen ? 1 : 0
        }}
        exit={{ height: 0, opacity: 0 }}
        transition={{
          duration: 0.25,
          ease: [0.4, 0, 0.2, 1] // Custom cubic-bezier for smoother animation
        }}
        style={{
          // Important: Use visible to allow child elements (emoji picker) to overflow
          overflow: isOpen ? 'visible' : 'hidden',
          // Ensure proper z-index stacking for emoji picker
          position: 'relative',
          zIndex: isOpen ? 1 : 'auto'
        }}
      >
        <div className="px-4 pb-3 pt-4 md:px-5 md:pb-4 md:pt-5 border-t border-dashboard rounded-b-xl">
          <div className="font-poppins text-dashboard-light">
            {children}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default Accordion;