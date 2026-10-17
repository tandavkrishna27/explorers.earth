import { usePublicCategoryThemeStyles } from "../../../PublicHome/components/PublicCategoryThemeContext";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Star, Share2, ExternalLink, ChevronLeft, ChevronRight } from "lucide-react";
import type { RecommendedApp } from "../../types";
import { buildLogoUrl, extractNoteText, getPriceTierColor, getPlatformColor } from "../../utils/appHelpers";
import MediaViewer from "../../../../components/ui/MediaViewer";
import { useMediaViewer, convertToMediaItems } from "../../../../hooks/useMediaViewer";

interface AppDetailModalProps {
  app: RecommendedApp | null;
  open: boolean;
  onClose: () => void;
}

const FALLBACK_LOGO = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'><rect width='100' height='100' fill='%23171e2e'/></svg>`;

const AppDetailModal = ({ app, open, onClose }: AppDetailModalProps) => {
  const categoryStyles = usePublicCategoryThemeStyles();
  const { isOpen: isMediaOpen, currentIndex, openViewer, closeViewer } = useMediaViewer();
  const [_screenshotIdx, _setScreenshotIdx] = useState(0);
  const [dragStartY, setDragStartY] = useState<number | null>(null);
  const snapshotsScrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const scrollSnapshots = (dir: "left" | "right") => {
    if (snapshotsScrollRef.current) {
      const amount = dir === "left" ? -300 : 300;
      snapshotsScrollRef.current.scrollBy({ left: amount, behavior: "smooth" });
    }
  };

  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "unset";
    return () => { document.body.style.overflow = "unset"; };
  }, [open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const handleTouchStart = (e: React.TouchEvent) => {
    setDragStartY(e.touches[0].clientY);
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (dragStartY === null) return;
    const delta = e.changedTouches[0].clientY - dragStartY;
    if (delta > 100) onClose();
    setDragStartY(null);
  };

  const handleShare = useCallback(async () => {
    const url = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title: app?.title, url }); } catch { /* ignore */ }
    } else {
      await navigator.clipboard.writeText(url);
    }
  }, [app?.title]);

  const lightboxMediaItems = useMemo(() => {
    if (!app) return [];
    const logoUrl = buildLogoUrl(app.logo_url);
    const screenshots = app.screenshots || [];

    const items: any[] = [];
    if (logoUrl && logoUrl !== FALLBACK_LOGO) {
      items.push({
        id: "logo",
        url: logoUrl,
        alt: app.title,
      });
    }
    if (screenshots && screenshots.length > 0) {
      screenshots.forEach((url: string, index: number) => {
        items.push({
          id: `screenshot-${index}`,
          url,
          alt: `Screenshot ${index + 1}`,
        });
      });
    }
    return convertToMediaItems(items);
  }, [app]);

  if (!app) return null;

  const logoUrl = buildLogoUrl(app.logo_url);
  const screenshots = app.screenshots || [];
  // Use the first screenshot as the backdrop background, or fall back to a nice tech design background
  const backdropUrl = screenshots.length > 0 ? screenshots[0] : logoUrl;
  const noteText = extractNoteText(app.user_recommendation_note);
  const platforms = app.platforms || [];

  const handleImageClick = (type: 'logo' | 'screenshot', index: number = 0) => {
    let targetIndex = 0;
    const hasLogo = logoUrl && logoUrl !== FALLBACK_LOGO;
    if (type === 'logo') {
      targetIndex = 0;
    } else if (type === 'screenshot') {
      targetIndex = (hasLogo ? 1 : 0) + index;
    }
    openViewer(targetIndex);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[150]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Modal panel wrapper */}
          <div className="fixed inset-0 pt-[88px] md:pt-8 flex items-end justify-center z-[150] pointer-events-none">
            <motion.div
              data-category-detail-panel
              style={categoryStyles ?? undefined}
              className="relative bg-[var(--category-panel,#0d1117)] rounded-t-2xl w-full h-full md:max-w-3xl overflow-y-auto overflow-x-hidden flex flex-col shadow-2xl ring-1 ring-[color:var(--category-border,rgba(255,255,255,0.1))] hide-scrollbar scrollbar-hide [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] pointer-events-auto"
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Backdrop hero */}
              <div className="relative h-48 md:h-56 flex-shrink-0 overflow-hidden">
                {backdropUrl ? (
                  <img src={backdropUrl} alt="" className="w-full h-full object-cover filter brightness-75" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-[#1a2332] to-[var(--category-panel,#0d1117)]" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-[var(--category-panel,#0d1117)] via-[#0d1117]/40 to-transparent" />

                {/* Drag handle (mobile) */}
                <div className="absolute top-3 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full bg-[var(--category-card,rgba(255,255,255,0.3))] md:hidden" />

                {/* Close button */}
                <button
                  aria-label="Close"
                  onClick={onClose}
                  className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center text-white/80 hover:text-white transition-all"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Content area */}
              <div ref={contentRef} className="flex-1 pb-24 md:pb-6 w-full">
                <div className="flex gap-4 px-5 -mt-16 relative z-10">
                  {/* Logo */}
                  <div 
                    onClick={() => handleImageClick("logo")}
                    className="flex-shrink-0 w-28 h-28 rounded-2xl overflow-hidden ring-2 ring-[color:var(--category-border,rgba(255,255,255,0.1))] shadow-2xl bg-[var(--category-card,#1a2332)] cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
                  >
                    <img
                      src={logoUrl || FALLBACK_LOGO}
                      alt={app.title}
                      className="w-full h-full object-cover"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).src = FALLBACK_LOGO; }}
                    />
                  </div>

                  {/* Title */}
                  <div className="flex-1 pt-16 min-w-0">
                    <h2 className="text-xl font-bold text-[color:var(--category-text,#fff)] mt-1 leading-tight">{app.title}</h2>
                    {app.developer && (
                      <p className="text-sm text-[color:var(--category-muted,rgba(255,255,255,0.4))] mt-0.5">{app.developer}</p>
                    )}
                  </div>
                </div>

                <div className="px-5 mt-4 space-y-5 pb-6">
                  {/* Metadata pills */}
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    {app.price_tier && (
                      <span style={categoryStyles ? { color: categoryStyles["--category-text"] } : undefined} className={`text-xs font-semibold px-2.5 py-1 rounded-md uppercase tracking-wider ${getPriceTierColor(app.price_tier)}`}>
                        {app.price_tier}
                      </span>
                    )}
                    {app.user_rating && (
                      <span className="flex items-center gap-1 text-[color:var(--category-text,#facc15)] font-semibold">
                        <Star size={13} fill="currentColor" className="text-[color:var(--category-rating,#facc15)]" /> {app.user_rating}/10
                      </span>
                    )}
                  </div>

                  {/* Platforms */}
                  {platforms.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {platforms.map((p) => (
                        <span key={p} style={categoryStyles ? { color: categoryStyles["--category-text"] } : undefined} className={`text-xs px-2.5 py-1 rounded-md font-medium border border-[color:var(--category-border,rgba(255,255,255,0.1))] ${getPlatformColor(p)}`}>
                          {p}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Overview */}
                  {app.description && (
                    <p className="text-sm text-[color:var(--category-muted,rgba(255,255,255,0.6))] leading-relaxed">{app.description}</p>
                  )}

                  {/* Creator note */}
                  {noteText && (
                    <div className="bg-violet-500/10 border border-violet-500/20 rounded-xl p-4">
                      <p className="text-xs font-semibold text-[color:var(--category-text,#a78bfa)] mb-1.5 uppercase tracking-wider">Creator's Note</p>
                      <p className="text-sm text-[color:var(--category-text,rgba(255,255,255,0.8))] leading-relaxed italic">"{noteText}"</p>
                    </div>
                  )}

                  {/* Creator Rating */}
                  {app.user_rating && (
                    <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 flex items-center justify-between">
                      <p className="text-xs font-semibold text-[color:var(--category-text,#eab308)] uppercase tracking-wider">Creator's Rating</p>
                      <div className="flex gap-1 flex-wrap justify-end">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(star => (
                          <Star 
                            key={star} 
                            size={16} 
                            fill={app.user_rating! >= star ? "currentColor" : "none"} 
                            className={app.user_rating! >= star ? "text-[color:var(--category-rating,#facc15)]" : "text-[color:var(--category-muted,rgba(255,255,255,0.2))]"}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Screenshots gallery row (Movie Snapshot style) */}
                  {screenshots.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-[color:var(--category-muted,rgba(255,255,255,0.5))] uppercase tracking-wider mb-3">
                        Screenshots & Media
                      </p>
                      <div className="relative group">
                        <button
                          onClick={() => scrollSnapshots("left")}
                          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-black/60 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 hover:bg-black/80 transition-all -ml-2 backdrop-blur-sm"
                        >
                          <ChevronLeft size={16} />
                        </button>
                        <div ref={snapshotsScrollRef} className="flex overflow-x-auto pb-4 -mx-5 px-5 gap-3 hide-scrollbar scrollbar-hide [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                          {screenshots.map((url, i) => (
                            <div 
                              key={i} 
                              onClick={() => handleImageClick("screenshot", i)}
                              className="flex-shrink-0 w-56 aspect-video rounded-xl overflow-hidden border border-[color:var(--category-border,rgba(255,255,255,0.1))] bg-[var(--category-card,#1a2332)] cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
                            >
                              <img 
                                src={url} 
                                className="w-full h-full object-cover" 
                                alt={`Screenshot ${i + 1}`} 
                              />
                            </div>
                          ))}
                        </div>
                        <button
                          onClick={() => scrollSnapshots("right")}
                          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-black/60 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 hover:bg-black/80 transition-all -mr-2 backdrop-blur-sm"
                        >
                          <ChevronRight size={16} />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Source list */}
                  {app.app_list && (
                    <p className="text-xs text-[color:var(--category-muted,rgba(255,255,255,0.3))]">
                      From the list: <span className="text-[color:var(--category-text,#a78bfa)]">{app.app_list.List_Name}</span>
                    </p>
                  )}
                </div>
              </div>

              {/* Footer actions matching Movie modal exactly */}
              <div className="flex-shrink-0 border-t border-[color:var(--category-border,rgba(255,255,255,0.08))] px-5 py-4 flex items-center justify-between gap-3 bg-[var(--category-panel,#0d1117)]">
                <button
                  onClick={handleShare}
                  className="flex items-center gap-1.5 text-sm text-[color:var(--category-muted,rgba(255,255,255,0.6))] hover:text-[color:var(--category-text,#fff)] px-3 py-1.5 rounded-lg hover:bg-[var(--category-hover,rgba(255,255,255,0.08))] transition-all"
                >
                  <Share2 size={14} /> Share
                </button>
                <div className="flex gap-2">
                  {app.download_url && (
                    <a
                      href={app.download_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--category-accent,#7c3aed)] hover:bg-[var(--category-accent,#6d28d9)] text-sm text-[color:var(--category-accent-ink,#fff)] font-medium transition-colors"
                    >
                      <ExternalLink size={14} /> Get App
                    </a>
                  )}
                  {app.app_url && (
                    <a
                      href={app.app_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--category-card,rgba(255,255,255,0.05))] hover:bg-[var(--category-hover,rgba(255,255,255,0.1))] text-sm text-[color:var(--category-text,#fff)] font-medium transition-colors border border-[color:var(--category-border,rgba(255,255,255,0.1))]"
                    >
                      <ExternalLink size={14} /> Website
                    </a>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
          <MediaViewer
            mediaItems={lightboxMediaItems}
            initialIndex={currentIndex}
            isOpen={isMediaOpen}
            onClose={closeViewer}
          />
        </>
      )}
    </AnimatePresence>
  );
};

export default AppDetailModal;
