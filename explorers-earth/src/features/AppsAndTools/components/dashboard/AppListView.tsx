import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams, useLocation, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Star, MoreVertical, Trash2, Loader2, Smartphone, Pencil, Copy, Check, Share2, Download
} from "lucide-react";
import { AddIcon } from "../../../../assets/icons/AddIcon";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import Accordion from "../../../../components/ui/Accordian";
import useAuthStore from "../../../../store/store";
import { useAppsCommands, useAppsCallerCustody } from "../../api/query";
import { useAppsOwner } from "../../hooks/useAppsOwner";
import { deduplicateApps, buildLogoUrl, extractNoteText, getPriceTierColor } from "../../utils/appHelpers";
import type { RecommendedApp, AppList } from "../../types";
import Switch from "../../../../components/ui/Switch";
import AppDetailModal from "../public/AppDetailModal";
import { ListVisibilityModal } from "../../../../components/ListVisibilityModal";

const VITE_BASE_URL = import.meta.env.VITE_BASE_URL || "https://explorers.earth";

interface AppRowProps {
  app: RecommendedApp;
  onPinToggle: (app: RecommendedApp) => void;
  onEdit: (app: RecommendedApp) => void;
  onDelete: (app: RecommendedApp) => void;
  onClick: (app: RecommendedApp) => void;
  isPinning: boolean;
}

const AppRow = ({ app, onPinToggle, onEdit, onDelete, onClick, isPinning }: AppRowProps) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const notePreview = extractNoteText(app.user_recommendation_note);
  const logoUrl = buildLogoUrl(app.logo_url);

  return (
    <div
      className="group flex items-center gap-3 p-3 bg-white/[0.03] border border-white/[0.05] hover:border-white/[0.08] hover:bg-white/[0.06] cursor-pointer rounded-xl transition-all mb-2"
      onClick={() => onClick(app)}
    >
      <div className="w-10 h-10 flex-shrink-0 rounded-xl overflow-hidden bg-white/5 shadow-sm">
        {logoUrl ? (
          <img src={logoUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full bg-violet-950/30 flex items-center justify-center">
            <Smartphone size={14} className="text-violet-600/40" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">{app.title}</p>
        <div className="flex items-center gap-2 text-xs text-white/40 mt-0.5 flex-wrap">
          {app.developer && <span className="truncate max-w-[150px]">{app.developer}</span>}
          {app.price_tier && (
            <>
              <span className="text-white/20">·</span>
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${getPriceTierColor(app.price_tier)}`}>
                {app.price_tier}
              </span>
            </>
          )}
          {app.user_rating && (
            <>
              <span className="text-white/20">·</span>
              <span className="flex items-center gap-0.5 text-amber-400/80">
                <Star size={10} fill="currentColor" /> {app.user_rating}
              </span>
            </>
          )}
        </div>
        {notePreview && (
          <p className="text-[11px] text-white/30 truncate mt-1 italic line-clamp-1">
            {notePreview.replace(/<[^>]+>/g, "")}
          </p>
        )}
      </div>

      {/* Pin button */}
      <button
        onClick={(e) => { e.stopPropagation(); onPinToggle(app); }}
        className={`p-1.5 rounded-lg transition-all ${
          app.is_pinned
            ? "text-amber-400 bg-amber-400/10"
            : "text-white/30 hover:text-amber-400 hover:bg-amber-400/10"
        } disabled:opacity-50`}
        disabled={isPinning}
        title={app.is_pinned ? "Unpin from Top Picks" : "Pin to Top Picks"}
      >
        <Star size={14} fill={app.is_pinned ? "currentColor" : "none"} />
      </button>

      {/* Three-dot menu */}
      <div className="relative" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => setMenuOpen((o) => !o)}
          className="p-1.5 rounded-lg text-white/20 hover:text-white hover:bg-white/5 transition-all"
        >
          <MoreVertical size={14} />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-full mt-1 bg-[#1a2332] border border-white/10 rounded-xl shadow-xl z-20 min-w-[130px] overflow-hidden">
            <button
              onClick={() => { setMenuOpen(false); onEdit(app); }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-dashboard hover:bg-white/8 transition-colors"
            >
              <Pencil size={13} /> Edit
            </button>
            <button
              onClick={() => { setMenuOpen(false); onDelete(app); }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 size={13} /> Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const AppListView = () => {
  const { listId } = useParams<{ listId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuthStore();

  const [activeTab, setActiveTab] = useState<"recommendations" | "manage">("recommendations");
  const [selectedApp, setSelectedApp] = useState<RecommendedApp | null>(null);
  const [pinningId, setPinningId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showDeleteListModal, setShowDeleteListModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isEditingList, setIsEditingList] = useState(false);
  const [listVisibilityPrompt, setListVisibilityPrompt] = useState<{
    isOpen: boolean;
    listName: string;
  } | null>(null);

  const { data, content, loading, refetch } = useAppsOwner(listId, Boolean(listId));
  const commands = useAppsCommands(), isUpdating = commands.loading, deletingList = commands.loading;
  const beginEffects = useAppsCallerCustody();
  const updateAppList = ({ variables }: { variables: { documentId?: string; Visibility?: boolean; List_Name?: string; list_description?: string | null }; optimisticResponse?: unknown; refetchQueries?: unknown[] }) => commands.updateList(variables.documentId!, { ...(variables.Visibility === undefined ? {} : { visibility: variables.Visibility ? 'public' : 'private', publicationState: variables.Visibility ? 'published' : 'draft' }), ...(variables.List_Name === undefined ? {} : { title: variables.List_Name }), ...(variables.list_description === undefined ? {} : { description: variables.list_description }) });
  const deleteAppList = ({ variables }: { variables: { documentId: string } }) => commands.archiveList(variables.documentId);
  const togglePin = ({ variables }: { variables: { documentId: string; is_pinned: boolean; pin_order: number | null }; refetchQueries?: unknown[] }) => commands.pin(variables.documentId, listId!, variables.is_pinned);
  const deleteApp = ({ variables }: { variables: { documentId: string }; refetchQueries?: unknown[] }) => commands.membership(variables.documentId, listId!, false);

  const listData: AppList | null = data?.appLists?.[0] ?? null;
  const apps = deduplicateApps(listData?.recommended_apps ?? []);
  const pinnedCount = apps.filter((a) => a.is_pinned).length;

  // One-shot guard against the BUG-3 re-render loop (see MovieListView for detail).
  const promptShownRef = useRef(false);

  useEffect(() => {
    if (promptShownRef.current) return;
    const wants =
      location.state?.justAddedRecommendation || location.state?.justCreatedList;
    if (!wants || !listData) return;
    // Never prompt to publish an empty list; wait until the first item is added.
    // Do NOT set promptShownRef here, so a later render can still open the prompt.
    if (apps.length < 1) return;
    promptShownRef.current = true;
    if (!listData.Visibility) {
      setListVisibilityPrompt({ isOpen: true, listName: listData.List_Name });
    }
    navigate(location.pathname, { replace: true, state: {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, location.pathname, listData?.documentId, apps.length, navigate]);

  const publicUrl = listData
    ? `${VITE_BASE_URL}/${user?.username}/apps/${listData.slug}`
    : "";

  const handleCopy = async () => {
    await navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleToggleVisibility = async () => {
    if (!listData) return;
    if (!listData.Visibility && apps.length === 0) {
      toast.error("Add at least one app before publishing.");
      return;
    }
    const current = beginEffects();
    try {
      await updateAppList({
        variables: { documentId: listData.documentId, Visibility: !listData.Visibility },
        optimisticResponse: {
          updateAppList: {
            __typename: "AppList",
            documentId: listData.documentId,
            List_Name: listData.List_Name,
            list_description: listData.list_description,
            slug: listData.slug,
            Visibility: !listData.Visibility,
            display_order: listData.display_order,
            top_apps_heading: listData.top_apps_heading || null,
          }
        },
      });
      if (!current()) return;
      toast.success(listData.Visibility ? "List set to draft." : "List published!");
    } catch {
      if (current()) toast.error("Failed to update visibility.");
    }
  };

  const handlePinToggle = async (app: RecommendedApp) => {
    if (!app.is_pinned && pinnedCount >= 15) {
      toast.error("Max 15 pinned apps allowed.");
      return;
    }
    const current = beginEffects();
    setPinningId(app.documentId);
    const pinnedApps = apps.filter((a) => a.is_pinned && a.documentId !== app.documentId);
    const newPinOrder = app.is_pinned ? null : pinnedApps.length;
    try {
      await togglePin({
        variables: { documentId: app.documentId, is_pinned: !app.is_pinned, pin_order: newPinOrder },
      });
    } catch {
      if (current()) toast.error("Failed to update pin.");
    } finally {
      if (current()) setPinningId(null);
    }
  };

  const handleDelete = async (app: RecommendedApp) => {
    if (!window.confirm(`Delete "${app.title}"?`)) return;
    const current = beginEffects();
    setDeletingId(app.documentId);
    try {
      await deleteApp({
        variables: { documentId: app.documentId },
      });
      if (!current()) return;
      toast.success("App removed.");
    } catch {
      if (current()) toast.error("Failed to delete app.");
    } finally {
      if (current()) setDeletingId(null);
    }
  };

  const handleRecommendationPublication = async (app: RecommendedApp, published: boolean) => {
    const current = beginEffects();
    try {
      await commands.publishRecommendation(app.documentId, published);
      if (!current()) return;
      toast.success(published ? 'App published.' : 'App kept as draft.');
    } catch {
      if (!current()) return;
      toast.error('App publication could not be saved. Please retry.');
    }
  };

  const handleDeleteList = async () => {
    if (!listData) return;
    const current = beginEffects();
    try {
      await deleteAppList({ variables: { documentId: listData.documentId } });
      if (!current()) return;
      toast.success("List deleted.");
      navigate("/recommendations/apps");
    } catch {
      if (current()) toast.error("Failed to delete list.");
    }
  };

  if (loading && !listData) {
    return (
      <div className="p-6 space-y-4 max-w-3xl mx-auto">
        <div className="h-6 w-40 bg-white/5 animate-pulse rounded" />
        <div className="h-4 w-24 bg-white/5 animate-pulse rounded" />
        {[1,2,3,4,5].map(i => (
          <div key={i} className="h-14 bg-white/5 animate-pulse rounded-lg" />
        ))}
      </div>
    );
  }

  if (!listData) {
    return (
      <div className="p-6">
        <p className="text-red-400">List not found. <Link to="/recommendations/apps" className="text-blue-400 underline">Go back</Link></p>
      </div>
    );
  }

  return (
    <div className="px-4 pt-8 pb-24 md:p-6 md:pb-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex flex-col items-start">
          <button
            onClick={() => navigate("/recommendations/apps")}
            className="text-[10px] text-white/50 hover:text-white mb-1 transition-colors flex items-center gap-1 font-semibold uppercase tracking-wider"
          >
            <ArrowLeft size={10} />
            <span>Back</span>
          </button>
          <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight leading-tight">{listData.List_Name}</h1>
        </div>
        <Switch
          checked={listData.Visibility}
          onChange={handleToggleVisibility}
          loading={isUpdating}
          label={listData.Visibility ? "Published" : "Draft"}
        />
      </div>

      {/* Tabs */}
      <div className="flex mb-6 bg-white rounded-full p-[2px] w-fit mx-auto shadow-sm">
        {(["recommendations", "manage"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 text-[11px] md:text-xs font-semibold rounded-full capitalize transition-all duration-200 ${
              activeTab === tab
                ? "bg-dashboard-accent text-white shadow"
                : "text-[#0f172a] bg-transparent hover:opacity-80"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab: Recommendations */}
      {activeTab === "recommendations" && (
        <div>
          <button
            onClick={() => navigate(`/recommendations/apps/${listId}/add`)}
            className="w-full mb-6 flex items-center justify-center gap-3 py-4 bg-dashboard-accent hover:opacity-90 text-white rounded-2xl text-sm font-bold transition-all shadow-lg shadow-blue-900/40 border border-white/10"
          >
            <AddIcon size="5" /> Add App
          </button>

          {apps.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <Smartphone size={40} className="text-white/15 mb-3" />
              <p className="text-dashboard-light text-sm">No apps added yet.</p>
              <p className="text-xs text-white/25 mt-1">Add your first recommendation to this list.</p>
            </div>
          ) : (
            <div className="space-y-0">
              <AnimatePresence>
                {apps.map((app) => (
                  <motion.div
                    key={app.documentId}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: deletingId === app.documentId ? 0.4 : 1, y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                  >
                    <AppRow
                      app={app}
                      onClick={setSelectedApp}
                      onPinToggle={handlePinToggle}
                      onEdit={(a) => navigate(`/recommendations/apps/${listId}/edit/${a.documentId}`)}
                      onDelete={handleDelete}
                      isPinning={pinningId === app.documentId}
                    />
                    {/* A published list serves only published recommendations, so the row
                        carries its own publication state rather than inheriting the list's. */}
                    <div className="flex items-center justify-between gap-3 pb-3 text-xs text-dashboard-muted">
                      <span>Recommendation is {content?.details.get(app.documentId)?.detail.publicationState === 'published' ? 'Published' : 'Draft'}</span>
                      <button
                        disabled={commands.loading || !content?.details.has(app.documentId)}
                        onClick={() => handleRecommendationPublication(app, content?.details.get(app.documentId)?.detail.publicationState !== 'published')}
                        className="text-dashboard-accent"
                      >
                        {content?.details.get(app.documentId)?.detail.publicationState === 'published' ? `Keep ${app.title} as draft` : `Publish ${app.title}`}
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      )}

      {/* Tab: Manage */}
      {activeTab === "manage" && (
        <div className="mb-0 md:mt-2 md:w-[90%] md:mx-auto">
          <div className="bg-transparent rounded-lg p-6 space-y-4 border border-white/10">
            <Accordion heading="Manage" defaultOpen={true}>
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => setShowDeleteListModal(true)}
                  className="flex flex-row text-center gap-2 items-center rounded-md font-poppins w-full text-sm border border-white px-4 py-3 hover:border-gray-500 text-white hover:text-gray-500 justify-center font-medium transition-all duration-300"
                >
                  <Trash2 size={16} />
                  <span>Delete</span>
                </button>

                {isEditingList ? (
                  <div className="bg-dashboard-sidebar border border-white/10 rounded-lg p-5 space-y-4 mt-2 mb-2 text-left">
                    <div>
                      <label className="text-xs text-white/50 mb-1.5 block uppercase tracking-wider">List Name</label>
                      <input
                        defaultValue={listData?.List_Name}
                        onBlur={async (e) => {
                          if (e.target.value && e.target.value !== listData?.List_Name) {
                            await updateAppList({ variables: { documentId: listData?.documentId, List_Name: e.target.value } });
                            toast.success("List name updated.");
                          }
                        }}
                        className="w-full bg-dashboard-muted border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-white/30 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-white/50 mb-1.5 block uppercase tracking-wider">Description</label>
                      <textarea
                        defaultValue={listData?.list_description ?? ""}
                        rows={3}
                        onBlur={async (e) => {
                          if (e.target.value !== (listData?.list_description ?? "")) {
                            await updateAppList({ variables: { documentId: listData?.documentId, list_description: e.target.value } });
                            toast.success("Description updated.");
                          }
                        }}
                        className="w-full bg-dashboard-muted border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white resize-none focus:outline-none focus:border-white/30 transition-colors"
                      />
                    </div>
                    <button onClick={() => setIsEditingList(false)} className="w-full py-2 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-lg flex justify-center text-sm mt-3 transition-colors">Done Editing</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setIsEditingList(true)}
                    className="flex flex-row text-center gap-2 items-center rounded-md font-poppins w-full text-sm border border-white px-4 py-3 hover:border-gray-500 text-white hover:text-gray-500 justify-center font-medium transition-all duration-300"
                  >
                    <Pencil size={16} />
                    <span>Edit</span>
                  </button>
                )}

                <div className={`p-4 rounded-xl border transition-all mt-2 ${listData?.Visibility ? "border-green-500/30 bg-green-500/5" : "border-white/10"} flex justify-center items-center`}>
                  <Switch
                    checked={listData?.Visibility ?? false}
                    onChange={handleToggleVisibility}
                    loading={isUpdating}
                    label={listData?.Visibility ? "Published (Visible to public)" : "Draft (Private)"}
                  />
                </div>
              </div>
            </Accordion>

            <Accordion heading="My QR" defaultOpen={true}>
              <div className={`relative pb-2 ${!listData?.Visibility ? "blur-sm pointer-events-none" : ""}`}>
                {!listData?.Visibility && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-auto">
                    <span className="bg-dashboard-muted px-4 py-2 rounded-lg text-sm text-white/90 shadow-2xl border border-white/20 backdrop-blur-md">Publish list to share QR</span>
                  </div>
                )}

                <div className="flex justify-center items-center my-6">
                  <div className="flex relative flex-col justify-between items-center h-[16rem] w-[14rem] p-6 bg-black border border-white text-white rounded-lg">
                    <div className="absolute bottom-0 left-0 w-full h-1/2 rounded-b-lg bg-gradient-to-t from-blue-900/40 to-transparent pointer-events-none" />
                    <p className="text-sm tracking-wide font-medium z-10 text-center leading-snug">My Recommendations</p>
                    <div className="z-10 items-center flex flex-col pt-1">
                      <div className="p-2 bg-white rounded-lg shadow-md mb-3">
                        <QRCodeSVG value={publicUrl} size={90} />
                      </div>
                      <p className="bg-gray-200 text-black px-4 py-1.5 font-poppins rounded-full text-[11px] font-semibold whitespace-nowrap">
                        Travel like a local
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-8 mt-5 mb-1 pt-4 border-t border-white/5">
                  <div className="flex flex-col items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => {
                    if (navigator.share) {
                      navigator.share({ title: listData?.List_Name, url: publicUrl });
                    } else {
                      handleCopy();
                    }
                  }}>
                    <button className="p-0 bg-transparent rounded-full flex items-center justify-center">
                      <Share2 size={22} className="text-white" strokeWidth={1.5} />
                    </button>
                    <span className="font-poppins text-white text-xs">Share Link</span>
                  </div>
                  <div className="flex flex-col items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity" onClick={handleCopy}>
                    <button className="p-0 bg-transparent rounded-full flex items-center justify-center">
                      {copied ? <Check size={22} className="text-white" strokeWidth={1.5} /> : <Copy size={22} className="text-white" strokeWidth={1.5} />}
                    </button>
                    <span className="font-poppins text-white text-xs whitespace-nowrap">{copied ? "Copied" : "Copy Link"}</span>
                  </div>
                  <div className="flex flex-col items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => {
                     const svg = document.querySelector('svg');
                     if (svg) {
                       const svgData = new XMLSerializer().serializeToString(svg);
                       const canvas = document.createElement("canvas");
                       const ctx = canvas.getContext("2d");
                       const img = new Image();
                       img.onload = () => {
                         canvas.width = img.width;
                         canvas.height = img.height;
                         ctx?.drawImage(img, 0, 0);
                         const pngFile = canvas.toDataURL("image/png");
                         const a = document.createElement("a");
                         a.download = `QR_${listData?.List_Name || "List"}.png`;
                         a.href = pngFile;
                         a.click();
                       };
                       img.src = "data:image/svg+xml;base64," + btoa(svgData);
                     }
                  }}>
                    <button className="p-0 bg-transparent rounded-full flex items-center justify-center">
                      <Download size={22} className="text-white" strokeWidth={1.5} />
                    </button>
                    <span className="font-poppins text-white text-xs">Download QR</span>
                  </div>
                </div>
              </div>
            </Accordion>
          </div>
        </div>
      )}

      {/* Delete List Modal */}
      {showDeleteListModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-dashboard-card rounded-2xl border border-dashboard-border p-6 w-full max-w-sm">
            <h3 className="text-lg font-semibold text-dashboard mb-2">Delete List?</h3>
            <p className="text-sm text-dashboard-muted mb-5">
              This will permanently delete "{listData?.List_Name}" and all its apps. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteListModal(false)} className="flex-1 py-2.5 rounded-lg border border-dashboard-border text-sm text-dashboard-muted hover:text-dashboard transition-colors">
                Cancel
              </button>
              <button
                onClick={handleDeleteList}
                disabled={deletingList}
                className="flex-1 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-sm text-white font-medium flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {deletingList ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedApp && (
        <AppDetailModal
          open={!!selectedApp}
          app={selectedApp}
          onClose={() => setSelectedApp(null)}
        />
      )}

      {listData && listVisibilityPrompt && (
        <ListVisibilityModal
          isOpen={listVisibilityPrompt.isOpen}
          onClose={() => setListVisibilityPrompt(null)}
          listName={listVisibilityPrompt.listName}
          categoryName="Apps & Tools"
          onConfirm={async () => {
            try {
              await updateAppList({
                variables: { documentId: listData.documentId, Visibility: true },
              });
              refetch();
              toast.success(`"${listData.List_Name}" published!`);
            } catch {
              toast.error("Failed to update visibility.");
            }
          }}
          loading={isUpdating}
        />
      )}
    </div>
  );
};

export default AppListView;
