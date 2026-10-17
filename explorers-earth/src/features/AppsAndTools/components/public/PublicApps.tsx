import { useState, useMemo, useCallback, useEffect } from "react";
import { useParams, useNavigate, useOutletContext, useLocation } from "react-router-dom";
import { Smartphone } from "lucide-react";
import { deduplicateApps } from "../../utils/appHelpers";
import type { RecommendedApp, AppList } from "../../types";
import AppCarouselRow from "./AppCarouselRow";
import AppDetailModal from "./AppDetailModal";
import SEO from "../../../../components/SEO";
import { createCanonicalUrl } from "../../../../utils/getCurrentDomain";
import AppTopPicksHero from "./AppTopPicksHero";
import AppTopPicksMobileHero from "./AppTopPicksMobileHero";
import HeroSkeleton from "../../../../components/ui/HeroSkeleton";
import { createAnalyticsOptions, useTrackAnalytics } from "../../../../services/analyticsService";
import { usePublicHeaderDescriptor } from "../../../PublicHome/components/PublicHeaderDescriptorContext";
import { isNonNullObject, PublicRouteErrorState, PublicRoutePartialNotice, settlePublicRouteRetries } from "../../../PublicHome/components/PublicRouteContentState";
import { usePublicProfileShell } from "../../../PublicHome/api/usePublicProfileShell";
import { usePublicRecommendationCategory } from "../../../PublicHome/api/usePublicRecommendationCategory";
import { PublicScrollContinuation } from "../../../PublicHome/components/PublicScrollContinuation";

const isRenderableAppList = (value: unknown): value is AppList =>
  isNonNullObject(value) && Array.isArray(value.recommended_apps);

const PublicApps = () => {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const outletContext = useOutletContext<{ isShellRevealed?: boolean; setIsPageLoaded?: (val: boolean) => void } | null>();

  const [modalState, setModalState] = useState<{ open: boolean; app: RecommendedApp | null }>({
    open: false,
    app: null,
  });

  const { data: accountData, loading: userLoading, error: userError, refetch: refetchUser } = usePublicProfileShell(username);
  const query = usePublicRecommendationCategory(username, "apps", accountData?.public_apps === "Yes");
  const { data, loading: appsLoading, error: appsError, refetch: refetchApps } = query;

  const accountDocumentId = typeof accountData?.documentId === "string" ? accountData.documentId : undefined;
  const creatorName = typeof accountData?.Account_Name === "string" ? accountData.Account_Name : username;

  const loading = userLoading || appsLoading;
  const queryError = userError || appsError;
  const rawLists = data?.appLists;
  const lists: AppList[] = (Array.isArray(rawLists) ? rawLists : [])
    .filter(isRenderableAppList)
    .map((list) => ({
      ...list,
      recommended_apps: list.recommended_apps.filter(isNonNullObject) as AppList["recommended_apps"],
    }));
  const completeCollection = Array.isArray(rawLists) && rawLists.every(isRenderableAppList);
  const hasPartialCollection = !completeCollection && lists.length > 0;
  const hasUsableData = queryError ? lists.length > 0 : completeCollection || hasPartialCollection;

  useEffect(() => {
    if (!loading || hasUsableData) {
      outletContext?.setIsPageLoaded?.(true);
    }
  }, [hasUsableData, loading, outletContext]);

  const handleRetry = useCallback(async () => {
    await settlePublicRouteRetries(refetchUser, accountDocumentId ? refetchApps : undefined);
  }, [accountDocumentId, refetchApps, refetchUser]);

  const analytics = useTrackAnalytics(
    createAnalyticsOptions.apps(accountDocumentId || "", username),
  );

  const owningListByAppId = useMemo(() => {
    const ownership = new Map<string, { documentId: string; name: string }>();
    lists.forEach((list) => {
      list.recommended_apps?.forEach((app) => {
        ownership.set(app.documentId, {
          documentId: list.documentId,
          name: list.List_Name,
        });
      });
    });
    return ownership;
  }, [lists]);

  const allApps = useMemo(() => {
    return deduplicateApps(lists.flatMap((l) => l.recommended_apps ?? []));
  }, [lists]);

  const topPicks = useMemo(() => {
    return allApps
      .filter((a) => a.is_pinned)
      .sort((a, b) => (a.pin_order ?? 999) - (b.pin_order ?? 999));
  }, [allApps]);

  // const allCategories = useMemo(() => {
  //   return extractUniqueCategories(allApps.map((a) => a.app_category ? [a.app_category] : []));
  // }, [allApps]);

  const handleAppClick = useCallback((app: RecommendedApp) => {
    setModalState({ open: true, app });
    const owningList = owningListByAppId.get(app.documentId);
    analytics.trackClick("app-card", {
      id: app.documentId,
      listId: app.app_list?.documentId || owningList?.documentId,
      listName: app.app_list?.List_Name || owningList?.name,
      title: app.title,
      category: app.app_category?.name,
    });
  }, [analytics, owningListByAppId]);

  usePublicHeaderDescriptor({
    navigationKey: location.key,
    title: `${creatorName}'s Apps`,
    url: window.location.href,
    analyticsContext: "apps-header",
  });

  const appCount = allApps.length;
  const listCount = lists.length;
  const pageTitle = `${creatorName} | Favorite Apps & Tools | explorers`;
  const metaDescription = appCount > 0
    ? `Browse curated app lists and recommended tools shared by ${creatorName} on explorers. Explore ${listCount}${query.hasMore || query.error ? '+' : ''} app list${listCount !== 1 ? 's' : ''} containing ${appCount} loaded favorite app${appCount !== 1 ? 's' : ''}.`
    : `Explore app and tool recommendations shared by ${creatorName} on explorers.`;

  const seoKeywords = [
    `${creatorName} apps`,
    `${username} apps`,
    "explorers apps",
    "favorite apps list",
    "app recommendations",
    "curated app lists",
    ...lists.map(l => l.List_Name)
  ];

  return (
    <>
      {!loading && accountData && (
        <SEO
          title={pageTitle}
          description={metaDescription}
          keywords={seoKeywords}
          canonical={createCanonicalUrl(`/${username}/apps`)}
          type="website"
          author={creatorName}
          siteName="explorers"
        />
      )}

      <div data-category-page className="min-h-screen bg-[var(--category-page,#0d1117)] text-[color:var(--category-text,#fff)]">
        {/* Content */}
        <div className="relative z-10 max-w-5xl mx-auto px-4 pb-16" aria-busy={loading || undefined}>
          {loading && !hasUsableData ? (
            outletContext?.isShellRevealed ? (
              <div className="space-y-10 mt-4">
                {/* Hero skeleton — Desktop (lg screens) */}
                <div className="hidden lg:block">
                  <HeroSkeleton accentColor="yellow" showThumbnails />
                </div>
                {/* Hero skeleton — Mobile / Tablet */}
                <div className="lg:hidden">
                  <HeroSkeleton accentColor="yellow" mobile />
                </div>
                {/* Carousel row skeletons */}
                {[1, 2, 3].map((i) => (
                  <section key={i} className="mb-8">
                    {/* Row header */}
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-1.5 h-[22px] bg-[var(--category-skeleton,rgba(255,255,255,0.1))] rounded-sm flex-shrink-0 skeleton-shimmer relative overflow-hidden" />
                      <div className="h-5 w-32 bg-[var(--category-skeleton,rgba(255,255,255,0.08))] rounded skeleton-shimmer relative overflow-hidden" />
                    </div>
                    {/* Poster strip skeleton equivalent for apps */}
                    <div className="flex gap-3 overflow-hidden">
                      {[1, 2, 3, 4, 5].map((idx) => (
                        <div key={idx} className="flex-shrink-0 w-32 h-44 rounded-xl bg-[var(--category-skeleton,rgba(255,255,255,0.05))] skeleton-shimmer relative overflow-hidden" />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : null
          ) : queryError && !hasUsableData ? (
            <PublicRouteErrorState title="Apps unavailable" error={queryError} onRetry={handleRetry} />
          ) : (
            <>
              {(queryError || hasPartialCollection) && <PublicRoutePartialNotice message="Some app data is unavailable." />}
              {/* Empty state */}
              {lists.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-center">
                  <Smartphone size={48} className="text-[color:var(--category-muted,rgba(255,255,255,0.2))] mb-4" />
                  <p className="text-[color:var(--category-muted,rgba(255,255,255,0.4))] text-lg font-medium">No apps shared yet</p>
                  <p className="text-[color:var(--category-muted,rgba(255,255,255,0.25))] text-sm mt-1">Check back later for recommendations</p>
                </div>
              ) : (
                <>
                  {/* Top Picks Hero (Large Screens) & Carousel (Mobile) */}
                  {topPicks.length > 0 && (
                    <div className="mt-4">
                      <div className="hidden lg:block">
                        <AppTopPicksHero 
                          apps={topPicks} 
                          onAppClick={handleAppClick} 
                        />
                      </div>
                      <div className="block lg:hidden">
                        <AppTopPicksMobileHero
                          apps={topPicks}
                          onAppClick={handleAppClick}
                        />
                      </div>
                    </div>
                  )}

                  {/* Lists as carousel rows */}
                  <div className="mt-4 space-y-8">
                    {lists.map((list) => (
                      <AppCarouselRow
                        key={list.documentId}
                        list={list}
                        onAppClick={handleAppClick}
                        onViewAll={() => {
                          analytics.trackClick("app-list", {
                            listId: list.documentId,
                            listName: list.List_Name,
                          });
                          navigate(`/${username}/apps/${list.slug}`);
                        }}
                      />
                    ))}
                  </div>

                  {/* Category browse - hidden for now as category pages are not registered/implemented
                  {allCategories.length > 0 && (
                    <div className="mt-10">
                      <p className="text-sm font-semibold text-[color:var(--category-muted,rgba(255,255,255,0.6))] mb-3">Browse by Category</p>
                      <div className="flex flex-wrap gap-2">
                        {allCategories.map((cat) => (
                          <button
                            key={cat.slug}
                            onClick={() => navigate(`/${username}/apps/category/${cat.slug}`)}
                            className="text-xs text-[color:var(--category-text,rgba(167,139,250,0.8))] bg-violet-900/20 hover:bg-violet-900/40 border border-violet-800/20 px-3 py-1.5 rounded-full transition-all"
                          >
                            {cat.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  */}
                </>
              )}
            </>
          )}
          <PublicScrollContinuation {...query} label="app lists" />
        </div>

        <AppDetailModal
          open={modalState.open}
          app={modalState.app}
          onClose={() => setModalState({ open: false, app: null })}
        />
      </div>
    </>
  );
};

export default PublicApps;
