import { useState, useMemo, useCallback, useEffect } from "react";
import { useParams, useNavigate, useOutletContext, useLocation } from "react-router-dom";
import { Users } from "lucide-react";
import { publicPeopleLists, publicPeopleSectors } from "../../api/publicPeopleSectorViewModel";
import { subscribePublicProfileInvalidation } from "../../../PublicHome/api/publicProfileInvalidation";
import type { RecommendedPerson } from "../../types";
import PersonCarouselRow from "./PersonCarouselRow";
import PersonDetailModal from "./PersonDetailModal";
import SEO from "../../../../components/SEO";
import { createCanonicalUrl } from "../../../../utils/getCurrentDomain";
import PersonTopPicksHero from "./PersonTopPicksHero";
import PersonTopPicksMobileHero from "./PersonTopPicksMobileHero";
import HeroSkeleton from "../../../../components/ui/HeroSkeleton";
import { createAnalyticsOptions, useTrackAnalytics } from "../../../../services/analyticsService";
import { usePublicHeaderDescriptor } from "../../../PublicHome/components/PublicHeaderDescriptorContext";
import { PublicRouteErrorState, PublicRoutePartialNotice, settlePublicRouteRetries } from "../../../PublicHome/components/PublicRouteContentState";
import { usePublicProfileShell } from "../../../PublicHome/api/usePublicProfileShell";
import { usePublicRecommendationCategory } from "../../../PublicHome/api/usePublicRecommendationCategory";
import { PublicScrollContinuation } from "../../../PublicHome/components/PublicScrollContinuation";

const PublicPeople = () => {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const outletContext = useOutletContext<{ isShellRevealed?: boolean; setIsPageLoaded?: (val: boolean) => void } | null>();

  const [modalState, setModalState] = useState<{ open: boolean; person: RecommendedPerson | null }>({
    open: false,
    person: null,
  });

  const { data: accountData, loading: userLoading, error: userError, refetch: refetchUser } = usePublicProfileShell(username);
  const accountHandle = typeof accountData?.username === "string" ? accountData.username : undefined;
  const creatorName = typeof accountData?.Account_Name === "string" ? accountData.Account_Name : username;
  const eligible=accountData?.public_people === "Yes";
  const query = usePublicRecommendationCategory(username, "people", eligible);
  const { data, loading: peopleLoading, error: peopleError, refetch: refetchPeople } = query;

  const loading = userLoading || peopleLoading;
  const mapped=useMemo(()=>{try{return {lists:eligible&&data?publicPeopleLists(data):[],error:null};}catch(error){return {lists:[],error};}},[data,eligible]);
  const lists=mapped.lists;
  const queryError = userError || peopleError || mapped.error || (!userLoading&&!eligible?new Error('PUBLIC_PROFILE_404'):null);
  const hasUsableData = Boolean(data)&&!mapped.error&&eligible;
  useEffect(()=>{setModalState({open:false,person:null});},[username,eligible]);
  useEffect(()=>subscribePublicProfileInvalidation(event=>{if(event.username.trim().toLowerCase()===username?.trim().toLowerCase()&&(event.category==='public_people'||event.category==='public_profile'))setModalState({open:false,person:null});}),[username]);

  useEffect(() => {
    if (!loading || hasUsableData) {
      outletContext?.setIsPageLoaded?.(true);
    }
  }, [hasUsableData, loading, outletContext]);

  const handleRetry = useCallback(async () => {
    await settlePublicRouteRetries(refetchUser, accountHandle ? refetchPeople : undefined);
  }, [accountHandle, refetchPeople, refetchUser]);

  const analytics = useTrackAnalytics(
    createAnalyticsOptions.people(accountHandle || "", username),
  );

  const owningListByPersonId = useMemo(() => {
    const ownership = new Map<string, { documentId: string; name: string }>();
    lists.forEach((list) => {
      list.recommended_people?.forEach((person) => {
        ownership.set(person.documentId, {
          documentId: list.documentId,
          name: list.List_Name,
        });
      });
    });
    return ownership;
  }, [lists]);

  const allPeople = useMemo(() => {
    return lists.flatMap((l) => l.recommended_people);
  }, [lists]);

  const topPicks = useMemo(() => {
    return allPeople
      .filter((p) => p.is_pinned)
      .sort((a, b) => (a.pin_order ?? 999) - (b.pin_order ?? 999));
  }, [allPeople]);

  const allCategories = useMemo(() => {
    return publicPeopleSectors(allPeople);
  }, [allPeople]);

  const handlePersonClick = useCallback((person: RecommendedPerson) => {
    setModalState({ open: true, person });
    const owningList = owningListByPersonId.get(person.documentId);
    analytics.trackClick("person-card", {
      id: person.documentId,
      listId: person.person_list?.documentId || owningList?.documentId,
      listName: person.person_list?.List_Name || owningList?.name,
      title: person.name,
      platform: person.primary_platform || undefined,
      category: person.people_category?.Category_name,
    });
  }, [analytics, owningListByPersonId]);

  usePublicHeaderDescriptor({
    navigationKey: location.key,
    title: `${creatorName}'s People`,
    url: window.location.href,
    analyticsContext: "people-header",
  });

  const personCount = allPeople.length;
  const listCount = lists.length;
  const pageTitle = `${creatorName} | People & Creators | explorers`;
  const metaDescription = personCount > 0
    ? `Browse people and creator recommendations curated by ${creatorName} on explorers. Explore ${listCount}${query.hasMore || query.error ? '+' : ''} list${listCount !== 1 ? 's' : ''} featuring ${personCount} loaded inspiring person${personCount !== 1 ? 's' : ''}.`
    : `Explore people recommendations shared by ${creatorName} on explorers.`;

  const seoKeywords = [
    `${creatorName} people`,
    `${username} creators`,
    "explorers people",
    "creator recommendations",
    "curated people lists",
    ...lists.map(l => l.List_Name)
  ];

  return (
    <>
      {!loading && accountData && (
        <SEO
          title={pageTitle}
          description={metaDescription}
          keywords={seoKeywords}
          canonical={createCanonicalUrl(`/${username}/people`)}
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
                <div className="hidden lg:block">
                  <HeroSkeleton accentColor="purple" showThumbnails />
                </div>
                <div className="lg:hidden">
                  <HeroSkeleton accentColor="purple" mobile />
                </div>
                {[1, 2, 3].map((i) => (
                  <section key={i} className="mb-8">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-1.5 h-[22px] bg-[var(--category-skeleton,rgba(255,255,255,0.1))] rounded-sm flex-shrink-0 skeleton-shimmer relative overflow-hidden" />
                      <div className="h-5 w-32 bg-[var(--category-skeleton,rgba(255,255,255,0.08))] rounded skeleton-shimmer relative overflow-hidden" />
                    </div>
                    <div className="flex gap-5 overflow-hidden">
                      {[1, 2, 3, 4, 5].map((idx) => (
                        <div key={idx} className="flex-shrink-0 flex flex-col items-center gap-2">
                          <div className="w-20 h-20 rounded-full bg-[var(--category-skeleton,rgba(255,255,255,0.05))] skeleton-shimmer relative overflow-hidden" />
                          <div className="w-16 h-3 rounded bg-[var(--category-skeleton,rgba(255,255,255,0.05))] skeleton-shimmer relative overflow-hidden" />
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : null
          ) : queryError && !hasUsableData ? (
            <PublicRouteErrorState title="People unavailable" error={queryError} onRetry={handleRetry} />
          ) : (
            <>
              {Boolean(queryError) && <PublicRoutePartialNotice message="Some people data is unavailable." />}
              {/* Empty state */}
              {allPeople.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-center">
                  <Users size={48} className="text-[color:var(--category-muted,rgba(255,255,255,0.2))] mb-4" />
                  <p className="text-[color:var(--category-muted,rgba(255,255,255,0.4))] text-lg font-medium">No people shared yet</p>
                  <p className="text-[color:var(--category-muted,rgba(255,255,255,0.25))] text-sm mt-1">Check back later for recommendations</p>
                </div>
              ) : (
                <>
                  {/* Top Picks Hero */}
                  {topPicks.length > 0 && (
                    <div className="mt-4">
                      <div className="hidden lg:block">
                        <PersonTopPicksHero
                          people={topPicks}
                          onPersonClick={handlePersonClick}
                        />
                      </div>
                      <div className="block lg:hidden">
                        <PersonTopPicksMobileHero
                          people={topPicks}
                          onPersonClick={handlePersonClick}
                        />
                      </div>
                    </div>
                  )}

                  {/* Lists as carousel rows */}
                  <div className="mt-4 space-y-8">
                    {lists.map((list) => (
                      <PersonCarouselRow
                        key={list.documentId}
                        list={list}
                        onPersonClick={handlePersonClick}
                        onViewAll={() => {
                          analytics.trackClick("person-list", {
                            listId: list.documentId,
                            listName: list.List_Name,
                          });
                          navigate(`/${username}/people/${list.slug}`);
                        }}
                      />
                    ))}
                  </div>

                  {/* Category browse */}
                  {allCategories.length > 0 && (
                    <div className="mt-10">
                      <p className="text-sm font-semibold text-[color:var(--category-muted,rgba(255,255,255,0.6))] mb-3">Browse by Category</p>
                      <div className="flex flex-wrap gap-2">
                        {allCategories.map((cat) => (
                          <button
                            key={cat.slug}
                            onClick={() => navigate(`/${username}/people/sector/${cat.slug}`)}
                            className="text-xs text-[color:var(--category-text,rgba(167,139,250,0.8))] bg-violet-900/20 hover:bg-violet-900/40 border border-violet-800/20 px-3 py-1.5 rounded-full transition-all"
                          >
                            {cat.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
          <PublicScrollContinuation {...query} label="people lists" />
        </div>

        <PersonDetailModal
          open={eligible && !peopleLoading && modalState.open}
          person={eligible && !peopleLoading ? modalState.person : null}
          onClose={() => setModalState({ open: false, person: null })}
        />
      </div>
    </>
  );
};

export default PublicPeople;
