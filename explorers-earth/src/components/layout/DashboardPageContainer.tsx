import type { ReactNode } from "react";

/**
 * The one centred content column for dashboard category pages, the All Recommendations hub
 * and list pages. The width lives on a plain block wrapper, never on a `grid` element:
 * index.css has an unlayered `.grid { max-width: 100% }` that overrides any `max-w-*`
 * utility on the same element, which is how every page but Places went full width.
 */
export default function DashboardPageContainer({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <div data-testid="dashboard-page-container" className="mx-auto w-full max-w-[720px] px-4 md:px-1">
      <div className={className}>{children}</div>
    </div>
  );
}
