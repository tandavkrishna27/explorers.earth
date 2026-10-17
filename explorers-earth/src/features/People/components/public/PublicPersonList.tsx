import { useState, useCallback, useEffect } from "react";
import { useParams, Link, useOutletContext, useLocation } from "react-router-dom";
import { Users, ArrowLeft } from "lucide-react";
import { deduplicatePeople, buildImageUrl } from "../../utils/personHelpers";
import PlatformIcon from "../PlatformIcon";
import type { RecommendedPerson, PersonList } from "../../types";
import PersonDetailModal from "./PersonDetailModal";
import SEO from "../../../../components/SEO";
import { createCanonicalUrl } from "../../../../utils/getCurrentDomain";
import { createAnalyticsOptions, useTrackAnalytics } from "../../../../services/analyticsService";
import { usePublicHeaderDescriptor } from "../../../PublicHome/components/PublicHeaderDescriptorContext";
import { isNonNullObject, isPublicProfileNotFound, PublicRouteErrorState, PublicRoutePartialNotice } from "../../../PublicHome/components/PublicRouteContentState";
import { usePublicProfileShell } from "../../../PublicHome/api/usePublicProfileShell";
import { usePublicProfileDetail } from "../../../PublicHome/api/usePublicProfileDetail";
import { PublicScrollContinuation } from "../../../PublicHome/components/PublicScrollContinuation";

const isRenderablePersonList = (value: unknown): value is PersonList =>
  isNonNullObject(value) && Array.isArray(value.recommended_people);

const PublicPersonList = () => {
  const { username, listSlug } = useParams<{ username: string; listSlug: string }>();
  const location = useLocation();
  const outletContext = useOutletContext<{ setIsPageLoaded?: (val: boolean) => void } | null>();

  const [selectedPerson, setSelectedPerson] = useState<RecommendedPerson | null>(null);

  const { data: accountData } = usePublicProfileShell(username);
  const page = usePublicProfileDetail(username, "people", listSlug);
  const { data, loading, error, refetch } = page;

  const list = (Array.isArray(data?.personLists) ? data.personLists : []).find(isRenderablePersonList);
  const hasUsableData = Boolean(list);
  const people = deduplicatePeople<RecommendedPerson>(list?.recommended_people ?? []);
  const accountDocumentId = typeof accountData?.documentId === "string" ? accountData.documentId : undefined;
  const creatorName = typeof accountData?.Account_Name === "string" ? accountData.Account_Name : username;
  const analytics = useTrackAnalytics(
    {
      ...createAnalyticsOptions.people(accountDocumentId || "", username, list?.documentId),
      waitForLocation: true,
    },
  );

  useEffect(() => {
    if (!loading || hasUsableData) {
      outletContext?.setIsPageLoaded?.(true);
    }
  }, [hasUsableData, loading, outletContext]);

  const handlePersonClick = useCallback((person: RecommendedPerson) => {
    setSelectedPerson(person);
    analytics.trackClick("person-card", {
      id: person.documentId,
      listId: list?.documentId,
      listName: list?.List_Name,
      title: person.full_name || person.name,
      category: person.people_category?.Category_name,
    });
  }, [analytics, list]);

  usePublicHeaderDescriptor(list ? {
    navigationKey: location.key,
    title: list.List_Name,
    url: window.location.href,
    analyticsContext: "people-list-header",
    analyticsMetadata: {
      listId: list.documentId,
      listName: list.List_Name,
    },
  } : undefined);

  const pageTitle = list ? `${list.List_Name} | ${creatorName}'s People List | explorers` : `People List | explorers`;
  const metaDescription = list?.list_description
    ? list.list_description
    : list
      ? `Explore the curated people list "${list.List_Name}" featuring ${people.length}${page.hasMore ? "+" : ""} people recommended by ${creatorName} on explorers.`
      : "Explore people recommendations on explorers.";

  const seoKeywords = list
    ? [`${list.List_Name}`, `${creatorName} people`, `${list.slug}`, "people list", "explorers"]
    : ["people list", "explorers"];

  return (
    <>
      {!loading && list && (
        <SEO
          title={pageTitle}
          description={metaDescription}
          keywords={seoKeywords}
          canonical={createCanonicalUrl(`/${username}/people/${listSlug}`)}
          type="website"
          author={creatorName}
          siteName="explorers"
        />
      )}
      <div data-category-page className="min-h-screen bg-[var(--category-page,#0d1117)] text-[color:var(--category-text,#fff)]" aria-busy={loading || undefined}>
        {/* Header content section */}
        <div className="max-w-5xl mx-auto px-4 pt-6 pb-2">
          <Link
            to={`/${username}/people`}
            className="inline-flex items-center gap-1.5 text-sm text-[color:var(--category-muted,rgba(255,255,255,0.5))] hover:text-[color:var(--category-text,rgba(255,255,255,0.8))] transition-colors mb-6"
          >
            <ArrowLeft size={14} /> {creatorName}'s People
          </Link>

          {Boolean(error) && hasUsableData && <PublicRoutePartialNotice message="Some people data is unavailable." />}

          {loading && !hasUsableData ? (
            <>
              <div className="h-7 w-48 bg-[var(--category-skeleton,rgba(255,255,255,0.05))] animate-pulse rounded mb-2" />
              <div className="h-4 w-64 bg-[var(--category-skeleton,rgba(255,255,255,0.05))] animate-pulse rounded" />
            </>
          ) : error && !hasUsableData && !isPublicProfileNotFound(error) ? (
            <PublicRouteErrorState title="People list unavailable" error={error} onRetry={refetch} />
          ) : list ? (
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-xl md:text-2xl font-poppins font-bold text-[color:var(--category-text,#fff)] mb-1">{list.List_Name}</h1>
                {list.list_description && (
                  <p className="text-[color:var(--category-muted,#9ca3af)] font-poppins text-xs md:text-sm mt-1 max-w-xl">{list.list_description}</p>
                )}
                <p className="text-[color:var(--category-muted,#9ca3af)] font-poppins text-xs md:text-sm mt-2">{people.length}{page.hasMore ? "+" : ""} person{people.length !== 1 ? "s" : ""}</p>
              </div>
            </div>
          ) : (
            <p className="text-[color:var(--category-muted,rgba(255,255,255,0.4))]">List not found or not published.</p>
          )}
        </div>

        {/* Grid of person cards */}
        <div className="max-w-5xl mx-auto px-4 pt-6 pb-24 md:pb-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
            {loading && !hasUsableData ? (
              [1, 2, 3, 4, 5, 6].map((idx) => (
                <div key={idx} className="flex flex-col items-center gap-3">
                  <div className="w-24 h-24 rounded-full bg-[var(--category-skeleton,rgba(255,255,255,0.05))] skeleton-shimmer relative overflow-hidden" />
                  <div className="w-20 h-3 rounded bg-[var(--category-skeleton,rgba(255,255,255,0.05))] skeleton-shimmer relative overflow-hidden" />
                </div>
              ))
            ) : (
              people.map((person) => (
                <button
                  key={person.documentId}
                  onClick={() => handlePersonClick(person)}
                  className="flex flex-col items-center gap-2 text-center group"
                >
                  <div className="relative w-24 h-24 rounded-full overflow-hidden bg-[var(--category-card,rgba(255,255,255,0.05))] ring-2 ring-[color:var(--category-border,rgba(255,255,255,0.1))] group-hover:ring-[color:var(--category-focus,rgba(167,139,250,0.5))] transition-all shadow-lg group-hover:scale-105 duration-200">
                    {person.avatar_url ? (
                      <img src={buildImageUrl(person.avatar_url)} alt={person.full_name} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Users size={28} className="text-[color:var(--category-muted,rgba(255,255,255,0.2))]" />
                      </div>
                    )}
                    {person.platform && (
                      <div className="absolute bottom-1 right-1 p-1 bg-black/60 rounded-full border border-white/10 flex items-center justify-center shadow-md z-10">
                        <PlatformIcon platform={person.platform} size={10} />
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-[color:var(--category-text,#fff)] line-clamp-1">{person.full_name}</p>
                    {person.handle && (
                      <p className="text-[10px] text-[color:var(--category-muted,rgba(255,255,255,0.4))] truncate">@{person.handle}</p>
                    )}
                    {person.headline && (
                      <p className="text-[10px] text-[color:var(--category-muted,rgba(255,255,255,0.3))] line-clamp-1 mt-0.5">{person.headline}</p>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
          <PublicScrollContinuation {...page} label="people" className="mt-6" />
        </div>

        <PersonDetailModal
          open={!!selectedPerson}
          person={selectedPerson}
          onClose={() => setSelectedPerson(null)}
        />
      </div>
    </>
  );
};

export default PublicPersonList;
