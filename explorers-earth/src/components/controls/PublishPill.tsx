import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

export type CategoryPublishValue = "public" | "hidden";
export type ListPublishValue = "draft" | "public";
export type PublishPillValue = CategoryPublishValue | ListPublishValue | "private";
export type PublishPillKind = "category" | "list" | "guide";

interface PublishPillCommonProps {
  /** Disables the pill (e.g. sample lists). It stays focusable and announces `disabledReason`. */
  disabled?: boolean;
  disabledReason?: string;
  className?: string;
}

export interface CategoryPublishPillProps extends PublishPillCommonProps {
  kind: "category";
  value: CategoryPublishValue;
  onChange: (next: CategoryPublishValue) => void | Promise<void>;
  /** Shown in the Public explanation: "Movies shows on your profile". */
  categoryName?: string;
}

export interface ListPublishPillProps extends PublishPillCommonProps {
  kind: "list" | "guide";
  value: ListPublishValue;
  /** Shows the disabled "Private (coming soon)" row (PRIV-06). Defaults to true. */
  privateComingSoon?: boolean;
  onChange: (next: ListPublishValue) => void | Promise<void>;
}

export type PublishPillProps = CategoryPublishPillProps | ListPublishPillProps;

export interface PublishPillOption {
  value: PublishPillValue;
  icon: string;
  comingSoon: boolean;
}

export const PUBLISH_PILL_ICONS: Record<PublishPillValue, string> = {
  public: "🌐",
  hidden: "🔒",
  draft: "✎",
  private: "👥",
};

/** The menu rows per kind. Also used by WP3A's phone card ⋯ menu (CAT-08) so both offer the same options. */
export function publishPillOptions(kind: PublishPillKind, privateComingSoon: boolean): PublishPillOption[] {
  if (kind === "category") {
    return [
      { value: "public", icon: PUBLISH_PILL_ICONS.public, comingSoon: false },
      { value: "hidden", icon: PUBLISH_PILL_ICONS.hidden, comingSoon: false },
    ];
  }
  const options: PublishPillOption[] = [
    { value: "draft", icon: PUBLISH_PILL_ICONS.draft, comingSoon: false },
    { value: "public", icon: PUBLISH_PILL_ICONS.public, comingSoon: false },
  ];
  if (privateComingSoon) options.push({ value: "private", icon: PUBLISH_PILL_ICONS.private, comingSoon: true });
  return options;
}

function explainKey(kind: PublishPillKind, value: PublishPillValue, hasCategoryName: boolean): string {
  if (kind === "category") {
    if (value === "hidden") return "dashboard.wp2.pill.explain.categoryHidden";
    return hasCategoryName ? "dashboard.wp2.pill.explain.categoryPublic" : "dashboard.wp2.pill.explain.categoryPublicGeneric";
  }
  if (value === "draft") return "dashboard.wp2.pill.explain.listDraft";
  if (value === "public") return "dashboard.wp2.pill.explain.listPublic";
  return "dashboard.wp2.pill.explain.listPrivate";
}

const PILL_SHELL =
  "inline-flex min-h-[44px] items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 font-poppins text-[12.5px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#60a5fa]";

/**
 * GL-08: the one publish pill for category, list and guide pages (header, top right).
 * A WAI-ARIA menu button: the button announces "Visibility: <state>", the menu holds
 * menuitemradio rows with the current one checked. The pill toasts on success; the
 * consumer's command surfaces its own errors.
 */
export function PublishPill(props: PublishPillProps) {
  const { t } = useTranslation();
  const { kind, value, disabled = false, disabledReason, className = "" } = props;
  const privateComingSoon = props.kind === "category" ? false : props.privateComingSoon ?? true;
  const categoryName = props.kind === "category" ? props.categoryName : undefined;
  const options = publishPillOptions(kind, privateComingSoon);

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pending, setPending] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);
  const baseId = useId();
  const buttonId = `${baseId}-button`;
  const menuId = `${baseId}-menu`;
  const reasonId = `${baseId}-reason`;
  const stateName = t(`dashboard.wp2.pill.state.${value}`);
  const inert = disabled || pending;

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }, []);

  const openMenu = () => {
    if (inert) return;
    const current = options.findIndex((option) => option.value === value);
    setActiveIndex(current >= 0 ? current : 0);
    setOpen(true);
  };

  useEffect(() => {
    if (open) itemRefs.current[activeIndex]?.focus();
  }, [open, activeIndex]);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open, close]);

  const select = async (option: PublishPillOption) => {
    if (option.comingSoon) return;
    close(true);
    if (option.value === value) return;
    setPending(true);
    try {
      await (props.onChange as (next: PublishPillValue) => void | Promise<void>)(option.value);
      toast.success(t(`dashboard.wp2.pill.toast.${option.value}`));
    } catch {
      // The consumer's command shows its own error; the pill stays on the old value.
    } finally {
      setPending(false);
    }
  };

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const last = options.length - 1;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((index) => (index >= last ? 0 : index + 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((index) => (index <= 0 ? last : index - 1));
        break;
      case "Home":
        event.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        event.preventDefault();
        setActiveIndex(last);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        void select(options[activeIndex]);
        break;
      case "Escape":
        event.preventDefault();
        close(true);
        break;
      case "Tab":
        close(false);
        break;
      default:
        break;
    }
  };

  const tone =
    value === "public"
      ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
      : "border-white/[0.18] bg-[#0e1218] text-gray-200";

  return (
    <div ref={rootRef} className={`relative inline-flex ${className}`}>
      <button
        ref={buttonRef}
        id={buttonId}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={t("dashboard.wp2.pill.buttonLabel", { state: stateName })}
        aria-disabled={disabled || undefined}
        aria-busy={pending || undefined}
        aria-describedby={disabled && disabledReason ? reasonId : undefined}
        title={disabled ? disabledReason : undefined}
        data-kind={kind}
        data-value={value}
        onClick={() => (open ? close(false) : openMenu())}
        onKeyDown={(event) => {
          if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
            event.preventDefault();
            openMenu();
          }
        }}
        className={`${PILL_SHELL} ${tone} ${inert ? "cursor-default opacity-60" : "cursor-pointer"}`}
      >
        <span aria-hidden="true">{PUBLISH_PILL_ICONS[value]}</span>
        <span>{stateName}</span>
        <span aria-hidden="true">▾</span>
      </button>
      {disabled && disabledReason ? (
        <span id={reasonId} className="sr-only">
          {disabledReason}
        </span>
      ) : null}
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-labelledby={buttonId}
          onKeyDown={onMenuKeyDown}
          className="absolute end-0 top-[calc(100%+6px)] z-[60] grid min-w-[230px] rounded-xl border border-white/[0.09] bg-[#1f2430] p-1 text-start text-[#f9fafb] shadow-2xl"
        >
          {options.map((option, index) => {
            const checked = option.value === value;
            return (
              <div
                key={option.value}
                ref={(node) => {
                  itemRefs.current[index] = node;
                }}
                role="menuitemradio"
                aria-checked={checked}
                aria-disabled={option.comingSoon || undefined}
                tabIndex={-1}
                onClick={() => void select(option)}
                onMouseEnter={() => setActiveIndex(index)}
                className={`grid min-h-[44px] gap-0.5 rounded-lg px-2.5 py-2 text-[12.5px] outline-none hover:bg-white/[0.06] focus:bg-white/[0.06] ${option.comingSoon ? "cursor-default opacity-55" : "cursor-pointer"}`}
              >
                <span>
                  <span aria-hidden="true" className="inline-block w-3.5 text-[#60a5fa]">
                    {checked ? "✓" : ""}
                  </span>
                  <span aria-hidden="true">{option.icon} </span>
                  {t(`dashboard.wp2.pill.state.${option.value}`)}
                  {option.comingSoon ? (
                    <span className="ms-1.5 rounded-full bg-yellow-400/15 px-1.5 text-[9px] text-yellow-400">
                      {t("dashboard.wp2.pill.comingSoon")}
                    </span>
                  ) : null}
                </span>
                <small className="ps-3.5 text-[11px] text-[#8b93a1]">
                  {t(explainKey(kind, option.value, Boolean(categoryName)), { category: categoryName })}
                </small>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export default PublishPill;
