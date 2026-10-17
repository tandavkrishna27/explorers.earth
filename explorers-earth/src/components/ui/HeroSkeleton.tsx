import { memo } from "react";

export type HeroAccentColor = "yellow" | "amber" | "blue" | "purple" | "green";
export type HeroSkeletonVariant = "public" | "dashboard";

interface HeroSkeletonProps {
    /** Accent colour of the vertical bar beside the label (matches the real hero label colour) */
    accentColor?: HeroAccentColor;
    /** Controls bg/shimmer tone. "public" = near-black; "dashboard" = dashboard muted */
    variant?: HeroSkeletonVariant;
    /** Whether to render the right-side thumbnail placeholders (desktop) */
    showThumbnails?: boolean;
    /** Render the mobile-sized card variant (stacked, no thumbnails, 65vh) */
    mobile?: boolean;
}

const ACCENT_COLORS: Record<HeroAccentColor, string> = {
    yellow: "#facc15",
    amber: "#f59e0b",
    blue: "#3b82f6",
    purple: "#a855f7",
    green: "#22c55e",
};

/**
 * Desktop hero skeleton — mimics the 60vh cinematic hero used on all public/dashboard pages.
 * Includes: shimmer background, accent-bar label, title lines, meta row, description lines,
 * CTA button placeholder, and (optionally) thumbnail strip on the right.
 */
const DesktopHeroSkeleton = memo(
    ({
        accentColor = "yellow",
        variant = "public",
        showThumbnails = true,
    }: Omit<HeroSkeletonProps, "mobile">) => {
        const isDashboard = variant === "dashboard";
        const accent = ACCENT_COLORS[accentColor];
        const bg = isDashboard ? "var(--skeleton-bg, var(--dash-muted, #2a3830))" : "var(--category-card,#111111)";
        const shimmerBase = isDashboard
            ? "var(--skeleton-shimmer-base, rgba(255,255,255,0.06))"
            : "var(--category-skeleton,rgba(255,255,255,0.05))";
        const shimmerBright = isDashboard
            ? "var(--skeleton-shimmer-bright, rgba(255,255,255,0.12))"
            : "var(--category-skeleton,rgba(255,255,255,0.10))";

        return (
            <div
                className="relative w-full h-[60vh] min-h-[500px] max-h-[700px] rounded-2xl overflow-hidden shadow-2xl skeleton-card"
                style={{ background: bg }}
            >
                {/* Shimmer sweep */}
                <div className="absolute inset-0 skeleton-shimmer" />

                {/* Gradient overlays — mirrors real hero */}
                <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                        background: isDashboard
                            ? "linear-gradient(to top, var(--skeleton-gradient-1, rgba(0,0,0,0.9)) 0%, var(--skeleton-gradient-2, rgba(0,0,0,0.45)) 50%, var(--skeleton-gradient-3, rgba(0,0,0,0.08)) 100%)"
                            : "var(--category-page,linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.45) 50%, rgba(0,0,0,0.08) 100%))",
                    }}
                />
                <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                        background: isDashboard
                            ? "linear-gradient(to right, var(--skeleton-gradient-1, rgba(0,0,0,0.75)) 0%, var(--skeleton-gradient-2, rgba(0,0,0,0.35)) 55%, transparent 100%)"
                            : "var(--category-page,linear-gradient(to right, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.35) 55%, transparent 100%))",
                    }}
                />

                {/* ── TOP-LEFT: accent bar + label placeholder ── */}
                <div className="absolute top-8 left-8 md:top-12 md:left-12 z-10 flex items-center gap-2.5">
                    <div
                        className="w-1.5 h-6 rounded-full flex-shrink-0"
                        style={{ background: accent, opacity: 0.7 }}
                    />
                    <div
                        className="h-5 w-20 rounded"
                        style={{ background: shimmerBright }}
                    />
                </div>

                {/* ── BOTTOM-LEFT: text content ── */}
                <div className="absolute inset-0 flex flex-col justify-end p-8 md:p-12 z-10">
                    <div className="flex justify-between items-end w-full">
                        {/* Left column */}
                        <div className="w-full lg:w-[48%] flex flex-col gap-4">
                            {/* Title — two lines */}
                            <div className="flex flex-col gap-2.5">
                                <div
                                    className="h-12 md:h-14 w-4/5 rounded-lg"
                                    style={{ background: shimmerBright }}
                                />
                                <div
                                    className="h-10 md:h-12 w-3/5 rounded-lg"
                                    style={{ background: shimmerBase }}
                                />
                            </div>

                            {/* Meta row — rating • days • type */}
                            <div className="flex items-center gap-3">
                                {[28, 6, 40, 6, 56].map((w, i) => (
                                    <div
                                        key={i}
                                        className="h-4 rounded"
                                        style={{
                                            width: `${w}px`,
                                            background:
                                                i % 2 === 1
                                                    ? shimmerBase
                                                    : shimmerBright,
                                        }}
                                    />
                                ))}
                            </div>

                            {/* Description — two lines */}
                            <div className="flex flex-col gap-2">
                                <div
                                    className="h-3.5 w-full max-w-xl rounded"
                                    style={{ background: shimmerBase }}
                                />
                                <div
                                    className="h-3.5 w-4/5 max-w-md rounded"
                                    style={{ background: shimmerBase }}
                                />
                                <div
                                    className="h-3.5 w-3/5 max-w-sm rounded"
                                    style={{ background: shimmerBase }}
                                />
                            </div>

                            {/* CTA button */}
                            <div
                                className="h-11 w-36 rounded-lg mt-2"
                                style={{
                                    background: accent,
                                    opacity: 0.25,
                                }}
                            />
                        </div>

                        {/* Right column — thumbnail strip */}
                        {showThumbnails && (
                            <div className="hidden lg:flex flex-col items-end max-w-[46%]">
                                <div className="flex gap-3 py-4 px-2">
                                    {[0, 1, 2].map((i) => (
                                        <div
                                            key={i}
                                            className="relative flex-shrink-0 w-32 aspect-video rounded-md overflow-hidden"
                                            style={{
                                                background: shimmerBright,
                                                opacity: i === 0 ? 1 : 0.5,
                                            }}
                                        >
                                            <div className="absolute inset-0 skeleton-shimmer" />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }
);

DesktopHeroSkeleton.displayName = "DesktopHeroSkeleton";

/**
 * Mobile hero skeleton — mimics the 65vh stacked card used on mobile public pages.
 * Full-width card with accent label at top and text stack at the bottom.
 */
const MobileHeroSkeleton = memo(
    ({
        accentColor = "yellow",
        variant = "public",
    }: Omit<HeroSkeletonProps, "showThumbnails" | "mobile">) => {
        const isDashboard = variant === "dashboard";
        const accent = ACCENT_COLORS[accentColor];
        const bg = isDashboard ? "var(--skeleton-bg, var(--dash-muted, #2a3830))" : "var(--category-card,#111111)";
        const shimmerBase = isDashboard
            ? "var(--skeleton-shimmer-base, rgba(255,255,255,0.06))"
            : "var(--category-skeleton,rgba(255,255,255,0.05))";
        const shimmerBright = isDashboard
            ? "var(--skeleton-shimmer-bright, rgba(255,255,255,0.12))"
            : "var(--category-skeleton,rgba(255,255,255,0.10))";

        return (
            <div
                className="relative w-full h-[65vh] min-h-[480px] max-h-[650px] rounded-2xl overflow-hidden shadow-2xl skeleton-card"
                style={{ background: bg }}
            >
                {/* Shimmer sweep */}
                <div className="absolute inset-0 skeleton-shimmer" />

                {/* Gradient */}
                <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                        background: isDashboard
                            ? "linear-gradient(to top, var(--skeleton-gradient-1, rgba(0,0,0,0.95)) 0%, var(--skeleton-gradient-2, rgba(0,0,0,0.4)) 50%, var(--skeleton-gradient-3, rgba(0,0,0,0.05)) 100%)"
                            : "var(--category-page,linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0.05) 100%))",
                    }}
                />

                {/* ── TOP: accent bar + label ── */}
                <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
                    <div
                        className="w-1 h-5 rounded-full flex-shrink-0"
                        style={{ background: accent, opacity: 0.7 }}
                    />
                    <div
                        className="h-4 w-16 rounded"
                        style={{ background: shimmerBright }}
                    />
                </div>

                {/* ── BOTTOM: text content ── */}
                <div className="absolute bottom-0 left-0 right-0 p-5 flex flex-col gap-2 z-20">
                    {/* Title */}
                    <div
                        className="h-9 w-3/4 rounded-lg"
                        style={{ background: shimmerBright }}
                    />
                    <div
                        className="h-8 w-1/2 rounded-lg"
                        style={{ background: shimmerBase }}
                    />

                    {/* Meta row */}
                    <div className="flex items-center gap-2 mt-1">
                        {[24, 5, 36, 5, 48].map((w, i) => (
                            <div
                                key={i}
                                className="h-3.5 rounded"
                                style={{
                                    width: `${w}px`,
                                    background:
                                        i % 2 === 1 ? shimmerBase : shimmerBright,
                                }}
                            />
                        ))}
                    </div>

                    {/* CTA */}
                    <div
                        className="h-11 w-full rounded-full mt-3"
                        style={{
                            background: accent,
                            opacity: 0.2,
                        }}
                    />
                </div>
            </div>
        );
    }
);

MobileHeroSkeleton.displayName = "MobileHeroSkeleton";

/**
 * Top-level `HeroSkeleton` — renders the appropriate variant based on the `mobile` prop.
 *
 * Usage:
 * ```tsx
 * // Desktop + mobile (standard use — wrapping in md:hidden / hidden md:block yourself)
 * <HeroSkeleton accentColor="yellow" showThumbnails />
 * <HeroSkeleton accentColor="yellow" mobile />
 *
 * // With auto responsive wrapper (convenience)
 * <HeroSkeleton accentColor="yellow" showThumbnails responsive />
 * ```
 */
const HeroSkeleton = memo(
    ({
        accentColor = "yellow",
        variant = "public",
        showThumbnails = true,
        mobile = false,
    }: HeroSkeletonProps) => {
        if (mobile) {
            return <MobileHeroSkeleton accentColor={accentColor} variant={variant} />;
        }
        return (
            <DesktopHeroSkeleton
                accentColor={accentColor}
                variant={variant}
                showThumbnails={showThumbnails}
            />
        );
    }
);

HeroSkeleton.displayName = "HeroSkeleton";

export default HeroSkeleton;
