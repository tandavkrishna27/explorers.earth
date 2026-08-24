import { memo, useEffect, useMemo, useState, type FC } from "react";
import { Link } from "react-router-dom";
import { IMAGE_CONFIG } from "../../../config";
import { isDisplayableNumber, toDisplayNumber } from "../../../utils/rating";

interface PublicPlaceCardBaseProps {
  title: string;
  image?: string | null;
  previewImages?: string[];
  subtitle?: string;
  rating?: number;
  reviews?: number;
  className?: string;
}

type PublicPlaceCardNavigation = { href: string; onAction?: never };
type PublicPlaceCardAction = { onAction: () => void; href?: never };

export type PublicPlaceCardProps = PublicPlaceCardBaseProps &
  (PublicPlaceCardNavigation | PublicPlaceCardAction);

const FALLBACK_IMAGE = IMAGE_CONFIG.defaultImages.place;

const DecorativeImage = ({
  src,
  loading = "lazy",
}: {
  src: string;
  loading?: "eager" | "lazy";
}) => {
  const [resolvedSource, setResolvedSource] = useState(src || FALLBACK_IMAGE);

  useEffect(() => {
    setResolvedSource(src || FALLBACK_IMAGE);
  }, [src]);

  return (
    <img
      src={resolvedSource}
      alt=""
      aria-hidden="true"
      loading={loading}
      decoding="async"
      onError={() => setResolvedSource(FALLBACK_IMAGE)}
      className="absolute inset-0 h-full w-full object-cover"
    />
  );
};

const PublicPlaceCard: FC<PublicPlaceCardProps> = memo((props) => {
  const {
    title,
    image,
    previewImages,
    subtitle,
    rating,
    reviews,
    className,
  } = props;
  const validPreviews = useMemo(
    () => (previewImages || []).filter(Boolean).slice(0, 4),
    [previewImages],
  );
  const hasPreviewCollage = !image && validPreviews.length > 0;
  const showRating = isDisplayableNumber(rating);
  const showReviews =
    isDisplayableNumber(reviews) && toDisplayNumber(reviews) > 0;
  const rootClassName = `profile-presentation-focus place-rec-card relative flex flex-col flex-shrink-0 justify-between overflow-hidden rounded-[16px] border border-white/[0.08] p-2.5 text-left shadow-[0_6px_16px_rgba(0,0,0,0.35)] transition-all duration-200 hover:scale-[1.02] hover:border-white/25 select-none ${
    className || "h-[155px] w-[135px] md:h-[180px] md:w-[155px]"
  }`;

  const content = (
    <>
      <div className="absolute inset-0 z-0 overflow-hidden bg-[var(--bg-card,#0d0e15)] pointer-events-none">
        {hasPreviewCollage ? (
          <div
            className={`grid h-full w-full gap-px bg-[var(--border-card,rgba(255,255,255,0.08))] ${
              validPreviews.length === 1
                ? "grid-cols-1"
                : "grid-cols-2"
            }`}
          >
            {validPreviews.map((preview, index) => (
              <div
                key={`${preview}-${index}`}
                className={`relative min-h-0 min-w-0 overflow-hidden ${
                  validPreviews.length === 3 && index === 0
                    ? "row-span-2"
                    : ""
                }`}
              >
                <DecorativeImage src={preview} />
              </div>
            ))}
          </div>
        ) : (
          <DecorativeImage src={image || FALLBACK_IMAGE} />
        )}
      </div>

      <span
        aria-hidden="true"
        className="absolute inset-0 z-10 bg-gradient-to-b from-black/10 to-black/85 pointer-events-none"
      />

      <span className="relative z-20 flex w-full items-center justify-between">
        <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full border border-white/20 bg-black/55 backdrop-blur-[3px]">
          <svg
            aria-hidden="true"
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            className="text-white"
          >
            <path
              d="M7 17L17 7M17 7H7M17 7V17"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </span>

      <span className="relative z-20 flex w-full flex-col gap-0.5">
        <h4 className="truncate font-poppins text-[0.75rem] font-bold tracking-wide text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.85)] md:text-[0.82rem]">
          {title}
        </h4>
        {subtitle && (
          <span className="mt-0.5">
            <span className="inline-block rounded-[4px] bg-black/45 px-1.5 py-0.5 font-poppins text-[0.56rem] font-semibold tracking-wide text-white/90 backdrop-blur-[2px] md:text-[0.6rem]">
              {subtitle}
            </span>
          </span>
        )}
        {(showRating || showReviews) && (
          <span className="mt-0.5 flex items-center gap-1 font-poppins text-[0.58rem] font-semibold text-white/90 md:text-[0.62rem]">
            {showRating && (
              <span className="flex items-center gap-0.5 text-amber-300">
                ★ {toDisplayNumber(rating).toFixed(1)}
              </span>
            )}
            {showReviews && (
              <span className="text-white/75">
                ({toDisplayNumber(reviews)})
              </span>
            )}
          </span>
        )}
      </span>
    </>
  );

  if ("href" in props && props.href) {
    return (
      <Link to={props.href} aria-label={title} className={rootClassName}>
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      aria-label={title}
      onClick={props.onAction}
      className={rootClassName}
    >
      {content}
    </button>
  );
});

PublicPlaceCard.displayName = "PublicPlaceCard";

export default PublicPlaceCard;
