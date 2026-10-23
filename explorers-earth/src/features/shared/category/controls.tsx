// TEMPORARY: stands in for WP2's components/controls until WP2 merges (Task 22 replaces this file with re-exports).
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

type CategoryPillProps = { kind: "category"; value: "public" | "hidden"; categoryLabel?: string; disabled?: boolean; onChange: (next: "public" | "hidden") => void };
type ListPillProps = { kind: "list" | "guide"; value: "draft" | "public"; privateComingSoon?: boolean; disabled?: boolean; onChange: (next: "draft" | "public") => void };
export type PublishPillProps = CategoryPillProps | ListPillProps;

type PillOption = { value: string; label: string; help: string; disabled?: boolean };

export function PublishPill(props: PublishPillProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const options: PillOption[] = props.kind === "category"
    ? [
        { value: "public", label: t("dashboard.wp3a.pill.public"), help: t("dashboard.wp3a.pill.categoryPublic", { category: props.categoryLabel ?? "" }) },
        { value: "hidden", label: t("dashboard.wp3a.pill.hidden"), help: t("dashboard.wp3a.pill.categoryHidden") },
      ]
    : [
        { value: "draft", label: t("dashboard.wp3a.pill.draft"), help: t("dashboard.wp3a.pill.listDraft") },
        { value: "public", label: t("dashboard.wp3a.pill.public"), help: t("dashboard.wp3a.pill.listPublic") },
        ...(props.privateComingSoon ? [{ value: "private", label: t("dashboard.wp3a.pill.private"), help: t("dashboard.wp3a.pill.listPrivate"), disabled: true }] : []),
      ];
  const current = options.find((option) => option.value === props.value) ?? options[0];
  const isPublic = props.value === "public";
  return (
    <span ref={root} className="relative inline-flex">
      <button ref={trigger} type="button" aria-haspopup="menu" aria-expanded={open} disabled={props.disabled}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] whitespace-nowrap min-h-[44px] md:min-h-0 ${isPublic ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300" : "border-white/20 bg-[#0e1218] text-gray-200"}`}>
        {current.label} ▾
      </button>
      {open && (
        <span role="menu" className="absolute right-0 top-[calc(100%+6px)] z-50 grid min-w-[230px] rounded-xl border border-white/10 bg-[#1f2430] p-1 text-left">
          {options.map((option) => (
            <button key={option.value} type="button" role="menuitemradio" aria-checked={option.value === props.value}
              aria-disabled={option.disabled ? true : undefined}
              onClick={() => {
                if (option.disabled) return;
                setOpen(false); trigger.current?.focus();
                if (option.value !== props.value) (props.onChange as (next: string) => void)(option.value);
              }}
              className={`grid gap-0.5 rounded-lg px-2.5 py-2 text-left text-[12.5px] hover:bg-white/5 ${option.disabled ? "opacity-55 cursor-default" : ""}`}>
              <span><span className="inline-block w-3.5 text-blue-400">{option.value === props.value ? "✓" : ""}</span>{option.label}
                {option.disabled && <span className="ml-1.5 rounded-full bg-yellow-400/15 px-1.5 text-[9px] text-yellow-300">{t("dashboard.wp3a.pill.comingSoon")}</span>}</span>
              <small className="pl-3.5 text-[11px] text-gray-400">{option.help}</small>
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

export function BottomAddButton({ label, onClick, hidden }: { label: string; onClick: () => void; hidden?: boolean }) {
  const [small, setSmall] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => { const down = window.scrollY > last && window.scrollY > 10; last = window.scrollY; setSmall(down); };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  if (hidden) return null;
  return (
    <div className="md:hidden fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(10px+env(safe-area-inset-bottom,0px))] pt-2 bg-gradient-to-b from-transparent to-[#07090c]">
      <button type="button" onClick={onClick}
        className={`w-full rounded-2xl bg-[#60a5fa] font-semibold text-white shadow-[0_10px_30px_rgba(96,165,250,.35)] transition-all ${small ? "h-11 text-[13.5px]" : "h-14 text-[15px]"}`}>
        ＋ {label}
      </button>
    </div>
  );
}
