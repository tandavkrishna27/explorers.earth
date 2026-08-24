import { useState, useCallback, useMemo, useEffect } from "react";
import { useParams, useNavigate, Link, useOutletContext } from "react-router-dom";
import { useQuery, gql } from "@apollo/client";
import { Users, Share2, ArrowLeft } from "lucide-react";
import { PUBLIC_PEOPLE_DATA } from "../../api/query";
import {
  deduplicatePeople,
  buildImageUrl,
  slugToCategoryName,
  categoryToSlug,
} from "../../utils/personHelpers";
import PlatformIcon from "../PlatformIcon";
import type { RecommendedPerson, PersonList } from "../../types";
import PersonDetailModal from "./PersonDetailModal";
import { toast } from "sonner";
import SEO from "../../../../components/SEO";
import { createCanonicalUrl } from "../../../../utils/getCurrentDomain";
import { createAnalyticsOptions, useTrackAnalytics } from "../../../../services/analyticsService";

const ACCOUNT_BY_USERNAME = gql`
  query AccountByUsernameForPersonSector($username: String!) {
    usersPermissionsUsers(filters: { username: { eq: $username } }) {
      documentId
      username
      accounts {
        documentId
        Account_Name
      }
    }
  }
`;

const PublicPersonSector = () => {
  const { username, sectorSlug } = useParams<{ username: string; sectorSlug: string }>();
  const navigate = useNavigate();
  const outletContext = useOutletContext<{ setIsPageLoaded?: (val: boolean) => void } | null>();
  const sectorName = slugToCategoryName(sectorSlug ?? "");

  const [selectedPerson, setSelectedPerson] = useState<RecommendedPerson | null>(null);

  const { data: userLookup, loading: userLoading } = useQuery(ACCOUNT_BY_USERNAME, {
    variables: { username },
    skip: !username,
  });

  const accountDocumentId = userLookup?.usersPermissionsUsers?.[0]?.accounts?.[0]?.documentId;
  const creatorName = userLookup?.usersPermissionsUsers?.[0]?.accounts?.[0]?.Account_Name || username;
  const analytics = useTrackAnalytics(
    createAnalyticsOptions.people(accountDocumentId || "", username),
  );

  const { data, loading: peopleLoading, error } = useQuery<{ personLists: PersonList[] }>(PUBLIC_PEOPLE_DATA, {
    variables: { accountDocumentId },
    skip: !accountDocumentId,
    fetchPolicy: "cache-and-network",
  });

  const loading = userLoading || peopleLoading;

  useEffect(() => {
    if (!loading) {
      outletContext?.setIsPageLoaded?.(true);
    }
  }, [loading, outletContext]);

  const lists = data?.personLists ?? [];

  // Extract all people across lists, deduplicate, and filter by sector slug
  const allPeople = useMemo(() => {
    return deduplicatePeople<RecommendedPerson>(lists.flatMap((l) => l.recommended_people ?? []));
  }, [lists]);

  const sectorPeople = useMemo(() => {
    return allPeople.filter(
      (p) =>
        p.people_category?.Category_name &&
        categoryToSlug(p.people_category.Category_name) === sectorSlug
    );
  }, [allPeople, sectorSlug]);

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

  const handlePersonClick = useCallback((person: RecommendedPerson) => {
    setSelectedPerson(person);
    const owningList = owningListByPersonId.get(person.documentId);
    analytics.trackClick("person-card", {
      id: person.documentId,
      listId: person.person_list?.documentId || owningList?.documentId,
      listName: person.person_list?.List_Name || owningList?.name,
      title: person.full_name || person.name,
      category: person.people_category?.Category_name,
    });
  }, [analytics, owningListByPersonId]);

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: `${sectorName} recommendations by ${creatorName}`, url });
      } catch {
        /* ignore */
      }
    } else {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied!");
    }
    analytics.trackClick("share-button", {
      context: "people-sector-header",
      sector: sectorSlug,
    });
  };

  const pageTitle = `${sectorName} | ${creatorName}'s People Sector | explorers`;
  const metaDescription = `Explore ${sectorPeople.length} people in ${sectorName} recommended by ${creatorName} on explorers.`;
  const seoKeywords = [sectorName, `${creatorName} people`, "people list", "explorers"];

  return (
    <>
      {!loading && (
        <SEO
          title={pageTitle}
          description={metaDescription}
          keywords={seoKeywords}
          canonical={createCanonicalUrl(`/${username}/people/sector/${sectorSlug}`)}
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

        {/* Header content section */}
        <div className="max-w-5xl mx-auto px-4 pt-6 pb-2 mt-14">
          <Link
            to={`/${username}/people`}
            className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white/80 transition-colors mb-6"
          >
            <ArrowLeft size={14} /> {creatorName}'s People
          </Link>

          {loading ? (
            <>
              <div className="h-7 w-48 bg-white/5 animate-pulse rounded mb-2" />
              <div className="h-4 w-64 bg-white/5 animate-pulse rounded" />
            </>
          ) : error ? (
            <p className="text-red-400">Failed to load sector.</p>
          ) : (
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-xl md:text-2xl font-poppins font-bold text-white mb-1">
                  {sectorName}
                </h1>
                <p className="text-gray-400 font-poppins text-xs md:text-sm mt-2">
                  {sectorPeople.length} person{sectorPeople.length !== 1 ? "s" : ""}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Grid of person cards */}
        <div className="max-w-5xl mx-auto px-4 pt-6 pb-24 md:pb-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
            {loading ? (
              [1, 2, 3, 4, 5, 6].map((idx) => (
                <div key={idx} className="flex flex-col items-center gap-3">
                  <div className="w-24 h-24 rounded-full bg-white/5 skeleton-shimmer relative overflow-hidden" />
                  <div className="w-20 h-3 rounded bg-white/5 skeleton-shimmer relative overflow-hidden" />
                </div>
              ))
            ) : sectorPeople.length === 0 ? (
              <div className="col-span-full py-12 text-center text-white/40 text-sm">
                No people recommended in this sector.
              </div>
            ) : (
              sectorPeople.map((person) => (
                <button
                  key={person.documentId}
                  onClick={() => handlePersonClick(person)}
                  className="flex flex-col items-center gap-2 text-center group"
                >
                  <div className="relative w-24 h-24 rounded-full overflow-hidden bg-white/5 ring-2 ring-white/10 group-hover:ring-violet-400/50 transition-all shadow-lg group-hover:scale-105 duration-200">
                    {person.avatar_url ? (
                      <img
                        src={buildImageUrl(person.avatar_url)}
                        alt={person.full_name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Users size={28} className="text-white/20" />
                      </div>
                    )}
                    {person.platform && (
                      <div className="absolute bottom-1 right-1 p-1 bg-black/60 rounded-full border border-white/10 flex items-center justify-center shadow-md z-10">
                        <PlatformIcon platform={person.platform} size={10} />
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-white line-clamp-1">
                      {person.full_name}
                    </p>
                    {person.handle && (
                      <p className="text-[10px] text-white/40 truncate">@{person.handle}</p>
                    )}
                    {person.headline && (
                      <p className="text-[10px] text-white/30 line-clamp-1 mt-0.5">
                        {person.headline}
                      </p>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
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

export default PublicPersonSector;
