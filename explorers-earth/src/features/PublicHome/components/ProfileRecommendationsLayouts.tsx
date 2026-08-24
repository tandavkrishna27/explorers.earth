import {
  memo,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type CSSProperties,
} from "react";
import { Link } from "react-router-dom";
import { IMAGE_CONFIG } from "../../../config";
import type {
  RecommendationCategoryId,
  RecommendationsLayout,
} from "../../Profile/types/themeTypes";
import PublicPlaceCard from "./PublicPlaceCard";

export interface RecommendationListCardViewModel {
  id: string;
  title: string;
  image?: string | null;
  previewImages?: string[];
  subtitle?: string;
  href: string;
}

export interface RecommendationCategoryReadyViewModel {
  status: "ready";
  id: RecommendationCategoryId;
  label: string;
  color: string;
  icon: ComponentType<{ className?: string; style?: CSSProperties }>;
  lists: RecommendationListCardViewModel[];
  listCount: number;
  itemCountLabel?: string;
  href: string;
}

export interface RecommendationCategoryLoadingViewModel {
  status: "loading";
  id: RecommendationCategoryId;
  label: string;
}

export type RecommendationCategorySlotViewModel =
  | RecommendationCategoryReadyViewModel
  | RecommendationCategoryLoadingViewModel;

interface ProfileRecommendationsLayoutsProps {
  layout: RecommendationsLayout;
  slots: RecommendationCategorySlotViewModel[];
}

const FALLBACK_IMAGE = IMAGE_CONFIG.defaultImages.place;

const PresentationImage = ({
  src,
  eager = false,
  className = "",
}: {
  src?: string | null;
  eager?: boolean;
  className?: string;
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
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      onError={() => setResolvedSource(FALLBACK_IMAGE)}
      className={`h-full w-full object-cover ${className}`}
    />
  );
};

const categoryImages = (
  category: RecommendationCategoryReadyViewModel,
  cap: number,
) => {
  const images = category.lists.flatMap((list) => [
    list.image,
    ...(list.previewImages || []),
  ]);
  const unique = Array.from(
    new Set(images.filter((image): image is string => Boolean(image))),
  );
  return unique.slice(0, cap);
};

const CategoryHeading = ({
  category,
}: {
  category: RecommendationCategoryReadyViewModel;
}) => {
  const Icon = category.icon;
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span aria-hidden="true" className="shrink-0">
        <Icon
          className="h-5 w-5"
          style={{ color: category.color }}
        />
      </span>
      <h2 className="min-w-0 font-poppins text-lg font-black tracking-wide text-[var(--text-primary)]">
        {category.label}
      </h2>
    </span>
  );
};

const LoadingCategory = ({
  slot,
  className = "",
  testId,
}: {
  slot: RecommendationCategoryLoadingViewModel;
  className?: string;
  testId?: string;
}) => (
  <section
    data-testid={testId}
    data-category-id={slot.id}
    aria-label={`Loading ${slot.label}`}
    aria-busy="true"
    className={`rounded-2xl border border-[var(--border-card)] bg-[var(--bg-card)] p-4 ${className}`}
  >
    <h2 className="font-poppins text-lg font-black text-[var(--text-primary)]">
      {slot.label}
    </h2>
    <div className="mt-3 h-24 animate-pulse rounded-xl bg-[var(--border-card)] opacity-60" />
  </section>
);

const ClassicShelves = ({
  slots,
}: {
  slots: RecommendationCategorySlotViewModel[];
}) => (
  <div data-testid="recommendations-shelves" className="space-y-6">
    {slots.map((slot) => {
      if (slot.status === "loading") {
        return <LoadingCategory key={slot.id} slot={slot} />;
      }

      return (
        <section key={slot.id} data-category-id={slot.id} className="space-y-3">
          <Link
            to={slot.href}
            aria-label={`Open ${slot.label}`}
            className="profile-presentation-focus inline-flex min-h-12 max-w-full items-center rounded-lg"
          >
            <CategoryHeading category={slot} />
          </Link>
          <div
            className="flex gap-4 overflow-x-auto px-1 pb-4 pt-2 scrollbar-hide"
            style={{ scrollbarWidth: "none" }}
          >
            {slot.lists.slice(0, 12).map((list) => (
              <PublicPlaceCard
                key={list.id}
                title={list.title}
                image={list.image}
                previewImages={list.previewImages}
                subtitle={list.subtitle}
                href={list.href}
              />
            ))}
          </div>
        </section>
      );
    })}
  </div>
);

const CategoryMosaic = ({
  slots,
}: {
  slots: RecommendationCategorySlotViewModel[];
}) => (
  <div
    data-testid="recommendations-grid"
    className="grid grid-cols-1 gap-4 sm:grid-cols-2"
  >
    {slots.map((slot) => {
      if (slot.status === "loading") {
        return <LoadingCategory key={slot.id} slot={slot} className="min-h-56" />;
      }
      const images = categoryImages(slot, 3);
      const visibleImages = images.length ? images : [FALLBACK_IMAGE];
      const Icon = slot.icon;

      return (
        <Link
          key={slot.id}
          to={slot.href}
          aria-label={`Open ${slot.label}`}
          data-category-id={slot.id}
          className="profile-presentation-focus group flex min-h-56 flex-col overflow-hidden rounded-2xl border border-[var(--border-card)] bg-[var(--bg-card)] text-[var(--text-primary)] transition-colors duration-200 hover:border-[var(--accent-color)]"
        >
          <span
            aria-hidden="true"
            className={`grid h-32 w-full gap-px overflow-hidden bg-[var(--border-card)] ${
              visibleImages.length === 1 ? "grid-cols-1" : "grid-cols-3"
            }`}
          >
            {visibleImages.map((image, index) => (
              <PresentationImage key={`${image}-${index}`} src={image} />
            ))}
          </span>
          <span className="flex flex-1 items-start gap-3 p-4">
            <span aria-hidden="true" className="mt-0.5 shrink-0">
              <Icon
                className="h-5 w-5"
                style={{ color: slot.color }}
              />
            </span>
            <span className="min-w-0">
              <h2 className="font-poppins text-lg font-black leading-6">
                {slot.label}
              </h2>
              <span className="mt-1 block font-poppins text-xs text-[var(--text-secondary)]">
                {slot.listCount.toLocaleString()} {slot.listCount === 1 ? "list" : "lists"}
                {slot.itemCountLabel ? ` · ${slot.itemCountLabel}` : ""}
              </span>
            </span>
          </span>
        </Link>
      );
    })}
  </div>
);

const FeaturedCategory = ({
  category,
}: {
  category: RecommendationCategoryReadyViewModel;
}) => {
  const images = categoryImages(category, 4);
  const visibleImages = images.length ? images : [FALLBACK_IMAGE];
  const Icon = category.icon;

  return (
    <Link
      to={category.href}
      aria-label={`Open ${category.label}`}
      data-testid="featured-category"
      data-category-id={category.id}
      className="profile-presentation-focus group relative flex min-h-72 overflow-hidden rounded-2xl border border-[var(--border-card)] bg-[var(--bg-card)] text-[var(--text-primary)] transition-colors duration-200 hover:border-[var(--accent-color)]"
    >
      <span
        aria-hidden="true"
        className={`absolute inset-0 grid gap-px bg-[var(--border-card)] ${
          visibleImages.length === 1
            ? "grid-cols-1"
            : "grid-cols-2 grid-rows-2"
        }`}
      >
        {visibleImages.map((image, index) => (
          <PresentationImage
            key={`${image}-${index}`}
            src={image}
            eager={index === 0}
          />
        ))}
      </span>
      <span
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/10"
      />
      <span className="relative mt-auto flex max-w-2xl items-start gap-3 p-5 text-white sm:p-6">
        <span aria-hidden="true" className="mt-1 shrink-0">
          <Icon
            className="h-6 w-6"
            style={{ color: category.color }}
          />
        </span>
        <span className="min-w-0">
          <h2 className="line-clamp-2 font-poppins text-2xl font-black leading-tight">
            {category.label}
          </h2>
          <span className="mt-2 block font-poppins text-sm text-white/80">
            {category.listCount.toLocaleString()} {category.listCount === 1 ? "list" : "lists"}
            {category.itemCountLabel ? ` · ${category.itemCountLabel}` : ""}
          </span>
        </span>
      </span>
    </Link>
  );
};

const FeaturedFirst = ({
  slots,
}: {
  slots: RecommendationCategorySlotViewModel[];
}) => {
  const [first, ...rest] = slots;
  return (
    <div data-testid="recommendations-featured" className="space-y-4">
      {first.status === "ready" ? (
        <FeaturedCategory category={first} />
      ) : (
        <LoadingCategory
          slot={first}
          testId="featured-category"
          className="min-h-72"
        />
      )}
      <div data-testid="featured-compact-categories" className="space-y-3">
        {rest.map((slot) => {
          if (slot.status === "loading") {
            return <LoadingCategory key={slot.id} slot={slot} className="min-h-24" />;
          }
          const Icon = slot.icon;
          const [image = FALLBACK_IMAGE] = categoryImages(slot, 1);
          return (
            <Link
              key={slot.id}
              to={slot.href}
              aria-label={`Open ${slot.label}`}
              data-category-id={slot.id}
              className="profile-presentation-focus group flex min-h-24 items-stretch overflow-hidden rounded-2xl border border-[var(--border-card)] bg-[var(--bg-card)] text-[var(--text-primary)] transition-colors duration-200 hover:border-[var(--accent-color)]"
            >
              <span aria-hidden="true" className="relative w-24 shrink-0 sm:w-32">
                <PresentationImage src={image} />
              </span>
              <span className="flex min-w-0 flex-1 items-center gap-3 p-4">
                <span aria-hidden="true" className="shrink-0">
                  <Icon
                    className="h-5 w-5"
                    style={{ color: slot.color }}
                  />
                </span>
                <span className="min-w-0">
                  <h2 className="truncate font-poppins text-base font-black">
                    {slot.label}
                  </h2>
                  <span className="mt-1 block truncate font-poppins text-xs text-[var(--text-secondary)]">
                    {slot.listCount.toLocaleString()} {slot.listCount === 1 ? "list" : "lists"}
                    {slot.itemCountLabel ? ` · ${slot.itemCountLabel}` : ""}
                  </span>
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
};

const ProfileRecommendationsLayouts = memo(
  ({ layout, slots }: ProfileRecommendationsLayoutsProps) => {
    const stableSlots = useMemo(() => slots, [slots]);
    if (stableSlots.length === 0) return null;

    if (layout === "grid") return <CategoryMosaic slots={stableSlots} />;
    if (layout === "featured") return <FeaturedFirst slots={stableSlots} />;
    return <ClassicShelves slots={stableSlots} />;
  },
);

ProfileRecommendationsLayouts.displayName = "ProfileRecommendationsLayouts";

export default ProfileRecommendationsLayouts;
