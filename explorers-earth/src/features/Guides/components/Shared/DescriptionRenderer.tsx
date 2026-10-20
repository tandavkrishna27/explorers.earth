/**
 * DescriptionRenderer Component
 * Handles rendering of section descriptions (string or Strapi blocks format)
 */

import React from "react";
import { guideDescriptionText } from "../../../../utils/guideDescriptionText";

interface DescriptionRendererProps {
  description: string | any[] | null | undefined;
  className?: string;
  showTitle?: boolean;
}

const DescriptionRenderer: React.FC<DescriptionRendererProps> = ({
  description,
  className = "",
  showTitle = false,
}) => {
  if (!description) return null;

  const renderContent = () => {
    if (typeof description === "string") {
      return <p>{guideDescriptionText(description)}</p>;
    }

    if (Array.isArray(description)) {
      return (
        <div className="space-y-2">
          {description.map((block: any, idx: number) => {
            if (block.type === "paragraph") {
              return (
                <p key={idx}>
                  {guideDescriptionText([block])}
                </p>
              );
            }
            return null;
          })}
        </div>
      );
    }

    return null;
  };

  return (
    <div className={className}>
      {showTitle && (
        <h3 className="text-dashboard text-lg font-poppins font-semibold mb-3 flex items-center gap-2">
          <svg
            className="w-5 h-5 text-dashboard-accent"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h7"
            />
          </svg>
          Description
        </h3>
      )}
      <div className="text-dashboard-light leading-relaxed font-poppins font-normal bg-dashboard-bg rounded-lg p-4 border border-dashboard-muted">
        {renderContent()}
      </div>
    </div>
  );
};

export default DescriptionRenderer;

