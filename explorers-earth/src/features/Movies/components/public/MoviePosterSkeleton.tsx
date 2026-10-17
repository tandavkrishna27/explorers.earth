import { memo } from "react";

interface MoviePosterSkeletonProps {
  count?: number;
}

const MoviePosterSkeleton = memo(({ count = 6 }: MoviePosterSkeletonProps) => {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="w-36 min-w-[9rem] flex flex-col flex-shrink-0">
          <div className="aspect-[2/3] rounded-xl bg-[var(--category-skeleton,rgba(255,255,255,0.05))] skeleton-shimmer relative overflow-hidden" />
          <div className="mt-2 space-y-1.5">
            <div className="h-3.5 rounded bg-[var(--category-skeleton,rgba(255,255,255,0.08))] skeleton-shimmer relative overflow-hidden w-4/5" />
            <div className="h-3 rounded bg-[var(--category-skeleton,rgba(255,255,255,0.05))] skeleton-shimmer relative overflow-hidden w-1/2" />
          </div>
        </div>
      ))}
    </>
  );
});

MoviePosterSkeleton.displayName = "MoviePosterSkeleton";

export default MoviePosterSkeleton;
