import type { ComponentProps, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import StickyActionBar from "./StickyActionBar";
import type { AddItemMode } from "./useAddItemMode";

type Props = {
  title: string;
  backLabel: string;
  onBack: () => void;
  mode: AddItemMode;
  onBackToSearch?: () => void;
  bar: ComponentProps<typeof StickyActionBar>;
  children: ReactNode;
};

// Full-page add/edit template (scope ADD-01). Categories adopt it in Wave 2.
export default function AddItemPage({ title, backLabel, onBack, mode, onBackToSearch, bar, children }: Props) {
  const { t } = useTranslation();
  return (
    // flex, not grid: the global `.grid { max-width: 100% }` rule in index.css overrides
    // max-w-[560px] on a grid element and stretched the form across the whole content area.
    // text-dashboard gives the heading and every inherited label the theme's text colour.
    <main className="mx-auto flex w-full max-w-[560px] flex-col gap-4 px-4 pt-2 text-dashboard">
      <button type="button" onClick={onBack} className="self-start text-[10px] uppercase tracking-[.08em] text-dashboard-muted">‹ {backLabel}</button>
      <h1 className="text-xl font-bold text-dashboard">{title}</h1>
      {mode === "manual" && onBackToSearch && (
        <button type="button" onClick={onBackToSearch} className="-mb-2 self-end text-xs text-blue-400">
          {t("dashboard.wp4.backToSearch", "‹ Back to search")}
        </button>
      )}
      <div className="grid gap-4 pb-4">{children}</div>
      {mode !== "search" && <StickyActionBar {...bar} />}
    </main>
  );
}
