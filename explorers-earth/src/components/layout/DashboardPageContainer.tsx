import type { ReactNode } from "react";

/** "page": category, hub and list pages. "form": the add/edit template's narrower column. */
const WIDTHS = { page: "max-w-[720px]", form: "max-w-[560px]" } as const;

/**
 * The one centred content column for dashboard pages: category pages, the All Recommendations
 * hub, list pages and the add/edit template. The width lives on a plain block wrapper, never on
 * a `grid` element: index.css has an unlayered `.grid { max-width: 100% }` that overrides any
 * `max-w-*` utility on the same element, which is how every page but Places went full width.
 */
export default function DashboardPageContainer({ width = "page", as: Inner = "div", className = "", children }: {
  width?: keyof typeof WIDTHS;
  as?: "div" | "main";
  className?: string;
  children: ReactNode;
}) {
  return (
    <div data-testid="dashboard-page-container" className={`mx-auto w-full ${WIDTHS[width]} px-4 md:px-1`}>
      <Inner className={className}>{children}</Inner>
    </div>
  );
}
