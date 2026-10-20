import { ComponentPropsWithoutRef, forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useDialogA11y } from "../../hooks/useDialogA11y";

type DialogPanelProps = ComponentPropsWithoutRef<typeof motion.div> & {
  /** Called on Escape. Pass a no-op while the dialog must not be dismissed (e.g. a save in flight). */
  onClose: () => void;
  /** Accessible name when the content has no heading to label it. */
  ariaLabel?: string;
};

/**
 * The dialog element for the hand-built overlays that animate their own panel (framer-motion)
 * and so cannot sit inside the shared Modal. Mount it only while the dialog is open: it renders
 * a motion.div with role="dialog" + aria-modal, labels it from its first heading, moves focus
 * in, traps Tab, closes on Escape and hands focus back to the opener (see useDialogA11y).
 */
const DialogPanel = forwardRef<HTMLDivElement, DialogPanelProps>(function DialogPanel(
  { onClose, ariaLabel, children, ...rest },
  forwardedRef,
) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  useImperativeHandle(forwardedRef, () => ref.current as HTMLDivElement);
  const headingId = useId();
  const [labelledBy, setLabelledBy] = useState<string | undefined>();
  useDialogA11y(true, ref, onClose);
  useEffect(() => {
    const heading = ref.current?.querySelector<HTMLElement>("h1, h2, h3, h4");
    if (heading && !ariaLabel) {
      if (!heading.id) heading.id = headingId;
      setLabelledBy(heading.id);
    } else setLabelledBy(undefined);
  }, [children, ariaLabel, headingId]);

  return (
    <motion.div
      {...rest}
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel ?? (labelledBy ? undefined : t("modal.dialog", "Dialog"))}
      aria-labelledby={labelledBy}
      tabIndex={-1}
    >
      {children}
    </motion.div>
  );
});

export default DialogPanel;
