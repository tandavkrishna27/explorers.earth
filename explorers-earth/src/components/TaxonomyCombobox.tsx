import { useId, useMemo, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { childrenOf, filterTerms, rootsOf, type TaxonomyTerm } from "./taxonomyFilter";

export type TaxonomyValue = { categoryId: string | null; subcategoryId: string | null };
type Props = {
  terms: TaxonomyTerm[];
  levels: 1 | 2;
  value: TaxonomyValue;
  onChange: (value: TaxonomyValue) => void;
  storedLabels?: Record<string, string>;
  labels?: { category: string; subcategory: string };
};

function Field({ label, options, selectedId, storedLabel, disabled, onPick }: {
  label: string; options: TaxonomyTerm[]; selectedId: string | null; storedLabel?: string; disabled?: boolean; onPick: (id: string | null) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const selected = options.find((o) => o.id === selectedId);
  const shown = selected?.label ?? (selectedId && storedLabel ? `${storedLabel} ${t("dashboard.wp4.noLongerAvailable", "(no longer available)")}` : "");
  const [text, setText] = useState<string | null>(null);
  const [active, setActive] = useState(-1);
  const open = text !== null;
  const visible = useMemo(() => filterTerms(options, text ?? ""), [options, text]);
  const close = () => { setText(null); setActive(-1); };
  const choose = (term: TaxonomyTerm) => { onPick(term.id); close(); };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); if (!open) setText(""); setActive((i) => Math.min(visible.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter" && open && visible[active]) { e.preventDefault(); choose(visible[active]); }
    else if (e.key === "Escape") { e.preventDefault(); close(); }
  };
  return (
    <div className="relative grid gap-1 text-xs text-slate-300">
      <label htmlFor={id}>{label}</label>
      <input id={id} role="combobox" aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list"
        aria-activedescendant={active >= 0 && visible[active] ? `${id}-${visible[active].id}` : undefined}
        disabled={disabled} value={open ? text : shown}
        onFocus={() => setText("")} onBlur={() => setTimeout(close, 120)}
        onChange={(e) => { setText(e.target.value); setActive(-1); }} onKeyDown={onKeyDown}
        className="w-full rounded-lg border border-white/10 bg-[#0b0f15] px-3 py-2 text-sm disabled:opacity-50" />
      {open && (
        <ul id={`${id}-list`} role="listbox" className="absolute top-full z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-white/10 bg-[#1f2430] p-1">
          {selectedId && <li role="option" aria-selected={false} onMouseDown={() => { onPick(null); close(); }} className="rounded px-3 py-2 text-gray-400">{t("dashboard.wp4.clearChoice", "None")}</li>}
          {visible.map((term, index) => (
            <li key={term.id} id={`${id}-${term.id}`} role="option" aria-selected={term.id === selectedId}
              onMouseDown={() => choose(term)}
              className={`min-h-11 whitespace-normal break-words rounded px-3 py-2 text-sm ${index === active ? "bg-blue-400 text-white" : "hover:bg-white/5"}`}>
              {term.label}
            </li>
          ))}
          {visible.length === 0 && <li className="px-3 py-2 text-gray-400">{t("dashboard.wp4.noTerms", "No matching categories")}</li>}
        </ul>
      )}
    </div>
  );
}

// Searchable replacement for the two native selects in RecommendForm.tsx (scope ADD-10, OWN-03).
export default function TaxonomyCombobox({ terms, levels, value, onChange, storedLabels = {}, labels }: Props) {
  const { t } = useTranslation();
  const roots = useMemo(() => rootsOf(terms), [terms]);
  const children = useMemo(() => (value.categoryId ? childrenOf(terms, value.categoryId) : []), [terms, value.categoryId]);
  return (
    <div className={`grid gap-3 ${levels === 2 ? "sm:grid-cols-2" : ""}`}>
      <Field label={labels?.category ?? t("dashboard.wp4.category", "Category")} options={levels === 2 ? roots : terms}
        selectedId={value.categoryId} storedLabel={value.categoryId ? storedLabels[value.categoryId] : undefined}
        onPick={(categoryId) => onChange({ categoryId, subcategoryId: null })} />
      {levels === 2 && (
        <Field label={labels?.subcategory ?? t("dashboard.wp4.subcategory", "Subcategory")} options={children}
          selectedId={value.subcategoryId} storedLabel={value.subcategoryId ? storedLabels[value.subcategoryId] : undefined}
          disabled={!value.categoryId} onPick={(subcategoryId) => onChange({ ...value, subcategoryId })} />
      )}
    </div>
  );
}
