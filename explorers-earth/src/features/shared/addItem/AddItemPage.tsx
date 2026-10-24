import type { ComponentProps, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import StickyActionBar from "./StickyActionBar";
import DashboardPageContainer from "../../../components/layout/DashboardPageContainer";
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
    // Phone: the bottom padding lets the sticky action bar rest above the fixed bottom nav at the end of the page.
    <DashboardPageContainer width="form" as="main" className="grid gap-4 pt-2 pb-[var(--bottom-nav-height,0px)] text-dashboard md:pb-0">
      {/* text-dashboard: the heading and every inherited label take the theme's text colour. */}
      <button type="button" onClick={onBack} className="justify-self-start text-[10px] uppercase tracking-[.08em] text-dashboard-muted">‹ {backLabel}</button>
      <h1 className="text-xl font-bold text-dashboard">{title}</h1>
      {mode === "manual" && onBackToSearch && (
        <button type="button" onClick={onBackToSearch} className="-mb-2 justify-self-end text-xs text-blue-400">
          {t("dashboard.wp4.backToSearch", "‹ Back to search")}
        </button>
      )}
      <div className="grid gap-4 pb-4">{children}</div>
      {mode !== "search" && <StickyActionBar {...bar} />}
    </DashboardPageContainer>
  );
}
