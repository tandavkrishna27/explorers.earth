import { useState, useMemo, useCallback, useEffect } from "react";
import { useParams, useNavigate, useOutletContext } from "react-router-dom";
import { useQuery, gql } from "@apollo/client";
import { ShoppingBag, Share2 } from "lucide-react";
import { PUBLIC_PRODUCT_DATA } from "../../api/query";
import { deduplicateProducts } from "../../utils/productHelpers";
import { toast } from "sonner";
import type { RecommendedProduct, ProductList } from "../../types";
import ProductCarouselRow from "./ProductCarouselRow";
import ProductDetailModal from "./ProductDetailModal";
import SEO from "../../../../components/SEO";
import { createCanonicalUrl } from "../../../../utils/getCurrentDomain";
import ProductTopPicksHero from "./ProductTopPicksHero";
import ProductTopPicksMobileHero from "./ProductTopPicksMobileHero";
import HeroSkeleton from "../../../../components/ui/HeroSkeleton";
import { createAnalyticsOptions, useTrackAnalytics } from "../../../../services/analyticsService";

const ACCOUNT_BY_USERNAME = gql`
  query AccountByUsernameProducts($username: String!) {
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

const PublicProducts = () => {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const outletContext = useOutletContext<{ setIsPageLoaded?: (val: boolean) => void } | null>();

  const [modalState, setModalState] = useState<{ open: boolean; product: RecommendedProduct | null }>({
    open: false,
    product: null,
  });

  const { data: userLookup, loading: userLoading } = useQuery(ACCOUNT_BY_USERNAME, {
    variables: { username },
    skip: !username,
  });

  const accountDocumentId = userLookup?.usersPermissionsUsers?.[0]?.accounts?.[0]?.documentId;
  const creatorName = userLookup?.usersPermissionsUsers?.[0]?.accounts?.[0]?.Account_Name || username;

  const { data, loading: productsLoading } = useQuery(PUBLIC_PRODUCT_DATA, {
    variables: { accountDocumentId },
    skip: !accountDocumentId,
    fetchPolicy: "cache-and-network",
  });

  const loading = userLoading || productsLoading;

  useEffect(() => {
    if (!loading) {
      (window as any).__publicProfileLoaded = true;
      outletContext?.setIsPageLoaded?.(true);
    }
  }, [loading, outletContext]);

  const lists: ProductList[] = data?.productLists ?? [];
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

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title: `${creatorName}'s Products`, url }); } catch { /* ignore */ }
    } else {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied!");
    }
    analytics.trackClick("share-button", { context: "products-header" });
  };

  const productCount = allProducts.length;
  const listCount = lists.length;
  const pageTitle = `${creatorName} | Favorite Products | explorers`;
  const metaDescription = productCount > 0
    ? `Browse curated product lists and recommendations shared by ${creatorName} on explorers. Explore ${listCount} product list${listCount !== 1 ? 's' : ''} containing ${productCount} favorite product${productCount !== 1 ? 's' : ''}.`
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
      {!loading && userLookup && (
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
                      <div className="w-1.5 h-[22px] bg-white/10 rounded-sm flex-shrink-0 skeleton-shimmer relative overflow-hidden" />
                      <div className="h-5 w-32 bg-white/8 rounded skeleton-shimmer relative overflow-hidden" />
                    </div>
                    {/* Poster strip skeleton equivalent for products */}
                    <div className="flex gap-3 overflow-hidden">
                      {[1, 2, 3, 4, 5].map((idx) => (
                        <div key={idx} className="flex-shrink-0 w-32 h-44 rounded-xl bg-white/5 skeleton-shimmer relative overflow-hidden" />
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
                  <ShoppingBag size={48} className="text-white/20 mb-4" />
                  <p className="text-white/40 text-lg font-medium">No products shared yet</p>
                  <p className="text-white/25 text-sm mt-1">Check back later for recommendations</p>
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
                      <p className="text-sm font-semibold text-white/60 mb-3">Browse by Category</p>
                      <div className="flex flex-wrap gap-2">
                        {allCategories.map((cat) => (
                          <button
                            key={cat.slug}
                            onClick={() => navigate(`/${username}/products/category/${cat.slug}`)}
                            className="text-xs text-emerald-400/80 bg-emerald-900/20 hover:bg-emerald-900/40 border border-emerald-800/20 px-3 py-1.5 rounded-full transition-all"
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
