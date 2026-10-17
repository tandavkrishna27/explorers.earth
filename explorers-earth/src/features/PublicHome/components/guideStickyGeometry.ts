export type GuideDayTabsStickyGeometry = {
  shouldStick: boolean;
  mainTabsHeight: number;
  reservedOffset: number;
  stickyTop: number;
  placementTop: string;
};

export type GuideMainTabsStickyGeometry = {
  shouldStick: boolean;
  reservedOffset: number;
  placementTop: string;
};

const semanticReservedOffset = (element: HTMLElement): number => {
  const contentLayer = element.closest<HTMLElement>("[data-public-content-layer]")
    ?? document.querySelector<HTMLElement>("[data-public-content-layer]");
  const resolvedPadding = contentLayer
    ? Number.parseFloat(getComputedStyle(contentLayer).paddingTop)
    : Number.NaN;
  if (Number.isFinite(resolvedPadding) && resolvedPadding > 0) return resolvedPadding;

  const value = getComputedStyle(element).getPropertyValue("--public-header-reserved-offset").trim();
  const pixels = Number.parseFloat(value);
  return Number.isFinite(pixels) ? pixels : 80;
};

export const measureGuideMainTabsStickyGeometry = (
  scrollRoot: HTMLElement,
  mainTabs: HTMLElement,
  coverImage: HTMLElement | null,
): GuideMainTabsStickyGeometry => {
  const reservedOffset = semanticReservedOffset(scrollRoot);
  const ownedElements = scrollRoot.contains(mainTabs) && (!coverImage || scrollRoot.contains(coverImage));
  const shouldStick = coverImage
    ? coverImage.getBoundingClientRect().bottom <= reservedOffset
    : (scrollRoot.scrollTop || 0) + reservedOffset >= mainTabs.offsetTop - (scrollRoot.offsetTop || 0);
  return {
    shouldStick: ownedElements && shouldStick,
    reservedOffset,
    placementTop: "var(--public-header-reserved-offset)",
  };
};

export const measureGuideDayTabsStickyGeometry = (
  scrollRoot: HTMLElement,
  mainTabs: HTMLElement,
  dayTabs: HTMLElement,
  mainTabsSticky: boolean,
): GuideDayTabsStickyGeometry => {
  const mainTabsHeight = mainTabs.getBoundingClientRect().height || mainTabs.offsetHeight || 0;
  const reservedOffset = semanticReservedOffset(scrollRoot);
  const stickyTop = reservedOffset + mainTabsHeight;
  const ownedElements = scrollRoot.contains(mainTabs) && scrollRoot.contains(dayTabs);
  return {
    shouldStick: ownedElements && mainTabsSticky && dayTabs.getBoundingClientRect().top <= stickyTop,
    mainTabsHeight,
    reservedOffset,
    stickyTop,
    placementTop: `calc(var(--public-header-reserved-offset) + ${mainTabsHeight}px)`,
  };
};
