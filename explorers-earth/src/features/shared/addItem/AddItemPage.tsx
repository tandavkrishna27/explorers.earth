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
    <main className="mx-auto grid w-full max-w-[560px] gap-4 px-4 pt-2">
      <button type="button" onClick={onBack} className="justify-self-start text-[10px] uppercase tracking-[.08em] text-gray-400">‹ {backLabel}</button>
      <h1 className="text-xl font-bold">{title}</h1>
      {mode === "manual" && onBackToSearch && (
        <button type="button" onClick={onBackToSearch} className="-mb-2 justify-self-end text-xs text-blue-400">
          {t("dashboard.wp4.backToSearch", "‹ Back to search")}
        </button>
      )}
      <div className="grid gap-4 pb-4">{children}</div>
      {mode !== "search" && <StickyActionBar {...bar} />}
    </main>
  );
}
