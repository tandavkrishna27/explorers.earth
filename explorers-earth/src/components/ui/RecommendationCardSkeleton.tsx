import { FC, memo } from "react";
import { usePublicCategoryThemeStyles } from "../../features/PublicHome/components/PublicCategoryThemeContext";

/** Controls which colour palette the skeleton uses */
export type SkeletonVariant = "public" | "dashboard";

interface RecommendationCardSkeletonProps {
    /** Number of skeleton cards to render */
    count?: number;
    /**
     * "public"    – dark (#1a1a1a) cards for the black-background public pages (default)
     * "dashboard" – uses dashboard CSS-token colours so the card blends into the green sidebar bg
     */
    variant?: SkeletonVariant;
}

interface SkeletonCardProps {
    variant: SkeletonVariant;
}

/**
 * A single skeleton card that mimics the new places-grid-card layout:
 *   – aspect-[4/3] to match both dashboard and public card proportions
 *   – direction icon (top-left) + kebab trigger (top-right)
 *   – title line + optional rating row at the bottom
 * Uses a subtle shimmer animation for a premium loading feel.
 */
const SkeletonCard = memo(({ variant }: SkeletonCardProps) => {
    const categoryStyles = usePublicCategoryThemeStyles();
    const isCategory = variant === 'public' && categoryStyles;
    const isDashboard = variant === "dashboard";
    const bg = isCategory ? "var(--category-card)" : isDashboard ? "var(--skeleton-bg, var(--dash-muted, #3C4E40))" : "#1a1a1a";
    const iconBg = isCategory ? "var(--category-skeleton)" : isDashboard
        ? "var(--skeleton-shimmer-base, rgba(255,255,255,0.08))"
        : "rgba(255,255,255,0.06)";
    const textBg = isCategory ? "var(--category-skeleton)" : isDashboard
        ? "var(--skeleton-shimmer-bright, rgba(255,255,255,0.12))"
        : "rgba(255,255,255,0.10)";
    const borderColor = isCategory ? "var(--category-border)" : isDashboard
        ? "var(--dash-border, rgba(60,78,64,0.6))"
        : "rgba(255,255,255,0.04)";

    return (
        <div
            className="relative w-full aspect-[4/3] rounded-xl overflow-hidden skeleton-card"
            style={{ background: bg, border: `1px solid ${borderColor}` }}
        >
            {/* Shimmer overlay */}
            <div className="absolute inset-0 skeleton-shimmer" />

            {/* ── TOP ROW: direction icon (left) + kebab (right) ── */}
            <div className="absolute top-0 left-0 right-0 flex justify-between items-center p-3 z-10">
                {/* Direction / navigation icon placeholder */}
                <div
                    className="w-6 h-6 rounded-full"
                    style={{ background: iconBg }}
                />
                {/* Kebab dots placeholder */}
                <div className="flex flex-col gap-[3px] items-center justify-center w-5 h-5">
                    {[0, 1, 2].map((i) => (
                        <div
                            key={i}
                            className="w-[3px] h-[3px] rounded-full"
                            style={{ background: iconBg }}
                        />
                    ))}
                </div>
            </div>

            {/* ── BOTTOM GRADIENT + TEXT ── */}
            <div
                className="absolute bottom-0 left-0 right-0 p-3"
                style={{
                    background: isCategory ? "var(--category-card)" : isDashboard
                        ? "linear-gradient(to top, rgba(0,0,0,0.60) 0%, rgba(0,0,0,0.20) 70%, transparent 100%)"
                        : "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.45) 65%, transparent 100%)",
                }}
            >
                {/* Title */}
                <div
                    className="h-3.5 w-3/4 rounded mb-2"
                    style={{ background: textBg }}
                />
                {/* Rating + review count */}
                <div className="flex items-center gap-1.5">
                    {[12, 24, 32].map((w, i) => (
                        <div
                            key={i}
                            className="h-2.5 rounded"
                            style={{ width: `${w}px`, background: textBg }}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
});

SkeletonCard.displayName = "SkeletonCard";

/**
 * Grid of skeleton cards used as a placeholder while recommendations load.
 * Drop-in replacement for `<EarthLoader />` in recommendation grids.
 */
const RecommendationCardSkeleton: FC<RecommendationCardSkeletonProps> = memo(
    ({ count = 6, variant = "public" }) => (
        <>
            {Array.from({ length: count }).map((_, i) => (
                <SkeletonCard key={`skeleton-${i}`} variant={variant} />
            ))}
        </>
    )
);

RecommendationCardSkeleton.displayName = "RecommendationCardSkeleton";

export default RecommendationCardSkeleton;
