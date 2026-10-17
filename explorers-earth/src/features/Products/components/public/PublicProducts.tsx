import { useState, useMemo, useCallback, useEffect } from "react";
import { useParams, useNavigate, useOutletContext, useLocation } from "react-router-dom";
import { ShoppingBag } from "lucide-react";
import { deduplicateProducts } from "../../utils/productHelpers";
import type { RecommendedProduct, ProductList } from "../../types";
import ProductCarouselRow from "./ProductCarouselRow";
import ProductDetailModal from "./ProductDetailModal";
import SEO from "../../../../components/SEO";
import { createCanonicalUrl } from "../../../../utils/getCurrentDomain";
import ProductTopPicksHero from "./ProductTopPicksHero";
import ProductTopPicksMobileHero from "./ProductTopPicksMobileHero";
import HeroSkeleton from "../../../../components/ui/HeroSkeleton";
import { createAnalyticsOptions, useTrackAnalytics } from "../../../../services/analyticsService";
import { usePublicHeaderDescriptor } from "../../../PublicHome/components/PublicHeaderDescriptorContext";
import { isNonNullObject, PublicRouteErrorState, PublicRoutePartialNotice, settlePublicRouteRetries } from "../../../PublicHome/components/PublicRouteContentState";
import { usePublicProfileShell } from "../../../PublicHome/api/usePublicProfileShell";
import { usePublicRecommendationCategory } from "../../../PublicHome/api/usePublicRecommendationCategory";
import { PublicScrollContinuation } from "../../../PublicHome/components/PublicScrollContinuation";

const isRenderableProductList = (value: unknown): value is ProductList =>
  isNonNullObject(value) && Array.isArray(value.recommended_products);

const PublicProducts = () => {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const outletContext = useOutletContext<{ isShellRevealed?: boolean; setIsPageLoaded?: (val: boolean) => void } | null>();

  const [modalState, setModalState] = useState<{ open: boolean; product: RecommendedProduct | null }>({
    open: false,
    product: null,
  });

  const { data: accountData, loading: userLoading, error: userError, refetch: refetchUser } = usePublicProfileShell(username);
  const query = usePublicRecommendationCategory(username, "products", accountData?.public_products === "Yes");
  const { data, loading: productsLoading, error: productsError, refetch: refetchProducts } = query;

  const accountDocumentId = typeof accountData?.documentId === "string" ? accountData.documentId : undefined;
  const creatorName = typeof accountData?.Account_Name === "string" ? accountData.Account_Name : username;

  const loading = userLoading || productsLoading;
  const queryError = userError || productsError;
  const rawLists = data?.productLists;
  const lists: ProductList[] = (Array.isArray(rawLists) ? rawLists : [])
    .filter(isRenderableProductList)
    .map((list) => ({
      ...list,
      recommended_products: list.recommended_products.filter(isNonNullObject) as ProductList["recommended_products"],
    }));
  const completeCollection = Array.isArray(rawLists) && rawLists.every(isRenderableProductList);
  const hasUsableData = queryError ? lists.length > 0 : completeCollection;

  useEffect(() => {
    if (!loading || hasUsableData) {
      outletContext?.setIsPageLoaded?.(true);
    }
  }, [hasUsableData, loading, outletContext]);

  const handleRetry = useCallback(async () => {
    await settlePublicRouteRetries(refetchUser, accountDocumentId ? refetchProducts : undefined);
  }, [accountDocumentId, refetchProducts, refetchUser]);

  const analytics = useTrackAnalytics(
    createAnalyticsOptions.products(accountDocumentId || "", username),
  );

  const owningListByProductId = useMemo(() => {
    const ownership = new Map<string, { documentId: string; name: string }>();
    lists.forEach((list) => {
      list.recommended_products?.forEach((product) => {
        ownership.set(product.documentId, {
          documentId: list.documentId,
          name: list.List_Name,
        });
      });
    });
    return ownership;
  }, [lists]);

  const allProducts = useMemo(() => {
    return deduplicateProducts(lists.flatMap((l) => l.recommended_products ?? []));
  }, [lists]);

  const topPicks = useMemo(() => {
    return allProducts
      .filter((p) => p.is_pinned)
      .sort((a, b) => (a.pin_order ?? 999) - (b.pin_order ?? 999));
  }, [allProducts]);

  // const allCategories = useMemo(() => {
  //   return extractUniqueCategories(allProducts.map((p) => p.product_category ? [p.product_category] : []));
  // }, [allProducts]);

  const handleProductClick = useCallback((product: RecommendedProduct) => {
    setModalState({ open: true, product });
    const owningList = owningListByProductId.get(product.documentId);
    analytics.trackClick("product-card", {
      id: product.documentId,
      listId: product.product_list?.documentId || owningList?.documentId,
      listName: product.product_list?.List_Name || owningList?.name,
      title: product.title,
      category: product.product_category?.name,
    });
  }, [analytics, owningListByProductId]);

  usePublicHeaderDescriptor({
    navigationKey: location.key,
    title: `${creatorName}'s Products`,
    url: window.location.href,
    analyticsContext: "products-header",
  });

  const productCount = allProducts.length;
  const listCount = lists.length;
  const pageTitle = `${creatorName} | Favorite Products | explorers`;
  const metaDescription = productCount > 0
    ? `Browse curated product lists and recommendations shared by ${creatorName} on explorers. Explore ${listCount}${query.hasMore || query.error ? '+' : ''} product list${listCount !== 1 ? 's' : ''} containing ${productCount} loaded favorite product${productCount !== 1 ? 's' : ''}.`
    : `Explore product recommendations shared by ${creatorName} on explorers.`;

  const seoKeywords = [
    `${creatorName} products`,
    `${username} products`,
    "explorers products",
    "favorite products list",
    "product recommendations",
    "curated product lists",
    ...lists.map(l => l.List_Name)
  ];

  return (
    <>
      {!loading && accountData && (
        <SEO
          title={pageTitle}
          description={metaDescription}
          keywords={seoKeywords}
          canonical={createCanonicalUrl(`/${username}/products`)}
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
                {/* Hero skeleton — Desktop (lg screens) */}
                <div className="hidden lg:block">
                  <HeroSkeleton accentColor="yellow" showThumbnails />
                </div>
                {/* Hero skeleton — Mobile / Tablet */}
                <div className="lg:hidden">
                  <HeroSkeleton accentColor="yellow" mobile />
                </div>
                {/* Carousel row skeletons */}
                {[1, 2, 3].map((i) => (
                  <section key={i} className="mb-8">
                    {/* Row header */}
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-1.5 h-[22px] bg-[var(--category-skeleton,rgba(255,255,255,0.1))] rounded-sm flex-shrink-0 skeleton-shimmer relative overflow-hidden" />
                      <div className="h-5 w-32 bg-[var(--category-skeleton,rgba(255,255,255,0.08))] rounded skeleton-shimmer relative overflow-hidden" />
                    </div>
                    {/* Poster strip skeleton equivalent for products */}
                    <div className="flex gap-3 overflow-hidden">
                      {[1, 2, 3, 4, 5].map((idx) => (
                        <div key={idx} className="flex-shrink-0 w-32 h-44 rounded-xl bg-[var(--category-skeleton,rgba(255,255,255,0.05))] skeleton-shimmer relative overflow-hidden" />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : null
          ) : queryError && !hasUsableData ? (
            <PublicRouteErrorState title="Products unavailable" error={queryError} onRetry={handleRetry} />
          ) : (
            <>
              {queryError && <PublicRoutePartialNotice message="Some product data is unavailable." />}
              {/* Empty state */}
              {allProducts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-center">
                  <ShoppingBag size={48} className="text-[color:var(--category-muted,rgba(255,255,255,0.2))] mb-4" />
                  <p className="text-[color:var(--category-muted,rgba(255,255,255,0.4))] text-lg font-medium">No products shared yet</p>
                  <p className="text-[color:var(--category-muted,rgba(255,255,255,0.25))] text-sm mt-1">Check back later for recommendations</p>
                </div>
              ) : (
                <>
                  {/* Top Picks Hero (Large Screens) & Carousel (Mobile) */}
                  {topPicks.length > 0 && (
                    <div className="mt-4">
                      <div className="hidden lg:block">
                        <ProductTopPicksHero 
                          products={topPicks} 
                          onProductClick={handleProductClick} 
                        />
                      </div>
                      <div className="block lg:hidden">
                        <ProductTopPicksMobileHero
                          products={topPicks}
                          onProductClick={handleProductClick}
                        />
                      </div>
                    </div>
                  )}

                  {/* Lists as carousel rows */}
                  <div className="mt-4 space-y-8">
                    {lists.map((list) => (
                      <ProductCarouselRow
                        key={list.documentId}
                        list={list}
                        onProductClick={handleProductClick}
                        onViewAll={() => {
                          analytics.trackClick("product-list", {
                            listId: list.documentId,
                            listName: list.List_Name,
                          });
                          navigate(`/${username}/products/${list.slug}`);
                        }}
                      />
                    ))}
                  </div>

                  {/* Category browse - hidden for now as category pages are not registered/implemented
                  {allCategories.length > 0 && (
                    <div className="mt-10">
                      <p className="text-sm font-semibold text-[color:var(--category-muted,rgba(255,255,255,0.6))] mb-3">Browse by Category</p>
                      <div className="flex flex-wrap gap-2">
                        {allCategories.map((cat) => (
                          <button
                            key={cat.slug}
                            onClick={() => navigate(`/${username}/products/category/${cat.slug}`)}
                            className="text-xs text-[color:var(--category-text,rgba(52,211,153,0.8))] bg-emerald-900/20 hover:bg-emerald-900/40 border border-emerald-800/20 px-3 py-1.5 rounded-full transition-all"
                          >
                            {cat.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  */}
                </>
              )}
            </>
          )}
          <PublicScrollContinuation {...query} label="product lists" />
        </div>

        <ProductDetailModal
          open={modalState.open}
          product={modalState.product}
          onClose={() => setModalState({ open: false, product: null })}
        />
      </div>
    </>
  );
};

export default PublicProducts;
