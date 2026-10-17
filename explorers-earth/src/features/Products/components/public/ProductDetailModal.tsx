import { usePublicCategoryThemeStyles } from "../../../PublicHome/components/PublicCategoryThemeContext";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Star, Share2, ExternalLink, ChevronLeft, ChevronRight } from "lucide-react";
import type { RecommendedProduct } from "../../types";
import { buildImageUrl, extractNoteText, formatPrice } from "../../utils/productHelpers";
import MediaViewer from "../../../../components/ui/MediaViewer";
import { useMediaViewer, convertToMediaItems } from "../../../../hooks/useMediaViewer";

interface ProductDetailModalProps {
  product: RecommendedProduct | null;
  open: boolean;
  onClose: () => void;
}

const FALLBACK_IMAGE = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300' viewBox='0 0 300 300'><rect width='300' height='300' fill='%23171e2e'/></svg>`;

const ProductDetailModal = ({ product, open, onClose }: ProductDetailModalProps) => {
  const categoryStyles = usePublicCategoryThemeStyles();
  const { isOpen: isMediaOpen, currentIndex, openViewer, closeViewer } = useMediaViewer();
  const [imgIdx, setImgIdx] = useState(0);
  const [dragStartY, setDragStartY] = useState<number | null>(null);
  const galleryScrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const scrollGallery = (dir: "left" | "right") => {
    if (galleryScrollRef.current) {
      const amount = dir === "left" ? -300 : 300;
      galleryScrollRef.current.scrollBy({ left: amount, behavior: "smooth" });
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
      try { await navigator.share({ title: product?.title, url }); } catch { /* ignore */ }
    } else {
      await navigator.clipboard.writeText(url);
    }
  }, [product?.title]);

  const lightboxMediaItems = useMemo(() => {
    if (!product) return [];
    const mainImg = buildImageUrl(product.logo_url);
    const gallery = (product.images || []).map(buildImageUrl).filter(Boolean);
    const allImages = mainImg ? [mainImg, ...gallery.filter((i) => i !== mainImg)] : gallery;

    return convertToMediaItems(
      allImages.map((url, index) => ({
        id: `img-${index}`,
        url,
        alt: `${product.title} - Image ${index + 1}`,
      }))
    );
  }, [product]);

  if (!product) return null;

  const mainImg = buildImageUrl(product.logo_url);
  const gallery = (product.images || []).map(buildImageUrl).filter(Boolean);
  const allImages = mainImg ? [mainImg, ...gallery.filter((i) => i !== mainImg)] : gallery;
  const noteText = extractNoteText(product.user_recommendation_note);
  const specs = product.specifications || {};
  const hasSpecs = Object.keys(specs).length > 0;
  const priceStr = formatPrice(product.price, product.currency);
  
  // Use the first gallery image as backdrop, or main image, or fallback workspace photo
  const backdropUrl = allImages.length > 0 ? allImages[imgIdx] : "https://images.unsplash.com/photo-1505740420928-5e560c06d30e";

  const handleImageClick = (index: number) => {
    openViewer(index);
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
                  onClick={onClose}
                  className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center text-white/80 hover:text-white transition-all"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Content area */}
              <div ref={contentRef} className="flex-1 pb-24 md:pb-6 w-full">
                <div className="flex gap-4 px-5 -mt-16 relative z-10">
                  {/* Primary product image container */}
                  <div 
                    onClick={() => handleImageClick(0)}
                    className="flex-shrink-0 w-28 h-28 rounded-2xl overflow-hidden ring-2 ring-[color:var(--category-border,rgba(255,255,255,0.1))] shadow-2xl bg-[var(--category-card,#1a2332)] cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
                  >
                    <img
                      src={mainImg || FALLBACK_IMAGE}
                      alt={product.title}
                      className="w-full h-full object-cover"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).src = FALLBACK_IMAGE; }}
                    />
                  </div>

                  {/* Title and Brand */}
                  <div className="flex-1 pt-16 min-w-0">
                    <h2 className="text-xl font-bold text-[color:var(--category-text,#fff)] mt-1 leading-tight">{product.title}</h2>
                    {product.brand && (
                      <p className="text-sm text-[color:var(--category-muted,rgba(255,255,255,0.4))] mt-0.5">{product.brand}</p>
                    )}
                  </div>
                </div>

                <div className="px-5 mt-4 space-y-5 pb-6">
                  {/* Metadata pills */}
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    {priceStr && (
                      <span className="text-[color:var(--category-text,#34d399)] font-bold text-base mr-2">{priceStr}</span>
                    )}
                    {product.user_rating && (
                      <span className="flex items-center gap-1 text-[color:var(--category-text,#facc15)] font-semibold">
                        <Star size={13} fill="currentColor" className="text-[color:var(--category-rating,#facc15)]" /> {product.user_rating}/10
                      </span>
                    )}
                  </div>

                  {/* Overview */}
                  {product.description && (
                    <p className="text-sm text-[color:var(--category-muted,rgba(255,255,255,0.6))] leading-relaxed">{product.description}</p>
                  )}

                  {/* Creator note */}
                  {noteText && (
                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
                      <p className="text-xs font-semibold text-[color:var(--category-text,#34d399)] mb-1.5 uppercase tracking-wider">Creator's Note</p>
                      <p className="text-sm text-[color:var(--category-text,rgba(255,255,255,0.8))] leading-relaxed italic">"{noteText}"</p>
                    </div>
                  )}

                  {/* Creator Rating */}
                  {product.user_rating && (
                    <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 flex items-center justify-between">
                      <p className="text-xs font-semibold text-[color:var(--category-text,#eab308)] uppercase tracking-wider">Creator's Rating</p>
                      <div className="flex gap-1 flex-wrap justify-end">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(star => (
                          <Star 
                            key={star} 
                            size={16} 
                            fill={product.user_rating! >= star ? "currentColor" : "none"} 
                            className={product.user_rating! >= star ? "text-[color:var(--category-rating,#facc15)]" : "text-[color:var(--category-muted,rgba(255,255,255,0.2))]"}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Specs */}
                  {hasSpecs && (
                    <div>
                      <p className="text-xs font-semibold text-[color:var(--category-muted,rgba(255,255,255,0.5))] uppercase tracking-wider mb-2">Specifications</p>
                      <div className="rounded-xl border border-[color:var(--category-border,rgba(255,255,255,0.1))] overflow-hidden bg-[var(--category-card,rgba(22,30,46,0.3))]">
                        {Object.entries(specs).map(([key, val], i) => (
                          <div key={key} className={`flex items-center px-4 py-2.5 text-xs ${i % 2 === 0 ? "bg-[var(--category-card,rgba(255,255,255,0.02))]" : ""}`}>
                            <span className="text-[color:var(--category-muted,rgba(255,255,255,0.4))] w-1/3 font-medium">{key}</span>
                            <span className="text-[color:var(--category-text,rgba(255,255,255,0.8))] flex-1">{val}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Product Images Gallery Row (Movie style snapshots) */}
                  {allImages.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-[color:var(--category-muted,rgba(255,255,255,0.5))] uppercase tracking-wider mb-3">
                        Product Gallery
                      </p>
                      <div className="relative group">
                        <button
                          onClick={() => scrollGallery("left")}
                          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-black/60 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 hover:bg-black/80 transition-all -ml-2 backdrop-blur-sm"
                        >
                          <ChevronLeft size={16} />
                        </button>
                        <div ref={galleryScrollRef} className="flex overflow-x-auto pb-4 -mx-5 px-5 gap-3 hide-scrollbar scrollbar-hide [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                          {allImages.map((url, i) => (
                            <button
                              key={i}
                              onClick={() => {
                                setImgIdx(i);
                                handleImageClick(i);
                              }}
                              className={`flex-shrink-0 w-56 aspect-square rounded-xl overflow-hidden border transition-all ${i === imgIdx ? 'border-[color:var(--category-focus,#34d399)] scale-[1.01]' : 'border-[color:var(--category-border,rgba(255,255,255,0.1))] opacity-70 hover:opacity-100'} bg-[var(--category-card,#1a2332)] hover:scale-[1.01] active:scale-[0.99] duration-200`}
                            >
                              <img 
                                src={url} 
                                className="w-full h-full object-cover" 
                                alt={`Gallery ${i + 1}`} 
                              />
                            </button>
                          ))}
                        </div>
                        <button
                          onClick={() => scrollGallery("right")}
                          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-black/60 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 hover:bg-black/80 transition-all -mr-2 backdrop-blur-sm"
                        >
                          <ChevronRight size={16} />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Source list */}
                  {product.product_list && (
                    <p className="text-xs text-[color:var(--category-muted,rgba(255,255,255,0.3))]">
                      From the list: <span className="text-[color:var(--category-text,#34d399)]">{product.product_list.List_Name}</span>
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
                  {(product.buy_url || product.product_url) && (
                    <a
                      href={product.buy_url || product.product_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--category-accent,#059669)] hover:bg-[var(--category-accent,#047857)] text-sm text-[color:var(--category-accent-ink,#fff)] font-medium transition-colors"
                    >
                      <ExternalLink size={14} /> {product.buy_url ? "Buy Now" : "View Product"}
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

export default ProductDetailModal;
