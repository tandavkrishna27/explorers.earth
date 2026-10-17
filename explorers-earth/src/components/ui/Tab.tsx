import { FC, memo, ReactNode, useState, useEffect } from "react";
import { usePublicCategoryThemeStyles } from "../../features/PublicHome/components/PublicCategoryThemeContext";

interface TabProps {
  tabs: { [key: string]: ReactNode };
  type?: "public" | "public-profile" | "default";
  activeTab?: string;
  onTabChange?: (tabName: string) => void;
  allowTabChange?: boolean; // New prop to control whether tab changes are allowed
  "data-walkthrough"?: string; // Add data-walkthrough prop
}

const Tab: FC<TabProps> = memo(
  ({ tabs, type, activeTab: externalActiveTab, onTabChange, allowTabChange = true, "data-walkthrough": dataWalkthrough }) => {
    const categoryStyles = usePublicCategoryThemeStyles();
    const categoryPublic = Boolean(categoryStyles && (type === "public" || type === "public-profile"));
    // local state for managing the active tab when clicked
    const [activeTab, setActiveTab] = useState(
      externalActiveTab || Object.keys(tabs)[0]
    );

    // Update local state when external activeTab changes
    useEffect(() => {
      if (externalActiveTab && externalActiveTab !== activeTab) {
        setActiveTab(externalActiveTab);
      }
    }, [externalActiveTab, activeTab]);

    const handleTabClick = (key: string) => {
      if (allowTabChange) {
        setActiveTab(key);
        if (onTabChange) {
          onTabChange(key);
        }
      }
    };

    return (
      <div className="w-full flex flex-col items-center justify-center overflow-x-hidden px-4">
        {/* Tab Header */}
        <div
          data-tab-surface={type === "public-profile" ? "public-profile" : undefined}
          className={`${type === "public-profile"
              ? categoryStyles ? "flex items-center justify-between mx-auto w-full max-w-full rounded-3xl border border-[var(--category-control-border)] bg-[var(--category-panel)] font-poppins" : "flex items-center justify-between mx-auto w-full max-w-full rounded-3xl border border-[var(--border-card)] bg-[var(--bg-card)] font-poppins"
              : type === "public"
              ? categoryStyles ? "flex items-center justify-between mx-auto bg-[var(--category-panel)] font-poppins w-full max-w-full rounded-3xl" : "flex items-center justify-between mx-auto bg-dashboard-sidebar font-poppins w-full max-w-full rounded-3xl"
              : "flex items-center justify-center mx-auto bg-white font-poppins rounded-3xl"
            }`}
        >
          {Object.keys(tabs).map((key, index: number) => (
            <button
              key={key || index}
              onClick={() => handleTabClick(key)}
              {...(dataWalkthrough && key === Object.keys(tabs)[1] ? { "data-walkthrough": dataWalkthrough } : {})}
              className={`px-4 py-2 text-xs font-medium transition-all duration-300 whitespace-nowrap ${categoryPublic ? "focus-visible:!outline focus-visible:!outline-2 focus-visible:!outline-offset-2 focus-visible:!outline-[var(--category-focus)] focus-visible:!transform-none " : ""}${activeTab === key
                  ? `${categoryPublic ? "border-b-2 border-b-[var(--category-accent)] text-[var(--category-text)]" : type === "public-profile"
                    ? "border-b-2 border-b-[var(--accent-color)] text-[var(--text-primary)]"
                    : type === "public"
                    ? "bg-dashboard-sidebar text-dashboard border-b-2 border-b-dashboard-accent"
                    : "bg-gradient-to-r bg-dashboard-accent rounded-2xl text-dashboard"
                  }`
                  : `${categoryPublic ? "text-[var(--category-muted)]" : type === "public-profile"
                    ? "text-[var(--text-secondary)]"
                    : type === "public"
                    ? "bg-dashboard-sidebar text-dashboard"
                    : "bg-white rounded-2xl text-black"
                  }`
                }`}
            >
              {key}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="mt-2 w-full overflow-x-hidden">
          {Object.entries(tabs).map(
            ([key, Component], index: number) =>
              activeTab === key && <div key={key || index}>{Component}</div>
          )}
        </div>
      </div>
    );
  }
);

Tab.displayName = "Tab";

export default Tab;
