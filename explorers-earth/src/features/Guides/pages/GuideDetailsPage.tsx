import { useCategoryNavigation } from "../../navigation/CategoryNavigationProvider";
import { GuideEditingProvider } from "../context/GuideEditingProvider";
import type { IntentAuthority } from "../../navigation/categoryNavigationPolicy";
import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { EarthLoader } from "../../../components/EarthLoader";
import SEO from "../../../components/SEO";
import { createCanonicalUrl } from "../../../utils/getCurrentDomain";
import { useGuidesOwner } from "../hooks/useGuidesOwner";
import { GuidesClient } from "../api/guidesClient";
import { setGuidePublished } from "../api/guideListWrites";
import { toast } from "sonner";
import Button from "../../../components/ui/Button";
// SectionFormModal no longer used – all section editing navigates to GuideSectionFormPage
import ItineraryView from "../components/GuideDetails/ItineraryView";
import CircularTabs from "../../../components/ui/CircularTabs";
import JourneyIcon from "../../../assets/icons/JourneyIcon";
import TransportationIcon from "../../../assets/icons/TransportationIcon";
import StayIcon from "../../../assets/icons/StayIcon";
import BudgetIcon from "../../../assets/icons/BudgetIcon";
import TipsIcon from "../../../assets/icons/TipsIcon";
import BackIcon from "../../../assets/icons/BackIcon";
import GuideHeader from "../components/GuideDetails/GuideHeader";

import TipsTagsTab from "../components/GuideDetails/TipsTagsTab";
import SectionDetailModal from "../components/GuideDetails/SectionDetailModal/SectionDetailModal";
import TransportationTimeline from "../components/GuideDetails/TransportationTimeline";
import StayTimeline from "../components/GuideDetails/StayTimeline";
import BudgetTable from "../components/GuideDetails/BudgetTable";
import TipsTimeline from "../components/GuideDetails/TipsTimeline";
import GooglePlaceModal from "../../PublicHome/components/PublicGuideViews/GooglePlaceModal";
import ConfirmationModal from "../../../components/ui/ConfirmationModal";
import useAuthStore from "../../../store/store";
import { CategoryVisibilityModal } from "../../../components/CategoryVisibilityModal";
import { ListVisibilityModal } from "../../../components/ListVisibilityModal";

const GuideDetailsPage = () => {
  const { guideId } = useParams<{ guideId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [deletingSection, setDeletingSection] = useState<string | null>(null);
  const [sectionToDelete, setSectionToDelete] = useState<{ id: string; title: string } | null>(null);
  const [activeTab, setActiveTab] = useState("journey");
  const [viewMode, setViewMode] = useState<"timeline" | "list">("list");
  const [selectedSection, setSelectedSection] = useState<any>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [selectedGooglePlace, setSelectedGooglePlace] = useState<{ visible: boolean; place: any }>({
    visible: false,
    place: null,
  });
  const kebabRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const [isMainTabsSticky, setIsMainTabsSticky] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState('256px');
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const mainTabsRef = useRef<HTMLDivElement>(null);
  const guideHeaderRef = useRef<HTMLDivElement>(null);

  const navigation = useCategoryNavigation();
  const [visibilityPrompt, setVisibilityPrompt] = useState<{
    isOpen: boolean;
    categoryName: string;
    visibilityField: string;
    origin?: IntentAuthority;
    defaultValue: boolean;
  } | null>(null);

  const [listVisibilityPrompt, setListVisibilityPrompt] = useState<{
    isOpen: boolean;
    listName: string;
  } | null>(null);
  // On the owner's own guide page the author is the signed-in owner, which is why the
  // Strapi users_permissions_user relation is not needed to name them.
  const { user } = useAuthStore();

  const promptedLocation = useRef<string | null>(null);
  useEffect(() => {
    if (location.state?.justCreatedGuide && navigation.authority && promptedLocation.current !== location.key) {
      promptedLocation.current = location.key;
      const isPublic = navigation.snapshot?.visibility.public_guides === "Yes";
      if (!isPublic && navigation.authority) {
        setVisibilityPrompt({
          origin: navigation.authority,
          isOpen: true,
          categoryName: "Guides",
          visibilityField: "public_guides",
          defaultValue: false,
        });
      }
      window.history.replaceState({}, document.title);
    }
  }, [location.state, location.key, navigation.authority, navigation.snapshot]);

  // Get sidebar width from CSS variable
  useEffect(() => {
    const updateSidebarWidth = () => {
      const width = getComputedStyle(document.documentElement)
        .getPropertyValue('--sidebar-width')
        .trim() || '256px';
      setSidebarWidth(width);
    };

    updateSidebarWidth();

    // Watch for changes to the CSS variable
    const observer = new MutationObserver(updateSidebarWidth);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style']
    });

    // Also listen for resize events
    window.addEventListener('resize', updateSidebarWidth);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateSidebarWidth);
    };
  }, []);

  // One bracketed owner read for this guide, its fields and every section. `guide` is the
  // mapped legacy shape the rest of this page already reads; `observation` is the branded
  // aggregate a section write states its revision from.
  const { guide: ownedGuide, observation, content, loading, error, refresh: refetch } = useGuidesOwner(guideId);
  const data = ownedGuide ? { guide: ownedGuide } : undefined;

  // Deleting a section goes through the guide aggregate at the current revision, so a
  // delete composed against a guide someone else has edited is refused rather than
  // applied to a different set of sections than the user was looking at.
  const deleteSection = async (sectionId: string) => {
    if (!observation) throw new Error("Guide could not be loaded. Refresh and try again.");
    const intent = GuidesClient.prepareIntent(observation);
    await GuidesClient.removeSection(intent, sectionId);
    refetch();
  };

  /**
   * Saves the guide's tips and tags.
   *
   * The complete details object is sent, merged from the aggregate this page read, not a
   * partial patch - the same rule the section writes follow. A partial would let a field
   * this editor does not show arrive as a null and erase what another editor wrote.
   */
  const saveTips = async (input: {tipsNotes: unknown; tags: string[]}) => {
    if (!observation) throw new Error("Guide could not be loaded. Refresh and try again.");
    const intent = GuidesClient.prepareIntent(observation);
    await GuidesClient.writeDetails(intent, {
      ...observation.aggregate.details,
      tipsNotes: (input.tipsNotes ?? null) as Record<string, unknown> | unknown[] | null,
      tags: input.tags,
    });
    refetch();
  };

  // Refetch when returning from edit page
  useEffect(() => {
    if (location.state?.refetch) {
      refetch();
    }
  }, [location.state, refetch]);

  // Scroll detection for sticky tabs
  useEffect(() => {
    if (loading || !data?.guide) return;

    let cleanup: (() => void) | null = null;
    let timeoutId: NodeJS.Timeout;

    const initializeScroll = () => {
      const mainTabs = mainTabsRef.current;
      const guideHeader = guideHeaderRef.current;
      
      // Find the scrollable parent container (DashboardLayout flex-1 overflow-auto)
      let scrollableParent: HTMLElement | null = null;
      if (scrollContainerRef.current) {
        let parent = scrollContainerRef.current.parentElement;
        while (parent) {
          const style = window.getComputedStyle(parent);
          if (style.overflow === 'auto' || style.overflowY === 'auto' || style.overflow === 'scroll' || style.overflowY === 'scroll') {
            scrollableParent = parent;
            break;
          }
          parent = parent.parentElement;
        }
      }

      if (!mainTabs || !scrollableParent) {
        timeoutId = setTimeout(initializeScroll, 100);
        return;
      }

      let ticking = false;

      const handleScroll = () => {
        if (!ticking) {
          window.requestAnimationFrame(() => {
            if (!scrollableParent) return;

            // Tabs should stick when we've scrolled past the guide header banner
            // We use 0 as the threshold because the header hides itself during scroll
            if (guideHeader) {
              const guideHeaderRect = guideHeader.getBoundingClientRect();
              setIsMainTabsSticky(guideHeaderRect.top <= 0);
            }

            ticking = false;
          });
          ticking = true;
        }
      };

      scrollableParent.addEventListener('scroll', handleScroll, { passive: true });
      
      // Initial check
      setTimeout(handleScroll, 100);

      cleanup = () => {
        if (scrollableParent) {
          scrollableParent.removeEventListener('scroll', handleScroll);
        }
      };
    };

    timeoutId = setTimeout(initializeScroll, 50);

    return () => {
      clearTimeout(timeoutId);
      if (cleanup) cleanup();
    };
  }, [loading, data?.guide]);

  /**
   * Kebab Menu Click Outside Handler
   * Closes any open kebab menu when user clicks outside the menu container
   * Uses kebabRefs to track all menu containers (timeline and list views)
   */
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Check if click is outside all kebab menus and buttons
      const clickedOutside = !Object.values(kebabRefs.current).some(
        (ref) => ref && ref.contains(event.target as Node)
      );

      if (clickedOutside && openMenuId) {
        setOpenMenuId(null);
      }
    };

    if (openMenuId) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [openMenuId]);

  useEffect(() => {
    const loadedGuide = data?.guide;
    if (location.state?.justAddedRecommendation && loadedGuide && !loadedGuide.Visibility) {
      setListVisibilityPrompt({
        isOpen: true,
        listName: loadedGuide.Title,
      });
      window.history.replaceState({}, document.title);
    }
  }, [location.state, data?.guide]);

  if (loading) {
    return (
      <div className="dashboard-theme flex justify-center items-center min-h-screen bg-dashboard-bg">
        <EarthLoader context="general" size="small" />
      </div>
    );
  }

  if (error || !data?.guide) {
    return (
      <div className="dashboard-theme flex flex-col justify-center items-center min-h-screen bg-dashboard-bg gap-4">
        <p className="text-dashboard font-poppins text-red-500">
          Failed to load guide
        </p>
        <Button
          variant="primary"
          onClickHandler={() => navigate("/guides")}
          btnText="Back to Guides"
        />
      </div>
    );
  }

  const guide = data.guide;

  const allSections = guide.guide_sections || [];

  // Remove duplicates based on documentId (in case of cache issues)
  const sections = allSections.filter(
    (section: any, index: number, self: any[]) =>
      index === self.findIndex((s: any) => s.documentId === section.documentId)
  );

  // SEO data for guide page
  const guideTitle = guide.Title || "Travel Guide";
  
  // Convert description to string if it is Strapi rich text block format
  const guideDescriptionText = (() => {
    // The canonical collection carries a plain-text description, so there is no rich-block
    // form to unwrap here any more.
    if (!guide.Description) return "";
    if (typeof guide.Description === "string") return guide.Description;
    return "";
  })();

  const guideType = guide.Guide_Type || "";
  // Category and Best_Time_To_Visit are arrays canonically and were string-or-array in
  // Strapi, so both are flattened to one display string here rather than at each use.
  const asText = (value: string[] | string | null | undefined) =>
    Array.isArray(value) ? value.filter(Boolean).join(", ") : value || "";
  const guideCategory = asText(guide.Category);
  const bestTimeToVisit = asText(guide.Best_Time_To_Visit);
  const sectionsCount = sections.length;
  const isItineraryBased = guideType?.toLowerCase().includes("itinerary") || sections.some((s: any) => s.Section_Type === "itinerary");

  // Extract cities from Place_Details if available
  let citiesText = "";
  if (guide.Place_Details) {
    try {
      const placeDetails = typeof guide.Place_Details === "string"
        ? JSON.parse(guide.Place_Details)
        : guide.Place_Details;
      if (placeDetails?.isMultiCity && placeDetails?.cities) {
        citiesText = placeDetails.cities.map((c: any) => c.name || c).join(", ");
      } else if (placeDetails?.city) {
        citiesText = placeDetails.city;
      }
    } catch (e) {
      // Ignore parsing errors
    }
  }

  const pageTitle = `${guideTitle}${citiesText ? ` - ${citiesText}` : ""} | Travel Guide | explorers`;
  const metaDescription = guideDescriptionText || `Explore ${guideTitle}, ${isItineraryBased ? "an itinerary-based" : "a"} travel guide${citiesText ? ` covering ${citiesText}` : ""}${guideCategory ? ` in ${guideCategory} category` : ""}. Discover curated travel recommendations, ${sectionsCount > 0 ? `${sectionsCount} detailed sections including ` : ""}journey plans, accommodations, transportation, budget tips${bestTimeToVisit ? `, and best time to visit: ${bestTimeToVisit}` : ""}, and local insights.`;

  const guideKeywords = [
    guideTitle,
    "travel guide",
    "itinerary guide",
    "travel recommendations",
    "explorers guide",
    "travel planning",
    "destination guide",
    ...(citiesText ? citiesText.split(", ") : []),
    ...(guideCategory ? [guideCategory, `${guideCategory} travel`] : []),
    ...(guideType ? [guideType] : []),
    ...(bestTimeToVisit ? [`best time to visit ${citiesText || ""}`.trim()] : []),
    "journey planning",
    "travel itinerary",
    "destination recommendations",
    "travel tips",
    "local travel guide",
    "curated travel guide",
    "theme-based travel",
    "city guide",
    "travel exploration"
  ].filter(Boolean);

  const handleDeleteSection = (
    sectionDocumentId: string,
    sectionTitle: string
  ) => {
    setSectionToDelete({ id: sectionDocumentId, title: sectionTitle });
  };

  const confirmDeleteSection = async () => {
    if (!sectionToDelete) return;

    setDeletingSection(sectionToDelete.id);
    try {
      await deleteSection(sectionToDelete.id);
      toast.success("Removed from guide!");
    } catch (err: any) {
      toast.error(err.message || "Failed to remove. Please try again.");
    } finally {
      setDeletingSection(null);
      setSectionToDelete(null);
    }
  };


  // Journey Tab Content (Itinerary)
  function renderJourneyTab() {
    return (
      <>
        <SectionDetailModal
          section={selectedSection}
          guide={guide}
          isOpen={!!selectedSection}
          onClose={() => setSelectedSection(null)}
          onEdit={(section) => {
            setSelectedSection(null);
            // Navigate to the section edit page
            navigate(`/guides/${guideId}/sections/${section.documentId}/edit`, {
              state: { editingSection: section },
            });
          }}
        />

        <ItineraryView
          sections={sections}
          guide={guide}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onAddSection={() =>
            navigate(`/guides/${guideId}/sections/new`)
          }
          onSectionSelect={(section) => {
            setSelectedSection(section);
          }}
          onSectionEdit={(section) => {
            // Navigate to the section edit page
            navigate(`/guides/${guideId}/sections/${section.documentId}/edit`, {
              state: { editingSection: section },
            });
          }}
          onSectionDelete={handleDeleteSection}
          openMenuId={openMenuId}
          deletingSection={deletingSection}
          kebabRefs={kebabRefs}
          onMenuToggle={(sectionId) =>
            setOpenMenuId(openMenuId === sectionId ? null : sectionId)
          }
          onGuideUpdate={refetch}
          onPlaceClick={(place) => {
            setSelectedGooglePlace({ visible: true, place });
          }}
        />
      </>
    );
  }

  // Stay Tab Content
  function renderStayTab() {
    return (
      <StayTimeline guide={guide} />
    );
  }

  // Transportation Tab Content
  function renderTransportationTab() {
    return (
      <TransportationTimeline
        guide={guide}
      />
    );
  }

  // Budget Tab Content
  function renderBudgetTab() {
    return (
      <BudgetTable guide={guide} />
    );
  }

  return (
    <GuideEditingProvider observation={observation} list={guideId ? content?.lists.get(guideId) : undefined} reload={refetch}>
      <SEO
        title={pageTitle}
        description={metaDescription}
        keywords={guideKeywords}
        canonical={createCanonicalUrl(`/guides/${guideId}`)}
        type="article"
        noIndex={!guide.Visibility}
        siteName="explorers"
        author={user?.username || "explorers User"}
      />
      <div ref={scrollContainerRef} className="dashboard-theme min-h-screen bg-dashboard-bg text-dashboard-light pb-20 md:pb-8">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          {/* Top Bar - Back Button and Visibility Toggle */}
          <div className="mb-6 flex justify-between items-center gap-4">
            {/* Back Button - Top Left */}
            <button
              onClick={() => navigate("/guides")}
              className="flex items-center gap-2 text-dashboard-light hover:text-dashboard-accent transition-colors duration-200 group"
              aria-label="Back to Guides"
            >
              <div className="p-2 rounded-lg bg-dashboard-bg hover:bg-dashboard-muted transition-colors duration-200 group-hover:scale-105">
                <BackIcon />
              </div>
              <span className="text-sm font-medium font-poppins hidden sm:inline">
                Back to Guides
              </span>
            </button>
          </div>

          {/* Guide Header Banner */}
          <div ref={guideHeaderRef} className="mb-8">
            <GuideHeader guide={guide} guideId={guideId!} onVisibilityChange={refetch} />
          </div>

          {/* Circular Tabs - Sticky when scrolled */}
          <div
            ref={mainTabsRef}
            className={`mb-8 z-40 bg-dashboard-bg border-b border-dashboard transition-all duration-200 ${isMainTabsSticky
              ? `fixed right-0 top-0`
              : 'relative'
              }`}
            style={isMainTabsSticky ? {
              left: window.innerWidth >= 768 ? sidebarWidth : '0px'
            } : undefined}
          >
            <div className={`${isMainTabsSticky ? 'container mx-auto px-0 sm:px-2 lg:px-8' : ''}`}>
              <CircularTabs
                tabs={[
                  { id: "journey", icon: <JourneyIcon />, label: "Journey" },
                  {
                    id: "transportation",
                    icon: <TransportationIcon />,
                    label: "Transport",
                  },
                  { id: "stay", icon: <StayIcon />, label: "Stay" },
                  { id: "budget", icon: <BudgetIcon />, label: "Budget" },
                  { id: "tips", icon: <TipsIcon />, label: "Tips" },
                ]}
                activeTab={activeTab}
                onTabChange={setActiveTab}
              />
            </div>
          </div>

          {/* Spacer to prevent layout shift when tabs become sticky */}
          {isMainTabsSticky && (
            <div className="h-[120px] sm:h-[140px] md:h-[160px] lg:h-[200px] xl:h-[220px]" />
          )}

          {/* Tab Content */}
          <div className="mb-8">
            <AnimatePresence mode="wait">
              {activeTab === "journey" && (
                <motion.div
                  key="journey"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                >
                  {renderJourneyTab()}
                </motion.div>
              )}
              {activeTab === "transportation" && (
                <motion.div
                  key="transportation"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                >
                  {renderTransportationTab()}
                </motion.div>
              )}
              {activeTab === "stay" && (
                <motion.div
                  key="stay"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                >
                  {renderStayTab()}
                </motion.div>
              )}
              {activeTab === "budget" && (
                <motion.div
                  key="budget"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                >
                  {renderBudgetTab()}
                </motion.div>
              )}
              {activeTab === "tips" && (
                <motion.div
                  key="tips"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="space-y-6">
                    <TipsTagsTab
                      guide={guide}
                      guideId={guideId!}
                      saveTips={saveTips}
                      onUpdate={refetch}
                    />
                    <TipsTimeline guide={guide} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Google Place Modal (for guide places) */}
      {selectedGooglePlace.visible && selectedGooglePlace.place && (
        <>
          <div className="fixed inset-0 bg-black md:bg-opacity-40 md:backdrop-blur-md z-[150]"></div>
          <div
            className={`fixed md:max-w-4xl md:mx-auto inset-x-0 bottom-0 top-12 z-[150] transition-transform duration-300 ease-in-out overflow-x-hidden ${selectedGooglePlace.visible ? "translate-y-0" : "translate-y-full"
              }`}
            style={{ height: "100%" }}
          >
            <GooglePlaceModal
              place={selectedGooglePlace.place}
              isOpen={selectedGooglePlace.visible}
              onClose={() => setSelectedGooglePlace({ visible: false, place: null })}
              sections={sections}
            />
          </div>
        </>
      )}

      {/* Delete Section Confirmation Modal */}
      <ConfirmationModal
        isOpen={!!sectionToDelete}
        onClose={() => setSectionToDelete(null)}
        onConfirm={confirmDeleteSection}
        title="Delete Section"
        message={
          sectionToDelete
            ? `Are you sure you want to delete the section "${sectionToDelete.title}"? This action cannot be undone.`
            : ""
        }
        confirmText="Delete"
        isDanger={true}
        isLoading={!!deletingSection}
      />
      {visibilityPrompt && (
        <CategoryVisibilityModal
          isOpen={visibilityPrompt.isOpen}
          onClose={() => setVisibilityPrompt(null)}
          categoryName={visibilityPrompt.categoryName}
          visibilityField={visibilityPrompt.visibilityField} origin={visibilityPrompt.origin}
          accountDocumentId={visibilityPrompt.origin?.accountDocumentId ?? ""}
          onSuccess={() => {
            // The canonical owner read is account-scoped, so reloading the guide is what
            // reflects a category visibility change here.
            refetch();
          }}
        />
      )}
      {listVisibilityPrompt && (
        <ListVisibilityModal
          isOpen={listVisibilityPrompt.isOpen}
          onClose={() => setListVisibilityPrompt(null)}
          listName={listVisibilityPrompt.listName}
          categoryName="Guides"
          onConfirm={async () => {
            try {
              const list = guideId ? content?.lists.get(guideId) : undefined;
              if (!list) throw new Error("Guide could not be loaded. Refresh and try again.");
              await setGuidePublished(list, true);
              refetch();
              toast.success(`"${listVisibilityPrompt.listName}" guide published!`);
            } catch (err: any) {
              toast.error(`Failed to publish: ${err.message}`);
            }
          }}
        />
      )}
    </GuideEditingProvider>
  );

};

export default GuideDetailsPage;
