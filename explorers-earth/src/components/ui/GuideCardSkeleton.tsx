import { FC, memo } from "react";
import { usePublicCategoryThemeStyles } from "../../features/PublicHome/components/PublicCategoryThemeContext";
import type { SkeletonVariant } from "./RecommendationCardSkeleton";

interface GuideCardSkeletonProps {
    /** Number of skeleton cards to render */
    count?: number;
    /**
     * "public"    – dark (#1a1a1a) cards for the black-background public pages (default)
     * "dashboard" – uses dashboard CSS-token colours for the green sidebar bg
     */
    variant?: SkeletonVariant;
}

interface SingleGuideSkeletonProps {
    variant: SkeletonVariant;
}

/**
 * A single skeleton card that mimics the GuideCard / PublicGuideCard layout.
 * Guide cards are landscape (16:9 → 4:3) and include a days-badge and location pills.
 */
const SingleGuideSkeleton = memo(({ variant }: SingleGuideSkeletonProps) => {
    const categoryStyles = usePublicCategoryThemeStyles();
    const isCategory = variant === 'public' && categoryStyles;
    const isDashboard = variant === "dashboard";

    return (
        <div
            className="relative w-full aspect-[16/9] md:aspect-[4/3] max-w-none mx-auto rounded-xl overflow-hidden skeleton-card"
            style={{
                background: isCategory ? "var(--category-card)" : isDashboard ? "var(--dash-muted, #3C4E40)" : "#1c1c1c",
            }}
        >
            {/* Shimmer sweep */}
            <div className="absolute inset-0 skeleton-shimmer" />

            {/* Days badge – top-left, mirrors the accent badge on real cards */}
            <div
                className="absolute z-10 left-2 top-2 h-6 w-16 rounded-md"
                style={{
                    background: isCategory ? "var(--category-skeleton)" : isDashboard
                        ? "rgba(255,255,255,0.13)"
                        : "rgba(255,255,255,0.10)",
                }}
            />

            {/* Bottom content area */}
            <div
                className="absolute bottom-0 left-0 right-0 p-3"
                style={{
                    background: isCategory ? "var(--category-skeleton)" : isDashboard
                        ? "linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.2) 60%, transparent 100%)"
                        : "linear-gradient(to top, rgba(0,0,0,0.80) 0%, rgba(0,0,0,0.4) 60%, transparent 100%)",
                }}
            >
                {/* Title placeholder */}
                <div
                    className="h-3.5 w-3/5 rounded mb-2"
                    style={{
                        background: isCategory ? "var(--category-skeleton)" : isDashboard
                            ? "rgba(255,255,255,0.14)"
                            : "rgba(255,255,255,0.12)",
                    }}
                />

                {/* Location-tag pills – mirrors the tag row on real guide cards */}
                <div className="flex gap-1.5 mb-2">
                    {[28, 40, 32].map((w, i) => (
                        <div
                            key={i}
                            className="h-4 rounded"
                            style={{
                                width: `${w * 2}px`,
                                background: isCategory ? "var(--category-skeleton)" : isDashboard
                                    ? "rgba(255,255,255,0.12)"
                                    : "rgba(255,255,255,0.10)",
                            }}
                        />
                    ))}
                </div>

                {/* Rating row placeholder */}
                <div className="flex items-center gap-1.5">
                    {[12, 32, 40].map((w, i) => (
                        <div
                            key={i}
                            className="h-3 rounded"
                            style={{
                                width: `${w}px`,
                                background: isCategory ? "var(--category-skeleton)" : isDashboard
                                    ? "rgba(255,255,255,0.12)"
                                    : "rgba(255,255,255,0.10)",
                            }}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
});

SingleGuideSkeleton.displayName = "SingleGuideSkeleton";

/**
 * Renders `count` guide skeleton cards.
 * Drop straight into the same grid container used by GuideCard / PublicGuideCard.
 */
const GuideCardSkeleton: FC<GuideCardSkeletonProps> = memo(
    ({ count = 6, variant = "public" }) => (
        <>
            {Array.from({ length: count }).map((_, i) => (
                <SingleGuideSkeleton key={`guide-skeleton-${i}`} variant={variant} />
            ))}
        </>
    )
);

GuideCardSkeleton.displayName = "GuideCardSkeleton";

export default GuideCardSkeleton;
