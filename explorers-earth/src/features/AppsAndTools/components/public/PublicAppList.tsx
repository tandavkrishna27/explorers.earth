import { usePublicCategoryThemeStyles } from "../../../PublicHome/components/PublicCategoryThemeContext";
import { useState, useCallback, useEffect } from "react";
import { useParams, Link, useOutletContext, useLocation } from "react-router-dom";
import { Smartphone, ArrowLeft } from "lucide-react";
import { deduplicateApps, buildLogoUrl, getPriceTierColor } from "../../utils/appHelpers";
import type { RecommendedApp, AppList } from "../../types";
import AppDetailModal from "./AppDetailModal";
import SEO from "../../../../components/SEO";
import { createCanonicalUrl } from "../../../../utils/getCurrentDomain";
import { createAnalyticsOptions, useTrackAnalytics } from "../../../../services/analyticsService";
import { usePublicHeaderDescriptor } from "../../../PublicHome/components/PublicHeaderDescriptorContext";
import { isNonNullObject, isPublicProfileNotFound, PublicRouteErrorState, PublicRoutePartialNotice } from "../../../PublicHome/components/PublicRouteContentState";
import { usePublicProfileShell } from "../../../PublicHome/api/usePublicProfileShell";
import { usePublicProfileDetail } from "../../../PublicHome/api/usePublicProfileDetail";
import { PublicScrollContinuation } from "../../../PublicHome/components/PublicScrollContinuation";

const isRenderableAppList = (value: unknown): value is AppList =>
  isNonNullObject(value) && Array.isArray(value.recommended_apps);

const PublicAppList = () => {
  const categoryStyles = usePublicCategoryThemeStyles();
  const { username, listSlug } = useParams<{ username: string; listSlug: string }>();
  const location = useLocation();
  const outletContext = useOutletContext<{ setIsPageLoaded?: (val: boolean) => void } | null>();

  const [selectedApp, setSelectedApp] = useState<RecommendedApp | null>(null);

  const { data: accountData } = usePublicProfileShell(username);
  const page = usePublicProfileDetail(username, "apps", listSlug);
  const { data, loading, error, refetch } = page;

  const list = (Array.isArray(data?.appLists) ? data.appLists : []).find(isRenderableAppList);
  const hasUsableData = Boolean(list);
  const apps = deduplicateApps<RecommendedApp>(list?.recommended_apps ?? []);
  const accountDocumentId = typeof accountData?.documentId === "string" ? accountData.documentId : undefined;
  const creatorName = typeof accountData?.Account_Name === "string" ? accountData.Account_Name : username;
  const analytics = useTrackAnalytics(
    {
      ...createAnalyticsOptions.apps(accountDocumentId || "", username, list?.documentId),
      waitForLocation: true,
    },
  );

  useEffect(() => {
    if (!loading || hasUsableData) {
      outletContext?.setIsPageLoaded?.(true);
    }
  }, [hasUsableData, loading, outletContext]);

  const handleAppClick = useCallback((app: RecommendedApp) => {
    setSelectedApp(app);
    analytics.trackClick("app-card", {
      id: app.documentId,
      listId: list?.documentId,
      listName: list?.List_Name,
      title: app.title,
      category: app.app_category?.name,
    });
  }, [analytics, list]);

  usePublicHeaderDescriptor(list ? {
    navigationKey: location.key,
    title: list.List_Name,
    url: window.location.href,
    analyticsContext: "apps-list-header",
    analyticsMetadata: {
      listId: list.documentId,
      listName: list.List_Name,
    },
  } : undefined);

  const pageTitle = list ? `${list.List_Name} | ${creatorName}'s App List | explorers` : `App List | explorers`;
  const metaDescription = list?.list_description 
    ? list.list_description 
    : list 
      ? `Explore the curated app list "${list.List_Name}" containing ${apps.length}${page.hasMore ? "+" : ""} apps recommended by ${creatorName} on explorers.`
      : "Explore app recommendations on explorers.";

  const seoKeywords = list 
    ? [`${list.List_Name}`, `${creatorName} apps`, `${list.slug}`, "app list", "explorers"]
    : ["app list", "explorers"];

  const listImage = list?.cover_image?.url || (apps[0]?.logo_url ? buildLogoUrl(apps[0].logo_url) : undefined);

  return (
    <>
      {!loading && list && (
        <SEO
          title={pageTitle}
          description={metaDescription}
          keywords={seoKeywords}
          canonical={createCanonicalUrl(`/${username}/apps/${listSlug}`)}
          image={listImage}
          type="website"
          author={creatorName}
          siteName="explorers"
        />
      )}
      <div data-category-page className="min-h-screen bg-[var(--category-page,#0d1117)] text-[color:var(--category-text,#fff)]" aria-busy={loading || undefined}>
        {/* Header content section */}
        <div className="max-w-5xl mx-auto px-4 pt-6 pb-2">
          <Link
            to={`/${username}/apps`}
            className="inline-flex items-center gap-1.5 text-sm text-[color:var(--category-muted,rgba(255,255,255,0.5))] hover:text-[color:var(--category-text,rgba(255,255,255,0.8))] transition-colors mb-6"
          >
            <ArrowLeft size={14} /> {creatorName}'s Apps
          </Link>

          {Boolean(error) && hasUsableData && <PublicRoutePartialNotice message="Some app data is unavailable." />}

          {loading && !hasUsableData ? (
            <>
              <div className="h-7 w-48 bg-[var(--category-skeleton,rgba(255,255,255,0.05))] animate-pulse rounded mb-2" />
              <div className="h-4 w-64 bg-[var(--category-skeleton,rgba(255,255,255,0.05))] animate-pulse rounded" />
            </>
          ) : error && !hasUsableData && !isPublicProfileNotFound(error) ? (
            <PublicRouteErrorState title="App list unavailable" error={error} onRetry={refetch} />
          ) : list ? (
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-xl md:text-2xl font-poppins font-bold text-[color:var(--category-text,#fff)] mb-1">{list.List_Name}</h1>
                {list.list_description && (
                  <p className="text-[color:var(--category-muted,#9ca3af)] font-poppins text-xs md:text-sm mt-1 max-w-xl">{list.list_description}</p>
                )}
                <p className="text-[color:var(--category-muted,#9ca3af)] font-poppins text-xs md:text-sm mt-2">{apps.length}{page.hasMore ? "+" : ""} app{apps.length !== 1 ? "s" : ""}</p>
              </div>
            </div>
          ) : (
            <p className="text-[color:var(--category-muted,rgba(255,255,255,0.4))]">List not found or not published.</p>
          )}
        </div>

        {/* Grid */}
        <div className="max-w-5xl mx-auto px-4 pt-6 pb-24 md:pb-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {loading && !hasUsableData ? (
              [1, 2, 3, 4, 5, 6].map((idx) => (
                <div key={idx} className="h-44 rounded-2xl bg-[var(--category-skeleton,rgba(255,255,255,0.05))] skeleton-shimmer relative overflow-hidden" />
              ))
            ) : (
              apps.map((app) => (
                <button
                  key={app.documentId}
                  onClick={() => handleAppClick(app)}
                  className="rounded-2xl bg-[var(--category-card,rgba(255,255,255,0.04))] border border-[color:var(--category-border,rgba(255,255,255,0.07))] hover:border-[color:var(--category-focus,rgba(139,92,246,0.4))] hover:bg-[var(--category-hover,rgba(255,255,255,0.07))] p-4 text-left transition-all flex flex-col items-center justify-center text-center w-full"
                >
                  <div className="w-14 h-14 rounded-xl overflow-hidden bg-[var(--category-card,rgba(255,255,255,0.05))] mb-3 shadow-md">
                    {app.logo_url ? (
                      <img src={buildLogoUrl(app.logo_url)} alt={app.title} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Smartphone size={18} className="text-[color:var(--category-muted,rgba(255,255,255,0.2))]" />
                      </div>
                    )}
                  </div>
                  <p className="text-xs font-semibold text-[color:var(--category-text,#fff)] line-clamp-2 leading-tight mb-1">{app.title}</p>
                  {app.developer && (
                    <p className="text-[10px] text-[color:var(--category-muted,rgba(255,255,255,0.4))] truncate w-full mb-2">{app.developer}</p>
                  )}
                  {app.price_tier && (
                    <span style={categoryStyles ? { color: categoryStyles["--category-text"] } : undefined} className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${getPriceTierColor(app.price_tier)}`}>
                      {app.price_tier}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
          <PublicScrollContinuation {...page} label="apps" className="mt-6" />
        </div>

        <AppDetailModal
          open={!!selectedApp}
          app={selectedApp}
          onClose={() => setSelectedApp(null)}
        />
      </div>
    </>
  );
};

export default PublicAppList;
