import { useState, useCallback, useMemo, useEffect } from "react";
import { useParams, Link, useOutletContext, useLocation, useNavigate } from "react-router-dom";
import { Users, ArrowLeft } from "lucide-react";
import {
  buildImageUrl,
} from "../../utils/personHelpers";
import PlatformIcon from "../PlatformIcon";
import type { RecommendedPerson } from "../../types";
import PersonDetailModal from "./PersonDetailModal";
import SEO from "../../../../components/SEO";
import { createCanonicalUrl } from "../../../../utils/getCurrentDomain";
import { createAnalyticsOptions, useTrackAnalytics } from "../../../../services/analyticsService";
import { usePublicHeaderDescriptor } from "../../../PublicHome/components/PublicHeaderDescriptorContext";
import { PublicRouteErrorState, settlePublicRouteRetries } from "../../../PublicHome/components/PublicRouteContentState";
import { usePublicProfileShell } from "../../../PublicHome/api/usePublicProfileShell";
import { usePublicPeopleSector } from "../../api/usePublicPeopleSector";
import { publicPersonViewModel } from "../../api/publicPeopleSectorViewModel";
import { subscribePublicProfileInvalidation } from "../../../PublicHome/api/publicProfileInvalidation";

const PublicPersonSector = () => {
  const { username, sectorSlug } = useParams<{ username: string; sectorSlug: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const outletContext = useOutletContext<{ setIsPageLoaded?: (val: boolean) => void } | null>();

  const [selectedPerson, setSelectedPerson] = useState<RecommendedPerson | null>(null);

  const { data: accountData, loading: userLoading, error: userError, refetch: refetchUser } = usePublicProfileShell(username);
  const accountDocumentId = typeof accountData?.documentId === "string" ? accountData.documentId : undefined;
  const creatorName = typeof accountData?.Account_Name === "string" ? accountData.Account_Name : username;
  const analytics = useTrackAnalytics(
    createAnalyticsOptions.people(accountDocumentId || "", username),
  );

  const eligible = accountData?.public_people === "Yes";
  const { data, loading: peopleLoading, error: peopleError, refetch: refetchPeople } = usePublicPeopleSector(username, sectorSlug, eligible);
  const sectorName = data?.sector.Category_name ?? "People sector";
  const canonicalSlug = data?.canonicalSlug;
  useEffect(() => {if(data?.redirectSlug && data.redirectSlug!==sectorSlug)navigate(`/${username}/people/sector/${data.redirectSlug}`,{replace:true});},[data?.redirectSlug,sectorSlug,username,navigate]);
  useEffect(() => {setSelectedPerson(null);},[username,sectorSlug,eligible]);
  useEffect(() => subscribePublicProfileInvalidation(event=>{if(event.username.trim().toLowerCase()===username?.trim().toLowerCase()&&(event.category==='public_people'||event.category==='public_profile'))setSelectedPerson(null);}),[username]);

  const loading = userLoading || peopleLoading;
  const queryError = userError || peopleError || (!userLoading && !eligible ? new Error("PUBLIC_PROFILE_404") : null);
  const hasUsableData = Boolean(data) && eligible;

  useEffect(() => {
    if (!loading || hasUsableData) {
      outletContext?.setIsPageLoaded?.(true);
    }
  }, [hasUsableData, loading, outletContext]);

  const handleRetry = useCallback(async () => {
    await settlePublicRouteRetries(refetchUser, accountDocumentId ? refetchPeople : undefined);
  }, [accountDocumentId, refetchPeople, refetchUser]);

  const sectorPeople = useMemo(() => (data?.recommended_people ?? []).map(publicPersonViewModel),[data]);

  const handlePersonClick = useCallback((person: RecommendedPerson) => {
    setSelectedPerson(person);
    analytics.trackClick("person-card", {
      id: person.documentId,
      listId: person.person_list?.documentId,
      listName: person.person_list?.List_Name,
      title: person.full_name || person.name,
      category: person.people_category?.Category_name,
    });
  }, [analytics]);

  usePublicHeaderDescriptor(sectorSlug ? {
    navigationKey: location.key,
    title: `${sectorName} recommendations by ${creatorName}`,
    url: canonicalSlug ? createCanonicalUrl(`/${username}/people/sector/${canonicalSlug}`) : window.location.href,
    analyticsContext: "people-sector-header",
    analyticsMetadata: { sector: sectorSlug },
  } : undefined);

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
          canonical={createCanonicalUrl(`/${username}/people/sector/${canonicalSlug ?? sectorSlug}`)}
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

          {loading && !hasUsableData ? (
            <>
              <div className="h-7 w-48 bg-[var(--category-skeleton,rgba(255,255,255,0.05))] animate-pulse rounded mb-2" />
              <div className="h-4 w-64 bg-[var(--category-skeleton,rgba(255,255,255,0.05))] animate-pulse rounded" />
            </>
          ) : queryError && !hasUsableData ? (
            <PublicRouteErrorState title="People sector unavailable" error={queryError} onRetry={handleRetry} />
          ) : (
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-xl md:text-2xl font-poppins font-bold text-[color:var(--category-text,#fff)] mb-1">
                  {sectorName}
                </h1>
                <p className="text-[color:var(--category-muted,#9ca3af)] font-poppins text-xs md:text-sm mt-2">
                  {sectorPeople.length} person{sectorPeople.length !== 1 ? "s" : ""}
                </p>
              </div>
            </div>
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
            ) : queryError ? null : hasUsableData && sectorPeople.length === 0 ? (
              <div className="col-span-full py-12 text-center text-[color:var(--category-muted,rgba(255,255,255,0.4))] text-sm">
                No people recommended in this sector.
              </div>
            ) : (
              sectorPeople.map((person) => (
                <button
                  key={person.documentId}
                  onClick={() => handlePersonClick(person)}
                  className="flex flex-col items-center gap-2 text-center group"
                >
                  <div className="relative w-24 h-24 rounded-full overflow-hidden bg-[var(--category-card,rgba(255,255,255,0.05))] ring-2 ring-[color:var(--category-border,rgba(255,255,255,0.1))] group-hover:ring-[color:var(--category-focus,rgba(167,139,250,0.5))] transition-all shadow-lg group-hover:scale-105 duration-200">
                    {person.avatar_url ? (
                      <img
                        src={buildImageUrl(person.avatar_url)}
                        alt={person.full_name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
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
                    <p className="text-xs font-semibold text-[color:var(--category-text,#fff)] line-clamp-1">
                      {person.full_name}
                    </p>
                    {person.handle && (
                      <p className="text-[10px] text-[color:var(--category-muted,rgba(255,255,255,0.4))] truncate">@{person.handle}</p>
                    )}
                    {person.headline && (
                      <p className="text-[10px] text-[color:var(--category-muted,rgba(255,255,255,0.3))] line-clamp-1 mt-0.5">
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
          open={eligible && !peopleLoading && !!selectedPerson}
          person={eligible && !peopleLoading ? selectedPerson : null}
          onClose={() => setSelectedPerson(null)}
        />
      </div>
    </>
  );
};

export default PublicPersonSector;
