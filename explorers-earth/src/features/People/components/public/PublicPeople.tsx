import { useState, useMemo, useCallback, useEffect } from "react";
import { useParams, useNavigate, useOutletContext } from "react-router-dom";
import { useQuery, gql } from "@apollo/client";
import { Users, Share2 } from "lucide-react";
import { PUBLIC_PEOPLE_DATA } from "../../api/query";
import { deduplicatePeople, extractUniqueCategories } from "../../utils/personHelpers";
import { toast } from "sonner";
import type { RecommendedPerson, PersonList } from "../../types";
import PersonCarouselRow from "./PersonCarouselRow";
import PersonDetailModal from "./PersonDetailModal";
import SEO from "../../../../components/SEO";
import { createCanonicalUrl } from "../../../../utils/getCurrentDomain";
import PersonTopPicksHero from "./PersonTopPicksHero";
import PersonTopPicksMobileHero from "./PersonTopPicksMobileHero";
import HeroSkeleton from "../../../../components/ui/HeroSkeleton";
import { createAnalyticsOptions, useTrackAnalytics } from "../../../../services/analyticsService";

const ACCOUNT_BY_USERNAME = gql`
  query AccountByUsernamePeople($username: String!) {
    usersPermissionsUsers(filters: { username: { eq: $username } }) {
      documentId
      username
      accounts {
        documentId
        Account_Name
        profile_picture {
          url
        }
      }
    }
  }
`;

const PublicPeople = () => {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const outletContext = useOutletContext<{ setIsPageLoaded?: (val: boolean) => void } | null>();

  const [modalState, setModalState] = useState<{ open: boolean; person: RecommendedPerson | null }>({
    open: false,
    person: null,
  });

  const { data: userLookup, loading: userLoading } = useQuery(ACCOUNT_BY_USERNAME, {
    variables: { username },
    skip: !username,
  });

  const accountDocumentId = userLookup?.usersPermissionsUsers?.[0]?.accounts?.[0]?.documentId;
  const creatorName = userLookup?.usersPermissionsUsers?.[0]?.accounts?.[0]?.Account_Name || username;

  const { data, loading: peopleLoading } = useQuery(PUBLIC_PEOPLE_DATA, {
    variables: { accountDocumentId },
    skip: !accountDocumentId,
    fetchPolicy: "cache-and-network",
  });

  const loading = userLoading || peopleLoading;

  useEffect(() => {
    if (!loading) {
      (window as any).__publicProfileLoaded = true;
      outletContext?.setIsPageLoaded?.(true);
    }
  }, [loading, outletContext]);

  const lists: PersonList[] = data?.personLists ?? [];
  const analytics = useTrackAnalytics(
    createAnalyticsOptions.people(accountDocumentId || "", username),
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
    return deduplicatePeople(lists.flatMap((l) => l.recommended_people ?? []));
  }, [lists]);

  const topPicks = useMemo(() => {
    return allPeople
      .filter((p) => p.is_pinned)
      .sort((a, b) => (a.pin_order ?? 999) - (b.pin_order ?? 999));
  }, [allPeople]);

  const allCategories = useMemo(() => {
    return extractUniqueCategories(allPeople.map((p) => p.people_category?.Category_name ? [p.people_category.Category_name] : []));
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

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title: `${creatorName}'s People`, url }); } catch { /* ignore */ }
    } else {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied!");
    }
    analytics.trackClick("share-button", { context: "people-header" });
  };

  const personCount = allPeople.length;
  const listCount = lists.length;
  const pageTitle = `${creatorName} | People & Creators | explorers`;
  const metaDescription = personCount > 0
    ? `Browse people and creator recommendations curated by ${creatorName} on explorers. Explore ${listCount} list${listCount !== 1 ? 's' : ''} featuring ${personCount} inspiring person${personCount !== 1 ? 's' : ''}.`
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
      {!loading && userLookup && (
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

      <div className="min-h-screen bg-[#0d1117] text-white">
        {/* Fixed Header */}
        <div className="fixed top-0 left-0 right-0 z-50 bg-[#2a2a2a]/90 backdrop-blur-sm border-b border-gray-700 h-14">
          <div className="max-w-4xl mx-auto flex items-center justify-between h-full px-6">
            <span
              className="text-white font-bold text-2xl cursor-pointer"
              onClick={() => navigate("/")}
            >
              explorers.earth
            </span>
            <div className="flex gap-2">
              <button
                onClick={handleShare}
                className="p-2 bg-gray-700 hover:bg-gray-600 text-white rounded-md transition-all duration-300 flex items-center justify-center"
                aria-label="Share"
              >
                <Share2 size={16} />
              </button>

            </div>
          </div>
        </div>

        {/* Content */}
        <div className="relative z-10 max-w-5xl mx-auto px-4 pb-16 pt-20">
          {loading ? (
            (window as any).__publicProfileLoaded ? (
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
                      <div className="w-1.5 h-[22px] bg-white/10 rounded-sm flex-shrink-0 skeleton-shimmer relative overflow-hidden" />
                      <div className="h-5 w-32 bg-white/8 rounded skeleton-shimmer relative overflow-hidden" />
                    </div>
                    <div className="flex gap-5 overflow-hidden">
                      {[1, 2, 3, 4, 5].map((idx) => (
                        <div key={idx} className="flex-shrink-0 flex flex-col items-center gap-2">
                          <div className="w-20 h-20 rounded-full bg-white/5 skeleton-shimmer relative overflow-hidden" />
                          <div className="w-16 h-3 rounded bg-white/5 skeleton-shimmer relative overflow-hidden" />
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : null
          ) : (
            <>
              {/* Empty state */}
              {lists.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-center">
                  <Users size={48} className="text-white/20 mb-4" />
                  <p className="text-white/40 text-lg font-medium">No people shared yet</p>
                  <p className="text-white/25 text-sm mt-1">Check back later for recommendations</p>
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
                      <p className="text-sm font-semibold text-white/60 mb-3">Browse by Category</p>
                      <div className="flex flex-wrap gap-2">
                        {allCategories.map((cat) => (
                          <button
                            key={cat.slug}
                            onClick={() => navigate(`/${username}/people/sector/${cat.slug}`)}
                            className="text-xs text-violet-400/80 bg-violet-900/20 hover:bg-violet-900/40 border border-violet-800/20 px-3 py-1.5 rounded-full transition-all"
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
        </div>

        <PersonDetailModal
          open={modalState.open}
          person={modalState.person}
          onClose={() => setModalState({ open: false, person: null })}
        />
      </div>
    </>
  );
};

export default PublicPeople;
