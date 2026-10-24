import { useRef, type KeyboardEvent, type ReactNode } from "react";

export type TabKey = "recs" | "share" | "manage";
type Props = { active: TabKey; onChange: (tab: TabKey) => void; labels: Record<TabKey, string>; trailing?: ReactNode; panels: Record<TabKey, ReactNode> };
const ORDER: TabKey[] = ["recs", "share", "manage"];

// Panels are always mounted; switching only toggles `hidden` (LP-06: no reload on switch).
export default function ListTabs({ active, onChange, labels, trailing, panels }: Props) {
  const refs = useRef<Record<TabKey, HTMLButtonElement | null>>({ recs: null, share: null, manage: null });
  const onKeyDown = (event: KeyboardEvent) => {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = ORDER[(ORDER.indexOf(active) + step + ORDER.length) % ORDER.length];
    onChange(next);
    refs.current[next]?.focus();
  };
  return (
    <>
      <div className="flex items-center gap-2 border-b border-white/10 pb-2">
        <div role="tablist" className="inline-flex gap-0.5 rounded-full bg-white p-[3px]" onKeyDown={onKeyDown}>
          {ORDER.map((key) => (
            <button key={key} ref={(el) => { refs.current[key] = el; }} type="button" role="tab" id={`list-tabbtn-${key}`} aria-controls={`list-tab-${key}`}
              aria-selected={active === key} tabIndex={active === key ? 0 : -1} onClick={() => onChange(key)}
              className={`min-h-9 rounded-full px-4 text-xs font-semibold ${active === key ? "bg-blue-400 text-white" : "text-gray-900"}`}>
              {labels[key]}
            </button>
          ))}
        </div>
        <span className="flex-1" />
        {trailing}
      </div>
      {ORDER.map((key) => (
        <section key={key} role="tabpanel" id={`list-tab-${key}`} aria-labelledby={`list-tabbtn-${key}`} hidden={active !== key}>
          {panels[key]}
        </section>
      ))}
    </>
  );
}
